import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePhotoStore } from "./photoStore";
import { useAuth } from "./auth";
import { useSalesRepAuth } from "./salesRepAuth";
import { USE_REMOTE } from "./backend";
import { useRemoteInventory } from "./firebase/RemoteInventory";
import { getBackend } from "./firebase/backendFactory";
import { ensureUid } from "./firebase/session";
import * as remote from "./firebase/ordersRemote";
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
// The business rules live in inventoryLedger.js (pure, shared, unit-tested).
// This provider only decides WHERE orders are kept:
//
//  • Firebase mode — orders live in Cloud Firestore. Every action is one
//    Firestore transaction (src/firebase/ordersRemote.js): the order status and
//    the stock figures change together or not at all, and a repeated click or a
//    second admin can't apply the same step twice. Admins see every order; a
//    sales rep sees only their own (the Security Rules enforce this too).
//  • Local mode — the original behaviour: orders in this browser's
//    localStorage, applied in one synchronous read-modify-write.
//
// Either way every action returns a Promise of { ok, ... } so the screens
// behave the same in both modes.

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

const newest = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export function newOrderId() {
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// a Firebase failure becomes a normal { ok:false } result the screens can show
const failure = (e) => ({ ok: false, code: (e && e.code) || "error" });

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const { folders, adjustStockBatch } = usePhotoStore();
  const { isAdmin } = useAuth();
  const { isSalesRep, salesRepUid } = useSalesRepAuth();
  const { inventory } = useRemoteInventory();
  const [orders, setOrders] = useState(() => (USE_REMOTE ? [] : loadOrders()));

  // Always-current view of folders for use inside local transactions.
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  // ---- local mode: pick up changes made in another browser tab ----
  useEffect(() => {
    if (USE_REMOTE) return undefined;
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setOrders(loadOrders());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---- Firebase mode: live orders for whoever is signed in ----
  useEffect(() => {
    if (!USE_REMOTE) return undefined;
    setOrders([]);
    let query = null;
    if (isAdmin) query = { orderBy: ["createdAt", "desc"], limit: 500 };
    else if (isSalesRep && salesRepUid) query = { where: ["salesRepUid", "==", salesRepUid] };
    if (!query) return undefined; // customers never read orders
    let stop = () => {};
    let cancelled = false;
    getBackend()
      .then(({ store }) => {
        if (cancelled) return;
        stop = store.subscribe(
          "orders",
          query,
          (docs) => setOrders([...docs].sort(newest)),
          () => {}
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, [isAdmin, isSalesRep, salesRepUid]);

  // ------------------------------------------------------------------
  // local-mode machinery (unchanged from the original)
  // ------------------------------------------------------------------
  function physicalOf(key) {
    const [folderId, ...rest] = key.split(":");
    const photoId = rest.join(":");
    const folder = foldersRef.current.find((f) => f.id === folderId);
    const photo = folder?.photos.find((p) => String(p.id) === photoId);
    return toPieces(photo?.stock);
  }

  function transactLocal(rule) {
    const latest = loadOrders();
    const result = rule(latest);
    if (!result.ok) {
      if (result.code === "invalid_status" || result.code === "not_found") setOrders(latest);
      return result;
    }
    saveOrders(result.orders);
    setOrders(result.orders);
    if (result.stockDeltas && result.stockDeltas.length) {
      adjustStockBatch(
        result.stockDeltas.map((d) => ({ folderId: d.folderId, photoId: d.photoId, delta: d.delta }))
      );
    }
    return result;
  }

  // run an action against the right backend, always returning a Promise
  async function withStore(fn) {
    try {
      const { store } = await getBackend();
      return await fn(store);
    } catch (e) {
      return failure(e);
    }
  }

  // ------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------

  // Creating an order NEVER changes stock — it only records a pending request.
  // `order`: { items, lines:[{key,folderId,photoId,caption,pieces}], ...meta }
  async function submitOrder(order) {
    const id = order.id || newOrderId();
    if (!USE_REMOTE) {
      const r = transactLocal((latest) => createPendingOrder(latest, { ...order, id }));
      return r.ok ? { ...r, id } : r;
    }
    try {
      const uid = await ensureUid(); // customers get an anonymous identity here
      const record = { ...order, id };
      if (record.placedBy === "customer") record.customerUid = uid;
      if (record.placedBy === "salesRep") record.salesRepUid = uid;
      return await withStore((store) => remote.createOrder(store, record));
    } catch (e) {
      return failure(e);
    }
  }

  const approveOrder = (id) =>
    USE_REMOTE
      ? withStore((store) => remote.approveOrder(store, id))
      : Promise.resolve(transactLocal((latest) => ledgerApprove(latest, id, physicalOf)));

  const rejectOrder = (id) =>
    USE_REMOTE
      ? withStore((store) => remote.rejectOrder(store, id))
      : Promise.resolve(transactLocal((latest) => ledgerReject(latest, id)));

  const cancelOrder = (id) =>
    USE_REMOTE
      ? withStore((store) => remote.cancelOrder(store, id))
      : Promise.resolve(transactLocal((latest) => ledgerCancel(latest, id)));

  // dispatched: { [lineKey]: piecesActuallySent }; extraLines: products ADDED
  // to this dispatch that weren't in the order.
  const confirmDispatch = (id, dispatched, extraLines = []) =>
    USE_REMOTE
      ? withStore((store) => remote.confirmDispatch(store, id, dispatched, extraLines))
      : Promise.resolve(
          transactLocal((latest) =>
            ledgerDispatch(latest, id, dispatched, physicalOf, new Date(), extraLines)
          )
        );

  // Pieces reserved for one product by approved, not-yet-dispatched orders.
  // Firebase mode reads the running total kept on the inventory document;
  // local mode adds it up from the orders.
  const localReserved = USE_REMOTE ? {} : reservedMap(orders);
  const reservedPcOf = (folderId, photoId) =>
    USE_REMOTE
      ? Math.max(0, Math.floor(inventory[`${folderId}:${photoId}`]?.reserved || 0))
      : localReserved[stockKey(folderId, photoId)] || 0;

  const byStatus = (status) => orders.filter((o) => o.status === status);

  return (
    <OrdersContext.Provider
      value={{
        orders,
        pendingOrders: byStatus(STATUS.PENDING),
        approvedOrders: byStatus(STATUS.APPROVED),
        dispatchedOrders: byStatus(STATUS.DISPATCHED),
        reservedPcOf,
        newOrderId,
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
