import { useEffect, useState } from "react";

// Small floating button that appears once the visitor has scrolled down a
// bit, and smoothly scrolls the page back to the top when clicked.
export default function BackToTopFloat() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 320);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleClick() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      className={
        "back-to-top-float tooltip" + (visible ? " back-to-top-visible" : "")
      }
      onClick={handleClick}
      aria-label="Back to top"
      data-tooltip="Back to top"
      tabIndex={visible ? 0 : -1}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 5.5 5.5 12M12 5.5 18.5 12M12 5.5v13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
