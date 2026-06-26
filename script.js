/* ========== FIREBASE INIT ========== */
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
window.db = db;
window.auth = auth;
if (auth && auth.setPersistence) {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
    console.warn('Firebase auth persistence failed:', err);
  });
}
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
    if (err.code === 'auth/popup-closed-by-user') {
      throw err; // user intentionally closed — don't redirect
    }
    if (redirectCodes.has(err.code) || /blocked|invalid action/i.test(err.message || '')) {
      return authInstance.signInWithRedirect(provider);
    }
    throw err;
  });
}
function friendlyAuthError(err) {
  const code = err.code || "";
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password. Please check and try again.";
  }
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  if (code === "auth/too-many-requests") return "Too many failed attempts. Please wait a few minutes.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password too weak. Use at least 6 characters.";
  if (code === "auth/requests-from-referer-are-blocked") return "Sign-in blocked. Your domain may not be authorized in Firebase.";
  return err.message || "Authentication failed. Please try again.";
}
window.signInWithGoogle = async function () {
  try {
    await googleSignInWithFallback(auth);
    if (typeof window.showToast === 'function') window.showToast('Signed in with Google.');
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      return; // user closed — no error toast
    }
    console.error('Google sign-in failed:', err);
    if (typeof window.showToast === 'function') window.showToast(friendlyAuthError(err), true);
  }
};
window.openAuthModal = function () {
  const authLocal = window.auth || (firebase && firebase.auth ? firebase.auth() : null);
  if (authLocal && typeof authLocal.signInWithPopup === 'function') {
    const provider = new firebase.auth.GoogleAuthProvider();
    authLocal.signInWithPopup(provider).catch(err => {
      console.warn('openAuthModal popup failed:', err.code);
    });
  }
};
const LOCAL_API_BASE = "http://127.0.0.1:3000";
const REMOTE_API_BASE = "https://emporium-academic-api.onrender.com";
const isLocalHostRuntime =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
const API_BASE = String(
  window.EMPORIUM_ACADEMIC_API || (isLocalHostRuntime ? LOCAL_API_BASE : REMOTE_API_BASE)
).replace(/\/$/, "");

/* ========== HAMBURGER ========== */
const hamburger = document.getElementById("hamburger");
const navMenu   = document.getElementById("navMenu");
if (hamburger && navMenu) {
  hamburger.addEventListener("click", e => {
    e.stopPropagation();
    navMenu.classList.toggle("active");
  });
  hamburger.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navMenu.classList.toggle("active");
    }
  });
  document.addEventListener("click", e => {
    if (!navMenu.contains(e.target) && !hamburger.contains(e.target))
      navMenu.classList.remove("active");
  });
  window.addEventListener("scroll", () => navMenu.classList.remove("active"));
}

/* ========== SEARCH ========== */
const searchInput = document.querySelector(".search-box input");
const isGenrePage = !!document.getElementById("libraryGrid");
if (searchInput) {
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.value.trim()) {
      window.location.href = `genre.html?search=${encodeURIComponent(e.target.value.trim())}`;
    }
  });
}

