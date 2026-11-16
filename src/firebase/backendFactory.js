// One shared { store, authApi } for the whole app, created on first use.
import { BACKEND } from "../backend.js";

let promise = null;
let override = null;

export function getBackend() {
  if (override) return Promise.resolve(override);
  if (!promise) {
    promise = (async () => {
      if (BACKEND === "memory") {
        const m = await import("./memoryBackend.js");
        return m.createMemoryBackend();
      }
      const [s, a] = await Promise.all([import("./firebaseStore.js"), import("./firebaseAuth.js")]);
      return { store: await s.createFirebaseStore(), authApi: await a.createFirebaseAuth() };
    })();
  }
  return promise;
}

// tests inject their own backend
export function _setBackendForTests(b) {
  override = b;
}
