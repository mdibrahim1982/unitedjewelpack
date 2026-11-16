import { PHONE_NUMBER, waLink } from "../data";
import { useLanguage } from "../i18n";

export default function Footer({ showSlogan = false }) {
  const phoneDisplay = PHONE_NUMBER.replace(/^91/, "");
  const { t } = useLanguage();

  return (
    <footer>
      {showSlogan && (
        <div className="wrap footer-slogan">
          <p className="footer-slogan-text serif">{t("slogan")}</p>
        </div>
      )}
      <div className="wrap footer-grid">
        <div>
          <h3 className="serif">📦 {t("brandName")}</h3>
          <p>{t("brandPlace")}</p>
          <p>{t("footerTagline")}</p>
        </div>
        <div>
          <h3 className="serif">💬 {t("getInTouch")}</h3>
          <p>
            <a href={`tel:+${PHONE_NUMBER}`}>📞 +91 {phoneDisplay}</a>
          </p>
          <p>
            <a href={waLink(t("waGenericMsg"))} target="_blank" rel="noopener noreferrer">
              🟢 {t("messageOnWhatsApp")}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
