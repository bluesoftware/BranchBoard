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
import { BranchIcon, CopyIcon, FinishIcon, PushIcon, RefreshIcon, SparkleIcon } from "../components/Icons";
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

const RISK_LABEL_KEY: Record<string, string> = {
  low: "branchMap.riskLow",
  medium: "branchMap.riskMedium",
  high: "branchMap.riskHigh",
  critical: "branchMap.riskCritical",
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
      currentUserId={currentUserId}
      onNavigate={props.onNavigate}
      onOpenSettings={props.onOpenSettings}
      onRefresh={() => {
        props.onRefresh();
        if (branch) props.onRequestBranchDetail(branch);
      }}
      onOpenTask={props.onOpenTask}
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

  const policy = props.appConfig.policy;
  const sortedColumns = [...board.columns].sort((a, b) => a.position - b.position);
  const assignee = task ? board.users.find((u) => u.id === task.assignedUserId) ?? null : null;
  const checklistDone = task?.checklist?.filter((item) => item.done).length ?? 0;
  const checklistTotal = task?.checklist?.length ?? 0;
  const hasRemote = row?.info.existsRemote ?? false;
  const canDeployDev = !!task && !!policy.devDeployCommand;
  const branchTitle = branch ?? "";
  const riskTone = row?.riskLevel ?? "low";
  const riskKey = RISK_LABEL_KEY[riskTone] ?? "branchMap.riskLow";

  const statusPills = (
    <div className="bb-cb-status-pills">
      {row && (
        <Tooltip text={t("tooltips.currentBranch.aheadBehind")} side="bottom">
          <Badge tone={row.info.commitsBehindMain > 0 ? "warning" : "info"}>
            ↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}
          </Badge>
        </Tooltip>
      )}
      {row && <Badge tone={riskTone}>{t(riskKey)}</Badge>}
      <Badge tone={git.hasUncommittedChanges ? "warning" : "success"}>
        {git.hasUncommittedChanges ? t("currentBranch.safety.dirtyTree") : t("currentBranch.safety.cleanTree")}
      </Badge>
      {row && (
        <Badge tone={hasRemote ? "success" : "warning"}>
          {hasRemote ? t("currentBranch.safety.remoteSynced") : t("currentBranch.safety.remoteMissing")}
        </Badge>
      )}
      {row?.info.deployedToDev && <Badge tone="info">DEV</Badge>}
    </div>
  );

  const actionBar = (
    <div className="bb-cb-actionbar">
      <Tooltip text={t("tooltips.git.push")} side="bottom">
        <button className="bb-btn" disabled={!branch} onClick={() => branch && props.onPush(branch)}>
          <PushIcon />
          {t("currentBranch.pushBranch")}
        </button>
      </Tooltip>
      {task && (
        <button className="bb-btn accent" disabled={!branch} onClick={() => props.onFinish(task.id)} title={t("task.finishHint")}>
          <FinishIcon />
          {t("currentBranch.finishTask")}
        </button>
      )}
      <Tooltip text={t("tooltips.deploy.dev")} side="bottom">
        <button className="bb-btn" disabled={!canDeployDev} onClick={() => task && props.onDeployDev(task.id)}>
          {t("currentBranch.deployToDev")}
        </button>
      </Tooltip>
      <button className="bb-btn" disabled={!branch} onClick={() => branch && props.onCopy(branch, t("toast.branchNameCopied"))}>
        <CopyIcon />
        {t("currentBranch.copyBranchName")}
      </button>
      <Tooltip text={t("tooltips.ai.copyPrompt")} side="bottom">
        <button className="bb-btn" disabled={!task} onClick={() => task && props.onCopyAiPrompt(task.id)}>
          <SparkleIcon />
          {t("currentBranch.copyAiPrompt")}
        </button>
      </Tooltip>
      <Tooltip text={t("tooltips.git.merge")} side="bottom">
        <button className="bb-btn" onClick={props.onUpdateFromMain}>
          <RefreshIcon />
          {t("currentBranch.updateBranchFromMain")} ({policy.updateBranchStrategy})
        </button>
      </Tooltip>
      <Tooltip text={t("tooltips.currentBranch.transferChanges")} side="bottom">
        <button className="bb-btn" onClick={() => props.onCopy(transferCommands, t("currentBranch.transferCopied"))}>
          {t("currentBranch.copyTransferCommands")}
        </button>
      </Tooltip>
    </div>
  );

  const changedFilesCard = (
    <div className="bb-card bb-cb-list-card">
      <div className="bb-section-head">
        <span className="bb-section-title">{t("currentBranch.changedFiles")}</span>
        <HelpIcon text={t("tooltips.currentBranch.changedFiles")} />
        {changedFiles.length > 0 && <span className="bb-count">{changedFiles.length}</span>}
      </div>
      {changedFiles.length === 0 ? (
        <div className="bb-muted small">{t("currentBranch.noChangedFiles")}</div>
      ) : (
        <ul className="bb-files-filelist bb-cb-scroll-list">
          {changedFiles.map((f) => (
            <li key={f.path} className="bb-file-row">
              <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>{f.status}</Badge>
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
  );

  const commitsCard = (
    <div className="bb-card bb-cb-list-card">
      <div className="bb-section-head">
        <span className="bb-section-title">{t("currentBranch.commits")}</span>
        {commits.length > 0 && <span className="bb-count">{commits.length}</span>}
      </div>
      {commits.length === 0 ? (
        <div className="bb-muted small">{t("currentBranch.noCommits")}</div>
      ) : (
        <ul className="bb-commit-list bb-cb-scroll-list">
          {commits.map((c) => (
            <li key={c.hash} className="bb-commit-row">
              <code className="bb-commit-hash" title={t("task.files.open")} onClick={() => props.onCopy(c.hash, c.shortHash)}>
                {c.shortHash}
              </code>
              <span className="bb-commit-subject">{c.subject}</span>
              <span className="bb-commit-meta">{c.author} · {formatDate(c.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="bb-page">
      {header}
      <div className="bb-page-body bb-cb bb-cb-page">
        <section className="bb-cb-hero">
          <div className="bb-cb-hero-main">
            <div className="bb-cb-branch-block">
              <div className="bb-section-head">
                <span className="bb-section-title">{t("currentBranch.branchLabel")}</span>
                <HelpIcon text={t("tooltips.currentBranch.main")} />
              </div>
              <button
                className="bb-cb-branch-chip"
                disabled={!branch}
                title={branchTitle}
                onClick={() => branch && props.onCopy(branch, t("toast.branchNameCopied"))}
              >
                <BranchIcon size={14} />
                <code>{branchTitle}</code>
              </button>
            </div>
            {statusPills}
          </div>
          <div className="bb-cb-next-row">
            <div className="bb-cb-next-card">
              <span className="bb-cb-next-label">{t("currentBranch.nextStep")}</span>
              <span className="bb-cb-next-text">{t(stepKey)}</span>
            </div>
            {actionBar}
          </div>
        </section>

        {!task && (
          <div className="bb-cb-empty-grid">
            <div className="bb-card bb-cb-empty-card">
              <div>
                <div className="bb-cb-state-title">{t("currentBranch.noTaskTitle")}</div>
                <div className="bb-muted">{t("currentBranch.noTaskDescription")}</div>
              </div>
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
              <div className="bb-cb-link-row">
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
            <aside className="bb-cb-side">
              <div className="bb-card bb-cb-safety-card">
                <div className="bb-section-head">
                  <span className="bb-section-title">{t("currentBranch.branchHealth")}</span>
                </div>
                <div className="bb-cb-safety-list">
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.workingTree")}</span>
                    <Badge tone={git.hasUncommittedChanges ? "warning" : "success"}>
                      {git.hasUncommittedChanges ? t("currentBranch.safety.dirtyTree") : t("currentBranch.safety.cleanTree")}
                    </Badge>
                  </div>
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.remote")}</span>
                    <Badge tone={hasRemote ? "success" : "warning"}>
                      {hasRemote ? t("currentBranch.safety.remoteSynced") : t("currentBranch.safety.remoteMissing")}
                    </Badge>
                  </div>
                </div>
              </div>
              {changedFilesCard}
              {commitsCard}
            </aside>
          </div>
        )}

        {task && (
          <div className="bb-cb-layout">
            <main className="bb-cb-main">
              <section className="bb-card bb-cb-task-panel">
                <div className="bb-cb-task-top">
                  <button
                    className={`bb-check ${task.status === "done" ? "checked" : ""}`}
                    onClick={() => props.onFinish(task.id)}
                    title={t("currentBranch.finishTask")}
                  >
                    {task.status === "done" ? "✓" : ""}
                  </button>
                  <div className="bb-cb-task-copy">
                    <div className="bb-cb-task-kicker">
                      <span>{t("currentBranch.taskLinked")}</span>
                      {task.ai?.createdByAi && <Badge tone="info">AI</Badge>}
                      {assignee && (
                        <span className="bb-avatar small" style={{ background: assignee.color }} title={assignee.name}>
                          {assignee.avatarText}
                        </span>
                      )}
                    </div>
                    <h2 className="bb-cb-task-title">{task.title}</h2>
                    {task.description && <p className="bb-cb-task-desc">{task.description}</p>}
                  </div>
                  <button className="bb-btn ghost sm" onClick={() => props.onOpenTask(task.id)}>
                    {t("currentBranch.openTask")}
                  </button>
                </div>

                <div className="bb-cb-meta-grid">
                  <div className="bb-cb-meta-tile">
                    <span>{t("currentBranch.currentStatus")}</span>
                    <strong>{colName || task.status}</strong>
                  </div>
                  <div className="bb-cb-meta-tile">
                    <span>{t("currentBranch.updatedShort")}</span>
                    <strong>{relativeTime(task.updatedAt, timeLabels())}</strong>
                  </div>
                  <div className="bb-cb-meta-tile">
                    <span>{t("task.checklist")}</span>
                    <strong>{checklistDone}/{checklistTotal}</strong>
                  </div>
                  <div className="bb-cb-meta-tile">
                    <span>{t("task.comments")}</span>
                    <strong>{task.comments.length}</strong>
                  </div>
                </div>

                <div className="bb-section-head">
                  <span className="bb-section-title">{t("currentBranch.taskFlow")}</span>
                  <HelpIcon text={t("tooltips.currentBranch.taskFlow")} />
                </div>
                <div className="bb-flow-stages">
                  {sortedColumns.map((c) => {
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
              </section>

              <section className="bb-card bb-cb-collab-card">
                <div className="bb-section-head">
                  <span className="bb-section-title">{t("currentBranch.checklistAndDiscussion")}</span>
                </div>
                <div className="bb-cb-collab-grid">
                  <Checklist items={task.checklist ?? []} onChange={(items) => props.onSaveChecklist(task.id, items)} />
                  <Comments
                    comments={task.comments}
                    users={board.users}
                    currentUserId={currentUserId}
                    onAdd={(text) => props.onAddComment(task.id, text)}
                  />
                </div>
              </section>

              <WorkLog task={task} events={props.events} branchCommits={commits} users={board.users} />
            </main>

            <aside className="bb-cb-side">
              <div className="bb-card bb-cb-safety-card">
                <div className="bb-section-head">
                  <span className="bb-section-title">{t("currentBranch.branchHealth")}</span>
                </div>
                {git.hasUncommittedChanges && <div className="bb-callout warn">{t("currentBranch.dirtyTreeWarning")}</div>}
                {row && !row.info.existsRemote && <div className="bb-callout info">{t("currentBranch.branchNotPushed")}</div>}
                <div className="bb-cb-safety-list">
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.workingTree")}</span>
                    <Badge tone={git.hasUncommittedChanges ? "warning" : "success"}>
                      {git.hasUncommittedChanges ? t("currentBranch.safety.dirtyTree") : t("currentBranch.safety.cleanTree")}
                    </Badge>
                  </div>
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.remote")}</span>
                    <Badge tone={hasRemote ? "success" : "warning"}>
                      {hasRemote ? t("currentBranch.safety.remoteSynced") : t("currentBranch.safety.remoteMissing")}
                    </Badge>
                  </div>
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.mergePolicy")}</span>
                    <Badge tone={policy.allowDirectMergeToMain ? "warning" : "success"}>
                      {policy.allowDirectMergeToMain ? t("currentBranch.safety.mergeAllowed") : t("currentBranch.safety.mergeDisabled")}
                    </Badge>
                  </div>
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.cleanBeforeFinish")}</span>
                    <Badge tone={policy.requireCleanWorkingTreeBeforeFinish ? "success" : "warning"}>
                      {policy.requireCleanWorkingTreeBeforeFinish ? t("currentBranch.safety.required") : t("currentBranch.safety.notRequired")}
                    </Badge>
                  </div>
                  <div className="bb-cb-safety-item">
                    <span>{t("currentBranch.safety.preFinishCommand")}</span>
                    <Badge tone={policy.runCommandBeforeFinish ? "info" : "neutral"}>
                      {policy.runCommandBeforeFinish ? t("currentBranch.safety.configured") : t("currentBranch.safety.notConfigured")}
                    </Badge>
                  </div>
                </div>
              </div>
              {changedFilesCard}
              {commitsCard}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
