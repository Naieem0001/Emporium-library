import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { google } from "googleapis";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

const PORT = Number(process.env.PORT) || 3000;
const NOTES_MAX_BYTES = 50 * 1024 * 1024;
const BOOK_MAX_BYTES = 400 * 1024 * 1024;
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx"]);
const BOOK_ALLOWED_EXT = new Set([".pdf", ".epub", ".doc", ".docx", ".txt", ".mobi"]);
const BOOK_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/epub+zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/x-mobipocket-ebook"
]);
const IMAGE_ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const IMAGE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

function parseJsonEnv(name) {
  let raw = process.env[name];
  if (!raw) return null;
  raw = String(raw).trim();
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1).trim();
  // Common Render paste mistake: whole JSON wrapped in extra single quotes
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 2) {
    raw = raw.slice(1, -1).trim();
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid JSON in ${name}. Paste the service account file as one line in Render, no wrapping quotes, same keys as the downloaded .json.`
    );
  }
}

function initFirebaseAdmin() {
  const cred = parseJsonEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!cred) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
}

function getDriveAuthClient() {
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim();
  const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();

  // Preferred for personal Google Drive quota: act as the Drive owner via OAuth refresh token.
  if (clientId && clientSecret && refreshToken) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return { auth, mode: "oauth_user" };
  }

  // Backward-compatible fallback: service account auth.
  const cred = parseJsonEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!cred) {
    throw new Error(
      "Missing Drive auth. Set GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN, or GOOGLE_SERVICE_ACCOUNT_JSON."
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials: cred,
    scopes: DRIVE_SCOPES
  });
  return { auth, mode: "service_account" };
}

function getDriveClient() {
  const { auth, mode } = getDriveAuthClient();
  return { drive: google.drive({ version: "v3", auth }), mode };
}

async function verifyIdToken(idToken) {
  if (!idToken) throw new Error("Missing token");
  initFirebaseAdmin();
  return admin.auth().verifyIdToken(idToken);
}

function getAdminEmailAllowlist() {
  return String(process.env.ADMIN_EMAILS || "naieemq111@gmail.com")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function ensureAdminUser(decoded) {
  const email = String(decoded?.email || "").trim().toLowerCase();
  const allowed = getAdminEmailAllowlist();
  if (!email || !allowed.includes(email)) {
    throw new Error("Admin access denied");
  }
}

/** Human-readable message from googleapis Drive errors */
function driveApiDetail(err) {
  const e = err?.response?.data?.error;
  if (!e) return "";
  if (Array.isArray(e.errors) && e.errors.length) {
    return e.errors
      .map(x => (x.message || x.reason || "").trim())
      .filter(Boolean)
      .join("; ");
  }
  return String(e.message || "").trim();
}

function googleServiceAccountEmail() {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return "";
    let s = String(raw).trim();
    if (s.startsWith("'") && s.endsWith("'") && s.length > 2) s = s.slice(1, -1).trim();
    const j = JSON.parse(s);
    return j.client_email || "";
  } catch {
    return "";
  }
}

function driveActorHint(mode) {
  if (mode === "oauth_user") {
    return String(process.env.GOOGLE_DRIVE_UPLOADER_EMAIL || "").trim() || "OAuth Drive user";
  }
  return googleServiceAccountEmail() || "service account";
}

/** Accept raw env: full drive URL, id with ?usp=sharing, stray quotes */
function normalizeDriveFolderId(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^['"]|['"]$/g, "");
  const fromUrl = s.match(/drive\.google\.com\/(?:drive\/u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) s = fromUrl[1];
  const q = s.indexOf("?");
  if (q !== -1) s = s.slice(0, q);
  return s.trim();
}

/**
 * Resolve folder ID: if user pasted a Drive "shortcut" ID, uploads use SA quota and fail.
 * Use the shortcut's target folder instead.
 */
async function resolveDriveParentFolderId(drive, folderId) {
  const meta = await drive.files.get({
    fileId: folderId,
    fields: "id,mimeType,shortcutDetails",
    supportsAllDrives: true
  });
  if (meta.data.mimeType === "application/vnd.google-apps.shortcut") {
    const tid = meta.data.shortcutDetails?.targetId;
    if (!tid) {
      throw new Error(
        "DRIVE_PARENT_FOLDER_ID is a Drive shortcut without a target. Open the real folder in Drive and copy the folder ID from the browser URL."
      );
    }
    return tid;
  }
  return folderId;
}

async function uploadPublicFileToDrive(drive, parentId, file, fallbackName) {
  const safeName =
    path.basename(file?.originalname || fallbackName).replace(/[^\w.\- ()\[\]]+/g, "_") || fallbackName;
  const created = await drive.files.create({
    requestBody: { name: safeName, parents: [parentId] },
    media: {
      body: fs.createReadStream(file.path),
      mimeType: file.mimetype || "application/octet-stream"
    },
    fields: "id",
    supportsAllDrives: true
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Drive upload failed");
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    fields: "id",
    supportsAllDrives: true
  });
  return fileId;
}

const app = express();
app.use(express.json({
  limit: "512kb",
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

function getCashfreeBaseUrl() {
  const { "x-client-secret": secret } = getCashfreeHeaders();
  if (secret && secret.includes("_prod_")) {
    return "https://api.cashfree.com/pg";
  }
  return "https://sandbox.cashfree.com/pg";
}

function getCashfreeHeaders() {
  const envKeys = Object.keys(process.env);
  let rawKeyId = process.env.CASHFREE_APP_ID || process.env.App_KEY_ID || process.env["App-KEY_ID"] || process.env.APP_KEY_ID || process.env["APP-KEY_ID"] || process.env.APP_ID || process.env.CLIENT_ID || "";
  let rawKeySecret = process.env.CASHFREE_SECRET_KEY || process.env.App_KEY_SECRET || process.env["App-KEY_SECRET"] || process.env.APP_KEY_SECRET || process.env["APP-KEY_SECRET"] || process.env.SECRET_KEY || process.env.APP_SECRET || "";
  
  if (!rawKeyId) {
    const found = envKeys.find(k => {
      const n = k.toUpperCase().replace(/[^A-Z]/g, "");
      return n === "APPKEYID" || n === "APPID" || n === "CASHFREEAPPID" || n === "CLIENTID" || n === "CASHFREECLIENTID" || n === "KEYID";
    });
    if (found) rawKeyId = process.env[found];
  }
  if (!rawKeySecret) {
    const found = envKeys.find(k => {
      const n = k.toUpperCase().replace(/[^A-Z]/g, "");
      return n === "APPKEYSECRET" || n === "APPSECRET" || n === "SECRETKEY" || n === "CASHFREESECRETKEY" || n === "CASHFREESECRET" || n === "KEYSECRET";
    });
    if (found) rawKeySecret = process.env[found];
  }

  const keyId = String(rawKeyId).trim();
  const keySecret = String(rawKeySecret).trim();

  if (!keyId || !keySecret) {
    const related = envKeys.filter(k => k.toLowerCase().includes("key") || k.toLowerCase().includes("app") || k.toLowerCase().includes("cash") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("id")).join(", ");
    throw new Error(`Cashfree keys not configured. Available related keys in Render: [${related || "none"}]. Please check your Environment Variables tab.`);
  }

  return {
    "x-client-id": keyId,
    "x-client-secret": keySecret,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
}

async function sendBookEmail(email, title, link) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set. Could not send email to", email);
    return;
  }

  // Use EMAIL_FROM or fallback to EMAIL_USER or Resend's default onboarding email
  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || "onboarding@resend.dev";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `"Emporium Library" <${fromEmail}>`,
      to: [email],
      subject: `Your book: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1B2A41;">
          <h2 style="color: #FF7A18;">Thank you for your purchase!</h2>
          <p>Here is the download link for your book <strong>${title}</strong>:</p>
          <p><a href="${link}" style="display:inline-block; padding: 12px 24px; background-color: #FF7A18; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Download Book</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${link}">${link}</a></p>
          <br/>
          <p>Happy reading!</p>
          <p><em>- Emporium Library</em></p>
        </div>
      `
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || "Failed to send email via Resend");
  }
}

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "emporium-academic-api" });
});

const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const EXTERNAL_TIMEOUT_MS = 12000;

const EXTERNAL_GENRE_QUERY_MAP = {
  fiction: "fiction",
  literature: "classic literature",
  "horror-thriller": "horror thriller",
  religion: "religion islam",
  spirituality: "spirituality",
  "science-fiction": "science fiction",
  "rom-com": "romantic comedy",
  "non-fiction": "non fiction",
  academic: "academic textbook",
  all: "books"
};

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeExternalGenre(value) {
  const v = normalizeLooseText(value).replace(/\s+/g, "-");
  const alias = {
    "sci-fi": "science-fiction",
    scifi: "science-fiction",
    romance: "rom-com",
    "horror-&-thriller": "horror-thriller"
  };
  return alias[v] || v;
}

function getGenreQuery(genreName) {
  const k = normalizeExternalGenre(genreName);
  return EXTERNAL_GENRE_QUERY_MAP[k] || String(genreName || "").trim() || "books";
}

function normalizeAuthorList(authors) {
  if (Array.isArray(authors)) return authors.map(x => String(x || "").trim()).filter(Boolean).join(", ");
  return String(authors || "").trim();
}

function withTimeout(ms, promiseFactory) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve([]), ms);
    promiseFactory()
      .then(data => {
        clearTimeout(t);
        resolve(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        clearTimeout(t);
        resolve([]);
      });
  });
}

function dedupeExternalBooks(items) {
  const out = [];
  const seen = new Set();
  for (const x of items) {
    const isbn = String(x?.isbn || "").trim().toLowerCase();
    const titleAuthor = `${normalizeLooseText(x?.title)}|${normalizeLooseText(x?.author)}`;
    const key = isbn ? `isbn:${isbn}` : `ta:${titleAuthor}`;
    if (!titleAuthor || seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

async function fetchGoogleBooks(query) {
  if (!GOOGLE_BOOKS_API_KEY) return [];
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&key=${encodeURIComponent(GOOGLE_BOOKS_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books failed (${res.status})`);
  const data = await res.json();
  return (Array.isArray(data.items) ? data.items : []).map((item) => {
    const vi = item.volumeInfo || {};
    const access = item.accessInfo || {};
    const isbn13 = Array.isArray(vi.industryIdentifiers)
      ? (vi.industryIdentifiers.find(x => String(x?.type).toUpperCase() === "ISBN_13")
          || vi.industryIdentifiers.find(x => String(x?.type).toUpperCase() === "ISBN_10")
          || {}).identifier
      : "";
    const pdfAvailable = access.pdf?.isAvailable === true;
    const epubAvailable = access.epub?.isAvailable === true;
    const isPublicDomain = access.publicDomain === true;
    const pdfLink = pdfAvailable ? String(access.pdf?.downloadLink || "").trim() : "";
    const epubLink = epubAvailable ? String(access.epub?.downloadLink || "").trim() : "";
    const direct = epubLink || pdfLink;
    const isDownloadable = (isPublicDomain || pdfAvailable || epubAvailable) && !!direct;
    return {
      id: `google_${item.id || crypto.randomUUID()}`,
      title: String(vi.title || "").trim(),
      author: normalizeAuthorList(vi.authors) || "Unknown",
      genre: String(Array.isArray(vi.categories) ? vi.categories[0] || "" : "").trim(),
      cover: String(vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || "").trim(),
      driveLink: String(direct || "").trim(),
      price: 0,
      source: "google",
      sourceLabel: "Google Books",
      externalType: "free",
      externalUrl: String(direct || "").trim(),
      isbn: String(isbn13 || "").trim()
    };
  }).filter(x => x.title && x.driveLink && x.externalUrl && x.externalType === "free");
}

