 const hamburger = document.getElementById("hamburger");
const navMenu = document.getElementById("navMenu");

let currentPage = 1;
const booksPerPage = 10;

/* ================= NAVIGATION ================= */
if (hamburger && navMenu) {
    hamburger.addEventListener("click", (e) => {
        e.stopPropagation();
        navMenu.classList.toggle("active");
    });

    document.querySelectorAll("#navMenu a").forEach(link => {
        link.addEventListener("click", () => {
            navMenu.classList.remove("active");
        });
    });

    document.addEventListener("click", (e) => {
        if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
            navMenu.classList.remove("active");
        }
    });

    window.addEventListener("scroll", () => {
        navMenu.classList.remove("active");
    });
}

/* ================= BOOK DISPLAY ================= */
function displayBooks(bookList) {
    const container = document.getElementById("libraryGrid");
    const pagination = document.getElementById("pagination");

    if (!container) return;

    container.innerHTML = "";

    let start = (currentPage - 1) * booksPerPage;
    let end = start + booksPerPage;

    let paginatedBooks = bookList.slice(start, end);

    paginatedBooks.forEach(book => {
        container.innerHTML += `
        <div class="book-card">
            <div class="book-cover">
                <img src="${book.cover}" alt="${escapeHTML(book.title)}">
            </div>
            <div class="book-info">
                <h3>${escapeHTML(book.title)}</h3>
                <p class="author">${escapeHTML(book.author)}</p>
                <a href="${book.file}" class="download-btn">
                    <i class="fa-solid fa-download"></i> Download
                </a>
            </div>
        </div>
        `;
    });

    if (pagination) {
        setupPagination(bookList, pagination);
    }
}

function setupPagination(bookList, container) {
    container.innerHTML = "";

    let pageCount = Math.ceil(bookList.length / booksPerPage);

    for (let i = 1; i <= pageCount; i++) {
        let btn = document.createElement("button");
        btn.innerText = i;

        if (i === currentPage) {
            btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
            currentPage = i;
            displayBooks(bookList);
        });

        container.appendChild(btn);
    }
}

/* ================= SEARCH SYSTEM ================= */
document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    searchInput.addEventListener("keyup", function (e) {
        let searchValue = searchInput.value.trim();
        if (e.key === "Enter" && searchValue !== "") {
            window.location.href = "genre.html?search=" + encodeURIComponent(searchValue);
        }
    });
});

/* ================= TRENDING BOOKS ================= */
function displayTrendingBooks(){

const trendingContainer = document.getElementById("trendingBooks");

if(!trendingContainer || !Array.isArray(books)) return;

trendingContainer.innerHTML = "";

const trendingBooks = books.filter(book => book.trending === true);

trendingBooks.forEach(book => {

trendingContainer.innerHTML += `
<div class="book-card">
<div class="book-cover">
<img src="${book.cover}" alt="${escapeHTML(book.title)}">
</div>
<div class="book-info">
<h3>${escapeHTML(book.title)}</h3>
<p class="author">${escapeHTML(book.author)}</p>
<a href="${book.file}" class="download-btn">
<i class="fa-solid fa-download"></i> Download
</a>
</div>
</div>
`;

});

}
displayTrendingBooks();
/* ================= GENRE & SEARCH PAGE FILTER ================= */
function getGenreFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("genre");
}

function getSearchFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("search");
}

const genre = getGenreFromURL();
const searchQuery = getSearchFromURL();

const genreTitle = document.getElementById("genreTitle");
const genreCount = document.getElementById("genreCount");

let filteredBooks = books;

if (searchQuery) {
    currentPage = 1;
    filteredBooks = books.filter(book =>
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase())
    );
} else if (genre) {
    currentPage = 1;
    if (genre === "all") {
        filteredBooks = books;
    } else {
        filteredBooks = books.filter(book => book.genre === genre);
    }
}
currentPage = 1;
displayBooks(filteredBooks);

if (genreTitle && genre) {
    let formatted = genre.replace("-", " ");
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    genreTitle.textContent = formatted + " Books";
}

if (genreCount && genre) {
    genreCount.textContent = filteredBooks.length + " books available";
}

/* ================= HTML ESCAPE ================= */
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, function (m) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m];
    });
}   