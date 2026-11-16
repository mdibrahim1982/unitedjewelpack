// Run with:  npm test
import assert from "node:assert/strict";
import { createMemoryBackend } from "../src/firebase/memoryBackend.js";
import { _setBackendForTests } from "../src/firebase/backendFactory.js";
import { loginStaff, logoutStaff, ensureUid, subscribeSession, getSession, startSession, _resetForTests } from "../src/firebase/session.js";

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const settle = () => new Promise((r) => setTimeout(r, 20));

async function fresh() {
  const local = fakeStorage();
  const session = fakeStorage();
  local.setItem("ujp_memory_accounts", JSON.stringify([
    { email: "boss@x.in", password: "Boss#123", uid: "u-admin" },
    { email: "rep1@x.in", password: "Rep#123", uid: "u-rep1" },
    { email: "gone@x.in", password: "Gone#123", uid: "u-gone" },
    { email: "nobody@x.in", password: "Nobody#1", uid: "u-nobody" },
  ]));
  const b = createMemoryBackend({ local, session });
  await b.store.set("admins/u-admin", { name: "Owner", email: "boss@x.in" });
  await b.store.set("salesReps/u-rep1", { name: "Ravi Kumar", email: "rep1@x.in", active: true });
  await b.store.set("salesReps/u-gone", { name: "Left Company", email: "gone@x.in", active: false });
  _resetForTests();
  _setBackendForTests(b);
  return b;
}

let passed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

test("admin signs in and is recognised as admin (role comes from Firestore)", async () => {
  await fresh();
  const r = await loginStaff("boss@x.in", "Boss#123");
  assert.deepEqual([r.ok, r.role, r.name, r.uid], [true, "admin", "Owner", "u-admin"]);
});

test("sales rep signs in; the display name comes from salesReps/{uid}", async () => {
  await fresh();
  const r = await loginStaff("rep1@x.in", "Rep#123");
  assert.deepEqual([r.ok, r.role, r.name], [true, "salesRep", "Ravi Kumar"]);
});

test("email is case-insensitive and trimmed", async () => {
  await fresh();
  assert.equal((await loginStaff("  REP1@X.IN ", "Rep#123")).ok, true);
});

test("wrong password / unknown email → bad_credentials, nobody signed in", async () => {
  const b = await fresh();
  assert.equal((await loginStaff("boss@x.in", "wrong")).code, "bad_credentials");
  assert.equal((await loginStaff("ghost@x.in", "x")).code, "bad_credentials");
  assert.equal(b.authApi.currentUser(), null);
});

test("a valid Firebase account with NO admin/rep document is refused and signed out", async () => {
  const b = await fresh();
  const r = await loginStaff("nobody@x.in", "Nobody#1");
  assert.deepEqual([r.ok, r.code], [false, "not_authorised"]);
  assert.equal(b.authApi.currentUser(), null);
});

test("a deactivated sales rep (active:false) cannot sign in", async () => {
  const b = await fresh();
  assert.equal((await loginStaff("gone@x.in", "Gone#123")).code, "not_authorised");
  assert.equal(b.authApi.currentUser(), null);
  await b.store.set("salesReps/u-gone", { name: "Back", active: true });
  assert.equal((await loginStaff("gone@x.in", "Gone#123")).ok, true); // re-activating works
});

test("session state follows sign-in and sign-out", async () => {
  await fresh();
  const seen = [];
  const un = subscribeSession((s) => seen.push([s.ready, s.role, s.name]));
  await settle();
  assert.deepEqual(getSession().role, null);
  await loginStaff("rep1@x.in", "Rep#123");
  await settle();
  assert.deepEqual([getSession().role, getSession().name, getSession().uid], ["salesRep", "Ravi Kumar", "u-rep1"]);
  await logoutStaff();
  await settle();
  assert.deepEqual([getSession().role, getSession().uid], [null, null]);
  un();
});

test("a signed-in user with no role document is signed out by the session listener too", async () => {
  const b = await fresh();
  // simulate an account that signs in elsewhere (e.g. another tab) without a role doc
  await startSession();
  await settle();
  await b.authApi.signInStaff("nobody@x.in", "Nobody#1");
  await settle();
  assert.equal(b.authApi.currentUser(), null);
  assert.equal(getSession().error, "not_authorised");
});

test("customers: ensureUid creates ONE anonymous identity and reuses it", async () => {
  const b = await fresh();
  const a = await ensureUid();
  const c = await ensureUid();
  assert.equal(a, c);
  assert.ok(b.authApi.currentUser().isAnonymous);
  await startSession();
  await settle();
  assert.equal(getSession().role, null); // anonymous ≠ staff
});

test("a staff sign-in replaces an anonymous customer identity", async () => {
  const b = await fresh();
  await ensureUid();
  const r = await loginStaff("boss@x.in", "Boss#123");
  assert.equal(r.ok, true);
  assert.equal(b.authApi.currentUser().uid, "u-admin");
});

(async () => {
  console.log("\nFirebase sign-in / role tests\n");
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
})();
