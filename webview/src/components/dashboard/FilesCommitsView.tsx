import { BranchFlowRow, DashboardData } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { Badge, BadgeTone } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";

interface Props {
  data: DashboardData;
  onSelectRow: (row: BranchFlowRow) => void;
}

const RISK_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

/**
 * Branch picker for the Files & Commits tab. Selecting a branch opens the shared
 * BranchDrawer (commits + changed files + actions) — no duplicated detail logic.
 */
export function FilesCommitsView({ data, onSelectRow }: Props) {
  if (data.branchFlow.length === 0) {
    return <EmptyState title={t("cc.files.empty")} hint={t("cc.files.emptyHint")} />;
  }
  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cc.files.pickHint")}</p>
      <div className="bb-flow-list">
        {data.branchFlow.map((row) => (
          <div className="bb-flow-card clickable" key={row.branchName} onClick={() => onSelectRow(row)}>
            <div className="bb-flow-top">
              <code className="bb-flow-branch">{row.info.current ? "● " : ""}{row.branchName}</code>
              <div className="bb-flow-badges">
                <Badge tone={RISK_TONE[row.riskLevel]}>{t(`cc.severity.${row.riskLevel}`)}</Badge>
              </div>
            </div>
            <div className="bb-flow-foot">
              <span>{row.taskTitle ?? t("cc.flow.noTaskLabel")}</span>
              <span>{t("cc.files.filesShort")}: {row.info.changedFilesCount}</span>
              <span>↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}</span>
              <span>{relativeTime(row.info.lastCommitAt, timeLabels())}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
