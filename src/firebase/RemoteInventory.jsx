import { createContext, useContext, useEffect, useState } from "react";
import { USE_REMOTE } from "../backend";
import { getBackend } from "./backendFactory";

// Live copy of the Firestore `inventory` collection:
//   { "folderId:photoId": { physical, reserved, price, ... } }
// Everyone may read it (the storefront shows stock and prices); only an admin
// may write it (Security Rules). In local mode this is an empty, inert context.
const RemoteInventoryContext = createContext({ inventory: {}, ready: true, error: null });

export function RemoteInventoryProvider({ children }) {
  const [state, setState] = useState({ inventory: {}, ready: !USE_REMOTE, error: null });

  useEffect(() => {
    if (!USE_REMOTE) return undefined;
    let stop = () => {};
    let cancelled = false;
    getBackend()
      .then(({ store }) => {
        if (cancelled) return;
        stop = store.subscribe(
          "inventory",
          {},
          (docs) => {
            const map = {};
            for (const d of docs) map[d.id] = d;
            setState({ inventory: map, ready: true, error: null });
          },
          (e) => setState((s) => ({ ...s, ready: true, error: (e && e.code) || "error" }))
        );
      })
      .catch(() => setState((s) => ({ ...s, ready: true, error: "unavailable" })));
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return <RemoteInventoryContext.Provider value={state}>{children}</RemoteInventoryContext.Provider>;
}

export const useRemoteInventory = () => useContext(RemoteInventoryContext);
