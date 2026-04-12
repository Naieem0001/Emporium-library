import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { google } from "googleapis";
import admin from "firebase-admin";

const PORT = Number(process.env.PORT) || 3000;
const MAX_BYTES = 20 * 1024 * 1024;
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
  limits: { fileSize: MAX_BYTES },
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
      t.delete(noteRef);
      const userSnap = await t.get(userRef);
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

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large (max 20MB)" });
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
