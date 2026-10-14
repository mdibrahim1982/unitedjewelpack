import { PHONE_NUMBER, waLink, GENERIC_MSG } from "../data";
import { useLanguage } from "../i18n";
import { useAuth } from "../auth";
import { useSalesRepAuth } from "../salesRepAuth";
import { useCustomer } from "../customerStore";
import LanguageSwitch from "./LanguageSwitch";

// Full-width banner: brand + tagline on the left, actions on the right, and
// — once someone is signed in — a "who's signed in" strip with Logout, so
// logging out never needs a trip back to a dashboard first.
export default function Header({ onLogoClick, onAdminClick, onSalesRepClick }) {
  const phoneDisplay = PHONE_NUMBER.replace(/^91/, "");
  const { t } = useLanguage();
  const { isAdmin, logout: adminLogout } = useAuth();
  const { isSalesRep, salesRepName, logout: salesRepLogout } = useSalesRepAuth();
  const { customer, logout: customerLogout } = useCustomer();

  // Staff take precedence; a customer who is also remembered stays signed in
  // after staff log out.
  const isStaff = isAdmin || isSalesRep;
  const signedIn = isStaff || !!customer;

  function handleLogout() {
    if (isSalesRep) salesRepLogout();
    if (isAdmin) adminLogout();
    if (!isStaff) customerLogout();
  }

  let who = null;
  if (isAdmin) who = `🛡️ ${t("adminDashboard")}`;
  else if (isSalesRep) who = `🤝 ${salesRepName}`;
  else if (customer) who = `🏪 ${customer.shopName} · ${customer.location}`;

  return (
    <header className="site banner">
      <div className="banner-inner">
        <button
          className="banner-brand"
          onClick={onLogoClick}
          aria-label="Go to Jewel Boxes home"
        >
          <span className="banner-mono">UJP</span>
          <span className="banner-text">
            <span className="banner-title">{t("brandName")}</span>
            <span className="banner-subtitle">{t("brandPlace")}</span>
          </span>
        </button>

        <div className="banner-actions">
          <LanguageSwitch />
          <a className="banner-btn" href={`tel:+${PHONE_NUMBER}`}>
            📞 <span className="long">{phoneDisplay}</span>
          </a>
          <a
            className="banner-btn banner-btn-whatsapp"
            href={waLink(GENERIC_MSG)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("whatsappUs")}
          </a>
          <button className="banner-btn" onClick={onSalesRepClick}>
            {isSalesRep ? t("salesRepDashboardTitle") : t("salesRepLink")}
          </button>
          <button className="banner-btn" onClick={onAdminClick}>
            {isAdmin ? t("adminDashboard") : t("adminLink")}
          </button>
        </div>
      </div>

      {signedIn && (
        <div className="banner-who">
          <span className="banner-who-text">{who}</span>
          <button
            className="banner-btn banner-btn-logout header-logout-btn"
            onClick={handleLogout}
          >
            {t("logout")}
          </button>
        </div>
      )}
    </header>
  );
}
