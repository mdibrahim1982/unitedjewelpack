// Run with:  npm test
// Tests the Firestore transaction logic against an in-memory Firestore stand-in
// that re-runs transactions on conflict (optimistic concurrency), as Firestore does.
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/firebase/memoryStore.js";
import * as R from "../src/firebase/ordersRemote.js";

let passed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

const A = "rings:1";
const B = "rings:2";
const C = "rings:3";
const line = (key, pieces) => ({ key, folderId: key.split(":")[0], photoId: key.split(":")[1], caption: `P ${key}`, pieces });
const base = { shopName: "Shop", location: "Town", mobile: "9876543210", placedBy: "customer", salesRepName: "" };

async function setup(stock) {
  const store = createMemoryStore();
  for (const [key, physical] of Object.entries(stock)) {
    await store.set(R.inventoryPath(key), { physical, reserved: 0, price: null, folderId: key.split(":")[0], photoId: key.split(":")[1] });
  }
  return store;
}
const inv = (s, k) => s.get(R.inventoryPath(k));
const ord = (s, id) => s.get(R.orderPath(id));
const make = (s, id, lines) => R.createOrder(s, { ...base, id, lines });

// reserved must equal the sum of approved orders' reservations; never negative / above physical
async function invariants(s, keys) {
  const orders = await s.list("orders");
  for (const k of keys) {
    const d = await inv(s, k);
    const want = orders.filter((o) => o.status === "approved").flatMap((o) => o.reservedLines).filter((l) => l.key === k).reduce((a, l) => a + l.pieces, 0);
    assert.equal(d.reserved, want, `reserved drift on ${k}`);
    assert.ok(d.physical >= 0 && d.reserved >= 0 && d.reserved <= d.physical, `bad stock on ${k}: ${JSON.stringify(d)}`);
  }
}

test("create: stores a pending order and changes NO stock", async () => {
  const s = await setup({ [A]: 1000 });
  const r = await make(s, "o1", [line(A, 300)]);
  assert.equal(r.ok, true);
  assert.equal((await ord(s, "o1")).status, "pending");
  assert.deepEqual(await inv(s, A), { physical: 1000, reserved: 0, price: null, folderId: "rings", photoId: "1" });
});

test("create: duplicate order id, empty and invalid orders are refused", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  assert.equal((await make(s, "o1", [line(A, 5)])).code, "duplicate_order_id");
  assert.equal((await make(s, "e", [])).code, "empty_order");
  assert.equal((await make(s, "z", [line(A, 0)])).code, "invalid_quantity");
  assert.equal(s._count("orders"), 1);
});

test("create: no `undefined` reaches Firestore, and base64 photos are stripped from items", async () => {
  const s = await setup({ [A]: 100 });
  await R.createOrder(s, { ...base, id: "o1", lines: [line(A, 5)], salesRepUid: undefined,
    items: [{ key: A, caption: "x", img: "data:image/png;base64,AAAA", pcsPerUnit: 150, extra: undefined }] });
  const o = await ord(s, "o1");
  assert.ok(!JSON.stringify(o).includes("undefined"));
  assert.equal(o.items[0].img, "");
  const kept = await R.createOrder(s, { ...base, id: "o2", lines: [line(A, 5)], items: [{ key: A, img: "/assets/folders/x.jpg" }] });
  assert.equal((await ord(s, "o2")).items[0].img, "/assets/folders/x.jpg");
  assert.equal(kept.ok, true);
});

test("approve: reserves (reserved ↑, physical unchanged)", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  assert.equal((await R.approveOrder(s, "o1")).ok, true);
  assert.equal((await ord(s, "o1")).status, "approved");
  assert.deepEqual([(await inv(s, A)).physical, (await inv(s, A)).reserved], [1000, 300]);
});

test("approve: not enough free stock → refused, nothing written", async () => {
  const s = await setup({ [A]: 500 });
  await make(s, "o1", [line(A, 300)]);
  await make(s, "o2", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  const r = await R.approveOrder(s, "o2");
  assert.equal(r.code, "insufficient_stock");
  assert.deepEqual(r.shortages, [{ key: A, requested: 300, available: 200 }]);
  assert.equal((await ord(s, "o2")).status, "pending");
  assert.equal((await inv(s, A)).reserved, 300);
});

test("approve: a product with no inventory document counts as 0 stock", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(C, 10)]);
  assert.equal((await R.approveOrder(s, "o1")).code, "insufficient_stock");
});

test("approve: multi-line approval is all-or-nothing", async () => {
  const s = await setup({ [A]: 1000, [B]: 50 });
  await make(s, "o1", [line(A, 300), line(B, 100)]);
  assert.equal((await R.approveOrder(s, "o1")).code, "insufficient_stock");
  assert.equal((await inv(s, A)).reserved, 0);
});

