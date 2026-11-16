// The real Cloud Firestore implementation of the small "store" interface the
// rest of the app uses (get / set / batchSet / list / runTransaction /
// subscribe). Everything interesting lives in ordersRemote.js; this file is
// only a translation layer to the Firebase SDK.
import { loadFirebase } from "./sdk.js";

export async function createFirebaseStore() {
  const { db, fsMod } = await loadFirebase();
  const { doc, getDoc, getDocs, setDoc, writeBatch, runTransaction, collection, query, where, orderBy, limit, onSnapshot } = fsMod;

  const ref = (path) => doc(db, path); // "orders/abc" → document reference
  const fromSnap = (snap) => (snap.exists() ? snap.data() : null);
  const asDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  function buildQuery(name, q = {}) {
    const c = [];
    if (q.where) c.push(where(q.where[0], q.where[1], q.where[2]));
    if (q.orderBy) c.push(orderBy(q.orderBy[0], q.orderBy[1] || "asc"));
    if (q.limit) c.push(limit(q.limit));
    return query(collection(db, name), ...c);
  }

  return {
    async get(path) {
      return fromSnap(await getDoc(ref(path)));
    },
    async set(path, data, { merge = false } = {}) {
      await setDoc(ref(path), data, { merge });
    },
    // chunks of 400 (Firestore allows 500 writes per batch)
    async batchSet(entries) {
      for (let i = 0; i < entries.length; i += 400) {
        const batch = writeBatch(db);
        for (const e of entries.slice(i, i + 400)) batch.set(ref(e.path), e.data);
        await batch.commit();
      }
    },
    async list(name, q) {
      return asDocs(await getDocs(buildQuery(name, q)));
    },
    // Firestore re-runs `fn` automatically if a document it read changed, so
    // `fn` must have no side effects other than tx.set (ours doesn't).
    runTransaction(fn) {
      return runTransaction(db, (t) =>
        fn({
          get: async (path) => fromSnap(await t.get(ref(path))),
          set: (path, data, opts = {}) => {
            t.set(ref(path), data, opts);
          },
        })
      );
    },
    subscribe(name, q, onDocs, onError) {
      return onSnapshot(buildQuery(name, q), (snap) => onDocs(asDocs(snap)), (e) => onError && onError(e));
    },
  };
}
