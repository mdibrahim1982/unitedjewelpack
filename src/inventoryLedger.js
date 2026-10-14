// ===================== inventory & order ledger =====================
// Pure functions only — no React, no localStorage, no Firebase. Every
// function takes the current data and returns either
//   { ok: true,  orders, ...extras }   → a complete new state, or
//   { ok: false, code, ... }           → nothing changed.
// It never returns a half-applied result, which is what makes it safe to
// run inside a single storage "transaction" (today: one synchronous
// localStorage read-modify-write; in Firestore: the body of runTransaction).
//
// Stock model (all quantities are whole PIECES):
//   physical  — what is actually on the shelf. Changes ONLY when an admin
//               confirms a dispatch (or edits stock manually in Inventory).
//   reserved  — pieces promised to APPROVED, not-yet-dispatched orders.
//               Derived from orders, never stored separately, so it can't
//               drift out of sync with the orders themselves.
//   available — physical − reserved. This is what sales reps see.
//
// Order lifecycle:
//   pending ──approve──▶ approved ──confirmDispatch──▶ dispatched
//      │                    │
//      ├──reject──▶ rejected│
//      └──cancel──▶ cancelled◀──cancel──┘
//
//   pending    no stock effect at all
//   approved   reserves the ordered pieces (available ↓, physical unchanged)
//   rejected / cancelled   release any reservation (physical unchanged)
//   dispatched physical ↓ by what was ACTUALLY sent (less OR more than
//              ordered); the whole reservation is released, so anything
//              approved-but-not-sent is back in available automatically.

export const STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  DISPATCHED: "dispatched",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

export const stockKey = (folderId, photoId) => `${folderId}:${photoId}`;

const isWholePositive = (n) => Number.isInteger(n) && n > 0;
const isWholeNonNegative = (n) => Number.isInteger(n) && n >= 0;

// `physical` may be a plain { key: pieces } object or a (key) => pieces fn.
function physicalOf(physical, key) {
  const v = typeof physical === "function" ? physical(key) : physical?.[key];
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

// Sum of pieces held by APPROVED (not yet dispatched/cancelled) orders.
export function reservedMap(orders) {
  const map = {};
  for (const o of orders) {
    if (o.status !== STATUS.APPROVED) continue;
    for (const l of o.reservedLines || []) {
      map[l.key] = (map[l.key] || 0) + l.pieces;
    }
  }
  return map;
}

export function reservedOf(orders, key) {
  return reservedMap(orders)[key] || 0;
}

export function availableOf(physical, reserved) {
  return Math.max(0, physical - reserved);
}

// Validates and normalises the lines of a new order.
export function normaliseLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, code: "empty_order" };
  }
  const merged = new Map();
  for (const l of lines) {
    if (!l || !l.key || !isWholePositive(l.pieces)) {
      return { ok: false, code: "invalid_quantity", line: l };
    }
    const prev = merged.get(l.key);
    merged.set(l.key, {
      ...(prev || l),
      pieces: (prev ? prev.pieces : 0) + l.pieces,
    });
  }
  return { ok: true, lines: [...merged.values()] };
}

// Creating an order NEVER touches stock — it only adds a pending record.
export function createPendingOrder(orders, order, now = new Date()) {
  const norm = normaliseLines(order.lines);
  if (!norm.ok) return norm;
  if (orders.some((o) => o.id === order.id)) {
    return { ok: false, code: "duplicate_order_id" };
  }
  const record = {
    ...order,
    lines: norm.lines,
    status: STATUS.PENDING,
    createdAt: now.toISOString(),
  };
  return { ok: true, orders: [record, ...orders], order: record };
}

function findOrder(orders, id) {
  const idx = orders.findIndex((o) => o.id === id);
  return { idx, order: idx === -1 ? null : orders[idx] };
}

function replaceAt(orders, idx, next) {
  const copy = orders.slice();
  copy[idx] = next;
  return copy;
}

// Approve = reserve. Fails (changing nothing) if any line would exceed
// what's currently available, which is what stops concurrent/overlapping
// orders from over-promising stock.
export function approveOrder(orders, id, physical, now = new Date()) {
  const { idx, order } = findOrder(orders, id);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status !== STATUS.PENDING) {
    return { ok: false, code: "invalid_status", status: order.status };
  }
  const reserved = reservedMap(orders); // this order is pending, so excluded
  const shortages = [];
  for (const l of order.lines) {
    const available = availableOf(physicalOf(physical, l.key), reserved[l.key] || 0);
    if (l.pieces > available) {
      shortages.push({ key: l.key, requested: l.pieces, available });
    }
  }
  if (shortages.length) return { ok: false, code: "insufficient_stock", shortages };

  const next = {
    ...order,
    status: STATUS.APPROVED,
    approvedAt: now.toISOString(),
    reservedLines: order.lines.map((l) => ({ key: l.key, pieces: l.pieces })),
  };
  return { ok: true, orders: replaceAt(orders, idx, next), order: next };
}

