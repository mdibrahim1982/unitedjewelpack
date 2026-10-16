// Run with:  npm test
import assert from "node:assert/strict";
import { blockingSession } from "../src/activeSession.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};
const none = { admin: false, salesRep: null, customer: null };

console.log("\nOne-user-at-a-time tests\n");

test("nobody signed in → nobody is blocked", () => {
  for (const r of ["admin", "salesRep", "customer"]) assert.equal(blockingSession(r, none), null);
});

test("a signed-in CUSTOMER blocks admin and sales-rep logins", () => {
  const snap = { ...none, customer: { shopName: "Test Gold House" } };
  assert.deepEqual(blockingSession("admin", snap), { role: "customer", name: "Test Gold House" });
  assert.deepEqual(blockingSession("salesRep", snap), { role: "customer", name: "Test Gold House" });
  assert.equal(blockingSession("customer", snap), null); // same role isn't blocked
});

test("a signed-in SALES REP blocks admin and customer logins", () => {
  const snap = { ...none, salesRep: "Sales Rep 1" };
  assert.deepEqual(blockingSession("admin", snap), { role: "salesRep", name: "Sales Rep 1" });
  assert.deepEqual(blockingSession("customer", snap), { role: "salesRep", name: "Sales Rep 1" });
  assert.equal(blockingSession("salesRep", snap), null);
});

test("a signed-in ADMIN blocks sales-rep and customer logins", () => {
  const snap = { ...none, admin: true };
  assert.deepEqual(blockingSession("salesRep", snap), { role: "admin", name: "Admin" });
  assert.deepEqual(blockingSession("customer", snap), { role: "admin", name: "Admin" });
  assert.equal(blockingSession("admin", snap), null);
});

test("a customer record without a shop name still names the blocker", () => {
  assert.equal(blockingSession("admin", { ...none, customer: {} }).name, "Customer");
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
