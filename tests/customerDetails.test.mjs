// Run with:  npm test
import assert from "node:assert/strict";
import { normaliseMobile, validateDetails } from "../src/customerDetails.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("\nCustomer details tests\n");

test("mobile numbers are normalised to 10 digits", () => {
  for (const raw of ["9876543210", "98765 43210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210", " 98765 43210 "]) {
    assert.equal(normaliseMobile(raw), "9876543210", raw);
  }
});

test("valid details pass and come back trimmed/normalised", () => {
  const r = validateDetails({ shopName: "  Sri   Murugan  Jewellers ", location: " Tirunelveli ", mobile: "+91 98765 43210" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.values, { shopName: "Sri Murugan Jewellers", location: "Tirunelveli", mobile: "9876543210" });
  assert.deepEqual(r.errors, {});
});

test("all three fields are required", () => {
  const r = validateDetails({});
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, { shopName: "required", location: "required", mobile: "required" });
});

test("blank / whitespace-only / 1-character values are rejected", () => {
  const r = validateDetails({ shopName: "   ", location: "A", mobile: "9876543210" });
  assert.deepEqual(r.errors, { shopName: "required", location: "required" });
});

test("mobile must be a real Indian mobile (10 digits, starts 6-9)", () => {
  for (const bad of ["12345", "5876543210", "98765432101", "abcdefghij", "98765 4321"]) {
    const r = validateDetails({ shopName: "Shop", location: "Town", mobile: bad });
    assert.equal(r.ok, false, bad);
    assert.ok(["mobile_invalid", "required"].includes(r.errors.mobile), bad);
  }
  assert.equal(validateDetails({ shopName: "Shop", location: "Town", mobile: "12345" }).errors.mobile, "mobile_invalid");
});

test("one bad field doesn't hide the others", () => {
  const r = validateDetails({ shopName: "Shop", location: "", mobile: "12345" });
  assert.deepEqual(r.errors, { location: "required", mobile: "mobile_invalid" });
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
