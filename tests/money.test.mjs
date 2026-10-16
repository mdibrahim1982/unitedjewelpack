// Run with:  npm test
import assert from "node:assert/strict";
import { roundTotal } from "../src/money.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("\nRound-off tests\n");

test("whole amounts need no round-off", () => {
  assert.deepEqual(roundTotal(1235), { amount: 1235, rounded: 1235, roundOff: 0 });
});
test("rounds down below .50 with a negative round-off", () => {
  assert.deepEqual(roundTotal(1234.4), { amount: 1234.4, rounded: 1234, roundOff: -0.4 });
});
test("rounds up from .50 with a positive round-off", () => {
  assert.deepEqual(roundTotal(1234.5), { amount: 1234.5, rounded: 1235, roundOff: 0.5 });
  assert.deepEqual(roundTotal(1234.6), { amount: 1234.6, rounded: 1235, roundOff: 0.4 });
});
test("amount + round-off always equals the rounded total", () => {
  for (const v of [0, 0.01, 99.99, 450.25, 3262.5, 7.25 * 450 + 3.1, 1e6 + 0.49, 12.345]) {
    const r = roundTotal(v);
    assert.equal(Math.round((r.amount + r.roundOff) * 100) / 100, r.rounded, String(v));
    assert.ok(Math.abs(r.roundOff) <= 0.5, String(v));
    assert.ok(Number.isInteger(r.rounded));
  }
});
test("floating-point dust doesn't flip the rounding", () => {
  // 0.1 + 0.2 + 1234.2 is 1234.5000000000002 in floating point, but is
  // really 1234.50 → rounds UP to 1235 (not down because of the dust).
  assert.equal(roundTotal(0.1 + 0.2 + 1234.2).rounded, 1235);
  // 1234.4999999999998 is really 1234.50 as well.
  assert.equal(roundTotal(1234.3 + 0.2).rounded, 1235);
  // genuinely below .50 still rounds down
  assert.equal(roundTotal(1234.49).rounded, 1234);
});
test("bad input is treated as 0", () => {
  for (const v of [NaN, undefined, null, "abc"]) {
    assert.deepEqual(roundTotal(v), { amount: 0, rounded: 0, roundOff: 0 });
  }
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
