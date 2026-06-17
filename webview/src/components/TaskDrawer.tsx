import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { CopyIcon, FileIcon, SparkleIcon } from "./Icons";
import { WorkLog } from "./task/WorkLog";
import { Checklist } from "./task/Checklist";
import { Comments } from "./task/Comments";

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
  return (
    <span className="bb-help" tabIndex={0} aria-label={text}>
      ?
      <span className="bb-help-pop" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/** Section header with an optional help marker and right-aligned extra. */
function SectionHead({ title, help, right }: { title: string; help?: string; right?: ReactNode }) {
  return (
    <div className="bb-section-head">
      <span className="bb-section-title">{title}</span>
      {help && <Help text={help} />}
      {right && <span className="bb-section-right">{right}</span>}
    </div>
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

export function TaskDrawer(props: Props) {
  const { task, board, git, appConfig } = props;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [branchName, setBranchName] = useState(task.branchName);
  const [fileInput, setFileInput] = useState("");

  const attachedFiles = task.attachedFiles ?? [];
  // Debounced file search so typing stays smooth and the suggestion list
  // (capped to 10 on the extension side) doesn't thrash on every keystroke.
  const searchTimer = useRef<number | undefined>(undefined);
  const searchFiles = (q: string) => {
    window.clearTimeout(searchTimer.current);
    if (q.trim().length < 1) {
      return;
    }
    searchTimer.current = window.setTimeout(() => props.onSearchFiles(q), 180);
  };
  const addAttachedFile = (raw: string) => {
    const p = raw.trim().replace(/^@/, "");
    if (!p || attachedFiles.includes(p)) {
      setFileInput("");
      return;
    }
    props.onSave({ attachedFiles: [...attachedFiles, p] });
    setFileInput("");
  };
  const removeAttachedFile = (p: string) =>
    props.onSave({ attachedFiles: attachedFiles.filter((x) => x !== p) });

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setBranchName(task.branchName);
  }, [task.id, task.title, task.description, task.branchName]);

  const checklist = task.checklist ?? [];

  const saveField = (patch: Partial<BoardTask>) => props.onSave(patch);
  const saveChecklist = (items: ChecklistItem[]) => props.onSave({ checklist: items });

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
  const onTaskBranch = !!git?.currentBranch && git.currentBranch === task.branchName;

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

  return (
    <div className="bb-drawer-overlay" onMouseDown={props.onClose}>
      <aside className="bb-drawer bb-taskdrawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bb-drawer-head">
          <textarea
            className="bb-drawer-title"
            rows={1}
            value={title}
            title={t("task.help.title")}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && saveField({ title: title.trim() })}
          />
          <button className="bb-iconbtn" onClick={props.onClose} title={t("settings.close")}>
            ✕
          </button>
        </div>

        <div className="bb-drawer-body">
          {/* 1 ── Context: work log + history + overdue (TOP) */}
          <WorkLog task={task} events={props.events} branchCommits={props.branchCommits} users={board.users} />

          {/* 2 ── Changed files on the branch (code-review priority) */}
          {gitEnabled && branchName && (
            <div className="bb-card">
              <SectionHead
                title={t("task.files.title")}
                help={t("task.help.changedFiles")}
                right={props.branchFiles.length > 0 ? <span className="bb-count">{props.branchFiles.length}</span> : null}
              />
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
            </div>
          )}

          {/* 3 ── Details (assignee, priority, status, column, due, description) */}
          <div className="bb-card">
            <SectionHead title={t("task.details")} help={t("task.help.details")} />
            <div className="bb-field-row">
              <div className="bb-field">
                <LabelHelp label={t("task.type")} help={t("task.help.type")} />
                <select
                  className="bb-input"
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
              </div>
            </div>
            <div className="bb-field-row">
              <div className="bb-field">
                <LabelHelp label={t("task.assignee")} help={t("task.help.assignee")} />
                <select
                  className="bb-input"
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
              </div>
              <div className="bb-field">
                <LabelHelp label={t("task.priority")} help={t("task.help.priority")} />
                <select
                  className="bb-input"
                  value={task.priority}
                  onChange={(e) => saveField({ priority: e.target.value as TaskPriority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bb-field-row">
              <div className="bb-field">
                <LabelHelp label={t("task.status")} help={t("task.help.status")} />
                <select
                  className="bb-input"
                  value={task.status}
                  onChange={(e) => saveField({ status: e.target.value as BoardTask["status"] })}
                >
                  <option value="open">{t("task.statusOpen")}</option>
                  <option value="in-progress">{t("task.statusInProgress")}</option>
                  <option value="done">{t("task.statusDone")}</option>
                </select>
              </div>
              <div className="bb-field">
                <LabelHelp label={t("task.column")} help={t("task.help.column")} />
                <select
                  className="bb-input"
                  value={task.columnId}
                  onChange={(e) => saveField({ columnId: e.target.value })}
                >
                  {[...board.columns]
                    .sort((a, b) => a.position - b.position)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="bb-field-row">
              <div className="bb-field">
                <LabelHelp label={t("task.dueDate")} help={t("task.help.dueDate")} />
                <input
                  type="date"
                  className="bb-input"
                  value={task.dueDate ?? ""}
                  onChange={(e) => saveField({ dueDate: e.target.value || null })}
                />
              </div>
              <div className="bb-field" />
            </div>

            <div className="bb-field">
              <LabelHelp label={t("task.description")} help={t("task.help.description")} />
              <textarea
                className="bb-input"
                rows={3}
                value={description}
                placeholder={t("task.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== task.description && saveField({ description })}
              />
            </div>

            {/* Checklist + comments live right here — the highest-traffic part of a
                task, kept above the fold since drawer space is tight. Acceptance
                criteria as a separate field was removed; the AI prompt now derives
                it from unchecked checklist items (see utils.buildAiPrompt). */}
            <Checklist items={checklist} onChange={saveChecklist} />
            <Comments comments={task.comments} users={board.users} currentUserId={props.currentUserId} onAdd={props.onAddComment} />

            {/* Attached project files (fed into the AI prompt) */}
            <div className="bb-field">
              <LabelHelp label={t("task.attachedFiles")} help={t("task.help.attachedFiles")} />
              {attachedFiles.length > 0 && (
                <ul className="bb-attached-list">
                  {attachedFiles.map((f) => (
                    <li key={f} className="bb-attached-item">
                      <FileIcon size={12} />
                      <span
                        className="bb-attached-path"
                        title={t("task.files.open")}
                        onClick={() => props.onOpenFile(f)}
                      >
                        {f}
                      </span>
                      <button
                        className="bb-iconbtn"
                        title={t("common.delete")}
                        onClick={() => removeAttachedFile(f)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="bb-comment-add">
                <input
                  className="bb-input bb-mono"
                  list="bb-file-suggest"
                  value={fileInput}
                  placeholder={t("task.attachPlaceholder")}
                  onChange={(e) => {
                    setFileInput(e.target.value);
                    searchFiles(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAttachedFile(fileInput);
                    }
                  }}
                />
                <datalist id="bb-file-suggest">
                  {props.fileSuggestions.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <button className="bb-btn" disabled={!fileInput.trim()} onClick={() => addAttachedFile(fileInput)}>
                  {t("task.addItem")}
                </button>
              </div>
            </div>
          </div>

          {/* 4 ── Git */}
          <div className="bb-card">
            <SectionHead title="Git" help={t("task.help.git")} />
            <div className="bb-field">
              <LabelHelp label={t("task.gitBranch")} help={t("task.help.branch")} />
              <div className="bb-branch-row">
                <input
                  className="bb-input"
                  value={branchName}
                  placeholder={suggested}
                  onChange={(e) => setBranchName(e.target.value)}
                  onBlur={() => branchName !== task.branchName && saveField({ branchName })}
                />
                {!branchName && (
                  <button
                    className="bb-btn"
                    title={t("task.help.suggest")}
                    onClick={() => {
                      setBranchName(suggested);
                      saveField({ branchName: suggested });
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
                onClick={() => props.onCheckoutBranch(branchName)}
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
                className="bb-btn accent full"
                disabled={!gitEnabled || !branchName}
                onClick={props.onFinishTask}
                title={t("task.finishHint")}
              >
                {t("task.finish")}
              </button>
              {appConfig.policy.allowDirectMergeToMain && (
                <button
                  className="bb-btn warn full"
                  disabled={!gitEnabled || !branchName}
                  title={t("task.tip.merge")}
                  onClick={props.onMergeToMain}
                >
                  {t("task.mergeToMain")}
                </button>
              )}
            </div>
          </div>

          {/* 5 ── Deployments */}
          <div className="bb-card">
            <SectionHead title={t("task.deploy.title")} help={t("task.help.deploy")} />
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
                  disabled={!gitEnabled || !branchName || !policy.productionDeployCommand}
                  title={t("task.tip.deployProd")}
                  onClick={props.onDeployProduction}
                >
                  {t("task.deploy.toProd")}
                </button>
              )}
            </div>
            {!policy.devDeployCommand && (
              <span className="bb-muted small">{t("task.deploy.configureHint")}</span>
            )}
          </div>

          {/* 6 ── Safety / rollback */}
          <div className="bb-card">
            <SectionHead title={t("task.safety.title")} help={t("task.help.safety")} />
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
          </div>

          {/* 7 ── AI */}
          <div className="bb-card">
            <SectionHead title="AI" help={t("task.help.ai")} />
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
          </div>

        </div>

        <div className="bb-drawer-foot">
          <span className="bb-muted small">
            {assignee ? t("task.assignedTo", { name: assignee.name }) : t("task.unassigned")} · #{task.id.slice(-6)}
          </span>
          <button className="bb-btn danger" onClick={props.onDelete}>
            {t("task.delete")}
          </button>
        </div>
      </aside>
    </div>
  );
}
