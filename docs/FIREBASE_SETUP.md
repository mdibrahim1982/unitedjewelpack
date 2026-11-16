# Firebase setup — United Jewel Pack

The app has two modes, chosen when it is **built**:

| Mode | When | Where data lives | Logins |
|---|---|---|---|
| **Local** | no `VITE_FIREBASE_*` values | this browser only (as before) | demo logins in `src/localCredentials.js` |
| **Firebase** | `VITE_FIREBASE_*` values present | Cloud Firestore | Firebase Authentication (Email/Password) |

Nothing is removed: delete the `.env` file and the app is back in Local mode.

---

## What is stored where (Firebase mode)

| Firestore document | Contents | Who can read | Who can write |
|---|---|---|---|
| `inventory/{folder:photo}` e.g. `inventory/ring-boxes:1` | `physical`, `reserved`, `price` | everyone (storefront needs it) | admin only |
| `orders/{orderId}` | the order, its status (`pending → approved → dispatched`, or `rejected`/`cancelled`), `reservedLines`, `dispatchedLines`, `stockDeducted` | admin: all · sales rep: own · customer: own | customer/rep create a *pending* one; admin does everything else |
| `salesReps/{uid}` | `name`, `email`, `active` | admin, and the rep themself | admin only |
| `admins/{uid}` | `name` | the user themself | **console only** |
| `meta/migration` | progress of the one-time data copy | admin | admin |

**Stock rules (unchanged from the app, now enforced on the server):**
- A new order changes no stock.
- *Approve* reserves the quantities (`reserved ↑`); `physical` is untouched.
- *Reject / cancel* release any reservation; `physical` is untouched.
- *Confirm dispatch* is the only step that lowers `physical` — by what was actually sent — and releases the reservation, all in **one transaction** with the order status.
- A dispatched order is frozen by the Security Rules, so a second deduction is impossible, even from a double click or a second admin.

**Product images stay in `public/assets/folders/`.** Firebase Storage is not used.

---

## 1. Firebase console (project `unitedjewelpack`)

1. **Project settings → General → Your apps → Web app** (create one if needed, e.g. "United Jewel Pack web"). Copy the config values.
2. **Authentication → Sign-in method** — enable:
   - **Email/Password** (admin + sales reps)
   - **Anonymous** (customers — gives each customer an id so their order can be saved; they never see a login). *Without this, customers cannot place orders in Firebase mode.*
3. **Authentication → Users → Add user** — create the admin and each sales rep (email + a strong, unique password). **Copy each user's UID.**
4. **Firestore Database → Create database** → *Production mode* → pick a region close to your customers (e.g. `asia-south1`, Mumbai).
5. **Create the role documents** (Firestore → Start collection):
   - Collection `admins`, **Document ID = the admin's UID**, field `name` (string) = `Owner`.
   - Collection `salesReps`, **Document ID = each rep's UID**, fields `name` (string) `Ravi Kumar`, `email` (string), `active` (boolean) `true`.
   - To switch a rep off immediately, set `active` to `false`.
   > A Firebase account with **no** such document is signed straight back out by the app, and the Security Rules deny it everything.
6. **Publish the Security Rules** — either
   - paste `firestore.rules` into **Firestore → Rules → Publish**, or
   - `npx firebase-tools login && npx firebase-tools deploy --only firestore:rules --project unitedjewelpack`.
7. **Strongly recommended — restrict the API key:** Google Cloud console → *APIs & Services → Credentials* → the browser key → *Application restrictions: HTTP referrers* → add `https://unitedjewelpack.in/*` (and `https://www.unitedjewelpack.in/*`, your `*.github.io` address, and `http://localhost:*` while developing).
8. **Authentication → Settings → Authorized domains:** make sure `unitedjewelpack.in` (and `www.`, and your `github.io` host) are listed.
9. **Recommended soon — App Check** (reCAPTCHA v3) to stop other websites/scripts calling your Firestore with your public config.

## 2. Configure the app

