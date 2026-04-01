# Security Review (April 2026)

## Critical issues fixed in code

1. Removed hardcoded admin password from `admin.html`.
2. Replaced client-side password gate with Firebase Authentication sign-in flow.
3. Added output escaping and URL sanitization for dynamic HTML rendering in:
   - `admin.html`
   - `academic.html`
4. Added stricter URL validation for upload/create forms.

## Remaining required actions (Firebase Console)

1. Deploy the rules from `firestore.rules` in Firebase Console or via Firebase CLI.
2. Create admin users in Firebase Authentication.
3. Add custom claim `admin: true` to admin accounts.
4. Verify Firestore reads/writes with the test cases below.

## Firestore security test checklist

- Public (not signed in):
  - Can read `books`, `resources`, `contributors`.
  - Cannot create/update/delete `books`.
  - Cannot create `resources`.
  - Cannot update `contributors`.
- Signed-in regular user:
  - Can create valid `resources`.
  - Can increment `resources.downloads` only by `+1`.
  - Can create/update contributors only with expected increment rules.
  - Cannot modify arbitrary fields.
- Signed-in admin (`admin: true`):
  - Can create/update/delete `books`.
  - Can delete abusive `resources` or `contributors`.

## Netlify deployment notes

- Netlify auto-deploy will run when changes are pushed to the tracked branch.
- No secret should be stored in frontend source files.
- If future backend keys are needed, use Netlify environment variables and server-side functions.
