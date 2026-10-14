import { useEffect, useState } from "react";
import { useLanguage, translateFolderName } from "../i18n";
import { usePhotoStore } from "../photoStore";
import { useCart } from "../cartStore";
import {
  usePricing,
  formatMoney,
  PCS_PER_UNIT,
  pcsPerUnitFor,
  qtyUnitFor,
  isLowStock,
} from "../pricingStore";

export default function PhotoGrid({ slug, onBack, highlightPhotoId }) {
  const { t, lang } = useLanguage();
  const { getFolder } = usePhotoStore();
  const { items: cartItems, addToCart } = useCart();
  const { unitPriceOf, priceFor, stockPcOf: availablePcOf } = usePricing();
  const folder = getFolder(slug);

  // What this shopper can still pick for a photo. Starts from AVAILABLE
  // stock (physical − reserved by approved orders), then subtracts what is
  // already in the cart. Nothing is taken from stock when an item is added
  // to a cart — that only happens later, when an admin approves (reserve)
  // and dispatches (deduct) the order.
  function stockPcOf(photo) {
    const item = cartItemFor(photo);
    const inCartPieces = item ? item.qty * (item.pcsPerUnit ?? PCS_PER_UNIT) : 0;
    const undebited = item
      ? Math.max(0, inCartPieces - (item.debitedPieces ?? inCartPieces))
      : 0;
    return Math.max(0, availablePcOf(photo) - undebited);
  }

  const [qtyByPhoto, setQtyByPhoto] = useState({});
  const [qtyDraftByPhoto, setQtyDraftByPhoto] = useState({});
  const [addedFlash, setAddedFlash] = useState({});
  const [stockErrorByPhoto, setStockErrorByPhoto] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [clickedHighlightId, setClickedHighlightId] = useState(null);

  // Once the cart is emptied (Clear Cart, or the last item removed), every
  // photo unlocks again — also reset any typed quantities back to their
  // original default (1) rather than leaving stale values behind.
  useEffect(() => {
    if (cartItems.length === 0) {
      setQtyByPhoto({});
      setQtyDraftByPhoto({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.length]);

  // Coming here from Admin → Inventory (clicking a specific item) scrolls
  // that exact photo into view so it's easy to spot in the full grid.
  useEffect(() => {
    if (highlightPhotoId === null || highlightPhotoId === undefined) return;
    const el = document.getElementById(`photo-${highlightPhotoId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightPhotoId, slug]);

  if (!folder) {
    return (
      <section className="wrap page-section">
        <button className="back-link" onClick={onBack}>
          {t("backToHome")}
        </button>
        <p className="page-sub">{t("folderNotFound")}</p>
      </section>
    );
  }

  const folderName = translateFolderName(lang, folder.slug, folder.name);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visiblePhotos = trimmedQuery
    ? folder.photos.filter((photo) =>
        (photo.caption || "").toLowerCase().includes(trimmedQuery)
      )
    : folder.photos;

  function getQty(photoId) {
    return qtyByPhoto[photoId] ?? 0;
  }

  // Quantities can be half-units (0.5, 1.5, 2 ...). While typing, we keep
  // the raw text in a draft so clearing the field to enter a fresh number
  // doesn't get clamped back on every keystroke.
  function getQtyDraft(photoId) {
    return qtyDraftByPhoto[photoId] !== undefined
      ? qtyDraftByPhoto[photoId]
      : String(getQty(photoId));
  }

  function handleQtyChange(photoId, value) {
    setQtyDraftByPhoto((prev) => ({ ...prev, [photoId]: value }));
  }

  function commitQty(photoId, value) {
    const photo = folder.photos.find((p) => p.id === photoId);
    const stepSize = photo ? qtyStepFor(photo) : 0.5;
    const n = Math.round((Number(value) || 0) / stepSize) * stepSize;
    let safe = n > 0 ? n : 0;
    if (photo) {
      const maxQty = maxAddableQty(photo);
      if (safe > maxQty + 1e-9) {
        safe = maxQty;
        setStockErrorByPhoto((prev) => ({
          ...prev,
          [photoId]: t("stockLimitError", {
            available:
              Math.round(
                (stockPcOf(photo) / pcsPerUnitFor(stockPcOf(photo))) * 100
              ) / 100,
            inCart: cartQtyFor(photo),
            unit: qtyUnitFor(stockPcOf(photo)),
          }),
        }));
        setTimeout(() => {
          setStockErrorByPhoto((prev) => ({ ...prev, [photoId]: null }));
        }, 2600);
      }
    }
    setQtyByPhoto((prev) => ({ ...prev, [photoId]: safe }));
    setQtyDraftByPhoto((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }

  // Step granularity for a photo's qty picker: a flat half-unit (0, 0.5,
  // 1, 1.5, 2, 2.5 ...) normally, or whole pieces only (0, 1, 2 ... up to
  // just under the current stock) once that stock drops under 75 — you
  // can't order half a physical piece.
  function qtyStepFor(photo) {
    return isLowStock(stockPcOf(photo)) ? 1 : 0.5;
  }

  function stepQtyUp(photo, qty) {
    return qty + qtyStepFor(photo);
  }

  function stepQtyDown(photo, qty) {
    return Math.max(0, qty - qtyStepFor(photo));
  }

  function stepQty(photoId, nextQty) {
    const safe = nextQty > 0 ? nextQty : 0;
    setQtyByPhoto((prev) => ({ ...prev, [photoId]: safe }));
    setQtyDraftByPhoto((prev) => {
      if (!(photoId in prev)) return prev;
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }

  function isInCart(photo) {
    const key = `${folder.slug}:${photo.id}`;
    return cartItems.some((it) => it.key === key);
  }

  function cartItemFor(photo) {
    const key = `${folder.slug}:${photo.id}`;
    return cartItems.find((it) => it.key === key) || null;
  }

  // How much of this item is already in the cart (in its own qty unit).
  function cartQtyFor(photo) {
    const item = cartItemFor(photo);
    return item ? item.qty : 0;
  }

  // Always shows BOTH the GR count and its piece equivalent — e.g.
  // "In cart: 3 GR(s), 450 PC(s)" — using the multiplier actually stored
  // on the cart item at add time (not recomputed from the photo's current
  // stock), so this always matches the Your Cart popup line exactly, even
  // if the item's stock has since crossed the low-stock threshold.
  function inCartNoteFor(photo) {
    const item = cartItemFor(photo);
    if (!item) return "";
    const multiplier = item.pcsPerUnit ?? PCS_PER_UNIT;
    const pieces = item.qty * multiplier;
    const grValue =
      multiplier === 1
        ? Math.round((item.qty / PCS_PER_UNIT) * 100) / 100
        : item.qty;
    return t("inCartQtyGrPcLabel", { qty: grValue, pcs: pieces });
  }

  function isAtStockLimit(photo) {
    return stockPcOf(photo) <= 1e-9;
  }

  // How much of this item could still be added, in its own qty unit (GR
  // packs normally, or raw pieces for a low-stock item). Reaching the
  // current stock exactly is allowed (e.g. exactly 75 pcs in stock = can
  // add exactly 0.5 GR) — only going OVER it is blocked. Current Stock is
  // debited the moment an item is added to the cart (and credited back if
  // removed), so it already reflects what's left to sell — no separate
  // "already in cart" adjustment is needed here anymore.
  function maxAddableQty(photo) {
    const stockPc = stockPcOf(photo);
    if (stockPc <= 0) return 0;
    const multiplier = pcsPerUnitFor(stockPc);
    const rawMax = stockPc / multiplier; // qty may go up to and including this
    const stepSize = qtyStepFor(photo);
    // Snap down to the nearest step (0.5 normally, whole pieces for a
    // low-stock item) at or below rawMax.
    const steps = Math.floor(rawMax / stepSize + 1e-9);
    return Math.max(0, steps * stepSize);
  }

  // The + icon only steps up as far as In Stock allows — it won't let you
  // pick a quantity that Add to Cart would just reject a moment later.
  function handleStepUp(photo) {
    const maxQty = maxAddableQty(photo);
    const proposed = stepQtyUp(photo, getQty(photo.id));
    if (proposed > maxQty + 1e-9) {
      stepQty(photo.id, maxQty);
      setStockErrorByPhoto((prev) => ({
        ...prev,
        [photo.id]: t("stockLimitError", {
          available:
            Math.round((stockPcOf(photo) / pcsPerUnitFor(stockPcOf(photo))) * 100) /
            100,
          inCart: cartQtyFor(photo),
          unit: qtyUnitFor(stockPcOf(photo)),
        }),
      }));
      setTimeout(() => {
        setStockErrorByPhoto((prev) => ({ ...prev, [photo.id]: null }));
      }, 2600);
      return;
    }
    stepQty(photo.id, proposed);
  }

  function handleAddToCart(photo) {
    const qty = getQty(photo.id);
    if (qty <= 0) return;

    const stockPc = stockPcOf(photo);
    const multiplier = pcsPerUnitFor(stockPc);

    // Validate before adding: Current Stock must be greater than or equal
    // to the selected qty (converted to pieces) — e.g. exactly 75 pcs in
    // stock allows exactly 0.5 GR; only going over stock is blocked.
    if (stockPc < qty * multiplier - 1e-9) {
      setStockErrorByPhoto((prev) => ({
        ...prev,
        [photo.id]: t("stockLimitError", {
          available: Math.round((stockPc / multiplier) * 100) / 100,
          inCart: cartQtyFor(photo),
          unit: qtyUnitFor(stockPc),
        }),
      }));
      setTimeout(() => {
        setStockErrorByPhoto((prev) => ({ ...prev, [photo.id]: null }));
      }, 2600);
      return;
    }

    const result = addToCart(
      folder.slug,
      folderName,
      photo,
      qty,
      unitPriceOf(photo),
      null,
      multiplier,
      0 // adding to a cart never debits stock
    );

    if (!result.ok) {
      setStockErrorByPhoto((prev) => ({
        ...prev,
        [photo.id]: t("stockLimitError", {
          available: result.available,
          inCart: result.inCart,
          unit: qtyUnitFor(stockPc),
        }),
      }));
      setTimeout(() => {
        setStockErrorByPhoto((prev) => ({ ...prev, [photo.id]: null }));
      }, 2600);
      return;
    }

    setAddedFlash((prev) => ({ ...prev, [photo.id]: true }));
    setTimeout(() => {
      setAddedFlash((prev) => ({ ...prev, [photo.id]: false }));
    }, 1300);
    // Reset the picker back to 0 so the next top-up starts fresh instead
    // of silently re-adding the same amount again.
    setQtyByPhoto((prev) => ({ ...prev, [photo.id]: 0 }));
    setQtyDraftByPhoto((prev) => {
      if (!(photo.id in prev)) return prev;
      const next = { ...prev };
      delete next[photo.id];
      return next;
    });
  }

  return (
    <section className="wrap page-section">
      <button className="back-link" onClick={onBack}>
        {t("backToHome")}
      </button>
      <div className="photo-page-head">
        <div>
          <h1 className="page-title serif">{folderName}</h1>
          <p className="page-sub photo-page-sub">
            {t.count("photoCount", folder.photos.length)}
          </p>
        </div>
      </div>

      <div className="folder-search-bar">
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

      {trimmedQuery && visiblePhotos.length === 0 && (
        <p className="empty-note">
          {t("searchNoResults", { query: searchQuery })}
        </p>
      )}

      <div className="photo-grid">
        {visiblePhotos.map((photo) => {
          const inCart = isInCart(photo);
          const atLimit = isAtStockLimit(photo);
          const isHighlighted =
            (highlightPhotoId !== null &&
              highlightPhotoId !== undefined &&
              String(photo.id) === String(highlightPhotoId)) ||
            String(photo.id) === String(clickedHighlightId);
          return (
          <figure
            className={
              "photo-card" + (isHighlighted ? " photo-card-highlighted" : "")
            }
            id={`photo-${photo.id}`}
            key={photo.id}
            onClick={() =>
              setClickedHighlightId((prev) =>
                String(prev) === String(photo.id) ? null : photo.id
              )
            }
          >
            <img src={photo.img} alt={photo.caption} loading="lazy" />
            <figcaption>{photo.caption}</figcaption>
            <div className="price-label">
              {t("rateLabel")}: {formatMoney(unitPriceOf(photo))} / pc
            </div>
            <div className="stock-label">
              {t("inStockLabel")}: {availablePcOf(photo)} PCS
            </div>
            {inCart && (
              <div className="in-cart-note">{inCartNoteFor(photo)}</div>
            )}

            <div
              className={
                "add-to-cart-row" + (atLimit ? " add-to-cart-row-locked" : "")
              }
            >
              <div className="qty-stepper">
                <button
                  type="button"
                  className="qty-btn tooltip"
                  aria-label={t("decreaseQty")}
                  data-tooltip={t("decreaseQty")}
                  disabled={atLimit}
                  onClick={() =>
                    stepQty(photo.id, stepQtyDown(photo, getQty(photo.id)))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  step={qtyStepFor(photo)}
                  inputMode="decimal"
                  className="qty-input"
                  disabled={atLimit}
                  value={getQtyDraft(photo.id)}
                  onChange={(e) => handleQtyChange(photo.id, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => commitQty(photo.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                  }}
                  aria-label={t("qtyLabel")}
                />
                <button
                  type="button"
                  className="qty-btn tooltip"
                  aria-label={t("increaseQty")}
                  data-tooltip={t("increaseQty")}
                  disabled={atLimit || getQty(photo.id) >= maxAddableQty(photo)}
                  onClick={() => handleStepUp(photo)}
                >
                  +
                </button>
                <span className="qty-unit">{qtyUnitFor(stockPcOf(photo))}</span>
              </div>
              <div className="item-subtotal">
                {t("subtotalLabel")}:{" "}
                {formatMoney(
                  priceFor(
                    getQty(photo.id),
                    unitPriceOf(photo),
                    pcsPerUnitFor(stockPcOf(photo))
                  )
                )}
              </div>
              <button
                type="button"
                className={
                  "btn btn-sm btn-solid add-to-cart-btn" +
                  (addedFlash[photo.id] ? " add-to-cart-btn-done" : "") +
                  (atLimit ? " add-to-cart-btn-done" : "")
                }
                disabled={atLimit || getQty(photo.id) <= 0}
                onClick={() => handleAddToCart(photo)}
              >
                {atLimit
                  ? t("inCartBtn")
                  : addedFlash[photo.id]
                  ? t("addedToCart")
                  : inCart
                  ? `🛒 ${t("addMoreToCart")}`
                  : `🛒 ${t("addToCart")}`}
              </button>
              {stockErrorByPhoto[photo.id] && (
                <div className="stock-error-note">
                  {stockErrorByPhoto[photo.id]}
                </div>
              )}
            </div>
          </figure>
          );
        })}
      </div>
      {folder.photos.length === 0 && (
        <p className="empty-note">{t("noPhotosYet")}</p>
      )}
    </section>
  );
}
