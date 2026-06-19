import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AppConfig,
  BoardData,
  BoardEvent,
  BoardTask,
  ChecklistItem,
  CommitFile,
  CommitInfo,
  GitInfo,
  TaskAI,
  TaskPriority,
  TaskType,
  TASK_TYPES,
} from "../types";
import { t } from "../i18n";
import { buildAiPrompt, formatDate, slugify, suggestBranchName } from "../utils";
import { guardTaskMove, hasIncompleteSubtasks, isProductionColumn, isTaskInProduction } from "../productionGuards";
import { CheckoutIcon, CopyIcon, RefreshIcon, SparkleIcon } from "./Icons";
import { WorkLog } from "./task/WorkLog";
import { Checklist } from "./task/Checklist";
import { Comments } from "./task/Comments";
import { FileMentionInput } from "./task/FileMentionInput";

const RichDescription = lazy(() =>
  import("./task/RichDescription").then((module) => ({ default: module.RichDescription }))
);

interface Props {
  task: BoardTask;
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  events: BoardEvent[];
  branchCommits: CommitInfo[];
  branchFiles: CommitFile[];
  branchFilesLoading: boolean;
  onClose: () => void;
  onSave: (patch: Partial<BoardTask>) => void;
  onDelete: () => void;
  onAssign: (userId: string | null) => void;
  onAddComment: (text: string) => void;
  onCreateBranch: (branchName: string) => void;
  onCheckoutBranch: (branchName: string) => void;
  onPushBranch: (branchName: string) => void;
  onUpdateFromMain: (branchName: string) => void;
  onFinishTask: () => void;
  onMergeToMain: () => void;
  onCopyClipboard: (text: string, label: string) => void;
  onAiPromptCopied: () => void;
  onDeployDev: () => void;
  onDeployProduction: () => void;
  onMarkTested: () => void;
  onCreateBackup: () => void;
  onCreateSafetyTag: () => void;
  onRevertLastCommit: () => void;
  onRevertFromOrigin: () => void;
  onOpenExternal: (url: string) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (path: string) => void;
  fileSuggestions: string[];
  onSearchFiles: (query: string) => void;
}

const FILE_STATUS_TONE: Record<string, string> = {
  A: "tone-success",
  M: "tone-warning",
  D: "tone-critical",
  R: "tone-info",
  C: "tone-info",
};

const DEFAULT_AI_CHECKLIST_KEYS = [
  "cc.ai.cl.scopeOnly",
  "cc.ai.cl.noUnrelated",
  "cc.ai.cl.style",
  "cc.ai.cl.errors",
  "cc.ai.cl.secrets",
  "cc.ai.cl.tested",
  "cc.ai.cl.safeDev",
];

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

/**
 * Small hoverable/focusable "?" with a bilingual explanation. Uses a custom
 * popover (not the native title attribute, which VS Code webviews often
 * suppress) so the tooltip reliably appears on hover and keyboard focus.
 */
