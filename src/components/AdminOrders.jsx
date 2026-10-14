import { useState } from "react";
import { useLanguage } from "../i18n";
import { useOrders } from "../ordersStore";
import OrderCard, {
  describeOrderError,
  useStockLookup,
} from "./OrderCard";

// Orders tab: sales-rep orders waiting for a decision.
//   Approve → reserves the ordered pieces (physical stock is NOT touched).
//   Reject / Cancel → no stock change (nothing was reserved yet).
// Approved orders move to the Dispatch tab.
export default function AdminOrders() {
  const { t } = useLanguage();
  const { orders, pendingOrders, approveOrder, rejectOrder, cancelOrder } =
    useOrders();
  const { availableOf } = useStockLookup();
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const captionOf = (key) => {
    for (const o of orders) {
      const l = o.lines.find((x) => x.key === key);
      if (l?.caption) return l.caption;
    }
    return key;
  };

  function run(id, action, okKey) {
    if (busyId) return; // ignore clicks while an action is in flight
    setBusyId(id);
    try {
      const result = action(id);
      setMessage(
        result.ok
          ? { type: "ok", text: t(okKey) }
          : { type: "error", text: describeOrderError(t, result, captionOf) }
      );
    } finally {
      setBusyId(null);
    }
  }

  const history = orders.filter((o) => o.status !== "pending" && o.status !== "approved");

  return (
    <div className="admin-orders">
      <p className="admin-note">{t("ordersNote")}</p>

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

      <h3 className="admin-photos-heading">{t("ordersPendingHeading")}</h3>
      {pendingOrders.length === 0 ? (
        <p className="empty-note">{t("ordersNonePending")}</p>
      ) : (
        <div className="order-list">
          {pendingOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              lineExtra={(l) => {
                const available = availableOf(l.key);
                return (
                  <span
                    className={
                      "order-line-avail" +
                      (available < l.pieces ? " order-line-avail-short" : "")
                    }
                  >
                    {t("availableNowLabel")}: {available} PC(s)
                  </span>
                );
              }}
            >
              <button
                type="button"
                className="btn btn-solid btn-sm"
                disabled={busyId === order.id}
                onClick={() => run(order.id, approveOrder, "orderApproved")}
              >
                {t("approveBtn")}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={busyId === order.id}
                onClick={() => run(order.id, rejectOrder, "orderRejected")}
              >
                {t("rejectBtn")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busyId === order.id}
                onClick={() => run(order.id, cancelOrder, "orderCancelled")}
              >
                {t("cancelOrderBtn")}
              </button>
            </OrderCard>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h3 className="admin-photos-heading order-history-heading">
            {t("ordersHistoryHeading")}
          </h3>
          <div className="order-list">
            {history.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
