import { useState } from "react";
import { BoardData, DashboardData } from "../../types";
import { t } from "../../i18n";
import { MetricCard } from "./MetricCard";
import { Badge, BadgeTone } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";
import { BranchIcon } from "../Icons";

interface Props {
  data: DashboardData;
  board: BoardData;
  onOpenTask: (taskId: string) => void;
}

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

type MetricKey =
  | "active"
  | "inProgress"
  | "inReview"
  | "inTesting"
  | "readyToMerge"
  | "blocked"
  | "branchesWithoutTask"
  | "tasksWithoutBranch"
  | "doneThisWeek";

interface ListRow {
  key: string;
  title: string;
  sub?: string;
  branch?: string;
  taskId?: string | null;
  userId?: string | null;
}

function bucketOf(name: string): "in-progress" | "review" | "testing" | "done" | "blocked" | "other" {
  const s = name.toLowerCase();
  if (/zrobione|gotowe|done/.test(s)) return "done";
  if (/block|zablokow|wstrzym/.test(s)) return "blocked";
  if (/test|do.?testu|qa/.test(s)) return "testing";
  if (/review|przegl|do.?zatwierdz/.test(s)) return "review";
  if (/in.?progress|w.?toku|w.?trakcie/.test(s)) return "in-progress";
  return "other";
}

function recent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  return !Number.isNaN(d) && Date.now() - d <= 7 * 24 * 60 * 60 * 1000;
}

/** CTO Overview: KPI tiles (clickable → task list) + "needs attention". */
export function OverviewDashboard({ data, board, onOpenTask }: Props) {
  const o = data.overview;
  const [metric, setMetric] = useState<MetricKey | null>(null);

  const colName = (id: string) => board.columns.find((c) => c.id === id)?.name ?? id;
  const bucketOfTask = (columnId: string) => bucketOf(colName(columnId));
  const isDone = (taskColumnId: string, status: string) =>
    bucketOfTask(taskColumnId) === "done" || status === "done";

  const taskRow = (taskId: string): ListRow | null => {
    const tk = board.tasks.find((x) => x.id === taskId);
    if (!tk) return null;
    return { key: tk.id, title: tk.title, sub: colName(tk.columnId), branch: tk.branchName || undefined, taskId: tk.id, userId: tk.assignedUserId };
  };

  const rowsFor = (m: MetricKey): ListRow[] => {
    const activeTasks = board.tasks.filter((x) => !isDone(x.columnId, x.status));
    switch (m) {
      case "active":
        return activeTasks.map((x) => taskRow(x.id)!).filter(Boolean);
      case "inProgress":
        return activeTasks.filter((x) => bucketOfTask(x.columnId) === "in-progress").map((x) => taskRow(x.id)!);
      case "inReview":
        return activeTasks.filter((x) => bucketOfTask(x.columnId) === "review").map((x) => taskRow(x.id)!);
      case "inTesting":
        return activeTasks.filter((x) => bucketOfTask(x.columnId) === "testing").map((x) => taskRow(x.id)!);
      case "blocked":
        return activeTasks.filter((x) => bucketOfTask(x.columnId) === "blocked").map((x) => taskRow(x.id)!);
      case "tasksWithoutBranch":
        return activeTasks.filter((x) => !x.branchName).map((x) => taskRow(x.id)!);
      case "doneThisWeek":
        return board.tasks
          .filter((x) => isDone(x.columnId, x.status) && (recent(x.finishedAt) || recent(x.updatedAt)))
          .map((x) => taskRow(x.id)!)
          .filter(Boolean);
      case "readyToMerge":
        return data.branchFlow
          .filter((r) => r.info.readyToMerge)
          .map((r) => ({ key: r.branchName, title: r.taskTitle ?? r.branchName, sub: r.columnName ?? undefined, branch: r.branchName, taskId: r.taskId, userId: r.assignedUserId }));
      case "branchesWithoutTask":
        return data.branchFlow
          .filter((r) => !r.taskId && r.info.existsLocal)
          .map((r) => ({ key: r.branchName, title: r.branchName, sub: t("branchMap.noTaskLabel"), branch: r.branchName }));
      default:
        return [];
    }
  };

  const tile = (key: MetricKey, value: number, tone: BadgeTone) => (
    <MetricCard
      label={t(`cc.metric.${key}`)}
      value={value}
      tone={tone}
      active={metric === key}
      onClick={() => setMetric((cur) => (cur === key ? null : key))}
    />
  );

  const rows = metric ? rowsFor(metric) : [];

  return (
    <div className="bb-cc-section">
      <div className="bb-metric-grid">
        {tile("active", o.activeTasks, "neutral")}
        {tile("inProgress", o.inProgress, "info")}
        {tile("inReview", o.inReview, "warning")}
        {tile("inTesting", o.inTesting, "info")}
        {tile("readyToMerge", o.readyToMerge, "success")}
        {tile("blocked", o.blocked, "critical")}
        {tile("branchesWithoutTask", o.branchesWithoutTask, "medium")}
        {tile("tasksWithoutBranch", o.tasksWithoutBranch, "low")}
        {tile("doneThisWeek", o.doneThisWeek, "success")}
      </div>

      {/* Clicked-tile task list */}
      {metric && (
        <div className="bb-cc-block">
          <div className="bb-section-head">
            <span className="bb-section-title">{t(`cc.metric.${metric}`)}</span>
            <span className="bb-count">{rows.length}</span>
            <button className="bb-btn ghost sm bb-section-right" onClick={() => setMetric(null)}>
              ✕
            </button>
          </div>
          {rows.length === 0 ? (
            <EmptyState title={t("cc.list.empty")} />
          ) : (
            <ul className="bb-metric-list">
              {rows.map((r) => {
                const user = r.userId ? board.users.find((u) => u.id === r.userId) : undefined;
                return (
                  <li
                    key={r.key}
                    className={`bb-metric-item ${r.taskId ? "clickable" : ""}`}
                    onClick={() => r.taskId && onOpenTask(r.taskId)}
                    title={r.taskId ? t("branchMap.openTask") : undefined}
                  >
                    {user ? (
                      <span className="bb-avatar sm" style={{ background: user.color }} title={user.name}>
                        {user.avatarText}
                      </span>
                    ) : (
                      <span className="bb-avatar sm bb-avatar-empty">·</span>
                    )}
                    <span className="bb-metric-item-title">{r.title}</span>
                    {r.sub && <span className="bb-flow-col">{r.sub}</span>}
                    {r.branch && (
                      <code className="bb-metric-item-branch">
                        <BranchIcon size={10} /> {r.branch.replace(/^feature\//, "")}
                      </code>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="bb-cc-block">
        <h3 className="bb-cc-h3">{t("cc.attn.title")}</h3>
        {data.attention.length === 0 ? (
          <EmptyState title={t("cc.attn.empty")} hint={t("cc.attn.emptyHint")} />
        ) : (
          <ul className="bb-attn-list">
            {data.attention.map((item) => (
              <li
                key={item.id}
                className={`bb-attn-item sev-${item.severity} ${item.taskId ? "clickable" : ""}`}
                onClick={() => item.taskId && onOpenTask(item.taskId)}
              >
                <Badge tone={SEVERITY_TONE[item.severity] ?? "neutral"}>
                  {t(`cc.severity.${item.severity}`)}
                </Badge>
                <span className="bb-attn-text">{t(item.reasonKey, item.params)}</span>
                {item.branchName && <code className="bb-attn-branch">{item.branchName}</code>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
