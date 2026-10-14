import { useCart } from "../cartStore";
import { useLanguage } from "../i18n";

export default function CartFloat({ onClick }) {
  const { totalItems } = useCart();
  const { t } = useLanguage();

  return (
    <button
      type="button"
      className="cart-float tooltip"
      onClick={onClick}
      aria-label={t("checkoutCart")}
      data-tooltip={t("checkoutCart")}
    >
      🛒
      {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
    </button>
  );
}
