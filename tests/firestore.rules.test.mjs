// Security Rules tests — run against the OFFICIAL Firestore emulator:
//
//     npm install            (installs @firebase/rules-unit-testing + firebase)
//     npm run test:rules     (starts the emulator, runs this file, stops it)
//
// Needs Java 11+ and an internet connection the first time (the emulator is
// downloaded by firebase-tools). NOT part of `npm test`, which must stay
// offline-friendly.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, runTransaction } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "unitedjewelpack-rules-test",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

// ---- seed with rules disabled ----
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "admins/u-admin"), { name: "Owner" });
  await setDoc(doc(db, "salesReps/u-rep1"), { name: "Ravi", active: true });
  await setDoc(doc(db, "salesReps/u-rep2"), { name: "Meena", active: true });
  await setDoc(doc(db, "salesReps/u-off"), { name: "Left", active: false });
  await setDoc(doc(db, "inventory/ring-boxes:1"), { physical: 1000, reserved: 0, price: 8, folderId: "ring-boxes", photoId: "1", updatedAt: "t" });
  await setDoc(doc(db, "orders/rep1-order"), pendingRepOrder("rep1-order", "u-rep1"));
  await setDoc(doc(db, "orders/rep2-order"), pendingRepOrder("rep2-order", "u-rep2"));
});

const asAdmin = () => env.authenticatedContext("u-admin").firestore();
const asRep1 = () => env.authenticatedContext("u-rep1").firestore();
const asRep2 = () => env.authenticatedContext("u-rep2").firestore();
const asOffRep = () => env.authenticatedContext("u-off").firestore();
const asCustomer = (uid = "cust-1") => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const asStranger = () => env.authenticatedContext("u-stranger").firestore(); // signed in, no role doc
const signedOut = () => env.unauthenticatedContext().firestore();

