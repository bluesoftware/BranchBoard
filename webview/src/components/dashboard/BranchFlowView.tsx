import { useState } from "react";
import { BoardData, BranchFlowRow, DashboardData } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { Badge, BadgeTone } from "../common/Badge";
import { Tooltip } from "../common/Tooltip";
import { EmptyState } from "../common/EmptyState";
import { MetricCard } from "./MetricCard";
import { BranchPipeline } from "./BranchPipeline";
import { BranchIcon } from "../Icons";

type FlowFilter =
  | "all"
  | "mine"
  | "active"
  | "withoutTask"
  | "notPushed"
  | "localOnly"
  | "remoteOnly"
  | "backup"
  | "stale"
  | "readyToReview"
  | "readyToMerge"
  | "cleanup"
  | "dev";

interface Props {
  data: DashboardData;
  board: BoardData;
  currentUserId: string | null;
  onCopy: (text: string, label: string) => void;
  onOpenTask: (taskId: string) => void;
  onCheckout: (branchName: string) => void;
  onPush: (branchName: string) => void;
  onDeployDev: (taskId: string) => void;
  onCreateTaskFromBranch: (branchName: string) => void;
  onLinkBranch: (taskId: string, branchName: string) => void;
  onOpenBranch: (row: BranchFlowRow) => void;
  onBulkDeleteLocal: (branches: string[]) => void;
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

/** Coarse category for a branch row (drives badge + filters). */
function categoryOf(row: BranchFlowRow): { key: string; tone: BadgeTone } {
  const i = row.info;
  if (row.branchName.startsWith("backup/") || row.branchName.startsWith("archive/")) {
    return { key: "backup", tone: "neutral" };
  }
  if (row.riskLevel === "high" || row.riskLevel === "critical") {
    return { key: "highRisk", tone: "high" };
  }
  if (i.existsLocal && !i.existsRemote) {
    return { key: "localOnly", tone: "medium" };
  }
  if (!i.existsLocal && i.existsRemote) {
    return { key: "remoteOnly", tone: "info" };
  }
  if (row.stale) {
    return { key: "stale", tone: "warning" };
  }
  if (i.readyToMerge) {
    return { key: "readyToMerge", tone: "success" };
  }
  if (!row.taskId) {
    return { key: "withoutTask", tone: "medium" };
  }
  return { key: "active", tone: "neutral" };
}

function isCleanup(row: BranchFlowRow): boolean {
  const i = row.info;
  if (row.branchName.startsWith("backup/") || row.branchName.startsWith("archive/")) {
    return true;
  }
  if (row.stale && !row.taskId) {
    return true;
  }
  if (i.existsLocal && i.commitsAheadMain === 0) {
    return true;
  }
  return false;
}

export function BranchFlowView(props: Props) {
  const { data, board, currentUserId } = props;
  const [filter, setFilter] = useState<FlowFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkFor, setLinkFor] = useState<string | null>(null);

  const aiTaskIds = new Set(board.tasks.filter((x) => x.ai?.createdByAi).map((x) => x.id));
  const tasksWithoutBranch = board.tasks.filter((x) => !x.branchName);

  const matchReview = (row: BranchFlowRow) =>
    !!row.columnName && /review|przegl/i.test(row.columnName);

  const match = (row: BranchFlowRow): boolean => {
    const cat = categoryOf(row).key;
    switch (filter) {
      case "mine":
        return !!currentUserId && row.assignedUserId === currentUserId;
      case "active":
        return cat === "active" || (!!row.taskId && !row.stale);
      case "withoutTask":
        return !row.taskId;
      case "notPushed":
        return row.info.commitsAheadMain > 0 && !row.info.existsRemote;
      case "localOnly":
        return row.info.existsLocal && !row.info.existsRemote;
      case "remoteOnly":
        return !row.info.existsLocal && row.info.existsRemote;
      case "backup":
        return row.branchName.startsWith("backup/") || row.branchName.startsWith("archive/");
      case "stale":
        return row.stale;
      case "readyToReview":
        return matchReview(row);
      case "readyToMerge":
        return row.info.readyToMerge;
      case "cleanup":
        return isCleanup(row);
      case "dev":
        return row.info.deployedToDev;
      default:
        return true;
    }
  };

  const rows = data.branchFlow.filter(match);

