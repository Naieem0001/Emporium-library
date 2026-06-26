/**
 * Emporium Library — Academic Hub (Firebase Auth + Drive upload API)
 * Set your Render API base URL (no trailing slash), e.g. in academic.html:
 *   <script>window.EMPORIUM_ACADEMIC_API = "https://your-service.onrender.com";</script>
 */
(function () {
  const ACADEMIC_API = String(window.EMPORIUM_ACADEMIC_API || "").replace(/\/$/, "");
  const viewMode = new URLSearchParams(window.location.search).get("view") || "all";
  const pageName = String(window.location.pathname || "").split("/").pop().toLowerCase();
  const isMyNotesView = viewMode === "my-notes" || pageName === "my-notes.html";
  const redirectParam = String(new URLSearchParams(window.location.search).get("redirect") || "").trim();
  function safeRedirectUrl(url) {
    try {
      const target = new URL(url, window.location.href);
      if (target.origin === window.location.origin) return target.href;
    } catch (err) {
      return null;
    }
    return null;
  }
  const redirectTarget = safeRedirectUrl(redirectParam);

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
  function googleSignInWithFallback(authInstance) {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    return authInstance.signInWithPopup(provider).catch(err => {
      const redirectCodes = new Set([
        'auth/operation-not-supported-in-this-environment',
        'auth/popup-blocked',
        'auth/cancelled-popup-request',
        'auth/invalid-action-code',
        'auth/invalid-credential',
        'auth/requests-from-referer-are-blocked'
      ]);
      // User intentionally closed the popup — do NOT redirect, just re-throw so UI can reset
      if (err.code === 'auth/popup-closed-by-user') {
        throw err;
      }
      if (redirectCodes.has(err.code) || /blocked|invalid action/i.test(err.message || '')) {
        return authInstance.signInWithRedirect(provider);
      }
      throw err;
    });
  }

  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("navMenu");
  if (hamburger && navMenu) {
    hamburger.addEventListener("click", e => {
      e.stopPropagation();
      const on = navMenu.classList.toggle("active");
      hamburger.setAttribute("aria-expanded", on ? "true" : "false");
    });
    document.addEventListener("click", e => {
      if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
        navMenu.classList.remove("active");
        hamburger.setAttribute("aria-expanded", "false");
      }
    });
    window.addEventListener("scroll", () => {
      navMenu.classList.remove("active");
      hamburger.setAttribute("aria-expanded", "false");
    });
  }

  const MAX_BYTES = 50 * 1024 * 1024;

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

  function toDirectDownloadUrl(url) {
    const safe = safeUrl(url);
    if (!safe) return "";
    try {
      const u = new URL(safe);
      if (u.hostname.includes("drive.google.com")) {
        const m = u.pathname.match(/\/file\/d\/([^/]+)/);
        const id = m ? m[1] : u.searchParams.get("id");
        if (id) {
          const enc = encodeURIComponent(id);
          return `https://drive.usercontent.google.com/download?id=${enc}&export=download&confirm=t`;
        }
      }
    } catch (e) {}
    return safe;
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
    authModal.setAttribute("aria-hidden", "false");
  }

  function closeAuth() {
    if (!authModal) return;
    authModal.classList.remove("show");
    authModal.setAttribute("aria-hidden", "true");
  }

  document.querySelectorAll(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => openAuth(btn.getAttribute("data-tab")));
  });
  document.getElementById("authModalClose")?.addEventListener("click", closeAuth);
  authModal?.addEventListener("click", e => {
    if (e.target === authModal) closeAuth();
  });
  // Never auto-open the auth modal on page load.

  document.getElementById("navLogin")?.addEventListener("click", () => openAuth("login"));
  document.getElementById("navSignup")?.addEventListener("click", () => openAuth("signup"));

  function initials(name) {
    return String(name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join("");
  }

  function firstName(name) {
    const parts = String(name || "").trim().split(/\s+/);
    return parts[0] || "Account";
  }

  function setAuthNav(user) {
    if (!authNav) return;
    if (user) {
      const name = user.displayName || user.email || "Account";
      const myNotesLabel = isMyNotesView ? "All Notes" : "My Notes";
      const myNotesHref  = isMyNotesView ? "academic.html" : "my-notes.html";

      authNav.innerHTML = `
        <div class="user-chip-wrap" id="userChipWrap">
          <button type="button" class="user-chip" id="userChip" aria-haspopup="true" aria-expanded="false">
            <span class="user-avatar">${initials(name)}</span>
            <span class="user-chip-name">${escapeHTML(firstName(name))}</span>
            <i class="fa-solid fa-chevron-down user-chip-caret" aria-hidden="true"></i>
          </button>
          <div class="user-dropdown" id="userDropdown" role="menu">
            <div class="user-dd-head">
              <div class="dd-name">${escapeHTML(name)}</div>
              <div class="dd-label">Signed in</div>
            </div>
            <div class="user-dd-actions">
              <button type="button" class="dd-btn" id="navMyNotes" role="menuitem">
                <i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${myNotesLabel}
              </button>
              <div class="dd-divider"></div>
              <button type="button" class="dd-btn dd-logout" id="navLogout" role="menuitem">
                <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Log out
              </button>
            </div>
          </div>
        </div>`;

      // Toggle dropdown
      const wrap  = document.getElementById("userChipWrap");
      const chip  = document.getElementById("userChip");
      const toggleDD = () => {
        const open = wrap.classList.toggle("open");
        chip.setAttribute("aria-expanded", open ? "true" : "false");
      };
      chip.addEventListener("click", e => { e.stopPropagation(); toggleDD(); });

      // Close on outside click
      document.addEventListener("click", function onOut(e) {
        if (!wrap.contains(e.target)) {
          wrap.classList.remove("open");
          chip.setAttribute("aria-expanded", "false");
        }
      });

      document.getElementById("navMyNotes")?.addEventListener("click", () => {
        window.location.href = myNotesHref;
      });
      document.getElementById("navLogout")?.addEventListener("click", () => auth.signOut());

    } else {
      authNav.innerHTML = `
        <button type="button" class="btn-nav-outline" id="navLogin">Log in</button>
        <button type="button" class="btn-nav-primary" id="navSignup">Sign up</button>`;
      document.getElementById("navLogin")?.addEventListener("click", () => openAuth("login"));
      document.getElementById("navSignup")?.addEventListener("click", () => openAuth("signup"));
    }
  }

  function friendlyAuthError(err) {
    const code = err.code || "";
    if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      return "Invalid email or password. Please check and try again.";
    }
    if (code === "auth/invalid-email") return "Please enter a valid email address.";
    if (code === "auth/user-disabled") return "This account has been disabled. Contact support.";
    if (code === "auth/too-many-requests") return "Too many failed attempts. Please wait a few minutes and try again.";
    if (code === "auth/network-request-failed") return "Network error. Please check your internet connection.";
    if (code === "auth/email-already-in-use") return "An account with this email already exists. Try logging in instead.";
    if (code === "auth/weak-password") return "Password is too weak. Please use at least 6 characters.";
    if (code === "auth/operation-not-allowed") return "This sign-in method is not enabled. Contact support.";
    return err.message || "Authentication failed. Please try again.";
  }

  document.getElementById("formLogin")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pw = document.getElementById("loginPassword").value;
    const btn = e.target.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...'; }
    try {
      await auth.signInWithEmailAndPassword(email, pw);
      closeAuth();
      showToast("Signed in successfully.");
      if (redirectTarget) window.location.href = redirectTarget;
    } catch (err) {
      showToast(friendlyAuthError(err), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Log in"; }
    }
  });

  document.getElementById("formSignup")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const pw = document.getElementById("signupPassword").value;
    const btn = e.target.querySelector("button[type=submit]");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...'; }
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      if (name && cred.user) {
        await cred.user.updateProfile({ displayName: name });
      }
      closeAuth();
      showToast("Account created. You are signed in.");
      if (redirectTarget) window.location.href = redirectTarget;
    } catch (err) {
      showToast(friendlyAuthError(err), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
    }
  });

  window.signInWithGoogle = async function() {
    try {
      await googleSignInWithFallback(auth);
      if (typeof closeAuth === 'function') closeAuth();
      if (typeof showToast === 'function') showToast("Signed in with Google.");
      if (redirectTarget) window.location.href = redirectTarget;
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup — don't show an error
        console.log('[academic-hub] Google sign-in popup closed by user.');
        return;
      }
      if (typeof showToast === 'function') showToast(err.message || "Google sign-in failed", true);
      console.error(err);
    }
  };

  let currentUser = null;

  function applyViewMode() {
    const hideInMyNotes = [".academic-hero", ".filter-section", ".resources-section", ".contributors"];
    hideInMyNotes.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.style.display = isMyNotesView ? "none" : "";
    });
    const browseAll = document.getElementById("browseAllNotesLink");
    if (browseAll) browseAll.style.display = isMyNotesView ? "inline-flex" : "none";
  }

  auth.onAuthStateChanged(user => {
    currentUser = user || null;
    setAuthNav(user);
    const guestHint = document.getElementById("uploadGuestHint");
    const driveHint = document.getElementById("uploadDriveHint");
    const uploadForm = document.getElementById("uploadNotesForm");
    const myNotesSection = document.getElementById("myNotesSection");
    if (guestHint) guestHint.style.display = user ? "none" : "block";
    if (driveHint) driveHint.style.display = user ? "flex" : "none";
    if (uploadForm) uploadForm.style.display = user ? "block" : "none";
    if (myNotesSection) myNotesSection.style.display = user && isMyNotesView ? "block" : "none";
    const nameField = document.getElementById("noteUploaderName");
    if (nameField && user) {
      nameField.value = user.displayName || "";
    }
    renderMyNotes();
  });

  const apiHint = document.getElementById("apiHint");
  if (apiHint && !ACADEMIC_API) apiHint.style.display = "flex";

  /* ---------- Notes grid ---------- */
  let allNotes = [];
  let currentPage = 1;
  const MOBILE_NOTES_BREAKPOINT = 768;
  const mobileNotesPerPage = 4;
  const desktopNotesPerPage = 8;
  let myNotesPage = 1;
  const myNotesPerPage = 4;

  const RESOURCE_TYPES = new Set(["notes", "textbooks", "papers", "assignments"]);

  function normalizeResourceType(n) {
    const t = String(n.resourceType || "notes").toLowerCase();
    return RESOURCE_TYPES.has(t) ? t : "notes";
  }

  function resourceTypeLabel(rt) {
    const labels = {
      notes: "Notes",
      textbooks: "Textbook",
      papers: "Past papers",
      assignments: "Assignment"
    };
    return labels[rt] || "Notes";
  }

  function resourceTypeIcon(rt) {
    const icons = {
      notes: "fa-file-lines",
      textbooks: "fa-book",
      papers: "fa-file-circle-check",
      assignments: "fa-file-pen"
    };
    return icons[rt] || "fa-file-lines";
  }

  let selectedCategory = "all";

  function syncCategoryUI() {
    document.querySelectorAll("#categoryTabs .category-btn").forEach(btn => {
      const on = btn.getAttribute("data-cat") === selectedCategory;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    const mob = document.getElementById("categoryMobileSelect");
    if (mob && mob.value !== selectedCategory) mob.value = selectedCategory;
  }

  function setCategory(cat, opts) {
    if (!["all", "notes", "textbooks", "papers", "assignments"].includes(cat)) return;
    selectedCategory = cat;
    syncCategoryUI();
    currentPage = 1;
    renderNotesPage();
    if (!opts || opts.scroll !== false) {
      document.querySelector(".filter-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function noteCard(n) {
    const link = toDirectDownloadUrl(n.driveLink);
    const subj = escapeHTML(n.subject);
    const title = escapeHTML(n.title);
    const who = escapeHTML(n.uploaderName);
    const desc = escapeHTML(n.description || "");
    const dls = Number(n.downloads) || 0;
    const when = formatDate(n.uploadDate);
    const rt = normalizeResourceType(n);
    const badgeClass = `note-badge-rt rt-${rt}`;
    const icon = resourceTypeIcon(rt);
    const typeLabel = resourceTypeLabel(rt);
    return `
      <div class="note-card" data-subject="${subj}" data-resource-type="${rt}">
        <div class="note-card-top">
          <span class="${badgeClass}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${escapeHTML(typeLabel)}</span>
          <span class="points-pill-sm">Shared</span>
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
          <a href="${link}" rel="noopener noreferrer" class="note-download" download
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
    if (selectedCategory !== "all") {
      list = list.filter(n => normalizeResourceType(n) === selectedCategory);
    }
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

    const isMobile = window.innerWidth <= MOBILE_NOTES_BREAKPOINT;
    const perPage = isMobile ? mobileNotesPerPage : desktopNotesPerPage;
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    if (currentPage > pages) currentPage = pages;
    const start = (currentPage - 1) * perPage;
    const slice = isMobile ? list.slice(0, currentPage * perPage) : list.slice(start, start + perPage);

    if (!slice.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open"></i>
          <p>No notes match your filters yet.</p>
        </div>`;
    } else {
      grid.innerHTML = slice.map(noteCard).join("");
    }

    renderPagination(pages, isMobile);
    document.getElementById("totalResources").textContent = String(allNotes.length);
    const uniq = new Set(allNotes.map(n => n.uploaderUid).filter(Boolean));
    const tu = document.getElementById("totalUploaders");
    if (tu) tu.textContent = String(uniq.size || allNotes.length);
  }

  function renderPagination(totalPages, isMobile) {
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
    if (isMobile) {
      if (currentPage >= totalPages) {
        el.innerHTML = "";
        return;
      }
      el.innerHTML = `<button type="button" class="page-btn prev-next" id="loadMoreNotes"><i class="fa-solid fa-plus"></i> Load more</button>`;
      document.getElementById("loadMoreNotes")?.addEventListener("click", () => {
        currentPage += 1;
        renderNotesPage();
      });
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
        renderMyNotes();
        loadTotalDownloads();
      })
      .catch(err => {
        console.error(err);
        if (grid) {
          grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Could not load notes.</p></div>`;
        }
      });
  }

  function myNoteCard(n) {
    const link = toDirectDownloadUrl(n.driveLink);
    const subj = escapeHTML(n.subject);
    const title = escapeHTML(n.title);
    const desc = escapeHTML(n.description || "");
    const dls = Number(n.downloads) || 0;
    const when = formatDate(n.uploadDate);
    const rt = normalizeResourceType(n);
    const badgeClass = `note-badge-rt rt-${rt}`;
    const icon = resourceTypeIcon(rt);
    return `
      <div class="note-card">
        <div class="note-card-top">
          <span class="${badgeClass}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${escapeHTML(resourceTypeLabel(rt))}</span>
          <span class="points-pill-sm">Mine</span>
        </div>
        <div class="note-card-body">
          <h3>${title}</h3>
          <p class="note-subject"><i class="fa-solid fa-tag"></i> ${subj}</p>
          ${desc ? `<p class="note-desc">${desc}</p>` : ""}
          <div class="note-meta">
            <span><i class="fa-solid fa-calendar"></i> ${when}</span>
            <span><i class="fa-solid fa-download"></i> ${dls}</span>
          </div>
          <div class="my-note-actions">
            <a href="${link}" rel="noopener noreferrer" class="btn-action note-download" download>
              <i class="fa-solid fa-download"></i> Download
            </a>
            <button type="button" class="btn-action" data-edit-note-id="${escapeHTML(n.id)}">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button type="button" class="btn-action btn-delete-note" data-note-id="${escapeHTML(n.id)}">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>`;
  }

  function renderMyNotes() {
    const grid = document.getElementById("myNotesGrid");
    const section = document.getElementById("myNotesSection");
    const loadMoreWrap = document.getElementById("myNotesLoadMoreWrap");
    if (!grid || !section) return;
    if (!isMyNotesView) {
      section.style.display = "none";
      if (loadMoreWrap) loadMoreWrap.style.display = "none";
      return;
    }
    if (!currentUser) {
      section.style.display = "none";
      if (loadMoreWrap) loadMoreWrap.style.display = "none";
      return;
    }
    section.style.display = "block";
    const mine = allNotes
      .filter(n => String(n.uploaderUid || "") === String(currentUser.uid || ""))
      .sort((a, b) => {
        const ta = a.uploadDate && a.uploadDate.toMillis ? a.uploadDate.toMillis() : 0;
        const tb = b.uploadDate && b.uploadDate.toMillis ? b.uploadDate.toMillis() : 0;
        return tb - ta;
      });
    if (!mine.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-upload"></i><p>You have not uploaded any materials yet.</p></div>`;
      if (loadMoreWrap) loadMoreWrap.style.display = "none";
      return;
    }
    const isMobile = window.innerWidth <= 600;
    const visible = isMobile ? mine.slice(0, myNotesPage * myNotesPerPage) : mine;
    grid.innerHTML = visible.map(myNoteCard).join("");
    grid.querySelectorAll("[data-edit-note-id]").forEach(btn => {
      btn.addEventListener("click", () => editMyNote(btn.getAttribute("data-edit-note-id")));
    });
    grid.querySelectorAll(".btn-delete-note").forEach(btn => {
      btn.addEventListener("click", () => deleteMyNote(btn.getAttribute("data-note-id")));
    });
    if (loadMoreWrap) {
      if (isMobile && visible.length < mine.length) {
        loadMoreWrap.style.display = "flex";
      } else {
        loadMoreWrap.style.display = "none";
      }
    }
  }

  async function deleteMyNote(noteId) {
    if (!noteId || !currentUser) return;
    if (!ACADEMIC_API) {
      showToast("API URL not configured. Cannot delete note.", true);
      return;
    }
    const ok = window.confirm("Delete this note permanently?");
    if (!ok) return;
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${ACADEMIC_API}/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Delete failed");
      showToast("Note deleted.");
      myNotesPage = 1;
      await loadNotes();
      loadLeaderboard();
    } catch (err) {
      showToast(err.message || "Could not delete note.", true);
    }
  }

  async function editMyNote(noteId) {
    if (!noteId || !currentUser) return;
    if (!ACADEMIC_API) {
      showToast("API URL not configured. Cannot edit note.", true);
      return;
    }
    const note = allNotes.find(n => String(n.id) === String(noteId));
    if (!note) {
      showToast("Note not found.", true);
      return;
    }
    const currentTitle = String(note.title || "").trim();
    const currentDesc = String(note.description || "").trim();
    const title = window.prompt("Edit resource name:", currentTitle);
    if (title === null) return;
    const cleanTitle = String(title).trim();
    if (!cleanTitle || cleanTitle.length > 200) {
      showToast("Title is required and must be 200 chars or less.", true);
      return;
    }
    const desc = window.prompt("Edit description (optional):", currentDesc);
    if (desc === null) return;
    const cleanDesc = String(desc).trim();
    if (cleanDesc.length > 500) {
      showToast("Description must be 500 chars or less.", true);
      return;
    }
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${ACADEMIC_API}/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({ title: cleanTitle, description: cleanDesc })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Edit failed");
      showToast("Note updated.");
      await loadNotes();
      renderMyNotes();
    } catch (err) {
      showToast(err.message || "Could not update note.", true);
    }
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
        <div class="contributor ${i === 0 ? "top-1" : ""}">
          <div class="rank-badge ${rankClasses[i] || "rank-other"}">${i === 0 ? '<i class="fa-solid fa-crown" aria-hidden="true"></i>' : ""}${i + 1}</div>
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
  const progressLabel = document.getElementById("uploadProgressLabel");

  function setProgress(pct) {
    if (!progressBar || !progressWrap) return;
    progressWrap.style.display = "block";
    const clamped = Math.min(100, Math.max(0, pct));
    progressBar.style.width = clamped + "%";
    if (progressLabel) progressLabel.textContent = Math.round(clamped) + "%";
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
      showToast("File must be 50MB or smaller.", true);
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
      showToast("File must be 50MB or smaller.", true);
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
    const resType = document.getElementById("noteResourceType")?.value || "notes";
    form.append("resourceType", RESOURCE_TYPES.has(resType) ? resType : "notes");

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
      if (progressLabel) progressLabel.textContent = "0%";
    };

    xhr.onload = () => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload note`;
      }
      if (progressWrap) progressWrap.style.display = "none";
      setProgress(0);
      if (progressLabel) progressLabel.textContent = "0%";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          e.target.reset();
          if (fileInput) fileInput.value = "";
          document.getElementById("fileSizeHint").textContent = "";
        } catch (err) {}
        showToast("Note uploaded successfully. +5 points!");
        celebrateUpload();
        myNotesPage = 1;
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

  document.querySelectorAll("#categoryTabs .category-btn").forEach(btn => {
    btn.addEventListener("click", () => setCategory(btn.getAttribute("data-cat") || "all", { scroll: false }));
  });
  document.getElementById("categoryMobileSelect")?.addEventListener("change", e => {
    setCategory(e.target.value || "all", { scroll: false });
  });

  document.querySelectorAll("a[data-type]").forEach(a => {
    a.addEventListener("click", ev => {
      const t = (a.getAttribute("data-type") || "").toLowerCase();
      if (!RESOURCE_TYPES.has(t)) return;
      ev.preventDefault();
      setCategory(t);
    });
  });

  syncCategoryUI();
  applyViewMode();
  document.getElementById("myNotesLoadMore")?.addEventListener("click", () => {
    myNotesPage += 1;
    renderMyNotes();
  });

  function celebrateUpload() {
    const layer = document.createElement("div");
    layer.className = "celebration-layer";
    const colors = ["#FF7A18", "#FF9F43", "#1B2A41", "#3B82F6", "#10B981"];
    const burstX = Math.floor(window.innerWidth * 0.5);
    const burstY = Math.floor(window.innerHeight * 0.28);
    for (let i = 0; i < 22; i += 1) {
      const p = document.createElement("span");
      p.className = "celebration-piece";
      const dx = Math.round((Math.random() - 0.5) * 320) + "px";
      const dy = Math.round(Math.random() * 260 + 80) + "px";
      const rot = Math.round((Math.random() - 0.5) * 360) + "deg";
      p.style.left = burstX + "px";
      p.style.top = burstY + "px";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", dx);
      p.style.setProperty("--dy", dy);
      p.style.setProperty("--rot", rot);
      p.style.animationDelay = Math.round(Math.random() * 100) + "ms";
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  }

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
