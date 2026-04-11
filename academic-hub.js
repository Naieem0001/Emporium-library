/**
 * Emporium Library — Academic Hub (Firebase Auth + Drive upload API)
 * Set your Render API base URL (no trailing slash), e.g. in academic.html:
 *   <script>window.EMPORIUM_ACADEMIC_API = "https://your-service.onrender.com";</script>
 */
(function () {
  const ACADEMIC_API = String(window.EMPORIUM_ACADEMIC_API || "").replace(/\/$/, "");

  const firebaseConfig = {
    apiKey: "AIzaSyDCQag_jLEkTVp-DEE2iqk1Pj5ZmjTesXE",
    authDomain: "emporium-library.firebaseapp.com",
    projectId: "emporium-library",
    storageBucket: "emporium-library.firebasestorage.app",
    messagingSenderId: "243007325031",
    appId: "1:243007325031:web:efc7981d8933e7ca3c65c2"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();
  const auth = firebase.auth();

  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("navMenu");
  if (hamburger && navMenu) {
    hamburger.addEventListener("click", e => {
      e.stopPropagation();
      navMenu.classList.toggle("active");
    });
    document.addEventListener("click", e => {
      if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) navMenu.classList.remove("active");
    });
    window.addEventListener("scroll", () => navMenu.classList.remove("active"));
  }

  const MAX_BYTES = 20 * 1024 * 1024;

  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    const raw = String(url || "").trim();
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (e) {}
    return "";
  }

  function showToast(msg, isError) {
    const toast = document.getElementById("toast");
    const span = document.getElementById("toastMsg");
    if (!toast || !span) return;
    span.textContent = msg;
    toast.style.background = isError ? "#DC2626" : "#1B2A41";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function formatDate(ts) {
    if (!ts || typeof ts.toDate !== "function") return "—";
    try {
      return ts.toDate().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch (e) {
      return "—";
    }
  }

  /* ---------- Auth UI ---------- */
  const authModal = document.getElementById("authModal");
  const authNav = document.getElementById("authNav");

  function openAuth(tab) {
    if (!authModal) return;
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".auth-panel").forEach(p => p.classList.remove("active"));
    const t = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
    const p = document.getElementById("authPanel-" + tab);
    if (t) t.classList.add("active");
    if (p) p.classList.add("active");
    authModal.classList.add("show");
  }

  function closeAuth() {
    if (authModal) authModal.classList.remove("show");
  }

  document.querySelectorAll(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => openAuth(btn.getAttribute("data-tab")));
  });
  document.getElementById("authModalClose")?.addEventListener("click", closeAuth);
  authModal?.addEventListener("click", e => {
    if (e.target === authModal) closeAuth();
  });

  document.getElementById("navLogin")?.addEventListener("click", () => openAuth("login"));
  document.getElementById("navSignup")?.addEventListener("click", () => openAuth("signup"));

  function setAuthNav(user) {
    if (!authNav) return;
    if (user) {
      const name = user.displayName || user.email || "Account";
      authNav.innerHTML = `
        <span class="auth-name">${escapeHTML(name)}</span>
        <button type="button" class="btn-nav-outline" id="navLogout">Log out</button>`;
      document.getElementById("navLogout")?.addEventListener("click", () => auth.signOut());
    } else {
      authNav.innerHTML = `
        <button type="button" class="btn-nav-outline" id="navLogin">Log in</button>
        <button type="button" class="btn-nav-primary" id="navSignup">Sign up</button>`;
      document.getElementById("navLogin")?.addEventListener("click", () => openAuth("login"));
      document.getElementById("navSignup")?.addEventListener("click", () => openAuth("signup"));
    }
  }

  document.getElementById("formLogin")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pw = document.getElementById("loginPassword").value;
    try {
      await auth.signInWithEmailAndPassword(email, pw);
      closeAuth();
      showToast("Signed in successfully.");
    } catch (err) {
      showToast(err.message || "Login failed", true);
    }
  });

  document.getElementById("formSignup")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const pw = document.getElementById("signupPassword").value;
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      if (name && cred.user) {
        await cred.user.updateProfile({ displayName: name });
      }
      closeAuth();
      showToast("Account created. You are signed in.");
    } catch (err) {
      showToast(err.message || "Sign up failed", true);
    }
  });

  auth.onAuthStateChanged(user => {
    setAuthNav(user);
    const guestHint = document.getElementById("uploadGuestHint");
    const driveHint = document.getElementById("uploadDriveHint");
    const uploadForm = document.getElementById("uploadNotesForm");
    if (guestHint) guestHint.style.display = user ? "none" : "block";
    if (driveHint) driveHint.style.display = user ? "flex" : "none";
    if (uploadForm) uploadForm.style.display = user ? "block" : "none";
    const nameField = document.getElementById("noteUploaderName");
    if (nameField && user) {
      nameField.value = user.displayName || "";
    }
  });

  const apiHint = document.getElementById("apiHint");
  if (apiHint && !ACADEMIC_API) apiHint.style.display = "flex";

  /* ---------- Notes grid ---------- */
  let allNotes = [];
  let currentPage = 1;
  const perPage = window.innerWidth <= 600 ? 4 : 8;

  function noteCard(n) {
    const link = safeUrl(n.driveLink);
    const subj = escapeHTML(n.subject);
    const title = escapeHTML(n.title);
    const who = escapeHTML(n.uploaderName);
    const desc = escapeHTML(n.description || "");
    const pts = Number(n.points) || 5;
    const dls = Number(n.downloads) || 0;
    const when = formatDate(n.uploadDate);
    return `
      <div class="note-card" data-subject="${subj}">
        <div class="note-card-top">
          <span class="note-badge"><i class="fa-solid fa-file-lines"></i> Notes</span>
          <span class="points-pill-sm">${pts} pts</span>
        </div>
        <div class="note-card-body">
          <h3>${title}</h3>
          <p class="note-subject"><i class="fa-solid fa-tag"></i> ${subj}</p>
          ${desc ? `<p class="note-desc">${desc}</p>` : ""}
          <div class="note-meta">
            <span><i class="fa-solid fa-user"></i> ${who}</span>
            <span><i class="fa-solid fa-calendar"></i> ${when}</span>
            <span><i class="fa-solid fa-download"></i> ${dls}</span>
          </div>
          <a href="${link}" target="_blank" rel="noopener noreferrer" class="note-download"
             data-id="${escapeHTML(n.id)}" onclick="window.__emporiumNoteDl(event)">
            <i class="fa-solid fa-download"></i> Download
          </a>
        </div>
      </div>`;
  }

  window.__emporiumNoteDl = function (e) {
    const a = e.currentTarget;
    const id = a.getAttribute("data-id");
    if (!id) return;
    db.collection("academic_notes")
      .doc(id)
      .update({ downloads: firebase.firestore.FieldValue.increment(1) })
      .catch(() => {});
  };

  function populateSubjectFilter(notes) {
    const sel = document.getElementById("subjectFilter");
    if (!sel) return;
    const subjects = [...new Set(notes.map(n => String(n.subject || "").trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
    const cur = sel.value;
    sel.innerHTML = `<option value="">All subjects</option>` + subjects.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
    if (subjects.includes(cur)) sel.value = cur;
  }

  function filteredNotes() {
    const q = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
    const sub = document.getElementById("subjectFilter")?.value || "";
    let list = [...allNotes];
    if (sub) list = list.filter(n => String(n.subject || "") === sub);
    if (q) {
      list = list.filter(
        n =>
          String(n.title || "")
            .toLowerCase()
            .includes(q) ||
          String(n.subject || "")
            .toLowerCase()
            .includes(q) ||
          String(n.uploaderName || "")
            .toLowerCase()
            .includes(q)
      );
    }
    const sortVal = document.getElementById("sortDropdown")?.value || "newest";
    if (sortVal === "downloads") list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    else if (sortVal === "az") list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    else list.sort((a, b) => {
      const ta = a.uploadDate && a.uploadDate.toMillis ? a.uploadDate.toMillis() : 0;
      const tb = b.uploadDate && b.uploadDate.toMillis ? b.uploadDate.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }

  function renderNotesPage() {
    const grid = document.getElementById("resourcesGrid");
    const countEl = document.getElementById("filterCount");
    if (!grid) return;
    const list = filteredNotes();
    if (countEl) countEl.textContent = list.length + " note" + (list.length !== 1 ? "s" : "");

    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    if (currentPage > pages) currentPage = pages;
    const start = (currentPage - 1) * perPage;
    const slice = list.slice(start, start + perPage);

    if (!slice.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open"></i>
          <p>No notes match your filters yet.</p>
        </div>`;
    } else {
      grid.innerHTML = slice.map(noteCard).join("");
    }

    renderPagination(pages);
    document.getElementById("totalResources").textContent = String(allNotes.length);
    const uniq = new Set(allNotes.map(n => n.uploaderUid).filter(Boolean));
    const tu = document.getElementById("totalUploaders");
    if (tu) tu.textContent = String(uniq.size || allNotes.length);
  }

  function renderPagination(totalPages) {
    const grid = document.getElementById("resourcesGrid");
    if (!grid) return;
    let el = document.getElementById("academicPagination");
    if (!el) {
      el = document.createElement("div");
      el.id = "academicPagination";
      el.className = "pagination";
      grid.after(el);
    }
    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }
    let html = `<button type="button" class="page-btn prev-next" ${currentPage === 1 ? "disabled" : ""} data-p="${currentPage - 1}"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button type="button" class="page-btn ${i === currentPage ? "active-page" : ""}" data-p="${i}">${i}</button>`;
    }
    html += `<button type="button" class="page-btn prev-next" ${currentPage === totalPages ? "disabled" : ""} data-p="${currentPage + 1}"><i class="fa-solid fa-chevron-right"></i></button>`;
    el.innerHTML = html;
    el.querySelectorAll("button[data-p]").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = parseInt(btn.getAttribute("data-p"), 10);
        if (!Number.isFinite(p)) return;
        currentPage = p;
        renderNotesPage();
        document.querySelector(".filter-section")?.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  function loadNotes() {
    const grid = document.getElementById("resourcesGrid");
    if (grid) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading notes...</p></div>`;
    }
    return db.collection("academic_notes")
      .orderBy("uploadDate", "desc")
      .get()
      .then(snap => {
        allNotes = [];
        snap.forEach(doc => allNotes.push({ id: doc.id, ...doc.data() }));
        populateSubjectFilter(allNotes);
        currentPage = 1;
        renderNotesPage();
        loadTotalDownloads();
      })
      .catch(err => {
        console.error(err);
        if (grid) {
          grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Could not load notes.</p></div>`;
        }
      });
  }

  function loadTotalDownloads() {
    let total = 0;
    allNotes.forEach(n => {
      total += Number(n.downloads) || 0;
    });
    const el = document.getElementById("totalDownloads");
    if (el) el.textContent = String(total);
  }

  /* ---------- Leaderboard (users) ---------- */
  function loadLeaderboard() {
    const board = document.getElementById("leaderboard");
    if (!board) return;
    db.collection("users")
      .orderBy("totalPoints", "desc")
      .limit(5)
      .get()
      .then(snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!rows.length) {
          board.innerHTML = `<p style="text-align:center;color:#9CA3AF">No contributors yet. Upload a note to appear here.</p>`;
          return;
        }
        const rankClasses = ["rank-1", "rank-2", "rank-3"];
        board.innerHTML = rows
          .map(
            (c, i) => `
        <div class="contributor">
          <div class="rank-badge ${rankClasses[i] || "rank-other"}">${i + 1}</div>
          <div class="contributor-avatar">${escapeHTML(
            String(c.name || "U")
              .split(" ")
              .map(x => x[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
          )}</div>
          <div class="contributor-info">
            <h3>${escapeHTML(c.name || "Student")}</h3>
            <span>${Number(c.uploadCount) || 0} upload${(Number(c.uploadCount) || 0) !== 1 ? "s" : ""}</span>
          </div>
          <div class="contributor-right">
            <span class="points-pill">${Number(c.totalPoints) || 0} pts</span>
          </div>
        </div>`
          )
          .join("");
      })
      .catch(() => {
        board.innerHTML = `<p style="text-align:center;color:#9CA3AF">Leaderboard unavailable.</p>`;
      });
  }

  /* ---------- Upload ---------- */
  const progressBar = document.getElementById("uploadProgressBar");
  const progressWrap = document.getElementById("uploadProgressWrap");

  function setProgress(pct) {
    if (!progressBar || !progressWrap) return;
    progressWrap.style.display = "block";
    progressBar.style.width = Math.min(100, Math.max(0, pct)) + "%";
  }

  document.getElementById("noteFile")?.addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    const hint = document.getElementById("fileSizeHint");
    if (!f) {
      if (hint) hint.textContent = "";
      return;
    }
    if (hint) hint.textContent = `Selected: ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (f.size > MAX_BYTES) {
      showToast("File must be 20MB or smaller.", true);
      e.target.value = "";
      if (hint) hint.textContent = "";
    }
  });

  document.getElementById("uploadNotesForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!ACADEMIC_API) {
      showToast("Upload API URL is not configured. See ACADEMIC_HUB_SETUP.md.", true);
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      showToast("Please log in to upload.", true);
      openAuth("login");
      return;
    }

    const title = document.getElementById("noteTitle").value.trim();
    const subject = document.getElementById("noteSubject").value.trim();
    const description = document.getElementById("noteDescription").value.trim();
    const uploaderName = document.getElementById("noteUploaderName").value.trim();
    const fileInput = document.getElementById("noteFile");
    const file = fileInput && fileInput.files && fileInput.files[0];

    if (!title || !subject || !uploaderName || !file) {
      showToast("Please complete all required fields.", true);
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast("File must be 20MB or smaller.", true);
      return;
    }

    let token;
    try {
      token = await user.getIdToken();
    } catch (err) {
      showToast("Could not verify your session. Try logging in again.", true);
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("subject", subject);
    form.append("description", description);
    form.append("uploaderName", uploaderName);

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading…`;
    }
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ACADEMIC_API + "/upload");
    xhr.setRequestHeader("Authorization", "Bearer " + token);

    xhr.upload.onprogress = ev => {
      if (!ev.lengthComputable) return;
      setProgress((ev.loaded / ev.total) * 100);
    };

    xhr.onerror = () => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload note`;
      }
      showToast("Network error during upload.", true);
      if (progressWrap) progressWrap.style.display = "none";
    };

    xhr.onload = () => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload note`;
      }
      if (progressWrap) progressWrap.style.display = "none";
      setProgress(0);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          e.target.reset();
          if (fileInput) fileInput.value = "";
          document.getElementById("fileSizeHint").textContent = "";
        } catch (err) {}
        showToast("Note uploaded successfully. +5 points!");
        loadNotes();
        loadLeaderboard();
      } else {
        let msg = "Upload failed.";
        try {
          const j = JSON.parse(xhr.responseText);
          if (j.error) msg = j.error;
        } catch (err) {}
        showToast(msg, true);
      }
    };

    xhr.send(form);
  });

  /* ---------- Listeners ---------- */
  document.getElementById("searchInput")?.addEventListener("input", () => {
    currentPage = 1;
    renderNotesPage();
  });
  document.getElementById("subjectFilter")?.addEventListener("change", () => {
    currentPage = 1;
    renderNotesPage();
  });
  document.getElementById("sortDropdown")?.addEventListener("change", () => {
    currentPage = 1;
    renderNotesPage();
  });

  /* ---------- Mobile filter hide (existing) ---------- */
  const filterBar = document.querySelector(".filter-section");
  let lastScrollY = window.scrollY;
  window.addEventListener("scroll", () => {
    if (!filterBar) return;
    const isMobileView = window.innerWidth <= 768;
    if (!isMobileView) {
      filterBar.classList.remove("is-hidden");
      lastScrollY = window.scrollY;
      return;
    }
    const currentScrollY = window.scrollY;
    const scrollingDown = currentScrollY > lastScrollY;
    const isPastTop = currentScrollY > 140;
    if (scrollingDown && isPastTop) filterBar.classList.add("is-hidden");
    else filterBar.classList.remove("is-hidden");
    lastScrollY = currentScrollY;
  });

  loadNotes().finally(() => loadLeaderboard());
})();
