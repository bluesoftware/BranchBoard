interface Props {
  value: number;
  max: number;
  /** CSS color for the fill. Defaults to the accent color. */
  color?: string;
  label?: string;
}

/** Thin horizontal bar used for per-user workload visualisation. */
export function ProgressBar({ value, max, color, label }: Props) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className="bb-progress" title={label}>
      <div
        className="bb-progress-fill"
        style={{ width: `${pct}%`, background: color || "var(--bb-accent)" }}
      />
    </div>
  );
}
