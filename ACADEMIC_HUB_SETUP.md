# Academic Hub — upload API & Firebase (Emporium Library)

This guide covers everything **you** must do outside the code editor: Google Cloud / Drive, Render, Firebase Auth, and Firestore rules.

---

## 1. What was added in the repo

| Item | Purpose |
|------|---------|
| `academic-hub.js` | Firebase Auth UI, notes grid (`academic_notes`), upload form, leaderboard (`users`). |
| `academic.html` (updated) | Auth modal, file upload UI, subject filter, links to `academic-hub.js`. |
| `academic-api/` | Node + Express server: `POST /upload` → Drive upload + Firestore writes (Admin SDK). |
| `firestore.rules` | New collections: `academic_notes` (public read, download-count updates only), `users` (public read, no client writes). |

**Important:** Metadata and points are written by the **backend** using the Firebase Admin SDK. Clients cannot forge `academic_notes` / `users` documents.

---

## 2. Firebase Authentication (you must enable)

1. Open [Firebase Console](https://console.firebase.google.com) → project **emporium-library**.
2. Go to **Build → Authentication → Sign-in method**.
3. Enable **Email/Password**.
4. Under **Settings → Authorized domains**, add:
   - `emporiumlibrary.me`
   - `www.emporiumlibrary.me`
   - `localhost` (for local testing)
   - Your Netlify preview domain if you use it.

**Nothing else is required in Firebase for uploads** except deploying the updated Firestore rules (step 6).

---

## 3. Google Cloud service account & Drive folder (you must create)

### 3.1 Create a service account

1. [Google Cloud Console](https://console.cloud.google.com) → select the **same** project linked to Firebase (or the project that owns your Drive quota).
2. **IAM & Admin → Service Accounts → Create service account** (any name, e.g. `emporium-academic-uploader`).
3. **Keys → Add key → JSON** — download the JSON file.  
   - **Never** commit this file to GitHub.  
   - You will paste its **entire JSON as one line** into Render (see step 5).

### 3.2 Enable Google Drive API

1. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

### 3.3 Folder `Emporium-Academic-Uploads` in *your* Google Drive

1. In [Google Drive](https://drive.google.com), create a folder named **`Emporium-Academic-Uploads`** (exact name optional; ID is what matters).
2. Open the folder → copy the **Folder ID** from the URL:  
   `https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID`
3. **Share the folder** with the service account email (looks like `something@project-id.iam.gserviceaccount.com`) with role **Editor** (or **Content manager**).

Put that folder ID in Render as `DRIVE_PARENT_FOLDER_ID`.

### 3.4 Why sharing matters

The service account has its own Drive. Uploads go **into your folder** only if that folder is shared with the service account. Your **5 TB** quota applies to **your** Google account that owns the folder.

---

## 4. Firebase Admin JSON for the server (you must provide)

1. Firebase Console → **Project settings** (gear) → **Service accounts**.
2. **Generate new private key** → JSON file.  
   - This JSON is used as `FIREBASE_SERVICE_ACCOUNT_JSON` on Render.  
   - It can be the **same** JSON as the Google Cloud service account key **if** that service account is granted access to the Firebase project (simpler: use the Firebase-generated Admin SDK key).

The Render service uses it to verify the user’s **ID token** and to write to Firestore.

---

## 5. Deploy the API on Render (you must configure)

1. Push this repo to GitHub (include folder `academic-api/`).
2. [Render](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Root directory:** `academic-api` (hyphen `-`, **not** `academic_api`)
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free tier is OK for low traffic.

### Environment variables (Render → Environment)

| Key | Value |
|-----|--------|
| `ALLOWED_ORIGINS` | `https://emporiumlibrary.me,https://www.emporiumlibrary.me,http://localhost:5500` (adjust if needed; comma-separated, no spaces unless intentional) |
| `DRIVE_PARENT_FOLDER_ID` | Folder ID from section 3.3 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Single-line** JSON string of the service account key (for Drive) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Single-line** JSON string of Firebase Admin SDK key |

**Tip:** To make one line in PowerShell (example):

```powershell
(Get-RawContent .\service-account.json) -replace "`r`n","" -replace "`n",""
```

Paste the result into the Render env value field.

---

## 6. Firestore rules (you must publish)

Copy the updated `firestore.rules` from this repo into **Firebase Console → Firestore → Rules → Publish**.

After deploy, confirm:

- Anyone can **read** `academic_notes` and `users`.
- Clients **cannot** create `academic_notes` / `users` (only the API using Admin SDK can).
- Clients **can** run `update` on `academic_notes` **only** to increment `downloads` by `+1` (for the download counter).

---

## 7. Wire the frontend to your API (you must set the URL)

In `academic.html`, find:

```html
<script>
  window.EMPORIUM_ACADEMIC_API = "";
</script>
```

Set it to your Render URL **without** a trailing slash, for example:

```html
window.EMPORIUM_ACADEMIC_API = "https://your-service-name.onrender.com";
```

Commit and deploy the site to Netlify.

---

## 8. Firestore indexes (only if the console asks)

If the leaderboard query errors with “create index” link:

- Collection: `users`
- Fields: `totalPoints` **Descending**

Create the index from the link Firebase provides.

---

## 9. Migrating old “resources” data (optional)

The new hub reads **`academic_notes`** only. Old documents in **`resources`** are not shown on this page anymore.  
If you need them visible, say so and we can add a one-time import script.

---

## 10. Checklist before going live

- [ ] Email/Password auth enabled + authorized domains  
- [ ] Drive API enabled; folder shared with service account; `DRIVE_PARENT_FOLDER_ID` set  
- [ ] Render env vars set; service redeployed  
- [ ] `window.EMPORIUM_ACADEMIC_API` set in `academic.html` (or inject via Netlify snippet)  
- [ ] Firestore rules published  
- [ ] Test: sign up → upload a small PDF → card appears → download increments count  

---

## When something fails

| Symptom | Likely cause |
|--------|----------------|
| CORS error in browser | `ALLOWED_ORIGINS` missing your exact site origin (scheme + host, no path). |
| Drive 403 / File not found | Folder not shared with service account, or wrong `DRIVE_PARENT_FOLDER_ID`. |
| `Invalid token` / 401 | Wrong Firebase Admin JSON or clock skew; user not signed in on site. |
| Upload works but no Firestore doc | `FIREBASE_SERVICE_ACCOUNT_JSON` wrong project or Firestore API disabled. |
| “Leaderboard unavailable” | Missing index on `users` / `totalPoints`, or no `users` docs yet. |

If you tell me the **exact error message** (browser console + Render logs), I can narrow it down further.
