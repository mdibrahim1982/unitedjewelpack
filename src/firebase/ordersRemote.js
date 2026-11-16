// ===================== orders & inventory on Firestore =====================
// The business rules are NOT re-written here. They live in inventoryLedger.js
// (the same pure functions the local version uses and the tests cover). This
// file only loads the documents a rule needs, runs the rule, and writes the
// result back — all inside ONE Firestore transaction, so:
//   • the order status and the stock figures change together or not at all;
//   • a repeated click / second admin can't apply the same step twice (the
//     status is re-read inside the transaction; if the order changed meanwhile
//     Firestore re-runs the transaction and the rule now says "invalid_status");
//   • two orders can't both claim the last of the stock.
//
// Why "reserved" is stored on each product: Firestore transactions can read
// documents but not run queries, so the sum of approved orders can't be
// re-derived inside one. Each inventory document therefore carries
// { physical, reserved } and the transaction updates them with the order.
//
// Data model
//   inventory/{folderId:photoId}  { physical, reserved, price, folderId, photoId, updatedAt }
//   orders/{orderId}              the same order record the app already uses

import {
  STATUS,
  createPendingOrder,
  approveOrder as ledgerApprove,
  rejectOrder as ledgerReject,
  cancelOrder as ledgerCancel,
  confirmDispatch as ledgerDispatch,
} from "../inventoryLedger.js";

export const inventoryPath = (key) => `inventory/${key}`;
export const orderPath = (id) => `orders/${id}`;

const whole = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const iso = (d) => (d instanceof Date ? d : new Date()).toISOString();

// Firestore rejects `undefined`, and has a 1 MiB document limit — so drop
// undefined values and never store an uploaded photo's base64 image inside an
// order (the order already has the product key and caption).
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

export function sanitizeOrder(order) {
  const o = { ...order };
  if (Array.isArray(o.items)) {
    o.items = o.items.map((it) => ({
      ...it,
      img: typeof it.img === "string" && it.img.startsWith("data:") ? "" : it.img,
    }));
  }
  return o;
}

const splitKey = (key) => {
  const i = key.indexOf(":");
  return { folderId: key.slice(0, i), photoId: key.slice(i + 1) };
};

// Reads the inventory documents for `keys` → Map(key → { physical, reserved, price })
async function loadInventory(tx, keys) {
  const unique = [...new Set(keys)];
  const docs = await Promise.all(unique.map((k) => tx.get(inventoryPath(k))));
  const map = new Map();
  unique.forEach((k, i) => {
    const d = docs[i];
    map.set(k, {
      physical: whole(d?.physical),
      reserved: whole(d?.reserved),
      price: d && Number.isFinite(d.price) ? d.price : null,
    });
  });
  return map;
}

// The ledger rules compute "reserved" from approved orders. Here the total is
// already known per product, so it is handed over as one synthetic approved
// order carrying exactly those numbers.
function reservedAsOrder(inv) {
  return {
    id: "__reserved__",
    status: STATUS.APPROVED,
    lines: [],
    reservedLines: [...inv].map(([key, v]) => ({ key, pieces: v.reserved })),
  };
}

function writeInventory(tx, key, cur, changes, now) {
  const { folderId, photoId } = splitKey(key);
  tx.set(
    inventoryPath(key),
    {
      physical: changes.physical ?? cur.physical,
      reserved: changes.reserved ?? cur.reserved,
      price: cur.price,
      folderId,
      photoId,
      updatedAt: iso(now),
    },
    { merge: true }
  );
}

// ---------------------------------------------------------------- orders

// Creating an order never touches stock — it only records a pending request.
export async function createOrder(store, order, now = new Date()) {
  const made = createPendingOrder([], sanitizeOrder(order), now);
  if (!made.ok) return made;
  const record = clean(made.order);
  return store.runTransaction(async (tx) => {
    if (await tx.get(orderPath(record.id))) return { ok: false, code: "duplicate_order_id" };
    tx.set(orderPath(record.id), record);
    return { ok: true, id: record.id, order: record };
  });
}

// Approve = reserve. Checks available stock against the live inventory docs.
export function approveOrder(store, id, now = new Date()) {
  return store.runTransaction(async (tx) => {
    const order = await tx.get(orderPath(id));
    if (!order) return { ok: false, code: "not_found" };
    const inv = await loadInventory(tx, (order.lines || []).map((l) => l.key));
    const result = ledgerApprove(
      [{ ...order, id }, reservedAsOrder(inv)],
      id,
      (k) => inv.get(k)?.physical ?? 0,
      now
    );
    if (!result.ok) return result;
    tx.set(orderPath(id), clean(result.order));
    for (const l of result.order.reservedLines) {
      const cur = inv.get(l.key);
      writeInventory(tx, l.key, cur, { reserved: cur.reserved + l.pieces }, now);
    }
    return { ok: true, order: result.order };
  });
}

