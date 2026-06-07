import type { BadgeTone } from "../common/Badge";

interface Props {
  label: string;
  value: number | string;
  tone?: BadgeTone;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}

/** A single KPI tile on the Overview dashboard. */
export function MetricCard({ label, value, tone = "neutral", hint, active, onClick }: Props) {
  return (
    <div
      className={`bb-metric tone-${tone} ${onClick ? "clickable" : ""} ${active ? "active" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={hint}
    >
      <div className="bb-metric-value">{value}</div>
      <div className="bb-metric-label">{label}</div>
    </div>
  );
}
