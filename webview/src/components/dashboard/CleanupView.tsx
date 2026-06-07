import { useState } from "react";
import { BoardData, BranchFlowRow, DashboardData } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { Badge } from "../common/Badge";
import { Tooltip } from "../common/Tooltip";
import { EmptyState } from "../common/EmptyState";

interface Props {
  data: DashboardData;
  board: BoardData;
  onOpenBranch: (row: BranchFlowRow) => void;
  onCopy: (text: string, label: string) => void;
  onBulkDeleteLocal: (branches: string[]) => void;
}

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

/** Reasons a branch is a cleanup candidate (i18n keys). */
function cleanupReasons(row: BranchFlowRow): string[] {
  const reasons: string[] = [];
  if (row.branchName.startsWith("backup/") || row.branchName.startsWith("archive/")) {
    reasons.push("backup");
  }
  if (row.stale && !row.taskId) {
    reasons.push("staleNoTask");
  }
  if (row.info.existsLocal && row.info.commitsAheadMain === 0) {
    reasons.push("noCommits");
  }
  if (row.info.existsLocal && !row.info.existsRemote && row.stale) {
    reasons.push("localOnlyOld");
  }
  return reasons;
}

/**
 * Cleanup Assistant — lists branches that look removable, with reasons. It never
 * deletes automatically; the user reviews and selects.
 */
export function CleanupView(props: Props) {
  const { data, board } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = data.branchFlow
    .map((row) => ({ row, reasons: cleanupReasons(row) }))
    .filter((c) => c.reasons.length > 0 && c.row.branchName !== data.mainBranch && !c.row.info.current);

  if (candidates.length === 0) {
    return <EmptyState title={t("cleanup.empty")} hint={t("cleanup.emptyHint")} />;
  }

  const toggle = (name: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const selectAll = () => setSelected(new Set(candidates.map((c) => c.row.branchName)));
  const clear = () => setSelected(new Set());

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cleanup.note")}</p>

      <div className="bb-bulkbar">
        <span>{t("branchFlow.selected", { count: selected.size })}</span>
        <button className="bb-btn ghost sm" onClick={selectAll}>{t("branchFlow.selectAll")}</button>
        <button className="bb-btn ghost sm" onClick={clear}>{t("branchFlow.clearSelection")}</button>
        <div className="bb-topbar-spacer" />
        <button
          className="bb-btn ghost sm"
          disabled={selected.size === 0}
          onClick={() => props.onCopy(Array.from(selected).join("\n"), t("branchFlow.listCopied"))}
        >
          {t("branchFlow.copyList")}
        </button>
        <button
          className="bb-btn danger sm"
          disabled={selected.size === 0}
          onClick={() => props.onBulkDeleteLocal(Array.from(selected))}
        >
          {t("branchFlow.bulkDeleteLocal")}
        </button>
      </div>

      <div className="bb-flow-list">
        {candidates.map(({ row, reasons }) => {
          const user = board.users.find((u) => u.id === row.assignedUserId);
          return (
            <div className="bb-flow-card" key={row.branchName}>
              <div className="bb-flow-top">
                <input
                  type="checkbox"
                  className="bb-flow-check"
                  checked={selected.has(row.branchName)}
                  onChange={() => toggle(row.branchName)}
                  aria-label={row.branchName}
                />
                <Tooltip text={row.branchName}>
                  <code className="bb-flow-branch" onClick={() => props.onCopy(row.branchName, t("cc.flow.branchCopied"))}>
                    {row.branchName}
                  </code>
                </Tooltip>
                <div className="bb-flow-badges">
                  {reasons.map((r) => (
                    <Tooltip key={r} text={t(`cleanup.reasonHelp.${r}`)}>
                      <Badge tone="medium">{t(`cleanup.reason.${r}`)}</Badge>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <div className="bb-flow-foot">
                {user && (
                  <span className="bb-avatar sm" style={{ background: user.color }} title={user.name}>
                    {user.avatarText}
                  </span>
                )}
                <span>{row.info.existsLocal ? "local" : ""}{row.info.existsLocal && row.info.existsRemote ? " · " : ""}{row.info.existsRemote ? "origin" : ""}</span>
                <span>{relativeTime(row.info.lastCommitAt, timeLabels())}</span>
                <div className="bb-topbar-spacer" />
                <button className="bb-btn ghost sm" onClick={() => props.onOpenBranch(row)}>{t("branchFlow.more")}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
