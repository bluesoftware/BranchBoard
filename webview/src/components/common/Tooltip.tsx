import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** The explanation text (already translated via t()). */
  text: string;
  children: ReactNode;
  /** Preferred side; falls back gracefully if it would overflow. */
  side?: "top" | "bottom" | "left" | "right";
  /** Show delay in ms (default 350). */
  delay?: number;
}

/**
 * Accessible tooltip used across BranchBoard. Shows on hover and on keyboard
 * focus, after a short delay, and links to its content via aria-describedby so
 * screen readers announce it. Theme-aware (VS Code hover-widget colors).
 *
 * Wrap any element: <Tooltip text={t("tooltips.git.push")}><button…/></Tooltip>
 */
export function Tooltip({ text, children, side = "top", delay = 350 }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, transform: "none" });
  const timer = useRef<number | undefined>(undefined);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  if (!text) {
    return <>{children}</>;
  }

  const updatePosition = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const gap = 8;
    const margin = 12;
    const width = popRef.current?.offsetWidth ?? 280;
    const height = popRef.current?.offsetHeight ?? 44;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clampLeft = (x: number) =>
      Math.min(Math.max(x, margin), Math.max(margin, window.innerWidth - width - margin));
    const clampTop = (y: number) =>
      Math.min(Math.max(y, margin), Math.max(margin, window.innerHeight - height - margin));

    if (side === "bottom") {
      const preferredTop = rect.bottom + gap;
      const flippedTop = rect.top - height - gap;
      setPosition({
        top: clampTop(preferredTop + height + margin <= window.innerHeight ? preferredTop : flippedTop),
        left: clampLeft(centerX - width / 2),
        transform: "none",
      });
    } else if (side === "right") {
      const preferredLeft = rect.right + gap;
      const flippedLeft = rect.left - width - gap;
      setPosition({
        top: clampTop(centerY - height / 2),
        left: clampLeft(preferredLeft + width + margin <= window.innerWidth ? preferredLeft : flippedLeft),
        transform: "none",
      });
    } else if (side === "left") {
      const preferredLeft = rect.left - width - gap;
      const flippedLeft = rect.right + gap;
      setPosition({
        top: clampTop(centerY - height / 2),
        left: clampLeft(preferredLeft >= margin ? preferredLeft : flippedLeft),
        transform: "none",
      });
    } else {
      const preferredTop = rect.top - height - gap;
      const flippedTop = rect.bottom + gap;
      setPosition({
        top: clampTop(preferredTop >= margin ? preferredTop : flippedTop),
        left: clampLeft(centerX - width / 2),
        transform: "none",
      });
    }
  };

  const show = () => {
    window.clearTimeout(timer.current);
    updatePosition();
    timer.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

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
  }, [open, side]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, side, text]);

  return (
    <span
      ref={anchorRef}
      className="bb-tt"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={popRef}
            className={`bb-tt-pop bb-tt-pop-floating side-${side}`}
            role="tooltip"
            id={id}
            style={position}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
