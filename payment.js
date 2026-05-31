/* =====================================================================
 * Emporium Library — Razorpay Checkout (Auto-approval, Premium UI)
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

  /* ── Helpers ── */
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
      const exists = list.some(o =>
        String(o.bookId) === String(book.id) &&
        String(o.email || "").toLowerCase() === email
      );
      if (!exists) {
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
      }
      if (email) localStorage.setItem(LS_KEY_EMAIL, email);
    } catch (e) { /* non-critical */ }
  }

  /* ── Cashfree SDK Loader ── */
  function loadCashfreeScript() {
    return new Promise((resolve) => {
      if (window.Cashfree) return resolve(window.Cashfree);
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.onload = () => resolve(window.Cashfree);
      script.onerror = (e) => {
        console.error("Cashfree script load error:", e);
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  /* ── Modal helpers ── */
  function closeModal() {
    const el = document.getElementById("pmOverlay");
    if (el) {
      el.classList.add("pm-closing");
      setTimeout(() => { el.remove(); document.body.style.overflow = ""; }, 300);
    } else {
      document.body.style.overflow = "";
    }
  }

  function ensureFontAwesome() {
    if (document.querySelector('link[href*="font-awesome"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
    document.head.appendChild(l);
  }

  function injectStyles() {
    if (document.getElementById("pm-styles")) return;
    const style = document.createElement("style");
    style.id = "pm-styles";
    style.textContent = `
      /* ===== OVERLAY ===== */
      .pm-overlay {
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(10, 14, 26, 0.75);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 16px;
        animation: pmFadeIn 0.25s ease;
      }
      .pm-overlay.pm-closing { animation: pmFadeOut 0.3s ease forwards; }
      @keyframes pmFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pmFadeOut { from { opacity: 1; } to { opacity: 0; } }

      /* ===== CARD ===== */
      .pm-card {
        background: #fff;
        border-radius: 24px;
        width: 100%; max-width: 520px;
        box-shadow: 0 40px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1);
        position: relative;
        overflow: hidden;
        animation: pmSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: 'Poppins', sans-serif;
      }
      @keyframes pmSlideUp {
        from { opacity: 0; transform: translateY(32px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)     scale(1); }
      }

      /* ===== TOP GRADIENT HEADER ===== */
      .pm-header {
        background: linear-gradient(135deg, #1B2A41 0%, #243B55 60%, #1a3a5c 100%);
        padding: 28px 28px 24px;
        position: relative;
        overflow: hidden;
      }
      .pm-header::before {
        content: '';
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 300px 160px at 110% 50%, rgba(255,122,24,0.28), transparent),
          radial-gradient(ellipse 200px 200px at -10% 80%, rgba(255,179,71,0.18), transparent);
        pointer-events: none;
      }
      .pm-header-inner { position: relative; z-index: 1; display: flex; gap: 16px; align-items: flex-start; }

      .pm-close {
        position: absolute; top: 16px; right: 16px; z-index: 10;
        width: 36px; height: 36px;
        background: rgba(255,255,255,0.12); border: none; border-radius: 50%;
        color: rgba(255,255,255,0.8); font-size: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s, color 0.2s, transform 0.2s;
        backdrop-filter: blur(4px);
      }
      .pm-close:hover { background: rgba(255,255,255,0.22); color: #fff; transform: scale(1.1); }

      .pm-cover {
        width: 70px; height: 96px; object-fit: cover;
        border-radius: 10px; flex-shrink: 0;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        border: 2px solid rgba(255,255,255,0.15);
      }
      .pm-cover-placeholder {
        width: 70px; height: 96px; border-radius: 10px; flex-shrink: 0;
        background: rgba(255,255,255,0.1);
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,0.4); font-size: 24px;
      }

      .pm-book-info { flex: 1; min-width: 0; }
      .pm-eyebrow {
        font-size: 10px; font-weight: 700; letter-spacing: 0.15em;
        text-transform: uppercase; color: #FF9F43;
        margin-bottom: 4px; display: block;
      }
      .pm-book-title {
        font-family: 'Playfair Display', serif;
        font-size: 1.15rem; font-weight: 700;
        color: #fff; margin: 0 0 4px;
        line-height: 1.3;
        overflow: hidden; text-overflow: ellipsis;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .pm-book-author { font-size: 12px; color: rgba(255,255,255,0.6); margin: 0 0 10px; }
      .pm-price-tag {
        display: inline-flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, #FF7A18, #FFB347);
        color: #1B2A41; font-size: 15px; font-weight: 800;
        padding: 5px 14px; border-radius: 999px;
        box-shadow: 0 4px 12px rgba(255,122,24,0.4);
        letter-spacing: 0.3px;
      }

      .pm-trust-row {
        display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap;
        position: relative; z-index: 1;
      }
      .pm-trust-item {
        display: flex; align-items: center; gap: 5px;
        font-size: 11px; color: rgba(255,255,255,0.65);
      }
      .pm-trust-item i { color: #FF9F43; font-size: 11px; }

      /* ===== BODY PANEL ===== */
      .pm-body { padding: 28px; }

      /* ===== LOADING ===== */
      .pm-loading {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 12px;
        padding: 40px 20px; text-align: center;
        color: #64748B; font-size: 14px;
      }
      .pm-spinner {
        width: 44px; height: 44px;
        border: 3px solid #F1F5F9;
        border-top-color: #FF7A18;
        border-radius: 50%;
        animation: pmSpin 0.8s linear infinite;
      }
      @keyframes pmSpin { to { transform: rotate(360deg); } }

      /* ===== EMAIL FORM ===== */
      .pm-section-label {
        font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
        text-transform: uppercase; color: #94A3B8; margin-bottom: 8px;
      }
      .pm-form-title {
        font-family: 'Playfair Display', serif;
        font-size: 1.35rem; color: #1B2A41; margin: 0 0 6px;
      }
      .pm-form-subtitle { font-size: 13px; color: #64748B; margin: 0 0 22px; line-height: 1.5; }

      .pm-input-wrap { position: relative; margin-bottom: 18px; }
      .pm-input-wrap i {
        position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
        color: #94A3B8; font-size: 14px; pointer-events: none;
      }
      .pm-input {
        width: 100%; padding: 13px 14px 13px 40px;
        border: 1.5px solid #E2E8F0; border-radius: 12px;
        font-family: 'Poppins', sans-serif; font-size: 14px; color: #1B2A41;
        outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        background: #F8FAFC;
      }
      .pm-input:focus {
        border-color: #FF7A18;
        box-shadow: 0 0 0 3px rgba(255,122,24,0.12);
        background: #fff;
      }
      .pm-input::placeholder { color: #CBD5E1; }

      /* ===== PAY BUTTON ===== */
      .pm-pay-btn {
        width: 100%; padding: 15px 24px;
        background: linear-gradient(135deg, #1B2A41 0%, #243B55 100%);
        color: #fff; border: none; border-radius: 14px;
        font-family: 'Poppins', sans-serif;
        font-size: 15px; font-weight: 700;
        cursor: pointer; letter-spacing: 0.3px;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
        box-shadow: 0 10px 28px rgba(27,42,65,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        position: relative; overflow: hidden;
      }
      .pm-pay-btn::before {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(135deg, rgba(255,122,24,0.15), transparent);
        opacity: 0; transition: opacity 0.2s;
      }
      .pm-pay-btn:hover::before { opacity: 1; }
      .pm-pay-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(27,42,65,0.35), inset 0 1px 0 rgba(255,255,255,0.1); }
      .pm-pay-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }

      .pm-razorpay-logo {
        display: flex; align-items: center; gap: 5px;
        font-size: 11px; color: rgba(255,255,255,0.55); font-weight: 500;
        margin-top: 12px; justify-content: center;
      }
      .pm-razorpay-logo span { color: rgba(255,255,255,0.7); }

      /* ===== PAYMENT METHODS ROW ===== */
      .pm-methods {
        display: flex; gap: 8px; align-items: center; justify-content: center;
        margin-top: 14px; flex-wrap: wrap;
      }
      .pm-method-chip {
        display: inline-flex; align-items: center; gap: 5px;
        background: #F8FAFC; border: 1px solid #E2E8F0;
        border-radius: 999px; padding: 5px 12px;
        font-size: 11px; font-weight: 600; color: #475569;
      }
      .pm-method-chip i { font-size: 11px; color: #FF7A18; }

      /* ===== ERROR ===== */
      .pm-error-msg {
        background: #FEF2F2; border: 1px solid #FECACA;
        color: #991B1B; border-radius: 10px;
        padding: 10px 14px; font-size: 13px;
        display: none; margin-bottom: 16px;
        line-height: 1.45;
        align-items: flex-start; gap: 8px;
      }
      .pm-error-msg.visible { display: flex; }
      .pm-error-msg i { margin-top: 1px; flex-shrink: 0; }

      /* ===== PROCESSING ===== */
      .pm-processing {
        text-align: center; padding: 32px 20px;
      }
      .pm-processing-ring {
        width: 72px; height: 72px; margin: 0 auto 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #FF7A18, #FFB347);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 8px 24px rgba(255,122,24,0.35);
        animation: pmPulse 1.5s ease infinite;
      }
      @keyframes pmPulse {
        0%, 100% { box-shadow: 0 8px 24px rgba(255,122,24,0.35); }
        50% { box-shadow: 0 8px 40px rgba(255,122,24,0.55); }
      }
      .pm-processing-ring i { font-size: 28px; color: #fff; }
      .pm-processing h4 { font-size: 1.1rem; color: #1B2A41; margin: 0 0 6px; }
      .pm-processing p { font-size: 13px; color: #64748B; margin: 0; }

      /* ===== SUCCESS ===== */
      .pm-success { padding: 8px 0; text-align: center; }
      .pm-success-icon {
        width: 80px; height: 80px; margin: 0 auto 16px;
        background: linear-gradient(135deg, #10B981, #059669);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 12px 32px rgba(16,185,129,0.35);
        animation: pmBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes pmBounceIn {
        from { opacity: 0; transform: scale(0.5); }
        to   { opacity: 1; transform: scale(1); }
      }
      .pm-success-icon i { font-size: 36px; color: #fff; }

      .pm-success h4 {
        font-family: 'Playfair Display', serif;
        font-size: 1.4rem; color: #1B2A41; margin: 0 0 6px;
      }
      .pm-success > p { font-size: 13px; color: #64748B; line-height: 1.55; margin: 0 0 22px; }

      .pm-access-box {
        background: linear-gradient(135deg, #FFF7ED, #FFFBF5);
        border: 2px dashed #FDBA74; border-radius: 14px;
        padding: 16px 18px; margin-bottom: 20px;
        text-align: left;
      }
      .pm-access-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: #9A3412; margin-bottom: 6px;
        display: flex; align-items: center; gap: 5px;
      }
      .pm-access-code-row {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
      }
      .pm-access-code {
        font-family: 'Courier New', monospace;
        font-size: 1.6rem; font-weight: 800;
        letter-spacing: 5px; color: #FF7A18;
        flex: 1;
      }
      .pm-copy-btn {
        border: none; cursor: pointer;
        background: #1B2A41; color: #fff;
        padding: 8px 14px; border-radius: 8px;
        font-family: 'Poppins', sans-serif;
        font-size: 12px; font-weight: 600;
        display: inline-flex; align-items: center; gap: 5px;
        transition: background 0.2s, transform 0.15s;
        flex-shrink: 0;
      }
      .pm-copy-btn:hover { background: #FF7A18; transform: scale(1.03); }
      .pm-copy-btn.copied { background: #059669; }

      .pm-success-note {
        font-size: 12px; color: #92400E; margin-top: 8px; line-height: 1.4;
      }

      .pm-success-actions { display: flex; gap: 10px; flex-direction: column; }
      .pm-btn-primary {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 13px 20px;
        background: linear-gradient(135deg, #FF9F43, #FF7A18);
        color: #1B2A41; border: none; border-radius: 12px;
        font-family: 'Poppins', sans-serif;
        font-size: 14px; font-weight: 700;
        cursor: pointer; text-decoration: none;
        box-shadow: 0 8px 22px rgba(255,122,24,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .pm-btn-primary:hover { transform: translateY(-2px); color: #1B2A41; box-shadow: 0 12px 30px rgba(255,122,24,0.4); }
      .pm-btn-ghost {
        display: flex; align-items: center; justify-content: center;
        padding: 12px 20px;
        background: #F1F5F9; color: #475569;
        border: none; border-radius: 12px;
        font-family: 'Poppins', sans-serif;
        font-size: 14px; font-weight: 600;
        cursor: pointer; transition: background 0.2s;
      }
      .pm-btn-ghost:hover { background: #E2E8F0; }

      /* ===== RESPONSIVE ===== */
      @media (max-width: 540px) {
        .pm-card { border-radius: 20px; }
        .pm-header { padding: 22px 20px 18px; }
        .pm-body { padding: 22px 20px; }
        .pm-access-code { font-size: 1.3rem; letter-spacing: 3px; }
        .pm-book-title { font-size: 1rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Main openCheckout ── */
  function openCheckout(book) {
    if (!book || !book.id || !(Number(book.price) > 0)) return;
    ensureFontAwesome();
    injectStyles();

    // Close any existing modal
    const existing = document.getElementById("pmOverlay");
    if (existing) existing.remove();
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "pm-overlay";
    overlay.id = "pmOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = buildShell(book);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    overlay.querySelector(".pm-close").addEventListener("click", closeModal);

    // Show email form
    renderEmailForm(book);
  }

  /* ── Shell (header + body wrapper) ── */
  function buildShell(book) {
    const cover = esc(book.cover || "");
    const title  = esc(book.title || "");
    const author = esc(book.author || "");
    const price  = fmtPrice(book.price);
    return `
      <div class="pm-card">
        <button type="button" class="pm-close" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="pm-header">
          <div class="pm-header-inner">
            ${cover
              ? `<img class="pm-cover" src="${cover}" alt="${title}" onerror="this.style.display='none'" />`
              : `<div class="pm-cover-placeholder"><i class="fa-solid fa-book"></i></div>`}
            <div class="pm-book-info">
              <span class="pm-eyebrow"><i class="fa-solid fa-shopping-bag"></i> Secure Checkout</span>
              <h2 class="pm-book-title">${title}</h2>
              <p class="pm-book-author">by ${author}</p>
              <div class="pm-price-tag">
                <i class="fa-solid fa-indian-rupee-sign" style="font-size:13px;"></i>${price.slice(1)}
              </div>
            </div>
          </div>
          <div class="pm-trust-row">
            <span class="pm-trust-item"><i class="fa-solid fa-lock"></i> Encrypted payment</span>
            <span class="pm-trust-item"><i class="fa-solid fa-bolt"></i> Instant access</span>
            <span class="pm-trust-item"><i class="fa-solid fa-shield-halved"></i> 100% secure</span>
          </div>
        </div>

        <div class="pm-body" id="pmBody"></div>
      </div>`;
  }

  /* ── Step 1: Email form ── */
  function renderEmailForm(book) {
    const body = document.getElementById("pmBody");
    if (!body) return;
    const remembered = (() => {
      try { return localStorage.getItem(LS_KEY_EMAIL) || ""; } catch { return ""; }
    })();

    body.innerHTML = `
      <p class="pm-form-title">Complete your purchase</p>
      <p class="pm-form-subtitle">Enter your email to get instant access after payment. Your access code will be linked to this email.</p>

      <div class="pm-error-msg" id="pmError">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span id="pmErrorText"></span>
      </div>

      <form id="pmEmailForm" autocomplete="on">
        <div class="pm-input-wrap">
          <i class="fa-regular fa-envelope"></i>
          <input
            type="email" name="email" id="pmEmailInput"
            class="pm-input" required inputmode="email"
            autocomplete="email"
            placeholder="your@email.com"
            value="${esc(remembered)}" />
        </div>
        <button type="submit" class="pm-pay-btn" id="pmPayBtn">
          <i class="fa-solid fa-lock"></i>
          Pay ${fmtPrice(book.price)} Securely
        </button>
      </form>

      <div class="pm-razorpay-logo">
        <i class="fa-solid fa-shield-halved"></i>
        <span>Secured by Cashfree Payments</span>
      </div>

      <div class="pm-methods">
        <span class="pm-method-chip"><i class="fa-solid fa-mobile-screen-button"></i> UPI</span>
        <span class="pm-method-chip"><i class="fa-regular fa-credit-card"></i> Cards</span>
        <span class="pm-method-chip"><i class="fa-solid fa-building-columns"></i> Net Banking</span>
        <span class="pm-method-chip"><i class="fa-solid fa-wallet"></i> Wallets</span>
      </div>`;

    body.querySelector("#pmEmailForm").addEventListener("submit", async ev => {
      ev.preventDefault();
      const email = body.querySelector("#pmEmailInput").value.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("Please enter a valid email address.");
        return;
      }
      hideError();
      const btn = body.querySelector("#pmPayBtn");
      btn.disabled = true;
      btn.innerHTML = '<span class="pm-spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;border-radius:50%;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;animation:pmSpin 0.7s linear infinite;"></span> Opening payment…';
      try {
        await startCashfreeFlow(book, email);
      } catch (err) {
        const msg = String(err?.message || "Payment failed. Please try again.");
        if (!document.getElementById("pmEmailForm")) {
          renderEmailForm(book);
          setTimeout(() => showError(msg), 10);
        } else {
          if (msg.toLowerCase() !== "payment cancelled") showError(msg);
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-lock"></i> Pay ${fmtPrice(book.price)} Securely`;
        }
      }
    });
  }

  function showError(msg) {
    const box = document.getElementById("pmError");
    const txt = document.getElementById("pmErrorText");
    if (box && txt) { 
      txt.textContent = msg; 
      box.classList.add("visible"); 
    } else {
      alert("Error: " + msg); // Fallback if DOM was overwritten by processing screen
    }
  }
  function hideError() {
    const box = document.getElementById("pmError");
    if (box) box.classList.remove("visible");
  }

  /* ── Step 2: Cashfree flow ── */
  async function startCashfreeFlow(book, email) {
    // Create order on our server
    const orderRes = await fetch(API_BASE + "/api/cashfree/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id, email })
    });
    const orderData = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) throw new Error(orderData.error || "Could not initiate payment");

    // Load Cashfree SDK
    const CF = await loadCashfreeScript();
    if (!CF) throw new Error("Could not load payment SDK. Please refresh the page.");

    const cashfree = CF({ mode: orderData.environment || "production" });

    // Open Cashfree popup
    await new Promise((resolve, reject) => {
      let checkoutOptions = {
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: "_modal",
      };
      
      cashfree.checkout(checkoutOptions).then(async (result) => {
        if (result.error) {
          reject(new Error(result.error.message || "Payment cancelled"));
          return;
        }
        if (result.redirect || result.paymentDetails) {
          renderProcessing();
          setTimeout(async () => {
            try {
              let lastErr;
              let success = false;
              for (let i = 0; i < 3; i++) {
                try {
                  const verifyRes = await fetch(API_BASE + "/api/cashfree/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      order_id: orderData.orderId,
                      bookId: book.id,
                      email
                    })
                  });
                  const verifyData = await verifyRes.json().catch(() => ({}));
                  if (!verifyRes.ok) throw new Error(verifyData.error || "Verification failed or payment not successful");
                  
                  success = true;
                  break;
                } catch (err) {
                  lastErr = err;
                  if (i < 2) await new Promise(r => setTimeout(r, 3000));
                }
              }
              if (!success) throw lastErr;
              
              // No access code anymore, just success
              renderSuccess(book, email, orderData.orderId);
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 2000);
        }
      });
    });
  }

  /* ── Processing screen ── */
  function renderProcessing() {
    const body = document.getElementById("pmBody");
    if (!body) return;
    body.innerHTML = `
      <div class="pm-processing">
        <div class="pm-processing-ring">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h4>Verifying payment…</h4>
        <p>Please wait while we confirm your payment and email your book.</p>
      </div>`;
  }

  /* ── Success screen ── */
  function renderSuccess(book, email, orderId) {
    const body = document.getElementById("pmBody");
    if (!body) return;
    body.innerHTML = `
      <div class="pm-success">
        <div class="pm-success-icon">
          <i class="fa-solid fa-check"></i>
        </div>
        <h4>Payment Successful!</h4>
        <p>Your purchase is confirmed. The download link for <strong>${esc(book.title)}</strong> has been emailed directly to <strong>${esc(email)}</strong>.</p>
        <p style="font-size:12px; color:#64748B; margin-bottom: 24px;">Please check your inbox (and spam folder) for the email.</p>
        <div class="pm-success-actions">
          ${orderId ? `<button type="button" class="pm-btn-primary pm-resend-btn" data-order="${esc(orderId)}">
            <i class="fa-regular fa-paper-plane"></i> Resend Email
          </button>` : ''}
          <button type="button" class="pm-btn-ghost pm-close-btn">
            <i class="fa-solid fa-xmark"></i> Close
          </button>
        </div>
      </div>`;

    body.querySelector(".pm-close-btn").addEventListener("click", closeModal);
    
    const resendBtn = body.querySelector(".pm-resend-btn");
    if (resendBtn) {
      resendBtn.addEventListener("click", async () => {
        const originalHtml = resendBtn.innerHTML;
        resendBtn.disabled = true;
        resendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 5px;"></i> Sending...';
        try {
          const res = await fetch(API_BASE + "/api/resend-book-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, email })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to resend");
          resendBtn.innerHTML = '<i class="fa-solid fa-check" style="margin-right: 5px;"></i> Sent!';
        } catch (err) {
          alert("Error: " + err.message);
          resendBtn.innerHTML = originalHtml;
          resendBtn.disabled = false;
        }
      });
    }
  }

  /* ── Public API ── */
  window.EmporiumCheckout = {
    openCheckout,
    closeCheckout: closeModal
  };
})();