  // Summary counts (over all branches).
  const all = data.branchFlow;
  const sum = {
    active: all.filter((r) => categoryOf(r).key === "active" || (!!r.taskId && !r.stale)).length,
    withoutTask: all.filter((r) => !r.taskId).length,
    localOnly: all.filter((r) => r.info.existsLocal && !r.info.existsRemote).length,
    remoteOnly: all.filter((r) => !r.info.existsLocal && r.info.existsRemote).length,
    backup: all.filter((r) => r.branchName.startsWith("backup/") || r.branchName.startsWith("archive/")).length,
    stale: all.filter((r) => r.stale).length,
    cleanup: all.filter(isCleanup).length,
    highRisk: all.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical").length,
  };

  const filters: FlowFilter[] = [
    "all", "mine", "active", "withoutTask", "notPushed", "localOnly", "remoteOnly",
    "backup", "stale", "readyToReview", "readyToMerge", "cleanup", "dev",
  ];

  const toggleSel = (name: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const selectVisible = () => setSelected(new Set(rows.map((r) => r.branchName)));
  const clearSel = () => setSelected(new Set());

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("branchFlow.subtitle")}</p>

      {/* Summary bar */}
      <div className="bb-metric-grid">
        <MetricCard label={t("branchFlow.sum.active")} value={sum.active} tone="neutral" active={filter === "active"} onClick={() => setFilter("active")} />
        <MetricCard label={t("branchFlow.sum.withoutTask")} value={sum.withoutTask} tone="medium" active={filter === "withoutTask"} onClick={() => setFilter("withoutTask")} />
        <MetricCard label={t("branchFlow.sum.localOnly")} value={sum.localOnly} tone="info" active={filter === "localOnly"} onClick={() => setFilter("localOnly")} />
        <MetricCard label={t("branchFlow.sum.remoteOnly")} value={sum.remoteOnly} tone="info" active={filter === "remoteOnly"} onClick={() => setFilter("remoteOnly")} />
        <MetricCard label={t("branchFlow.sum.backup")} value={sum.backup} tone="neutral" active={filter === "backup"} onClick={() => setFilter("backup")} />
        <MetricCard label={t("branchFlow.sum.stale")} value={sum.stale} tone="warning" active={filter === "stale"} onClick={() => setFilter("stale")} />
        <MetricCard label={t("branchFlow.sum.cleanup")} value={sum.cleanup} tone="medium" active={filter === "cleanup"} onClick={() => setFilter("cleanup")} />
        <MetricCard label={t("branchFlow.sum.highRisk")} value={sum.highRisk} tone="critical" onClick={() => setFilter("all")} />
      </div>

