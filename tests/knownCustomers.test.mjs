// Run with:  npm test
import assert from "node:assert/strict";
import {
  collectKnownCustomers, matchByShopName, matchByMobile, autofillFields,
} from "../src/knownCustomers.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

const orders = [
  { shopName: "Sri Murugan Jewellers", location: "Tirunelveli", mobile: "9000010001" },
  { shopName: "Kaveri Gold Palace", location: "Madurai", mobile: "9000010002" },
  { shopName: "  sri   murugan jewellers ", location: "Tirunelveli (old)", mobile: "+91 90000 10001" }, // same shop again
  { shopName: "", location: "x", mobile: "9000010003" }, // no name → ignored
  { shopName: "No Mobile Shop", location: "Tenkasi", mobile: "" },
  { shopName: "no mobile  shop", location: "Tenkasi", mobile: "" }, // same, by name
];
const known = collectKnownCustomers(orders);

console.log("\nAutofill (known customers) tests\n");

test("unique shops, most recent first, duplicates merged by mobile or name", () => {
  assert.deepEqual(known.map((c) => c.shopName), ["Sri Murugan Jewellers", "Kaveri Gold Palace", "No Mobile Shop"]);
  assert.equal(known[0].location, "Tirunelveli"); // the newest record wins
  assert.equal(known[0].mobile, "9000010001");
});

test("records with no shop name are ignored", () => {
  assert.ok(!known.some((c) => c.mobile === "9000010003"));
});

test("the last customer on the device is included first", () => {
  const k = collectKnownCustomers(orders, [{ shopName: "Last Shop", location: "Town", mobile: "9876543210" }]);
  assert.equal(k[0].shopName, "Last Shop");
  assert.equal(k.length, 4);
});

test("shop name matches ignoring case and spacing", () => {
  assert.equal(matchByShopName(known, "KAVERI   gold palace").mobile, "9000010002");
  assert.equal(matchByShopName(known, "Kaveri"), null); // partial is not a match
  assert.equal(matchByShopName(known, ""), null);
});

test("mobile matches in any common format, and only when it is a full number", () => {
  assert.equal(matchByMobile(known, "90000 10002").shopName, "Kaveri Gold Palace");
  assert.equal(matchByMobile(known, "+91 9000010001").shopName, "Sri Murugan Jewellers");
  assert.equal(matchByMobile(known, "90000100"), null);
  assert.equal(matchByMobile(known, "9999999999"), null);
});

test("autofill only fills EMPTY fields and never overwrites what was typed", () => {
  const c = known[1];
  assert.deepEqual(autofillFields({ shopName: "Kaveri Gold Palace", location: "", mobile: "" }, c),
    { shopName: "Kaveri Gold Palace", location: "Madurai", mobile: "9000010002" });
  assert.deepEqual(autofillFields({ shopName: "Kaveri Gold Palace", location: "My own town", mobile: "" }, c),
    { shopName: "Kaveri Gold Palace", location: "My own town", mobile: "9000010002" });
  const typed = { shopName: "a", location: "b", mobile: "c" };
  assert.deepEqual(autofillFields(typed, c), typed);
  assert.deepEqual(autofillFields(typed, null), typed);
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
