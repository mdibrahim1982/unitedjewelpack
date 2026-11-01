import { useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { useOrders } from "../ordersStore";
import { usePhotoStore } from "../photoStore";
import OrderCard, {
  describeOrderError,
  useStockLookup,
  useQtyText,
} from "./OrderCard";

// Dispatch tab: approved orders. The admin types what was ACTUALLY sent for
// each product — less or more than ordered — and may also REMOVE an ordered
// product or ADD one that wasn't ordered. Only "Confirm dispatch" touches
// physical stock: it deducts exactly what was sent and releases the whole
// reservation, so anything approved-but-not-sent is available again. Added
// products come from free stock only. Cancel releases the reservation
// without deducting anything.
export default function AdminDispatch() {
  const { t } = useLanguage();
  const { orders, approvedOrders, confirmDispatch, cancelOrder } = useOrders();
  const { publicFolders } = usePhotoStore();
  const { physicalOf, reservedOf, availableOf } = useStockLookup();
  const qtyText = useQtyText();
  const [typed, setTyped] = useState({}); // { orderId: { productKey: "text" } }
  const [extras, setExtras] = useState({}); // { orderId: [ added products ] }
  const [search, setSearch] = useState({}); // { orderId: "query" }
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false); // synchronous guard against double clicks

  const captionOf = (key) => {
    for (const o of orders) {
      const l = o.lines.find((x) => x.key === key);
      if (l?.caption) return l.caption;
    }
    for (const list of Object.values(extras)) {
      const x = list.find((e) => e.key === key);
      if (x) return x.caption;
    }
    return key;
  };

  const extrasOf = (order) => extras[order.id] || [];

  // A box shows what was typed, else the product's own default.
  const valueOf = (order, key, fallback) =>
    typed[order.id]?.[key] !== undefined ? typed[order.id][key] : String(fallback);

  function setValue(orderId, key, value) {
    setTyped((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [key]: value },
    }));
  }

  // Most an ORDERED line can send: what's on hand minus pieces reserved for
  // OTHER approved orders (this order's own reservation is fair game).
  const maxForLine = (l) =>
    Math.max(0, physicalOf(l.key) - (reservedOf(l.key) - l.pieces));
  // Most an ADDED product can send: only stock nobody has reserved.
  const maxForExtra = (x) => Math.max(0, physicalOf(x.key) - reservedOf(x.key));

  // Whole-pack quantities step by ½ GR (75 pcs); odd / piece quantities by 1.
  const stepFor = (basePieces) => (basePieces > 0 && basePieces % 75 === 0 ? 75 : 1);

  function nudge(order, key, current, step, max, direction) {
    const n = Number(current);
    const base = Number.isFinite(n) ? n : 0;
    setValue(order.id, key, String(Math.max(0, Math.min(max, base + direction * step))));
  }

  // Everything typed for one order → what to send, per-product errors, totals.
  function readOrder(order) {
    const dispatched = {};
    const errors = {};
    let returned = 0;
    let more = 0;
    let removed = 0;
    let addedPieces = 0;
    const check = (key, raw, max) => {
      const text = String(raw).trim();
      const n = Number(text);
      if (text === "" || !Number.isInteger(n) || n < 0) {
        errors[key] = t("dispatchErrWhole");
        return null;
      }
      if (n > physicalOf(key)) {
        errors[key] = t("dispatchErrPhysical", { n: physicalOf(key) });
        return null;
      }
      if (n > max) {
        errors[key] = t("dispatchErrAvailable", { n: max });
        return null;
      }
      return n;
    };
    for (const l of order.lines) {
      const n = check(l.key, valueOf(order, l.key, l.pieces), maxForLine(l));
      if (n === null) continue;
      dispatched[l.key] = n;
      returned += Math.max(0, l.pieces - n);
      more += Math.max(0, n - l.pieces);
      if (n === 0) removed += 1;
    }
    for (const x of extrasOf(order)) {
      const n = check(x.key, valueOf(order, x.key, x.defaultQty), maxForExtra(x));
      if (n === null) continue;
      dispatched[x.key] = n;
      addedPieces += n;
    }
    const total = Object.values(dispatched).reduce((a, b) => a + b, 0);
    return { dispatched, errors, total, returned, more, removed, addedPieces };
  }

  function finish(result) {
    setMessage(
      result.ok
        ? { type: "ok", text: t("dispatchDone") }
        : { type: "error", text: describeOrderError(t, result, captionOf) }
    );
  }

  function handleConfirm(order) {
    if (inFlight.current) return;
    const r = readOrder(order);
    if (Object.keys(r.errors).length || r.total === 0) return;
    const addedCount = extrasOf(order).filter((x) => r.dispatched[x.key] > 0).length;
    const text = [
      t("dispatchConfirmBase", { total: r.total }),
      r.returned > 0 ? t("dispatchConfirmReturned", { returned: r.returned }) : "",
      r.more > 0 ? t("dispatchConfirmExtra", { extra: r.more }) : "",
      addedCount > 0
        ? t("dispatchConfirmAdded", { added: r.addedPieces, count: addedCount })
        : "",
      r.removed > 0 ? t("dispatchConfirmRemoved", { count: r.removed }) : "",
      t("dispatchConfirmFinal"),
    ]
      .filter(Boolean)
      .join(" ");
    if (!window.confirm(text)) return;

    inFlight.current = true;
    try {
      const result = confirmDispatch(
        order.id,
        r.dispatched,
        extrasOf(order).map(({ key, folderId, photoId, caption }) => ({
          key,
          folderId,
          photoId,
          caption,
        }))
      );
      finish(result);
      if (result.ok) {
        const drop = (prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        };
        setExtras(drop);
        setTyped(drop);
        setSearch(drop);
      }
    } finally {
      inFlight.current = false;
    }
  }

  function handleCancel(order) {
    if (inFlight.current) return;
    if (!window.confirm(t("cancelApprovedConfirm"))) return;
    inFlight.current = true;
    try {
      const result = cancelOrder(order.id);
      setMessage(
        result.ok
          ? { type: "ok", text: t("orderCancelledReleased") }
          : { type: "error", text: describeOrderError(t, result, captionOf) }
      );
    } finally {
      inFlight.current = false;
    }
  }

  // ---- add / remove products ----
  function addExtra(order, product) {
    const free = availableOf(product.key);
    if (free <= 0) return;
    setExtras((prev) => ({
      ...prev,
      [order.id]: [
        ...(prev[order.id] || []),
        { ...product, defaultQty: Math.min(150, free) },
      ],
    }));
    setSearch((prev) => ({ ...prev, [order.id]: "" }));
  }

  function removeExtra(order, key) {
    setExtras((prev) => ({
      ...prev,
      [order.id]: (prev[order.id] || []).filter((x) => x.key !== key),
    }));
  }

  // Products that could still be added to this order (not already in it).
  function searchResults(order) {
    const q = (search[order.id] || "").trim().toLowerCase();
    if (!q) return [];
    const taken = new Set([
      ...order.lines.map((l) => l.key),
      ...extrasOf(order).map((x) => x.key),
    ]);
    const out = [];
    for (const f of publicFolders) {
      for (const p of f.photos) {
        const key = `${f.id}:${p.id}`;
        if (taken.has(key)) continue;
        if (`${p.caption || ""} ${f.name}`.toLowerCase().includes(q)) {
          out.push({ key, folderId: f.id, photoId: p.id, caption: p.caption || key, folderName: f.name, img: p.img });
          if (out.length >= 8) return out;
        }
      }
    }
    return out;
  }

  // One quantity row: − [ n ] + , a live "less/more than ordered" chip, and
  // what that quantity is in GR / PC.
  function renderControls(order, { key, ordered, current, max, step, onRemove, removeLabel }) {
    const typedN = Number(current);
    const delta = Number.isFinite(typedN) ? typedN - ordered : 0;
    return (
      <div className="dispatch-line-controls">
        <span className="dispatch-line-label">{t("dispatchQtyLabel")}</span>
        <div className="qty-stepper">
          <button
            type="button"
            className="qty-btn"
            aria-label={t("dispatchDecrease", { n: step })}
            title={t("dispatchDecrease", { n: step })}
            onClick={() => nudge(order, key, current, step, max, -1)}
          >
            −
          </button>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className="qty-input"
            value={current}
            onChange={(e) => setValue(order.id, key, e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="qty-btn"
            aria-label={t("dispatchIncrease", { n: step })}
            title={t("dispatchIncrease", { n: step })}
            onClick={() => nudge(order, key, current, step, max, 1)}
          >
            +
          </button>
        </div>
        {ordered > 0 && (
          <span
            className={
              "dispatch-delta " +
              (delta < 0 ? "dispatch-delta-less" : delta > 0 ? "dispatch-delta-more" : "dispatch-delta-same")
            }
          >
            {delta === 0
              ? t("dispatchAsOrdered")
              : delta < 0
              ? t("dispatchLess", { n: -delta })
              : t("dispatchMore", { n: delta })}
          </span>
        )}
        {onRemove && (
          <button type="button" className="link-btn dispatch-remove" onClick={onRemove}>
            {removeLabel}
          </button>
        )}
      </div>
    );
  }

  const dispatchedOrders = orders.filter((o) => o.status === "dispatched");

  return (
    <div className="admin-orders">
      <p className="admin-note">{t("dispatchNote")}</p>

      {message && (
        <p
          className={"cart-notice" + (message.type === "error" ? " cart-notice-error" : "")}
          role="status"
        >
          {message.text}
        </p>
      )}

      <h3 className="admin-photos-heading">{t("dispatchHeading")}</h3>
      {approvedOrders.length === 0 ? (
        <p className="empty-note">{t("dispatchNone")}</p>
      ) : (
        <div className="order-list">
          {approvedOrders.map((order) => {
            const r = readOrder(order);
            const hasError = Object.keys(r.errors).length > 0;
            const results = searchResults(order);
            const query = (search[order.id] || "").trim();
            return (
              <OrderCard
                key={order.id}
                order={order}
                lineClass={(l) =>
                  Number(valueOf(order, l.key, l.pieces)) === 0 ? "order-line-removed" : ""
                }
                lineExtra={(l) => {
                  const current = valueOf(order, l.key, l.pieces);
                  const isRemoved = Number(current) === 0 && String(current).trim() !== "";
                  const typedN = Number(current);
                  return (
                    <div className="dispatch-line">
                      {isRemoved ? (
                        <div className="dispatch-line-controls">
                          <span className="dispatch-removed-note">{t("dispatchRemoved")}</span>
                          <button
                            type="button"
                            className="link-btn dispatch-remove"
                            onClick={() => setValue(order.id, l.key, String(l.pieces))}
                          >
                            {t("dispatchUndo")}
                          </button>
                        </div>
                      ) : (
                        renderControls(order, {
                          key: l.key,
                          ordered: l.pieces,
                          current,
                          max: maxForLine(l),
                          step: stepFor(l.pieces),
                          onRemove: () => setValue(order.id, l.key, "0"),
                          removeLabel: t("dispatchRemoveProduct"),
                        })
                      )}
                      <span className="order-line-avail">
                        {!isRemoved && Number.isFinite(typedN) && typedN >= 0
                          ? `= ${qtyText(typedN)} · `
                          : ""}
                        {t("onHandLabel")}: {physicalOf(l.key)} PC(s) · {t("dispatchMaxLabel")}:{" "}
                        {maxForLine(l)} PC(s)
                      </span>
                      {r.errors[l.key] && (
                        <span className="dispatch-line-error">{r.errors[l.key]}</span>
                      )}
                    </div>
                  );
                }}
                afterLines={
                  <div className="dispatch-extras">
                    {extrasOf(order).length > 0 && (
                      <ul className="order-lines order-extra-lines">
                        {extrasOf(order).map((x) => {
                          const current = valueOf(order, x.key, x.defaultQty);
                          const typedN = Number(current);
                          return (
                            <li key={x.key} className="order-line order-line-added">
                              <div className="order-line-main">
                                <span className="order-line-name">
                                  {x.caption} <span className="order-added-badge">{t("dispatchAddedBadge")}</span>
                                </span>
                                <span className="order-line-qty">{x.folderName}</span>
                              </div>
                              <div className="dispatch-line">
                                {renderControls(order, {
                                  key: x.key,
                                  ordered: 0,
                                  current,
                                  max: maxForExtra(x),
                                  step: stepFor(x.defaultQty),
                                  onRemove: () => removeExtra(order, x.key),
                                  removeLabel: t("dispatchRemoveAdded"),
                                })}
                                <span className="order-line-avail">
                                  {Number.isFinite(typedN) && typedN >= 0 ? `= ${qtyText(typedN)} · ` : ""}
                                  {t("onHandLabel")}: {physicalOf(x.key)} PC(s) · {t("dispatchMaxLabel")}:{" "}
                                  {maxForExtra(x)} PC(s)
                                </span>
                                {r.errors[x.key] && (
                                  <span className="dispatch-line-error">{r.errors[x.key]}</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="dispatch-add">
                      <label className="dispatch-add-label" htmlFor={`add-${order.id}`}>
                        {t("dispatchAddProduct")}
                      </label>
                      <input
                        id={`add-${order.id}`}
                        type="search"
                        className="field-input dispatch-add-input"
                        placeholder={t("dispatchAddPlaceholder")}
                        value={search[order.id] || ""}
                        onChange={(e) =>
                          setSearch((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                        autoComplete="off"
                      />
                      {query && results.length === 0 && (
                        <p className="dispatch-add-none">{t("dispatchAddNone")}</p>
                      )}
                      {results.length > 0 && (
                        <ul className="dispatch-add-results">
                          {results.map((p) => {
                            const free = availableOf(p.key);
                            return (
                              <li key={p.key}>
                                <button
                                  type="button"
                                  className="dispatch-add-result"
                                  disabled={free <= 0}
                                  onClick={() => addExtra(order, p)}
                                >
                                  <span className="dispatch-add-name">{p.caption}</span>
                                  <small>
                                    {p.folderName} ·{" "}
                                    {free > 0
                                      ? t("dispatchAddAvailable", { n: free })
                                      : t("dispatchAddNoStock")}
                                  </small>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className="btn btn-solid btn-sm"
                  disabled={hasError || r.total === 0}
                  onClick={() => handleConfirm(order)}
                >
                  {t("confirmDispatchBtn")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleCancel(order)}
                >
                  {t("cancelOrderBtn")}
                </button>
                {!hasError && r.total === 0 && (
                  <span className="dispatch-line-error dispatch-nothing">
                    {t("orderErrNothing")}
                  </span>
                )}
              </OrderCard>
            );
          })}
        </div>
      )}

      {dispatchedOrders.length > 0 && (
        <>
          <h3 className="admin-photos-heading order-history-heading">
            {t("dispatchedHeading")}
          </h3>
          <div className="order-list">
            {dispatchedOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
