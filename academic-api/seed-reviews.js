// seed-reviews.js — populate Firestore with dummy books and reviews for local testing
// Usage:
// 1) Place a service account JSON at academic-api/serviceAccountKey.json OR set env var GOOGLE_SERVICE_ACCOUNT_JSON with the JSON string.
// 2) Run: node seed-reviews.js

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadServiceAccount() {
  const env = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (env) return JSON.parse(env);
  const p = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  throw new Error('No service account JSON found. Set GOOGLE_SERVICE_ACCOUNT_JSON or place serviceAccountKey.json in academic-api/.');
}

async function main() {
  try {
    const sa = loadServiceAccount();
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    const db = admin.firestore();

    const books = [
      { id: 'test-book-1', title: 'The Alchemist (Test)', author: 'Paulo Coelho', price: 0, cover: '', trending: false, newRelease: false },
      { id: 'test-book-2', title: 'Atomic Habits (Test)', author: 'James Clear', price: 0, cover: '', trending: false, newRelease: false }
    ];

    for (const b of books) {
      const ref = db.collection('books').doc(b.id);
      await ref.set({ title: b.title, author: b.author, genre: 'test', cover: b.cover || '', driveLink: '', trending: b.trending, newRelease: b.newRelease, price: b.price, createdAt: admin.firestore.Timestamp.fromDate(new Date()) }, { merge: true });
      console.log('Upserted book:', b.id);
    }

    const reviews = [
      { bookId: 'test-book-1', userId: 'seed-user-1', displayName: 'Aisha', avatarInitials: 'AI', rating: 5, reviewText: 'Loved this test copy — very inspiring.', helpfulCount: 2 },
      { bookId: 'test-book-1', userId: 'seed-user-2', displayName: 'Ravi', avatarInitials: 'RV', rating: 4, reviewText: 'Good read, pacing was nice.', helpfulCount: 1 },
      { bookId: 'test-book-2', userId: 'seed-user-3', displayName: 'Maya', avatarInitials: 'MY', rating: 3, reviewText: 'Useful tips but a little repetitive.', helpfulCount: 0 }
    ];

    for (const r of reviews) {
      const doc = db.collection('reviews').doc();
      const ts = admin.firestore.Timestamp.fromDate(new Date());
      await doc.set({ bookId: r.bookId, userId: r.userId, displayName: r.displayName, avatarInitials: r.avatarInitials, rating: r.rating, reviewText: r.reviewText, helpfulCount: r.helpfulCount, createdAt: ts, updatedAt: ts });
      console.log('Created review for', r.bookId, 'by', r.displayName);
    }

    // Recalculate book aggregates for the test books
    for (const b of books) {
      const snap = await db.collection('reviews').where('bookId', '==', b.id).get();
      let avg = 0, count = 0;
      snap.docs.forEach(d => { const data = d.data(); avg += Number(data.rating || 0); count++; });
      avg = count ? parseFloat((avg / count).toFixed(1)) : 0;
      await db.collection('books').doc(b.id).update({ avgRating: avg, reviewCount: count });
      console.log('Updated book aggregate', b.id, 'avgRating=', avg, 'count=', count);
    }

    console.log('Seeding complete. Remember to create composite indexes for reviews (bookId ASC, createdAt DESC).');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
