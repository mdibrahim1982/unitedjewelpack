import { useEffect, useRef, useState } from "react";
import { useLanguage, translateFolderName } from "../i18n";
import { usePhotoStore } from "../photoStore";
import { usePricing, formatMoney, parsePrice } from "../pricingStore";
import AdminInventory from "./AdminInventory";
import AdminOrders from "./AdminOrders";
import AdminDispatch from "./AdminDispatch";
import { useOrders } from "../ordersStore";
import {
  loadMockData,
  removeMockData,
  mockStatus,
  MOCK_FLASH_KEY,
} from "../mockDataLoader";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdminDashboard({ onGoToSite }) {
  const { t, lang } = useLanguage();
  const {
    folders,
    addPhotos,
    updateCaption,
    updatePrice,
    deletePhotos,
    restorePhoto,
    restorePhotos,
    permanentlyDeleteBackupPhoto,
    permanentlyDeleteBackupPhotos,
  } = usePhotoStore();
  const { unitPriceOf, hasOwnPrice } = usePricing();

  const publicFolders = folders.filter((f) => !f.adminOnly);
  const backupFolders = folders.filter((f) => f.adminOnly);

  const [activeSlug, setActiveSlug] = useState(publicFolders[0]?.slug || null);
  const [view, setView] = useState("folders");
  const { pendingOrders, approvedOrders } = useOrders();
  const [mockInfo] = useState(() => mockStatus());
  const [mockFlash, setMockFlash] = useState(() => {
    try {
      const raw = sessionStorage.getItem(MOCK_FLASH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  // Show the "loaded/removed" message once after the reload, then forget it.
  useEffect(() => {
    try {
      sessionStorage.removeItem(MOCK_FLASH_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draftCaption, setDraftCaption] = useState("");
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [priceSavedId, setPriceSavedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [clickedHighlightId, setClickedHighlightId] = useState(null);
  const fileInputRef = useRef(null);

  const activeFolder = folders.find((f) => f.slug === activeSlug) || null;
  const isBackupFolder = !!activeFolder?.adminOnly;

  // Search by caption, scoped to whichever folder is currently open —
  // works the same way for a normal folder or a Backup folder.
  const trimmedFolderQuery = folderSearchQuery.trim().toLowerCase();
  const visiblePhotos = activeFolder
    ? trimmedFolderQuery
      ? activeFolder.photos.filter((photo) =>
          (photo.caption || "").toLowerCase().includes(trimmedFolderQuery)
        )
      : activeFolder.photos
    : [];

  function selectFolder(slug) {
    setActiveSlug(slug);
    setFolderSearchQuery("");
    setBulkMode(false);
    setSelectedIds([]);
    setEditingId(null);
    setEditingPriceId(null);
    setClickedHighlightId(null);
  }

  // A plain click on a card (outside bulk-select mode) toggles a visual
  // highlight — works the same for normal folders and Backup folders.
  function toggleClickHighlight(photoId) {
    setClickedHighlightId((prev) => (prev === photoId ? null : photoId));
  }

  function toggleBulkMode() {
    setBulkMode((prev) => !prev);
    setSelectedIds([]);
  }

  function toggleSelected(photoId) {
    setSelectedIds((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  }

  // Selects every photo currently visible in this folder (respecting the
  // in-folder search filter, same as what's actually shown on screen).
  function selectAllVisible() {
    setSelectedIds(visiblePhotos.map((p) => p.id));
  }

  function startEdit(photo) {
    setEditingPriceId(null);
    setEditingId(photo.id);
    setDraftCaption(photo.caption);
  }

  function saveEdit(photoId) {
    updateCaption(activeFolder.id, photoId, draftCaption.trim());
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // ---- per-photo unit price ----
  function startEditPrice(photo) {
    setEditingId(null);
    setEditingPriceId(photo.id);
    setDraftPrice(hasOwnPrice(photo) ? String(parsePrice(photo.price)) : "");
  }

  function savePrice(photoId) {
    updatePrice(activeFolder.id, photoId, parsePrice(draftPrice));
    setEditingPriceId(null);
    setPriceSavedId(photoId);
    setTimeout(
      () => setPriceSavedId((id) => (id === photoId ? null : id)),
      1600
    );
  }

  function clearPrice(photoId) {
    updatePrice(activeFolder.id, photoId, null);
    setEditingPriceId(null);
  }

  function cancelEditPrice() {
    setEditingPriceId(null);
  }

  function handleRestore(photoId) {
    restorePhoto(activeFolder.id, photoId);
  }

  function handlePermanentDelete(photoId) {
    if (window.confirm(t("confirmPermanentDelete"))) {
      permanentlyDeleteBackupPhoto(activeFolder.id, photoId);
    }
  }

  // Single-item delete from the corner icon on a card — moves a normal
  // folder's photo to Backup, or permanently deletes one already there.
  function handleDeleteItem(photoId) {
    if (isBackupFolder) {
      handlePermanentDelete(photoId);
    } else if (window.confirm(t("confirmDelete"))) {
      deletePhotos(activeFolder.id, [photoId]);
    }
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (isBackupFolder) {
      if (window.confirm(t.count("confirmBulkDelete", selectedIds.length))) {
        permanentlyDeleteBackupPhotos(activeFolder.id, selectedIds);
        setSelectedIds([]);
        setBulkMode(false);
      }
    } else {
      if (
        window.confirm(t.count("confirmBulkDeleteNormal", selectedIds.length))
      ) {
        deletePhotos(activeFolder.id, selectedIds);
        setSelectedIds([]);
        setBulkMode(false);
      }
    }
  }

  function handleBulkRestore() {
    if (selectedIds.length === 0) return;
    if (
      window.confirm(t.count("confirmRestoreSelected", selectedIds.length))
    ) {
      restorePhotos(activeFolder.id, selectedIds);
      setSelectedIds([]);
      setBulkMode(false);
    }
  }

  // Multiple images can be picked at once from the file picker.
  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !activeFolder) return;
    setUploading(true);
    try {
      const dataUrls = await Promise.all(files.map(fileToDataUrl));
      addPhotos(
        activeFolder.id,
        dataUrls.map((img) => ({ img, caption: "", price: null }))
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function renderPriceBlock(photo) {
    if (editingPriceId === photo.id) {
      return (
        <div className="admin-photo-price-edit">
          <input
            className="field-input admin-price-input-noarrows"
            type="number"
            min="0.01"
            step="0.01"
            placeholder={t("unitPricePlaceholder")}
            value={draftPrice}
            onChange={(e) => setDraftPrice(e.target.value)}
            autoFocus
          />
          <div className="admin-photo-actions">
            <button
              className="btn btn-solid btn-sm"
              onClick={() => savePrice(photo.id)}
            >
              {t("savePrice")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={cancelEditPrice}>
              {t("cancel")}
            </button>
          </div>
          {hasOwnPrice(photo) && (
            <button
              className="admin-photo-price-clear"
              type="button"
              onClick={() => clearPrice(photo.id)}
            >
              {t("clearPrice")}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="admin-photo-price">
        <span className="admin-photo-price-label">{t("rateLabel")}:</span>{" "}
        <strong>{formatMoney(unitPriceOf(photo))}</strong> / pc
        {priceSavedId === photo.id && (
          <span className="admin-pricing-saved"> {t("priceSaved")}</span>
        )}
      </div>
    );
  }

  function reloadWithFlash(flash) {
    try {
      sessionStorage.setItem(MOCK_FLASH_KEY, JSON.stringify(flash));
    } catch {
      /* ignore */
    }
    window.location.reload(); // every store re-reads the saved data on load
  }

  function handleLoadMock() {
    if (!window.confirm(t("mockLoadConfirm"))) return;
    const r = loadMockData(publicFolders);
    if (!r.ok) {
      setMockFlash({
        type: "error",
        text: r.code === "active_orders" ? t("mockErrActive") : t("mockErrGeneric"),
      });
      return;
    }
    reloadWithFlash({
      type: "ok",
      text: t("mockLoaded", {
        products: r.summary.products,
        orders: r.summary.orders,
      }),
    });
  }

  function handleRemoveMock() {
    if (!window.confirm(t("mockRemoveConfirm"))) return;
    const r = removeMockData();
    if (!r.ok) {
      setMockFlash({ type: "error", text: t("mockErrGeneric") });
      return;
    }
    reloadWithFlash({ type: "ok", text: t("mockRemoved") });
  }

  return (
    <section className="wrap page-section">
      <div className="admin-topbar">
        <button className="back-link" onClick={onGoToSite}>
          {t("backToSite")}
        </button>
      </div>

      <h1 className="page-title serif">{t("adminDashboard")}</h1>
      <p className="page-sub">{t("adminDashboardSubtitle")}</p>
      <p className="admin-note">{t("changesSavedNote")}</p>

      <div className="mock-data-bar">
        <div className="mock-data-text">
          <strong>{t("mockTitle")}</strong>
          <span>
            {mockInfo
              ? t("mockActiveNote", {
                  products: mockInfo.summary?.products ?? 0,
                  orders: mockInfo.summary?.orders ?? 0,
                })
              : t("mockInactiveNote")}
          </span>
          <span className="mock-data-help">{t("mockHelp")}</span>
        </div>
        <div className="mock-data-actions">
          <button className="btn btn-solid btn-sm" onClick={handleLoadMock}>
            {mockInfo ? t("mockReload") : t("mockLoad")}
          </button>
          {mockInfo && (
            <button className="btn btn-ghost btn-sm" onClick={handleRemoveMock}>
              {t("mockRemove")}
            </button>
          )}
        </div>
        {mockFlash && (
          <p
            className={
              "cart-notice mock-data-flash" +
              (mockFlash.type === "error" ? " cart-notice-error" : "")
            }
            role="status"
          >
            {mockFlash.text}
          </p>
        )}
      </div>

      <div className="admin-view-tabs">
        <button
          type="button"
          className={
            "admin-view-tab" + (view === "folders" ? " admin-view-tab-active" : "")
          }
          onClick={() => setView("folders")}
        >
          {t("foldersTab")}
        </button>
        <button
          type="button"
          className={
            "admin-view-tab" +
            (view === "inventory" ? " admin-view-tab-active" : "")
          }
          onClick={() => setView("inventory")}
        >
          {t("inventoryTab")}
        </button>
        <button
          type="button"
          className={
            "admin-view-tab" + (view === "orders" ? " admin-view-tab-active" : "")
          }
          onClick={() => setView("orders")}
        >
          {t("ordersTab")}
          {pendingOrders.length > 0 && (
            <span className="admin-tab-badge">{pendingOrders.length}</span>
          )}
        </button>
        <button
          type="button"
          className={
            "admin-view-tab" +
            (view === "dispatch" ? " admin-view-tab-active" : "")
          }
          onClick={() => setView("dispatch")}
        >
          {t("dispatchTab")}
          {approvedOrders.length > 0 && (
            <span className="admin-tab-badge">{approvedOrders.length}</span>
          )}
        </button>
      </div>

      {view === "inventory" ? (
        <AdminInventory />
      ) : view === "orders" ? (
        <AdminOrders />
      ) : view === "dispatch" ? (
        <AdminDispatch />
      ) : (
      <div className="admin-layout">
        <aside className="admin-folder-list">
          <div className="admin-folder-list-label">{t("selectFolder")}</div>
          {publicFolders.map((folder) => (
            <button
              key={folder.id}
              className={
                "admin-folder-item" +
                (folder.slug === activeSlug ? " admin-folder-item-active" : "")
              }
              onClick={() => selectFolder(folder.slug)}
            >
              <img src={folder.cover} alt="" className="admin-folder-thumb" />
              <span>
                {translateFolderName(lang, folder.slug, folder.name)}
                <small>
                  {" "}
                  ({folder.photos.length})
                </small>
              </span>
            </button>
          ))}

          <div className="admin-folder-list-label admin-folder-list-label-backup">
            🔒 {t("backupFoldersLabel")}
          </div>
          {backupFolders.map((folder) => (
            <button
              key={folder.id}
              className={
                "admin-folder-item admin-folder-item-backup" +
                (folder.slug === activeSlug ? " admin-folder-item-active" : "")
              }
              onClick={() => selectFolder(folder.slug)}
            >
              <span className="admin-folder-thumb admin-folder-thumb-backup">
                <svg
                  viewBox="0 0 24 24"
                  className="admin-folder-icon"
                  aria-hidden="true"
                >
                  <path
                    d="M3 7.5c0-1.1.9-2 2-2h4.2c.5 0 1 .2 1.4.6l1.2 1.2c.4.4.9.6 1.4.6H19c1.1 0 2 .9 2 2v8.6c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7.5Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                  <path
                    d="M9 13.2a3 3 0 1 1 6 0v1h.4c.6 0 1.1.5 1.1 1.1v2.6c0 .6-.5 1.1-1.1 1.1H8.6c-.6 0-1.1-.5-1.1-1.1v-2.6c0-.6.5-1.1 1.1-1.1H9v-1Zm1.6 1h2.8v-1a1.4 1.4 0 1 0-2.8 0v1Z"
                    fill="#fff"
                  />
                </svg>
              </span>
              <span>
                {translateFolderName(lang, folder.slug, folder.name)}
                <small>
                  {" "}
                  ({folder.photos.length})
                </small>
              </span>
            </button>
          ))}
        </aside>

        {activeFolder && (
          <div className="admin-panel">
            <h2 className="admin-panel-title serif">
              {translateFolderName(lang, activeFolder.slug, activeFolder.name)}
            </h2>

            {isBackupFolder ? (
              <p className="admin-note admin-backup-note">
                {t("backupFolderNote")}
              </p>
            ) : (
              <div className="admin-add-photo">
                <div className="admin-add-photo-title">{t("addPhoto")}</div>
                <label className="btn btn-solid btn-sm admin-upload-btn">
                  {uploading ? t("uploadingPhotos") : `🖼 ${t("uploadPhoto")}`}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    disabled={uploading}
                    hidden
                  />
                </label>
                <span className="admin-add-photo-hint">
                  {t("uploadPhotoHint")}
                </span>
              </div>
            )}

            <div className="admin-folder-search">
              <span className="admin-search-icon" aria-hidden="true">
                🔎
              </span>
              <input
                type="search"
                className="field-input admin-search-input"
                placeholder={t("searchInFolderPlaceholder")}
                value={folderSearchQuery}
                onChange={(e) => setFolderSearchQuery(e.target.value)}
              />
              {folderSearchQuery && (
                <button
                  type="button"
                  className="admin-search-clear tooltip"
                  onClick={() => setFolderSearchQuery("")}
                  aria-label={t("clearSearch")}
                  data-tooltip={t("clearSearch")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="admin-photos-head">
              <h3 className="admin-photos-heading">{t("photosInFolder")}</h3>
              {activeFolder.photos.length > 0 && (
                <div className="admin-photos-head-actions">
                  {bulkMode && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={selectAllVisible}
                      disabled={
                        visiblePhotos.length === 0 ||
                        selectedIds.length === visiblePhotos.length
                      }
                    >
                      {t("selectAllBtn")}
                    </button>
                  )}
                  <button
                    className={
                      "btn btn-sm " + (bulkMode ? "btn-ghost" : "btn-solid")
                    }
                    onClick={toggleBulkMode}
                  >
                    {bulkMode ? t("cancelSelectMultiple") : t("selectMultiple")}
                  </button>
                </div>
              )}
            </div>

            {activeFolder.photos.length === 0 ? (
              <p className="empty-note">
                {isBackupFolder ? t("noPhotosBackup") : t("noPhotosAdmin")}
              </p>
            ) : (
              trimmedFolderQuery &&
              visiblePhotos.length === 0 && (
                <p className="empty-note">
                  {t("searchNoResults", { query: folderSearchQuery })}
                </p>
              )
            )}

            <div className="admin-photo-grid">
              {visiblePhotos.map((photo) =>
                isBackupFolder ? (
                  <div
                    className={
                      "admin-photo-card" +
                      (bulkMode ? " admin-photo-card-selectable" : "") +
                      (bulkMode && selectedIds.includes(photo.id)
                        ? " admin-photo-card-selected"
                        : "") +
                      (!bulkMode && clickedHighlightId === photo.id
                        ? " admin-photo-card-highlighted"
                        : "")
                    }
                    key={photo.id}
                    onClick={
                      bulkMode
                        ? () => toggleSelected(photo.id)
                        : () => toggleClickHighlight(photo.id)
                    }
                    role={bulkMode ? "button" : undefined}
                    tabIndex={bulkMode ? 0 : undefined}
                  >
                    {bulkMode && (
                      <span
                        className={
                          "admin-select-check" +
                          (selectedIds.includes(photo.id)
                            ? " admin-select-check-on"
                            : "")
                        }
                        aria-hidden="true"
                      >
                        {selectedIds.includes(photo.id) ? "✓" : ""}
                      </span>
                    )}
                    {!bulkMode && (
                      <button
                        type="button"
                        className="admin-delete-icon-btn tooltip tooltip-below"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(photo.id);
                        }}
                        aria-label={t("deletePermanently")}
                        data-tooltip={t("deletePermanently")}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7h16M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7M6.5 7l.9 12.1c.06.77.7 1.4 1.48 1.4h6.24c.78 0 1.42-.63 1.48-1.4L17.5 7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 11v6M14 11v6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                    <img src={photo.img} alt={photo.caption} />
                    <div className="admin-photo-edit">
                      <div className="admin-photo-caption">
                        {photo.caption || "—"}
                      </div>
                      <div className="admin-photo-price">
                        <span className="admin-photo-price-label">
                          {t("rateLabel")}:
                        </span>{" "}
                        <strong>{formatMoney(unitPriceOf(photo))}</strong> / pc
                      </div>
                      {!bulkMode && (
                        <div className="admin-photo-actions">
                          <button
                            className="btn btn-solid btn-sm"
                            onClick={() => handleRestore(photo.id)}
                          >
                            ↩ {t("restorePhoto")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={
                      "admin-photo-card" +
                      (bulkMode ? " admin-photo-card-selectable" : "") +
                      (bulkMode && selectedIds.includes(photo.id)
                        ? " admin-photo-card-selected"
                        : "") +
                      (!bulkMode && clickedHighlightId === photo.id
                        ? " admin-photo-card-highlighted"
                        : "")
                    }
                    key={photo.id}
                    onClick={
                      bulkMode
                        ? () => toggleSelected(photo.id)
                        : () => toggleClickHighlight(photo.id)
                    }
                    role={bulkMode ? "button" : undefined}
                    tabIndex={bulkMode ? 0 : undefined}
                  >
                    {bulkMode && (
                      <span
                        className={
                          "admin-select-check" +
                          (selectedIds.includes(photo.id)
                            ? " admin-select-check-on"
                            : "")
                        }
                        aria-hidden="true"
                      >
                        {selectedIds.includes(photo.id) ? "✓" : ""}
                      </span>
                    )}
                    {!bulkMode && (
                      <button
                        type="button"
                        className="admin-delete-icon-btn tooltip tooltip-below"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(photo.id);
                        }}
                        aria-label={t("backupBtn")}
                        data-tooltip={t("backupBtn")}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7h16M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7M6.5 7l.9 12.1c.06.77.7 1.4 1.48 1.4h6.24c.78 0 1.42-.63 1.48-1.4L17.5 7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 11v6M14 11v6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                    <img src={photo.img} alt={photo.caption} />
                    {!bulkMode && editingId === photo.id ? (
                      <div className="admin-photo-edit">
                        <input
                          className="field-input"
                          type="text"
                          value={draftCaption}
                          onChange={(e) => setDraftCaption(e.target.value)}
                          autoFocus
                        />
                        <div className="admin-photo-actions">
                          <button
                            className="btn btn-solid btn-sm"
                            onClick={() => saveEdit(photo.id)}
                          >
                            {t("save")}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={cancelEdit}
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="admin-photo-edit">
                        <div className="admin-photo-caption">
                          {photo.caption || "—"}
                        </div>
                        {renderPriceBlock(photo)}
                        {!bulkMode && editingPriceId !== photo.id && (
                          <div className="admin-photo-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => startEdit(photo)}
                            >
                              {t("edit")}
                            </button>
                            <button
                              className="btn btn-solid btn-sm"
                              onClick={() => startEditPrice(photo)}
                            >
                              ₹ {t("editPrice")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {bulkMode && (
              <div className="admin-bulk-bar">
                <span className="admin-bulk-count">
                  {t.count("bulkSelectedCount", selectedIds.length)}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllVisible}
                  disabled={
                    visiblePhotos.length === 0 ||
                    selectedIds.length === visiblePhotos.length
                  }
                >
                  {t("selectAllBtn")}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={toggleBulkMode}
                >
                  {t("cancelSelectMultiple")}
                </button>
                {isBackupFolder && (
                  <button
                    className="btn btn-solid btn-sm"
                    onClick={handleBulkRestore}
                    disabled={selectedIds.length === 0}
                  >
                    ↩ {t("restoreSelectedBtn")}
                  </button>
                )}
                <button
                  className="btn btn-danger btn-sm admin-bulk-delete-btn"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.length === 0}
                >
                  {isBackupFolder
                    ? t("deleteSelectedBtn")
                    : t("backupDeletedBtn")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </section>
  );
}
