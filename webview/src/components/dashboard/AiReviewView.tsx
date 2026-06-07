import { AiTaskRow, DashboardData } from "../../types";
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

function Group({
  title,
  rows,
  onOpenTask,
  emptyHint,
}: {
  title: string;
  rows: AiTaskRow[];
  onOpenTask: (id: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="bb-cc-block">
      <h3 className="bb-cc-h3">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <div className="bb-muted small">{emptyHint}</div>
      ) : (
        <ul className="bb-ai-list">
          {rows.map((r) => (
            <li className="bb-ai-row" key={r.taskId} onClick={() => onOpenTask(r.taskId)}>
              <span className="bb-ai-title">{r.title}</span>
              {r.usedModel && <code className="bb-ai-model">{r.usedModel}</code>}
              {r.columnName && <span className="bb-flow-col">{r.columnName}</span>}
              <span className="bb-ai-check">
                {r.checklistDone}/{r.checklistTotal}
              </span>
              <Badge tone={LEVEL_TONE[r.riskLevel]}>{t(`cc.severity.${r.riskLevel}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AiReviewView({ data, onOpenTask }: Props) {
  const ai = data.aiReview;
  if (ai.totalAssisted === 0) {
    return <EmptyState title={t("cc.ai.empty")} hint={t("cc.ai.emptyHint")} />;
  }
  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cc.ai.note")}</p>
      <Group
        title={t("cc.ai.assisted")}
        rows={ai.assisted}
        onOpenTask={onOpenTask}
        emptyHint={t("cc.ai.none")}
      />
      <Group
        title={t("cc.ai.withoutChecklist")}
        rows={ai.withoutChecklist}
        onOpenTask={onOpenTask}
        emptyHint={t("cc.ai.allHaveChecklist")}
      />
      <Group
        title={t("cc.ai.highRisk")}
        rows={ai.highRisk}
        onOpenTask={onOpenTask}
        emptyHint={t("cc.ai.noHighRisk")}
      />
      <Group
        title={t("cc.ai.readyForReview")}
        rows={ai.readyForReview}
        onOpenTask={onOpenTask}
        emptyHint={t("cc.ai.noneReady")}
      />
    </div>
  );
}
