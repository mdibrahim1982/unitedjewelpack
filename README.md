# Jewel Boxes — United Jewel Pack

A React + Vite app: a home page titled **"Jewel Boxes"** showing one tile
per photo folder (e.g. **Ring Boxes**, **Kammal Boxes**). Opening a folder
shows its photos in a grid. Includes an **admin login** for adding,
renaming, and deleting photos, full **English / Tamil** localization, a
**mobile/tablet-responsive layout** tuned for Android and iOS, and a
**"select photos → send to WhatsApp"** flow for customers.

## Run it

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## Build for deployment

```bash
npm run build
```

This outputs a static `dist/` folder you can host anywhere (Netlify,
Vercel, GitHub Pages, S3, etc.). Preview the production build locally
with `npm run preview`.

## Admin login

Click **Admin** in the header (or go to `#/admin`) to sign in:

- **Email:** `unitedjewelpack@gmail.com`
- **Password:** `Ujp123$`

Once signed in you land on the **Admin Dashboard**, where you can:
- pick a folder from the left-hand list
- **upload a new photo** with a caption
- **edit** an existing photo's caption
- **delete** a photo (with a confirmation prompt)

> **Important — this is a front-end-only demo.** There is no backend, so:
> - The admin credentials are hardcoded in `src/auth.jsx` and shipped in the
>   built JavaScript. Anyone who inspects the deployed site can read them.
>   This is fine for a local prototype but is **not secure for production**.
> - Admin edits (new/renamed/deleted photos) are saved to this **browser's
>   `localStorage` only**. They will not appear for other visitors or on
>   other devices, and clearing site data / using a different browser will
>   reset them back to the photos baked into `src/data.js`.
>
> To make this production-ready, replace `src/auth.jsx` with a real
> authentication provider (Firebase Auth, Auth0, your own API with hashed
> passwords, etc.) and replace `src/photoStore.jsx`'s localStorage calls
> with requests to a real backend (an upload endpoint + a database).

## Localization (English / Tamil)

A language switch (**EN** / **தமிழ்**) sits in the header on every page,
including the admin login and dashboard. The chosen language is remembered
in `localStorage` between visits.

All UI text is centralized in `src/i18n.jsx`. To change any wording, or to
add a third language:

1. Open `src/i18n.jsx`.
2. Each translation key (e.g. `homeTitle`, `signIn`) has an entry under both
   `en: { ... }` and `ta: { ... }`.
3. To add a new language, copy the `en` block, translate every value, and
   give it a new top-level key (e.g. `hi: { ... }` for Hindi) — then add a
   button for it in `src/components/LanguageSwitch.jsx`.

Folder display names (e.g. "Ring Boxes" → "மோதிர பெட்டிகள்") are translated
separately via the `FOLDER_NAME_TA` map at the top of `src/i18n.jsx` — add
an entry there for any new folder's slug if you want a Tamil name for it.

## Send selected photos to WhatsApp (customer flow)

Inside any folder, a customer can tap **Select photos**, tap the photos
they're interested in (checkmarks appear), then tap **Send to WhatsApp**.

Because WhatsApp's `wa.me` links can only pre-fill **text** (they cannot
attach images), this is handled two ways depending on the device:

- **Devices with native sharing** (most Android browsers, iOS Safari
  15+): the actual selected image files are handed to the phone's share
  sheet together with a text message, and the customer picks **WhatsApp**
  from that sheet — the photos go through as real attachments.
- **Everywhere else** (older browsers, desktop): a WhatsApp chat opens
  with the owner's number and a pre-filled text message listing which
  photos were selected (by folder + caption). The message asks the
  customer to also attach the photos manually from their gallery, since a
  plain link truly cannot attach files on its own.

The owner's WhatsApp number is the same `PHONE_NUMBER` used everywhere else
— set it once in `src/data.js` and both the header's WhatsApp button and
this selection flow use it. The message text and native-share logic live
in `src/shareSelection.js`.

## Mobile & tablet responsiveness (Android + iOS)

The layout is responsive across five breakpoints, covering common Android
and iOS phone and tablet sizes:

