import { useLanguage } from "../i18n";

export default function LanguageSwitch() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="lang-switch" role="group" aria-label={t("language")}>
      <button
        className={"lang-btn" + (lang === "en" ? " lang-btn-active" : "")}
        onClick={() => setLang("en")}
      >
        EN
      </button>
      <button
        className={"lang-btn" + (lang === "ta" ? " lang-btn-active" : "")}
        onClick={() => setLang("ta")}
      >
        தமிழ்
      </button>
    </div>
  );
}
