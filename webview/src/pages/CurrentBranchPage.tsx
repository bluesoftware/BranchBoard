import { useEffect, useState } from "react";
import { AppConfig, BoardData, BoardEvent, BranchDetail, BranchFlowRow, ChecklistItem, DashboardData, GitInfo } from "../types";
import { t } from "../i18n";
import { formatDate, relativeTime } from "../utils";
import { AppView } from "../components/navigation/MainNav";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, BadgeTone } from "../components/common/Badge";
import { Tooltip } from "../components/common/Tooltip";
import { HelpIcon } from "../components/common/HelpIcon";
import { EmptyState } from "../components/common/EmptyState";
import { FileIcon } from "../components/Icons";
import { WorkLog } from "../components/task/WorkLog";
import { Checklist } from "../components/task/Checklist";
import { Comments } from "../components/task/Comments";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  dashboard: DashboardData | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  page: AppView;
  branchDetail: BranchDetail | null;
  events: BoardEvent[];
  onNavigate: (view: AppView) => void;
  onSaveChecklist: (taskId: string, items: ChecklistItem[]) => void;
  onAddComment: (taskId: string, text: string) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRequestBranchDetail: (branchName: string) => void;
  onOpenTask: (taskId: string) => void;
  onPush: (branchName: string) => void;
  onDeployDev: (taskId: string) => void;
  onFinish: (taskId: string) => void;
  onMoveTask: (taskId: string, columnId: string) => void;
  onCreateTask: (payload: { title: string; branchName: string; columnId: string }) => void;
  onLinkBranch: (taskId: string, branchName: string) => void;
  onCopy: (text: string, label: string) => void;
  onCopyAiPrompt: (taskId: string) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (branchName: string, path: string) => void;
  onCheckout: (branchName: string) => void;
  onUpdateFromMain: () => void;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  A: "success",
  M: "warning",
  D: "critical",
  R: "info",
  C: "info",
};

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

function bucketOf(name: string): "in-progress" | "review" | "testing" | "done" | "other" {
  const s = name.toLowerCase();
  if (/zrobione|gotowe|done/.test(s)) return "done";
  if (/test|do.?testu|qa/.test(s)) return "testing";
  if (/review|przegl|do.?zatwierdz/.test(s)) return "review";
  if (/in.?progress|w.?toku|w.?trakcie/.test(s)) return "in-progress";
  return "other";
}