async function fetchOpenLibrary(query) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=24`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "EmporiumLibrary/1.0 (https://emporiumlibrary.me)"
    }
  });
  if (!res.ok) throw new Error(`Open Library failed (${res.status})`);
  const data = await res.json();
  return (Array.isArray(data.docs) ? data.docs : []).map((doc) => {
    const ebookAccess = String(doc.ebook_access || "").trim().toLowerCase();
    const ia = Array.isArray(doc.ia) && doc.ia.length ? String(doc.ia[0] || "").trim() : "";
    const epubLink = ia ? `https://archive.org/download/${encodeURIComponent(ia)}/${encodeURIComponent(ia)}.epub` : "";
    const pdfLink = ia ? `https://archive.org/download/${encodeURIComponent(ia)}/${encodeURIComponent(ia)}.pdf` : "";
    const txtLink = ia ? `https://archive.org/download/${encodeURIComponent(ia)}/${encodeURIComponent(ia)}.txt` : "";
    const downloadLink = epubLink || pdfLink || txtLink;
    const isbn = Array.isArray(doc.isbn) ? String(doc.isbn[0] || "").trim() : "";
    const coverId = doc.cover_i;
    return {
      id: `openlib_${doc.cover_edition_key || doc.edition_key?.[0] || doc.key || crypto.randomUUID()}`,
      title: String(doc.title || "").trim(),
      author: normalizeAuthorList(doc.author_name) || "Unknown",
      genre: normalizeAuthorList(doc.subject?.slice(0, 1) || []),
      cover: coverId ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg` : "",
      driveLink: downloadLink,
      price: 0,
      source: "openlibrary",
      sourceLabel: "Open Library",
      externalType: "free",
      externalUrl: downloadLink,
      isbn,
      ebookAccess
    };
  }).filter(x => x.title && x.driveLink && x.ebookAccess === "public");
}

async function fetchGutendex(query) {
  const url = `https://gutendex.com/books?search=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gutendex failed (${res.status})`);
  const data = await res.json();
  return (Array.isArray(data.results) ? data.results : []).map((book) => {
    const formats = book.formats || {};
    const epub = String(formats["application/epub+zip"] || "").trim();
    const pdf = String(formats["application/pdf"] || "").trim();
    const text = String(formats["text/plain; charset=utf-8"] || formats["text/plain"] || "").trim();
    const link = epub || pdf || text;
    const author = Array.isArray(book.authors) && book.authors.length
      ? normalizeAuthorList(book.authors.map(a => a?.name))
      : "Unknown";
    return {
      id: `gutendex_${book.id || crypto.randomUUID()}`,
      title: String(book.title || "").trim(),
      author,
      genre: "",
      cover: String(formats["image/jpeg"] || "").trim(),
      driveLink: String(link || "").trim(),
      price: 0,
      source: "gutenberg",
      sourceLabel: "Gutenberg",
      externalType: "free",
      externalUrl: String(link || "").trim(),
      isbn: ""
    };
  }).filter(x => x.title && x.driveLink && x.externalUrl);
}

