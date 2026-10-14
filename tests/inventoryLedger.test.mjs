// Run with:  npm test   (plain Node, no dependencies)
import assert from "node:assert/strict";
import {
  STATUS,
  createPendingOrder,
  approveOrder,
  rejectOrder,
  cancelOrder,
  confirmDispatch,
  reservedMap,
  reservedOf,
  availableOf,
  checkInvariants,
} from "../src/inventoryLedger.js";

// A tiny in-memory "database" that applies results the way the real
// store does: orders and physical stock change together or not at all.
function makeDb(physical) {
  const db = { orders: [], phys: { ...physical } };
  db.physical = (k) => db.phys[k] ?? 0;
  db.reserved = (k) => reservedOf(db.orders, k);
  db.available = (k) => availableOf(db.physical(k), db.reserved(k));
  db.apply = (r) => {
    if (!r.ok) return r;
    db.orders = r.orders;
    for (const d of r.stockDeltas || []) {
      db.phys[d.key] = Math.max(0, (db.phys[d.key] ?? 0) + d.delta); // clamp: never negative
    }
    return r;
  };
  db.create = (id, lines) =>
    db.apply(createPendingOrder(db.orders, { id, lines }));
  db.approve = (id) => db.apply(approveOrder(db.orders, id, db.physical));
  db.reject = (id) => db.apply(rejectOrder(db.orders, id));
  db.cancel = (id) => db.apply(cancelOrder(db.orders, id));
  db.dispatch = (id, sent) =>
    db.apply(confirmDispatch(db.orders, id, sent, db.physical));
  db.status = (id) => db.orders.find((o) => o.id === id)?.status;
  return db;
}

const A = "rings:1"; // 1000 pcs on hand
const B = "rings:2"; // 400 pcs on hand
const line = (key, pieces) => ({ key, folderId: key.split(":")[0], photoId: key.split(":")[1], pieces });

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\nInventory ledger tests\n");

test("1. creating a pending order does NOT change physical, reserved or available", () => {
  const db = makeDb({ [A]: 1000 });
  assert.equal(db.create("o1", [line(A, 300)]).ok, true);
  assert.equal(db.status("o1"), STATUS.PENDING);
  assert.equal(db.physical(A), 1000);
  assert.equal(db.reserved(A), 0);
  assert.equal(db.available(A), 1000);
});

test("2. approval reserves: available drops, physical untouched", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  assert.equal(db.approve("o1").ok, true);
  assert.equal(db.physical(A), 1000);
  assert.equal(db.reserved(A), 300);
  assert.equal(db.available(A), 700);
});

test("3. full workflow: create → approve → dispatch actual → verify stock", () => {
  const db = makeDb({ [A]: 1000, [B]: 400 });
  db.create("o1", [line(A, 300), line(B, 100)]);
  db.approve("o1");
  assert.deepEqual([db.available(A), db.available(B)], [700, 300]);
  const r = db.dispatch("o1", { [A]: 300, [B]: 100 });
  assert.equal(r.ok, true);
  assert.equal(db.status("o1"), STATUS.DISPATCHED);
  assert.deepEqual([db.physical(A), db.physical(B)], [700, 300]);
  assert.deepEqual([db.reserved(A), db.reserved(B)], [0, 0]);
  assert.deepEqual([db.available(A), db.available(B)], [700, 300]);
});

test("4. partial dispatch: only actual qty deducted, undispatched returns to available", () => {
  const db = makeDb({ [A]: 1000, [B]: 400 });
  db.create("o1", [line(A, 300), line(B, 100)]);
  db.approve("o1");
  assert.equal(db.available(A), 700);
  const r = db.dispatch("o1", { [A]: 200, [B]: 0 }); // sent 200 of 300, none of B
  assert.equal(r.ok, true);
  assert.equal(db.physical(A), 800); // 1000 − 200 actual
  assert.equal(db.physical(B), 400); // untouched
  assert.equal(db.reserved(A), 0);
  assert.equal(db.available(A), 800); // the 100 not sent is available again
  assert.equal(db.available(B), 400);
  const rec = db.orders[0].dispatchedLines.find((l) => l.key === A);
  assert.deepEqual([rec.ordered, rec.dispatched, rec.returned], [300, 200, 100]);
});

