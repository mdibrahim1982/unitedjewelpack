// Decides whether an image being uploaded is already in the catalogue.
//   same_image — identical bytes (SHA-256 match)  → blocked outright
//   same_name  — same file name, but different bytes → admin is asked
// Pure functions: the caller supplies already-computed hashes.

// "S_K_Mini_Cream_.jpeg" and "sk-mini-cream.jpeg" both → "skminicream"
export function fileStem(nameOrPath) {
  const base = String(nameOrPath ?? "").split(/[\\/]/).pop();
  return base.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// entries: [{ hash?, fileName?, folderId, folderName, caption, backup }]
// Active folders win over Backup folders when the same image is in both.
export function buildDuplicateIndex(entries) {
  const byHash = new Map();
  const byStem = new Map();
  const ordered = [...entries].sort((a, b) => Number(!!a.backup) - Number(!!b.backup));
  for (const e of ordered) addToIndex({ byHash, byStem }, e);
  return { byHash, byStem };
}

export function addToIndex(index, entry) {
  if (entry.hash && !index.byHash.has(entry.hash)) index.byHash.set(entry.hash, entry);
  const stem = entry.fileName ? fileStem(entry.fileName) : "";
  if (stem.length >= 3 && !index.byStem.has(stem)) index.byStem.set(stem, entry);
}

// upload: { hash, fileName } → null | { reason, entry }
export function checkUpload(upload, index) {
  if (upload.hash && index.byHash.has(upload.hash)) {
    return { reason: "same_image", entry: index.byHash.get(upload.hash) };
  }
  const stem = fileStem(upload.fileName);
  if (stem.length >= 3 && index.byStem.has(stem)) {
    return { reason: "same_name", entry: index.byStem.get(stem) };
  }
  return null;
}