async function aggregateExternalBooks(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const [googleRows, openRows, gutenRows] = await Promise.all([
    withTimeout(EXTERNAL_TIMEOUT_MS, () => fetchGoogleBooks(q)),
    withTimeout(EXTERNAL_TIMEOUT_MS, () => fetchOpenLibrary(q)),
    withTimeout(EXTERNAL_TIMEOUT_MS, () => fetchGutendex(q))
  ]);
  return dedupeExternalBooks([...googleRows, ...openRows, ...gutenRows]).slice(0, 60);
}

app.get("/api/external/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ ok: true, query: q, books: [] });
    const books = await aggregateExternalBooks(q);
    return res.json({ ok: true, query: q, books });
  } catch (err) {
    console.error("External search failed:", err);
    return res.status(500).json({ ok: false, error: "External search failed", books: [] });
  }
});

app.get("/api/external/genre", async (req, res) => {
  try {
    const genre = String(req.query.genre || "").trim();
    const mappedQuery = getGenreQuery(genre);
    const books = await aggregateExternalBooks(mappedQuery);
    return res.json({ ok: true, genre, query: mappedQuery, books });
  } catch (err) {
    console.error("External genre failed:", err);
    return res.status(500).json({ ok: false, error: "External genre failed", books: [] });
  }
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: NOTES_MAX_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error("Invalid file type"));
    }
    if (!file.mimetype || file.mimetype === "application/octet-stream") {
      return cb(null, true);
    }
    if (ALLOWED_MIME.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Invalid file type"));
  }
});