test("5. rejection: pending order rejected, stock never touched, cannot reject twice", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  assert.equal(db.reject("o1").ok, true);
  assert.equal(db.status("o1"), STATUS.REJECTED);
  assert.deepEqual([db.physical(A), db.reserved(A), db.available(A)], [1000, 0, 1000]);
  assert.equal(db.reject("o1").code, "invalid_status");
  assert.equal(db.approve("o1").code, "invalid_status"); // can't approve a rejected order
});

test("6. cancelling an APPROVED order releases its reservation (physical unchanged)", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  db.approve("o1");
  assert.equal(db.available(A), 700);
  assert.equal(db.cancel("o1").ok, true);
  assert.equal(db.status("o1"), STATUS.CANCELLED);
  assert.deepEqual([db.physical(A), db.reserved(A), db.available(A)], [1000, 0, 1000]);
});

test("7. cancelling a PENDING order changes no stock; cancelling twice is refused", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  assert.equal(db.cancel("o1").ok, true);
  assert.deepEqual([db.physical(A), db.reserved(A)], [1000, 0]);
  assert.equal(db.cancel("o1").code, "invalid_status");
});

test("8. a DISPATCHED order cannot be cancelled, rejected or re-approved", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  db.approve("o1");
  db.dispatch("o1", { [A]: 300 });
  assert.equal(db.cancel("o1").code, "invalid_status");
  assert.equal(db.reject("o1").code, "invalid_status");
  assert.equal(db.approve("o1").code, "invalid_status");
  assert.equal(db.physical(A), 700);
});

test("9. duplicate dispatch confirmation (double click) deducts only once", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  db.approve("o1");
  assert.equal(db.dispatch("o1", { [A]: 300 }).ok, true);
  const again = db.dispatch("o1", { [A]: 300 });
  assert.equal(again.ok, false);
  assert.equal(again.code, "invalid_status");
  assert.equal(db.physical(A), 700); // NOT 400
});

test("10. duplicate approval (double click) reserves only once", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  assert.equal(db.approve("o1").ok, true);
  assert.equal(db.approve("o1").code, "invalid_status");
  assert.equal(db.reserved(A), 300); // NOT 600
});

test("11. concurrent orders can't over-reserve: second approval is refused, nothing changes", () => {
  const db = makeDb({ [A]: 500 });
  db.create("o1", [line(A, 300)]);
  db.create("o2", [line(A, 300)]); // both pending is fine — pending reserves nothing
  assert.equal(db.approve("o1").ok, true);
  const r = db.approve("o2");
  assert.equal(r.ok, false);
  assert.equal(r.code, "insufficient_stock");
  assert.deepEqual(r.shortages, [{ key: A, requested: 300, available: 200 }]);
  assert.equal(db.status("o2"), STATUS.PENDING);
  assert.equal(db.reserved(A), 300);
  // once o1 is cancelled, o2 can be approved
  db.cancel("o1");
  assert.equal(db.approve("o2").ok, true);
});

test("12. multi-line approval is all-or-nothing", () => {
  const db = makeDb({ [A]: 1000, [B]: 50 });
  db.create("o1", [line(A, 300), line(B, 100)]); // B short
  const r = db.approve("o1");
  assert.equal(r.ok, false);
  assert.equal(db.reserved(A), 0); // A was NOT reserved either
  assert.equal(db.status("o1"), STATUS.PENDING);
});

