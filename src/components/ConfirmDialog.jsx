// Small reusable confirm/cancel dialog used for actions that need a
// deliberate "are you sure" step (e.g. applying a stock adjustment)
// instead of taking effect immediately on blur/Enter.
export default function ConfirmDialog({
  title,
  message,
  cancelLabel,
  okLabel,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="confirm-title serif">{title}</h3>}
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm confirm-cancel-btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-solid btn-sm confirm-ok-btn"
            onClick={onConfirm}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
