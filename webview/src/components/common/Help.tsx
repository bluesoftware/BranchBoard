import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Small hoverable/focusable "?" with a bilingual explanation. Uses a custom
 * popover (not the native title attribute, which VS Code webviews often
 * suppress) so the tooltip reliably appears on hover and keyboard focus.
 *
 * Shared between TaskDrawer and AiAgentPanel (and anywhere else that needs
 * the same inline help marker) so there is a single source of truth for the
 * popover positioning logic.
 */
export function Help({ text }: { text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const margin = 12;
    const gap = 8;
    const width = popRef.current?.offsetWidth ?? 320;
    const height = popRef.current?.offsetHeight ?? 44;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const preferredTop = rect.bottom + gap;
    const flippedTop = rect.top - height - gap;
    const top =
      preferredTop + height + margin <= window.innerHeight
        ? preferredTop
        : Math.max(margin, flippedTop);
    setPosition({ top, left });
  };

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onMove = () => updatePosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, text]);

  return (
    <span
      ref={anchorRef}
      className="bb-help"
      tabIndex={0}
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      ?
      {open &&
        createPortal(
          <span ref={popRef} className="bb-help-pop bb-help-pop-floating" role="tooltip" style={position}>
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

/** Field label with an inline help marker. */
export function LabelHelp({ label, help }: { label: string; help: string }) {
  return (
    <label className="bb-label-help">
      {label}
      <Help text={help} />
    </label>
  );
}
