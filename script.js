/* ========== FIREBASE INIT ========== */
const firebaseConfig = {
  apiKey: "AIzaSyDCQag_jLEkTVp-DEE2iqk1Pj5ZmjTesXE",
  authDomain: "emporium-library.firebaseapp.com",
  projectId: "emporium-library",
  storageBucket: "emporium-library.firebasestorage.app",
  messagingSenderId: "243007325031",
  appId: "1:243007325031:web:efc7981d8933e7ca3c65c2"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
    .replace(/"/g, "&quot;");
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
      if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
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

/* ========== RENDER BOOK CARD ========== */
function renderCard(book) {
  const downloadLink = toDirectDownloadUrl(book.driveLink);
  return `
    <div class="book-card">
      <div class="book-cover">
        <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}"
             onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'" />
      </div>
      <div class="book-info">
        <h3>${escapeHTML(book.title)}</h3>
        <p class="author">${escapeHTML(book.author)}</p>
        <a href="${escapeHTML(downloadLink)}" rel="noopener noreferrer" class="download-btn" download>
          <i class="fa-solid fa-download"></i> Download
        </a>
      </div>
    </div>`;
}

/* ========== DISPLAY TRENDING ========== */
function displayTrendingBooks(books) {
  const container = document.getElementById("trendingBooks");
  if (!container) return;
  const trending = books.filter(b => isTruthy(b.trending)).slice(0, 6);
  container.innerHTML = trending.length
    ? trending.map(renderCard).join("")
    : `<p class="state-message">No trending books yet.</p>`;
}

/* ========== DISPLAY NEW RELEASES ========== */
function displayNewReleases(books) {
  const container = document.getElementById("newReleasesBooks");
  if (!container) return;
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
  const start = (currentPage - 1) * booksPerPage;
  const end   = start + booksPerPage;
  const page  = currentBooks.slice(start, end);

  grid.innerHTML = page.length
    ? page.map(renderCard).join("")
    : `<p class="state-message">No books found.</p>`;

  setupPagination();
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

  let filtered = books;

  if (search) {
    const q = normalizeText(search);
    filtered = books.filter(b =>
      normalizeText(b.title).includes(q) ||
      normalizeText(b.author).includes(q) ||
      normalizeGenre(b.genre).includes(q)
    );
    if (title) title.textContent = `Search: "${search}"`;
  } else if (flag === "trending") {
    filtered = books.filter(b => isTruthy(b.trending));
    if (title) title.textContent = "All Trending Books";
  } else if (flag === "new") {
    filtered = books.filter(b => isTruthy(b.newRelease));
    if (title) title.textContent = "All New Releases";
  } else if (genreParam !== null && genreParam !== "") {
    const genre = normalizeGenre(genreParam);
    if (genre && genre !== "all") {
      filtered = books.filter(b => normalizeGenre(b.genre) === genre);
      if (title) title.textContent = genre
      .split("-")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    } else {
      if (title) title.textContent = "All Books";
    }
  } else {
    if (title) title.textContent = "All Books";
  }

  if (count) count.textContent = `${filtered.length} book${filtered.length !== 1 ? "s" : ""} available`;
  displayBooks(filtered);
}

/* ========== LOAD ALL BOOKS FROM FIREBASE ========== */
function loadAllBooks() {
  db.collection("books").orderBy("createdAt", "desc").get().then(snapshot => {
    const books = [];
    snapshot.forEach(doc => books.push({ id: doc.id, ...doc.data() }));

    /* homepage */
    displayTrendingBooks(books);
    displayNewReleases(books);

    /* genre page */
    if (document.getElementById("libraryGrid")) {
      loadGenrePage(books);
    }

  }).catch(err => {
    console.error("Failed to load books:", err);
    const grid = document.getElementById("libraryGrid");
    if (grid) grid.innerHTML = `<p class="state-message">Failed to load books. Please refresh.</p>`;
  });
}

/* ========== INIT ========== */
persistNavigationFilter();
loadAllBooks();