/* ========== ESCAPE HTML ========== */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toDirectDownloadUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (u.hostname.includes("drive.google.com")) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m ? m[1] : u.searchParams.get("id");
      if (id) return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
    }
    return u.href;
  } catch (err) {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGenre(value) {
  const v = normalizeText(value).replace(/\s+/g, "-");
  const alias = {
    "sci-fi": "science-fiction",
    "scifi": "science-fiction",
    "romance": "rom-com",
    "horror-&-thriller": "horror-thriller"
  };
  return alias[v] || v;
}

function isTruthy(value) {
  const v = normalizeText(value);
  return value === true || value === 1 || v === "true" || v === "1" || v === "yes";
}

function getQueryParam(name) {
  try {
    const url = new URL(window.location.href);
    const direct = url.searchParams.get(name);
    if (direct !== null) return direct;

    // Fallback: support links that accidentally put params in hash.
    const hash = String(url.hash || "").replace(/^#/, "");
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get(name);
      if (fromHash !== null) return fromHash;
    }
  } catch (err) {
    // Ignore and use final regex fallback below.
  }

  const match = new RegExp(`[?&#]${name}=([^&#]*)`, "i").exec(window.location.href);
  return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : null;
}

function persistNavigationFilter() {
  document.querySelectorAll('a[href*="genre.html?"]').forEach(link => {
    link.addEventListener("click", () => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.href);
        const payload = {
          genre: url.searchParams.get("genre"),
          flag: url.searchParams.get("flag"),
          search: url.searchParams.get("search")
        };
        sessionStorage.setItem("emporiumGenreFilter", JSON.stringify(payload));
      } catch (err) {
        // Ignore parsing/storage errors.
      }
    });
  });
}

function getStoredParam(name) {
  try {
    const raw = sessionStorage.getItem("emporiumGenreFilter");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const value = parsed && typeof parsed === "object" ? parsed[name] : null;
    return value == null ? null : String(value);
  } catch (err) {
    return null;
  }
}

function debounce(fn, wait = 500) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ========== RENDER BOOK CARD ========== */
const bookCache = new Map();
let externalBooks = [];
let externalMeta = { loading: false, label: "" };
let activeSearchRequest = 0;
let allFirestoreBooks = [];
window.allFirestoreBooks = allFirestoreBooks; // expose for book-detail.html
let firestoreFilteredCount = 0;

function updateGenreCountDisplay() {
  const count = document.getElementById("genreCount");
  if (!count) return;
  if (externalMeta.loading) {
    if (firestoreFilteredCount > 0) {
      count.textContent = `${firestoreFilteredCount}+ results`;
    } else {
      count.textContent = "Searching books...";
    }
    return;
  }
  const total = firestoreFilteredCount + externalBooks.length;
  count.textContent = `${total} result${total !== 1 ? "s" : ""}`;
}

