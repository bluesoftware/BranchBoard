import { DashboardData } from "../../types";
import { t } from "../../i18n";
import { Badge } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";
import { ProgressBar } from "../common/ProgressBar";

interface Props {
  data: DashboardData;
}

/** Groups changed files of active branches into project areas (Impact view). */
export function ImpactView({ data }: Props) {
  const areas = data.impact;
  if (areas.length === 0) {
    return <EmptyState title={t("impact.empty")} hint={t("impact.emptyHint")} />;
  }
  const max = Math.max(1, ...areas.map((a) => a.files));

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("impact.note")}</p>
      <div className="bb-impact-list">
        {areas.map((a) => (
          <div className={`bb-impact-card ${a.critical ? "critical" : ""}`} key={a.id}>
            <div className="bb-impact-head">
              <span className="bb-impact-name">{a.name}</span>
              {a.critical && <Badge tone="critical">{t("impact.critical")}</Badge>}
              <span className="bb-impact-files">{t("impact.files", { count: a.files })}</span>
            </div>
            <ProgressBar value={a.files} max={max} color={a.critical ? "var(--bb-danger)" : "var(--bb-accent)"} />
            <div className="bb-impact-meta">
              <span title={t("impact.branchesHint")}>
                {t("impact.branches")}: <strong>{a.branches.length}</strong>
                {a.branches.length > 0 ? ` · ${a.branches.join(", ")}` : ""}
              </span>
            </div>
            {a.tasks.length > 0 && (
              <div className="bb-impact-tasks">
                {t("impact.tasks")}: {a.tasks.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
