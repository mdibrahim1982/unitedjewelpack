// ===================== LOCAL-MODE credentials (no Firebase) =====================
// Used ONLY when no Firebase project is configured (see src/backend.js) — i.e.
// plain `npm run dev` without a .env file. They are hardcoded and visible to
// anyone who can read the JavaScript, so they provide NO real security.
//
// When Firebase is configured these are never used, and this file is not even
// loaded: auth.jsx / salesRepAuth.jsx only import it behind a build-time check
// that Vite resolves to `false`, so it is left out of the production bundle.
// (Check with:  grep -r "Ujp123" dist   → should print nothing.)
//
// If these passwords are used anywhere else, change them there: they have been
// served publicly with the site.
export const ADMIN = { email: "unitedjewelpack@gmail.com", password: "Ujp123$" };

export const SALES_REPS = [
  { email: "rep1@unitedjewelpack.com", password: "Rep123$", name: "Sales Rep 1" },
  { email: "rep2@unitedjewelpack.com", password: "Rep123$", name: "Sales Rep 2" },
];
