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

/* ========== RENDER BOOK CARD ========== */
function renderCard(book) {
  return `
    <div class="book-card">
      <div class="book-cover">
        <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}"
             onerror="this.src='https://via.placeholder.com/150x220?text=No+Cover'" />
      </div>
      <div class="book-info">
        <h3>${escapeHTML(book.title)}</h3>
        <p class="author">${escapeHTML(book.author)}</p>
        <a href="${escapeHTML(book.driveLink)}" target="_blank" class="download-btn">
          <i class="fa-solid fa-download"></i> Download
        </a>
      </div>
    </div>`;
}

/* ========== DISPLAY TRENDING ========== */
function displayTrendingBooks(books) {
  const container = document.getElementById("trendingBooks");
  if (!container) return;
  const trending = books.filter(b => b.trending === true).slice(0, 6);
  container.innerHTML = trending.length
    ? trending.map(renderCard).join("")
    : `<p style="text-align:center;color:#6B7280">No trending books yet.</p>`;
}

/* ========== DISPLAY NEW RELEASES ========== */
function displayNewReleases(books) {
  const container = document.getElementById("newReleasesBooks");
  if (!container) return;
  const newReleases = books.filter(b => b.newRelease === true).slice(0, 4);
  container.innerHTML = newReleases.length
    ? newReleases.map(renderCard).join("")
    : `<p style="text-align:center;color:#6B7280">No new releases yet.</p>`;
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
    : `<p style="text-align:center;color:#6B7280;grid-column:1/-1">No books found.</p>`;

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
  return new URLSearchParams(window.location.search).get("genre");
}

function getSearchFromURL() {
  return new URLSearchParams(window.location.search).get("search");
}

function loadGenrePage(books) {
  const genre  = getGenreFromURL();
  const search = getSearchFromURL();
  const title  = document.getElementById("genreTitle");
  const count  = document.getElementById("genreCount");

  let filtered = books;

  if (search) {
    const q = search.toLowerCase();
    filtered = books.filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.genre.toLowerCase().includes(q)
    );
    if (title) title.textContent = `Search: "${search}"`;
  } else if (genre && genre !== "all") {
    filtered = books.filter(b => b.genre === genre);
    if (title) title.textContent = genre.charAt(0).toUpperCase() + genre.slice(1).replace("-", " & ");
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
    if (grid) grid.innerHTML = `<p style="text-align:center;color:#DC2626;grid-column:1/-1">Failed to load books. Please refresh.</p>`;
  });
}

/* ========== INIT ========== */
loadAllBooks();