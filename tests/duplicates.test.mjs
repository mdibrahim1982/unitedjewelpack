// Run with:  npm test
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { sha256Hex, hashBytes, bytesFromDataUrl } from "../src/imageHash.js";
import { fileStem, buildDuplicateIndex, addToIndex, checkUpload } from "../src/duplicates.js";
import { BASE_IMAGE_HASHES } from "../src/baseImageHashes.js";
import { FOLDERS } from "../src/data.js";

let passed = 0;
const test = (name, fn) => {
  Promise.resolve().then(fn).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (e) => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
  );
};
const ref = (buf) => createHash("sha256").update(buf).digest("hex");

console.log("\nDuplicate-upload tests\n");

test("SHA-256 matches the published test vectors", () => {
  assert.equal(sha256Hex(new Uint8Array()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("SHA-256 matches Node's crypto for every padding boundary (0-200 bytes)", () => {
  for (let n = 0; n <= 200; n++) {
    const b = randomBytes(n);
    assert.equal(sha256Hex(new Uint8Array(b)), ref(b), `length ${n}`);
  }
});
test("SHA-256 matches Node's crypto for a 3 MB image-sized buffer", () => {
  const b = randomBytes(3 * 1024 * 1024);
  assert.equal(sha256Hex(new Uint8Array(b)), ref(b));
});
test("hashBytes (native or fallback) gives the same answer", async () => {
  const b = randomBytes(5000);
  assert.equal(await hashBytes(new Uint8Array(b)), ref(b));
});
test("the plain-JS fallback works when crypto.subtle is missing (http pages)", async () => {
  const real = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    const b = randomBytes(777);
    assert.equal(await hashBytes(new Uint8Array(b)), ref(b));
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
  }
});
test("data URLs decode back to the exact bytes", () => {
  const b = randomBytes(1234);
  const url = "data:image/jpeg;base64," + b.toString("base64");
  assert.equal(ref(Buffer.from(bytesFromDataUrl(url))), ref(b));
  assert.equal(bytesFromDataUrl("/assets/x.jpg"), null);
});

test("file stems ignore case, extension, spaces and punctuation", () => {
  for (const n of ["S_K_Mini_Cream_.jpeg", "sk-mini-cream.jpg", "/assets/folders/mini-round-boxes/sk-mini-cream.jpeg", "SK Mini Cream (1).PNG".replace("(1)", "")]) {
    assert.equal(fileStem(n), "skminicream", n);
  }
});

const index = buildDuplicateIndex([
  { hash: "H1", fileName: "sk-mini-cream.jpeg", folderId: "mini", folderName: "Mini Round Boxes", caption: "S&K Mini Cream Box" },
  { hash: "H2", fileName: "old-photo.jpg", folderId: "backup-ring", folderName: "Backup-Ring Boxes", caption: "Old", backup: true },
  { hash: "H2", fileName: "old-photo.jpg", folderId: "ring", folderName: "Ring Boxes", caption: "Old (active copy)" },
]);

test("identical bytes are a hard duplicate, whatever the file is called", () => {
  const r = checkUpload({ hash: "H1", fileName: "totally-different-name.png" }, index);
  assert.equal(r.reason, "same_image");
  assert.equal(r.entry.caption, "S&K Mini Cream Box");
});
test("same file name but different bytes is flagged for a decision, not blocked outright", () => {
  const r = checkUpload({ hash: "NEW", fileName: "S_K_Mini_Cream_.jpeg" }, index);
  assert.equal(r.reason, "same_name");
});
test("a genuinely new image passes", () => {
  assert.equal(checkUpload({ hash: "NEW", fileName: "brand-new-box.jpg" }, index), null);
});
test("when an image is in both an active folder and Backup, the active one is reported", () => {
  assert.equal(checkUpload({ hash: "H2", fileName: "x.jpg" }, index).entry.folderId, "ring");
});
test("an image only in Backup is still caught (and marked as backup)", () => {
  const only = buildDuplicateIndex([{ hash: "B", fileName: "b.jpg", folderId: "backup-x", folderName: "Backup-X", caption: "c", backup: true }]);
  assert.equal(checkUpload({ hash: "B", fileName: "z.jpg" }, only).entry.backup, true);
});
test("two copies of the same file in ONE batch: the second is caught once the first is added", () => {
  const idx = buildDuplicateIndex([]);
  const up = { hash: "SAME", fileName: "a.jpg" };
  assert.equal(checkUpload(up, idx), null);
  addToIndex(idx, { ...up, folderName: "F", caption: "a" });
  assert.equal(checkUpload({ hash: "SAME", fileName: "b.jpg" }, idx).reason, "same_image");
});
test("very short file stems (e.g. '1.jpg') never cause false 'same name' matches", () => {
  const idx = buildDuplicateIndex([{ hash: "X", fileName: "1.jpg", folderName: "F", caption: "c" }]);
  assert.equal(checkUpload({ hash: "Y", fileName: "1.png" }, idx), null);
});

test("baseImageHashes.js covers EVERY catalogue image", () => {
  const paths = FOLDERS.flatMap((f) => f.photos.map((p) => p.img));
  const missing = paths.filter((p) => !BASE_IMAGE_HASHES[p]);
  assert.deepEqual(missing, [], "run `npm run hash-images`");
});
test("baseImageHashes.js is up to date with the actual image files", () => {
  const root = new URL("../public", import.meta.url).pathname;
  const stale = Object.entries(BASE_IMAGE_HASHES).filter(
    ([p, h]) => !existsSync(root + p) || ref(readFileSync(root + p)) !== h
  );
  assert.deepEqual(stale.map(([p]) => p), [], "run `npm run hash-images`");
});
test("re-uploading a real catalogue image is detected as the same image", () => {
  const root = new URL("../public", import.meta.url).pathname;
  const first = FOLDERS[0].photos[0];
  const idx = buildDuplicateIndex(
    FOLDERS.flatMap((f) => f.photos.map((p) => ({ hash: BASE_IMAGE_HASHES[p.img], fileName: p.img, folderId: f.id, folderName: f.name, caption: p.caption })))
  );
  const bytes = readFileSync(root + first.img);
  const r = checkUpload({ hash: sha256Hex(new Uint8Array(bytes)), fileName: "IMG_20240101_123456.jpg" }, idx);
  assert.equal(r.reason, "same_image");
});

setTimeout(() => console.log(`\n${passed} passed${process.exitCode ? " — SOME FAILED" : ""}\n`), 1500);