// Reject: only a pending order can be rejected, and nothing was reserved.
export function rejectOrder(store, id, now = new Date()) {
  return store.runTransaction(async (tx) => {
    const order = await tx.get(orderPath(id));
    if (!order) return { ok: false, code: "not_found" };
    const result = ledgerReject([{ ...order, id }], id, now);
    if (!result.ok) return result;
    tx.set(orderPath(id), clean(result.order));
    return { ok: true, order: result.order };
  });
}

// Cancel: pending (nothing to release) or approved (release the reservation).
export function cancelOrder(store, id, now = new Date()) {
  return store.runTransaction(async (tx) => {
    const order = await tx.get(orderPath(id));
    if (!order) return { ok: false, code: "not_found" };
    const held = order.status === STATUS.APPROVED ? order.reservedLines || [] : [];
    const inv = await loadInventory(tx, held.map((l) => l.key));
    const result = ledgerCancel([{ ...order, id }], id, now);
    if (!result.ok) return result;
    tx.set(orderPath(id), clean(result.order));
    for (const l of held) {
      const cur = inv.get(l.key);
      writeInventory(tx, l.key, cur, { reserved: Math.max(0, cur.reserved - l.pieces) }, now);
    }
    return { ok: true, order: result.order };
  });
}

// Confirm dispatch: the ONLY place physical stock goes down for an order.
// `dispatched` = { productKey: piecesActuallySent }; `extraLines` = products
// added to the dispatch that weren't ordered. The deduction, the release of
// the reservation and the status change are one atomic write — and the status
// check inside means it can never be applied twice.
export function confirmDispatch(store, id, dispatched, extraLines = [], now = new Date()) {
  return store.runTransaction(async (tx) => {
    const order = await tx.get(orderPath(id));
    if (!order) return { ok: false, code: "not_found" };
    const keys = [
      ...(order.lines || []).map((l) => l.key),
      ...(extraLines || []).map((x) => x && x.key).filter(Boolean),
    ];
    const inv = await loadInventory(tx, keys);
    const result = ledgerDispatch(
      [{ ...order, id }, reservedAsOrder(inv)],
      id,
      dispatched,
      (k) => inv.get(k)?.physical ?? 0,
      now,
      extraLines
    );
    if (!result.ok) return result;

    const sold = new Map(result.stockDeltas.map((d) => [d.key, -d.delta]));
    const releasing = new Map((order.reservedLines || []).map((r) => [r.key, r.pieces]));
    tx.set(orderPath(id), clean(result.order));
    for (const [key, cur] of inv) {
      const out = sold.get(key) || 0;
      const rel = releasing.get(key) || 0;
      if (!out && !rel) continue;
      writeInventory(
        tx,
        key,
        cur,
        { physical: Math.max(0, cur.physical - out), reserved: Math.max(0, cur.reserved - rel) },
        now
      );
    }
    return { ok: true, order: result.order };
  });
}

// ------------------------------------------------------------- inventory
// (Admin-only in Security Rules.) Manual edits from the Inventory tab.

// Sets the physical stock. Refuses to go below what approved orders reserved.
export function setPhysical(store, key, stock, now = new Date()) {
  const n = Number(stock);
  if (!Number.isInteger(n) || n < 0) return Promise.resolve({ ok: false, code: "invalid_quantity" });
  return store.runTransaction(async (tx) => {
    const inv = await loadInventory(tx, [key]);
    const cur = inv.get(key);
    if (n < cur.reserved) return { ok: false, code: "below_reserved", reserved: cur.reserved };
    writeInventory(tx, key, cur, { physical: n }, now);
    return { ok: true };
  });
}

// price: a number ≥ 0, or null to clear it.
export function setPrice(store, key, price, now = new Date()) {
  if (price !== null && !(Number.isFinite(price) && price >= 0)) {
    return Promise.resolve({ ok: false, code: "invalid_price" });
  }
  return store.runTransaction(async (tx) => {
    const inv = await loadInventory(tx, [key]);
    const cur = inv.get(key);
    const { folderId, photoId } = splitKey(key);
    tx.set(
      inventoryPath(key),
      { physical: cur.physical, reserved: cur.reserved, price, folderId, photoId, updatedAt: iso(now) },
      { merge: true }
    );
    return { ok: true };
  });
}

// Creates inventory documents that don't exist yet; never overwrites one that
// does. products: [{ key, physical, price }]. Returns how many were created.
export async function seedIfMissing(store, products, now = new Date()) {
  let created = 0;
  for (const p of products) {
    const made = await store.runTransaction(async (tx) => {
      if (await tx.get(inventoryPath(p.key))) return false;
      const { folderId, photoId } = splitKey(p.key);
      tx.set(inventoryPath(p.key), {
        physical: whole(p.physical),
        reserved: 0,
        price: Number.isFinite(p.price) ? p.price : null,
        folderId,
        photoId,
        updatedAt: iso(now),
      });
      return true;
    });
    if (made) created++;
  }
  return created;
}