test("reject / cancel a PENDING order: no stock change", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await make(s, "o2", [line(A, 300)]);
  assert.equal((await R.rejectOrder(s, "o1")).ok, true);
  assert.equal((await R.cancelOrder(s, "o2")).ok, true);
  assert.deepEqual([(await inv(s, A)).physical, (await inv(s, A)).reserved], [1000, 0]);
  assert.equal((await R.rejectOrder(s, "o1")).code, "invalid_status");
});

test("cancel an APPROVED order: releases the reservation, physical untouched", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  assert.equal((await R.cancelOrder(s, "o1")).ok, true);
  assert.deepEqual([(await inv(s, A)).physical, (await inv(s, A)).reserved], [1000, 0]);
  assert.equal((await R.cancelOrder(s, "o1")).code, "invalid_status"); // not twice
  assert.equal((await inv(s, A)).reserved, 0);
});

test("dispatch: deducts what was ACTUALLY sent and releases the whole reservation", async () => {
  const s = await setup({ [A]: 1000, [B]: 400 });
  await make(s, "o1", [line(A, 300), line(B, 100)]);
  await R.approveOrder(s, "o1");
  const r = await R.confirmDispatch(s, "o1", { [A]: 200, [B]: 100 });
  assert.equal(r.ok, true);
  const o = await ord(s, "o1");
  assert.equal(o.status, "dispatched");
  assert.equal(o.stockDeducted, true);
  assert.deepEqual([(await inv(s, A)).physical, (await inv(s, A)).reserved], [800, 0]); // 1000 − 200; the unsent 100 is free again
  assert.deepEqual([(await inv(s, B)).physical, (await inv(s, B)).reserved], [300, 0]);
});

test("dispatch: increase above ordered, remove a product, add a product — one atomic write", async () => {
  const s = await setup({ [A]: 1000, [B]: 400, [C]: 200 });
  await make(s, "o1", [line(A, 300), line(B, 100)]);
  await R.approveOrder(s, "o1");
  const extra = [{ key: C, folderId: "rings", photoId: "3", caption: "Added" }];
  const r = await R.confirmDispatch(s, "o1", { [A]: 350, [B]: 0, [C]: 60 }, extra);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([(await inv(s, A)).physical, (await inv(s, B)).physical, (await inv(s, C)).physical], [650, 400, 140]);
  assert.deepEqual([(await inv(s, A)).reserved, (await inv(s, B)).reserved, (await inv(s, C)).reserved], [0, 0, 0]);
  const lines = Object.fromEntries((await ord(s, "o1")).dispatchedLines.map((l) => [l.key, l]));
  assert.equal(lines[B].removed, true);
  assert.equal(lines[C].added, true);
  assert.equal(lines[A].extra, 50);
});

test("dispatch: an ADDED product can't use stock reserved for another order", async () => {
  const s = await setup({ [A]: 1000, [C]: 100 });
  await make(s, "o1", [line(A, 300)]);
  await make(s, "o2", [line(C, 80)]);
  await R.approveOrder(s, "o1");
  await R.approveOrder(s, "o2");
  const extra = [{ key: C, folderId: "rings", photoId: "3", caption: "x" }];
  assert.equal((await R.confirmDispatch(s, "o1", { [A]: 300, [C]: 21 }, extra)).code, "exceeds_available");
  assert.equal((await inv(s, C)).physical, 100);
  assert.equal((await R.confirmDispatch(s, "o1", { [A]: 300, [C]: 20 }, extra)).ok, true);
  assert.deepEqual([(await inv(s, C)).physical, (await inv(s, C)).reserved], [80, 80]);
  await invariants(s, [A, C]);
});

test("dispatch: a failed validation writes nothing", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  const before = JSON.stringify(s._dump());
  for (const bad of [{ [A]: -1 }, { [A]: 1.5 }, { [A]: 1001 }, { [A]: 0 }, {}]) {
    assert.equal((await R.confirmDispatch(s, "o1", bad)).ok, false);
  }
  assert.equal(JSON.stringify(s._dump()), before);
});

test("dispatch: confirming TWICE in a row deducts only once", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  assert.equal((await R.confirmDispatch(s, "o1", { [A]: 300 })).ok, true);
  assert.equal((await R.confirmDispatch(s, "o1", { [A]: 300 })).code, "invalid_status");
  assert.equal((await inv(s, A)).physical, 700); // NOT 400
});

test("dispatch: 5 SIMULTANEOUS confirmations (double-click / several admins) → exactly one succeeds", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  const results = await Promise.all(Array.from({ length: 5 }, () => R.confirmDispatch(s, "o1", { [A]: 300 })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.code === "invalid_status").length, 4);
  assert.equal((await inv(s, A)).physical, 700);
});

test("approve: 3 SIMULTANEOUS orders for 500 pcs of stock (300 each) → only one is reserved", async () => {
  const s = await setup({ [A]: 500 });
  for (const id of ["a", "b", "c"]) await make(s, id, [line(A, 300)]);
  const results = await Promise.all(["a", "b", "c"].map((id) => R.approveOrder(s, id)));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal((await inv(s, A)).reserved, 300);
  await invariants(s, [A]);
});

