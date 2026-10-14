import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePhotoStore } from "./photoStore";
import {
  STATUS,
  stockKey,
  reservedMap,
  createPendingOrder,
  approveOrder as ledgerApprove,
  rejectOrder as ledgerReject,
  cancelOrder as ledgerCancel,
  confirmDispatch as ledgerDispatch,
} from "./inventoryLedger";

// ===================== orders store =====================
// Thin, stateful wrapper around the pure rules in inventoryLedger.js.
//
// Every action runs as ONE synchronous "transaction":
//   1. re-read the latest saved orders (so a change made in another tab
//      is seen, not overwritten),
//   2. run the ledger rule against them plus current physical stock,
//   3. if it fails → change nothing and report why,
//   4. if it succeeds → save the new orders AND apply any physical-stock
//      deltas together in the same tick.
// Because the order status is checked inside the rule, a repeated click
// (approve twice, dispatch twice) is refused instead of applied twice.
//
// NOTE — this is localStorage, so it is atomic within a browser but can't
// coordinate between different devices. In Firestore the same ledger
// functions would run inside runTransaction (reading the order + product
// docs and writing them back), which is what gives true multi-user safety.

const STORAGE_KEY = "ujp_orders";

function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* ignore (e.g. storage full/disabled) */
  }
}

function toPieces(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const { folders, adjustStockBatch } = usePhotoStore();
  const [orders, setOrders] = useState(loadOrders);

  // Always-current view of folders for use inside transactions (state
  // captured in a closure can be one render behind).
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  // Pick up changes made in another browser tab.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setOrders(loadOrders());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function physicalOf(key) {
    const [folderId, ...rest] = key.split(":");
    const photoId = rest.join(":");
    const folder = foldersRef.current.find((f) => f.id === folderId);
    const photo = folder?.photos.find((p) => String(p.id) === photoId);
    return toPieces(photo?.stock);
  }

  // Runs `rule(latestOrders)` and commits the result (orders + stock)
  // together, or commits nothing.
  function transact(rule) {
    const latest = loadOrders();
    const result = rule(latest);
    if (!result.ok) {
      // Failed because the order moved on elsewhere? Re-sync our view.
      if (result.code === "invalid_status" || result.code === "not_found") {
        setOrders(latest);
      }
      return result;
    }
    saveOrders(result.orders); // persist immediately, not in an effect
    setOrders(result.orders);
    if (result.stockDeltas && result.stockDeltas.length) {
      adjustStockBatch(
        result.stockDeltas.map((d) => ({
          folderId: d.folderId,
          photoId: d.photoId,
          delta: d.delta,
        }))
      );
    }
    return result;
  }

  // Creating an order NEVER changes stock — it just records a pending
  // request for an admin to review.
  // `order`: { items, lines:[{key,folderId,photoId,caption,pieces}], ...meta }
  function submitOrder(order) {
    const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return transact((latest) => {
      const r = createPendingOrder(latest, { ...order, id });
      return r.ok ? { ...r, id } : r;
    });
  }

  const approveOrder = (id) =>
    transact((latest) => ledgerApprove(latest, id, physicalOf));
  const rejectOrder = (id) => transact((latest) => ledgerReject(latest, id));
  const cancelOrder = (id) => transact((latest) => ledgerCancel(latest, id));
  // dispatched: { [lineKey]: piecesActuallySent }
  const confirmDispatch = (id, dispatched) =>
    transact((latest) => ledgerDispatch(latest, id, dispatched, physicalOf));

  const reserved = reservedMap(orders);
  // Pieces reserved for one product by approved, not-yet-dispatched orders.
  const reservedPcOf = (folderId, photoId) =>
    reserved[stockKey(folderId, photoId)] || 0;

  const byStatus = (status) => orders.filter((o) => o.status === status);

  return (
    <OrdersContext.Provider
      value={{
        orders,
        pendingOrders: byStatus(STATUS.PENDING),
        approvedOrders: byStatus(STATUS.APPROVED),
        dispatchedOrders: byStatus(STATUS.DISPATCHED),
        reservedPcOf,
        submitOrder,
        approveOrder,
        rejectOrder,
        cancelOrder,
        confirmDispatch,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) {
    throw new Error("useOrders must be used inside an OrdersProvider");
  }
  return ctx;
}
