import { useState } from "react";
import { useAuth } from "../auth";
import { useSalesRepAuth } from "../salesRepAuth";
import { useCustomer } from "../customerStore";
import { useCart } from "../cartStore";
import SessionBlocked from "./SessionBlocked";
import { useLanguage } from "../i18n";

export default function AdminLogin({ onSuccess }) {
  const { login } = useAuth();
  const rep = useSalesRepAuth();
  const { customer, logout: customerLogout } = useCustomer();
  const { clearCartOnLogout } = useCart();

  // Someone else is still signed in → they have to log out first.
  const blocker = rep.isSalesRep
    ? { role: "salesRep", name: rep.salesRepName, logout: rep.logout }
    : customer
    ? { role: "customer", name: customer.shopName, logout: customerLogout }
    : null;
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const ok = login(email, password);
    if (ok === "blocked") {
      // Someone signed in from another tab after this form appeared. Reload
      // so the screen reflects it (and shows the "log out first" panel)
      // rather than claiming the password was wrong.
      window.location.reload();
      return;
    }
    if (ok === true) {
      setError(false);
      onSuccess();
    } else {
      setError(true);
    }
  }

  if (blocker) {
    return (
      <SessionBlocked blocker={blocker} requested="admin" onLogout={() => {
          clearCartOnLogout();
          blocker.logout();
        }} />
    );
  }

  return (
    <section className="wrap page-section admin-login-section">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1 className="page-title serif admin-login-title">
          {t("adminLoginTitle")}
        </h1>
        <p className="page-sub">{t("adminLoginSubtitle")}</p>

        <label className="field-label" htmlFor="admin-email">
          {t("email")}
        </label>
        <input
          id="admin-email"
          className="field-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="field-label" htmlFor="admin-password">
          {t("password")}
        </label>
        <div className="password-field-wrap">
          <input
            id="admin-password"
            className="field-input"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                <path
                  d="M3 3l18 18M10.6 10.7a2.2 2.2 0 0 0 3.1 3.1M9.4 5.4A10.6 10.6 0 0 1 12 5c5.5 0 9.5 4 11 7-.6 1.2-1.6 2.7-3 4M6.6 6.6C4.6 8 3 9.9 2.5 12c1.5 3 5.5 7 9.5 7 1.4 0 2.7-.3 3.9-.9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                <path
                  d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
            )}
          </button>
        </div>

        {error && <p className="field-error">{t("invalidCredentials")}</p>}

        <button className="btn btn-solid admin-login-submit" type="submit">
          {t("signIn")}
        </button>
      </form>
    </section>
  );
}