test("approve + cancel racing on the same order never corrupt the reservation", async () => {
  for (let i = 0; i < 20; i++) {
    const s = await setup({ [A]: 1000 });
    await make(s, "o1", [line(A, 300)]);
    await Promise.all([R.approveOrder(s, "o1"), R.cancelOrder(s, "o1")]);
    await invariants(s, [A]);
  }
});

test("manual stock edit: refuses to go below what is reserved; accepts valid values", async () => {
  const s = await setup({ [A]: 1000 });
  await make(s, "o1", [line(A, 300)]);
  await R.approveOrder(s, "o1");
  const r = await R.setPhysical(s, A, 200);
  assert.deepEqual([r.ok, r.code, r.reserved], [false, "below_reserved", 300]);
  assert.equal((await R.setPhysical(s, A, 300)).ok, true);
  assert.equal((await inv(s, A)).physical, 300);
  assert.equal((await R.setPhysical(s, A, -5)).code, "invalid_quantity");
  assert.equal((await R.setPhysical(s, A, 2.5)).code, "invalid_quantity");
});

test("price: set, clear, and reject nonsense — stock untouched", async () => {
  const s = await setup({ [A]: 1000 });
  assert.equal((await R.setPrice(s, A, 7.25)).ok, true);
  assert.equal((await inv(s, A)).price, 7.25);
  assert.equal((await R.setPrice(s, A, null)).ok, true);
  assert.equal((await inv(s, A)).price, null);
  assert.equal((await R.setPrice(s, A, -1)).code, "invalid_price");
  assert.equal((await inv(s, A)).physical, 1000);
  await R.setPrice(s, "new:9", 3); // a product with no document yet
  assert.deepEqual([(await inv(s, "new:9")).physical, (await inv(s, "new:9")).price], [0, 3]);
});

test("seedIfMissing: creates missing documents and NEVER overwrites existing ones", async () => {
  const s = await setup({ [A]: 1000 });
  const n = await R.seedIfMissing(s, [{ key: A, physical: 5, price: 1 }, { key: B, physical: 40, price: 2.5 }]);
  assert.equal(n, 1);
  assert.equal((await inv(s, A)).physical, 1000);
  assert.deepEqual([(await inv(s, B)).physical, (await inv(s, B)).price], [40, 2.5]);
});

test("FUZZ: 400 random operations in parallel batches — stock accounting stays exact", async () => {
  let seed = 424242;
  const rnd = (n) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
  const keys = [A, B, C];
  const start = { [A]: 800, [B]: 500, [C]: 300 };
  const s = await setup(start);
  let n = 0;
  for (let round = 0; round < 80; round++) {
    const orders = await s.list("orders");
    // Mostly act on orders in a sensible state (so approvals and dispatches
    // really happen), but sometimes on a random one to exercise the refusals.
    const pickFrom = (status) => {
      const pool = rnd(5) === 0 ? orders : orders.filter((o) => o.status === status);
      return pool.length ? pool[rnd(pool.length)] : null;
    };
    const ops = [];
    for (let j = 0; j < 5; j++) {
      const r = rnd(10);
      if (r < 3) {
        const ls = []; for (let k = 0; k < 1 + rnd(2); k++) ls.push(line(keys[rnd(3)], 1 + rnd(150)));
        ops.push(make(s, `o${n++}`, ls));
      } else if (r < 6) {
        ops.push(R.approveOrder(s, pickFrom("pending")?.id ?? "none"));
      } else if (r < 9) {
        const o = pickFrom("approved");
        const sent = {};
        for (const l of o?.lines || []) sent[l.key] = rnd(l.pieces * 2 + 1);
        ops.push(R.confirmDispatch(s, o?.id ?? "none", sent));
      } else {
        ops.push((rnd(2) ? R.rejectOrder : R.cancelOrder)(s, pickFrom("pending")?.id ?? "none"));
      }
    }
    await Promise.all(ops);
    await invariants(s, keys);
  }
  // every piece that left the shelf is accounted for by exactly one dispatched order
  const all = await s.list("orders");
  const dispatched = all.filter((o) => o.status === "dispatched");
  assert.ok(dispatched.length > 5, `only ${dispatched.length} dispatched — fuzz too weak`);
  assert.ok(dispatched.every((o) => o.stockDeducted === true));
  const sent = dispatched.flatMap((o) => o.dispatchedLines).reduce((a, l) => a + l.dispatched, 0);
  let now = 0;
  for (const k of keys) now += (await inv(s, k)).physical;
  assert.equal(Object.values(start).reduce((a, b) => a + b, 0) - now, sent, "stock deducted ≠ stock dispatched");
});

(async () => {
  console.log("\nFirestore order/inventory transaction tests\n");
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
})();