const uploadBook = multer({
  dest: os.tmpdir(),
  limits: { fileSize: BOOK_MAX_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (file.fieldname === "coverFile") {
      if (!IMAGE_ALLOWED_EXT.has(ext)) return cb(new Error("Invalid cover image type"));
      if (!file.mimetype || file.mimetype === "application/octet-stream") return cb(null, true);
      if (IMAGE_ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
      return cb(new Error("Invalid cover image type"));
    }
    if (!BOOK_ALLOWED_EXT.has(ext)) return cb(new Error("Invalid book file type"));
    if (!file.mimetype || file.mimetype === "application/octet-stream") return cb(null, true);
    if (BOOK_ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    return cb(new Error("Invalid book file type"));
  }
});



function generateAccessCode(len = 8) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120;
}

async function requireAdminFromReq(req) {
  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = m ? m[1].trim() : "";
  const decoded = await verifyIdToken(idToken);
  ensureAdminUser(decoded);
  return decoded;
}

app.post("/upload", upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;
  let driveMode = "service_account";
  const cleanup = () => {
    if (tmpPath) {
      fs.unlink(tmpPath, () => {});
    }
  };

  try {
    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = m ? m[1].trim() : "";
    const decoded = await verifyIdToken(idToken);

    const title = String(req.body.title || "").trim();
    const subject = String(req.body.subject || "").trim();
    const description = String(req.body.description || "").trim();
    const uploaderName = String(req.body.uploaderName || "").trim();
    const allowedRt = new Set(["notes", "textbooks", "papers", "assignments"]);
    let resourceType = String(req.body.resourceType || "notes").toLowerCase().trim();
    if (!allowedRt.has(resourceType)) resourceType = "notes";

    if (!title || title.length > 200) {
      return res.status(400).json({ error: "Invalid title" });
    }
    if (!subject || subject.length > 120) {
      return res.status(400).json({ error: "Invalid subject" });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: "Description too long" });
    }
    if (!uploaderName || uploaderName.length > 120) {
      return res.status(400).json({ error: "Invalid uploader name" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const folderId = normalizeDriveFolderId(process.env.DRIVE_PARENT_FOLDER_ID);
    if (!folderId) {
      return res.status(500).json({ error: "Server missing DRIVE_PARENT_FOLDER_ID" });
    }

    const bundle = getDriveClient();
    const drive = bundle.drive;
    driveMode = bundle.mode;
    let parentId = folderId;
    try {
      parentId = await resolveDriveParentFolderId(drive, folderId);
    } catch (e) {
      const detail = driveApiDetail(e) || e.message || "Cannot read folder";
      return res.status(400).json({
        error: `Drive parent folder: ${detail}. Share the folder with your service account (Editor) and use the folder id from drive.google.com/drive/folders/…`
      });
    }

    const safeName =
      path.basename(req.file.originalname || "upload").replace(/[^\w.\- ()\[\]]+/g, "_") ||
      "upload";

    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [parentId]
      },
      media: {
        body: fs.createReadStream(tmpPath),
        mimeType: req.file.mimetype || "application/octet-stream"
      },
      fields: "id, name, mimeType",
      supportsAllDrives: true
    });

    const fileId = created.data.id;
    if (!fileId) {
      return res.status(500).json({ error: "Drive upload failed" });
    }

    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
      fields: "id",
      supportsAllDrives: true
    });

    const driveLink = `https://drive.google.com/file/d/${fileId}/view`;

    initFirebaseAdmin();
    const db = admin.firestore();
    const uid = decoded.uid;
    const email = decoded.email || "";

    const noteRef = db.collection("academic_notes").doc();
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async t => {
      const userSnap = await t.get(userRef);
      const pointsEarned = 5;
      const prev = userSnap.exists ? userSnap.data() : {};
      if (!userSnap.exists) {
        t.set(userRef, {
          uid,
          email,
          name: uploaderName,
          totalPoints: pointsEarned,
          uploadCount: 1
        });
      } else {
        t.update(userRef, {
          name: uploaderName,
          email: email || prev.email || "",
          totalPoints: admin.firestore.FieldValue.increment(pointsEarned),
          uploadCount: admin.firestore.FieldValue.increment(1)
        });
      }

      t.set(noteRef, {
        title,
        subject,
        resourceType,
        description: description || "",
        uploaderName,
        uploaderUid: uid,
        driveLink,
        driveFileId: fileId,
        uploadDate: admin.firestore.FieldValue.serverTimestamp(),
        points: pointsEarned,
        downloads: 0
      });
    });

    cleanup();
    return res.json({
      ok: true,
      id: noteRef.id,
      driveLink,
      driveFileId: fileId
    });
  } catch (err) {
    console.error(err);
    cleanup();
    let msg = driveApiDetail(err) || (err && err.message) || "Upload failed";
    if (/storageQuota|does not have storage quota|storage quota/i.test(msg)) {
      if (driveMode === "oauth_user") {
        msg +=
          " The OAuth account may be out of storage, or lacks access to the target folder. Check the owner Drive quota and folder permissions.";
      } else {
        const sa = googleServiceAccountEmail();
        msg +=
          sa
            ? ` Service-account uploads can hit quota limits. Recommended fix: configure GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN so uploads use your own Drive quota. Current service account: ${sa}`
            : " Configure OAuth Drive env vars (GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN) to use a real account quota.";
      }
    }
    const code = /Missing token|Invalid token|auth/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.delete("/notes/:id", async (req, res) => {
  try {
    const noteId = String(req.params.id || "").trim();
    if (!noteId) return res.status(400).json({ error: "Missing note id" });

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = m ? m[1].trim() : "";
    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;

    initFirebaseAdmin();
    const db = admin.firestore();
    const noteRef = db.collection("academic_notes").doc(noteId);
    const snap = await noteRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Note not found" });

    const note = snap.data() || {};
    if (String(note.uploaderUid || "") !== String(uid)) {
      return res.status(403).json({ error: "You can delete only your own notes" });
    }

    const driveFileId = String(note.driveFileId || "").trim();
    if (driveFileId) {
      try {
        const bundle = getDriveClient();
        await bundle.drive.files.delete({
          fileId: driveFileId,
          supportsAllDrives: true
        });
      } catch (err) {
        // Keep note cleanup resilient even if Drive file is already gone.
        console.warn("Drive delete skipped:", driveApiDetail(err) || err?.message || err);
      }
    }

    const userRef = db.collection("users").doc(uid);
    const earned = Math.max(1, Number(note.points) || 5);
    await db.runTransaction(async t => {
      // Firestore transactions require all reads to run before any writes.
      const userSnap = await t.get(userRef);
      t.delete(noteRef);
      if (userSnap.exists) {
        t.update(userRef, {
          uploadCount: admin.firestore.FieldValue.increment(-1),
          totalPoints: admin.firestore.FieldValue.increment(-earned)
        });
      }
    });

    return res.json({ ok: true, deleted: noteId });
  } catch (err) {
    console.error(err);
    const msg = err && err.message ? err.message : "Delete failed";
    const code = /Missing token|Invalid token|auth/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.patch("/notes/:id", async (req, res) => {
  try {
    const noteId = String(req.params.id || "").trim();
    if (!noteId) return res.status(400).json({ error: "Missing note id" });

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = m ? m[1].trim() : "";
    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    if (!title || title.length > 200) {
      return res.status(400).json({ error: "Invalid title" });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: "Description too long" });
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    const noteRef = db.collection("academic_notes").doc(noteId);
    const snap = await noteRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Note not found" });

    const note = snap.data() || {};
    if (String(note.uploaderUid || "") !== String(uid)) {
      return res.status(403).json({ error: "You can edit only your own notes" });
    }

    await noteRef.update({
      title,
      description
    });

    return res.json({ ok: true, id: noteId });
  } catch (err) {
    console.error(err);
    const msg = err && err.message ? err.message : "Update failed";
    const code = /Missing token|Invalid token|auth/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.post(
  "/admin/upload-book",
  uploadBook.fields([
    { name: "file", maxCount: 1 },
    { name: "coverFile", maxCount: 1 }
  ]),
  async (req, res) => {
  const file = req.files?.file?.[0];
  const coverFile = req.files?.coverFile?.[0];
  const tmpPath = file?.path;
  const coverTmpPath = coverFile?.path;
  const cleanup = () => {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    if (coverTmpPath) fs.unlink(coverTmpPath, () => {});
  };
  try {
    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = m ? m[1].trim() : "";
    const decoded = await verifyIdToken(idToken);
    ensureAdminUser(decoded);

    const title = String(req.body.title || "").trim();
    const author = String(req.body.author || "").trim();
    const genre = String(req.body.genre || "").trim();
    const cover = String(req.body.cover || "").trim();
    const driveLinkInput = String(req.body.driveLink || "").trim();
    const trending = String(req.body.trending || "").toLowerCase() === "true";
    const newRelease = String(req.body.newRelease || "").toLowerCase() === "true";
    const priceRaw = Number(req.body.price);
    const price = Number.isFinite(priceRaw) ? Math.max(0, Math.min(100000, Math.round(priceRaw))) : 0;
    if (!title || title.length > 200) return res.status(400).json({ error: "Invalid title" });
    if (!author || author.length > 120) return res.status(400).json({ error: "Invalid author" });
    if (!genre || genre.length > 80) return res.status(400).json({ error: "Invalid genre" });
    if (!file && !/^https?:\/\//i.test(driveLinkInput)) {
      return res.status(400).json({ error: "Provide a book file or a valid Google Drive link" });
    }
    if (!coverFile && !/^https?:\/\//i.test(cover)) {
      return res.status(400).json({ error: "Provide a cover image file or valid image URL" });
    }

    const folderId = normalizeDriveFolderId(process.env.DRIVE_PARENT_FOLDER_ID);
    if (!folderId) return res.status(500).json({ error: "Server missing DRIVE_PARENT_FOLDER_ID" });
    const bundle = getDriveClient();
    const drive = bundle.drive;
    let parentId = folderId;
    try {
      parentId = await resolveDriveParentFolderId(drive, folderId);
    } catch (e) {
      const detail = driveApiDetail(e) || e.message || "Cannot read folder";
      return res.status(400).json({ error: `Drive parent folder: ${detail}` });
    }

    let driveLink = driveLinkInput;
    if (file) {
      const fileId = await uploadPublicFileToDrive(drive, parentId, file, "book");
      driveLink = `https://drive.google.com/file/d/${fileId}/view`;
    }

    let finalCover = cover;
    if (coverFile) {
      const coverId = await uploadPublicFileToDrive(drive, parentId, coverFile, "cover");
      finalCover = `https://drive.google.com/thumbnail?id=${coverId}&sz=w1000`;
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    const publicDriveLink = price > 0 ? "" : driveLink;
    const docRef = await db.collection("books").add({
      title,
      author,
      genre,
      cover: finalCover,
      driveLink: publicDriveLink,
      trending,
      newRelease,
      price,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (price > 0 && driveLink) {
      await db.collection("paid_book_assets").doc(docRef.id).set({
        driveLink,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    cleanup();
    return res.json({ ok: true, id: docRef.id, driveLink: publicDriveLink, price });
  } catch (err) {
    console.error(err);
    cleanup();
    const msg = err && err.message ? err.message : "Book upload failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

// =====================================================================
// PAID NEW RELEASES: payment config, orders, admin approve/reject, unlock
// =====================================================================

async function resolvePaidBookDriveLink(db, bookId) {
  const id = String(bookId || "").trim();
  if (!id) return "";
  const assetSnap = await db.collection("paid_book_assets").doc(id).get();
  if (assetSnap.exists) {
    const link = String(assetSnap.data()?.driveLink || "").trim();
    if (link) return link;
  }
  const bookSnap = await db.collection("books").doc(id).get();
  if (!bookSnap.exists) return "";
  return String(bookSnap.data()?.driveLink || "").trim();
}



// Admin: move a book between free/paid — handles driveLink relocation.
app.post("/admin/books/:id/set-pricing", async (req, res) => {
  try {
    await requireAdminFromReq(req);
    const id = String(req.params.id || "").trim();
    const priceRaw = Number(req.body.price);
    const price = Number.isFinite(priceRaw) ? Math.max(0, Math.min(100000, Math.round(priceRaw))) : 0;
    const trending = typeof req.body.trending === "boolean" ? req.body.trending : null;
    const newRelease = typeof req.body.newRelease === "boolean" ? req.body.newRelease : null;
    if (!id) return res.status(400).json({ error: "Missing book id" });

    initFirebaseAdmin();
    const db = admin.firestore();
    const bookRef = db.collection("books").doc(id);
    const assetRef = db.collection("paid_book_assets").doc(id);
    const [bookSnap, assetSnap] = await Promise.all([bookRef.get(), assetRef.get()]);
    if (!bookSnap.exists) return res.status(404).json({ error: "Book not found" });
    const book = bookSnap.data() || {};
    const currentPublicLink = String(book.driveLink || "");
    const currentPrivateLink = assetSnap.exists ? String(assetSnap.data()?.driveLink || "") : "";
    const existingLink = currentPublicLink || currentPrivateLink;

    const update = { price };
    if (trending !== null) update.trending = !!trending;
    if (newRelease !== null) update.newRelease = !!newRelease;

    if (price > 0) {
      if (existingLink) {
        await assetRef.set({
          driveLink: existingLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      update.driveLink = "";
    } else {
      update.driveLink = existingLink || "";
      if (assetSnap.exists) await assetRef.delete();
    }

    await bookRef.update(update);
    return res.json({ ok: true, price });
  } catch (err) {
    console.error(err);
    const msg = err?.message || "Update failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});



// Public: unlock a paid drive link with email + access code.
app.post("/api/unlock", async (req, res) => {
  try {
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    const accessCode = String(req.body.accessCode || "").trim().toUpperCase();

    if (!isValidEmail(emailRaw)) return res.status(400).json({ error: "Invalid email" });
    if (!accessCode || accessCode.length < 4 || accessCode.length > 20) {
      return res.status(400).json({ error: "Invalid access code" });
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    const snap = await db.collection("orders")
      .where("accessCode", "==", accessCode).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: "Access code not found" });
    const doc = snap.docs[0];
    const order = doc.data() || {};
    if (String(order.buyerEmail || "").toLowerCase() !== emailRaw) {
      return res.status(403).json({ error: "Email does not match this code" });
    }
    if (order.status === "rejected") {
      return res.status(403).json({ error: `Payment was rejected. ${order.rejectedReason || ""}`.trim() });
    }
    if (order.status !== "approved") {
      return res.status(403).json({ error: "Payment is still pending. Please wait for verification (usually within a few hours)." });
    }

    const bookId = String(order.bookId || "");
    let driveLink = await resolvePaidBookDriveLink(db, bookId);
    if (!driveLink) driveLink = String(order.bookDriveLinkSnapshot || "");
    if (!driveLink) return res.status(500).json({ error: "Book file is missing. Please contact support." });

    await doc.ref.update({
      lastUnlockAt: admin.firestore.FieldValue.serverTimestamp(),
      unlockCount: admin.firestore.FieldValue.increment(1)
    });

    return res.json({ ok: true, driveLink, bookTitle: order.bookTitle || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Unlock failed" });
  }
});

// Public: list a buyer's past orders by email (metadata only — no drive links).
app.get("/api/purchases", async (req, res) => {
  try {
    const emailRaw = String(req.query.email || "").trim().toLowerCase();
    if (!isValidEmail(emailRaw)) return res.status(400).json({ error: "Invalid email" });
    initFirebaseAdmin();
    const db = admin.firestore();
    const snap = await db.collection("orders")
      .where("buyerEmail", "==", emailRaw)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const rows = snap.docs.map(d => {
      const x = d.data() || {};
      // SECURITY: do NOT return the full accessCode here. Email alone must
      // not be enough to unlock a download — unlock requires email + code.
      // The full code is only shown at checkout (saved to localStorage) and
      // to admins. We return the last 4 chars as a visual hint so buyers can
      // match a stored code to the right order.
      const code = String(x.accessCode || "");
      return {
        id: d.id,
        bookId: x.bookId || "",
        bookTitle: x.bookTitle || "",
        bookCover: x.bookCover || "",
        bookPrice: x.bookPrice || 0,
        method: x.method || "",
        status: x.status || "pending",
        accessCodeHint: code ? "****" + code.slice(-4) : "",
        createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : null,
        approvedAt: x.approvedAt?.toMillis ? x.approvedAt.toMillis() : null,
        rejectedReason: x.rejectedReason || ""
      };
    });
    return res.json({ ok: true, orders: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Lookup failed" });
  }
});

// Admin: list recent orders (optionally filtered by status).
app.get("/admin/orders", async (req, res) => {
  try {
    await requireAdminFromReq(req);
    initFirebaseAdmin();
    const db = admin.firestore();
    const status = String(req.query.status || "").toLowerCase().trim();
    let q = db.collection("orders").orderBy("createdAt", "desc").limit(300);
    if (["pending", "approved", "rejected"].includes(status)) {
      q = db.collection("orders")
        .where("status", "==", status)
        .orderBy("createdAt", "desc")
        .limit(300);
    }
    const snap = await q.get();
    const rows = snap.docs.map(d => {
      const x = d.data() || {};
      return {
        id: d.id,
        bookId: x.bookId || "",
        bookTitle: x.bookTitle || "",
        bookCover: x.bookCover || "",
        bookPrice: x.bookPrice || 0,
        buyerEmail: x.buyerEmail || "",
        buyerPhone: x.buyerPhone || "",
        method: x.method || "",
        utr: x.utr || "",
        screenshotUrl: x.screenshotUrl || "",
        status: x.status || "pending",
        accessCode: x.accessCode || "",
        createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : null,
        approvedAt: x.approvedAt?.toMillis ? x.approvedAt.toMillis() : null,
        rejectedReason: x.rejectedReason || "",
        unlockCount: x.unlockCount || 0
      };
    });
    return res.json({ ok: true, orders: rows });
  } catch (err) {
    console.error(err);
    const msg = err?.message || "Fetch failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});



// Temporary debug endpoint to verify Render environment variables
app.get("/api/debug/env", (req, res) => {
  return res.json({ keys: Object.keys(process.env) });
});

// =====================================================================
// CASHFREE PAYMENT GATEWAY — create order, verify, webhook
// =====================================================================

// Public: create a Cashfree order when buyer clicks "Pay Now"
app.post("/api/cashfree/create-order", async (req, res) => {
  try {
    const bookId = String(req.body.bookId || "").trim();
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "9999999999").trim(); // Default phone since CF requires it sometimes
    
    if (!bookId || bookId.length > 200) return res.status(400).json({ error: "Invalid bookId" });
    if (!isValidEmail(emailRaw)) return res.status(400).json({ error: "Invalid email" });

    initFirebaseAdmin();
    const db = admin.firestore();
    const bookSnap = await db.collection("books").doc(bookId).get();
    if (!bookSnap.exists) return res.status(404).json({ error: "Book not found" });
    const bookData = bookSnap.data() || {};
    const price = Number(bookData.price) || 0;
    if (price <= 0) return res.status(400).json({ error: "This book is free — no purchase needed" });

    const snapshotDriveLink = await resolvePaidBookDriveLink(db, bookId);
    if (!snapshotDriveLink) {
      return res.status(400).json({
        error: "This book is not yet configured for download. Please contact support."
      });
    }

    const orderId = `book_${bookId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payload = {
      order_id: orderId,
      order_amount: price,
      order_currency: "INR",
      customer_details: {
        customer_id: emailRaw.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50) || "guest",
        customer_email: emailRaw,
        customer_phone: phone
      },
      order_meta: {
        payment_methods: ""
      },
      order_tags: {
        bookId,
        buyerEmail: emailRaw,
        bookTitle: String(bookData.title || "").slice(0, 100)
      }
    };

    const cfUrl = getCashfreeBaseUrl() + "/orders";
    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: getCashfreeHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await cfRes.json();
    if (!cfRes.ok) {
      console.error("[cashfree] create-order response error:", data);
      throw new Error(data.message || "Failed to create Cashfree order");
    }

    return res.json({
      ok: true,
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      amount: data.order_amount,
      currency: data.order_currency,
      environment: getCashfreeBaseUrl().includes("sandbox") ? "sandbox" : "production",
      bookTitle: bookData.title || "",
      bookCover: bookData.cover || ""
    });
  } catch (err) {
    console.error("[cashfree] create-order error:", err);
    return res.status(500).json({ error: err?.message || "Could not create payment order" });
  }
});

// Public: verify Cashfree payment & email the book
app.post("/api/cashfree/verify", async (req, res) => {
  try {
    const { order_id, bookId, email } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: "Missing order_id" });
    }
    if (!bookId || !isValidEmail(String(email || "").trim().toLowerCase())) {
      return res.status(400).json({ error: "Invalid bookId or email" });
    }

    const emailRaw = String(email || "").trim().toLowerCase();
    initFirebaseAdmin();
    const db = admin.firestore();

    // Check for duplicate payment (same order_id)
    const dupSnap = await db.collection("orders")
      .where("cashfreeOrderId", "==", order_id)
      .limit(1).get();
    if (!dupSnap.empty) {
      const existingDoc = dupSnap.docs[0];
      const existingOrder = existingDoc.data();

      if (existingOrder.emailSent === false) {
        try {
          const bookSnap = await db.collection("books").doc(bookId).get();
          const bookData = bookSnap.exists ? bookSnap.data() : {};
          const snapshotDriveLink = existingOrder.bookDriveLinkSnapshot || await resolvePaidBookDriveLink(db, bookId);
          
          await sendBookEmail(
            existingOrder.buyerEmail || emailRaw, 
            existingOrder.bookTitle || bookData.title, 
            snapshotDriveLink
          );
          await existingDoc.ref.update({ emailSent: true });
        } catch (emailErr) {
          console.error("[cashfree] duplicate retry email failed:", emailErr);
        }
      }

      return res.json({
        ok: true,
        orderId: existingDoc.id,
        duplicate: true
      });
    }

    // Verify order from Cashfree
    const cfUrl = getCashfreeBaseUrl() + `/orders/${order_id}/payments`;
    const cfRes = await fetch(cfUrl, {
      headers: getCashfreeHeaders()
    });
    const payments = await cfRes.json();
    
    if (!cfRes.ok) {
      throw new Error(payments.message || "Failed to fetch payments");
    }
    
    const successfulPayment = Array.isArray(payments) && payments.find(p => p.payment_status === "SUCCESS");
    if (!successfulPayment) {
      return res.status(400).json({ error: "Payment not successful or pending verification" });
    }

    const bookSnap = await db.collection("books").doc(bookId).get();
    const bookData = bookSnap.exists ? bookSnap.data() : {};
    const price = Number(bookData.price) || 0;
    const snapshotDriveLink = await resolvePaidBookDriveLink(db, bookId);

    // Send the email with the book link directly
    let emailSent = true;
    try {
      await sendBookEmail(emailRaw, bookData.title, snapshotDriveLink);
    } catch (emailErr) {
      console.error("[cashfree] verify email failed:", emailErr);
      emailSent = false;
    }

    const orderRef = await db.collection("orders").add({
      bookId,
      bookTitle: String(bookData.title || ""),
      bookCover: String(bookData.cover || ""),
      bookPrice: price,
      buyerEmail: emailRaw,
      method: "cashfree",
      cashfreeOrderId: order_id,
      cashfreePaymentId: String(successfulPayment.cf_payment_id || ""),
      status: "approved",
      bookDriveLinkSnapshot: snapshotDriveLink,
      emailSent,
      resendCount: 0,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, orderId: orderRef.id, emailSent });
  } catch (err) {
    console.error("[cashfree] verify error:", err);
    return res.status(500).json({ error: err?.message || "Verification failed" });
  }
});

// Public: resend book email
app.post("/api/resend-book-email", async (req, res) => {
  try {
    const { order_id, email } = req.body;
    if (!order_id || !email) {
      return res.status(400).json({ error: "Missing order_id or email" });
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    const orderSnap = await db.collection("orders").where("cashfreeOrderId", "==", order_id).limit(1).get();
    
    if (orderSnap.empty) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const orderDoc = orderSnap.docs[0];
    const orderData = orderDoc.data();

    if (String(orderData.buyerEmail).toLowerCase() !== String(email).toLowerCase()) {
      return res.status(400).json({ error: "Email mismatch" });
    }

    const resendCount = orderData.resendCount || 0;
    if (resendCount >= 3) {
      return res.status(400).json({ error: "Maximum resend limit reached" });
    }

    await sendBookEmail(orderData.buyerEmail, orderData.bookTitle, orderData.bookDriveLinkSnapshot);

    await orderDoc.ref.update({
      emailSent: true,
      resendCount: admin.firestore.FieldValue.increment(1)
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[resend-email] error:", err);
    return res.status(500).json({ error: err?.message || "Failed to resend email" });
  }
});

// Webhook from Cashfree
app.post("/api/cashfree/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-webhook-signature"];
      const timestamp = req.headers["x-webhook-timestamp"];
      const bodyStr = req.rawBody ? req.rawBody.toString() : req.body.toString();
      
      const envKeys = Object.keys(process.env);
      let rawKeySecret = process.env.CASHFREE_SECRET_KEY || process.env.App_KEY_SECRET || process.env["App-KEY_SECRET"] || process.env.APP_KEY_SECRET || process.env["APP-KEY_SECRET"] || "";
      if (!rawKeySecret) {
        const found = envKeys.find(k => k.toUpperCase().replace(/[^A-Z]/g, "") === "APPKEYSECRET");
        if (found) rawKeySecret = process.env[found];
      }
      const keySecret = String(rawKeySecret).trim();
      
      if (keySecret && signature && timestamp) {
        const expectedSig = crypto
          .createHmac("sha256", keySecret)
          .update(timestamp + bodyStr)
          .digest("base64");
        
        if (signature !== expectedSig) {
          return res.status(400).json({ error: "Invalid webhook signature" });
        }
      }
      
      const event = JSON.parse(bodyStr);
      if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
        const data = event.data || {};
        const order_id = data.order?.order_id;
        const tags = data.order?.order_tags || {};
        const bookId = tags.bookId;
        const buyerEmail = tags.buyerEmail;

        if (order_id && bookId && buyerEmail) {
          try {
            initFirebaseAdmin();
            const db = admin.firestore();
            const dupSnap = await db.collection("orders")
              .where("cashfreeOrderId", "==", order_id).limit(1).get();
            if (dupSnap.empty) {
              const bookSnap = await db.collection("books").doc(bookId).get();
              const bookData = bookSnap.exists ? bookSnap.data() : {};
              const snapshotDriveLink = await resolvePaidBookDriveLink(db, bookId);
              
              // Email the user
              await sendBookEmail(buyerEmail, bookData.title, snapshotDriveLink);

              await db.collection("orders").add({
                bookId,
                bookTitle: String(bookData.title || ""),
                bookCover: String(bookData.cover || ""),
                bookPrice: Number(bookData.price) || 0,
                buyerEmail,
                method: "cashfree",
                cashfreeOrderId: order_id,
                cashfreePaymentId: String(data.payment?.cf_payment_id || ""),
                status: "approved",
                bookDriveLinkSnapshot: snapshotDriveLink,
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log(`[webhook] fallback order created for ${order_id}`);
            }
          } catch (fbErr) {
            console.error("[webhook] fallback order error:", fbErr);
          }
        }
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("[webhook] error:", err);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      if (_req.path === "/upload") {
        return res.status(400).json({ error: "File too large (max 50MB)" });
      }
      if (_req.path === "/admin/payment-config") {
        return res.status(400).json({ error: "QR image too large (max 5MB)" });
      }
      if (_req.path === "/api/orders") {
        return res.status(400).json({ error: "Payment screenshot too large (max 5MB)" });
      }
      return res.status(400).json({ error: "File too large (max 400MB for admin book uploads)" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Bad request" });
  }
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`emporium-academic-api listening on :${PORT}`);
  
  // =====================================================================
  // SELF-PING (Render Anti-Sleep Hack)
  // =====================================================================
  // Pings its own live URL every 14 minutes so Render thinks there is active traffic
  setInterval(() => {
    const url = "https://emporium-academic-api.onrender.com/api/debug/env";
    fetch(url).catch(err => console.log("Self-ping failed:", err.message));
  }, 14 * 60 * 1000);

  (async () => {
    const fid = normalizeDriveFolderId(process.env.DRIVE_PARENT_FOLDER_ID);
    if (!fid) return;
    const bundle = getDriveClient();
    const drive = bundle.drive;
    const actor = driveActorHint(bundle.mode);
    try {
      const meta = await drive.files.get({
        fileId: fid,
        fields: "name,mimeType,owners,shortcutDetails",
        supportsAllDrives: true
      });
      const owner = meta.data.owners?.[0];
      const ownerHint = owner?.emailAddress || owner?.displayName || "(unknown)";
      console.log(
        `[drive] startup check OK — mode=${bundle.mode} actor=${actor} folder="${meta.data.name}" owner=${ownerHint}`
      );
    } catch (e) {
      console.error(
        `[drive] startup check FAILED — mode=${bundle.mode} actor=${actor} folderId=${fid}:`,
        driveApiDetail(e) || e.message
      );
    }
  })().catch(() => {});
});
