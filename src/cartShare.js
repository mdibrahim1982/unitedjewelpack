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

// `tr(key, vars)` is the app's translate function, so the message is written
// in the language the shopper is using (English or Tamil). `folderNameOf(item)`
// supplies the folder name in that language too. Product captions are kept
// exactly as they appear in the catalogue.
export function buildCartOrderMessage(
  items,
  extraAmount = 0,
  shopDetails = {},
  orderRef = "",
  tr = (key) => key,
  folderNameOf = (it) => it.folderName
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

  const itemLine = (it, i) =>
    `${i + 1}. ${it.caption || tr("wa_untitled")} — ${folderNameOf(it)} — ` +
    tr("wa_qty", { qty: it.qty, unit: qtyUnitOf(it), pcs: piecesOf(it) }) +
    (unitOf(it) === 0
      ? ` — ${tr("wa_priceOnRequest")}`
      : ` — ₹${unitOf(it)}/pc — ₹${lineTotal(it)}`);

  const lines = [
    tr("wa_greeting"),
    ...(orderRef ? [tr("wa_orderRef", { ref: orderRef })] : []),
    ...(shopName ? [tr("wa_shopName", { value: shopName })] : []),
    ...(location ? [tr("wa_location", { value: location })] : []),
    ...(mobile ? [tr("wa_mobile", { value: mobile })] : []),
    ...(salesRepName ? [tr("wa_salesRep", { value: salesRepName })] : []),
    ...(shopDetails.placedBy === "admin" ? [tr("wa_placedByAdmin")] : []),
    "",
    ...items.map(itemLine),
    ...(safeExtra > 0 ? ["", tr("wa_extraCharge", { value: safeExtra })] : []),
    ...(roundOff !== 0
      ? [
          "",
          tr("wa_amount", { value: amount }),
          tr("wa_roundOff", { sign: roundOff > 0 ? "+" : "-", value: Math.abs(roundOff) }),
        ]
      : []),
    "",
    tr(items.length === 1 ? "wa_total_one" : "wa_total_other", {
      count: items.length,
      pcs: totalPieces,
      total: totalValue,
    }),
    "",
    tr("wa_closing"),
  ];
  return lines.join("\n");
}

export function whatsappCartOrderLink(
  items,
  extraAmount = 0,
  shopDetails = {},
  orderRef = "",
  tr,
  folderNameOf
) {
  return waLink(
    buildCartOrderMessage(items, extraAmount, shopDetails, orderRef, tr, folderNameOf)
  );
}
