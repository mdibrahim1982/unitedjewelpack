import { waLink } from "../data";
import WhatsAppIcon from "./WhatsAppIcon";
import { useLanguage } from "../i18n";

export default function WhatsAppFloat() {
  const { t } = useLanguage();
  return (
    <a
      className="wa-float tooltip"
      href={waLink(t("waGenericMsg"))}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      data-tooltip="Chat on WhatsApp"
    >
      <WhatsAppIcon size={30} />
    </a>
  );
}
