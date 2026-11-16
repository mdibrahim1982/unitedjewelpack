// ===================== one-time copy: this browser → Firebase =====================
// Until now stock, prices and orders lived only in the admin's browser
// (localStorage). This copies them into Firestore, ONCE, from that browser.
//
// Safety rules:
//   • local data is only READ — nothing here deletes or changes it, so the old
//     data stays as a backup in the browser;
//   • it refuses to run if Firestore already holds inventory or orders, so it
//     can never overwrite data people have started using;
//   • it refuses if the local data is inconsistent (more stock reserved by
//     approved orders than exists), rather than "fixing" it silently;
//   • sample orders from the Test-data tool (mock: true) are not copied;
//   • progress is recorded in  meta/migration  (in_progress → done), so an
//     interrupted run can simply be started again, and a finished one can't be
//     repeated.

import { sanitizeOrder, clean, inventoryPath, orderPath } from "./ordersRemote.js";

const whole = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

export function readLocalData(storage) {
  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  return { patches: read("ujp_photo_patches", {}), orders: read("ujp_orders", []) };
}

// Works out exactly what would be copied, without writing anything.
export function planMigration({ patches = {}, orders = [] }) {
  const inv = new Map(); // key → { physical, price }
  const touch = (key) => {
    if (!inv.has(key)) inv.set(key, { physical: 0, price: null });
    return inv.get(key);
  };
  for (const [folderId, p] of Object.entries(patches)) {
    for (const [photoId, stock] of Object.entries(p?.stock || {})) {
      touch(`${folderId}:${photoId}`).physical = whole(stock);
    }
    for (const [photoId, price] of Object.entries(p?.prices || {})) {
      if (Number.isFinite(Number(price)) && Number(price) >= 0) touch(`${folderId}:${photoId}`).price = Number(price);
    }
    for (const a of p?.added || []) {
      const e = touch(`${folderId}:${a.id}`);
      if (a.stock != null) e.physical = whole(a.stock);
      if (Number.isFinite(Number(a.price)) && a.price !== null && Number(a.price) >= 0) e.price = Number(a.price);
    }
  }

  const real = orders.filter((o) => !o.mock);
  const skippedMock = orders.length - real.length;

  // what approved (not yet dispatched) orders have reserved
  const reserved = new Map();
  for (const o of real) {
    if (o.status !== "approved") continue;
    for (const r of o.reservedLines || []) reserved.set(r.key, (reserved.get(r.key) || 0) + whole(r.pieces));
  }

  const problems = [];
  const inventory = [];
  for (const key of new Set([...inv.keys(), ...reserved.keys()])) {
    const e = inv.get(key) || { physical: 0, price: null };
    const res = reserved.get(key) || 0;
    if (res > e.physical) problems.push({ key, physical: e.physical, reserved: res });
    inventory.push({ key, physical: e.physical, reserved: res, price: e.price });
  }
  return { inventory, orders: real, skippedMock, problems };
}

// → { ok:true, counts } | { ok:false, code, ... }
export async function runMigration(store, plan, now = new Date()) {
  if (plan.problems.length) return { ok: false, code: "inconsistent", problems: plan.problems };
  if (!plan.inventory.length && !plan.orders.length) return { ok: false, code: "nothing_to_copy" };

  const meta = await store.get("meta/migration");
  if (meta && meta.status === "done") return { ok: false, code: "already_done" };
  if (!meta) {
    const [anyInv, anyOrders] = await Promise.all([
      store.list("inventory", { limit: 1 }),
      store.list("orders", { limit: 1 }),
    ]);
    if (anyInv.length || anyOrders.length) return { ok: false, code: "remote_not_empty" };
  }

  const counts = { inventory: plan.inventory.length, orders: plan.orders.length };
  await store.set("meta/migration", { status: "in_progress", startedAt: now.toISOString(), counts });

  const stamp = now.toISOString();
  const entries = [
    ...plan.inventory.map((p) => {
      const i = p.key.indexOf(":");
      return {
        path: inventoryPath(p.key),
        data: { physical: p.physical, reserved: p.reserved, price: p.price, folderId: p.key.slice(0, i), photoId: p.key.slice(i + 1), updatedAt: stamp },
      };
    }),
    ...plan.orders.map((o) => ({ path: orderPath(o.id), data: clean(sanitizeOrder(o)) })),
  ];
  await store.batchSet(entries);

  await store.set("meta/migration", { status: "done", startedAt: stamp, finishedAt: new Date().toISOString(), counts });
  return { ok: true, counts };
}