function renderCard(book) {
  const isExternal = !!book.externalSource;
  const price = Number(book.price) || 0;
  const isPaid = !isExternal && price > 0;
  if (book.id) bookCache.set(book.id, book);
  const cardClass = `book-card${isPaid ? " is-paid" : ""}${isExternal ? " is-external" : ""}`;
  const paidBadge = isPaid
    ? `<span class="paid-badge"><i class="fa-solid fa-lock"></i> Paid</span>`
    : "";
  const sourceBadge = isExternal
    ? `<span class="source-badge source-${escapeHTML(book.externalSource)}">${escapeHTML(book.externalSourceLabel || "Web")}</span>`
    : "";
  const availabilityBadge = isExternal
    ? `<span class="availability-badge availability-free">FREE DOWNLOAD</span>`
    : "";
  const badge = `${paidBadge}${sourceBadge}${availabilityBadge}`;
  const action = isPaid
    ? `<button type="button" class="buy-btn" data-book-id="${escapeHTML(book.id || "")}" onclick="openEmporiumCheckout(this)">
         <i class="fa-solid fa-indian-rupee-sign"></i> Buy &mdash; &#8377;${price}
       </button>`
    : isExternal
    ? `<a href="${escapeHTML(book.externalUrl || book.driveLink)}" target="_blank" rel="noopener noreferrer" class="download-btn">
         <i class="fa-solid fa-download"></i> Download
       </a>`
    : `<a href="${escapeHTML(toDirectDownloadUrl(book.driveLink))}" rel="noopener noreferrer" class="download-btn" download>
         <i class="fa-solid fa-download"></i> Download
       </a>`;
  const externalClickAttrs = isExternal
    ? ` role="link" tabindex="0" onclick="openExternalBookCard(event, '${escapeHTML(book.externalUrl || book.driveLink)}')" onkeydown="openExternalBookCard(event, '${escapeHTML(book.externalUrl || book.driveLink)}')"`
    : "";

  const detailUrl = (!isExternal && !isPaid && book.id)
    ? `book-detail.html?id=${encodeURIComponent(book.id)}`
    : null;
  const reviewLink = detailUrl
    ? `<a href="${detailUrl}" class="book-review-link" title="Read reviews" aria-label="Reviews for ${escapeHTML(book.title)}"><i class="fa-regular fa-star"></i> Reviews</a>`
    : "";
  const avgStars = book.avgRating && book.reviewCount
    ? `<div class="book-card-rating" style="font-size: 0.8rem; color: #f59e0b; margin-bottom: 8px;">
         <i class="fa-solid fa-star"></i> <span style="color:#4b5563; font-weight:600;">${book.avgRating}</span> <span style="color:#9ca3af;">(${book.reviewCount})</span>
       </div>`
    : "";

  if (detailUrl) {
    return `
    <div class="${cardClass}" data-book-id="${escapeHTML(book.id)}">
      ${badge}
      <a href="${detailUrl}" class="book-cover-link" aria-label="View details for ${escapeHTML(book.title)}">
        <div class="book-cover">
          <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}"
               onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'" />
          <div class="book-cover-overlay"><i class="fa-solid fa-book-open"></i> View Details</div>
        </div>
      </a>
      <div class="book-info">
        <a href="${detailUrl}" class="book-title-link"><h3>${escapeHTML(book.title)}</h3></a>
        ${avgStars}
        <p class="author">${escapeHTML(book.author)}</p>
        <div class="book-card-actions">
          ${action}
          ${reviewLink}
        </div>
      </div>
    </div>`;
  }

  return `
    <div class="${cardClass}"${externalClickAttrs}>
      ${badge}
      <div class="book-cover">
        <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}"
             onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'" />
      </div>
      <div class="book-info">
        <h3>${escapeHTML(book.title)}</h3>
        <p class="author">${escapeHTML(book.author)}</p>
        ${action}
      </div>
    </div>`;
}

function bookSkeletonCard() {
  return `
    <div class="book-card-skeleton" aria-hidden="true">
      <div class="book-skeleton-cover book-skeleton-shimmer"></div>
      <div class="book-skeleton-line title book-skeleton-shimmer"></div>
      <div class="book-skeleton-line author book-skeleton-shimmer"></div>
      <div class="book-skeleton-actions">
        <div class="book-skeleton-pill book-skeleton-shimmer"></div>
        <div class="book-skeleton-pill small book-skeleton-shimmer"></div>
      </div>
    </div>`;
}

function bookSkeletonCards(count) {
  return Array.from({ length: count }).map(bookSkeletonCard).join("");
}

function clearInitialBookSkeletons() {
  if (window.EmporiumBookSkeletons && typeof window.EmporiumBookSkeletons.clear === "function") {
    window.EmporiumBookSkeletons.clear();
  } else {
    document.documentElement.classList.remove("book-skeletons-visible");
  }
}

function showBookGridSkeleton(grid, count) {
  if (!grid) return;
  grid.classList.add("is-loading");
  grid.innerHTML = bookSkeletonCards(count);
}

function clearBookGridLoading(grid) {
  if (grid) grid.classList.remove("is-loading");
}

function openExternalBookCard(event, url) {
  if (!url) return;
  const triggerKey = event && (event.key === "Enter" || event.key === " ");
  if (event && event.type === "keydown" && !triggerKey) return;
  if (event && event.target && event.target.closest("a, button")) return;
  if (event && triggerKey) event.preventDefault();
  window.open(url, "_blank", "noopener");
}