test("13. dispatch validation: negative, fractional, missing, unknown line, all-zero, beyond stock", () => {
  const db = makeDb({ [A]: 1000, [B]: 400 });
  db.create("o1", [line(A, 300), line(B, 100)]);
  db.approve("o1");
  assert.equal(db.dispatch("o1", { [A]: -1, [B]: 100 }).code, "invalid_quantity");
  assert.equal(db.dispatch("o1", { [A]: 1.5, [B]: 100 }).code, "invalid_quantity");
  assert.equal(db.dispatch("o1", { [A]: 100 }).code, "invalid_quantity"); // B missing
  assert.equal(db.dispatch("o1", { [A]: 1, [B]: 1, "x:9": 1 }).code, "unknown_line");
  assert.equal(db.dispatch("o1", { [A]: 0, [B]: 0 }).code, "nothing_dispatched");
  assert.equal(db.dispatch("o1", { [A]: 1001, [B]: 100 }).code, "insufficient_physical");
  // every failure left the order approved and stock untouched
  assert.equal(db.status("o1"), STATUS.APPROVED);
  assert.deepEqual([db.physical(A), db.physical(B)], [1000, 400]);
  assert.deepEqual([db.reserved(A), db.reserved(B)], [300, 100]);
});

test("13b. admin can INCREASE the dispatch above the ordered qty, from free stock", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  db.approve("o1");
  const r = db.dispatch("o1", { [A]: 350 }); // ordered 300, sending 350
  assert.equal(r.ok, true);
  assert.equal(db.physical(A), 650); // 1000 − 350 actually sent
  assert.equal(db.reserved(A), 0);
  assert.equal(db.available(A), 650);
  const rec = db.orders[0].dispatchedLines[0];
  assert.deepEqual([rec.ordered, rec.dispatched, rec.returned, rec.extra], [300, 350, 0, 50]);
});

test("13c. increasing can NOT eat stock reserved for another approved order", () => {
  const db = makeDb({ [A]: 500 });
  db.create("o1", [line(A, 300)]);
  db.create("o2", [line(A, 150)]);
  db.approve("o1");
  db.approve("o2"); // reserved 450 of 500 → 50 free
  // o1 may send up to its own 300 + the 50 free = 350
  const tooMuch = db.dispatch("o1", { [A]: 351 });
  assert.equal(tooMuch.code, "exceeds_available");
  assert.equal(tooMuch.max, 350);
  assert.equal(db.physical(A), 500); // nothing changed
  assert.equal(db.dispatch("o1", { [A]: 350 }).ok, true);
  assert.equal(db.physical(A), 150);
  assert.equal(db.reserved(A), 150); // o2 is still fully covered
  assert.equal(db.available(A), 0);
  assert.equal(db.dispatch("o2", { [A]: 150 }).ok, true);
  assert.equal(db.physical(A), 0);
});

test("13d. a decrease and an increase can be mixed across lines of one order", () => {
  const db = makeDb({ [A]: 1000, [B]: 400 });
  db.create("o1", [line(A, 300), line(B, 100)]);
  db.approve("o1");
  assert.equal(db.dispatch("o1", { [A]: 250, [B]: 120 }).ok, true);
  assert.deepEqual([db.physical(A), db.physical(B)], [750, 280]);
  assert.deepEqual([db.reserved(A), db.reserved(B)], [0, 0]);
  assert.deepEqual([db.available(A), db.available(B)], [750, 280]);
});

test("14. dispatch can never push physical stock negative (stock edited down after approval)", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  db.approve("o1");
  db.phys[A] = 100; // admin manually reduced stock after approval
  const r = db.dispatch("o1", { [A]: 300 });
  assert.equal(r.code, "insufficient_physical");
  assert.equal(db.physical(A), 100);
  assert.equal(db.dispatch("o1", { [A]: 100 }).ok, true); // can still send what exists
  assert.equal(db.physical(A), 0);
});

