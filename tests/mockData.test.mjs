// Run with:  npm test
import assert from "node:assert/strict";
import { FOLDERS } from "../src/data.js";
import { buildMockData } from "../src/mockData.js";
import {
  STATUS, reservedMap, availableOf, approveOrder, checkInvariants,
} from "../src/inventoryLedger.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("\nMock data tests\n");
const now = new Date("2026-01-15T10:00:00Z");
const result = buildMockData(FOLDERS, now);
const { stock, prices, orders } = result;
const keys = Object.keys(stock);
const phys = (k) => stock[k];

test("builds successfully from the real catalogue", () => {
  assert.equal(result.ok, true);
  assert.equal(result.summary.products, FOLDERS.reduce((n, f) => n + f.photos.length, 0));
});

test("is deterministic (same input → identical output)", () => {
  assert.deepEqual(buildMockData(FOLDERS, now), result);
});

test("every product has a whole, non-negative stock figure", () => {
  assert.equal(keys.length, result.summary.products);
  assert.ok(keys.every((k) => Number.isInteger(stock[k]) && stock[k] >= 0));
});

test("fixed scenario items: plenty / 1 GR / boundary 75 / low 74 / 30 / 1 / out", () => {
  const first = FOLDERS[0];
  const k = (i) => `${first.id}:${first.photos[i].id}`;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => stock[k(i)]), [1000, 400, 150, 75, 74, 30, 1, 0]);
});

test("stock mix includes low-stock (<75), exactly 75 and out-of-stock items", () => {
  const vals = Object.values(stock);
  assert.ok(vals.some((v) => v === 0));
  assert.ok(vals.some((v) => v > 0 && v < 75));
  assert.ok(vals.some((v) => v === 75));
  assert.ok(vals.some((v) => v >= 2000));
});

test("prices: most products priced, some left as 'price on request'", () => {
  const vals = Object.values(prices);
  const priced = vals.filter((v) => v !== null);
  assert.ok(priced.length > vals.length * 0.7 && priced.length < vals.length);
  assert.ok(priced.every((v) => v >= 2 && v <= 18 && Number.isFinite(v)));
});

test("orders cover every status", () => {
  assert.deepEqual(result.summary.byStatus, {
    pending: 5, approved: 3, dispatched: 4, rejected: 2, cancelled: 1,
  });
});

test("stock invariants hold: reserved never exceeds physical, nothing negative", () => {
  assert.deepEqual(checkInvariants(orders, phys, keys), []);
  const reserved = reservedMap(orders);
  for (const k of keys) assert.ok((reserved[k] || 0) <= stock[k]);
});

test("dispatched orders recorded partial dispatch correctly", () => {
  const d2 = orders.find((o) => o.id === "mock-D2");
  assert.equal(d2.status, STATUS.DISPATCHED);
  assert.deepEqual(d2.dispatchedLines.map((l) => [l.ordered, l.dispatched, l.returned]), [[450, 300, 150], [150, 150, 0]]);
  assert.ok(d2.stockDeducted);
});

test("pending orders exercise approval: P1 ok, P2 conflicts with P1, P3/P5 already short", () => {
  const byId = (id) => orders.find((o) => o.id === `mock-${id}`);
  let list = orders;
  const tryApprove = (id) => approveOrder(list, `mock-${id}`, phys);
  assert.equal(tryApprove("P1").ok, true);
  assert.equal(tryApprove("P4").ok, true); // piece-mode 40 + boundary 75
  assert.equal(tryApprove("P3").code, "insufficient_stock");
  assert.equal(tryApprove("P5").code, "insufficient_stock");
  // P2 alone fits; after P1 is approved it no longer does
  assert.equal(tryApprove("P2").ok, true);
  list = approveOrder(list, "mock-P1", phys).orders;
  assert.equal(approveOrder(list, "mock-P2", phys).code, "insufficient_stock");
  assert.ok(byId("P1") && byId("P2"));
});

test("all orders are flagged mock and carry shop details + who placed them", () => {
  assert.ok(orders.every((o) => o.mock === true && o.shopName && o.location && /^[6-9]\d{9}$/.test(o.mobile)));
  const rep = orders.filter((o) => o.placedBy === "salesRep");
  const cust = orders.filter((o) => o.placedBy === "customer");
  assert.ok(rep.length > 0 && cust.length > 0 && rep.length + cust.length === orders.length);
  assert.ok(rep.every((o) => /^Sales Rep [12]$/.test(o.salesRepName)));
  assert.ok(cust.every((o) => o.salesRepName === ""));
});

test("one dispatched order was sent ABOVE its ordered quantity", () => {
  const d1 = orders.find((o) => o.id === "mock-D1");
  const l = d1.dispatchedLines[0];
  assert.deepEqual([l.ordered, l.dispatched, l.returned, l.extra], [300, 330, 0, 30]);
});

test("order totals are whole rupees and add up with the round-off", () => {
  for (const o of orders) {
    assert.ok(Number.isInteger(o.totalValue), `${o.id} total ${o.totalValue}`);
    const exact = o.itemsTotal + o.extraAmount;
    assert.ok(Math.abs(Math.round((exact + o.roundOff) * 100) / 100 - o.totalValue) < 0.011, o.id);
    assert.ok(Math.abs(o.roundOff) <= 0.5, o.id);
  }
});

test("refuses to build with too few photos", () => {
  assert.equal(buildMockData([{ id: "x", name: "x", photos: [{ id: 1 }] }]).code, "not_enough_photos");
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