function openEmporiumCheckout(btn) {
  const id = btn && btn.getAttribute("data-book-id");
  if (!id) return;
  const book = bookCache.get(id);
  if (!book) {
    console.warn("Book not found in cache:", id);
    return;
  }
  if (window.EmporiumCheckout && typeof window.EmporiumCheckout.openCheckout === "function") {
    window.EmporiumCheckout.openCheckout({
      id: book.id,
      title: book.title,
      author: book.author,
      cover: book.cover,
      price: Number(book.price) || 0
    });
  } else {
    alert("Checkout is still loading. Please try again in a moment.");
  }
}

/* ========== DISPLAY TRENDING ========== */
function displayTrendingBooks(books) {
  const container = document.getElementById("trendingBooks");
  if (!container) return;
  clearBookGridLoading(container);
  const trending = books.filter(b => isTruthy(b.trending)).slice(0, 6);
  container.innerHTML = trending.length
    ? trending.map(renderCard).join("")
    : `<p class="state-message">No trending books yet.</p>`;
}

/* ========== DISPLAY NEW RELEASES ========== */
function displayNewReleases(books) {
  const container = document.getElementById("newReleasesBooks");
  if (!container) return;
  clearBookGridLoading(container);
  const newReleases = books.filter(b => isTruthy(b.newRelease)).slice(0, 4);
  container.innerHTML = newReleases.length
    ? newReleases.map(renderCard).join("")
    : `<p class="state-message">No new releases yet.</p>`;
}

/* ========== PAGINATION ========== */
const booksPerPage = 10;
let currentPage = 1;
let currentBooks = [];

function displayBooks(bookList) {
  currentBooks = bookList;
  currentPage = 1;
  renderCurrentPage();
}

function renderCurrentPage() {
  const grid = document.getElementById("libraryGrid");
  if (!grid) return;
  clearBookGridLoading(grid);
  const start = (currentPage - 1) * booksPerPage;
  const end   = start + booksPerPage;
  const page  = currentBooks.slice(start, end);

  if (page.length) {
    grid.innerHTML = page.map(renderCard).join("");
  } else if (externalMeta.loading) {
    grid.innerHTML = "";
  } else if (!externalBooks.length) {
    grid.innerHTML = `<p class="state-message">No books found.</p>`;
  } else {
    grid.innerHTML = "";
  }

  setupPagination();
  renderExternalSection();
}

function setupPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;

  const totalPages = Math.ceil(currentBooks.length / booksPerPage);
  if (totalPages <= 1) { container.innerHTML = ""; return; }

  function pageBtn(i, label) {
    return `<button onclick="goToPage(${i})" class="page-btn ${i === currentPage ? 'active-page' : ''}">${label || i}</button>`;
  }

  function dots() { return `<span class="page-dots">...</span>`; }

  let html = `<button class="page-btn prev-next" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>`;

  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) html += pageBtn(i);
  } else {
    html += pageBtn(1);
    if (currentPage > 3) html += dots();
    const start = Math.max(2, currentPage - 1);
    const end   = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) html += pageBtn(i);
    if (currentPage < totalPages - 2) html += dots();
    html += pageBtn(totalPages);
  }

  html += `<button class="page-btn prev-next" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;

  container.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(currentBooks.length / booksPerPage);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderCurrentPage();
  const genreHeader = document.querySelector(".genre-header");
  if (genreHeader) genreHeader.scrollIntoView({ behavior: "smooth" });
}

function normalizeExternalBook(raw) {
  return {
    id: String(raw.id || ""),
    title: String(raw.title || "").trim(),
    author: String(raw.author || "Unknown").trim() || "Unknown",
    genre: String(raw.genre || "").trim(),
    cover: String(raw.cover || "").trim() || "https://via.placeholder.com/150x220?text=No+Cover",
    driveLink: String(raw.driveLink || raw.externalUrl || "").trim(),
    price: 0,
    externalSource: String(raw.source || "").trim().toLowerCase(),
    externalSourceLabel: String(raw.sourceLabel || "Web").trim(),
    externalType: "free",
    externalUrl: String(raw.externalUrl || raw.driveLink || "").trim()
  };
}

function externalDividerLabel() {
  return externalMeta.label || "More from the web";
}

function renderExternalSection() {
  const grid = document.getElementById("libraryGrid");
  if (!grid || currentPage !== 1) return;

  const old = grid.querySelector(".external-books-block");
  if (old) old.remove();

  if (externalMeta.loading) {
    grid.insertAdjacentHTML("beforeend", `
      <div class="external-books-block">
        <div class="external-divider">${escapeHTML(externalDividerLabel())}</div>
        <div class="external-books-grid is-loading">
          ${bookSkeletonCards(6)}
        </div>
      </div>
    `);
    updateGenreCountDisplay();
    return;
  }

  if (!externalBooks.length) {
    updateGenreCountDisplay();
    return;
  }

  grid.insertAdjacentHTML("beforeend", `
    <div class="external-books-block">
      <div class="external-divider">${escapeHTML(externalDividerLabel())}</div>
      <div class="external-books-grid">
        ${externalBooks.map(renderCard).join("")}
      </div>
    </div>
  `);
  updateGenreCountDisplay();
}

const scheduleExternalFetch = debounce(async (mode, value, requestId) => {
  const grid = document.getElementById("libraryGrid");
  if (!grid) return;
  try {
    const endpoint = mode === "search"
      ? `${API_BASE}/api/external/search?q=${encodeURIComponent(value)}`
      : `${API_BASE}/api/external/genre?genre=${encodeURIComponent(value)}`;

    // AbortController for a 25-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (requestId !== activeSearchRequest) return;
    if (!res.ok) throw new Error(`External fetch failed: ${res.status}`);
    const data = await res.json();
    if (requestId !== activeSearchRequest) return;
    externalBooks = (Array.isArray(data.books) ? data.books : [])
      .map(normalizeExternalBook)
      .filter(x => x.title && x.externalUrl);
  } catch (err) {
    if (requestId !== activeSearchRequest) return;
    if (err.name === "AbortError") {
      console.warn("External books fetch timed out after 25s");
    } else {
      console.warn("External books fetch error:", err.message || err);
    }
    externalBooks = [];
  } finally {
    if (requestId !== activeSearchRequest) return;
    externalMeta.loading = false;
    renderExternalSection();
    renderCurrentPage();
  }
}, 500);

function loadExternalBooks(params) {
  const { search, genre, sectionLabel } = params;
  const mode = search ? "search" : "genre";
  const value = search || genre || "all";
  activeSearchRequest += 1;
  const reqId = activeSearchRequest;
  externalBooks = [];
  externalMeta = { loading: true, label: sectionLabel || "More from the web" };
  updateGenreCountDisplay();
  renderExternalSection();
  scheduleExternalFetch(mode, value, reqId);
}

function showGenreTransitionSkeleton(label) {
  const grid = document.getElementById("libraryGrid");
  if (!grid) return;
  showBookGridSkeleton(grid, window.innerWidth <= 600 ? 6 : 10);
  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
  const count = document.getElementById("genreCount");
  if (count) count.textContent = label || "Loading books...";
}

/* ========== GENRE / SEARCH PAGE ========== */
function getGenreFromURL() {
  return getQueryParam("genre") ?? getStoredParam("genre");
}

function getSearchFromURL() {
  return getQueryParam("search") ?? getStoredParam("search");
}

function getFlagFromURL() {
  return getQueryParam("flag") ?? getStoredParam("flag");
}

function loadGenrePage(books) {
  const genreParam = getGenreFromURL();
  const search = getSearchFromURL();
  const flag = normalizeText(getFlagFromURL());
  const title  = document.getElementById("genreTitle");
  const count  = document.getElementById("genreCount");
  let externalLabel = "More from the web";

  let filtered = books;

  if (search) {
    const q = normalizeText(search);
    filtered = books.filter(b =>
      normalizeText(b.title).includes(q) ||
      normalizeText(b.author).includes(q) ||
      normalizeGenre(b.genre).includes(q)
    );
    if (title) title.textContent = `Search: "${search}"`;
    externalLabel = "More from the web";
  } else if (flag === "trending") {
    filtered = books.filter(b => isTruthy(b.trending));
    if (title) title.textContent = "All Trending Books";
    externalLabel = "Trending picks from the web";
  } else if (flag === "new") {
    filtered = books.filter(b => isTruthy(b.newRelease));
    if (title) title.textContent = "All New Releases";
    externalLabel = "New picks from the web";
  } else if (genreParam !== null && genreParam !== "") {
    const genre = normalizeGenre(genreParam);
    if (genre && genre !== "all") {
      filtered = books.filter(b => normalizeGenre(b.genre) === genre);
      if (title) title.textContent = genre
      .split("-")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
      externalLabel = `${title ? title.textContent : "Genre"} from the web`;
    } else {
      if (title) title.textContent = "All Books";
      externalLabel = "More books from the web";
    }
  } else {
    if (title) title.textContent = "All Books";
    externalLabel = "More books from the web";
  }

  firestoreFilteredCount = filtered.length;
  updateGenreCountDisplay();
  displayBooks(filtered);

  if (search) {
    loadExternalBooks({ search, sectionLabel: externalLabel });
  } else {
    loadExternalBooks({ genre: genreParam || "all", sectionLabel: externalLabel });
  }
}

/* ========== LOAD ALL BOOKS FROM FIREBASE ========== */
function loadAllBooks() {
  db.collection("books").orderBy("createdAt", "desc").get().then(snapshot => {
    clearInitialBookSkeletons();
    const books = [];
    snapshot.forEach(doc => books.push({ id: doc.id, ...doc.data() }));
    allFirestoreBooks = books;
    window.allFirestoreBooks = books; // keep window reference in sync

    /* homepage */
    displayTrendingBooks(books);
    displayNewReleases(books);

    /* genre page */
    if (document.getElementById("libraryGrid")) {
      loadGenrePage(books);
    }

  }).catch(err => {
    clearInitialBookSkeletons();
    console.error("Failed to load books:", err);
    const grid = document.getElementById("libraryGrid");
    if (grid) {
      clearBookGridLoading(grid);
      grid.innerHTML = `<p class="state-message">Failed to load books. Please refresh.</p>`;
    }
    const trending = document.getElementById("trendingBooks");
    if (trending) {
      clearBookGridLoading(trending);
      trending.innerHTML = `<p class="state-message">Failed to load trending books. Please refresh.</p>`;
    }
    const releases = document.getElementById("newReleasesBooks");
    if (releases) {
      clearBookGridLoading(releases);
      releases.innerHTML = `<p class="state-message">Failed to load new releases. Please refresh.</p>`;
    }
  });
}

const onGenreSearchInput = debounce((value) => {
  if (!isGenrePage || !allFirestoreBooks.length) return;
  const v = String(value || "").trim();
  const url = new URL(window.location.href);
  if (v) {
    url.searchParams.set("search", v);
    url.searchParams.delete("genre");
    url.searchParams.delete("flag");
  } else {
    url.searchParams.delete("search");
  }
  window.history.replaceState({}, "", url.toString());
  loadGenrePage(allFirestoreBooks);
}, 500);

/* ========== INIT ========== */
persistNavigationFilter();
if (searchInput && isGenrePage) {
  const currentSearch = getSearchFromURL();
  if (currentSearch) searchInput.value = currentSearch;
  searchInput.addEventListener("input", e => {
    if (allFirestoreBooks.length) {
      const v = String(e.target.value || "").trim();
      showGenreTransitionSkeleton(v ? "Searching books..." : "Loading books...");
    }
    onGenreSearchInput(e.target.value);
  });
}
loadAllBooks();