function Help({ text }: { text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const margin = 12;
    const gap = 8;
    const width = popRef.current?.offsetWidth ?? 320;
    const height = popRef.current?.offsetHeight ?? 44;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const preferredTop = rect.bottom + gap;
    const flippedTop = rect.top - height - gap;
    const top =
      preferredTop + height + margin <= window.innerHeight
        ? preferredTop
        : Math.max(margin, flippedTop);
    setPosition({ top, left });
  };

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onMove = () => updatePosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, text]);

  return (
    <span
      ref={anchorRef}
      className="bb-help"
      tabIndex={0}
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      ?
      {open &&
        createPortal(
          <span ref={popRef} className="bb-help-pop bb-help-pop-floating" role="tooltip" style={position}>
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

/** Field label with an inline help marker. */
function LabelHelp({ label, help }: { label: string; help: string }) {
  return (
    <label className="bb-label-help">
      {label}
      <Help text={help} />
    </label>
  );
}

function PropertyRow({
  label,
  help,
  children,
  muted = false,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`bb-task-property-row${muted ? " muted" : ""}`}>
      <div className="bb-task-property-label">
        <span>{label}</span>
        {help && <Help text={help} />}
      </div>
      <div className="bb-task-property-value">{children}</div>
    </div>
  );
}

function TaskSection({
  title,
  help,
  right,
  defaultOpen = false,
  children,
}: {
  title: string;
  help?: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`bb-task-section ${open ? "open" : ""}`}>
      <div className="bb-task-section-head">
        <button
          type="button"
          className="bb-task-section-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="bb-task-section-chevron">›</span>
          <span className="bb-section-title">{title}</span>
        </button>
        {help && <Help text={help} />}
        {right && <span className="bb-task-section-right">{right}</span>}
      </div>
      {open && <div className="bb-task-section-body">{children}</div>}
    </section>
  );
}

export function TaskDrawer(props: Props) {
  const { task, board, git, appConfig } = props;
  const [title, setTitle] = useState(task.title);
  const [branchName, setBranchName] = useState(task.branchName);
  const editorFallback = <div className="bb-muted small">{t("app.loading")}</div>;

  useEffect(() => {
    setTitle(task.title);
    setBranchName(task.branchName);
  }, [task.id, task.title, task.branchName]);

  const checklist = task.checklist ?? [];
  const productionChecklistLocked = isTaskInProduction(board, task);
  const productionMoveRequiresChecklist = hasIncompleteSubtasks(task);
  const productionColumn = board.columns.find((column) => isProductionColumn(column)) ?? null;
  const productionActionBlocked = !!productionColumn && productionMoveRequiresChecklist;

  const saveField = (patch: Partial<BoardTask>) => props.onSave(patch);
  const saveChecklist = (items: ChecklistItem[]) => {
    if (!productionChecklistLocked) {
      props.onSave({ checklist: items });
    }
  };

  const ai: TaskAI = task.ai ?? {
    createdByAi: false,
    usedModel: "",
    generatedPrompt: "",
    aiNotes: "",
    reviewChecklist: [],
  };
  const saveAi = (patch: Partial<TaskAI>) => props.onSave({ ai: { ...ai, ...patch } });
  const addAiChecklist = () =>
    saveAi({
      reviewChecklist: DEFAULT_AI_CHECKLIST_KEYS.map((k, i) => ({
        id: `aic_${Date.now().toString(36)}_${i}`,
        text: t(k),
        done: false,
      })),
    });
  const toggleAiItem = (id: string) =>
    saveAi({
      reviewChecklist: ai.reviewChecklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    });

  const suggested = suggestBranchName(task);
  const assignee = board.users.find((u) => u.id === task.assignedUserId) ?? null;
  const gitEnabled = !!git?.isRepo;
  const onTaskBranch = !!git?.currentBranch && git.currentBranch === branchName;

  const copyAiPrompt = () => {
    const text = buildAiPrompt({
      task,
      projectName: appConfig.projectName,
      testCommand: appConfig.policy.runCommandBeforeFinish,
      users: board.users,
      template: appConfig.aiPromptTemplate,
      language: appConfig.language,
    });
    props.onCopyClipboard(text, t("toast.aiPromptCopied"));
    props.onAiPromptCopied();
  };

  // Deployment context for this task's branch.
  const policy = appConfig.policy;
  const devUrl =
    branchName && policy.devDeployUrlTemplate
      ? policy.devDeployUrlTemplate
          .replace(/\{\{\s*branchName\s*\}\}/g, branchName)
          .replace(/\{\{\s*branchSlug\s*\}\}/g, slugify(branchName))
      : "";
  const latestDevDeploy = [...board.deployments]
    .filter((d) => d.branchName === branchName && d.environment === "dev")
    .sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""))[0];

  const rollbackCommands = [
    "# Safe undo of the last commit (creates a new commit):",
    `git switch ${branchName || "<branch>"}`,
    "git revert --no-edit HEAD",
    "",
    "# Inspect history / find a previous good state:",
    "git log --oneline -n 20",
    "git reflog",
    "",
    "# DANGER — rewrites history, discards local commits:",
    `# git reset --hard origin/${branchName || "<branch>"}`,
    "# git reset --hard HEAD~1",
  ].join("\n");

  const currentColumn = board.columns.find((c) => c.id === task.columnId) ?? null;
  const checklistDone = checklist.filter((item) => item.done).length;
  const statusLabel =
    task.status === "done"
      ? t("task.statusDone")
      : task.status === "in-progress"
        ? t("task.statusInProgress")
        : t("task.statusOpen");
  const projectLabel = appConfig.projectName || board.projectName || board.boardTitle || "BranchBoard";
  const columnLabel = currentColumn?.name ?? t("task.column");
  const toggleDone = () => saveField({ status: task.status === "done" ? "open" : "done" });
  const saveTitle = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(task.title);
      return;
    }
    if (nextTitle !== task.title) {
      saveField({ title: nextTitle });
    }
  };
  const saveBranch = (nextBranch: string) => {
    const normalizedBranch = nextBranch.trim();
    if (normalizedBranch !== nextBranch) {
      setBranchName(normalizedBranch);
    }
    if (normalizedBranch !== task.branchName) {
      saveField({ branchName: normalizedBranch });
    }
  };
  const checkoutBranch = () => {
    const normalizedBranch = branchName.trim();
    if (!normalizedBranch) {
      return;
    }
    saveBranch(normalizedBranch);
    props.onCheckoutBranch(normalizedBranch);
  };
  const canMoveToColumn = (columnId: string) => guardTaskMove(board, appConfig, task, columnId).ok;
  const saveColumn = (columnId: string) => {
    if (canMoveToColumn(columnId)) {
      saveField({ columnId });
    }
  };

  return (
    <div className="bb-task-modal-overlay" onMouseDown={props.onClose}>
      <section className="bb-task-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="bb-task-modal-head">
          <div className="bb-task-modal-breadcrumb" aria-label="Kontekst zadania">
            <span className="bb-task-breadcrumb-hash">#</span>
            <span>{projectLabel}</span>
            <span className="bb-task-breadcrumb-separator">/</span>
            <span>{columnLabel}</span>
            <span className="bb-task-modal-id">#{task.id.slice(-6)}</span>
          </div>
          <div className="bb-task-modal-actions">
            <button className="bb-task-modal-close" onClick={props.onClose} title={t("settings.close")}>
              ×
            </button>
          </div>
        </header>

        <div className="bb-task-modal-body">
          <main className="bb-task-detail-main">
            <section className="bb-task-title-panel">
              <button
                type="button"
                className={`bb-task-complete-toggle ${task.status === "done" ? "done" : ""}`}
                aria-pressed={task.status === "done"}
                title={statusLabel}
                onClick={toggleDone}
              >
                {task.status === "done" ? "✓" : ""}
              </button>
              <div className="bb-task-title-stack">
                <FileMentionInput
                  multiline
                  autoGrow
                  className="bb-task-modal-title"
                  value={title}
                  title={t("task.help.title")}
                  fileSuggestions={props.fileSuggestions}
                  onSearchFiles={props.onSearchFiles}
                  onChange={setTitle}
                  onBlur={saveTitle}
                />
                <Suspense fallback={editorFallback}>
                  <RichDescription
                    value={task.description}
                    placeholder={t("task.descriptionPlaceholder")}
                    onSave={(description) => saveField({ description })}
                    fileSuggestions={props.fileSuggestions}
                    onSearchFiles={props.onSearchFiles}
                    onOpenFile={props.onOpenFile}
                  />
                </Suspense>
              </div>
            </section>
            <div className="bb-task-workspace">
              <Checklist
                titleLabel="Pod-zadania"
                items={checklist}
                onChange={saveChecklist}
                readOnly={productionChecklistLocked}
                readOnlyMessage={t("task.production.checklistLocked")}
                fileSuggestions={props.fileSuggestions}
                onSearchFiles={props.onSearchFiles}
                onOpenFile={props.onOpenFile}
              />
              <Comments
                comments={task.comments}
                users={board.users}
                task={task}
                currentUserId={props.currentUserId}
                onAdd={props.onAddComment}
                fileSuggestions={props.fileSuggestions}
                onSearchFiles={props.onSearchFiles}
                onOpenFile={props.onOpenFile}
              />

              <TaskSection
                title="Zaawansowane / techniczne"
                help={t("task.help.git")}
                right={
                  <span className={`bb-count ${branchName ? "ok" : ""}`}>
                    {branchName ? branchName : t("task.noBranch")}
                  </span>
                }
              >
                <div className="bb-task-advanced">

          {/* 4 ── Git */}
          <TaskSection
            title="Git"
            help={t("task.help.git")}
            defaultOpen={!!branchName}
            right={<span className={`bb-count ${onTaskBranch ? "ok" : ""}`}>{branchName ? t("task.gitBranch") : t("task.noBranch")}</span>}
          >
            <div className="bb-field">
              <LabelHelp label={t("task.gitBranch")} help={t("task.help.branch")} />
              <div className="bb-branch-row">
                <input
                  className="bb-input"
                  value={branchName}
                  placeholder={suggested}
                  onChange={(e) => setBranchName(e.target.value)}
                  onBlur={() => saveBranch(branchName)}
                />
                {!branchName && (
                  <button
                    className="bb-btn"
                    title={t("task.help.suggest")}
                    onClick={() => {
                      setBranchName(suggested);
                      saveBranch(suggested);
                    }}
                  >
                    {t("task.suggest")}
                  </button>
                )}
              </div>
            </div>

            {!gitEnabled && <div className="bb-callout warn">{t("git.noRepo")}</div>}
            {gitEnabled && !branchName && <div className="bb-callout info">{t("task.noBranchHint")}</div>}
            {gitEnabled && onTaskBranch && <div className="bb-callout ok">{t("task.onThisBranch")}</div>}
            {gitEnabled && branchName && !onTaskBranch && git?.currentBranch && (
              <div className="bb-callout info">{t("task.branchDiffers")}</div>
            )}
            {gitEnabled && git?.hasUncommittedChanges && (
              <div className="bb-callout warn">{t("task.uncommitted")}</div>
            )}

            {gitEnabled && (
              <dl className="bb-git-status">
                <dt>{t("topBar.currentBranch")}</dt>
                <dd>{git?.currentBranch ?? "—"}</dd>
                <dt>{t("task.gitBranch")}</dt>
                <dd>{branchName || "—"}</dd>
              </dl>
            )}

            <div className="bb-git-actions">
              <button
                className="bb-btn"
                disabled={!gitEnabled || (!branchName && !suggested)}
                title={t("task.tip.createBranch")}
                onClick={() => props.onCreateBranch(branchName || suggested)}
              >
                {t("task.createBranch")}
              </button>
              <button
                className="bb-btn"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.checkout")}
                onClick={checkoutBranch}
              >
                {t("task.checkoutBranch")}
              </button>
              <button
                className="bb-btn"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.push")}
                onClick={() => props.onPushBranch(branchName)}
              >
                {t("task.pushBranch")}
              </button>
              <button
                className="bb-btn"
                disabled={!branchName}
                title={t("task.tip.copyBranch")}
                onClick={() => props.onCopyClipboard(branchName, t("toast.branchNameCopied"))}
              >
                <CopyIcon size={12} />
                {t("task.copyBranchName")}
              </button>
              <button
                className="bb-btn"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.updateFromMain")}
                onClick={() => props.onUpdateFromMain(branchName)}
              >
                <RefreshIcon size={12} />
                {t("task.updateFromMain")} ({appConfig.policy.updateBranchStrategy})
              </button>
              <button
                className="bb-btn accent full"
                disabled={!gitEnabled || !branchName || productionActionBlocked}
                onClick={props.onFinishTask}
                title={
                  productionActionBlocked ? t("task.production.productionChecklistIncomplete") : t("task.finishHint")
                }
              >
                {t("task.finish")}
              </button>
              {appConfig.policy.allowDirectMergeToMain && (
                <button
                  className="bb-btn warn full"
                  disabled={!gitEnabled || !branchName || productionActionBlocked}
                  title={
                    productionActionBlocked ? t("task.production.productionChecklistIncomplete") : t("task.tip.merge")
                  }
                  onClick={props.onMergeToMain}
                >
                  {t("task.mergeToMain")}
                </button>
              )}
            </div>
          </TaskSection>

          {gitEnabled && branchName && (
            <TaskSection
              title={t("task.files.title")}
              help={t("task.help.changedFiles")}
              right={props.branchFiles.length > 0 ? <span className="bb-count">{props.branchFiles.length}</span> : null}
            >
              {props.branchFilesLoading ? (
                <div className="bb-muted small">{t("task.files.loading")}</div>
              ) : props.branchFiles.length === 0 ? (
                <div className="bb-muted small">{t("task.files.empty")}</div>
              ) : (
                <ul className="bb-files-filelist">
                  {props.branchFiles.map((f: CommitFile) => (
                    <li key={f.path} className="bb-file-row">
                      <span
                        className={`bb-badge ${FILE_STATUS_TONE[f.status] ?? "tone-neutral"}`}
                        title={t(`cc.files.status.${f.status}`)}
                      >
                        {f.status}
                      </span>
                      <span
                        className="bb-file-path"
                        title={t("task.files.open")}
                        onClick={() => props.onOpenFile(f.path)}
                      >
                        {f.path}
                      </span>
                      <span className="bb-file-num">
                        <span className="add">+{f.additions}</span>{" "}
                        <span className="del">−{f.deletions}</span>
                      </span>
                      <button
                        className="bb-btn ghost sm"
                        title={t("task.files.diff")}
                        onClick={() => props.onOpenDiff(f.path)}
                      >
                        {t("task.files.diff")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TaskSection>
          )}

          {/* 5 ── Deployments */}
          <TaskSection title={t("task.deploy.title")} help={t("task.help.deploy")}>
            {latestDevDeploy && (
              <div className={`bb-callout ${latestDevDeploy.status === "failed" ? "warn" : "info"}`}>
                {t("task.deploy.lastStatus", {
                  status: t(`cc.deploy.status.${latestDevDeploy.status}`),
                  when: formatDate(latestDevDeploy.deployedAt),
                })}
                {latestDevDeploy.tested ? ` · ${t("cc.deploy.tested")}` : ""}
              </div>
            )}
            <div className="bb-git-actions">
              <button
                className="bb-btn"
                disabled={!gitEnabled || !branchName || !policy.devDeployCommand}
                title={!policy.devDeployCommand ? t("task.deploy.noCommand") : t("task.tip.deployDev")}
                onClick={props.onDeployDev}
              >
                {t("task.deploy.toDev")}
              </button>
              <button
                className="bb-btn"
                disabled={!devUrl}
                title={t("task.tip.openDev")}
                onClick={() => devUrl && props.onOpenExternal(devUrl)}
              >
                {t("task.deploy.openDev")}
              </button>
              <button
                className="bb-btn"
                disabled={!branchName}
                title={t("task.tip.markTested")}
                onClick={props.onMarkTested}
              >
                {t("task.deploy.markTested")}
              </button>
              {policy.allowProductionDeploy && (
                <button
                  className="bb-btn warn full"
                  disabled={!gitEnabled || !branchName || !policy.productionDeployCommand || productionActionBlocked}
                  title={
                    productionActionBlocked
                      ? t("task.production.productionChecklistIncomplete")
                      : t("task.tip.deployProd")
                  }
                  onClick={props.onDeployProduction}
                >
                  {t("task.deploy.toProd")}
                </button>
              )}
            </div>
            {!policy.devDeployCommand && (
              <span className="bb-muted small">{t("task.deploy.configureHint")}</span>
            )}
          </TaskSection>

          {/* 6 ── Safety / rollback */}
          <TaskSection title={t("task.safety.title")} help={t("task.help.safety")}>
            <div className="bb-callout info">
              {policy.createBackupBranchBeforeMerge
                ? t("task.safety.backupOn")
                : t("task.safety.backupOff")}
            </div>
            <div className="bb-git-actions">
              <button
                className="bb-btn"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.backup")}
                onClick={props.onCreateBackup}
              >
                {t("task.safety.backupNow")}
              </button>
              <button
                className="bb-btn"
                disabled={!gitEnabled}
                title={t("task.tip.tag")}
                onClick={props.onCreateSafetyTag}
              >
                {t("task.safety.tagNow")}
              </button>
              <button
                className="bb-btn"
                title={t("task.tip.copyRollback")}
                onClick={() => props.onCopyClipboard(rollbackCommands, t("task.safety.rollbackCopied"))}
              >
                <CopyIcon size={12} />
                {t("task.safety.copyRollback")}
              </button>
              <button
                className="bb-btn danger"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.revert")}
                onClick={props.onRevertLastCommit}
              >
                {t("task.safety.revertLast")}
              </button>
              <button
                className="bb-btn danger"
                disabled={!gitEnabled || !branchName}
                title={t("task.tip.revertFromOrigin")}
                onClick={props.onRevertFromOrigin}
              >
                {t("task.safety.revertFromOrigin")}
              </button>
              <button
                className="bb-btn"
                title={t("task.tip.guide")}
                onClick={() => props.onOpenExternal("https://git-scm.com/docs/git-revert")}
              >
                {t("task.safety.guide")}
              </button>
            </div>
            <span className="bb-muted small">{t("task.safety.note")}</span>
          </TaskSection>

          {/* 7 ── AI */}
          <TaskSection title="AI" help={t("task.help.ai")} right={ai.createdByAi ? <span className="bb-count">ON</span> : null}>
            <button className="bb-btn accent" onClick={copyAiPrompt} title={t("task.copyAiPromptHint")}>
              <SparkleIcon size={13} />
              {t("task.copyAiPrompt")}
            </button>
            <span className="bb-muted small">{t("task.copyAiPromptHint")}</span>

            <label className="bb-ai-toggle" title={t("task.help.aiAssisted")}>
              <input
                type="checkbox"
                checked={ai.createdByAi}
                onChange={(e) => saveAi({ createdByAi: e.target.checked })}
              />
              {t("task.aiAssisted")}
            </label>

            {ai.createdByAi && (
              <>
                <div className="bb-field">
                  <LabelHelp label={t("task.aiModel")} help={t("task.help.aiModel")} />
                  <input
                    className="bb-input"
                    value={ai.usedModel}
                    placeholder={t("task.aiModelPlaceholder")}
                    onChange={(e) => saveAi({ usedModel: e.target.value })}
                  />
                </div>

                <div className="bb-section-subtitle">
                  {t("task.aiChecklist")}{" "}
                  {ai.reviewChecklist.length > 0
                    ? `(${ai.reviewChecklist.filter((c) => c.done).length}/${ai.reviewChecklist.length})`
                    : ""}
                </div>
                {ai.reviewChecklist.length === 0 ? (
                  <button className="bb-btn" onClick={addAiChecklist} title={t("task.help.aiChecklist")}>
                    {t("task.aiAddChecklist")}
                  </button>
                ) : (
                  <div className="bb-checklist">
                    {ai.reviewChecklist.map((c) => (
                      <div key={c.id} className="bb-check-item">
                        <button
                          className={`bb-check square ${c.done ? "checked" : ""}`}
                          onClick={() => toggleAiItem(c.id)}
                        >
                          {c.done ? "✓" : ""}
                        </button>
                        <span className={`bb-check-text ${c.done ? "done" : ""}`}>{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TaskSection>

          <TaskSection title={t("task.context")} help={t("task.help.context")}>
            <WorkLog task={task} events={props.events} branchCommits={props.branchCommits} users={board.users} />
          </TaskSection>

                </div>
              </TaskSection>
            </div>
          </main>

          <aside className="bb-task-properties" aria-label="Właściwości zadania">
            <div className="bb-task-properties-inner">
              <PropertyRow label="Projekt">
                <span className="bb-task-project-value">
                  <span aria-hidden="true">#</span>
                  {projectLabel} / {columnLabel}
                </span>
              </PropertyRow>

              <PropertyRow label={t("task.assignee")} help={t("task.help.assignee")}>
                <select
                  className="bb-task-property-control"
                  value={task.assignedUserId ?? ""}
                  onChange={(e) => props.onAssign(e.target.value || null)}
                >
                  <option value="">{t("task.unassigned")}</option>
                  {board.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.id === props.currentUserId ? ` (${t("topBar.you")})` : ""}
                    </option>
                  ))}
                </select>
              </PropertyRow>

              <PropertyRow label={t("task.dueDate")} help={t("task.help.dueDate")}>
                <input
                  type="date"
                  className="bb-task-property-control"
                  value={task.dueDate ?? ""}
                  onChange={(e) => saveField({ dueDate: e.target.value || null })}
                />
              </PropertyRow>

              <PropertyRow label={t("task.priority")} help={t("task.help.priority")}>
                <select
                  className="bb-task-property-control"
                  value={task.priority}
                  onChange={(e) => saveField({ priority: e.target.value as TaskPriority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </select>
              </PropertyRow>

              <PropertyRow label={t("task.status")} help={t("task.help.status")}>
                <select
                  className="bb-task-property-control"
                  value={task.status}
                  onChange={(e) => saveField({ status: e.target.value as BoardTask["status"] })}
                >
                  <option value="open">{t("task.statusOpen")}</option>
                  <option value="in-progress">{t("task.statusInProgress")}</option>
                  <option value="done">{t("task.statusDone")}</option>
                </select>
              </PropertyRow>

              <PropertyRow label={t("task.column")} help={t("task.help.column")}>
                <select
                  className="bb-task-property-control"
                  value={task.columnId}
                  onChange={(e) => saveColumn(e.target.value)}
                >
                  {[...board.columns]
                    .sort((a, b) => a.position - b.position)
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={!canMoveToColumn(c.id)}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {productionMoveRequiresChecklist && (
                  <span className="bb-muted small">{t("task.production.productionRequiresChecklist")}</span>
                )}
              </PropertyRow>

              <PropertyRow label={t("task.type")} help={t("task.help.type")}>
                <select
                  className="bb-task-property-control"
                  value={task.taskType ?? "feature"}
                  onChange={(e) => saveField({ taskType: e.target.value as TaskType })}
                  disabled={!!task.branchName}
                  title={task.branchName ? t("task.typeLockedHint") : undefined}
                >
                  {TASK_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`taskType.${tp}`)}
                    </option>
                  ))}
                </select>
              </PropertyRow>

              <PropertyRow label={t("task.gitBranch")} help={t("task.help.branch")}>
                <div className="bb-task-branch-property">
                  <input
                    className="bb-task-property-control mono"
                    value={branchName}
                    placeholder="Dodaj branch"
                    onChange={(e) => setBranchName(e.target.value)}
                    onBlur={() => saveBranch(branchName)}
                  />
                  {branchName ? (
                    <button
                      type="button"
                      className="bb-task-property-action"
                      title={t("task.tip.checkoutPublic", { remote: policy.remoteName })}
                      disabled={!gitEnabled}
                      onClick={checkoutBranch}
                    >
                      <CheckoutIcon size={14} />
                      <span>{t("task.checkoutShort")}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bb-task-property-plus"
                      title={t("task.help.suggest")}
                      onClick={() => {
                        setBranchName(suggested);
                        saveBranch(suggested);
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </PropertyRow>

            </div>
          </aside>
        </div>

        <footer className="bb-task-modal-foot">
          <span className="bb-muted small">
            {assignee ? t("task.assignedTo", { name: assignee.name }) : t("task.unassigned")} · #{task.id.slice(-6)}
          </span>
          <button className="bb-btn danger" onClick={props.onDelete}>
            {t("task.delete")}
          </button>
        </footer>
      </section>
    </div>
  );
}
