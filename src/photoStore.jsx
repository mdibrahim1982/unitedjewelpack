import { createContext, useContext, useEffect, useState } from "react";
import { ALL_FOLDERS as BASE_FOLDERS } from "./data";
import { USE_REMOTE } from "./backend";
import { getBackend } from "./firebase/backendFactory";
import { useRemoteInventory } from "./firebase/RemoteInventory";
import { setPhysical, setPrice, seedIfMissing } from "./firebase/ordersRemote";

// Local copy (not imported from pricingStore, which depends on this file).
function parseStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// ===================== photo store =====================
// This app has no backend, so admin edits (renaming captions, setting a
// unit price, deleting photos, adding new ones) are stored as a set of
// "patches" on top of the read-only FOLDERS list from data.js, persisted
// to localStorage:
//
//   { [folderId]: { deletedIds: [...], edits: { [photoId]: caption },
//                    prices: { [photoId]: number },
//                    added: [ { id, img, caption, price }, ... ] } }
//
// Uploaded photos are stored as base64 data URLs directly in the patch,
// so they live only in this browser. For a real multi-admin / multi-device
// deployment, replace this with calls to a real backend (upload endpoint +
// database) instead of localStorage.
//
// BASE_FOLDERS (from data.js) includes both the public folders and one
// admin-only "backup-<folderId>" folder per public folder (see
// BACKUP_FOLDERS in data.js). Backing up a photo doesn't destroy it — it's
// moved into its folder's backup (as an `added` entry there, tagged with
// `fromFolderId`) so it can be restored later, with its unit price intact.
// Public-facing components should use `publicFolders` / `getFolder`; the
// Admin Dashboard uses `folders` (everything, including backups).

const STORAGE_KEY = "ujp_photo_patches";

// One-time reset: every unit price ever saved from the Admin Dashboard is
// zeroed out (back to "no price set") the first time this runs in a given
// browser. Flagged so it only happens once, not on every load.
const PRICE_RESET_FLAG = "ujp_photo_prices_reset_v1";

function resetAllPrices(patches) {
  const reset = {};
  for (const [folderId, patch] of Object.entries(patches)) {
    reset[folderId] = {
      ...patch,
      prices: {},
      added: (patch.added || []).map((p) => ({ ...p, price: null })),
    };
  }
  return reset;
}

function loadPatches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let patches = raw ? JSON.parse(raw) : {};
    if (!localStorage.getItem(PRICE_RESET_FLAG)) {
      patches = resetAllPrices(patches);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(patches));
      localStorage.setItem(PRICE_RESET_FLAG, "1");
    }
    return patches;
  } catch {
    return {};
  }
}

function savePatches(patches) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patches));
  } catch {
    /* ignore (e.g. storage full/disabled) */
  }
}

function emptyPatch() {
  return { deletedIds: [], edits: {}, prices: {}, stock: {}, added: [] };
}

// Patches saved by older versions of the app may not have every field.
function normalizePatch(patch) {
  if (!patch) return emptyPatch();
  return {
    deletedIds: patch.deletedIds || [],
    edits: patch.edits || {},
    prices: patch.prices || {},
    stock: patch.stock || {},
    added: patch.added || [],
  };
}

function applyPatch(folder, rawPatch) {
  if (!rawPatch) return folder;
  const patch = normalizePatch(rawPatch);
  const kept = folder.photos
    .filter((p) => !patch.deletedIds.includes(p.id))
    .map((p) => {
      let next = p;
      if (patch.edits[p.id] !== undefined) {
        next = { ...next, caption: patch.edits[p.id] };
      }
      if (patch.prices[p.id] !== undefined) {
        next = { ...next, price: patch.prices[p.id] };
      }
      if (patch.stock[p.id] !== undefined) {
        next = { ...next, stock: patch.stock[p.id] };
      }
      return next;
    });
  // Newly uploaded photos are shown first, so the most recent upload is
  // the first thing an admin or customer sees in the folder.
  return { ...folder, photos: [...patch.added, ...kept] };
}

