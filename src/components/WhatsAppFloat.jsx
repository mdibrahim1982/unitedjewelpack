import { waLink, GENERIC_MSG } from "../data";
import WhatsAppIcon from "./WhatsAppIcon";

export default function WhatsAppFloat() {
  return (
    <a
      className="wa-float tooltip"
      href={waLink(GENERIC_MSG)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      data-tooltip="Chat on WhatsApp"
    >
      <WhatsAppIcon size={30} />
    </a>
  );
}
