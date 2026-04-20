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
app.use(express.json({ limit: "512kb" }));

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

const uploadQR = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!IMAGE_ALLOWED_EXT.has(ext)) return cb(new Error("Invalid QR image type"));
    if (!file.mimetype || file.mimetype === "application/octet-stream") return cb(null, true);
    if (IMAGE_ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    return cb(new Error("Invalid QR image type"));
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

// Public: fetch current UPI + bank details for the checkout modal.
app.get("/api/payment-config", async (_req, res) => {
  try {
    initFirebaseAdmin();
    const db = admin.firestore();
    const snap = await db.collection("payment_config").doc("default").get();
    const fallback = {
      upiId: "",
      upiPayeeName: "",
      upiQrUrl: "",
      bankName: "",
      accountName: "",
      accountNumber: "",
      ifsc: "",
      branch: ""
    };
    if (!snap.exists) return res.json(fallback);
    const d = snap.data() || {};
    return res.json({
      upiId: d.upiId || "",
      upiPayeeName: d.upiPayeeName || "",
      upiQrUrl: d.upiQrUrl || "",
      bankName: d.bankName || "",
      accountName: d.accountName || "",
      accountNumber: d.accountNumber || "",
      ifsc: d.ifsc || "",
      branch: d.branch || ""
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load payment config" });
  }
});

// Admin: update UPI + bank details, optionally upload a QR image.
app.post("/admin/payment-config", uploadQR.single("qr"), async (req, res) => {
  const tmpPath = req.file?.path;
  const cleanup = () => { if (tmpPath) fs.unlink(tmpPath, () => {}); };
  try {
    await requireAdminFromReq(req);

    const upiId = String(req.body.upiId || "").trim();
    const upiPayeeName = String(req.body.upiPayeeName || "").trim();
    const bankName = String(req.body.bankName || "").trim();
    const accountName = String(req.body.accountName || "").trim();
    const accountNumber = String(req.body.accountNumber || "").trim();
    const ifsc = String(req.body.ifsc || "").trim().toUpperCase();
    const branch = String(req.body.branch || "").trim();
    const clearQr = String(req.body.clearQr || "").toLowerCase() === "true";
    const existingQr = String(req.body.existingQrUrl || "").trim();
    const pastedQrUrl = String(req.body.qrUrl || "").trim();

    if (upiId.length > 120) return res.status(400).json({ error: "UPI id too long" });
    if (upiId && !/^[\w.\-]+@[\w.\-]+$/.test(upiId)) {
      return res.status(400).json({ error: "UPI id looks invalid (expected like name@bank)" });
    }
    if (accountNumber && !/^[0-9]{6,30}$/.test(accountNumber)) {
      return res.status(400).json({ error: "Invalid account number" });
    }
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return res.status(400).json({ error: "Invalid IFSC" });
    }
    if (pastedQrUrl && !/^https:\/\/[^\s<>"']{4,500}$/i.test(pastedQrUrl)) {
      return res.status(400).json({ error: "QR URL must be a valid https link" });
    }

    let upiQrUrl = clearQr ? "" : existingQr;
    if (pastedQrUrl) upiQrUrl = pastedQrUrl;
    if (req.file) {
      const folderId = normalizeDriveFolderId(process.env.DRIVE_PARENT_FOLDER_ID);
      if (!folderId) return res.status(500).json({ error: "Server missing DRIVE_PARENT_FOLDER_ID" });
      const bundle = getDriveClient();
      const drive = bundle.drive;
      let parentId = folderId;
      try { parentId = await resolveDriveParentFolderId(drive, folderId); } catch (e) {
        const detail = driveApiDetail(e) || e.message || "Cannot read folder";
        return res.status(400).json({ error: `Drive parent folder: ${detail}` });
      }
      const qrId = await uploadPublicFileToDrive(drive, parentId, req.file, "upi-qr");
      upiQrUrl = `https://drive.google.com/thumbnail?id=${qrId}&sz=w800`;
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    await db.collection("payment_config").doc("default").set({
      upiId,
      upiPayeeName,
      upiQrUrl,
      bankName,
      accountName,
      accountNumber,
      ifsc,
      branch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    cleanup();
    return res.json({ ok: true, upiQrUrl });
  } catch (err) {
    console.error(err);
    cleanup();
    const msg = err?.message || "Save failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

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

// Public: create a pending order after buyer submits UTR.
app.post("/api/orders", async (req, res) => {
  try {
    const bookId = String(req.body.bookId || "").trim();
    const emailRaw = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const method = String(req.body.method || "").toLowerCase().trim();
    const utr = String(req.body.utr || "").trim();
    const screenshotUrl = String(req.body.screenshotUrl || "").trim();

    if (!bookId || bookId.length > 200) return res.status(400).json({ error: "Invalid bookId" });
    if (!isValidEmail(emailRaw)) return res.status(400).json({ error: "Invalid email" });
    if (phone && (phone.length > 20 || !/^[0-9+\-\s()]{6,20}$/.test(phone))) {
      return res.status(400).json({ error: "Invalid phone" });
    }
    if (!["upi", "bank"].includes(method)) return res.status(400).json({ error: "Invalid payment method" });
    if (utr && (utr.length < 4 || utr.length > 40 || !/^[A-Za-z0-9\-_]+$/.test(utr))) {
      return res.status(400).json({ error: "Invalid UTR / transaction id" });
    }
    if (!screenshotUrl || !/^https:\/\/[^\s<>"']{4,500}$/i.test(screenshotUrl)) {
      return res.status(400).json({ error: "Payment screenshot URL is required (https link)" });
    }

    initFirebaseAdmin();
    const db = admin.firestore();
    const bookSnap = await db.collection("books").doc(bookId).get();
    if (!bookSnap.exists) return res.status(404).json({ error: "Book not found" });
    const bookData = bookSnap.data() || {};
    const price = Number(bookData.price) || 0;
    if (price <= 0) return res.status(400).json({ error: "This book is free — no purchase needed" });

    // Reject exact duplicate screenshot proof for the same book.
    const dupProof = await db.collection("orders")
      .where("screenshotUrl", "==", screenshotUrl)
      .where("bookId", "==", bookId)
      .limit(1)
      .get();
    if (!dupProof.empty) {
      const existing = dupProof.docs[0].data() || {};
      return res.status(409).json({
        error: "This payment screenshot is already on file for this book",
        accessCode: existing.accessCode || "",
        orderId: dupProof.docs[0].id
      });
    }

    let accessCode = "";
    for (let i = 0; i < 6; i++) {
      const candidate = generateAccessCode(8);
      const dup = await db.collection("orders")
        .where("accessCode", "==", candidate).limit(1).get();
      if (dup.empty) { accessCode = candidate; break; }
    }
    if (!accessCode) return res.status(500).json({ error: "Could not generate access code, please retry" });

    const orderRef = await db.collection("orders").add({
      bookId,
      bookTitle: String(bookData.title || ""),
      bookCover: String(bookData.cover || ""),
      bookPrice: price,
      buyerEmail: emailRaw,
      buyerPhone: phone,
      method,
      utr,
      screenshotUrl,
      status: "pending",
      accessCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, orderId: orderRef.id, accessCode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Order creation failed" });
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
    let driveLink = "";
    const assetSnap = await db.collection("paid_book_assets").doc(bookId).get();
    if (assetSnap.exists) driveLink = String(assetSnap.data()?.driveLink || "");
    if (!driveLink) {
      const bookSnap = await db.collection("books").doc(bookId).get();
      if (bookSnap.exists) driveLink = String(bookSnap.data()?.driveLink || "");
    }
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

// Admin: approve an order.
app.post("/admin/orders/:id/approve", async (req, res) => {
  try {
    await requireAdminFromReq(req);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing order id" });
    initFirebaseAdmin();
    const db = admin.firestore();
    const ref = db.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found" });
    await ref.update({
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedReason: admin.firestore.FieldValue.delete()
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err?.message || "Approve failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

// Admin: reject an order with a reason.
app.post("/admin/orders/:id/reject", async (req, res) => {
  try {
    await requireAdminFromReq(req);
    const id = String(req.params.id || "").trim();
    const reason = String(req.body.reason || "").trim().slice(0, 300);
    if (!id) return res.status(400).json({ error: "Missing order id" });
    initFirebaseAdmin();
    const db = admin.firestore();
    const ref = db.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found" });
    await ref.update({
      status: "rejected",
      rejectedReason: reason || "Payment could not be verified",
      rejectedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err?.message || "Reject failed";
    const code = /Missing token|Invalid token|auth|Admin access denied/i.test(msg) ? 401 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      if (_req.path === "/upload") {
        return res.status(400).json({ error: "File too large (max 50MB)" });
      }
      if (_req.path === "/admin/payment-config") {
        return res.status(400).json({ error: "QR image too large (max 5MB)" });
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
