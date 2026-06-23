import { useEffect, useRef, useState } from "react";
import {
  AIAgentLogPayload,
  AIAgentRunKind,
  AppConfig,
  BoardData,
  BoardEvent,
  BoardTask,
  BranchDetail,
  BranchFlowRow,
  ChecklistItem,
  CursorSubAgentInfo,
  DashboardData,
  GitInfo,
  AiCostDecisionPayload,
  AiCostDecisionRequestPayload,
} from "../types";
import { t } from "../i18n";
import { formatDate, relativeTime } from "../utils";
import { richTextToPlainText } from "../richText";
import { guardTaskMove, hasIncompleteSubtasks, isTaskInProduction } from "../productionGuards";
import { AppView } from "../components/navigation/MainNav";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, BadgeTone } from "../components/common/Badge";
import { Tooltip } from "../components/common/Tooltip";
import { HelpIcon } from "../components/common/HelpIcon";
import { EmptyState } from "../components/common/EmptyState";
import { Tabs, TabItem } from "../components/common/Tabs";
import { BranchIcon, CopyIcon, FinishIcon, PushIcon, RefreshIcon, SparkleIcon } from "../components/Icons";
import { WorkLog } from "../components/task/WorkLog";
import { Checklist } from "../components/task/Checklist";
import { Comments } from "../components/task/Comments";
import { AiAgentChatPanel } from "../components/task/aiChat/AiAgentChatPanel";

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
  // --- AI Agent (shared with TaskDrawer via <AiAgentPanel>, no duplicated logic) ---
  cursorAgents: CursorSubAgentInfo[];
  aiAgentLogs: Record<string, AIAgentLogPayload[]>;
  aiAgentRunning: Record<string, AIAgentRunKind | undefined>;
  aiCostDecisions: Record<string, AiCostDecisionPayload>;
  onRequestAiCostDecision: (taskId: string, req: Omit<AiCostDecisionRequestPayload, "taskId">) => void;
  onSaveTask: (taskId: string, patch: Partial<BoardTask>) => void;
  onGenerateAIAgentPrompt: (taskId: string) => void;
  onRunAIAgentPlan: (taskId: string) => void;
  onRunAIAgent: (taskId: string) => void;
  onRunAIAgentReview: (taskId: string) => void;
  onAcceptAIAgentResult: (taskId: string) => void;
  onRejectAIAgentResult: (taskId: string) => void;
  onCancelAIAgent: (taskId: string) => void;
  onAiPromptCopied: (taskId: string) => void;
  onRefreshCursorAgents: () => void;
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
  if (/zrobione|gotowe|done|produkc/.test(s)) return "done";
  if (/test|do.?testu|qa/.test(s)) return "testing";
  if (/review|przegl|do.?zatwierdz/.test(s)) return "review";
  if (/in.?progress|w.?toku|w.?trakcie/.test(s)) return "in-progress";
  return "other";
}

/** One actionable button used in the top "primary CTA / secondary / more" row. */
interface ActionDescriptor {
  id: string;
  label: string;
  icon?: JSX.Element;
  tooltip?: string;
  disabled?: boolean;
  accent?: boolean;
  onClick: () => void;
}

