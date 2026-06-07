import { DashboardData, RiskItem } from "../../types";
import { t } from "../../i18n";
import { Badge, BadgeTone } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";

interface Props {
  data: DashboardData;
  onOpenTask: (taskId: string) => void;
}

const LEVEL_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export function RiskRadarView({ data, onOpenTask }: Props) {
  if (data.riskRadar.length === 0) {
    return <EmptyState title={t("cc.risk.empty")} hint={t("cc.risk.emptyHint")} />;
  }
  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cc.risk.note")}</p>
      <div className="bb-risk-list">
        {data.riskRadar.map((item: RiskItem) => (
          <div
            className={`bb-risk-card risk-${item.level} ${item.taskId ? "clickable" : ""}`}
            key={item.taskId ?? item.branchName ?? Math.random()}
            onClick={() => item.taskId && onOpenTask(item.taskId)}
          >
            <div className="bb-risk-head">
              <div className="bb-risk-score" title={t("cc.risk.score")}>
                {item.score}
              </div>
              <div className="bb-risk-id">
                <div className="bb-risk-title">{item.taskTitle ?? item.branchName}</div>
                {item.branchName && <code className="bb-risk-branch">{item.branchName}</code>}
              </div>
              <Badge tone={LEVEL_TONE[item.level]}>{t(`cc.severity.${item.level}`)}</Badge>
            </div>

            <ul className="bb-risk-reasons">
              {item.reasons.map((r, i) => (
                <li key={i}>
                  <span className="bb-risk-points">+{r.points}</span>
                  {t(r.key, r.params)}
                </li>
              ))}
            </ul>

            {item.suggestions.length > 0 && (
              <div className="bb-risk-suggest">
                <span className="bb-risk-suggest-label">{t("cc.risk.suggested")}:</span>
                {item.suggestions.map((s) => (
                  <Badge key={s} tone="info">
                    {t(s)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
