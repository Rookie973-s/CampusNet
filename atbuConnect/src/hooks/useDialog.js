import { useCallback, useEffect, useRef, useState } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog behaviour: Escape to close, focus moved in on open and restored on close,
 * Tab/Shift+Tab kept inside the dialog, background scroll locked, and a short exit
 * animation (skipped when the user prefers reduced motion).
 *
 *   const { ref, closing, requestClose } = useDialog(onClose, { dismissible });
 *   <div className={`overlay${closing ? " closing" : ""}`}> <div ref={ref} role="dialog" aria-modal="true"> ...
 */
export default function useDialog(onClose, { dismissible = true } = {}) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onCloseRef.current(); return; }
    setClosing(true);
    setTimeout(() => onCloseRef.current(), 180);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = ref.current;
    if (node) {
      const first = node.querySelector("[data-autofocus]") || node.querySelector(FOCUSABLE);
      (first || node).focus?.({ preventScroll: true });
    }

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      // Only genuinely tabbable elements: skip tabindex=-1, hidden, and anything inside an [inert] subtree.
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && el.offsetParent !== null && !el.closest("[inert]")
      );
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.({ preventScroll: true });
    };
  }, [dismissible, requestClose]);

  return { ref, closing, requestClose };
}