// Reject = pending order declined. Nothing was reserved, so nothing to release.
export function rejectOrder(orders, id, now = new Date()) {
  const { idx, order } = findOrder(orders, id);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status !== STATUS.PENDING) {
    return { ok: false, code: "invalid_status", status: order.status };
  }
  const next = { ...order, status: STATUS.REJECTED, decidedAt: now.toISOString() };
  return { ok: true, orders: replaceAt(orders, idx, next), order: next };
}

// Cancel works on pending OR approved orders. Leaving APPROVED is what
// releases the reservation (reserved is derived from approved orders).
// A dispatched order can't be cancelled — its stock has already left.
export function cancelOrder(orders, id, now = new Date()) {
  const { idx, order } = findOrder(orders, id);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status !== STATUS.PENDING && order.status !== STATUS.APPROVED) {
    return { ok: false, code: "invalid_status", status: order.status };
  }
  const next = { ...order, status: STATUS.CANCELLED, decidedAt: now.toISOString() };
  return { ok: true, orders: replaceAt(orders, idx, next), order: next };
}

// Confirm dispatch: the ONLY place physical stock goes down.
// `dispatched` is { key: piecesActuallySent } and must cover every line.
// The admin may send LESS than ordered (the shortfall returns to available
// when the reservation is released) or MORE than ordered (the extra comes
// out of free stock). Sending more is only allowed from stock that is
// actually free: never from pieces reserved for OTHER approved orders, and
// never more than is physically on hand.
// Returns stockDeltas (negative numbers) for the caller to apply to
// physical stock in the same transaction as the order update.
export function confirmDispatch(orders, id, dispatched, physical, now = new Date()) {
  const { idx, order } = findOrder(orders, id);
  if (!order) return { ok: false, code: "not_found" };
  // Status check doubles as the duplicate-click guard: once dispatched,
  // a repeat confirm is rejected and can never deduct twice.
  if (order.status !== STATUS.APPROVED || order.stockDeducted) {
    return { ok: false, code: "invalid_status", status: order.status };
  }
  const lineKeys = new Set(order.lines.map((l) => l.key));
  for (const k of Object.keys(dispatched || {})) {
    if (!lineKeys.has(k)) return { ok: false, code: "unknown_line", key: k };
  }

  const reservedAll = reservedMap(orders);
  const ownReserved = {};
  for (const r of order.reservedLines || []) ownReserved[r.key] = r.pieces;

  const dispatchedLines = [];
  const stockDeltas = [];
  let total = 0;
  for (const l of order.lines) {
    const sent = dispatched?.[l.key];
    if (!isWholeNonNegative(sent)) {
      return { ok: false, code: "invalid_quantity", key: l.key, value: sent };
    }
    const onHand = physicalOf(physical, l.key);
    if (sent > onHand) {
      return { ok: false, code: "insufficient_physical", key: l.key, value: sent, max: onHand };
    }
    // Pieces held for OTHER approved orders are off limits.
    const heldForOthers = (reservedAll[l.key] || 0) - (ownReserved[l.key] || 0);
    const maxSendable = Math.max(0, onHand - heldForOthers);
    if (sent > maxSendable) {
      return { ok: false, code: "exceeds_available", key: l.key, value: sent, max: maxSendable };
    }
    total += sent;
    dispatchedLines.push({
      key: l.key,
      folderId: l.folderId,
      photoId: l.photoId,
      ordered: l.pieces,
      dispatched: sent,
      returned: Math.max(0, l.pieces - sent), // shortfall: back to available
      extra: Math.max(0, sent - l.pieces), // sent over the ordered quantity
    });
    if (sent > 0) {
      stockDeltas.push({ key: l.key, folderId: l.folderId, photoId: l.photoId, delta: -sent });
    }
  }
  if (total === 0) return { ok: false, code: "nothing_dispatched" };

  const next = {
    ...order,
    status: STATUS.DISPATCHED,
    dispatchedAt: now.toISOString(),
    dispatchedLines,
    stockDeducted: true,
  };
  return { ok: true, orders: replaceAt(orders, idx, next), order: next, stockDeltas };
}

// Consistency check used by tests (and handy as a runtime assertion):
// no negative stock, and reservations never exceed what's physically there.
export function checkInvariants(orders, physical, keys) {
  const problems = [];
  const reserved = reservedMap(orders);
  for (const k of keys) {
    const p = physicalOf(physical, k);
    const r = reserved[k] || 0;
    if (p < 0) problems.push(`negative physical for ${k}`);
    if (r > p) problems.push(`reserved ${r} > physical ${p} for ${k}`);
  }
  for (const o of orders) {
    if (o.status === STATUS.DISPATCHED && !o.stockDeducted) {
      problems.push(`${o.id} dispatched without stockDeducted flag`);
    }
  }
  return problems;
}
