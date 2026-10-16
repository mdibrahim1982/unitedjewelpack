import { waLink } from "./data";
import { roundTotal } from "./money";
import { PCS_PER_UNIT } from "./pricingStore";

// ===================== cart → WhatsApp order =====================
// wa.me links can only pre-fill text (no attachments), so "Place Order"
// opens a WhatsApp chat with the owner's number pre-filled with a message
// listing every cart item, its folder, quantity, rate per piece, and
// line/grand total value (rate × qty × PCS_PER_UNIT). Every item carries
// its own unit price (₹ per pc), captured when it was added to the cart;
// an item with no price yet (0) is sent as "price on request".
//
// `extraAmount` is an optional manual add-on (e.g. a delivery charge)
// entered in the cart; when present it's shown as its own line and folded
// into the grand total.

// Short, human-friendly reference for an order id ("order-1700…-ab12c" → "AB12C"),
// quoted in the WhatsApp message so the admin can find it in the Orders tab.
export function orderRefOf(id) {
  return String(id || "").slice(-5).toUpperCase();
}

export function buildCartOrderMessage(
  items,
  extraAmount = 0,
  shopDetails = {},
  orderRef = ""
) {
  const unitOf = (it) => {
    const own = Number(it.unitPrice);
    return Number.isFinite(own) && own > 0 ? own : 0;
  };
  const multiplierOf = (it) => it.pcsPerUnit ?? PCS_PER_UNIT;
  const qtyUnitOf = (it) => (multiplierOf(it) === 1 ? "PCS" : "GR");
  const piecesOf = (it) => it.qty * multiplierOf(it);
  const lineTotal = (it) => piecesOf(it) * unitOf(it);
  const totalPieces = items.reduce((sum, it) => sum + piecesOf(it), 0);
  const itemsTotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const safeExtra = Number(extraAmount) > 0 ? Number(extraAmount) : 0;
  // Same rounding the cart shows: nearest rupee, difference on its own line.
  const { amount, rounded: totalValue, roundOff } = roundTotal(itemsTotal + safeExtra);
  const shopName = (shopDetails.shopName || "").trim();
  const location = (shopDetails.location || "").trim();
  const mobile = (shopDetails.mobile || "").trim();
  const salesRepName = (shopDetails.salesRepName || "").trim();
  const lines = [
    "Hi! I'd like to place an order for the following boxes:",
    ...(orderRef ? [`Order ref: #${orderRef}`] : []),
    ...(shopName ? [`Shop Name: ${shopName}`] : []),
    ...(location ? [`Location: ${location}`] : []),
    ...(mobile ? [`Mobile: ${mobile}`] : []),
    ...(salesRepName ? [`Sales Rep: ${salesRepName}`] : []),
    ...(shopDetails.placedBy === "admin" ? ["Placed by: Admin"] : []),
    "",
    ...items.map(
      (it, i) =>
        `${i + 1}. ${it.caption || "Untitled"} — ${it.folderName} — Qty: ${
          it.qty
        } ${qtyUnitOf(it)} (${piecesOf(it)} pc)` +
        (unitOf(it) === 0
          ? " — price on request"
          : ` — ₹${unitOf(it)}/pc — ₹${lineTotal(it)}`)
    ),
    ...(safeExtra > 0 ? ["", `Extra charge: ₹${safeExtra}`] : []),
    ...(roundOff !== 0
      ? ["", `Amount: ₹${amount}`, `Round off: ${roundOff > 0 ? "+" : "-"}₹${Math.abs(roundOff)}`]
      : []),
    "",
    `Total: ${items.length} item${
      items.length === 1 ? "" : "s"
    }, ${totalPieces} pc — ₹${totalValue}`,
    "",
    "Please review and approve this order. Thank you!",
  ];
  return lines.join("\n");
}

export function whatsappCartOrderLink(
  items,
  extraAmount = 0,
  shopDetails = {},
  orderRef = ""
) {
  return waLink(buildCartOrderMessage(items, extraAmount, shopDetails, orderRef));
}