```bash
cp .env.example .env.local        # for `npm run dev`
cp .env.example .env.production.local   # for `npm run build`
# fill in VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID (and confirm the project id / auth domain)
npm install
npm run dev
```
These are public web identifiers, **not secrets**, but they are git-ignored and injected at build time. **Never** put a service-account / Admin SDK key in this project.

### GitHub Pages (`unitedjewelpack.in`)
Your existing deployment is untouched (no Vite `base`, no CNAME or workflow was changed). Only the *build* needs the values:
- **Building locally and deploying `dist/`** (e.g. `gh-pages`): keep them in `.env.production.local` — Vite reads it automatically.
- **Building in GitHub Actions:** add the five values under *Settings → Secrets and variables → Actions → Variables*, then pass them to the build step:
  ```yaml
  - run: npm run build
    env:
      VITE_FIREBASE_API_KEY: ${{ vars.VITE_FIREBASE_API_KEY }}
      VITE_FIREBASE_AUTH_DOMAIN: ${{ vars.VITE_FIREBASE_AUTH_DOMAIN }}
      VITE_FIREBASE_PROJECT_ID: ${{ vars.VITE_FIREBASE_PROJECT_ID }}
      VITE_FIREBASE_APP_ID: ${{ vars.VITE_FIREBASE_APP_ID }}
      VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.VITE_FIREBASE_MESSAGING_SENDER_ID }}
  ```

After building, confirm the old demo passwords are not in the site:
```bash
grep -r "Ujp123" dist ; grep -r "Rep123" dist     # both should print nothing
```
**Change those passwords anywhere else you have used them** — they have been served publicly with the site until now.

## 3. Move your existing data (one time)

Your current stock, prices and orders exist only in the **admin's browser**. To keep them:
1. Open the *new* Firebase build **in that same browser** and sign in as admin.
2. The **Firebase** panel at the top of the Admin Dashboard shows *"This browser still holds N products … and M orders"*.
3. Click **Copy to Firebase**. It:
   - only **reads** local data — nothing is deleted, the browser keeps it as a backup;
   - refuses if Firestore already holds inventory/orders (so it can never overwrite live data), or if the local data is inconsistent;
   - skips sample orders created by the *Test data* tool;
   - can be resumed if interrupted and can't be repeated once finished.

### What is **not** moved to Firebase (still per-browser)
Photo **captions, renames, Backup/Restore moves, and photos uploaded through the admin screen** (stored as base64 in the browser). They are not stock/orders, and uploaded images can't be shared without Firebase Storage — which you asked not to use. To publish a new product to everyone: add its image to `public/assets/folders/<folder>/` and list it in `src/data.js`, then set its stock/price in the Inventory tab. (A restored Backup photo gets a new id; its stock/price are re-created in Firestore from the values it had when backed up.)

## 4. Testing

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | business rules, Firestore transaction logic (incl. concurrent clicks), sign-in/roles, migration, autofill, translations… | Node only |
| `npm run test:e2e` | the real UI in a browser, original (Local) mode | Playwright + Chromium |
| `node tests/e2e/firebase.cjs` | the real UI through the Firebase code path, with an in-memory Firebase | Playwright + Chromium |
| `npm run test:rules` | **the Security Rules** against the official emulator | Java 11+, internet (first run) |

## 5. Costs & limits to be aware of
- Every storefront visit reads the whole `inventory` collection (one read per product, ~240). Firebase's free tier is 50,000 reads/day (≈ 200 visits/day) — beyond that it is billed at a small per-read price. If traffic grows, the usual fix is a single cached "catalogue" document.
- Anonymous customer identities are created per browser tab and are not cleaned up automatically (they cost nothing but appear in *Authentication → Users*).
- A customer who clears their browser data loses their remembered shop details (they just re-enter them); their past orders remain in Firestore.

## 6. Rolling back
Remove the `VITE_FIREBASE_*` values and rebuild: the app returns to Local mode. Firestore data is left as it is.
