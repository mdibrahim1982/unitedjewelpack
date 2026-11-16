// An in-memory stand-in for Firestore, with the one behaviour that matters for
// correctness: TRANSACTIONS ARE OPTIMISTIC. A transaction remembers the version
// of every document it read; if any of them changed before it commits, nothing
// is written and the whole transaction runs again — exactly like Firestore.
// That lets the tests prove duplicate clicks and concurrent orders can't
// double-deduct or over-reserve stock.
//
// It deliberately does NOT emulate Security Rules (those are tested separately
// against the real emulator — see tests/firestore.rules.test.mjs).

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const tick = () => new Promise((r) => setTimeout(r, 0)); // lets concurrent transactions interleave

function matchesWhere(doc, where) {
  if (!where) return true;
  const [field, op, value] = where;
  if (op !== "==") throw new Error(`memoryStore: unsupported operator ${op}`);
  return doc[field] === value;
}

export function createMemoryStore({ persistKey = null, storage = null } = {}) {
  let db = {}; // { "orders/abc": { data, version } }
  const subs = new Set();

  if (persistKey && storage) {
    try {
      const raw = storage.getItem(persistKey);
      if (raw) db = JSON.parse(raw);
    } catch {
      db = {};
    }
  }

  function persist() {
    if (persistKey && storage) {
      try {
        storage.setItem(persistKey, JSON.stringify(db));
      } catch {
        /* ignore */
      }
    }
  }

  function docsIn(collection, query = {}) {
    const prefix = `${collection}/`;
    let docs = Object.entries(db)
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map(([p, e]) => ({ id: p.slice(prefix.length), ...clone(e.data) }))
      .filter((d) => matchesWhere(d, query.where));
    if (query.orderBy) {
      const [field, dir] = query.orderBy;
      docs.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (dir === "desc" ? -1 : 1));
    }
    if (query.limit) docs = docs.slice(0, query.limit);
    return docs;
  }

  function notify() {
    persist();
    for (const s of [...subs]) s.emit();
  }

  function applyWrite(path, data, merge) {
    const prev = db[path];
    const next = merge && prev ? { ...prev.data, ...clone(data) } : clone(data);
    db[path] = { data: next, version: (prev?.version ?? 0) + 1 };
  }

  const store = {
    async get(path) {
      await tick();
      return db[path] ? clone(db[path].data) : null;
    },

    async set(path, data, { merge = false } = {}) {
      await tick();
      applyWrite(path, data, merge);
      notify();
    },

    async batchSet(entries) {
      await tick();
      for (const { path, data } of entries) applyWrite(path, data, false);
      notify();
    },

    async list(collection, query = {}) {
      await tick();
      return docsIn(collection, query);
    },

    async runTransaction(fn, { maxAttempts = 8 } = {}) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const reads = new Map(); // path → version seen
        const writes = [];
        const tx = {
          async get(path) {
            if (writes.length) throw new Error("Transaction reads must come before writes");
            await tick();
            reads.set(path, db[path]?.version ?? 0);
            return db[path] ? clone(db[path].data) : null;
          },
          set(path, data, { merge = false } = {}) {
            writes.push({ path, data, merge });
          },
        };
        const result = await fn(tx);
        // ---- commit (synchronous, so it is atomic) ----
        const stale = [...reads].some(([p, v]) => (db[p]?.version ?? 0) !== v);
        if (stale) continue; // someone else changed a document we read → run again
        for (const w of writes) applyWrite(w.path, w.data, w.merge);
        if (writes.length) notify();
        return result;
      }
      throw new Error("Transaction failed: too much contention");
    },

    // Calls onDocs with the current documents now and after every change.
    subscribe(collection, query, onDocs) {
      const sub = {
        emit: () => onDocs(docsIn(collection, query)),
      };
      subs.add(sub);
      Promise.resolve().then(() => subs.has(sub) && sub.emit());
      return () => subs.delete(sub);
    },

    // test helpers
    _dump: () => clone(db),
    _count: (collection) => docsIn(collection).length,
  };
  return store;
}
