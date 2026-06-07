import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "success"
  | "info"
  | "warning";

interface Props {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
}

/** Small pill label used across the Command Center (risk, status, counts). */
export function Badge({ children, tone = "neutral", title }: Props) {
  return (
    <span className={`bb-badge tone-${tone}`} title={title}>
      {children}
    </span>
  );
}
