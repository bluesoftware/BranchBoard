import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";

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
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  if (!text) {
    return <>{children}</>;
  }

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="bb-tt"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span className={`bb-tt-pop side-${side}`} role="tooltip" id={id}>
          {text}
        </span>
      )}
    </span>
  );
}