test("15. invalid orders are refused: empty, zero, negative, fractional, duplicate id", () => {
  const db = makeDb({ [A]: 1000 });
  assert.equal(db.create("e", []).code, "empty_order");
  assert.equal(db.create("z", [line(A, 0)]).code, "invalid_quantity");
  assert.equal(db.create("n", [line(A, -5)]).code, "invalid_quantity");
  assert.equal(db.create("f", [line(A, 2.5)]).code, "invalid_quantity");
  assert.equal(db.create("ok", [line(A, 5)]).ok, true);
  assert.equal(db.create("ok", [line(A, 5)]).code, "duplicate_order_id");
  assert.equal(db.orders.length, 1);
});

test("16. repeated lines for the same product are merged", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 100), line(A, 50)]);
  assert.equal(db.orders[0].lines.length, 1);
  assert.equal(db.orders[0].lines[0].pieces, 150);
});

test("17. unknown order ids are handled safely", () => {
  const db = makeDb({ [A]: 1000 });
  for (const op of ["approve", "reject", "cancel"]) {
    assert.equal(db[op]("nope").code, "not_found");
  }
  assert.equal(db.dispatch("nope", {}).code, "not_found");
});

test("18. reservations from several orders add up and release independently", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 200)]);
  db.create("o2", [line(A, 300)]);
  db.approve("o1");
  db.approve("o2");
  assert.equal(db.reserved(A), 500);
  assert.equal(db.available(A), 500);
  db.dispatch("o1", { [A]: 150 });
  assert.equal(db.reserved(A), 300); // only o2 still holds stock
  assert.equal(db.physical(A), 850);
  assert.equal(db.available(A), 550);
});

test("19. inputs are not mutated (orders array is replaced, not edited in place)", () => {
  const db = makeDb({ [A]: 1000 });
  db.create("o1", [line(A, 300)]);
  const before = db.orders;
  const snapshot = JSON.stringify(before);
  db.approve("o1");
  assert.equal(JSON.stringify(before), snapshot);
});

test("20. fuzz: 20,000 random operations never break the stock invariants", () => {
  let seed = 12345;
  const rnd = (n) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  const keys = [A, B, "rings:3"];
  const db = makeDb({ [A]: 800, [B]: 500, "rings:3": 300 });
  let n = 0;
  for (let i = 0; i < 20000; i++) {
    const ids = db.orders.map((o) => o.id);
    const pick = () => (ids.length ? ids[rnd(ids.length)] : "none");
    switch (rnd(6)) {
      case 0: {
        const lines = [];
        for (let j = 0; j < 1 + rnd(3); j++) lines.push(line(keys[rnd(3)], 1 + rnd(200)));
        db.create(`o${n++}`, lines);
        break;
      }
      case 1: db.approve(pick()); break;
      case 2: db.reject(pick()); break;
      case 3: db.cancel(pick()); break;
      case 4: {
        const o = db.orders.find((x) => x.id === pick());
        const sent = {};
        for (const l of o?.lines || []) sent[l.key] = rnd(l.pieces * 2 + 1); // sometimes MORE than ordered
        db.dispatch(pick() === "none" ? "none" : o?.id ?? "none", sent);
        break;
      }
      case 5: {
        const k = keys[rnd(3)];
        db.phys[k] = (db.phys[k] ?? 0) + rnd(100); // restock now and then
        break;
      }
    }
    const problems = checkInvariants(db.orders, db.physical, keys);
    assert.deepEqual(problems, [], `after op ${i}: ${problems.join("; ")}`);
    for (const k of keys) {
      assert.ok(db.physical(k) >= 0 && db.available(k) >= 0);
    }
  }
  // dispatched orders are never touched again → exactly one deduction each
  const dispatched = db.orders.filter((o) => o.status === STATUS.DISPATCHED);
  assert.ok(dispatched.length > 50, "fuzz should dispatch plenty of orders");
  assert.ok(dispatched.every((o) => o.stockDeducted === true));
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