function baseOrder(id) {
  return {
    id, lines: [{ key: "ring-boxes:1", folderId: "ring-boxes", photoId: "1", caption: "x", pieces: 300 }],
    items: [], extraAmount: 0, itemsTotal: 2400, roundOff: 0, totalValue: 2400,
    shopName: "Shop One", location: "Madurai", mobile: "9876543210", salesRepName: "", status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function pendingRepOrder(id, uid) { return { ...baseOrder(id), placedBy: "salesRep", salesRepUid: uid, salesRepName: "Ravi" }; }
function customerOrder(id, uid) { return { ...baseOrder(id), placedBy: "customer", customerUid: uid }; }

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("\nFirestore Security Rules tests\n");

// ------------------------------------------------------------------ inventory
await test("anyone, even signed out, can READ inventory (the storefront needs it)", () => assertSucceeds(getDoc(doc(signedOut(), "inventory/ring-boxes:1"))));
await test("signed-out users cannot write inventory", () => assertFails(setDoc(doc(signedOut(), "inventory/ring-boxes:1"), { physical: 1, reserved: 0 })));
await test("customers and sales reps cannot write inventory", async () => {
  await assertFails(updateDoc(doc(asCustomer(), "inventory/ring-boxes:1"), { physical: 5 }));
  await assertFails(updateDoc(doc(asRep1(), "inventory/ring-boxes:1"), { physical: 5 }));
});
await test("a signed-in user with NO role document cannot write inventory", () => assertFails(updateDoc(doc(asStranger(), "inventory/ring-boxes:1"), { physical: 5 })));
await test("admin can edit stock and price", async () => {
  await assertSucceeds(setDoc(doc(asAdmin(), "inventory/ring-boxes:1"), { physical: 900, reserved: 0, price: 9, folderId: "ring-boxes", photoId: "1", updatedAt: "t" }));
});
await test("admin can NOT set negative or fractional stock", async () => {
  const mk = (physical) => ({ physical, reserved: 0, price: 1, folderId: "f", photoId: "1", updatedAt: "t" });
  await assertFails(setDoc(doc(asAdmin(), "inventory/x:1"), mk(-1)));
  await assertFails(setDoc(doc(asAdmin(), "inventory/x:1"), mk(2.5)));
});
await test("reserved can never exceed physical", () => assertFails(setDoc(doc(asAdmin(), "inventory/x:2"), { physical: 10, reserved: 11, price: null, folderId: "f", photoId: "2", updatedAt: "t" })));
await test("inventory rejects unknown fields and absurd prices", async () => {
  await assertFails(setDoc(doc(asAdmin(), "inventory/x:3"), { physical: 1, reserved: 0, price: null, folderId: "f", photoId: "3", updatedAt: "t", hack: true }));
  await assertFails(setDoc(doc(asAdmin(), "inventory/x:3"), { physical: 1, reserved: 0, price: 999999, folderId: "f", photoId: "3", updatedAt: "t" }));
});
await test("nobody can delete inventory", () => assertFails(deleteDoc(doc(asAdmin(), "inventory/ring-boxes:1"))));

// ---------------------------------------------------------- orders: creating
await test("a customer (anonymous) can create their OWN pending order", () => assertSucceeds(setDoc(doc(asCustomer("c1"), "orders/c1-order"), customerOrder("c1-order", "c1"))));
await test("…also via a transaction that first checks the id doesn't exist (what the app does)", async () => {
  const db = asCustomer("c9");
  await assertSucceeds(runTransaction(db, async (tx) => {
    const ref = doc(db, "orders/c9-order");
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error("exists");
    tx.set(ref, customerOrder("c9-order", "c9"));
  }));
});
await test("a customer can't claim another person's uid, nor a sales-rep order", async () => {
  await assertFails(setDoc(doc(asCustomer("c2"), "orders/bad1"), customerOrder("bad1", "someone-else")));
  await assertFails(setDoc(doc(asCustomer("c2"), "orders/bad2"), pendingRepOrder("bad2", "c2")));
});
await test("a customer can't create an order that is already approved / has reservedLines / stockDeducted", async () => {
  await assertFails(setDoc(doc(asCustomer("c3"), "orders/s1"), { ...customerOrder("s1", "c3"), status: "approved" }));
  await assertFails(setDoc(doc(asCustomer("c3"), "orders/s2"), { ...customerOrder("s2", "c3"), reservedLines: [{ key: "a:1", pieces: 5 }] }));
  await assertFails(setDoc(doc(asCustomer("c3"), "orders/s3"), { ...customerOrder("s3", "c3"), stockDeducted: true }));
});
await test("order validation: bad mobile, 1-char names, empty lines, mismatched id are refused", async () => {
  const c = asCustomer("c4");
  await assertFails(setDoc(doc(c, "orders/v1"), { ...customerOrder("v1", "c4"), mobile: "12345" }));
  await assertFails(setDoc(doc(c, "orders/v2"), { ...customerOrder("v2", "c4"), shopName: "A" }));
  await assertFails(setDoc(doc(c, "orders/v3"), { ...customerOrder("v3", "c4"), lines: [] }));
  await assertFails(setDoc(doc(c, "orders/v4"), customerOrder("different-id", "c4")));
});
await test("signed-out users and role-less accounts cannot create orders", async () => {
  await assertFails(setDoc(doc(signedOut(), "orders/n1"), customerOrder("n1", "x")));
  await assertFails(setDoc(doc(asStranger(), "orders/n2"), pendingRepOrder("n2", "u-stranger")));
});
await test("a sales rep can create a pending order for THEMSELVES only", async () => {
  await assertSucceeds(setDoc(doc(asRep1(), "orders/r1"), pendingRepOrder("r1", "u-rep1")));
  await assertFails(setDoc(doc(asRep1(), "orders/r2"), pendingRepOrder("r2", "u-rep2"))); // as someone else
});
await test("a DEACTIVATED sales rep can no longer create orders", () => assertFails(setDoc(doc(asOffRep(), "orders/o1"), pendingRepOrder("o1", "u-off"))));
await test("a customer/rep cannot overwrite an existing order (update is admin-only)", async () => {
  await assertFails(setDoc(doc(asRep1(), "orders/rep1-order"), pendingRepOrder("rep1-order", "u-rep1")));
  await assertFails(updateDoc(doc(asRep1(), "orders/rep1-order"), { status: "approved" }));
});

// ------------------------------------------------------------ orders: reading
await test("admin can read every order", async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), "orders/rep1-order")));
  await assertSucceeds(getDocs(collection(asAdmin(), "orders")));
});
await test("a sales rep reads their OWN orders (the app's query) but not another rep's", async () => {
  await assertSucceeds(getDocs(query(collection(asRep1(), "orders"), where("salesRepUid", "==", "u-rep1"))));
  await assertFails(getDocs(query(collection(asRep1(), "orders"), where("salesRepUid", "==", "u-rep2"))));
  await assertFails(getDoc(doc(asRep1(), "orders/rep2-order")));
});
await test("nobody but an admin can list ALL orders", async () => {
  await assertFails(getDocs(collection(asRep1(), "orders")));
  await assertFails(getDocs(collection(asCustomer(), "orders")));
  await assertFails(getDocs(collection(signedOut(), "orders")));
});
await test("a customer can read their own order but not others", async () => {
  await assertSucceeds(getDoc(doc(asCustomer("c1"), "orders/c1-order")));
  await assertFails(getDoc(doc(asCustomer("c1"), "orders/rep1-order")));
});

