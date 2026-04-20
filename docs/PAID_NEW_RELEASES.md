# Paid New Releases — Seeding & Rollout Guide

This feature gates "New Release" books behind a manual UPI / Bank-transfer
checkout. Buyers pay, paste their UTR, get an 8-character access code, and
you approve from the admin panel. After approval, buyers unlock the Drive
link from the **My Purchases** page.

No payment gateway, no SDK, no email notifications.

---

## Architecture at a glance

| Layer | What lives there |
|---|---|
| `firestore.rules` | `books.price` field, `payment_config` (public read), `orders` and `paid_book_assets` (backend-only). |
| `academic-api/server.js` | `GET /api/payment-config`, `POST /api/orders`, `POST /api/unlock`, `GET /api/purchases`, `GET /admin/orders`, `POST /admin/orders/:id/approve\|reject`, `POST /admin/payment-config`, `POST /admin/books/:id/set-pricing`, extended `POST /admin/upload-book`. |
| `admin.html` | Price field on add-book; "Edit Book" modal (flags + price); new **Payments** tab (Payment Config + Orders table). |
| `payment.js` + `.pm-*` CSS in `style.css` | Checkout modal with UPI / Bank tabs. |
| `script.js` | Book cards show "Buy – ₹X" pill + lock badge when `price > 0`. |
| `my-purchases.html` | Email lookup → per-order status chip, access code, and download CTA. |

Paid-book Drive links are never exposed publicly. On upload, if `price > 0`:

1. `books/{id}.driveLink` is written as an empty string (public).
2. The real link goes to `paid_book_assets/{id}.driveLink` — a collection
   locked down by rules, only the backend Admin SDK can read it.
3. `/api/unlock` fetches the private link after verifying the order is
   `approved` and the email matches.

---

## Rollout order (do this once)

1. **Deploy Firestore rules** — `firebase deploy --only firestore:rules` (or
   paste the updated `firestore.rules` into the Firebase console → Firestore →
   Rules → Publish). The new rules add the `price` field to the book shape and
   create rules for the three new collections.
2. **Create the composite index for `orders`** — required for the
   My Purchases lookup. Easiest path:
   - Open **Firebase Console → Firestore → Indexes → Composite → Create index**.
   - Collection ID: `orders`. Add fields:
     `buyerEmail` = Ascending, `createdAt` = Descending. Query scope: Collection. Save.
   - Index builds in ~1 minute. Until it's **Enabled**, `/api/purchases` will
     fail with a Firestore error. *(If you ever ignore this step, Firestore
     also returns a pre-built "click to create" URL in the backend logs the
     first time the query fails — either path works.)*
   - Alternative: if you use the Firebase CLI, `firebase deploy --only firestore:indexes`
     will push the included `firestore.indexes.json`.
3. **Deploy backend** — push `academic-api/` to Render. No new env vars
   are required; it reuses the existing Drive + Firebase Admin credentials.
4. **Hard-refresh the site** — the frontend pulls `payment.js?v=paid-v1` and
   `script.js?v=paid-v1`; clear caches so the cache-buster kicks in.

---

## One-time: enter your payment details

1. Sign in to `admin.html` with your admin email.
2. Click the new **Payments** tab.
3. Fill in **Payment Config**:
   - **UPI ID** — e.g. `naieem@okhdfc` (validated as `name@bank`).
   - **UPI Payee Name** — what shows in the UPI app (e.g. `Naieem Qureshi`).
   - **UPI QR Image** — optional. Any JPG / PNG / WEBP up to 5 MB.
     Generate it in your UPI app and upload here; buyers scan it on desktop.
   - **Account Holder Name**, **Bank Name**, **Account Number**, **IFSC**,
     **Branch** — all shown on the Bank tab of the checkout modal.
4. Click **Save Config**. The form also saves the QR to your Drive folder
   (same one used for book uploads) and stores the public thumbnail URL.