| Breakpoint | Roughly covers |
|---|---|
| ≥1024px | Desktop / laptop |
| 1024px | Tablets landscape (iPad landscape, Android tablets) |
| 834px  | Tablets portrait (iPad Air/Pro portrait), large phones landscape |
| 640px  | Large phones (iPhone Pro Max, big Android phones) |
| 480px  | Standard phones (iPhone SE/12/13/14, most Android phones) |
| 380px  | Small / narrow phones |

Also included:
- **iOS safe-area support** — content, the header, footer, floating
  WhatsApp button, and the sticky "send selected photos" bar all respect
  the notch / home-indicator insets (`env(safe-area-inset-*)`), so nothing
  sits under the status bar or gets clipped by the home indicator.
- **No unwanted iOS zoom** — form inputs use a 16px base font size, which
  stops Safari from auto-zooming the page when a field is focused.
- **Comfortably sized tap targets** — buttons keep a minimum ~40–44px
  height, following Apple's and Android's touch-target guidance.
- The admin dashboard's folder list becomes a horizontally scrollable row
  on tablet-and-below, and the photo/upload grids stack down to a single
  column on phones.

## Project structure

```
src/
├── App.jsx                    — routes: home / folder / admin login / admin dashboard
├── data.js                    — FOLDERS array: base photos (see below)
├── i18n.jsx                   — translations + language switch state
├── auth.jsx                   — admin login/logout state (see security note above)
├── photoStore.jsx             — merges admin edits on top of FOLDERS, saved to localStorage
├── shareSelection.js          — builds the WhatsApp message + native share for selected photos
├── components/
│   ├── Header.jsx             — top bar: brand, language switch, phone/WhatsApp, Admin link
│   ├── Footer.jsx
│   ├── WhatsAppFloat.jsx      — floating WhatsApp button
│   ├── LanguageSwitch.jsx     — EN / தமிழ் toggle
│   ├── FolderGrid.jsx         — home page (folder tiles)
│   ├── PhotoGrid.jsx          — photo grid inside an open folder, with select-and-send
│   ├── AdminLogin.jsx         — email/password sign-in form
│   └── AdminDashboard.jsx     — folder picker + photo manager (add/edit/delete)
└── index.css                  — includes all responsive breakpoints

public/assets/folders/
├── ring-boxes/    — photos shown in the "Ring Boxes" folder
└── kammal-boxes/  — photos shown in the "Kammal Boxes" folder
```

## Add a new folder

1. Create a new directory under `public/assets/folders/<your-folder-slug>/`
   and drop the photos in there.
2. Open `src/data.js` and add a new entry to the `FOLDERS` array:

   ```js
   {
     id: "chain-boxes",
     slug: "chain-boxes",
     name: "Chain Boxes",
     cover: "/assets/folders/chain-boxes/photo-1.jpg",
     photos: [
       { id: 1, img: "/assets/folders/chain-boxes/photo-1.jpg", caption: "..." },
       { id: 2, img: "/assets/folders/chain-boxes/photo-2.jpg", caption: "..." },
     ],
   },
   ```

3. (Optional) Add a Tamil name for it in `FOLDER_NAME_TA` in `src/i18n.jsx`.

That's it — a new tile appears on the home page automatically, and it's
also manageable from the admin dashboard.

## Add more photos to an existing folder

Either:
- **As a visitor to the code:** drop the image into that folder's directory
  under `public/assets/folders/`, then add a matching `{ id, img, caption }`
  entry to that folder's `photos` array in `src/data.js`; or
- **As an admin:** sign in, open the folder in the dashboard, and use
  **Upload a photo** — no code changes needed (saved to this browser only,
  see the security note above).

## Notes

- Folder and admin pages are shareable/bookmarkable via the URL hash
  (`#/ring-boxes`, `#/admin`), and the browser back/forward buttons work.
- To change the phone number / WhatsApp contact, edit `PHONE_NUMBER` at the
  top of `src/data.js`.
- A folder with no photos shows a "No photos yet" message instead of a
  blank grid, both on the public site and in the admin dashboard.
- The native share (files + WhatsApp) path only works when the app is
  served over **HTTPS** (or `localhost` during development) — the Web
  Share API is blocked on plain HTTP for security reasons. Any normal
  hosting provider (Netlify, Vercel, etc.) serves HTTPS by default.
- Test on a real phone/tablet where possible — simulators are a good first
  pass, but the native share sheet and safe-area insets are easiest to
  confirm on an actual Android or iOS device.
