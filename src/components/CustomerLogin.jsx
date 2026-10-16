import { useState } from "react";
import { useLanguage } from "../i18n";
import { useCustomer } from "../customerStore";

// The default landing page for anyone who isn't signed in as staff. No
// password — it just records who is ordering, saves it on this device, and
// attaches it to every order they place.
export default function CustomerLogin({ onSalesRep, onAdmin }) {
  const { t } = useLanguage();
  const { login } = useCustomer();
  const [fields, setFields] = useState({ shopName: "", location: "", mobile: "" });
  const [errors, setErrors] = useState({});
  const [blocked, setBlocked] = useState(null);

  function setField(name, value) {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const result = login(fields);
    setBlocked(result.blocked || null);
    if (!result.ok) setErrors(result.errors);
  }

  const rows = [
    ["shopName", "shopNameLabel", "shopNamePlaceholder", "text", "organization"],
    ["location", "locationLabel", "locationPlaceholder", "text", "address-level2"],
    ["mobile", "mobileLabel", "mobilePlaceholder", "tel", "tel-national"],
  ];

  return (
    <section className="wrap page-section customer-login-section">
      <form className="customer-login-card" onSubmit={handleSubmit} noValidate>
        <div className="customer-login-icon" aria-hidden="true">🛍️</div>
        <h1 className="page-title serif customer-login-title">
          {t("customerLoginTitle")}
        </h1>
        <p className="page-sub">{t("customerLoginSubtitle")}</p>

        {blocked && (
          <p className="cart-notice cart-notice-error" role="alert">
            {t("sessionBlockedText", {
              who: `${t(`role_${blocked.role}`)} — ${blocked.name}`,
              requested: t("role_customer"),
            })}
          </p>
        )}

        {rows.map(([name, label, placeholder, type, autoComplete]) => (
          <div className="customer-login-field" key={name}>
            <label className="field-label" htmlFor={`cust-${name}`}>
              {t(label)} <span className="required-mark">*</span>
            </label>
            <input
              id={`cust-${name}`}
              className={"field-input" + (errors[name] ? " field-input-error" : "")}
              type={type}
              inputMode={type === "tel" ? "tel" : undefined}
              autoComplete={autoComplete}
              placeholder={t(placeholder)}
              value={fields[name]}
              aria-invalid={!!errors[name]}
              onChange={(e) => setField(name, e.target.value)}
            />
            {errors[name] && (
              <span className="field-error-text">
                {t(errors[name] === "mobile_invalid" ? "mobileInvalid" : "fieldRequired")}
              </span>
            )}
          </div>
        ))}

        <button className="btn btn-solid customer-login-submit" type="submit">
          {t("customerLoginContinue")}
        </button>
        <p className="customer-login-note">{t("customerLoginNote")}</p>

        <div className="customer-login-staff">
          <span>{t("customerLoginStaff")}</span>
          <button type="button" className="link-btn" onClick={onSalesRep}>
            {t("salesRepLink")}
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="link-btn" onClick={onAdmin}>
            {t("adminLink")}
          </button>
        </div>
      </form>
    </section>
  );
}