// ----------------------------------------------- orders: the approval workflow
await test("only an admin can approve; a rep cannot approve their own order", async () => {
  const approve = { status: "approved", approvedAt: "t", reservedLines: [{ key: "ring-boxes:1", pieces: 300 }] };
  await assertFails(updateDoc(doc(asRep1(), "orders/rep1-order"), approve));
  await assertFails(updateDoc(doc(asCustomer("c1"), "orders/c1-order"), approve));
  await assertSucceeds(updateDoc(doc(asAdmin(), "orders/rep1-order"), approve));
});
await test("admin can't change an order's contents while approving (lines, totals, shop…)", async () => {
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep2-order"), { status: "approved", totalValue: 1 }));
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep2-order"), { status: "approved", shopName: "Other Shop" }));
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep2-order"), { status: "approved", lines: [] }));
});
await test("status can't skip steps (pending → dispatched is refused)", () => assertFails(updateDoc(doc(asAdmin(), "orders/rep2-order"), { status: "dispatched", stockDeducted: true })));
await test("dispatching must set stockDeducted = true; other statuses must not", async () => {
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep1-order"), { status: "dispatched" }));                       // missing flag
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep1-order"), { status: "cancelled", stockDeducted: true }));   // flag on wrong status
  await assertSucceeds(updateDoc(doc(asAdmin(), "orders/rep1-order"), { status: "dispatched", stockDeducted: true, dispatchedAt: "t", dispatchedLines: [] }));
});
await test("A DISPATCHED ORDER IS FROZEN — it can't be dispatched again, cancelled or edited (no second deduction)", async () => {
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep1-order"), { status: "dispatched", stockDeducted: true }));
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep1-order"), { status: "cancelled", stockDeducted: false }));
  await assertFails(updateDoc(doc(asAdmin(), "orders/rep1-order"), { dispatchedAt: "other" }));
});
await test("pending → rejected and pending → cancelled are allowed for an admin", async () => {
  await assertSucceeds(updateDoc(doc(asAdmin(), "orders/rep2-order"), { status: "rejected", decidedAt: "t" }));
});
await test("nobody can delete an order", async () => {
  await assertFails(deleteDoc(doc(asAdmin(), "orders/rep1-order")));
});

// --------------------------------------------------------------- roles / meta
await test("a user can read their OWN role document only", async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), "admins/u-admin")));
  await assertFails(getDoc(doc(asRep1(), "admins/u-admin")));
  await assertSucceeds(getDoc(doc(asRep1(), "salesReps/u-rep1")));
  await assertFails(getDoc(doc(asRep1(), "salesReps/u-rep2")));
  await assertSucceeds(getDoc(doc(asAdmin(), "salesReps/u-rep2")));
});
await test("role documents can't be created from the app (no self-promotion to admin)", async () => {
  await assertFails(setDoc(doc(asAdmin(), "admins/u-new"), { name: "x" }));
  await assertFails(setDoc(doc(asRep1(), "admins/u-rep1"), { name: "x" }));
  await assertFails(setDoc(doc(asStranger(), "salesReps/u-stranger"), { name: "x", active: true }));
});
await test("admin can manage sales reps (add / deactivate); reps cannot edit themselves", async () => {
  await assertSucceeds(setDoc(doc(asAdmin(), "salesReps/u-new"), { name: "New Rep", active: true }));
  await assertFails(updateDoc(doc(asRep1(), "salesReps/u-rep1"), { active: true, name: "Renamed" }));
});
await test("migration bookkeeping (meta) is admin-only", async () => {
  await assertSucceeds(setDoc(doc(asAdmin(), "meta/migration"), { status: "done" }));
  await assertFails(getDoc(doc(asRep1(), "meta/migration")));
  await assertFails(getDoc(doc(signedOut(), "meta/migration")));
});
await test("unknown collections are closed to everyone", async () => {
  await assertFails(getDoc(doc(asAdmin(), "secrets/x")));
  await assertFails(setDoc(doc(asAdmin(), "secrets/x"), { a: 1 }));
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
await env.cleanup();
