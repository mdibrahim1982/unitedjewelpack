// Run with:  npm test
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/firebase/memoryStore.js";
import { planMigration, runMigration, readLocalData } from "../src/firebase/migration.js";

let passed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

const local = () => ({
  patches: {
    "ring-boxes": {
      deletedIds: [], edits: {}, prices: { "1": 8, "2": 7.5 }, stock: { "1": 1000, "2": 400 },
      added: [{ id: "new-1", img: "data:x", caption: "Mine", stock: 50, price: 3 }],
    },
    "coin-boxes": { stock: { "4": 20 }, prices: {}, added: [] },
  },
  orders: [
    { id: "o-pending", status: "pending", lines: [], createdAt: "2026-01-01T00:00:00Z" },
    { id: "o-approved", status: "approved", lines: [], reservedLines: [{ key: "ring-boxes:1", pieces: 300 }], createdAt: "2026-01-02T00:00:00Z" },
    { id: "o-done", status: "dispatched", lines: [], createdAt: "2026-01-03T00:00:00Z" },
    { id: "mock-D1", status: "dispatched", mock: true, lines: [], createdAt: "2026-01-04T00:00:00Z" },
  ],
});

test("plan: collects stock and prices for base AND uploaded products, plus reserved from approved orders", () => {
  const plan = planMigration(local());
  const byKey = Object.fromEntries(plan.inventory.map((p) => [p.key, p]));
  assert.deepEqual(byKey["ring-boxes:1"], { key: "ring-boxes:1", physical: 1000, reserved: 300, price: 8 });
  assert.deepEqual(byKey["ring-boxes:2"], { key: "ring-boxes:2", physical: 400, reserved: 0, price: 7.5 });
  assert.deepEqual(byKey["ring-boxes:new-1"], { key: "ring-boxes:new-1", physical: 50, reserved: 0, price: 3 });
  assert.equal(byKey["coin-boxes:4"].physical, 20);
  assert.equal(plan.problems.length, 0);
});

test("plan: sample (mock) orders are not copied; real ones all are", () => {
  const plan = planMigration(local());
  assert.deepEqual(plan.orders.map((o) => o.id), ["o-pending", "o-approved", "o-done"]);
  assert.equal(plan.skippedMock, 1);
});

test("plan: inconsistent local data (reserved > stock) is flagged, not silently fixed", () => {
  const d = local();
  d.orders[1].reservedLines = [{ key: "ring-boxes:1", pieces: 5000 }];
  assert.deepEqual(planMigration(d).problems, [{ key: "ring-boxes:1", physical: 1000, reserved: 5000 }]);
});

test("plan: never modifies the data it reads", () => {
  const d = local();
  const before = JSON.stringify(d);
  planMigration(d);
  assert.equal(JSON.stringify(d), before);
});

test("run: copies inventory + orders and marks the migration done", async () => {
  const store = createMemoryStore();
  const r = await runMigration(store, planMigration(local()));
  assert.deepEqual([r.ok, r.counts.inventory, r.counts.orders], [true, 4, 3]);
  assert.equal(store._count("inventory"), 4);
  assert.equal(store._count("orders"), 3);
  const inv = await store.get("inventory/ring-boxes:1");
  assert.deepEqual([inv.physical, inv.reserved, inv.price], [1000, 300, 8]);
  assert.equal((await store.get("meta/migration")).status, "done");
  assert.equal((await store.get("orders/o-approved")).status, "approved");
});

test("run: can't be repeated once done", async () => {
  const store = createMemoryStore();
  await runMigration(store, planMigration(local()));
  assert.equal((await runMigration(store, planMigration(local()))).code, "already_done");
});

test("run: refuses if Firestore already has inventory or orders (never overwrites live data)", async () => {
  const s1 = createMemoryStore();
  await s1.set("inventory/ring-boxes:1", { physical: 7, reserved: 0, price: null });
  assert.equal((await runMigration(s1, planMigration(local()))).code, "remote_not_empty");
  assert.equal((await s1.get("inventory/ring-boxes:1")).physical, 7); // untouched

  const s2 = createMemoryStore();
  await s2.set("orders/live", { status: "pending" });
  assert.equal((await runMigration(s2, planMigration(local()))).code, "remote_not_empty");
});

test("run: refuses inconsistent data and writes nothing", async () => {
  const d = local();
  d.orders[1].reservedLines = [{ key: "ring-boxes:1", pieces: 5000 }];
  const store = createMemoryStore();
  const r = await runMigration(store, planMigration(d));
  assert.deepEqual([r.ok, r.code], [false, "inconsistent"]);
  assert.equal(store._count("inventory"), 0);
  assert.equal(await store.get("meta/migration"), null);
});

test("run: an interrupted run (marker in_progress) can be re-run safely", async () => {
  const store = createMemoryStore();
  await store.set("meta/migration", { status: "in_progress" });
  await store.set("inventory/ring-boxes:1", { physical: 1000, reserved: 300, price: 8 }); // partly written earlier
  const r = await runMigration(store, planMigration(local()));
  assert.equal(r.ok, true);
  assert.equal(store._count("inventory"), 4);
  assert.equal((await store.get("meta/migration")).status, "done");
});

test("run: nothing to copy is reported, not treated as success", async () => {
  assert.equal((await runMigration(createMemoryStore(), planMigration({}))).code, "nothing_to_copy");
});

test("readLocalData reads the app's saved keys and tolerates bad data", () => {
  const mk = (o) => ({ getItem: (k) => (k in o ? o[k] : null) });
  const r = readLocalData(mk({ ujp_photo_patches: JSON.stringify({ a: 1 }), ujp_orders: "not json" }));
  assert.deepEqual([r.patches, r.orders], [{ a: 1 }, []]);
});

(async () => {
  console.log("\nLocal → Firebase migration tests\n");
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
})();