export function CurrentBranchPage(props: Props) {
  const { board, git, dashboard, currentUserId } = props;
  const branch = git?.currentBranch ?? null;
  const [linkTaskId, setLinkTaskId] = useState("");
  const [activeTab, setActiveTab] = useState<string>("files");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    props.onRefresh();
    if (branch) {
      props.onRequestBranchDetail(branch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isMain = !!branch && branch === git?.mainBranch;
  const row: BranchFlowRow | undefined = dashboard?.branchFlow.find((r) => r.branchName === branch);
  const task = board.tasks.find((x) => x.branchName === branch) ?? null;
  const changedFiles =
    props.branchDetail && props.branchDetail.branchName === branch
      ? props.branchDetail.files
      : row?.info.changedFiles?.map((p) => ({ path: p, status: "M", additions: 0, deletions: 0 })) ?? [];

  // Default tab for the "Szczegóły techniczne" card — recomputed whenever the
  // linked task (or its absence) changes, but the user's manual tab choice is
  // otherwise respected for the rest of the session on this branch.
  useEffect(() => {
    if (isMain) return;
    if (!task) {
      setActiveTab("files");
      return;
    }
    const aiCol = board.columns.find((c) => c.gitStage === "ai-agent");
    if (task.aiAgents?.enabled || (aiCol && task.columnId === aiCol.id)) {
      setActiveTab("aiAgent");
    } else if (changedFiles.length > 0) {
      setActiveTab("files");
    } else if (row?.info.existsRemote) {
      setActiveTab("safety");
    } else {
      setActiveTab("files");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, isMain]);

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

  /* ---------- ON MAIN / DEFAULT BRANCH ---------- */
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

  /* ---------- Suggested next step (single state-driven recommendation) ---------- */
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
  const productionColumn =
    sortedColumns.find((c) => c.gitStage === "production" || /produkc|production|zrobione|done/i.test(`${c.id} ${c.name}`)) ??
    null;
  const assignee = task ? board.users.find((u) => u.id === task.assignedUserId) ?? null : null;
  const aiAgentDef =
    task?.aiAgents?.selectedAgentIds?.[0]
      ? props.appConfig.aiAgents.find((agent) => agent.id === task.aiAgents?.selectedAgentIds?.[0])
      : null;
  const descriptionPreview = task ? richTextToPlainText(task.description) : "";
  const checklistDone = task?.checklist?.filter((item) => item.done).length ?? 0;
  const checklistTotal = task?.checklist?.length ?? 0;
  const productionChecklistLocked = !!task && isTaskInProduction(board, task);
  const hasRemote = row?.info.existsRemote ?? false;
  const canDeployDev = !!task && !!policy.devDeployCommand;
  const branchTitle = branch ?? "";
  const riskTone = row?.riskLevel ?? "low";
  const riskKey = RISK_LABEL_KEY[riskTone] ?? "branchMap.riskLow";
  const finishAllowed = !task || !productionColumn || !hasIncompleteSubtasks(task);

  /* ---------- Action plan: one primary CTA + max 2 secondary + "Więcej" ---------- */
  const aPush: ActionDescriptor = {
    id: "push",
    label: t("currentBranch.pushBranch"),
    icon: <PushIcon />,
    tooltip: t("tooltips.git.push"),
    disabled: !branch,
    onClick: () => branch && props.onPush(branch),
  };
  const aFinish: ActionDescriptor | null = task
    ? {
        id: "finish",
        label: t("currentBranch.finishTask"),
        icon: <FinishIcon />,
        tooltip: finishAllowed ? t("task.finishHint") : t("task.production.productionChecklistIncomplete"),
        disabled: !branch || !finishAllowed,
        accent: true,
        onClick: () => task && props.onFinish(task.id),
      }
    : null;
  const aDeployDev: ActionDescriptor | null = task
    ? {
        id: "deployDev",
        label: t("currentBranch.deployToDev"),
        tooltip: t("tooltips.deploy.dev"),
        disabled: !canDeployDev,
        onClick: () => task && props.onDeployDev(task.id),
      }
    : null;
  const aReviewChanges: ActionDescriptor = {
    id: "reviewChanges",
    label: t("currentBranch.cta.reviewChanges"),
    tooltip: t("tooltips.currentBranch.changedFiles"),
    onClick: () => setActiveTab("files"),
  };
  const aOpenAiAgent: ActionDescriptor | null = task
    ? {
        id: "openAiAgent",
        label: t("currentBranch.cta.openAiAgent"),
        icon: <SparkleIcon />,
        tooltip: t("tooltips.aiAgent.main"),
        onClick: () => setActiveTab("aiAgent"),
      }
    : null;
  const aOpenTask: ActionDescriptor | null = task
    ? { id: "openTask", label: t("currentBranch.openTask"), onClick: () => props.onOpenTask(task.id) }
    : null;
  const aCopyBranch: ActionDescriptor = {
    id: "copyBranch",
    label: t("currentBranch.copyBranchName"),
    icon: <CopyIcon />,
    disabled: !branch,
    onClick: () => branch && props.onCopy(branch, t("toast.branchNameCopied")),
  };
  const aCopyAiPromptLegacy: ActionDescriptor | null = task
    ? {
        id: "copyAiPromptLegacy",
        label: t("currentBranch.copyAiPrompt"),
        icon: <SparkleIcon />,
        tooltip: t("tooltips.ai.copyPrompt"),
        onClick: () => task && props.onCopyAiPrompt(task.id),
      }
    : null;
  const aUpdateFromMain: ActionDescriptor = {
    id: "updateFromMain",
    label: `${t("currentBranch.updateBranchFromMain")} (${policy.updateBranchStrategy})`,
    icon: <RefreshIcon />,
    tooltip: t("tooltips.git.merge"),
    onClick: props.onUpdateFromMain,
  };
  const aCopyTransfer: ActionDescriptor = {
    id: "copyTransfer",
    label: t("currentBranch.copyTransferCommands"),
    tooltip: t("tooltips.currentBranch.transferChanges"),
    onClick: () => props.onCopy(transferCommands, t("currentBranch.transferCopied")),
  };

  let primary: ActionDescriptor | null = null;
  if (task) {
    if (stepKey === "currentBranch.step.dirty") primary = aReviewChanges;
    else if (stepKey === "currentBranch.step.notPushed") primary = aPush;
    else if (stepKey === "currentBranch.step.highRisk") primary = aReviewChanges;
    else if (stepKey === "currentBranch.step.reviewNoDev") primary = canDeployDev ? aDeployDev : aOpenTask ?? aPush;
    else if (stepKey === "currentBranch.step.readyMerge") primary = aFinish ?? aPush;
    else if (stepKey === "currentBranch.step.toReview") {
      const aiNotRunYet =
        !!task.aiAgents?.enabled &&
        (!task.aiAgents.status || task.aiAgents.status === "not_configured" || task.aiAgents.status === "ready");
      primary = aiNotRunYet ? aOpenAiAgent : canDeployDev ? aDeployDev : aOpenTask ?? aPush;
    } else {
      primary = aFinish && finishAllowed ? aFinish : aPush;
    }
  }

  const coreActions: ActionDescriptor[] = [aPush, aFinish, aDeployDev].filter((a): a is ActionDescriptor => !!a);
  const extraActions: ActionDescriptor[] = [
    aCopyBranch,
    aOpenAiAgent,
    aOpenTask,
    aUpdateFromMain,
    aCopyAiPromptLegacy,
    aCopyTransfer,
  ].filter((a): a is ActionDescriptor => !!a);

  const usedIds = new Set<string>(primary ? [primary.id] : []);
  const secondary: ActionDescriptor[] = [];
  for (const a of [...coreActions, ...extraActions]) {
    if (secondary.length >= 2) break;
    if (usedIds.has(a.id)) continue;
    secondary.push(a);
    usedIds.add(a.id);
  }
  const more: ActionDescriptor[] = [...coreActions, ...extraActions].filter((a) => !usedIds.has(a.id));

  const renderActionButton = (a: ActionDescriptor, big?: boolean) => (
    <Tooltip key={a.id} text={a.tooltip ?? ""} side="bottom">
      <button
        className={`bb-btn ${a.accent ? "accent" : ""} ${big ? "bb-cb-primary-btn" : ""}`}
        disabled={a.disabled}
        onClick={a.onClick}
      >
        {a.icon}
        {a.label}
      </button>
    </Tooltip>
  );

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
      {task && (
        <Badge tone="neutral">
          {task ? colName || task.status : t("currentBranch.noTaskTitle")}
        </Badge>
      )}
    </div>
  );

  const actionRow = task && (
    <div className="bb-cb-action-row">
      {primary && renderActionButton(primary, true)}
      {secondary.map((a) => renderActionButton(a))}
      {more.length > 0 && (
        <div className="bb-cb-more-wrap bb-menu-wrap" ref={moreRef}>
          <button className="bb-btn" onClick={() => setMoreOpen((o) => !o)} title={t("currentBranch.cta.more")}>
            {t("currentBranch.cta.more")} ⋯
          </button>
          {moreOpen && (
            <div className="bb-menu left">
              {more.map((a) => (
                <button
                  key={a.id}
                  className="bb-menu-item"
                  disabled={a.disabled}
                  title={a.tooltip}
                  onClick={() => {
                    a.onClick();
                    setMoreOpen(false);
                  }}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const changedFilesPane = (
    <div className="bb-cb-tabpane">
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

  const commits =
    props.branchDetail && props.branchDetail.branchName === branch ? props.branchDetail.commits : [];

  const commitsPane = (
    <div className="bb-cb-tabpane">
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

  const safetyPane = (
    <div className="bb-cb-tabpane">
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
        {task && (
          <>
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
          </>
        )}
      </div>
    </div>
  );

  /* ---------- Tabs for "Szczegóły techniczne" ---------- */
  const tabs: TabItem[] = [];
  if (task) tabs.push({ id: "aiAgent", label: t("currentBranch.tabs.aiAgent") });
  tabs.push({ id: "files", label: t("currentBranch.tabs.files"), badge: changedFiles.length });
  tabs.push({ id: "commits", label: t("currentBranch.tabs.commits"), badge: commits.length });
  if (task) tabs.push({ id: "discussion", label: t("currentBranch.tabs.discussion"), badge: task.comments.length });
  tabs.push({ id: "safety", label: t("currentBranch.tabs.safety") });
  if (task) tabs.push({ id: "history", label: t("currentBranch.tabs.history") });

  const activeTabSafe = tabs.some((tb) => tb.id === activeTab) ? activeTab : tabs[0]?.id ?? "files";

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
            <Tooltip text={t("tooltips.currentBranch.primaryCta")} side="bottom">
              <div className="bb-cb-next-card">
                <span className="bb-cb-next-label">{t("currentBranch.nextStep")}</span>
                <span className="bb-cb-next-text">{t(stepKey)}</span>
              </div>
            </Tooltip>
            {actionRow}
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
              <div className="bb-card bb-cb-list-card">{changedFilesPane}</div>
              <div className="bb-card bb-cb-list-card">{commitsPane}</div>
            </aside>
          </div>
        )}

        {task && (
          <div className="bb-cb-stack">
            <section className="bb-card bb-cb-task-panel">
              <div className="bb-cb-task-top">
                <button
                  className={`bb-check ${task.status === "done" ? "checked" : ""}`}
                  disabled={!finishAllowed}
                  onClick={() => props.onFinish(task.id)}
                  title={t("currentBranch.finishTask")}
                >
                  {task.status === "done" ? "✓" : ""}
                </button>
                <div className="bb-cb-task-copy">
                  <div className="bb-cb-task-kicker">
                    <span>{t("currentBranch.taskLinked")}</span>
                    {(task.ai?.createdByAi || task.aiAgents?.enabled) && (
                      <Tooltip text={t("aiAgent.cardHint")}>
                        <Badge tone={task.aiAgents?.status === "failed" ? "critical" : "info"}>
                          AI{aiAgentDef?.name ? `: ${aiAgentDef.name}` : ""}
                        </Badge>
                      </Tooltip>
                    )}
                    {task.aiAgents?.status && task.aiAgents.status !== "not_configured" && (
                      <Badge tone={task.aiAgents.status === "failed" ? "critical" : "info"}>
                        {t(`aiAgent.status.${task.aiAgents.status}`)}
                      </Badge>
                    )}
                    {(task.aiAgents?.changedFiles?.length ?? 0) > 0 && (
                      <Badge tone="neutral">
                        {t("aiAgent.changedFilesShort", { count: task.aiAgents?.changedFiles?.length ?? 0 })}
                      </Badge>
                    )}
                    {assignee && (
                      <span className="bb-avatar small" style={{ background: assignee.color }} title={assignee.name}>
                        {assignee.avatarText}
                      </span>
                    )}
                  </div>
                  <h2 className="bb-cb-task-title">{task.title}</h2>
                  {descriptionPreview && <p className="bb-cb-task-desc">{descriptionPreview}</p>}
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
                  const isAiStage = c.gitStage === "ai-agent";
                  const moveAllowed = guardTaskMove(board, props.appConfig, task, c.id).ok;
                  const stage = (
                    <button
                      key={c.id}
                      className={`bb-flow-stage ${isCurrent ? "current" : ""} ${isAiStage ? "ai-stage" : ""}`}
                      disabled={!isCurrent && !moveAllowed}
                      onClick={() => {
                        if (isCurrent || !moveAllowed) return;
                        if (done) props.onFinish(task.id);
                        else props.onMoveTask(task.id, c.id);
                      }}
                    >
                      {isAiStage && <SparkleIcon size={11} />}
                      {c.name}
                    </button>
                  );
                  return isAiStage ? (
                    <Tooltip key={c.id} text={t("tooltips.currentBranch.aiAgentStage")} side="bottom">
                      {stage}
                    </Tooltip>
                  ) : (
                    stage
                  );
                })}
              </div>
            </section>

            <section className="bb-card bb-cb-tabbed-card">
              <div className="bb-section-head">
                <span className="bb-section-title">{t("currentBranch.techDetails")}</span>
                <HelpIcon text={t("tooltips.currentBranch.techDetails")} />
              </div>
              <Tabs tabs={tabs} active={activeTabSafe} onChange={setActiveTab} />
              {activeTabSafe === "aiAgent" && (
                <div className="bb-cb-tabpane">
                  <AiAgentChatPanel
                    task={task}
                    board={board}
                    appConfig={props.appConfig}
                    cursorAgents={props.cursorAgents}
                    aiAgentLog={props.aiAgentLogs[task.id] ?? []}
                    aiAgentRunningKind={props.aiAgentRunning[task.id] ?? null}
                    aiCostDecision={props.aiCostDecisions[task.id] ?? null}
                    onRequestAiCostDecision={(req) => props.onRequestAiCostDecision(task.id, req)}
                    onSave={(patch) => props.onSaveTask(task.id, patch)}
                    onGenerateAIAgentPrompt={() => props.onGenerateAIAgentPrompt(task.id)}
                    onRunAIAgentPlan={() => props.onRunAIAgentPlan(task.id)}
                    onRunAIAgent={() => props.onRunAIAgent(task.id)}
                    onRunAIAgentReview={() => props.onRunAIAgentReview(task.id)}
                    onAcceptAIAgentResult={() => props.onAcceptAIAgentResult(task.id)}
                    onRejectAIAgentResult={() => props.onRejectAIAgentResult(task.id)}
                    onCancelAIAgent={() => props.onCancelAIAgent(task.id)}
                    onCopyClipboard={props.onCopy}
                    onAiPromptCopied={() => props.onAiPromptCopied(task.id)}
                    onCheckoutBranch={props.onCheckout}
                    onOpenFile={props.onOpenFile}
                    onRefreshCursorAgents={props.onRefreshCursorAgents}
                    git={git}
                    onOpenSettings={props.onOpenSettings}
                    compact
                  />
                </div>
              )}
              {activeTabSafe === "files" && changedFilesPane}
              {activeTabSafe === "commits" && commitsPane}
              {activeTabSafe === "discussion" && (
                <div className="bb-cb-tabpane bb-cb-collab-grid">
                  <Checklist
                    items={task.checklist ?? []}
                    onChange={(items) => props.onSaveChecklist(task.id, items)}
                    readOnly={productionChecklistLocked}
                    readOnlyMessage={t("task.production.checklistLocked")}
                    onOpenFile={props.onOpenFile}
                  />
                  <Comments
                    comments={task.comments}
                    users={board.users}
                    task={task}
                    currentUserId={currentUserId}
                    onAdd={(text) => props.onAddComment(task.id, text)}
                    onOpenFile={props.onOpenFile}
                  />
                </div>
              )}
              {activeTabSafe === "safety" && safetyPane}
              {activeTabSafe === "history" && (
                <div className="bb-cb-tabpane">
                  <WorkLog task={task} events={props.events} branchCommits={commits} users={board.users} />
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
