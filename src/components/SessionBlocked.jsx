import { useLanguage } from "../i18n";

// Shown on a login screen INSTEAD of the form while a different user is
// still signed in. They have to log out first — we offer the button right
// here, but nothing is logged out unless it is pressed.
export default function SessionBlocked({ blocker, requested, onLogout }) {
  const { t } = useLanguage();
  const roleName = (r) => t(`role_${r}`);
  return (
    <section className="wrap page-section admin-login-section">
      <div className="admin-login-card session-blocked-card" role="alert">
        <div className="session-blocked-icon" aria-hidden="true">🔒</div>
        <h1 className="page-title serif admin-login-title">
          {t("sessionBlockedTitle")}
        </h1>
        <p className="page-sub">
          {t("sessionBlockedText", {
            who: `${roleName(blocker.role)} — ${blocker.name}`,
            requested: roleName(requested),
          })}
        </p>
        <button
          type="button"
          className="btn btn-solid admin-login-submit"
          onClick={onLogout}
        >
          {t("sessionBlockedLogout", { who: blocker.name })}
        </button>
      </div>
    </section>
  );
}
