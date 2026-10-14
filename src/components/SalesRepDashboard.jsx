import { useSalesRepAuth } from "../salesRepAuth";
import { useLanguage } from "../i18n";
import { useOrders } from "../ordersStore";
import OrderCard from "./OrderCard";

export default function SalesRepDashboard({ onGoToSite }) {
  const { salesRepName } = useSalesRepAuth();
  const { t } = useLanguage();
  const { orders } = useOrders();
  const myOrders = orders.filter((o) => o.salesRepName === salesRepName);

  return (
    <section className="wrap page-section">
      <div className="admin-topbar">
        <button className="back-link" onClick={onGoToSite}>
          {t("backToSite")}
        </button>
      </div>

      <h1 className="page-title serif">{t("salesRepDashboardTitle")}</h1>
      <p className="page-sub">
        {t("salesRepWelcome", { name: salesRepName })}
      </p>
      <p className="admin-note">{t("salesRepDashboardNote")}</p>

      <button className="btn btn-solid" onClick={onGoToSite}>
        {t("salesRepBrowseSite")}
      </button>

      <h3 className="admin-photos-heading order-history-heading">
        {t("salesRepMyOrders")}
      </h3>
      {myOrders.length === 0 ? (
        <p className="empty-note">{t("salesRepNoOrders")}</p>
      ) : (
        <div className="order-list">
          {myOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </section>
  );
}
