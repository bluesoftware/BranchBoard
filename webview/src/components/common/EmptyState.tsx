import type { ReactNode } from "react";

interface Props {
  title: string;
  hint?: string;
  icon?: ReactNode;
}

/** Centered placeholder shown when a dashboard section has no data yet. */
export function EmptyState({ title, hint, icon }: Props) {
  return (
    <div className="bb-empty">
      {icon && <div className="bb-empty-icon">{icon}</div>}
      <div className="bb-empty-title">{title}</div>
      {hint && <div className="bb-empty-hint">{hint}</div>}
    </div>
  );
}
