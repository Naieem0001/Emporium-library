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
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${name}`);
  }
}

function initFirebaseAdmin() {
  const cred = parseJsonEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!cred) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
}

function getDriveClient() {
  const cred = parseJsonEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!cred) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const auth = new google.auth.GoogleAuth({
    credentials: cred,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });
  return google.drive({ version: "v3", auth });
}

async function verifyIdToken(idToken) {
  if (!idToken) throw new Error("Missing token");
  initFirebaseAdmin();
  return admin.auth().verifyIdToken(idToken);
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

    const folderId = String(process.env.DRIVE_PARENT_FOLDER_ID || "").trim();
    if (!folderId) {
      return res.status(500).json({ error: "Server missing DRIVE_PARENT_FOLDER_ID" });
    }

    const drive = getDriveClient();
    const safeName =
      path.basename(req.file.originalname || "upload").replace(/[^\w.\- ()\[\]]+/g, "_") ||
      "upload";

    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [folderId]
      },
      media: {
        body: fs.createReadStream(tmpPath),
        mimeType: req.file.mimetype || "application/octet-stream"
      },
      fields: "id, name, mimeType"
    });

    const fileId = created.data.id;
    if (!fileId) {
      return res.status(500).json({ error: "Drive upload failed" });
    }

    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
      fields: "id"
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
    const msg = err && err.message ? err.message : "Upload failed";
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
});
