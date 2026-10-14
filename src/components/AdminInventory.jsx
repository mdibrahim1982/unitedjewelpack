import { useState } from "react";
import { useLanguage, translateFolderName } from "../i18n";
import { usePhotoStore } from "../photoStore";
import { useStockLookup } from "./OrderCard";
import { parseStock, pcToGr } from "../pricingStore";
import ConfirmDialog from "./ConfirmDialog";

// A per-folder table so an admin can manage stock one category at a time.
// "Current Stock" is the running total (pieces). Admin adjusts it with a
// +/- control rather than typing an absolute number: pick add or
// subtract, type an amount, and confirm via a Cancel/OK dialog before it's
// applied to the current total. Deducting more than what's currently in
// stock is blocked with an inline error instead of opening that dialog.
// GR(s) — the same unit used for cart qty — is calculated automatically
// as stock ÷ 150 and is read-only.
export default function AdminInventory() {
  const { t, lang } = useLanguage();
  const { publicFolders, updateStock } = usePhotoStore();
  const { reservedOf } = useStockLookup();
  const [searchQuery, setSearchQuery] = useState("");
  const [modeByRow, setModeByRow] = useState({});
  const [plusDraft, setPlusDraft] = useState({});
  const [minusDraft, setMinusDraft] = useState({});
  const [damageModeByRow, setDamageModeByRow] = useState({});
  const [damageDraft, setDamageDraft] = useState({});
  const [damageErrorByRow, setDamageErrorByRow] = useState({});
  const [errorByRow, setErrorByRow] = useState({});
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const allRows = publicFolders.flatMap((folder) =>
    folder.photos.map((photo) => ({ folder, photo }))
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const rows = trimmedQuery
    ? allRows.filter(({ folder, photo }) =>
        `${photo.caption || ""} ${folder.name}`
          .toLowerCase()
          .includes(trimmedQuery)
      )
    : allRows;

  // Categorized by folder — Ring Boxes, Kammal Boxes, etc. — each as its
  // own section, in the same order folders appear elsewhere in the admin.
  // A folder with no rows left after a search simply doesn't get a section.
  const groupedRows = publicFolders
    .map((folder) => ({
      folder,
      items: rows.filter((r) => r.folder.id === folder.id),
    }))
    .filter((group) => group.items.length > 0);

  function rowKey(folderId, photoId) {
    return `${folderId}:${photoId}`;
  }

  // Jump straight to where this item actually lives on the storefront,
  // and highlight/scroll to that exact photo once there.
  function goToItem(folderSlug, photoId) {
    window.location.hash = `/${folderSlug}?highlight=${encodeURIComponent(
      photoId
    )}`;
  }

  // No default mode — both radios start unchecked and both amount fields
  // start disabled until the admin picks + or −.
  function getMode(key) {
    return modeByRow[key] || null;
  }

  function setMode(key, mode) {
    setModeByRow((prev) => ({ ...prev, [key]: mode }));
  }

  // After a value is committed (or an invalid one is cleared out), the row
  // goes back to its default state: neither radio selected, both fields
  // disabled — ready for the next adjustment.
  function resetMode(key) {
    setModeByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // The Damage column has just one option (decrement), so its "radio" is
  // really just an enable switch for that row's field.
  function getDamageMode(key) {
    return !!damageModeByRow[key];
  }

  function setDamageMode(key) {
    setDamageModeByRow((prev) => ({ ...prev, [key]: true }));
  }

  function resetDamageMode(key) {
    setDamageModeByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function applyAdjustment(folder, photo, currentStock, mode, rawValue) {
    const delta = Math.round(Number(rawValue));
    const key = rowKey(folder.id, photo.id);
    if (!Number.isFinite(delta) || delta <= 0) {
      // Nothing valid typed — clear the field and drop back to the
      // deselected, disabled default state.
      if (mode === "add") setPlusDraft((p) => ({ ...p, [key]: "" }));
      else setMinusDraft((p) => ({ ...p, [key]: "" }));
      resetMode(key);
      return;
    }

    const base = currentStock ?? 0;

    if (mode === "subtract" && delta > base) {
      // Can't deduct more than what's currently in stock — show an
      // inline error and leave the field as-is so it can be corrected.
      setErrorByRow((prev) => ({
        ...prev,
        [key]: t("stockExceedsCurrentError", { delta, base }),
      }));
      return;
    }

    setErrorByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    const next = mode === "add" ? base + delta : base - delta;
    setPendingConfirm({ folder, photo, key, mode, delta, base, next });
  }

  // Damage always decrements — same validation as the subtract option
  // above, just its own column, field, and confirm-dialog wording.
  function applyDamage(folder, photo, currentStock, rawValue) {
    const delta = Math.round(Number(rawValue));
    const key = rowKey(folder.id, photo.id);
    if (!Number.isFinite(delta) || delta <= 0) {
      setDamageDraft((p) => ({ ...p, [key]: "" }));
      resetDamageMode(key);
      return;
    }

    const base = currentStock ?? 0;

    if (delta > base) {
      setDamageErrorByRow((prev) => ({
        ...prev,
        [key]: t("stockExceedsCurrentError", { delta, base }),
      }));
      return;
    }

    setDamageErrorByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setPendingConfirm({
      folder,
      photo,
      key,
      mode: "damage",
      delta,
      base,
      next: base - delta,
    });
  }

  function confirmPending() {
    if (!pendingConfirm) return;
    const { folder, photo, key, mode, next } = pendingConfirm;
    const reserved = reservedOf(key);
    if (next < reserved) {
      // Approved orders are counting on these pieces — refuse rather than
      // let physical stock fall below what is already promised.
      setErrorByRow((prev) => ({
        ...prev,
        [key]: t("stockBelowReservedError", { reserved }),
      }));
      setPendingConfirm(null);
      return;
    }
    updateStock(folder.id, photo.id, next);
    if (mode === "add") setPlusDraft((p) => ({ ...p, [key]: "" }));
    else if (mode === "subtract") setMinusDraft((p) => ({ ...p, [key]: "" }));
    else setDamageDraft((p) => ({ ...p, [key]: "" }));
    resetMode(key);
    resetDamageMode(key);
    setPendingConfirm(null);
  }

  function cancelPending() {
    if (!pendingConfirm) {
      setPendingConfirm(null);
      return;
    }
    const { key, mode } = pendingConfirm;
    if (mode === "add") setPlusDraft((p) => ({ ...p, [key]: "" }));
    else if (mode === "subtract") setMinusDraft((p) => ({ ...p, [key]: "" }));
    else setDamageDraft((p) => ({ ...p, [key]: "" }));
    resetMode(key);
    resetDamageMode(key);
    setPendingConfirm(null);
  }

  function handleClearStock(folder, photo) {
    const key = rowKey(folder.id, photo.id);
    const reserved = reservedOf(key);
    if (reserved > 0) {
      setErrorByRow((prev) => ({
        ...prev,
        [key]: t("stockBelowReservedError", { reserved }),
      }));
      return;
    }
    updateStock(folder.id, photo.id, 0);
    setPlusDraft((p) => ({ ...p, [key]: "" }));
    setMinusDraft((p) => ({ ...p, [key]: "" }));
    setDamageDraft((p) => ({ ...p, [key]: "" }));
    setErrorByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDamageErrorByRow((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    resetMode(key);
    resetDamageMode(key);
  }

  return (
    <div className="admin-inventory">
      <p className="admin-note">{t("inventoryNote")}</p>

      <div className="admin-folder-search admin-inventory-search">
        <span className="admin-search-icon" aria-hidden="true">
          🔎
        </span>
        <input
          type="search"
          className="field-input admin-search-input"
          placeholder={t("searchInFolderPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="admin-search-clear tooltip"
            onClick={() => setSearchQuery("")}
            aria-label={t("clearSearch")}
            data-tooltip={t("clearSearch")}
          >
            ✕
          </button>
        )}
      </div>

      <p className="admin-inventory-count">
        {trimmedQuery
          ? t("inventoryFilteredCount", {
              count: rows.length,
              total: allRows.length,
            })
          : t.count("inventoryTotalCount", allRows.length)}
      </p>

      {rows.length === 0 ? (
        <p className="empty-note">
          {trimmedQuery
            ? t("searchNoResults", { query: searchQuery })
            : t("noPhotosAdmin")}
        </p>
      ) : (
        groupedRows.map(({ folder, items: folderItems }) => (
          <div className="admin-inventory-folder-group" key={folder.id}>
            <h3 className="admin-inventory-folder-title serif">
              {translateFolderName(lang, folder.slug, folder.name)}
              <span className="admin-inventory-folder-count">
                {t.count("inventoryTotalCount", folderItems.length)}
              </span>
            </h3>
            <div className="admin-inventory-table-wrap">
              <table className="admin-inventory-table">
                <thead>
                  <tr>
                    <th>{t("photoColumnLabel")}</th>
                    <th className="admin-inventory-col-center">
                      {t("stockAdjustColumnLabel")}
                    </th>
                    <th className="admin-inventory-col-center">
                      {t("damageColumnLabel")}
                    </th>
                    <th>{t("currentStockColumnLabel")}</th>
                    <th>{t("reservedColumnLabel")}</th>
                    <th>{t("availableColumnLabel")}</th>
                    <th>{t("grColumnLabel")}</th>
                    <th>{t("clearStockColumnLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {folderItems.map(({ photo }) => {
                    const stockPc = parseStock(photo.stock) ?? 0;
                    const gr = pcToGr(stockPc);
                    const key = rowKey(folder.id, photo.id);
                    const mode = getMode(key);
                    const plusVal = plusDraft[key] ?? "";
                    const minusVal = minusDraft[key] ?? "";
                    const rowError = errorByRow[key];
                    const damageMode = getDamageMode(key);
                    const damageVal = damageDraft[key] ?? "";
                    const damageRowError = damageErrorByRow[key];

                    return (
                      <tr key={key}>
                        <td className="admin-inventory-photo-cell">
                          <button
                            type="button"
                            className="admin-inventory-photo-link tooltip"
                            onClick={() => goToItem(folder.slug, photo.id)}
                            data-tooltip={t("viewItemOnSite")}
                          >
                            <img src={photo.img} alt={photo.caption} />
                            <span>{photo.caption || "—"}</span>
                          </button>
                        </td>
                        <td className="admin-inventory-col-center">
                          <div className="admin-stock-adjust">
                            <label
                              className="admin-stock-adjust-option tooltip"
                              data-tooltip={t("addStockTooltip")}
                            >
                              <input
                                type="radio"
                                name={`stock-mode-${key}`}
                                checked={mode === "add"}
                                onChange={() => setMode(key, "add")}
                              />
                              <span className="admin-stock-adjust-icon admin-stock-adjust-icon-plus">
                                +
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                className="field-input admin-stock-adjust-input"
                                placeholder="0"
                                disabled={mode !== "add"}
                                value={plusVal}
                                onChange={(e) => {
                                  setPlusDraft((p) => ({
                                    ...p,
                                    [key]: e.target.value,
                                  }));
                                  setErrorByRow((prev) => {
                                    if (!(key in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }}
                                onBlur={(e) =>
                                  applyAdjustment(
                                    folder,
                                    photo,
                                    stockPc,
                                    "add",
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.target.blur();
                                }}
                              />
                            </label>
                            <label
                              className="admin-stock-adjust-option tooltip"
                              data-tooltip={t("subtractStockTooltip")}
                            >
                              <input
                                type="radio"
                                name={`stock-mode-${key}`}
                                checked={mode === "subtract"}
                                onChange={() => setMode(key, "subtract")}
                              />
                              <span className="admin-stock-adjust-icon admin-stock-adjust-icon-minus">
                                −
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                className="field-input admin-stock-adjust-input"
                                placeholder="0"
                                disabled={mode !== "subtract"}
                                value={minusVal}
                                onChange={(e) => {
                                  setMinusDraft((p) => ({
                                    ...p,
                                    [key]: e.target.value,
                                  }));
                                  setErrorByRow((prev) => {
                                    if (!(key in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }}
                                onBlur={(e) =>
                                  applyAdjustment(
                                    folder,
                                    photo,
                                    stockPc,
                                    "subtract",
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.target.blur();
                                }}
                              />
                            </label>
                          </div>
                          {rowError && (
                            <p className="admin-stock-error">{rowError}</p>
                          )}
                        </td>
                        <td className="admin-inventory-col-center">
                          <div className="admin-stock-adjust admin-stock-adjust-damage">
                            <label
                              className="admin-stock-adjust-option tooltip"
                              data-tooltip={t("markDamageTooltip")}
                            >
                              <input
                                type="radio"
                                name={`damage-mode-${key}`}
                                checked={damageMode}
                                onChange={() => setDamageMode(key)}
                              />
                              <span className="admin-stock-adjust-icon admin-stock-adjust-icon-damage">
                                −
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                className="field-input admin-stock-adjust-input"
                                placeholder="0"
                                disabled={!damageMode}
                                value={damageVal}
                                onChange={(e) => {
                                  setDamageDraft((p) => ({
                                    ...p,
                                    [key]: e.target.value,
                                  }));
                                  setDamageErrorByRow((prev) => {
                                    if (!(key in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }}
                                onBlur={(e) =>
                                  applyDamage(
                                    folder,
                                    photo,
                                    stockPc,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.target.blur();
                                }}
                              />
                            </label>
                          </div>
                          {damageRowError && (
                            <p className="admin-stock-error">
                              {damageRowError}
                            </p>
                          )}
                        </td>
                        <td className="admin-inventory-current-cell">
                          {stockPc}
                        </td>
                        <td className="admin-inventory-current-cell">
                          {reservedOf(key)}
                        </td>
                        <td className="admin-inventory-current-cell">
                          {Math.max(0, stockPc - reservedOf(key))}
                        </td>
                        <td className="admin-inventory-gr-cell">{gr} GR</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleClearStock(folder, photo)}
                          >
                            {t("clearStockBtn")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {pendingConfirm && (
        <ConfirmDialog
          title={t(
            pendingConfirm.mode === "add"
              ? "stockAddConfirmTitle"
              : pendingConfirm.mode === "damage"
              ? "damageConfirmTitle"
              : "stockSubtractConfirmTitle"
          )}
          message={t(
            pendingConfirm.mode === "add"
              ? "stockAddConfirmMessage"
              : pendingConfirm.mode === "damage"
              ? "damageConfirmMessage"
              : "stockSubtractConfirmMessage",
            {
              delta: pendingConfirm.delta,
              base: pendingConfirm.base,
              next: pendingConfirm.next,
            }
          )}
          cancelLabel={t("cancel")}
          okLabel={t("okLabel")}
          onCancel={cancelPending}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
