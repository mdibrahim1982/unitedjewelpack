import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../i18n";
import { usePhotoStore } from "../photoStore";
import { FIREBASE_CONFIG, BACKEND } from "../backend";
import { getBackend } from "../firebase/backendFactory";
import { readLocalData, planMigration, runMigration } from "../firebase/migration";

// Shown to admins in Firebase mode (instead of the browser-only "Test data"
// bar): connection status, any failed write, and the one-time copy of the data
// still sitting in this browser into Firestore.
export default function FirebasePanel() {
  const { t } = useLanguage();
  const { remoteError, clearRemoteError } = usePhotoStore();
  const plan = useMemo(() => planMigration(readLocalData(localStorage)), []);
  const [meta, setMeta] = useState(undefined); // undefined = loading, null = never migrated
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    getBackend()
      .then(({ store }) => store.get("meta/migration"))
      .then((m) => alive && setMeta(m))
      .catch(() => alive && setMeta(null));
    return () => {
      alive = false;
    };
  }, []);

  const hasLocal = plan.inventory.length > 0 || plan.orders.length > 0;
  const done = meta && meta.status === "done";

  async function handleCopy() {
    if (busy) return;
    if (
      !window.confirm(
        t("fbCopyConfirm", { products: plan.inventory.length, orders: plan.orders.length })
      )
    )
      return;
    setBusy(true);
    setStatus(null);
    try {
      const { store } = await getBackend();
      const r = await runMigration(store, plan);
      if (r.ok) {
        setMeta({ status: "done", finishedAt: new Date().toISOString() });
        setStatus({ type: "ok", text: t("fbCopied", r.counts) });
      } else {
        setStatus({ type: "error", text: t(`fbErr_${r.code}`) });
      }
    } catch {
      setStatus({ type: "error", text: t("fbErr_error") });
    } finally {
      setBusy(false);
    }
  }

  const writeError = !remoteError
    ? null
    : remoteError.code === "below_reserved"
    ? t("stockBelowReservedError", { reserved: remoteError.reserved })
    : remoteError.code === "permission-denied"
    ? t("fbErr_permission")
    : t("fbErr_write");

  return (
    <div className="mock-data-bar firebase-panel">
      <div className="mock-data-text">
        <strong>{t("fbTitle")}</strong>
        <span>
          {t("fbConnected", {
            project: BACKEND === "memory" ? "(test)" : FIREBASE_CONFIG.projectId,
          })}
        </span>
        {hasLocal && !done && meta !== undefined && (
          <span className="mock-data-help">
            {t("fbLocalFound", { products: plan.inventory.length, orders: plan.orders.length })}
            {plan.skippedMock > 0 ? ` ${t("fbSkippedMock", { n: plan.skippedMock })}` : ""}
            {plan.problems.length > 0 ? ` ${t("fbErr_inconsistent")}` : ""}
          </span>
        )}
        {done && <span className="mock-data-help">{t("fbMigratedNote")}</span>}
      </div>
      {hasLocal && !done && meta !== undefined && (
        <div className="mock-data-actions">
          <button
            className="btn btn-solid btn-sm"
            onClick={handleCopy}
            disabled={busy || plan.problems.length > 0}
          >
            {busy ? t("fbCopying") : t("fbCopyBtn")}
          </button>
        </div>
      )}
      {status && (
        <p
          className={"cart-notice mock-data-flash" + (status.type === "error" ? " cart-notice-error" : "")}
          role="status"
        >
          {status.text}
        </p>
      )}
      {writeError && (
        <p className="cart-notice cart-notice-error mock-data-flash" role="alert">
          {writeError}{" "}
          <button type="button" className="link-btn" onClick={clearRemoteError}>
            {t("fbDismiss")}
          </button>
        </p>
      )}
    </div>
  );
}