      {/* Filters */}
      <div className="bb-chipbar">
        {filters.map((f) => (
          <button key={f} className={`bb-chip-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {t(`branchFlow.filter.${f}`)}
          </button>
        ))}
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="bb-bulkbar">
          <span>{t("branchFlow.selected", { count: selected.size })}</span>
          <button className="bb-btn ghost sm" onClick={selectVisible}>{t("branchFlow.selectAll")}</button>
          <button className="bb-btn ghost sm" onClick={clearSel}>{t("branchFlow.clearSelection")}</button>
          <div className="bb-topbar-spacer" />
          <button
            className="bb-btn ghost sm"
            onClick={() => props.onCopy(Array.from(selected).join("\n"), t("branchFlow.listCopied"))}
          >
            {t("branchFlow.copyList")}
          </button>
          <button className="bb-btn danger sm" onClick={() => props.onBulkDeleteLocal(Array.from(selected))}>
            {t("branchFlow.bulkDeleteLocal")}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title={t("branchFlow.empty")} hint={t("branchFlow.subtitle")} />
      ) : (
        <div className="bb-flow-list">
          {rows.map((row) => {
            const user = board.users.find((u) => u.id === row.assignedUserId);
            const cat = categoryOf(row);
            const isAi = !!row.taskId && aiTaskIds.has(row.taskId);
            const isMain = row.branchName === data.mainBranch;
            return (
              <div className={`bb-flow-card risk-${row.riskLevel}`} key={row.branchName}>
                <div className="bb-flow-top">
                  <input
                    type="checkbox"
                    className="bb-flow-check"
                    checked={selected.has(row.branchName)}
                    onChange={() => toggleSel(row.branchName)}
                    aria-label={row.branchName}
                  />
                  <Tooltip text={row.branchName}>
                    <code
                      className="bb-flow-branch"
                      onClick={() => props.onCopy(row.branchName, t("cc.flow.branchCopied"))}
                    >
                      {row.info.current ? "● " : ""}
                      {row.branchName}
                    </code>
                  </Tooltip>
                  <div className="bb-flow-badges">
                    {isMain && <Badge tone="info">MAIN</Badge>}
                    {row.info.current && <Badge tone="success">{t("branchFlow.current")}</Badge>}
                    <Tooltip text={t(`tooltips.branchFlow.${cat.key === "localOnly" ? "localOnly" : cat.key === "remoteOnly" ? "remoteOnly" : cat.key === "backup" ? "backup" : cat.key === "stale" ? "stale" : "cleanup"}`)}>
                      <Badge tone={cat.tone}>{t(`branchFlow.cat.${cat.key}`)}</Badge>
                    </Tooltip>
                    {isAi && <Badge tone="info">AI</Badge>}
                    {row.info.deployedToDev && <Badge tone="info">DEV</Badge>}
                    <Tooltip text={t("tooltips.risk.score")}>
                      <Badge tone={RISK_TONE[row.riskLevel]}>{t(`cc.severity.${row.riskLevel}`)}</Badge>
                    </Tooltip>
                  </div>
                </div>

                <div className="bb-flow-meta">
                  {row.taskTitle ? (
                    <span className="bb-flow-task clickable" onClick={() => row.taskId && props.onOpenTask(row.taskId)}>
                      {row.taskTitle}
                    </span>
                  ) : (
                    <span className="bb-flow-task muted">{t("cc.flow.noTaskLabel")}</span>
                  )}
                  {user && (
                    <span className="bb-avatar sm" style={{ background: user.color }} title={user.name}>
                      {user.avatarText}
                    </span>
                  )}
                  {row.columnName && <span className="bb-flow-col">{row.columnName}</span>}
                </div>

                <BranchPipeline stages={row.stages} />

                <div className="bb-flow-foot">
                  <span>↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}</span>
                  <span>{t("branchMap.files")}: {row.info.changedFilesCount}</span>
                  <span>{relativeTime(row.info.lastCommitAt, timeLabels())}</span>
                </div>

                {/* Quick actions */}
                <div className="bb-flow-actions">
                  {!row.info.current && row.info.existsLocal && (
                    <Tooltip text={t("tooltips.git.checkout")}>
                      <button className="bb-btn ghost sm" onClick={() => props.onCheckout(row.branchName)}>{t("branchFlow.checkout")}</button>
                    </Tooltip>
                  )}
                  {row.taskId ? (
                    <button className="bb-btn ghost sm" onClick={() => props.onOpenTask(row.taskId!)}>{t("branchFlow.openTask")}</button>
                  ) : (
                    <>
                      <Tooltip text={t("tooltips.branchFlow.createTask")}>
                        <button className="bb-btn ghost sm" onClick={() => props.onCreateTaskFromBranch(row.branchName)}>{t("branchFlow.createTask")}</button>
                      </Tooltip>
                      <Tooltip text={t("tooltips.branchFlow.linkTask")}>
                        <button className="bb-btn ghost sm" onClick={() => setLinkFor(linkFor === row.branchName ? null : row.branchName)}>{t("branchFlow.linkTask")}</button>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip text={t("tooltips.git.push")}>
                    <button className="bb-btn ghost sm" onClick={() => props.onPush(row.branchName)}>{t("branchFlow.push")}</button>
                  </Tooltip>
                  {row.taskId && (
                    <button className="bb-btn ghost sm" onClick={() => props.onDeployDev(row.taskId!)}>{t("branchFlow.dev")}</button>
                  )}
                  <button className="bb-btn ghost sm" onClick={() => props.onOpenBranch(row)}>{t("branchFlow.more")}</button>
                </div>

                {linkFor === row.branchName && !row.taskId && (
                  <div className="bb-comment-add">
                    <select
                      className="bb-input"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          props.onLinkBranch(e.target.value, row.branchName);
                          setLinkFor(null);
                        }
                      }}
                    >
                      <option value="">{t("branchFlow.linkPick")}</option>
                      {tasksWithoutBranch.map((x) => (
                        <option key={x.id} value={x.id}>{x.title}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
