// ===================== mock data builder =====================
// Pure + deterministic (same photos in → same data out), so it can be
// unit-tested in Node and produces the same scenarios on every load.
//
// Orders are NOT hand-written records: each one is pushed through the real
// ledger (create → approve → dispatch / reject / cancel), so every status is
// reachable by the real rules and stock/reservations are consistent by
// construction. A final check proves it.
//
// The first 14 products (ring-boxes first) get fixed, documented stock so
// there is always something specific to test:
//   #1  1000   plenty            #5   74  low-stock → piece mode
//   #2   400   plenty            #6   30  low-stock
//   #3   150   exactly 1 GR      #7    1  almost out
//   #4    75   exact boundary    #8    0  out of stock
//   (the remaining fixed ones are plentiful and used by the order history)

import {
  stockKey,
  createPendingOrder,
  approveOrder,
  rejectOrder,
  cancelOrder,
  confirmDispatch,
  checkInvariants,
} from "./inventoryLedger.js";
import { roundTotal } from "./money.js";

export const MOCK_SEED = 20240611;
const PCS_PER_UNIT = 150;
const FIXED_STOCK = [1000, 400, 150, 75, 74, 30, 1, 0, 2500, 1800, 900, 600, 3000, 500];

// Obviously fictional shops and phone numbers.
const SHOPS = [
  ["Sri Murugan Jewellers", "Tirunelveli", "9000010001"],
  ["Kaveri Gold Palace", "Madurai", "9000010002"],
  ["Anand Jewel Mart", "Tenkasi", "9000010003"],
  ["Sakthi Ornaments", "Nagercoil", "9000010004"],
  ["Rajalakshmi Jewellers", "Thoothukudi", "9000010005"],
  ["Meenakshi Gold House", "Sivakasi", "9000010006"],
  ["Annai Jewellers", "Melapalayam", "9000010007"],
  ["Pandian Fancy Jewels", "Virudhunagar", "9000010008"],
  ["Thangam Showroom", "Kovilpatti", "9000010009"],
  ["Lakshmi Diamond Hub", "Palayamkottai", "9000010010"],
  ["Vel Ornament Centre", "Sankarankovil", "9000010011"],
  ["Ruby Gold & Silver", "Nanguneri", "9000010012"],
];
const REPS = ["Sales Rep 1", "Sales Rep 2"]; // must match salesRepAuth.jsx

