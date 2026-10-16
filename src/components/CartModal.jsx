import { useState } from "react";
import { useLanguage } from "../i18n";
import { useCart } from "../cartStore";
import { usePhotoStore } from "../photoStore";
import { useSalesRepAuth } from "../salesRepAuth";
import { useAuth } from "../auth";
import { useCustomer } from "../customerStore";
import { validateDetails } from "../customerDetails";
import { roundTotal } from "../money";
import { useOrders } from "../ordersStore";
import { usePricing, formatMoney, parseStock, PCS_PER_UNIT } from "../pricingStore";
import { whatsappCartOrderLink, orderRefOf } from "../cartShare";
import WhatsAppIcon from "./WhatsAppIcon";

export default function CartModal({ onClose }) {
  const { t } = useLanguage();
  const { items, removeFromCart, clearCart, totalQty } = useCart();
  const { priceFor, unitPriceOf } = usePricing();
  const { getFolder, updateStock } = usePhotoStore();
  const { salesRepName, isSalesRep } = useSalesRepAuth();
  const { isAdmin } = useAuth();
  const { customer } = useCustomer();
  // Sales reps and admins order ON BEHALF of a shop, so they must type that
  // shop's details into the cart. A customer already gave theirs at login.
  const isStaff = isSalesRep || isAdmin;
  const placedBy = isSalesRep ? "salesRep" : isAdmin ? "admin" : "customer";
  const { submitOrder } = useOrders();
  const [notice, setNotice] = useState(null);

  // Cart lines use the unit price AND the pieces-per-unit captured when
  // the item was added (older items with no pcsPerUnit fall back to the
  // standard PCS_PER_UNIT "pack" conversion). These stay fixed to what
  // was actually agreed at add time — pricing and the stock already
  // debited never change retroactively.
  const unitOf = (it) => unitPriceOf({ price: it.unitPrice });
  const multiplierOf = (it) => it.pcsPerUnit ?? PCS_PER_UNIT;

  // A cart line always shows BOTH its GR count and piece count together —
  // e.g. "3 GR(s), 450 PC(s)" — derived from the add-time multiplier
  // captured on the item, so this always agrees exactly with the "In
  // cart" note shown on the product page for the same item.
  function cartLineParts(it) {
    const multiplier = multiplierOf(it);
    const pieces = it.qty * multiplier;
    const grValue =
      multiplier === 1 ? Math.round((it.qty / PCS_PER_UNIT) * 100) / 100 : it.qty;
    return { grValue, pieces };
  }

  const itemsTotal = items.reduce(
    (sum, it) => sum + (priceFor(it.qty, unitOf(it), multiplierOf(it)) || 0),
    0
  );

  // Optional manual extra amount (e.g. a delivery charge or custom
  // adjustment). The checkbox is checked by default, which keeps the
  // amount field locked at "no extra charge"; unchecking it unlocks the
  // field so a custom number can be typed in, and that number is folded
  // into the cart's total value.
  const [noExtraCharge, setNoExtraCharge] = useState(true);
  const [extraAmountInput, setExtraAmountInput] = useState("");

  // Staff-only: the three customer fields are all REQUIRED before an order
  // can be placed.
  const [fields, setFields] = useState({ shopName: "", location: "", mobile: "" });
  const [fieldErrors, setFieldErrors] = useState({});

  function setField(name, value) {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  // Miscellaneous charges exist only for staff; a customer never sees or
  // pays them.
  const extraAmount =
    !isStaff || noExtraCharge ? 0 : Math.max(0, Number(extraAmountInput) || 0);

  // The cart total is rounded to the nearest rupee; the difference is shown
  // on its own "Round off" line so the figures always add up.
  const {
    amount: exactTotal,
    rounded: totalValue,
    roundOff,
  } = roundTotal(itemsTotal + extraAmount);

  // Sum of every item's own qty × its own pcsPerUnit — accurate even when
  // the cart mixes standard GR items with low-stock PCS items.
  const totalPieces = items.reduce(
    (sum, it) => sum + it.qty * multiplierOf(it),
    0
  );

  function handleNoExtraChargeToggle(e) {
    const checked = e.target.checked;
    setNoExtraCharge(checked);
    if (checked) setExtraAmountInput("");
  }

  // Every order — customer, sales rep or admin — is a REQUEST: it is saved
  // as pending for an admin to approve (changing no stock at all) and the
  // same details are sent to the admin on WhatsApp so they know it's waiting.
  function handlePlaceOrder() {
    const checked = isStaff
      ? validateDetails(fields)
      : customer
      ? { ok: true, values: customer, errors: {} }
      : { ok: false, values: {}, errors: {} };
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setNotice({ type: "error", text: t("orderDetailsRequired") });
      return;
    }
    const details = {
      ...checked.values,
      salesRepName: salesRepName || "",
      placedBy,
    };

    const lines = items.map((it) => ({
      key: it.key,
      folderId: it.folderSlug,
      photoId: it.photoId,
      caption: it.caption,
      pieces: Math.round(it.qty * multiplierOf(it)),
    }));
    const result = submitOrder({
      lines,
      items,
      extraAmount,
      itemsTotal,
      roundOff,
      totalValue,
      ...details,
    });
    if (!result.ok) {
      setNotice({ type: "error", text: t("orderSubmitFailed") });
      return;
    }

    // Open WhatsApp in the same click so the browser allows the pop-up.
    window.open(
      whatsappCartOrderLink(items, extraAmount, details, orderRefOf(result.id)),
      "_blank",
      "noopener,noreferrer"
    );

    // Give back anything an OLD cart line had debited (new lines never
    // debit), then empty the cart — the order now lives in the pending queue.
    items.forEach(creditStockBack);
    clearCart();
    setFields({ shopName: "", location: "", mobile: "" });
    setFieldErrors({});
    setNotice({
      type: "success",
      ref: orderRefOf(result.id),
      name: details.shopName,
      staff: isStaff,
    });
  }

  // Credits an item's debited stock back (used when it's removed from the
  // cart, or the cart is cleared, rather than actually ordered).
  function creditStockBack(it) {
    const folder = getFolder(it.folderSlug);
    const photo = folder?.photos.find((p) => p.id === it.photoId);
    if (!folder || !photo) return;
    // Return only what this line actually took out of physical stock —
    // a sales rep's un-reserved lines took nothing, so credit nothing.
    const debited = it.debitedPieces ?? it.qty * multiplierOf(it);
    if (debited <= 0) return;
    const currentStock = parseStock(photo.stock) ?? 0;
    updateStock(folder.id, it.photoId, currentStock + debited);
  }

  function handleRemoveItem(it) {
    creditStockBack(it);
    removeFromCart(it.key);
  }

  function handleClearCart() {
    items.forEach(creditStockBack);
    clearCart();
  }

  return (
    <div
      className="cart-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("yourCart")}
      onClick={onClose}
    >
      <div className="cart-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cart-panel-head">
          <h2 className="serif cart-panel-title">{t("yourCart")}</h2>
          <button
            type="button"
            className="cart-close-btn tooltip tooltip-below"
            onClick={onClose}
            aria-label={t("closeCart")}
            data-tooltip={t("closeCart")}
          >
            ✕
          </button>
        </div>

        {notice && notice.type === "success" && (
          <div className="order-success" role="status">
            <div className="order-success-icon" aria-hidden="true">✅</div>
            <h3 className="order-success-title">{t("orderSuccessTitle")}</h3>
            {notice.staff ? (
              <p className="order-success-body">
                {t("orderSuccessStaffBody", { name: notice.name })}
              </p>
            ) : (
              <>
                <p className="order-success-thanks">
                  {t("orderSuccessThanks", { name: notice.name })}
                </p>
                <p className="order-success-body">{t("orderSuccessBody")}</p>
              </>
            )}
            <p className="order-success-ref">
              {t("orderSuccessRef", { ref: notice.ref })}
            </p>
          </div>
        )}
        {notice && notice.type !== "success" && (
          <p
            className={
              "cart-notice" + (notice.type === "error" ? " cart-notice-error" : "")
            }
            role="status"
          >
            {notice.text}
          </p>
        )}
        {items.length === 0 ? (
          notice?.type === "success" ? null : (
            <p className="empty-note cart-empty">{t("emptyCart")}</p>
          )
        ) : (
          <>
            <ul className="cart-item-list">
              {items.map((it) => (
                <li className="cart-item" key={it.key}>
                  <img
                    src={it.img}
                    alt={it.caption}
                    className="cart-item-img"
                    loading="lazy"
                  />
                  <div className="cart-item-info">
                    <div className="cart-item-caption">{it.caption}</div>
                    <div className="cart-item-folder">{it.folderName}</div>
                    <div className="cart-item-price">
                      {(() => {
                        const { grValue, pieces } = cartLineParts(it);
                        return t("cartLineGrPc", {
                          qty: grValue,
                          pcs: pieces,
                        });
                      })()}{" "}
                      × {formatMoney(unitOf(it))} ={" "}
                      <strong>
                        {formatMoney(
                          priceFor(it.qty, unitOf(it), multiplierOf(it))
                        )}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cart-remove-btn tooltip"
                    onClick={() => handleRemoveItem(it)}
                    aria-label={t("removeItem")}
                    data-tooltip={t("removeItem")}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M9 3a1 1 0 0 0-1 1v1H4.5a1 1 0 0 0 0 2H5v12.5A2.5 2.5 0 0 0 7.5 22h9a2.5 2.5 0 0 0 2.5-2.5V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9Zm1 2h4v-1h-4v1ZM7 7h10v12.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7Zm3 2.5a.75.75 0 0 0-1.5 0v7a.75.75 0 0 0 1.5 0v-7Zm4.5-.75a.75.75 0 0 1 .75.75v7a.75.75 0 0 1-1.5 0v-7a.75.75 0 0 1 .75-.75Z"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>

            <div className="cart-panel-footer">
              <div className="cart-summary">
                {t.count("cartItemCount", items.length)} ·{" "}
                {t("totalQtyLabel")}: {totalQty} ({totalPieces} pc)
              </div>

              {isStaff && (
                <div className="cart-shop-details">
                  <div className="cart-shop-details-title">
                    {t("customerDetailsTitle")}
                  </div>
                  {[
                    ["shopName", "shopNameLabel", "shopNamePlaceholder", "text"],
                    ["location", "locationLabel", "locationPlaceholder", "text"],
                    ["mobile", "mobileLabel", "mobilePlaceholder", "tel"],
                  ].map(([name, label, placeholder, type]) => (
                    <div className="cart-shop-field" key={name}>
                      <label className="field-label" htmlFor={`cart-${name}`}>
                        {t(label)} <span className="required-mark">*</span>
                      </label>
                      <input
                        id={`cart-${name}`}
                        type={type}
                        inputMode={type === "tel" ? "tel" : undefined}
                        className={
                          "field-input cart-shop-detail-input" +
                          (fieldErrors[name] ? " field-input-error" : "")
                        }
                        placeholder={t(placeholder)}
                        value={fields[name]}
                        required
                        aria-invalid={!!fieldErrors[name]}
                        onChange={(e) => setField(name, e.target.value)}
                      />
                      {fieldErrors[name] && (
                        <span className="field-error-text">
                          {t(
                            fieldErrors[name] === "mobile_invalid"
                              ? "mobileInvalid"
                              : "fieldRequired"
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isStaff && (
              <div className="cart-extra-charge">
                <label className="cart-extra-checkbox-row">
                  <input
                    type="checkbox"
                    checked={noExtraCharge}
                    onChange={handleNoExtraChargeToggle}
                  />
                  {t("noExtraChargeLabel")}
                </label>
                <div className="cart-extra-input-row">
                  <span className="cart-extra-input-label">
                    {t("extraAmountLabel")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="field-input cart-extra-input"
                    placeholder="0"
                    value={extraAmountInput}
                    disabled={noExtraCharge}
                    onChange={(e) => setExtraAmountInput(e.target.value)}
                  />
                </div>
              </div>
              )}

              {roundOff !== 0 && (
                <div className="cart-roundoff">
                  <div className="cart-roundoff-row">
                    <span>{t("amountLabel")}</span>
                    <span>{formatMoney(exactTotal)}</span>
                  </div>
                  <div className="cart-roundoff-row">
                    <span>{t("roundOffLabel")}</span>
                    <span>
                      {roundOff > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(roundOff))}
                    </span>
                  </div>
                </div>
              )}
              <div className="cart-total-row">
                <span>{t("totalValueLabel")}</span>
                <strong>{formatMoney(totalValue)}</strong>
              </div>
              <div className="cart-footer-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleClearCart}
                >
                  {t("clearCart")}
                </button>
                <button
                  type="button"
                  className="btn btn-solid cart-order-btn"
                  onClick={handlePlaceOrder}
                >
                  <WhatsAppIcon size={18} /> {t("placeOrderWhatsApp")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
