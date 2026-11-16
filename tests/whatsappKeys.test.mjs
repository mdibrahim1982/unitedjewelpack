// Run with:  npm test
// WhatsApp messages are written in the shopper's language, so every message
// key must exist in BOTH languages, keep the same {placeholders}, and the
// Tamil version must really be Tamil.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/i18n.jsx", import.meta.url), "utf8");
const share = readFileSync(new URL("../src/cartShare.js", import.meta.url), "utf8");

const enStart = src.indexOf("  en: {");
const taStart = src.indexOf("  ta: {");
assert.ok(enStart > -1 && taStart > enStart, "could not locate the en / ta blocks");

function parse(block) {
  const out = {};
  const re = /^\s{4}([A-Za-z_0-9]+):\s*"((?:[^"\\]|\\.)*)"/gm;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2];
  return out;
}
const en = parse(src.slice(enStart, taStart));
const ta = parse(src.slice(taStart));
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const isTamil = (s) => /[\u0B80-\u0BFF]/.test(s);

// every wa_* key the builder uses, plus the generic message
const used = new Set([...share.matchAll(/"(wa_[A-Za-z_]+)"/g)].map((m) => m[1]));
used.add("waGenericMsg");

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("\nWhatsApp message translation tests\n");

test(`the builder uses ${used.size} message keys`, () => {
  assert.ok(used.size >= 15);
});
test("every message key exists in English", () => {
  for (const k of used) assert.ok(en[k], `missing in en: ${k}`);
});
test("every message key exists in Tamil", () => {
  for (const k of used) assert.ok(ta[k], `missing in ta: ${k}`);
});
test("Tamil keeps exactly the same {placeholders} as English", () => {
  for (const k of used) assert.equal(vars(ta[k]), vars(en[k]), k);
});
test("Tamil messages are actually written in Tamil", () => {
  for (const k of used) assert.ok(isTamil(ta[k]), `not Tamil: ${k} = ${ta[k]}`);
});
test("English messages are plain English (no Tamil leaked in)", () => {
  for (const k of used) assert.ok(!isTamil(en[k]), k);
});

console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`);