// [index into the photo list, pieces]. `sent` = pieces actually dispatched
// (may be below OR above the ordered quantity). rep: null = customer order.
// Chronological, oldest first.
const ORDER_SPECS = [
  { id: "D1", status: "dispatched", rep: 0, shop: 0, daysAgo: 9, lines: [[8, 300]], sent: [330], extra: 0 }, // sent MORE than ordered
  { id: "D2", status: "dispatched", rep: 1, shop: 1, daysAgo: 8, lines: [[9, 450], [10, 150]], sent: [300, 150], extra: 100 },
  { id: "X1", status: "rejected", rep: 0, shop: 0, daysAgo: 7, lines: [[8, 150]] },
  { id: "D3", status: "dispatched", rep: null, shop: 2, daysAgo: 6, lines: [[11, 600], [12, 300]], sent: [600, 150], extra: 0 },
  { id: "C1", status: "cancelled", rep: 1, shop: 3, daysAgo: 5, lines: [[12, 450]], approveFirst: true },
  { id: "D4", status: "dispatched", rep: 1, shop: 3, daysAgo: 4, lines: [[13, 150]], sent: [100], extra: 50 },
  { id: "X2", status: "rejected", rep: 1, shop: 1, daysAgo: 3, lines: [[9, 4500]] },
  { id: "A1", status: "approved", rep: 0, shop: 4, daysAgo: 3, lines: [[0, 300], [1, 150]], extra: 0 },
  { id: "A2", status: "approved", rep: 1, shop: 5, daysAgo: 2, lines: [[2, 75], [9, 300]], extra: 0 },
  { id: "A3", status: "approved", rep: null, shop: 6, daysAgo: 1, lines: [[10, 450]], extra: 120 },
  // Pending — chosen to exercise approval: P1 fits, P2 only fits until P1 is
  // approved, P3/P5 are already short, P4 mixes piece-mode and boundary.
  { id: "P1", status: "pending", rep: 0, shop: 7, daysAgo: 1, lines: [[0, 450]], extra: 0 },
  { id: "P2", status: "pending", rep: 1, shop: 8, daysAgo: 0.5, lines: [[0, 600]], extra: 0 },
  { id: "P3", status: "pending", rep: 1, shop: 9, daysAgo: 0.3, lines: [[1, 300]], extra: 0 },
  { id: "P4", status: "pending", rep: null, shop: 10, daysAgo: 0.2, lines: [[4, 40], [3, 75]], extra: 0 },
  { id: "P5", status: "pending", rep: 1, shop: 11, daysAgo: 0.1, lines: [[7, 150]], extra: 0 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// folders: [{ id, name, photos: [{ id, caption, img }] }]  (public folders)
export function buildMockData(folders, now = new Date()) {
  const all = folders.flatMap((f) =>
    f.photos.map((p) => ({
      key: stockKey(f.id, p.id),
      folderId: f.id,
      folderName: f.name,
      photoId: p.id,
      caption: p.caption || "",
      img: p.img || "",
    }))
  );
  if (all.length < FIXED_STOCK.length) {
    return { ok: false, code: "not_enough_photos", have: all.length, need: FIXED_STOCK.length };
  }

  const rand = mulberry32(MOCK_SEED);
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

  // ---- final (current) stock + prices for every product ----
  const stock = {};
  const prices = {};
  all.forEach((ph, i) => {
    if (i < FIXED_STOCK.length) {
      stock[ph.key] = FIXED_STOCK[i];
    } else {
      const r = rand();
      stock[ph.key] =
        r < 0.05 ? 0
        : r < 0.15 ? between(1, 74)        // low-stock → piece mode
        : r < 0.3 ? between(75, 300)
        : r < 0.85 ? between(300, 2000)
        : between(2000, 6000);
    }
    const priced = i < FIXED_STOCK.length || rand() > 0.15; // ~15% left "price on request"
    prices[ph.key] = priced ? Math.round((2 + rand() * 16) * 4) / 4 : null;
  });

  // ---- orders, driven through the real ledger ----
  // Dispatched orders already took stock out. `stock` above is the CURRENT
  // level, so the history starts from current + what was later dispatched.
  const sentTotal = {};
  for (const s of ORDER_SPECS) {
    if (s.status !== "dispatched") continue;
    s.lines.forEach(([idx], n) => {
      const k = all[idx].key;
      sentTotal[k] = (sentTotal[k] || 0) + s.sent[n];
    });
  }
  const working = { ...stock };
  for (const [k, v] of Object.entries(sentTotal)) working[k] = stock[k] + v;
  const physical = (k) => working[k] ?? 0;

  const at = (daysAgo, plusHours = 0) =>
    new Date(now.getTime() - daysAgo * 86400000 + plusHours * 3600000);

  let orders = [];
  const must = (r, what) => {
    if (!r.ok) throw new Error(`mock data: ${what} failed (${r.code})`);
    return r;
  };

  for (const s of ORDER_SPECS) {
    const lines = s.lines.map(([idx, pieces]) => {
      const p = all[idx];
      return { key: p.key, folderId: p.folderId, photoId: p.photoId, caption: p.caption, pieces };
    });
    const items = lines.map((l, n) => {
      const p = all[s.lines[n][0]];
      const packMode = l.pieces % (PCS_PER_UNIT / 2) === 0; // whole/half packs
      const pcsPerUnit = packMode ? PCS_PER_UNIT : 1;
      return {
        key: l.key,
        folderSlug: l.folderId,
        folderName: p.folderName,
        photoId: l.photoId,
        img: p.img,
        caption: l.caption,
        qty: l.pieces / pcsPerUnit,
        unitPrice: prices[l.key],
        pcsPerUnit,
        debitedPieces: 0,
      };
    });
    const itemsTotal = lines.reduce((sum, l) => sum + l.pieces * (prices[l.key] || 0), 0);
    const extraAmount = s.extra || 0;
    const { rounded, roundOff } = roundTotal(itemsTotal + extraAmount);
    const [shopName, location, mobile] = SHOPS[s.shop];
    const created = at(s.daysAgo);

    orders = must(
      createPendingOrder(
        orders,
        {
          id: `mock-${s.id}`,
          mock: true,
          lines,
          items,
          shopName,
          location,
          mobile,
          // rep: null = ordered by the customer themselves (no sales rep)
          salesRepName: s.rep === null ? "" : REPS[s.rep],
          placedBy: s.rep === null ? "customer" : "salesRep",
          extraAmount,
          itemsTotal,
          roundOff,
          totalValue: rounded,
        },
        created
      ),
      `create ${s.id}`
    ).orders;

    const id = `mock-${s.id}`;
    const later = at(s.daysAgo, 2);
    if (s.status === "rejected") {
      orders = must(rejectOrder(orders, id, later), `reject ${s.id}`).orders;
    } else if (s.status === "approved" || s.status === "dispatched" || s.approveFirst) {
      orders = must(approveOrder(orders, id, physical, later), `approve ${s.id}`).orders;
      if (s.status === "dispatched") {
        const sent = {};
        lines.forEach((l, n) => (sent[l.key] = s.sent[n]));
        const r = must(confirmDispatch(orders, id, sent, physical, at(s.daysAgo, 26)), `dispatch ${s.id}`);
        orders = r.orders;
        for (const d of r.stockDeltas) working[d.key] += d.delta;
      } else if (s.status === "cancelled") {
        orders = must(cancelOrder(orders, id, at(s.daysAgo, 5)), `cancel ${s.id}`).orders;
      }
    }
  }

  // Safety net: history must land exactly on the intended current stock,
  // and no reservation may exceed it.
  for (const k of Object.keys(stock)) {
    if (working[k] !== stock[k]) throw new Error(`mock data: stock drift on ${k}`);
  }
  const problems = checkInvariants(orders, stock, Object.keys(stock));
  if (problems.length) throw new Error(`mock data: ${problems.join("; ")}`);

  const counts = {};
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1;
  return {
    ok: true,
    stock,
    prices,
    orders,
    summary: { products: all.length, orders: orders.length, byStatus: counts },
  };
}
