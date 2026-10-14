import { useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { useOrders } from "../ordersStore";
import OrderCard, {
  describeOrderError,
  useStockLookup,
  useQtyText,
} from "./OrderCard";

// Dispatch tab: approved orders. The admin types what was ACTUALLY sent
// for each product (may be less than ordered). Only "Confirm dispatch"
// touches physical stock: it deducts the actual quantities and releases
// the whole reservation, so anything approved but not sent is available
// again. Cancel releases the reservation without deducting anything.
export default function AdminDispatch() {
  const { t } = useLanguage();
  const { orders, approvedOrders, confirmDispatch, cancelOrder } = useOrders();
  const { physicalOf, reservedOf } = useStockLookup();
  const qtyText = useQtyText();
  const [typed, setTyped] = useState({}); // { orderId: { lineKey: "text" } }
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false); // synchronous guard against double clicks

  const captionOf = (key) => {
    for (const o of orders) {
      const l = o.lines.find((x) => x.key === key);
      if (l?.caption) return l.caption;
    }
    return key;
  };

  // Default each box to the ordered quantity until the admin edits it.
  const valueOf = (order, l) =>
    typed[order.id]?.[l.key] !== undefined
      ? typed[order.id][l.key]
      : String(l.pieces);

  function setValue(orderId, key, value) {
    setTyped((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [key]: value },
    }));
  }

  // The most this line can send: what's on hand, minus pieces reserved for
  // OTHER approved orders (this order's own reservation is fair game).
  const maxSendable = (l) =>
    Math.max(0, physicalOf(l.key) - (reservedOf(l.key) - l.pieces));

  // Whole-pack lines step by ½ GR (75 pcs); odd/piece-mode lines by 1 pc.
  const stepOf = (l) => (l.pieces % 75 === 0 ? 75 : 1);

  function nudge(order, l, direction) {
    const current = Number(valueOf(order, l));
    const base = Number.isFinite(current) ? current : l.pieces;
    const next = Math.max(0, Math.min(maxSendable(l), base + direction * stepOf(l)));
    setValue(order.id, l.key, String(next));
  }

  // Returns { dispatched, errors } for one order from what's currently typed.
  function readOrder(order) {
    const dispatched = {};
    const errors = {};
    for (const l of order.lines) {
      const raw = valueOf(order, l).trim();
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n) || n < 0) {
        errors[l.key] = t("dispatchErrWhole");
      } else if (n > physicalOf(l.key)) {
        errors[l.key] = t("dispatchErrPhysical", { n: physicalOf(l.key) });
      } else if (n > maxSendable(l)) {
        errors[l.key] = t("dispatchErrAvailable", { n: maxSendable(l) });
      } else {
        dispatched[l.key] = n;
      }
    }
    return { dispatched, errors };
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
    const { dispatched, errors } = readOrder(order);
    if (Object.keys(errors).length) return;
    const total = Object.values(dispatched).reduce((a, b) => a + b, 0);
    const returned = order.lines.reduce(
      (sum, l) => sum + Math.max(0, l.pieces - dispatched[l.key]),
      0
    );
    const extra = order.lines.reduce(
      (sum, l) => sum + Math.max(0, dispatched[l.key] - l.pieces),
      0
    );
    const text = [
      t("dispatchConfirmBase", { total }),
      returned > 0 ? t("dispatchConfirmReturned", { returned }) : "",
      extra > 0 ? t("dispatchConfirmExtra", { extra }) : "",
      t("dispatchConfirmFinal"),
    ]
      .filter(Boolean)
      .join(" ");
    if (!window.confirm(text)) return;

    inFlight.current = true;
    try {
      finish(confirmDispatch(order.id, dispatched));
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

  const dispatchedOrders = orders.filter((o) => o.status === "dispatched");

  return (
    <div className="admin-orders">
      <p className="admin-note">{t("dispatchNote")}</p>

      {message && (
        <p
          className={
            "cart-notice" + (message.type === "error" ? " cart-notice-error" : "")
          }
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
            const { errors } = readOrder(order);
            const hasError = Object.keys(errors).length > 0;
            return (
              <OrderCard
                key={order.id}
                order={order}
                lineExtra={(l) => {
                  const typedN = Number(valueOf(order, l));
                  const delta = Number.isFinite(typedN) ? typedN - l.pieces : 0;
                  return (
                    <div className="dispatch-line">
                      <div className="dispatch-line-controls">
                        <span className="dispatch-line-label">
                          {t("dispatchQtyLabel")}
                        </span>
                        <div className="qty-stepper">
                          <button
                            type="button"
                            className="qty-btn"
                            aria-label={t("dispatchDecrease", { n: stepOf(l) })}
                            title={t("dispatchDecrease", { n: stepOf(l) })}
                            onClick={() => nudge(order, l, -1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className="qty-input"
                            value={valueOf(order, l)}
                            onChange={(e) =>
                              setValue(order.id, l.key, e.target.value)
                            }
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            type="button"
                            className="qty-btn"
                            aria-label={t("dispatchIncrease", { n: stepOf(l) })}
                            title={t("dispatchIncrease", { n: stepOf(l) })}
                            onClick={() => nudge(order, l, 1)}
                          >
                            +
                          </button>
                        </div>
                        <span
                          className={
                            "dispatch-delta " +
                            (delta < 0
                              ? "dispatch-delta-less"
                              : delta > 0
                              ? "dispatch-delta-more"
                              : "dispatch-delta-same")
                          }
                        >
                          {delta === 0
                            ? t("dispatchAsOrdered")
                            : delta < 0
                            ? t("dispatchLess", { n: -delta })
                            : t("dispatchMore", { n: delta })}
                        </span>
                      </div>
                      <span className="order-line-avail">
                        {Number.isFinite(typedN) && typedN >= 0
                          ? `= ${qtyText(typedN)} · `
                          : ""}
                        {t("onHandLabel")}: {physicalOf(l.key)} PC(s) ·{" "}
                        {t("dispatchMaxLabel")}: {maxSendable(l)} PC(s)
                      </span>
                      {errors[l.key] && (
                        <span className="dispatch-line-error">{errors[l.key]}</span>
                      )}
                    </div>
                  );
                }}
              >
                <button
                  type="button"
                  className="btn btn-solid btn-sm"
                  disabled={hasError}
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