export function CurrentBranchPage(props: Props) {
  const { board, git, dashboard, currentUserId } = props;
  const branch = git?.currentBranch ?? null;
  const [linkTaskId, setLinkTaskId] = useState("");

  useEffect(() => {
    props.onRefresh();
    if (branch) {
      props.onRequestBranchDetail(branch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const header = (
    <PageHeader
      page={props.page}
      board={board}
      git={git}
      appConfig={props.appConfig}
      onNavigate={props.onNavigate}
      onOpenSettings={props.onOpenSettings}
      onRefresh={() => {
        props.onRefresh();
        if (branch) props.onRequestBranchDetail(branch);
      }}
    />
  );

  if (!git || !git.isRepo) {
    return (
      <div className="bb-page">
        {header}
        <div className="bb-page-body">
          <EmptyState title={t("git.noRepo")} hint={t("cc.noRepoHint")} />
        </div>
      </div>
    );
  }

  const isMain = !!branch && branch === git.mainBranch;
  const row: BranchFlowRow | undefined = dashboard?.branchFlow.find((r) => r.branchName === branch);
  const task = board.tasks.find((x) => x.branchName === branch) ?? null;
  const commits =
    props.branchDetail && props.branchDetail.branchName === branch ? props.branchDetail.commits : [];
  const changedFiles =
    props.branchDetail && props.branchDetail.branchName === branch ? props.branchDetail.files : row?.info.changedFiles?.map((p) => ({ path: p, status: "M", additions: 0, deletions: 0 })) ?? [];

  /* ---------- ON MAIN ---------- */
  if (isMain) {
    return (
      <div className="bb-page">
        {header}
        <div className="bb-page-body">
          <div className="bb-card bb-context">
            <div className="bb-cb-state-title">{t("currentBranch.onMainTitle")}</div>
            <div className="bb-muted">{t("currentBranch.onMainDescription")}</div>
            <div className="bb-git-actions">
              <button className="bb-btn" onClick={() => props.onNavigate("board")}>
                {t("currentBranch.openBoard")}
              </button>
              <button className="bb-btn" onClick={() => props.onNavigate("branchMap")}>
                {t("currentBranch.openBranchMap")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Suggested next step ---------- */
  const colName = task ? board.columns.find((c) => c.id === task.columnId)?.name ?? "" : "";
  const bucket = bucketOf(colName);
  let stepKey = "currentBranch.step.ok";
  if (!task) stepKey = "currentBranch.step.noTask";
  else if (git.hasUncommittedChanges) stepKey = "currentBranch.step.dirty";
  else if (row && !row.info.existsRemote && row.info.commitsAheadMain > 0) stepKey = "currentBranch.step.notPushed";
  else if (row && (row.riskLevel === "high" || row.riskLevel === "critical")) stepKey = "currentBranch.step.highRisk";
  else if ((bucket === "review" || bucket === "testing") && row && !row.info.deployedToDev) stepKey = "currentBranch.step.reviewNoDev";
  else if (row && row.info.readyToMerge) stepKey = "currentBranch.step.readyMerge";
  else if (bucket === "in-progress") stepKey = "currentBranch.step.toReview";

  const transferCommands = [
    "# Przenieś bieżące zmiany na inny branch (bezpiecznie):",
    "git stash",
    "git checkout <docelowy-branch>",
    "git stash pop",
    "",
    "# Albo zrób patch:",
    "git diff > branchboard-transfer.patch",
  ].join("\n");

  return (
    <div className="bb-page">
      {header}
      <div className="bb-page-body bb-cb">
        {/* Branch status header */}
        <div className="bb-card bb-context">
          <div className="bb-cb-head">
            <code className="bb-cb-branch">⎇ {branch}</code>
            <HelpIcon text={t("tooltips.currentBranch.main")} />
            {row && (
              <Tooltip text={t("tooltips.currentBranch.aheadBehind")}>
                <span className="bb-cb-ab">↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}</span>
              </Tooltip>
            )}
            {row && (row.riskLevel === "high" || row.riskLevel === "critical") && (
              <Badge tone={row.riskLevel === "critical" ? "critical" : "high"}>
                {t(`branchMap.risk${row.riskLevel === "critical" ? "Critical" : "High"}`)}
              </Badge>
            )}
            {row?.info.deployedToDev && <Badge tone="info">DEV</Badge>}
          </div>
          {git.hasUncommittedChanges && <div className="bb-callout warn">{t("currentBranch.dirtyTreeWarning")}</div>}
          {row && !row.info.existsRemote && (
            <div className="bb-callout info">{t("currentBranch.branchNotPushed")}</div>
          )}
          <div className="bb-cb-step">
            <strong>{t("currentBranch.nextStep")}:</strong> {t(stepKey)}
          </div>
        </div>

        {/* No task → empty state */}
        {!task && (
          <div className="bb-card">
            <div className="bb-cb-state-title">{t("currentBranch.noTaskTitle")}</div>
            <div className="bb-muted">{t("currentBranch.noTaskDescription")}</div>
            <div className="bb-git-actions">
              <button
                className="bb-btn accent"
                onClick={() =>
                  branch &&
                  props.onCreateTask({
                    title: branch.replace(/^feature\//, "").replace(/[-_]/g, " "),
                    branchName: branch,
                    columnId: board.columns.find((c) => /in.?progress|w.?tok/i.test(c.name))?.id ?? board.columns[0]?.id ?? "todo",
                  })
                }
              >
                {t("currentBranch.createTaskFromBranch")}
              </button>
            </div>
            <div className="bb-comment-add">
              <select className="bb-input" value={linkTaskId} onChange={(e) => setLinkTaskId(e.target.value)}>
                <option value="">{t("currentBranch.linkPick")}</option>
                {board.tasks
                  .filter((x) => !x.branchName)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
              <button
                className="bb-btn"
                disabled={!linkTaskId || !branch}
                onClick={() => branch && props.onLinkBranch(linkTaskId, branch)}
              >
                {t("currentBranch.linkBranchToTask")}
              </button>
            </div>
          </div>
        )}

        {/* Has task → history + summary + flow + checklist + comments */}
        {task && (
          <WorkLog task={task} events={props.events} branchCommits={commits} users={board.users} />
        )}
        {task && (
          <div className="bb-card">
            <div className="bb-cb-head">
              <span className="bb-cb-tasktitle">{task.title}</span>
              {task.ai?.createdByAi && <Badge tone="info">AI</Badge>}
              <button className="bb-btn ghost sm" onClick={() => props.onOpenTask(task.id)}>
                {t("currentBranch.openTask")}
              </button>
            </div>
            {task.description && <div className="bb-muted">{task.description}</div>}
            <div className="bb-cb-meta">
              <span>{t("task.status")}: <strong>{colName || task.status}</strong></span>
              <span>{t("task.created")}: {formatDate(task.createdAt)}</span>
              <span>{t("task.updated")}: {relativeTime(task.updatedAt, timeLabels())}</span>
            </div>

            {/* Task flow pipeline */}
            <div className="bb-section-head" style={{ marginTop: 8 }}>
              <span className="bb-section-title">{t("currentBranch.taskFlow")}</span>
              <HelpIcon text={t("tooltips.currentBranch.taskFlow")} />
            </div>
            <div className="bb-flow-stages">
              {[...board.columns]
                .sort((a, b) => a.position - b.position)
                .map((c) => {
                  const isCurrent = c.id === task.columnId;
                  const done = bucketOf(c.name) === "done";
                  return (
                    <button
                      key={c.id}
                      className={`bb-flow-stage ${isCurrent ? "current" : ""}`}
                      onClick={() => {
                        if (isCurrent) return;
                        if (done) props.onFinish(task.id);
                        else props.onMoveTask(task.id, c.id);
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {task && (
          <Checklist items={task.checklist ?? []} onChange={(items) => props.onSaveChecklist(task.id, items)} />
        )}
        {task && (
          <Comments comments={task.comments} users={board.users} onAdd={(text) => props.onAddComment(task.id, text)} />
        )}

        {/* Actions */}
        <div className="bb-card">
          <div className="bb-section-head">
            <span className="bb-section-title">{t("currentBranch.actions")}</span>
          </div>
          <div className="bb-git-actions">
            <Tooltip text={t("tooltips.git.push")}>
              <button className="bb-btn" disabled={!branch} onClick={() => branch && props.onPush(branch)}>
                {t("currentBranch.pushBranch")}
              </button>
            </Tooltip>
            <Tooltip text={t("tooltips.deploy.dev")}>
              <button
                className="bb-btn"
                disabled={!task || !props.appConfig.policy.devDeployCommand}
                onClick={() => task && props.onDeployDev(task.id)}
              >
                {t("currentBranch.deployToDev")}
              </button>
            </Tooltip>
            <button className="bb-btn" disabled={!branch} onClick={() => branch && props.onCopy(branch, t("toast.branchNameCopied"))}>
              {t("currentBranch.copyBranchName")}
            </button>
            <Tooltip text={t("tooltips.ai.copyPrompt")}>
              <button className="bb-btn" disabled={!task} onClick={() => task && props.onCopyAiPrompt(task.id)}>
                {t("currentBranch.copyAiPrompt")}
              </button>
            </Tooltip>
            <Tooltip text={t("tooltips.git.merge")}>
              <button className="bb-btn" onClick={props.onUpdateFromMain}>
                {t("currentBranch.updateBranchFromMain")} ({props.appConfig.policy.updateBranchStrategy})
              </button>
            </Tooltip>
            <Tooltip text={t("tooltips.currentBranch.transferChanges")}>
              <button className="bb-btn" onClick={() => props.onCopy(transferCommands, t("currentBranch.transferCopied"))}>
                {t("currentBranch.copyTransferCommands")}
              </button>
            </Tooltip>
            {task && (
              <button className="bb-btn accent full" disabled={!branch} onClick={() => props.onFinish(task.id)} title={t("task.finishHint")}>
                {t("currentBranch.finishTask")}
              </button>
            )}
          </div>
        </div>

        {/* Changed files */}
        <div className="bb-card">
          <div className="bb-section-head">
            <span className="bb-section-title">{t("currentBranch.changedFiles")}</span>
            <HelpIcon text={t("tooltips.currentBranch.changedFiles")} />
            {changedFiles.length > 0 && <span className="bb-count">{changedFiles.length}</span>}
          </div>
          {changedFiles.length === 0 ? (
            <div className="bb-muted small">{t("currentBranch.noChangedFiles")}</div>
          ) : (
            <ul className="bb-files-filelist">
              {changedFiles.map((f) => (
                <li key={f.path} className="bb-file-row">
                  <span className={`bb-badge ${STATUS_TONE[f.status] ?? "tone-neutral"}`}>{f.status}</span>
                  <span className="bb-file-path" onClick={() => props.onOpenFile(f.path)} title={t("task.files.open")}>
                    {f.path}
                  </span>
                  {branch && (
                    <button className="bb-btn ghost sm" onClick={() => props.onOpenDiff(branch, f.path)}>
                      {t("task.files.diff")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Commits */}
        <div className="bb-card">
          <div className="bb-section-head">
            <span className="bb-section-title">{t("currentBranch.commits")}</span>
            {commits.length > 0 && <span className="bb-count">{commits.length}</span>}
          </div>
          {commits.length === 0 ? (
            <div className="bb-muted small">{t("currentBranch.noCommits")}</div>
          ) : (
            <ul className="bb-commit-list">
              {commits.map((c) => (
                <li key={c.hash} className="bb-commit-row">
                  <code
                    className="bb-commit-hash"
                    title={t("task.files.open")}
                    onClick={() => props.onCopy(c.hash, c.shortHash)}
                  >
                    {c.shortHash}
                  </code>
                  <span className="bb-commit-subject">{c.subject}</span>
                  <span className="bb-commit-meta">{c.author} · {formatDate(c.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
