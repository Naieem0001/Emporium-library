// reviews.js — Emporium Library review system (v2 fixed)
// Follow prompt: IIFE, use existing firebase/window.db/window.auth, no global overrides.

(function () {
  'use strict';

  function getDb() {
    if (window.db) return window.db;
    try { return firebase.firestore(); } catch (e) { return null; }
  }
  function getAuth() {
    if (window.auth) return window.auth;
    try { return firebase.auth(); } catch (e) { return null; }
  }

  function waitForFirebase(cb, n) {
    n = n || 0;
    if (n > 20) return;
    const db = getDb();
    if (db) { cb(db); return; }
    setTimeout(() => waitForFirebase(cb, n + 1), 500);
  }

  window._revBookCache = window._revBookCache || {};
  function resolveBookTitles(reviews, db, done) {
    const ids = [...new Set(reviews.map(r => r.bookId).filter(id => id && !window._revBookCache[id]))];
    if (!ids.length) { done(); return; }
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    let count = 0;
    chunks.forEach(chunk => {
      db.collection('books').where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get()
        .then(snap => {
          snap.docs.forEach(d => { window._revBookCache[d.id] = d.data().title || d.id; });
          chunk.forEach(id => { if (!window._revBookCache[id]) window._revBookCache[id] = id; });
        })
        .catch(() => { chunk.forEach(id => { window._revBookCache[id] = id; }); })
        .finally(() => { count++; if (count === chunks.length) done(); });
    });
  }
  function bookTitle(id) { return window._revBookCache[id] || id; }

  function avatarInitials(name) {
    if (!name) return '??';
    const p = name.trim().split(/\s+/);
    return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
  }
  function starHTML(rating) {
    let h = '';
    for (let i = 1; i <= 5; i++)
      h += `<i class="${i <= rating ? 'fa-solid' : 'fa-regular'} fa-star rev-star-display"></i>`;
    return h;
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const d = Math.floor((Date.now() - date) / 1000);
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    if (d < 2592000) return Math.floor(d / 86400) + 'd ago';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function renderRatingSummary(containerId, reviews) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!reviews.length) {
      el.innerHTML = '<p class="rev-no-reviews">No reviews yet — be the first to review this book!</p>';
      return;
    }
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const dist = [5,4,3,2,1].map(star => ({ star, count: reviews.filter(r => r.rating === star).length }));
    const max = Math.max(...dist.map(d => d.count), 1);
    el.innerHTML = `
      <div class="rev-summary">
        <div class="rev-avg-block">
          <span class="rev-avg-num">${avg.toFixed(1)}</span>
          <div class="rev-avg-stars">${starHTML(Math.round(avg))}</div>
          <span class="rev-avg-count">${reviews.length} review${reviews.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="rev-dist">
          ${dist.map(d => `
            <div class="rev-dist-row">
              <span class="rev-dist-label">${d.star}<i class="fa-solid fa-star"></i></span>
              <div class="rev-dist-bar-wrap"><div class="rev-dist-bar" style="width:${Math.round((d.count/max)*100)}%"></div></div>
              <span class="rev-dist-count">${d.count}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function reviewCardHTML(r, uid) {
    const isOwn = uid && r.userId === uid;
    const verifiedBadge = r.verified ? `<span class="rev-verified-badge" title="Verified Reader" style="color:#16a34a; font-size:11px; margin-left:6px;"><i class="fa-solid fa-circle-check"></i> Verified</span>` : '';
    return `
      <div class="rev-card" data-review-id="${r.id}">
        <div class="rev-card-header">
          <div class="rev-avatar">${r.avatarInitials || '??'}</div>
          <div class="rev-card-meta">
            <span class="rev-card-name">${esc(r.displayName)}${verifiedBadge}</span>
            <span class="rev-card-time">${timeAgo(r.createdAt)}</span>
          </div>
          <div class="rev-card-stars">${starHTML(r.rating)}</div>
        </div>
        ${r.reviewText ? `<p class="rev-card-text">${esc(r.reviewText)}</p>` : ''}
        <div class="rev-card-footer">
          <button class="rev-helpful-btn" data-id="${r.id}">
            <i class="fa-regular fa-thumbs-up"></i> Helpful${r.helpfulCount > 0 ? ` (${r.helpfulCount})` : ''}
          </button>
          ${isOwn ? `<button class="rev-edit-btn" data-id="${r.id}"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
        </div>
      </div>`;
  }

  window.ReviewSystem = {

    initBookPage: function (bookId) {
      const section = document.getElementById('rev-section');
      if (!section || !bookId) return;
      section.innerHTML = `
        <div class="rev-section-inner">
          <h2 class="rev-heading">Reader Reviews</h2>
          <div id="rev-summary-container"></div>
          <div id="rev-form-container"><p class="rev-loading">Loading…</p></div>
          <div class="rev-sort-bar">
            <span class="rev-sort-label">Sort by:</span>
            <button class="rev-sort-btn active" data-sort="newest">Newest</button>
            <button class="rev-sort-btn" data-sort="helpful">Most Helpful</button>
          </div>
          <div id="rev-list-container"><p class="rev-loading">Loading reviews…</p></div>
          <button id="rev-load-more" class="btn btn-outline rev-load-more" style="display:none">Load more</button>
        </div>`;

      let allReviews = [], currentSort = 'newest';
      const PAGE = 8; let shown = PAGE;

      waitForFirebase(function (db) {
        db.collection('reviews').where('bookId','==',bookId).orderBy('createdAt','desc').get()
          .then(snap => {
            allReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderRatingSummary('rev-summary-container', allReviews);
            renderList();
          })
          .catch(err => {
            console.error('[reviews.js] fetch:', err);
            const lc = document.getElementById('rev-list-container');
            if (lc) lc.innerHTML = '<p class="rev-error">Could not load reviews. Please refresh.</p>';
          });

        const auth = getAuth();
        if (auth) auth.onAuthStateChanged(user => renderForm(bookId, user));
        else renderForm(bookId, null);
      });

      function renderList() {
        const auth = getAuth();
        const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
        const sorted = [...allReviews].sort((a,b) =>
          currentSort === 'helpful'
            ? (b.helpfulCount||0) - (a.helpfulCount||0)
            : (b.createdAt&&b.createdAt.seconds||0) - (a.createdAt&&a.createdAt.seconds||0));
        const lc = document.getElementById('rev-list-container');
        if (lc) lc.innerHTML = sorted.slice(0,shown).length
          ? sorted.slice(0,shown).map(r => reviewCardHTML(r,uid)).join('')
          : '<p class="rev-no-reviews">No reviews yet — be the first!</p>';
        const lb = document.getElementById('rev-load-more');
        if (lb) lb.style.display = shown < sorted.length ? 'block' : 'none';
        attachCardListeners();
      }

      section.addEventListener('click', e => {
        const sb = e.target.closest('.rev-sort-btn');
        if (sb) { section.querySelectorAll('.rev-sort-btn').forEach(b => b.classList.remove('active')); sb.classList.add('active'); currentSort = sb.dataset.sort; shown = PAGE; renderList(); }
        if (e.target.id === 'rev-load-more') { shown += PAGE; renderList(); }
      });

      function renderForm(bookId, user) {
        const fc = document.getElementById('rev-form-container');
        if (!fc) return;
        if (!user) {
          fc.innerHTML = `<p class="rev-auth-note"><i class="fa-solid fa-lock"></i> <a href="#" class="rev-signin-link">Sign in</a> to leave a review.</p>`;
          fc.querySelector('.rev-signin-link').addEventListener('click', e => {
            e.preventDefault();
            if (typeof openAuthModal === 'function') { openAuthModal(); return; }
            const auth = getAuth();
            if (auth) auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(console.error);
          });
          return;
        }
        const existing = allReviews.find(r => r.userId === user.uid);
        let sel = existing ? existing.rating : 0;
        fc.innerHTML = `
          <div class="rev-form-card">
            <h3 class="rev-form-title">${existing ? 'Edit Your Review' : 'Write a Review'}</h3>
            <div class="rev-star-picker" role="radiogroup" aria-label="Select rating">
              ${[1,2,3,4,5].map(i => `<i class="${i<=sel?'fa-solid':'fa-regular'} fa-star rev-star-pick" data-val="${i}" tabindex="0" role="radio" aria-checked="${i<=sel}"></i>`).join('')}
            </div>
            <span class="rev-star-hint" id="rev-star-hint">${sel ? sel+' / 5' : 'Tap to rate'}</span>
            <textarea id="rev-textarea" class="rev-textarea" maxlength="600" placeholder="Share your thoughts… (optional)">${existing ? esc(existing.reviewText) : ''}</textarea>
            <div class="rev-form-footer">
              <span class="rev-char-count" id="rev-char-count">${existing ? existing.reviewText.length : 0}/600</span>
              <button class="btn btn-primary" id="rev-submit-btn">${existing ? 'Update Review' : 'Submit Review'}</button>
            </div>
            <p class="rev-form-msg" id="rev-form-msg"></p>
          </div>`;

        const picker = fc.querySelector('.rev-star-picker');
        const hint = document.getElementById('rev-star-hint');
        function setStars(val) { sel = val; picker.querySelectorAll('.rev-star-pick').forEach(s => { const v = parseInt(s.dataset.val); s.className = `${v<=val?'fa-solid':'fa-regular'} fa-star rev-star-pick`; s.setAttribute('aria-checked', v<=val); }); hint.textContent = val + ' / 5'; }
        picker.querySelectorAll('.rev-star-pick').forEach(star => { star.addEventListener('click', () => setStars(parseInt(star.dataset.val))); star.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') setStars(parseInt(star.dataset.val)); }); star.addEventListener('mouseover', () => { const hv = parseInt(star.dataset.val); picker.querySelectorAll('.rev-star-pick').forEach(s => { s.className = `${parseInt(s.dataset.val)<=hv?'fa-solid':'fa-regular'} fa-star rev-star-pick`; }); }); star.addEventListener('mouseleave', () => setStars(sel)); });

        const ta = document.getElementById('rev-textarea');
        ta.addEventListener('input', () => { document.getElementById('rev-char-count').textContent = ta.value.length+'/600'; });

        document.getElementById('rev-submit-btn').addEventListener('click', () => { if (!sel) { showMsg('Please select a star rating.','error'); return; } doSubmit(bookId, user, existing, sel, ta.value.trim()); });
      }

      function showMsg(text, type) { const el = document.getElementById('rev-form-msg'); if (!el) return; el.textContent = text; el.className = 'rev-form-msg rev-form-msg--'+type; setTimeout(() => { el.textContent=''; el.className='rev-form-msg'; }, 4000); }

      function attachCardListeners() {
        const lc = document.getElementById('rev-list-container'); if (!lc) return;
        lc.querySelectorAll('.rev-helpful-btn').forEach(btn => { btn.addEventListener('click', () => { const rid = btn.dataset.id, key = 'rev_helpful_'+rid; if (localStorage.getItem(key)) return; const db = getDb(); if (!db) return; db.collection('reviews').doc(rid).update({ helpfulCount: firebase.firestore.FieldValue.increment(1) }).then(() => { localStorage.setItem(key,'1'); const r = allReviews.find(x => x.id===rid); if (r) r.helpfulCount = (r.helpfulCount||0)+1; renderList(); }).catch(console.error); }); });
        lc.querySelectorAll('.rev-edit-btn').forEach(btn => { btn.addEventListener('click', () => { document.getElementById('rev-form-container')?.scrollIntoView({ behavior:'smooth', block:'start' }); }); });
      }

      function doSubmit(bookId, user, existing, rating, text) {
        const db = getDb(); if (!db) return; const btn = document.getElementById('rev-submit-btn'); if (btn) { btn.disabled=true; btn.textContent='Saving…'; }
        const displayName = user.displayName || user.email.split('@')[0];
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const reviewRef = existing ? db.collection('reviews').doc(existing.id) : db.collection('reviews').doc();
        const bookRef = db.collection('books').doc(bookId);

        db.runTransaction(async tx => {
          const bd = (await tx.get(bookRef)).data() || {};
          const oldCount = bd.reviewCount || 0, oldAvg = bd.avgRating || 0;
          let newCount, newAvg;
          if (existing) {
            newCount = oldCount;
            newAvg = newCount > 0 ? (oldAvg*oldCount - existing.rating + rating)/newCount : rating;
            tx.update(reviewRef, { rating, reviewText: text, updatedAt: now });
          } else {
            newCount = oldCount + 1;
            newAvg = (oldAvg*oldCount + rating)/newCount;
            tx.set(reviewRef, { bookId, userId:user.uid, displayName, avatarInitials:avatarInitials(displayName), rating, reviewText:text, helpfulCount:0, createdAt:now, updatedAt:now });
          }
          tx.update(bookRef, { avgRating: parseFloat(newAvg.toFixed(1)), reviewCount: newCount });
        })
        .then(() => {
          getDb().collection('reviews').where('bookId','==',bookId).orderBy('createdAt','desc').get()
            .then(snap => {
              allReviews.splice(0, allReviews.length, ...snap.docs.map(d => ({ id:d.id, ...d.data() })));
              renderRatingSummary('rev-summary-container', allReviews);
              renderList();
              showMsg(existing ? 'Review updated!' : 'Review submitted!', 'success');
              if (btn) { btn.disabled=false; btn.textContent=existing?'Update Review':'Submit Review'; }
            });
        })
        .catch(err => { console.error('[reviews.js] submit:', err); showMsg('Failed to save. Please try again.','error'); if (btn) { btn.disabled=false; btn.textContent=existing?'Update Review':'Submit Review'; } });
      }
    },

    initHomepageStrip: function () {
      const anchor = document.querySelector('section.academic-hub');
      if (!anchor) { console.warn('[reviews.js] .academic-hub not found'); return; }

      const stripSection = document.createElement('section');
      stripSection.id = 'rev-homepage-strip';
      stripSection.className = 'section rev-strip-section';
      stripSection.innerHTML = `
        <div class="section-header">
          <h2>What Readers Say</h2>
          <p>Honest reviews from our community of book lovers</p>
        </div>
        <div class="rev-strip-wrap rev-paused" id="rev-strip-wrap">
          <div class="rev-strip-row" id="rev-row-1">
            ${[1,2,3,4,5].map(()=>'<div class="rev-strip-card rev-strip-skeleton"></div>').join('')}
          </div>
          <div class="rev-strip-row rev-strip-row--rtl" id="rev-row-2">
            ${[1,2,3,4,5].map(()=>'<div class="rev-strip-card rev-strip-skeleton"></div>').join('')}
          </div>
        </div>`;
      anchor.insertAdjacentElement('afterend', stripSection);

      waitForFirebase(function (db) {
        db.collection('reviews').where('rating','>=',4).orderBy('rating','desc').limit(24).get()
          .then(snap => {
            const reviews = snap.docs.map(d => ({ id:d.id, ...d.data() }));
            if (!reviews.length) {
              stripSection.querySelector('.rev-strip-wrap').innerHTML = `
                <div class="rev-strip-empty">
                  <i class="fa-regular fa-star"></i>
                  <p>No reviews yet — explore a book and be the first to share your thoughts!</p>
                  <a href="genre.html?genre=all" class="btn btn-primary" style="margin-top:12px">Browse Books</a>
                </div>`;
              return;
            }
            resolveBookTitles(reviews, db, function () {
              const half = Math.ceil(reviews.length/2);
              const row1 = reviews.slice(0,half);
              const row2 = reviews.slice(half).length ? reviews.slice(half) : reviews.slice(0,half);
              function card(r) {
                return `<div class="rev-strip-card">
                  <div class="rev-strip-card-top">
                    <div class="rev-avatar rev-avatar--sm">${r.avatarInitials||'??'}</div>
                    <div>
                      <div class="rev-strip-name">${esc(r.displayName)}</div>
                      <div class="rev-strip-stars">${starHTML(r.rating)}</div>
                    </div>
                  </div>
                  ${r.reviewText ? `<p class="rev-strip-text">"${esc(r.reviewText.slice(0,110))}${r.reviewText.length>110?'…':''}"</p>` : ''}
                  <div class="rev-strip-book"><i class="fa-solid fa-book-open"></i> ${esc(bookTitle(r.bookId))}</div>
                </div>`;
              }
              function fillRow(id, items) { const el = document.getElementById(id); if (el) el.innerHTML = [...items,...items].map(card).join(''); }
              fillRow('rev-row-1', row1);
              fillRow('rev-row-2', row2);
              const wrap = document.getElementById('rev-strip-wrap'); wrap.classList.remove('rev-paused'); wrap.addEventListener('mouseenter', () => wrap.classList.add('rev-paused')); wrap.addEventListener('mouseleave', () => wrap.classList.remove('rev-paused'));
            });
          })
          .catch(err => { console.error('[reviews.js] strip fetch:', err); stripSection.style.display = 'none'; });
      });
    }
  };

  function tryInit() { if (document.getElementById('trendingBooks')) window.ReviewSystem.initHomepageStrip(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInit); else tryInit();

})();
