import { useLanguage } from "../i18n";
import { PCS_PER_UNIT } from "../pricingStore";
import { usePhotoStore } from "../photoStore";
import { useOrders } from "../ordersStore";

// "300" pieces → "2 GR(s) or 300 PC(s)" — same wording the cart uses.
export function useQtyText() {
  const { t } = useLanguage();
  return (pieces) =>
    t("cartLineGrPc", {
      qty: Math.round((pieces / PCS_PER_UNIT) * 100) / 100,
      pcs: pieces,
    });
}

// Live physical / reserved / available pieces for a product key
// ("folderId:photoId"), read from the same stores the rest of the app uses.
export function useStockLookup() {
  const { folders } = usePhotoStore();
  const { reservedPcOf } = useOrders();
  const parts = (key) => {
    const [folderId, ...rest] = key.split(":");
    return [folderId, rest.join(":")];
  };
  const physicalOf = (key) => {
    const [folderId, photoId] = parts(key);
    const photo = folders
      .find((f) => f.id === folderId)
      ?.photos.find((p) => String(p.id) === photoId);
    const n = Number(photo?.stock);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const reservedOf = (key) => {
    const [folderId, photoId] = parts(key);
    return reservedPcOf(folderId, isNaN(photoId) ? photoId : Number(photoId));
  };
  return {
    physicalOf,
    reservedOf,
    availableOf: (key) => Math.max(0, physicalOf(key) - reservedOf(key)),
  };
}

// Turns a ledger result ({ ok:false, code, ... }) into a message for the
// admin. `captionOf(key)` resolves a product key to its name.
export function describeOrderError(t, result, captionOf) {
  switch (result.code) {
    case "insufficient_stock":
      return t("orderErrInsufficient", {
        items: result.shortages
          .map(
            (s) =>
              `${captionOf(s.key)} (need ${s.requested}, available ${s.available})`
          )
          .join("; "),
      });
    case "invalid_status":
      return t("orderErrStatus");
    case "exceeds_available":
      return t("orderErrAvailable", { item: captionOf(result.key), max: result.max });
    case "invalid_quantity":
      return t("orderErrQty");
    case "insufficient_physical":
      return t("orderErrPhysical", { item: captionOf(result.key) });
    case "nothing_dispatched":
      return t("orderErrNothing");
    default:
      return t("orderErrGeneric");
  }
}

// One order: who/where/when, then its lines. `lineExtra(line)` lets a
// screen add per-line content (availability hint, dispatch input);
// `children` is the action row.
export default function OrderCard({ order, lineExtra, children }) {
  const { t } = useLanguage();
  const qtyText = useQtyText();

  return (
    <article className={"order-card order-card-" + order.status}>
      <header className="order-card-head">
        <div>
          <div className="order-card-title">
            {order.shopName || t("orderNoShop")}
            {order.location ? ` — ${order.location}` : ""}
            {order.placedBy === "customer" && (
              <span className="order-placed-by">{t("orderPlacedByCustomer")}</span>
            )}
            {order.placedBy === "admin" && (
              <span className="order-placed-by">{t("orderPlacedByAdmin")}</span>
            )}
          </div>
          <div className="order-card-meta">
            {order.mobile ? `${order.mobile} · ` : ""}
            {order.salesRepName
              ? `${t("orderSalesRep")}: ${order.salesRepName} · `
              : ""}
            {new Date(order.createdAt).toLocaleString()}
          </div>
        </div>
        <span className={"order-status order-status-" + order.status}>
          {t("orderStatus_" + order.status)}
        </span>
      </header>

      <ul className="order-lines">
        {order.lines.map((l) => (
          <li key={l.key} className="order-line">
            <div className="order-line-main">
              <span className="order-line-name">{l.caption || l.key}</span>
              <span className="order-line-qty">
                {t("orderedLabel")}: {qtyText(l.pieces)}
              </span>
            </div>
            {lineExtra && lineExtra(l)}
          </li>
        ))}
      </ul>

      {order.dispatchedLines && (
        <ul className="order-dispatched">
          {order.dispatchedLines.map((d) => {
            const name =
              order.lines.find((l) => l.key === d.key)?.caption || d.key;
            return (
              <li key={d.key}>
                {name}: {t("orderDispatchedLabel")} {d.dispatched} / {d.ordered}{" "}
                PC(s)
                {d.returned > 0 ? ` (${d.returned} ${t("orderReturnedLabel")})` : ""}
                {d.extra > 0 ? ` (+${d.extra} ${t("orderExtraLabel")})` : ""}
              </li>
            );
          })}
        </ul>
      )}

      {children && <div className="order-card-actions">{children}</div>}
    </article>
  );
}
