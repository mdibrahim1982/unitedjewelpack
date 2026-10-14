import { PHONE_NUMBER, waLink, GENERIC_MSG } from "../data";
import { useLanguage } from "../i18n";

export default function Footer() {
  const phoneDisplay = PHONE_NUMBER.replace(/^91/, "");
  const { t } = useLanguage();

  return (
    <footer>
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
            <a href={waLink(GENERIC_MSG)} target="_blank" rel="noopener noreferrer">
              🟢 {t("messageOnWhatsApp")}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
