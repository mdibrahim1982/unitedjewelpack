import { buildMockData } from "./mockData.js";

// ===================== mock data loader =====================
// Writes mock stock, prices and orders straight into the app's saved data
// (the caller then reloads the page so every store picks it up).
//
// Deliberately narrow, so it can't damage real work:
//   • it only touches per-product stock and price — never photos, captions,
//     deletions or backups;
//   • before changing anything it saves the previous stock/price values, so
//     "Remove mock data" puts them back exactly;
//   • mock orders carry `mock: true`, so removal deletes only those and
//     leaves any real order alone;
//   • it refuses to run while real orders are pending/approved, because
//     replacing stock under live reservations could break them.

const PATCHES_KEY = "ujp_photo_patches";
const ORDERS_KEY = "ujp_orders";
const META_KEY = "ujp_mock_meta";
const PRICE_FLAG = "ujp_photo_prices_reset_v1"; // photoStore's one-time price reset
export const MOCK_FLASH_KEY = "ujp_mock_flash";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

function normalise(patch) {
  return {
    deletedIds: [],
    edits: {},
    prices: {},
    stock: {},
    added: [],
    ...(patch || {}),
  };
}

export function mockStatus() {
  return read(META_KEY, null);
}

// Snapshot the stock/price values we're about to overwrite.
function capture(patches, folderIds) {
  const backup = {};
  for (const id of folderIds) {
    const p = normalise(patches[id]);
    backup[id] = {
      stock: { ...p.stock },
      prices: { ...p.prices },
      added: Object.fromEntries(
        p.added.map((a) => [String(a.id), { stock: a.stock ?? null, price: a.price ?? null }])
      ),
    };
  }
  return backup;
}

function restore(patches, backup) {
  for (const [folderId, b] of Object.entries(backup)) {
    const p = normalise(patches[folderId]);
    p.stock = { ...b.stock };
    p.prices = { ...b.prices };
    p.added = p.added.map((a) => {
      const was = b.added[String(a.id)];
      if (!was) return a;
      const next = { ...a };
      if (was.stock === null) delete next.stock;
      else next.stock = was.stock;
      next.price = was.price;
      return next;
    });
    patches[folderId] = p;
  }
}

function hasActiveRealOrders(orders) {
  return orders.some((o) => !o.mock && (o.status === "pending" || o.status === "approved"));
}

// publicFolders: [{ id, name, photos:[{ id, caption, img }] }]
export function loadMockData(publicFolders) {
  let orders = read(ORDERS_KEY, []);
  if (hasActiveRealOrders(orders)) return { ok: false, code: "active_orders" };

  const patches = read(PATCHES_KEY, {});
  const prior = read(META_KEY, null);
  if (prior) restore(patches, prior.backup); // start from the true original
  orders = orders.filter((o) => !o.mock);

  const data = buildMockData(publicFolders);
  if (!data.ok) return data;

  const backup = capture(patches, publicFolders.map((f) => f.id));

  for (const [key, stock] of Object.entries(data.stock)) {
    const sep = key.indexOf(":");
    const folderId = key.slice(0, sep);
    const photoId = key.slice(sep + 1);
    const price = data.prices[key];
    const p = normalise(patches[folderId]);
    const idx = p.added.findIndex((a) => String(a.id) === photoId);
    if (idx !== -1) {
      p.added = p.added.slice();
      p.added[idx] = { ...p.added[idx], stock, price };
    } else {
      p.stock = { ...p.stock, [photoId]: stock };
      p.prices = { ...p.prices };
      if (price === null) delete p.prices[photoId];
      else p.prices[photoId] = price;
    }
    patches[folderId] = p;
  }

  write(PATCHES_KEY, patches);
  write(ORDERS_KEY, [...data.orders, ...orders]);
  write(META_KEY, { loadedAt: new Date().toISOString(), backup, summary: data.summary });
  localStorage.setItem(PRICE_FLAG, "1"); // don't let the one-time price reset wipe these
  return { ok: true, summary: data.summary };
}

export function removeMockData() {
  const meta = read(META_KEY, null);
  if (!meta) return { ok: false, code: "no_mock_data" };
  const patches = read(PATCHES_KEY, {});
  restore(patches, meta.backup);
  write(PATCHES_KEY, patches);
  write(ORDERS_KEY, read(ORDERS_KEY, []).filter((o) => !o.mock));
  localStorage.removeItem(META_KEY);
  return { ok: true };
}