const PhotoStoreContext = createContext(null);

export function PhotoStoreProvider({ children }) {
  const [patches, setPatches] = useState(loadPatches);

  useEffect(() => {
    savePatches(patches);
  }, [patches]);

  // Photo ids repeat across folders (each folder numbers from 1), so every
  // photo is tagged with its folderId at read time. This is what lets
  // reservations and orders refer to one unambiguous product. The tag is
  // in-memory only — it is never written into the saved patches.
  const { inventory: remoteInventory } = useRemoteInventory();
  const [remoteError, setRemoteError] = useState(null);

  const folders = BASE_FOLDERS.map((f) => {
    const merged = applyPatch(f, patches[f.id]);
    return {
      ...merged,
      photos: merged.photos.map((p) => {
        if (!USE_REMOTE) return { ...p, folderId: f.id };
        // Firebase mode: Firestore is the source of truth for stock and price.
        // Values left in this browser's old local data are ignored here (and
        // never deleted — the admin "Copy to Firebase" tool migrates them).
        const doc = remoteInventory[`${f.id}:${p.id}`];
        return {
          ...p,
          folderId: f.id,
          stock: doc ? doc.physical : null,
          price: doc && Number.isFinite(doc.price) ? doc.price : null,
        };
      }),
    };
  });

  // Runs a Firestore write and surfaces a failure (permission denied, offline,
  // "below reserved"…) instead of silently losing it.
  async function remoteCall(fn) {
    try {
      const { store } = await getBackend();
      const r = await fn(store);
      setRemoteError(r && r.ok === false ? { code: r.code, reserved: r.reserved } : null);
      return r;
    } catch (e) {
      setRemoteError({ code: (e && e.code) || "error" });
      return { ok: false, code: "error" };
    }
  }

  function getFolder(slug) {
    return folders.find((f) => f.slug === slug) || null;
  }

  function updatePatch(folderId, updater) {
    setPatches((prev) => {
      const current = normalizePatch(prev[folderId]);
      const next = updater(current);
      return { ...prev, [folderId]: next };
    });
  }

  function addPhoto(folderId, photo) {
    addPhotos(folderId, [photo]);
  }

  // Accepts a list so the admin can upload several images at once. New
  // uploads are prepended, so the most recently uploaded batch is always
  // first — both within `added` and (via applyPatch) in the folder.
  function addPhotos(folderId, photos) {
    if (!photos || photos.length === 0) return;
    const stamp = Date.now();
    updatePatch(folderId, (patch) => ({
      ...patch,
      added: [
        ...photos.map(({ img, caption, price, hash, fileName }, i) => ({
          id: `new-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          img,
          caption: caption || "",
          price: price ?? null,
          // kept so a re-upload of the same picture can be recognised
          hash: hash ?? null,
          fileName: fileName ?? null,
        })),
        ...patch.added,
      ],
    }));
  }

  function updateCaption(folderId, photoId, caption) {
    updatePatch(folderId, (patch) => {
      // If this photo was added locally, edit it in place in `added`.
      const addedIndex = patch.added.findIndex((p) => p.id === photoId);
      if (addedIndex !== -1) {
        const added = [...patch.added];
        added[addedIndex] = { ...added[addedIndex], caption };
        return { ...patch, added };
      }
      return { ...patch, edits: { ...patch.edits, [photoId]: caption } };
    });
  }

  // `price` is a number (₹ per pc) or null to fall back to the default rate.
  function updatePrice(folderId, photoId, price) {
    if (USE_REMOTE) {
      remoteCall((store) =>
        setPrice(store, `${folderId}:${photoId}`, Number.isFinite(price) ? price : null)
      );
      return;
    }
    updatePatch(folderId, (patch) => {
      const addedIndex = patch.added.findIndex((p) => p.id === photoId);
      if (addedIndex !== -1) {
        const added = [...patch.added];
        added[addedIndex] = { ...added[addedIndex], price };
        return { ...patch, added };
      }
      if (price === null) {
        const prices = { ...patch.prices };
        delete prices[photoId];
        return { ...patch, prices };
      }
      return { ...patch, prices: { ...patch.prices, [photoId]: price } };
    });
  }

  // `stock` is the number of pieces (pc) an admin has on hand for a photo,
  // or null to clear it (no inventory limit for that item).
  function updateStock(folderId, photoId, stock) {
    if (USE_REMOTE) {
      const n = parseStock(stock);
      remoteCall((store) => setPhysical(store, `${folderId}:${photoId}`, n ?? 0));
      return;
    }
    updatePatch(folderId, (patch) => {
      const addedIndex = patch.added.findIndex((p) => p.id === photoId);
      if (addedIndex !== -1) {
        const added = [...patch.added];
        added[addedIndex] = { ...added[addedIndex], stock };
        return { ...patch, added };
      }
      if (stock === null) {
        const stockMap = { ...patch.stock };
        delete stockMap[photoId];
        return { ...patch, stock: stockMap };
      }
      return { ...patch, stock: { ...patch.stock, [photoId]: stock } };
    });
  }

  // Applies several relative stock changes in ONE state update, so a
  // dispatch touching many products either lands completely or not at all.
  // Never lets a product go below 0. deltas: [{ folderId, photoId, delta }]
  function adjustStockBatch(deltas) {
    // Firebase mode: stock only ever changes inside a Firestore transaction
    // (confirm dispatch / manual edit), never through this local helper.
    if (USE_REMOTE) return;
    setPatches((prev) => {
      const next = { ...prev };
      for (const { folderId, photoId, delta } of deltas) {
        const patch = normalizePatch(next[folderId]);
        const addedIndex = patch.added.findIndex((p) => p.id === photoId);
        if (addedIndex !== -1) {
          const added = [...patch.added];
          const current = parseStock(added[addedIndex].stock) ?? 0;
          added[addedIndex] = {
            ...added[addedIndex],
            stock: Math.max(0, current + delta),
          };
          next[folderId] = { ...patch, added };
        } else {
          const base = BASE_FOLDERS.find((f) => f.id === folderId)?.photos.find(
            (p) => p.id === photoId
          );
          const current = parseStock(patch.stock[photoId] ?? base?.stock) ?? 0;
          next[folderId] = {
            ...patch,
            stock: { ...patch.stock, [photoId]: Math.max(0, current + delta) },
          };
        }
      }
      return next;
    });
  }

  function deletePhoto(folderId, photoId) {
    deletePhotos(folderId, [photoId]);
  }

  function deletePhotos(folderId, photoIds) {
    // Grab the photos' current data before they're removed, so we can copy
    // them into the folder's backup (unless it's already a backup folder).
    const folder = folders.find((f) => f.id === folderId);
    const idSet = new Set(photoIds);
    const photosToBackup =
      folder && !folder.adminOnly
        ? folder.photos.filter((p) => idSet.has(p.id))
        : [];

    updatePatch(folderId, (patch) => {
      const prices = { ...patch.prices };
      const stock = { ...patch.stock };
      photoIds.forEach((id) => {
        delete prices[id];
        delete stock[id];
      });
      return {
        ...patch,
        prices,
        stock,
        added: patch.added.filter((p) => !idSet.has(p.id)),
        deletedIds: [
          ...patch.deletedIds,
          ...photoIds.filter((id) => !patch.added.some((p) => p.id === id)),
        ],
      };
    });

    if (photosToBackup.length > 0) {
      const backupId = `backup-${folderId}`;
      updatePatch(backupId, (patch) => ({
        ...patch,
        added: [
          ...patch.added,
          ...photosToBackup.map((photo, i) => ({
            id: `bak-${Date.now()}-${i}-${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            img: photo.img,
            caption: photo.caption,
            price: photo.price ?? null,
            hash: photo.hash ?? null,
            fileName: photo.fileName ?? null,
            stock: photo.stock ?? null,
            fromFolderId: folderId,
          })),
        ],
      }));
    }
  }

  function permanentlyDeleteBackupPhoto(backupFolderId, photoId) {
    updatePatch(backupFolderId, (patch) => ({
      ...patch,
      added: patch.added.filter((p) => p.id !== photoId),
    }));
  }

  function permanentlyDeleteBackupPhotos(backupFolderId, photoIds) {
    const idSet = new Set(photoIds);
    updatePatch(backupFolderId, (patch) => ({
      ...patch,
      added: patch.added.filter((p) => !idSet.has(p.id)),
    }));
  }

  function restorePhoto(backupFolderId, photoId) {
    restorePhotos(backupFolderId, [photoId]);
  }

  function restorePhotos(backupFolderId, photoIds) {
    const backupFolder = folders.find((f) => f.id === backupFolderId);
    if (!backupFolder) return;
    const idSet = new Set(photoIds);
    const photosToRestore = backupFolder.photos.filter((p) => idSet.has(p.id));
    if (photosToRestore.length === 0) return;

    // Remove them from the backup folder.
    updatePatch(backupFolderId, (patch) => ({
      ...patch,
      added: patch.added.filter((p) => !idSet.has(p.id)),
    }));

    // Group by the folder they should return to (normally they all share
    // the same target, since one backup folder maps to one source folder).
    const byTarget = new Map();
    photosToRestore.forEach((photo) => {
      const targetFolderId =
        photo.fromFolderId ||
        backupFolder.restoreTargetId ||
        backupFolderId.replace(/^backup-/, "");
      if (!byTarget.has(targetFolderId)) byTarget.set(targetFolderId, []);
      byTarget.get(targetFolderId).push(photo);
    });

    byTarget.forEach((photos, targetFolderId) => {
      const stamp = Date.now();
      const ids = photos.map(
        (_, i) => `restored-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`
      );
      // A restored product gets a NEW id, so in Firebase mode its inventory
      // document is created from the stock/price it had when it was backed up
      // (never overwriting an existing one).
      if (USE_REMOTE) {
        const seeds = photos.map((photo, i) => ({
          key: `${targetFolderId}:${ids[i]}`,
          physical: photo.stock ?? 0,
          price: photo.price ?? null,
        }));
        remoteCall((store) => seedIfMissing(store, seeds));
      }
      updatePatch(targetFolderId, (patch) => ({
        ...patch,
        added: [
          ...patch.added,
          ...photos.map((photo, i) => ({
            id: ids[i],
            img: photo.img,
            caption: photo.caption,
            price: photo.price ?? null,
            hash: photo.hash ?? null,
            fileName: photo.fileName ?? null,
            stock: photo.stock ?? null,
          })),
        ],
      }));
    });
  }

  function resetFolder(folderId) {
    setPatches((prev) => {
      const next = { ...prev };
      delete next[folderId];
      return next;
    });
  }

  const publicFolders = folders.filter((f) => !f.adminOnly);

  return (
    <PhotoStoreContext.Provider
      value={{
        folders,
        publicFolders,
        getFolder,
        addPhoto,
        addPhotos,
        updateCaption,
        updatePrice,
        updateStock,
        adjustStockBatch,
        deletePhoto,
        deletePhotos,
        restorePhoto,
        restorePhotos,
        permanentlyDeleteBackupPhoto,
        permanentlyDeleteBackupPhotos,
        resetFolder,
        remoteError,
        clearRemoteError: () => setRemoteError(null),
      }}
    >
      {children}
    </PhotoStoreContext.Provider>
  );
}

export function usePhotoStore() {
  const ctx = useContext(PhotoStoreContext);
  if (!ctx) {
    throw new Error("usePhotoStore must be used inside a PhotoStoreProvider");
  }
  return ctx;
}
