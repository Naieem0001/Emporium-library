/* Emporium Library: in-browser reader. Exposes only window.EmporiumReader. */
(function () {
  "use strict";

  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  var EPUBJS = "https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js";

  function noop() {}
  function friendly(msg) { var e = new Error(msg); e.friendly = true; return e; }
  function apiBase() {
    if (typeof API_BASE !== "undefined" && API_BASE) return API_BASE; // defined in script.js
    return "https://emporium-academic-api.onrender.com";
  }

  /* ---------- 1. Can this book be read, and how? ---------- */
  function resolveSource(book) {
    if (!book) return null;
    var title = String(book.title || "");
    var source = String(book.externalSource || "").toLowerCase();

    // Own library book (Firestore): FREE + Drive-backed only
    if (!source) {
      var link = String(book.driveLink || "");
      if (!book.id || (Number(book.price) || 0) > 0 || !/drive\.google\.com/i.test(link)) return null;
      return {
        kind: "file", allowText: false, title: title,
        url: apiBase() + "/api/read/" + encodeURIComponent(book.id),
        fallbackUrl: typeof toDirectDownloadUrl === "function" ? toDirectDownloadUrl(link) : link
      };
    }

    var ext = String(book.externalUrl || book.driveLink || "");

    if (source === "gutenberg") {
      if (!/^https:\/\/([\w-]+\.)*gutenberg\.org\//i.test(ext)) return null;
      return {
        kind: "file", allowText: true, title: title,
        url: apiBase() + "/api/read-external?url=" + encodeURIComponent(ext),
        fallbackUrl: ext
      };
    }
    if (source === "google") {
      var gid = String(book.id || "").replace(/^google_/, "");
      if (!gid) return null;
      return {
        kind: "embed", title: title,
        url: "https://books.google.com/books?id=" + encodeURIComponent(gid) + "&output=embed",
        fallbackUrl: ext
      };
    }
    if (source === "openlibrary") {
      var m = ext.match(/archive\.org\/download\/([^/]+)\//i); // identifier is already URL-encoded by the server
      if (!m) return null;
      return { kind: "embed", title: title, url: "https://archive.org/embed/" + m[1], fallbackUrl: ext };
    }
    return null;
  }

  function findBook(id) {
    if (!id) return null;
    try {
      if (typeof bookCache !== "undefined" && bookCache.get(id)) return bookCache.get(id);
    } catch (e) {}
    var all = window.allFirestoreBooks || [];
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---------- 2. Helpers ---------- */
  var scriptCache = {};
  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { delete scriptCache[src]; reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  function fetchBuffer(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw friendly(j && j.error ? j.error : "The file could not be loaded.");
        });
      }
      return r.arrayBuffer();
    });
  }

  function clearStatus(box) {
    var s = box.querySelector(".eml-reader-status");
    if (s) s.remove();
  }

  /* ---------- 3. Adapters ---------- */
  async function pdfAdapter(box, buf, ui) {
    await loadScript(PDFJS);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    clearStatus(box);
    var canvas = document.createElement("canvas");
    canvas.className = "eml-reader-canvas";
    box.appendChild(canvas);

    var n = 1;
    var chain = Promise.resolve();
    async function show() {
      var page = await pdf.getPage(n);
      var base = page.getViewport({ scale: 1 });
      var fit = Math.min((box.clientWidth - 16) / base.width, 1.6);
      var dpr = window.devicePixelRatio || 1;
      var vp = page.getViewport({ scale: fit * dpr });
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.width = Math.floor(vp.width / dpr) + "px";
      canvas.style.height = Math.floor(vp.height / dpr) + "px";
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      box.scrollTop = 0;
      ui.setInfo(n + " / " + pdf.numPages);
    }
    function go(d) {
      var t = n + d;
      if (t < 1 || t > pdf.numPages) return;
      n = t;
      chain = chain.then(show).catch(noop);
    }
    await show();
    return { next: function () { go(1); }, prev: function () { go(-1); }, destroy: function () { try { pdf.destroy(); } catch (e) {} } };
  }

  async function epubAdapter(box, buf, ui) {
    await loadScript(JSZIP);
    await loadScript(EPUBJS);
    clearStatus(box);
    box.style.overflow = "hidden";
    var book = window.ePub();
    await book.open(buf, "binary");
    var rendition = book.renderTo(box, { width: "100%", height: "100%", flow: "paginated", spread: "auto" });
    await rendition.display();
    rendition.on("keyup", function (e) {
      if (e.key === "ArrowRight") rendition.next();
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "Escape") ui.close();
    });
    return {
      next: function () { rendition.next(); },
      prev: function () { rendition.prev(); },
      destroy: function () { try { book.destroy(); } catch (e) {} }
    };
  }

  async function textAdapter(box, buf) {
    clearStatus(box);
    var div = document.createElement("div");
    div.className = "eml-reader-text";
    div.textContent = new TextDecoder("utf-8").decode(buf);
    box.appendChild(div);
    return {
      next: function () { box.scrollBy({ top: box.clientHeight * 0.9, behavior: "smooth" }); },
      prev: function () { box.scrollBy({ top: -box.clientHeight * 0.9, behavior: "smooth" }); },
      destroy: noop
    };
  }

  // Downloads bytes, then picks PDF / EPUB / text by looking at the first bytes.
  async function fileAdapter(box, src, ui) {
    var buf = await fetchBuffer(src.url);
    var h = new Uint8Array(buf.slice(0, 4));
    if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return pdfAdapter(box, buf, ui); // %PDF
    if (h[0] === 0x50 && h[1] === 0x4b) return epubAdapter(box, buf, ui);                                    // PK (zip)
    if (src.allowText) return textAdapter(box, buf);
    throw friendly("This file type can't be opened in the reader. Please download it instead.");
  }

  async function embedAdapter(box, src) {
    clearStatus(box);
    var f = document.createElement("iframe");
    f.className = "eml-reader-iframe";
    f.src = src.url;
    f.title = src.title || "Book";
    f.setAttribute("allowfullscreen", "");
    box.appendChild(f);
    return { next: noop, prev: noop, destroy: function () { f.remove(); } };
  }

  /* ---------- 4. Overlay shell ---------- */
  function showError(view, src, err) {
    view.innerHTML = "";
    var p = document.createElement("p");
    p.className = "eml-reader-status";
    p.textContent = err && err.friendly ? err.message : "Sorry, this book couldn't be opened here.";
    view.appendChild(p);
    if (src.fallbackUrl && /^https?:\/\//i.test(src.fallbackUrl)) {
      var a = document.createElement("a");
      a.className = "eml-reader-fallback";
      a.href = src.fallbackUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open or download the original";
      view.appendChild(a);
    }
  }

  function openOverlay(src, trigger) {
    if (document.querySelector(".eml-reader-overlay")) return;
    var prevOverflow = document.body.style.overflow;

    var ov = document.createElement("div");
    ov.className = "eml-reader-overlay" + (src.kind === "embed" ? " eml-reader--embed" : "");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Book reader");
    ov.innerHTML =
      '<div class="eml-reader-bar">' +
        '<button type="button" class="eml-reader-close" aria-label="Close reader">\u2715</button>' +
        '<span class="eml-reader-title"></span>' +
        '<span class="eml-reader-info"></span>' +
        '<button type="button" class="eml-reader-prev" aria-label="Previous page">\u2039</button>' +
        '<button type="button" class="eml-reader-next" aria-label="Next page">\u203A</button>' +
      "</div>" +
      '<div class="eml-reader-view"><p class="eml-reader-status">Opening book\u2026</p></div>';
    ov.querySelector(".eml-reader-title").textContent = src.title;
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";

    var view = ov.querySelector(".eml-reader-view");
    var info = ov.querySelector(".eml-reader-info");
    var closed = false;
    var ctl = { next: noop, prev: noop, destroy: noop };
    var ui = { setInfo: function (t) { info.textContent = t || ""; }, close: close };

    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(wake);
      try { ctl.destroy(); } catch (e) {}
      ov.remove();
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      if (trigger && trigger.focus) { try { trigger.focus(); } catch (e) {} }
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") ctl.next();
      else if (e.key === "ArrowLeft") ctl.prev();
    }
    document.addEventListener("keydown", onKey);
    ov.querySelector(".eml-reader-close").onclick = close;
    ov.querySelector(".eml-reader-next").onclick = function () { ctl.next(); };
    ov.querySelector(".eml-reader-prev").onclick = function () { ctl.prev(); };
    ov.querySelector(".eml-reader-close").focus();

    // Render's free tier can be asleep; tell the reader why it's slow
    var wake = setTimeout(function () {
      var s = view.querySelector(".eml-reader-status");
      if (s) s.textContent = "Waking up the server\u2026 this can take a few seconds.";
    }, 7000);

    var runner = src.kind === "embed" ? embedAdapter(view, src) : fileAdapter(view, src, ui);
    Promise.resolve(runner)
      .then(function (c) {
        clearTimeout(wake);
        if (closed) { try { c.destroy(); } catch (e) {} return; }
        ctl = c;
      })
      .catch(function (err) {
        clearTimeout(wake);
        if (closed) return;
        console.error("[reader]", err);
        showError(view, src, err);
      });
  }

  /* ---------- 5. Public API ---------- */
  window.EmporiumReader = {
    canRead: function (book) {
      try { return !!resolveSource(book); } catch (e) { return false; }
    },
    open: function (book, trigger) {
      var s = null;
      try { s = resolveSource(book); } catch (e) {}
      if (s) openOverlay(s, trigger);
    },
    openFromButton: function (btn) {
      var book = findBook(btn && btn.getAttribute("data-read-id"));
      if (book) window.EmporiumReader.open(book, btn);
    }
  };
})();