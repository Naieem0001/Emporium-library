/* =====================================================================
 * Emporium Library - checkout modal (UPI + Bank Transfer)
 * Usage: openCheckout({ id, title, author, cover, price })
 * Exposes: window.EmporiumCheckout.openCheckout(book)
 * ===================================================================== */
(function () {
  "use strict";

  const API_BASE = String(
    window.EMPORIUM_ACADEMIC_API || "https://emporium-academic-api.onrender.com"
  ).replace(/\/$/, "");

  const LS_KEY_ORDERS = "emporium_orders";
  const LS_KEY_EMAIL  = "emporium_email";

  let cachedConfig = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtPrice(n) {
    const v = Number(n) || 0;
    return "\u20B9" + v.toLocaleString("en-IN");
  }

  function saveLocalOrder(book, accessCode, email) {
    try {
      const list = JSON.parse(localStorage.getItem(LS_KEY_ORDERS) || "[]");
      list.unshift({
        bookId: book.id,
        bookTitle: book.title,
        bookCover: book.cover || "",
        bookPrice: Number(book.price) || 0,
        accessCode,
        email,
        createdAt: Date.now()
      });
      localStorage.setItem(LS_KEY_ORDERS, JSON.stringify(list.slice(0, 50)));
      if (email) localStorage.setItem(LS_KEY_EMAIL, email);
    } catch (e) { /* non-critical */ }
  }

  async function fetchPaymentConfig() {
    if (cachedConfig) return cachedConfig;
    const r = await fetch(API_BASE + "/api/payment-config");
    if (!r.ok) throw new Error("Could not load payment details");
    cachedConfig = await r.json();
    return cachedConfig;
  }

  function buildUpiUri(cfg, book) {
    const params = new URLSearchParams();
    params.set("pa", cfg.upiId || "");
    if (cfg.upiPayeeName) params.set("pn", cfg.upiPayeeName);
    params.set("am", String(Number(book.price) || 0));
    params.set("cu", "INR");
    const tn = "Emporium " + String(book.title || "").slice(0, 50);
    params.set("tn", tn);
    return "upi://pay?" + params.toString();
  }

  function copyToClipboard(text, btn) {
    if (!text) return;
    navigator.clipboard
      ? navigator.clipboard.writeText(String(text))
          .then(() => flashCopied(btn))
          .catch(() => legacyCopy(text, btn))
      : legacyCopy(text, btn);
  }

  function legacyCopy(text, btn) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); flashCopied(btn); } catch (e) {}
    ta.remove();
  }

  function flashCopied(btn) {
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
    btn.classList.add("pm-copied");
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove("pm-copied");
    }, 1400);
  }

  async function downloadQrImage(url) {
    if (!url) return;
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const extFromType = (blob.type || "").split("/")[1] || "png";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `emporium-upi-qr.${extFromType.replace(/[^a-z0-9]/gi, "") || "png"}`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    } catch (_err) {
      // Fallback when remote host blocks CORS: open the image in a new tab.
      window.open(url, "_blank", "noopener");
    }
  }

  function closeModal() {
    const el = document.getElementById("pmOverlay");
    if (el) el.remove();
    document.body.style.overflow = "";
  }

  function ensureFontAwesome() {
    if (document.querySelector('link[href*="font-awesome"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
    document.head.appendChild(l);
  }

  function openCheckout(book) {
    if (!book || !book.id || !(Number(book.price) > 0)) return;
    ensureFontAwesome();
    closeModal();
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "pm-overlay";
    overlay.id = "pmOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = renderShell(book, { phase: "loading" });
    document.body.appendChild(overlay);

    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeModal();
    });
    const closeBtn = overlay.querySelector(".pm-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    fetchPaymentConfig()
      .then(cfg => renderPay(book, cfg))
      .catch(err => {
        const panel = overlay.querySelector(".pm-panel");
        if (panel) panel.innerHTML = `
          <div class="pm-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>${esc(err.message || "Could not load payment details")}</p>
          </div>`;
      });
  }

  function renderShell(book, state) {
    const cover = esc(book.cover || "");
    const title = esc(book.title || "");
    const author = esc(book.author || "");
    const price  = fmtPrice(book.price);
    return `
      <div class="pm-card">
        <button type="button" class="pm-close" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <aside class="pm-summary">
          <div class="pm-cover-wrap">
            <img class="pm-cover" src="${cover}" alt="${title}"
                 onerror="this.style.display='none'" />
          </div>
          <span class="pm-eyebrow">New Release</span>
          <h3 class="pm-title">${title}</h3>
          <p class="pm-author">by ${author}</p>
          <div class="pm-price-badge">
            <span>Price</span>
            <strong>${price}</strong>
          </div>
          <ul class="pm-trust">
            <li><i class="fa-solid fa-lock"></i> Secure direct payment</li>
            <li><i class="fa-solid fa-bolt"></i> Usually verified within 4 hrs</li>
            <li><i class="fa-solid fa-rotate"></i> Access from any device</li>
          </ul>
        </aside>
        <section class="pm-panel">
          ${state.phase === "loading"
            ? '<div class="pm-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading payment details&hellip;</div>'
            : ""}
        </section>
      </div>`;
  }

  function renderPay(book, cfg) {
    const panel = document.querySelector("#pmOverlay .pm-panel");
    if (!panel) return;
    panel.innerHTML = `
      <header class="pm-head">
        <h4>Pay <span>${fmtPrice(book.price)}</span></h4>
        <p>Pay using either option below, then submit your payment screenshot to unlock.</p>
        <p class="pm-ref-shortcut">
          Already paid?
          <button type="button" class="pm-link-btn pm-paid-btn-inline">Submit reference</button>
        </p>
      </header>

      <div class="pm-tabs" role="tablist">
        <button type="button" class="pm-tab pm-tab-upi active" data-tab="upi" role="tab">
          <i class="fa-solid fa-mobile-screen-button"></i> UPI
        </button>
        <button type="button" class="pm-tab pm-tab-bank" data-tab="bank" role="tab">
          <i class="fa-solid fa-building-columns"></i> Bank Transfer
        </button>
      </div>

      <div class="pm-pane pm-pane-upi active">
        ${renderUpiPane(cfg, book)}
      </div>
      <div class="pm-pane pm-pane-bank">
        ${renderBankPane(cfg)}
      </div>

      <footer class="pm-foot">
        <button type="button" class="pm-primary pm-paid-btn">
          <i class="fa-solid fa-circle-check"></i> I've paid &mdash; submit reference
        </button>
      </footer>`;

    // Tabs
    panel.querySelectorAll(".pm-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".pm-tab").forEach(b => b.classList.remove("active"));
        panel.querySelectorAll(".pm-pane").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const name = btn.dataset.tab;
        panel.querySelector(".pm-pane-" + name).classList.add("active");
      });
    });

    // Copy buttons
    panel.querySelectorAll(".pm-copy").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy || "", btn));
    });

    panel.querySelectorAll(".pm-qr-download").forEach(btn => {
      btn.addEventListener("click", () => downloadQrImage(btn.dataset.url || ""));
    });

    // Deep-link UPI buttons (fall back to copy on desktop)
    panel.querySelectorAll(".pm-upi-app").forEach(btn => {
      btn.addEventListener("click", () => {
        const uri = buildUpiUri(cfg, book);
        if (!cfg.upiId) return;
        // On mobile this opens the UPI app chooser / named app.
        // On desktop it no-ops, so we also copy the id as a convenience.
        copyToClipboard(cfg.upiId, null);
        window.location.href = uri;
      });
    });

    // "I've paid" -> form
    panel.querySelectorAll(".pm-paid-btn, .pm-paid-btn-inline").forEach(btn => {
      btn.addEventListener("click", () => renderForm(book, cfg));
    });
  }

  function renderUpiPane(cfg, book) {
    const hasUpi = !!cfg.upiId;
    const hasQr  = !!cfg.upiQrUrl;
    if (!hasUpi && !hasQr) {
      return `<div class="pm-empty">
        <i class="fa-solid fa-circle-info"></i>
        UPI details not set up yet. Please use the Bank tab.
      </div>`;
    }
    return `
      <div class="pm-upi-grid">
        <div class="pm-qr-wrap">
          ${hasQr
            ? `<img class="pm-qr" src="${esc(cfg.upiQrUrl)}" alt="UPI QR code" />
               <button type="button" class="pm-copy pm-qr-download" data-url="${esc(cfg.upiQrUrl)}">
                 <i class="fa-solid fa-download"></i> Download QR
               </button>`
            : `<div class="pm-qr-placeholder"><i class="fa-solid fa-qrcode"></i><span>Scan with any UPI app</span></div>`}
        </div>
        <div class="pm-upi-right">
          ${hasUpi ? `
            <label class="pm-field-label">UPI ID</label>
            <div class="pm-copy-row">
              <span class="pm-copy-value">${esc(cfg.upiId)}</span>
              <button type="button" class="pm-copy" data-copy="${esc(cfg.upiId)}">
                <i class="fa-regular fa-copy"></i> Copy
              </button>
            </div>
            ${cfg.upiPayeeName ? `
              <label class="pm-field-label">Payee</label>
              <div class="pm-plain">${esc(cfg.upiPayeeName)}</div>` : ""}
            <label class="pm-field-label">Amount</label>
            <div class="pm-plain pm-amount">${fmtPrice(book.price)}</div>
            <div class="pm-upi-apps">
              <button type="button" class="pm-upi-app"><i class="fa-brands fa-google-pay"></i> GPay</button>
              <button type="button" class="pm-upi-app"><i class="fa-solid fa-mobile-screen"></i> PhonePe</button>
              <button type="button" class="pm-upi-app"><i class="fa-solid fa-wallet"></i> Paytm</button>
            </div>
            <p class="pm-hint">On mobile, tap an app to open it pre-filled. On desktop, copy the UPI id and pay from your phone.</p>
          ` : `<div class="pm-empty-inline">UPI id not set yet. Use the QR or switch to Bank tab.</div>`}
        </div>
      </div>`;
  }

  function renderBankPane(cfg) {
    const rows = [
      { label: "Account Holder", value: cfg.accountName },
      { label: "Bank",           value: cfg.bankName },
      { label: "Account Number", value: cfg.accountNumber },
      { label: "IFSC",           value: cfg.ifsc },
      { label: "Branch",         value: cfg.branch }
    ].filter(r => r.value);
    if (rows.length === 0) {
      return `<div class="pm-empty">
        <i class="fa-solid fa-circle-info"></i>
        Bank details not set up yet. Please use the UPI tab.
      </div>`;
    }
    return `
      <div class="pm-bank-list">
        ${rows.map(r => `
          <div class="pm-copy-row">
            <div class="pm-bank-field">
              <span class="pm-field-label">${esc(r.label)}</span>
              <span class="pm-copy-value">${esc(r.value)}</span>
            </div>
            <button type="button" class="pm-copy" data-copy="${esc(r.value)}">
              <i class="fa-regular fa-copy"></i> Copy
            </button>
          </div>`).join("")}
      </div>
      <p class="pm-hint">
        Transfer exactly the book price via IMPS / NEFT. Save the UTR number shown by your bank.
      </p>`;
  }

  function renderForm(book, _cfg) {
    const panel = document.querySelector("#pmOverlay .pm-panel");
    if (!panel) return;
    const rememberedEmail = (() => {
      try { return localStorage.getItem(LS_KEY_EMAIL) || ""; } catch { return ""; }
    })();
    panel.innerHTML = `
      <header class="pm-head">
        <button type="button" class="pm-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
        <h4>Submit your reference</h4>
        <p>After you've paid, add your payment screenshot link. You'll get an access code immediately, and the download unlocks once verified.</p>
      </header>
      <form class="pm-form" id="pmForm" autocomplete="on">
        <label class="pm-field">
          <span>Email <i>*</i></span>
          <input type="email" name="email" required inputmode="email" autocomplete="email"
                 placeholder="you@example.com" value="${esc(rememberedEmail)}" />
        </label>
        <label class="pm-field">
          <span>Phone (optional)</span>
          <input type="tel" name="phone" inputmode="tel" autocomplete="tel"
                 placeholder="e.g. +91 98765 43210" maxlength="20" />
        </label>
        <label class="pm-field">
          <span>Paid via <i>*</i></span>
          <select name="method" required>
            <option value="upi">UPI</option>
            <option value="bank">Bank transfer (IMPS / NEFT)</option>
          </select>
        </label>
        <label class="pm-field">
          <span>Payment Screenshot URL <i>*</i></span>
          <input type="url" name="proofUrl" inputmode="url" required
                 placeholder="https://... (receipt image link)"
                 autocomplete="off" />
        </label>
        <div class="pm-form-error" id="pmFormError"></div>
        <button type="submit" class="pm-primary">
          <i class="fa-solid fa-paper-plane"></i> Confirm &amp; get access code
        </button>
      </form>`;

    panel.querySelector(".pm-back").addEventListener("click", () => {
      fetchPaymentConfig().then(cfg => renderPay(book, cfg));
    });

    panel.querySelector("#pmForm").addEventListener("submit", async ev => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const err = panel.querySelector("#pmFormError");
      err.textContent = "";
      const data = {
        bookId: book.id,
        email: form.email.value.trim().toLowerCase(),
        phone: form.phone.value.trim(),
        method: form.method.value,
        screenshotUrl: form.proofUrl.value.trim()
      };
      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting&hellip;';
      try {
        const r = await fetch(API_BASE + "/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 409 && body.accessCode) {
            saveLocalOrder(book, body.accessCode, data.email);
            renderSuccess(book, body.accessCode, data.email, true);
            return;
          }
          throw new Error(body.error || "Could not create order");
        }
        saveLocalOrder(book, body.accessCode, data.email);
        renderSuccess(book, body.accessCode, data.email, false);
      } catch (e) {
        err.textContent = e.message || "Something went wrong";
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Confirm & get access code';
      }
    });
  }

  function renderSuccess(book, accessCode, email, duplicate) {
    const panel = document.querySelector("#pmOverlay .pm-panel");
    if (!panel) return;
    panel.innerHTML = `
      <div class="pm-success">
        <div class="pm-success-icon"><i class="fa-solid fa-circle-check"></i></div>
        <h4>${duplicate ? "Already on file!" : "Order received"}</h4>
        <p>${duplicate
          ? "This UTR was already submitted for this book. Here's the access code again."
          : "We've saved your reference. You'll be able to download the book once the payment is verified &mdash; usually within a few hours."}</p>
        <label class="pm-field-label">Your access code</label>
        <div class="pm-access-row">
          <span class="pm-access-code" id="pmAccessCode">${esc(accessCode)}</span>
          <button type="button" class="pm-copy" data-copy="${esc(accessCode)}">
            <i class="fa-regular fa-copy"></i> Copy
          </button>
        </div>
        <p class="pm-hint"><strong>Save this code.</strong> Pair it with <em>${esc(email)}</em> on the My Purchases page to download the book once approved.</p>
        <div class="pm-success-cta">
          <a class="pm-primary" href="my-purchases.html">
            <i class="fa-solid fa-arrow-right"></i> Open My Purchases
          </a>
          <button type="button" class="pm-ghost pm-close-inline">Close</button>
        </div>
      </div>`;
    panel.querySelectorAll(".pm-copy").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy || "", btn));
    });
    const closeInline = panel.querySelector(".pm-close-inline");
    if (closeInline) closeInline.addEventListener("click", closeModal);
  }

  window.EmporiumCheckout = {
    openCheckout,
    closeCheckout: closeModal
  };
})();