You can edit this anytime; the modal always fetches the latest config.

---

## Price a book

Two ways:

- **New book**: in the **Add New Book** form, set **Price (INR)** to any
  value > 0. The Drive link you upload is routed to `paid_book_assets`
  automatically, and the public `books` doc gets `driveLink: ""`.
- **Existing book**: in the Books tab, click **Edit** → set a non-zero
  price → Save. The backend moves the existing Drive link from the public
  `books` doc to `paid_book_assets/{bookId}`. Setting the price back to
  `0` restores the link to the public doc and deletes the asset record.

Prices are integer rupees, up to ₹100,000.

---

## End-to-end test (recommended: ₹1 test book)

1. In admin, create (or edit) one book with **Price = 1** and mark it as
   **New Release**.
2. Open the site in a private window → scroll to New Releases → the card
   should show a 🔒 **Paid** badge and a **Buy – ₹1** pill instead of Download.
3. Click **Buy – ₹1**. The modal opens with two tabs:
   - **UPI**: your QR + UPI ID + GPay/PhonePe/Paytm deep-link buttons.
   - **Bank Transfer**: four copy-able rows (account, IFSC, etc.).
4. Send yourself ₹1 via any UPI app using the shown ID.
5. Click **I've paid — submit reference**, fill:
   - Email (required),
   - Phone (optional),
   - Method (UPI / Bank),
   - UTR (12-digit UPI reference or bank UTR).
6. On success you get an 8-character code like `A7X2K9PM`. The modal
   also saves the code to `localStorage.emporium_orders`.
7. Open **Admin → Payments**. The order shows with a yellow *Pending* chip.
   Verify the UTR in your bank/UPI app, then click **Approve**.
8. Open **My Purchases** in the test window, enter the email → the order
   now shows an *Approved* chip and a **Download now** button. Click it →
   the real Drive link opens in a new tab.
9. (Optional) Test **Reject** on another pending order. The buyer's card
   shows the rejection reason.

---

## Duplicate & abuse safeguards

- Submitting the same `(UTR, bookId)` twice returns HTTP 409 with the
  original access code — buyers can't spam-create new orders from the same
  transaction.
- `/api/unlock` enforces both **email match** *and* **status == approved**.
  A leaked access code alone can't download the book.
- `/api/purchases` *never* returns the full access code — only the last 4
  chars as a visual hint. This means knowing a buyer's email alone is not
  enough to download their book; the full code must come from the checkout
  screen (localStorage on the buyer's device) or from the admin.
- `driveLink` for paid books never appears in the public `books` doc, so
  it won't leak via the public Firestore reads the homepage already does.

---

## Supporting a buyer who lost their code

1. Ask for the email they used at checkout.
2. Have them open `my-purchases.html` → if they're on the **same device
   they bought from**, the full code is already in localStorage and the
   Download button works without any prompt.
3. If they cleared storage or are on a different device, the page now
   shows the last 4 chars of the code as a hint (e.g. `****K9PM`) and asks
   them to enter the full code on Download.
4. If they've truly lost it: look them up in **Admin → Payments** by email
   or UTR, read the full `accessCode` column back to them over a trusted
   channel. The admin panel is the only place that shows the full code
   after checkout.

---

## Files touched

```
firestore.rules
firestore.indexes.json   (new — required composite index for orders)
academic-api/server.js
admin.html
style.css
script.js
index.html          (navbar + footer + payment.js/script.js cache-bust)
genre.html          (navbar + payment.js/script.js cache-bust)
academic.html       (navbar + footer)
about.html          (navbar + footer)
faq.html            (navbar + footer)
my-notes.html       (navbar)
payment.js          (new)
my-purchases.html   (new)
docs/PAID_NEW_RELEASES.md (this file)
```

## Backwards compatibility

Old book documents without a `price` field are treated as `price === 0`
(free) by the frontend and the backend. You don't need to run a migration;
only the books you want to monetize need to have their price set.
