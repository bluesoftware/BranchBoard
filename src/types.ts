/**
 * Shared data model for BranchBoard (extension side).
 * The webview keeps an identical copy in webview/src/types.ts.
 */

export type TaskStatus = "open" | "in-progress" | "done";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

/** Type of work — drives the branch prefix (feature/, bugfix/, …). */
export type TaskType = "feature" | "bugfix" | "hotfix" | "chore" | "refactor" | "docs";

/** All selectable task types, in display order. */
export const TASK_TYPES: TaskType[] = ["feature", "bugfix", "hotfix", "chore", "refactor", "docs"];

/**
 * Where a column sits in the Git lifecycle. Drives branch naming + merge
 * targets and lets the board reason about "what does main/dev/feature mean here".
 *  - none:       no branch involved (Backlog / To Do).
 *  - feature:    work happens on origin/<prefix><branch>, cut from baseBranch.
 *  - review:     branch is pushed; a PR/code-review is expected.
 *  - staging:    integrated into the dev/integration branch (e.g. origin/dev).
 *  - production: released into the production branch (e.g. origin/main).
 */
export type GitStage = "none" | "ai-agent" | "feature" | "review" | "staging" | "production";

/**
 * Live, Git-truth location of a task's branch — independent of which column
 * the task sits in. This answers "where does the code physically live right
 * now", not "what does the workflow intend":
 *  - local:  branch exists only on this machine, nobody else can see it.
 *  - origin: pushed to the remote — visible to the whole team, not yet
 *            integrated anywhere.
 *  - dev:    merged/ancestor of the dev/integration branch.
 *  - prod:   merged/ancestor of the main/production branch.
 * Computed on demand by GitService.getBranchLocationState(); never persisted,
 * so it can never go stale or lie.
 */
export type BranchLocationState = "local" | "origin" | "dev" | "prod";

/**
 * One entry returned by GitService.searchFileMentions() for the "@" file
 * mention picker (title / description / checklist / comments). `path` is
 * always repo-relative with forward slashes; directories never have a
 * trailing slash baked in — the UI adds it when drilling in.
 */
export interface FileMentionEntry {
  path: string;
  type: "file" | "dir";
}

/** When a column hook fires relative to a task move. */
export type ColumnHookTrigger = "onEnter" | "onLeave";

/**
 * A single command attached to a column. Commands are NEVER run through a
 * shell: the binary is matched against an allowlist and arguments are passed
 * to execFile as a separate array, so task data can never be injected.
 */
export interface ColumnHook {
  id: string;
  /** Human label shown in the UI ("Run tests"). */
  label: string;
  /** Binary to run — must be present in branchBoard.allowedCommands. */
  command: string;
  /** Arguments, each a separate token. Supports {{branch}} {{taskId}} etc. */
  args: string[];
  /** Ask the user to confirm before running this command. */
  requireConfirm: boolean;
  /** Refuse to run (and block the move if blocking) when the tree is dirty. */
  requireCleanTree: boolean;
  /** If false, a failure stops the remaining hooks in the chain. */
  continueOnError: boolean;
  /** Hard timeout in seconds; the process is killed past this. */
  timeoutSec: number;
  /** If true, this hook must succeed for the task to settle in the column. */
  blocking: boolean;
  /** Disabled hooks are ignored (safe default for samples). */
  enabled: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  /** Optional English label (board can be shown in PL or EN). */
  nameEn?: string;
  /** Git lifecycle stage this column represents. */
  gitStage?: GitStage;
  /** Branch new feature branches are cut from at this stage (e.g. "dev"). */
  baseBranch?: string;
  /** Merge target when finishing from this stage (e.g. "dev" or "main"). */
  targetBranch?: string;
  /** Prefix applied to auto-generated branch names (e.g. "feature/"). */
  branchPrefix?: string;
  /** Max tasks allowed in this column (0/undefined = unlimited). */
  wipLimit?: number;
  /** Commands run when a task enters this column. */
  onEnter?: ColumnHook[];
  /** Commands run when a task leaves this column. */
  onLeave?: ColumnHook[];
}

/** Result of running one column hook, reported back to the webview. */
export interface ColumnHookResult {
  hookId: string;
  label: string;
  command: string;
  args: string[];
  ok: boolean;
  skipped: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  message: string;
}

export interface BoardUser {
  id: string;
  name: string;
  email: string;
  avatarText: string;
  color: string;
  /** Optional profile photo, stored as a data URL (e.g. "data:image/png;base64,..."). */
  avatarPhoto?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type AIAgentStatus =
  | "not_configured"
  | "ready"
  | "planning"
  | "running"
  | "reviewing"
  | "finished"
  | "failed"
  | "cancelled";

export type AIAgentRunStatus = "planning" | "running" | "reviewing" | "finished" | "failed" | "cancelled";

export type AIAgentChangedFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface AIAgentChangedFile {
  path: string;
  status: AIAgentChangedFileStatus;
}

/** Token usage reported by an AI agent CLI, normalized across naming conventions. */
export interface AIAgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Approximate cost computed from AIAgentUsage and an AIAgentDefinition's pricing. */
export interface AIAgentCostEstimate {
  currency: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

export interface AIAgentRunHistoryItem {
  id: string;
  agentId: string;
  model?: string;
  status: AIAgentRunStatus;
  /** Which workflow step produced this turn — lets the UI render a proper chat timeline (plan/run/review messages) instead of one flat list. Optional only for backward-compat with history entries persisted before this field existed. */
  kind?: "plan" | "run" | "review";
  startedAt: string;
  finishedAt?: string;
  prompt: string;
  plan?: string;
  result?: string;
  reviewResult?: string;
  /** Files changed by this specific turn (only meaningful for kind === "run"). */
  changedFiles?: AIAgentChangedFile[];
  error?: string;
  branch?: string;
  usage?: AIAgentUsage;
  cost?: AIAgentCostEstimate;
}

export interface TaskAIAgents {
  enabled: boolean;
  status: AIAgentStatus;
  selectedAgentIds: string[];
  /** IDs (file paths relative to .cursor/agents) of selected Cursor sub-agent personas. */
  selectedCursorAgentIds?: string[];
  selectedModel?: string;
  prompt?: string;
  plan?: string;
  planFile?: string;
  result?: string;
  reviewResult?: string;
  lastRunAt?: string;
  lastFinishedAt?: string;
  error?: string;
  createdBranch?: string;
  changedFiles?: AIAgentChangedFile[];
  runHistory?: AIAgentRunHistoryItem[];
  /** Token usage reported by the agent on its last completed run. */
  lastUsage?: AIAgentUsage;
  /** Approximate cost of the last completed run, computed from lastUsage and the agent's configured pricing. */
  lastCost?: AIAgentCostEstimate;
  /** Short, persisted memory used by the AI Cost Guard so later prompts can reuse a summary instead of full history. */
  costMemory?: AiSessionMemory;
  /** Last cost-guard decision computed for this task, shown in the UI and reused until the user asks again. */
  lastCostDecision?: AiCostDecision;
}

/* ---------- AI Cost Guard / Local AI Optimizer ---------- */

/** Overall cost posture chosen by the user; "auto" lets the rule engine decide everything. */
export type AiCostMode = "auto" | "cheap" | "balanced" | "quality" | "manual";

/** How much context is sent to Cursor CLI for a given step. */
export type AiContextLevel = "small" | "normal" | "full";

/** Estimated risk that a step will be expensive (tokens/model/context combined). */
export type AiCostRisk = "low" | "medium" | "high";

/** What the optimizer decided to do with the user's message. */
export type AiDecisionAction = "answer_local" | "prepare_prompt" | "cursor_plan" | "cursor_work" | "cursor_review";

/** Which kind of local model integration is configured for the optional advisory layer. */
export type AiLocalOptimizerProvider = "local-command" | "openai-compatible-http";

/**
 * Decision produced by AiCostOptimizer for one chat message / task action.
 * The local model (if enabled) is purely advisory — it MUST NOT execute code
 * or Git, it only influences this decision, which is then validated and
 * clamped against branchBoard.aiCli.* settings before anything runs.
 */
export interface AiCostDecision {
  action: AiDecisionAction;
  costRisk: AiCostRisk;
  contextLevel: AiContextLevel;
  modelPreference?: string;
  selectedFiles: string[];
  includeDiff: boolean;
  includeFullFiles: boolean;
  includeChatHistory: boolean;
  includeChatSummary: boolean;
  requiresUserConfirmation: boolean;
  reason: string;
  optimizedPrompt: string;
}

/**
 * Short, persisted per-task memory so AiPromptOptimizer never needs to dump
 * the full chat/run history into a new Cursor CLI prompt when a summary is
 * already available.
 */
export interface AiSessionMemory {
  lastPlanSummary?: string;
  lastRunSummary?: string;
  lastReviewSummary?: string;
  /** Files touched in the most recently completed session, for change-aware context selection. */
  lastFileList?: string[];
  /** Rolling short summary of the chat/comments thread, refreshed instead of growing unbounded. */
  lastChatSummary?: string;
  updatedAt?: string;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  columnId: string;
  position: number;
  assignedUserId: string | null;
  /** User who created the task. Optional for boards created before this field existed. */
  createdByUserId?: string | null;
  branchName: string;
  priority: TaskPriority;
  /** Type of work; determines the branch prefix. Defaults to "feature". */
  taskType?: TaskType;
  comments: TaskComment[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: TaskStatus;
  /** Optional ISO date (yyyy-mm-dd) used to compute "overdue by N days". */
  dueDate?: string | null;
  /** Free-text acceptance criteria (one per line); fed into the AI prompt. */
  acceptanceCriteria?: string;
  /** Relative repo paths linked to the task (fed into the AI prompt). */
  attachedFiles?: string[];
  /** AI-assist metadata (Command Center AI Review). Optional for old boards. */
  ai?: TaskAI;
  /** Execution metadata for the AI Agent Task workflow. Optional for old boards. */
  aiAgents?: TaskAIAgents;
}

/** Per-task AI-assist metadata used by the AI Review module. */
export interface TaskAI {
  createdByAi: boolean;
  usedModel: string;
  generatedPrompt: string;
  aiNotes: string;
  reviewChecklist: ChecklistItem[];
}

/* ---------- Command Center: events & deployments ---------- */

export type BoardEventType =
  | "task_created"
  | "task_updated"
  | "task_moved"
  | "task_deleted"
  | "branch_created"
  | "branch_checked_out"
  | "branch_pushed"
  | "comment_added"
  | "ai_prompt_copied"
  | "task_finished"
  | "merge_started"
  | "merge_finished"
  | "merge_failed"
  | "dev_deploy_started"
  | "dev_deploy_finished"
  | "dev_deploy_failed"
  | "branch_updated_from_main"
  | "ai_prompt_generated"
  | "ai_agent_plan_started"
  | "ai_agent_plan_finished"
  | "ai_agent_run_started"
  | "ai_agent_run_finished"
  | "ai_agent_run_failed"
  | "ai_review_started"
  | "ai_review_finished"
  | "ai_task_moved_to_local";

/** A single audit-trail entry, stored on the board. */
export interface BoardEvent {
  id: string;
  type: BoardEventType;
  taskId?: string | null;
  branchName?: string | null;
  userId?: string | null;
  createdAt: string;
  /** Free-form contextual data (e.g. { fromColumn, toColumn }). */
  payload?: Record<string, unknown>;
}

/* ---------- Persisted, per-user notifications ---------- */

export type NotificationType =
  | "task_created"
  | "comment_added"
  | "assigned_to_you"
  | "branch_pushed"
  | "merge_finished"
  | "merge_failed"
  | "task_moved_to_review"
  | "task_done"
  | "admin_announcement";

/**
 * A persisted notification entry, stored on the board so every user has a
 * durable, synced read-state (not just an in-memory toast). `recipientUserIds`
 * decides who it's meant for; `readBy` tracks who has seen it.
 */
export interface BoardNotificationRecord {
  id: string;
  type: NotificationType;
  taskId: string | null;
  branchName: string | null;
  /** Board user who triggered the event (excluded from recipients). */
  actorUserId: string | null;
  /** Users this notification is meant for. */
  recipientUserIds: string[];
  /** Users who have marked this notification as read. */
  readBy: string[];
  title: string;
  message: string;
  createdAt: string;
}

export type AdminAnnouncementSeverity = "info" | "warning" | "critical";

export interface BoardAdminAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: AdminAnnouncementSeverity;
  linkUrl: string;
  linkLabel: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  readBy: string[];
  active: boolean;
}

export type DeploymentEnvironment = "dev" | "staging" | "production";
export type DeploymentStatus = "not_deployed" | "deploying" | "deployed" | "failed";

/** A deployment record for a task/branch to an environment. */
export interface Deployment {
  id: string;
  taskId: string | null;
  branchName: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  url: string;
  deployedBy: string | null;
  deployedAt: string | null;
  command: string;
  logSummary: string;
  /** Set by "Mark as tested" once a tester verified the environment. */
  tested: boolean;
}

export interface BoardData {
  version: number;
  projectName: string;
  boardTitle: string;
  columns: BoardColumn[];
  users: BoardUser[];
  tasks: BoardTask[];
  /** Audit trail for the Command Center (capped, newest last). */
  events: BoardEvent[];
  /** Deployment records (DEV/staging/production). */
  deployments: Deployment[];
  /** Persisted, per-user notifications (capped, newest last). */
  notifications: BoardNotificationRecord[];
  /** High-visibility admin/build announcements synced through the board database. */
  announcements: BoardAdminAnnouncement[];
  /** Bumped on every save so external watchers can detect change ordering. */
  updatedAt?: string;
}

/* ---------- Command Center: computed analytics (not persisted) ---------- */

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Per-branch git analytics, computed on demand (never stored). */
export interface BranchInfo {
  branchName: string;
  taskId: string | null;
  current: boolean;
  existsLocal: boolean;
  existsRemote: boolean;
  lastCommitAt: string | null;
  lastCommitMessage: string | null;
  commitsAheadMain: number;
  commitsBehindMain: number;
  changedFilesCount: number;
  /** Paths changed vs main (capped). Used by Risk Radar critical-path checks. */
  changedFiles: string[];
  /** "true" | "false" | "unknown" — kept conservative; no auto-merge probing. */
  hasConflicts: "true" | "false" | "unknown";
  deployedToDev: boolean;
  readyToMerge: boolean;
}

/**
 * Optional, user-configured approximate pricing for an AI agent CLI, used to
 * estimate the cost of a run from its reported token usage. All rates are
 * "per million tokens". Left unset by default — BranchBoard never invents a
 * price; if no rate is configured, the UI shows usage only and a hint to
 * configure pricing instead of a possibly-wrong cost figure.
 */
export interface AIAgentPricing {
  currency?: string;
  inputPerMTok?: number;
  outputPerMTok?: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
}

/**
 * Per-model override of AIAgentPricing, plus an "active" flag the user can
 * toggle from the UI without deleting the model from `models`/CLI-discovered
 * lists. When a model has its own entry here, it takes priority over the
 * agent-level `pricing` in computeAIAgentCost — this is what makes it
 * possible to keep one agent entry with several models (e.g. Sonnet/Opus/
 * Haiku) while still pricing each one correctly.
 */
export interface AIAgentModelPricing {
  /** Model id/slug, must match an entry in `models` (or a CLI-discovered model). */
  modelId: string;
  pricing?: AIAgentPricing;
  /**
   * Whether this model is offered to the user in the model picker. Defaults
   * to true when unset, so existing configs keep working unchanged.
   */
  active?: boolean;
}

export interface AIAgentDefinition {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  allowModels: boolean;
  models?: string[];
  /** Approximate per-million-token pricing, used to estimate run cost. Optional. */
  pricing?: AIAgentPricing;
  /** Optional per-model pricing/active overrides — see AIAgentModelPricing. */
  modelPricing?: AIAgentModelPricing[];
  /**
   * Optional CLI args that print this agent's available models (e.g.
   * `["models", "--output-format", "json"]` for cursor-agent's `agent
   * models` subcommand). When unset, BranchBoard cannot fetch a live model
   * list for this agent and the "refresh" action reports that plainly
   * instead of guessing.
   */
  listModelsArgs?: string[];
}

/**
 * A Cursor sub-agent persona discovered from a `.cursor/agents/*.md` file in
 * the workspace. These are NOT CLI-runner agents (see AIAgentDefinition) —
 * they are markdown persona/rule files that Cursor itself uses to route work
 * to specialized personas. BranchBoard reads them so the user can attach one
 * or more personas to a task; their content is folded into the generated AI
 * prompt (see AIAgentService.buildPrompt).
 */
export interface CursorSubAgentInfo {
  /** Stable id = file path relative to the workspace root, e.g. ".cursor/agents/javascript-core-senior.md". */
  id: string;
  /** Absolute file path on disk. */
  filePath: string;
  /** From YAML frontmatter `name:`. Falls back to the file name. */
  name: string;
  /** From YAML frontmatter `description:`. */
  description: string;
  /** Full markdown body (without the frontmatter block), used for content search and prompt injection. */
  body: string;
  /** File-glob triggers extracted from the body, e.g. ["*.js", "*.ts"]. */
  fileTriggers: string[];
  /** Free-text keyword triggers extracted from the body's "TRIGGERY"/triggers section. */
  keywordTriggers: string[];
  /** Last modification time (ISO string) of the source file. */
  updatedAt: string;
}

/** One classified bucket count for the Overview dashboard. */
export interface OverviewMetrics {
  activeTasks: number;
  inProgress: number;
  inReview: number;
  inTesting: number;
  readyToMerge: number;
  blocked: number;
  branchesWithoutTask: number;
  tasksWithoutBranch: number;
  doneThisWeek: number;
  totalTasks: number;
}

/** A single "needs attention" warning row. */
export interface AttentionItem {
  id: string;
  /** i18n key for the reason text. */
  reasonKey: string;
  /** Parameters for the i18n reason. */
  params?: Record<string, string | number>;
  severity: RiskLevel;
  taskId?: string | null;
  branchName?: string | null;
}

/** Per-user workload row for the Team dashboard. */
export interface TeamMemberStats {
  userId: string;
  name: string;
  email: string;
  avatarText: string;
  color: string;
  active: number;
  inReview: number;
  inTesting: number;
  doneThisWeek: number;
  branches: number;
  lastActivityAt: string | null;
  blocked: number;
}

/** A branch-flow row combining task + git state for the pipeline view. */
export interface BranchFlowRow {
  branchName: string;
  taskId: string | null;
  taskTitle: string | null;
  assignedUserId: string | null;
  columnId: string | null;
  columnName: string | null;
  info: BranchInfo;
  riskLevel: RiskLevel;
  /** Pipeline stage states for Task→Branch→Commits→Push→DEV→Review→Testing→Merge. */
  stages: BranchPipelineStages;
  stale: boolean;
}

export type StageState = "idle" | "active" | "done" | "attention" | "problem";

export interface BranchPipelineStages {
  task: StageState;
  branch: StageState;
  commits: StageState;
  push: StageState;
  dev: StageState;
  review: StageState;
  testing: StageState;
  merge: StageState;
}

/* ---------- Risk Radar ---------- */

export interface RiskReason {
  /** i18n key for the reason text. */
  key: string;
  points: number;
  params?: Record<string, string | number>;
}

export interface RiskItem {
  taskId: string | null;
  taskTitle: string | null;
  branchName: string | null;
  assignedUserId: string | null;
  columnName: string | null;
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
  /** i18n keys of suggested actions. */
  suggestions: string[];
}

/* ---------- Files & Commits ---------- */

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

export type FileChangeType = "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";

export interface CommitFile {
  path: string;
  status: FileChangeType | string;
  additions: number;
  deletions: number;
}

/** On-demand detail for a single commit (its changed files vs its parent). */
export interface CommitDetail {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  files: CommitFile[];
  error?: string;
}

/** On-demand detail for one branch (commits + changed files vs main). */
export interface BranchDetail {
  branchName: string;
  mainBranch: string;
  commits: CommitInfo[];
  files: CommitFile[];
  totalAdditions: number;
  totalDeletions: number;
  error?: string;
}

/* ---------- AI Review ---------- */

export interface AiTaskRow {
  taskId: string;
  title: string;
  columnName: string | null;
  assignedUserId: string | null;
  riskLevel: RiskLevel;
  usedModel: string;
  checklistDone: number;
  checklistTotal: number;
}

export interface AiReviewData {
  totalAssisted: number;
  assisted: AiTaskRow[];
  withoutChecklist: AiTaskRow[];
  highRisk: AiTaskRow[];
  readyForReview: AiTaskRow[];
}

/* ---------- Impact areas ---------- */

export interface ImpactArea {
  id: string;
  name: string;
  paths: string[];
}

export interface ImpactAreaStat {
  id: string;
  name: string;
  files: number;
  branches: string[];
  tasks: string[];
  critical: boolean;
}

/* ---------- Branch Map graph (real DAG) ---------- */

export interface BranchMapCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  /** Branch names whose tip is this commit. */
  branches: string[];
}

export interface BranchMapGraph {
  mainBranch: string;
  currentBranch: string | null;
  /** Branches the board "manages" (main + dev, local + origin/) — always marked. */
  managedBranches: string[];
  commits: BranchMapCommit[];
  error?: string;
}

/** The full payload pushed to the webview for the Command Center. */
export interface DashboardData {
  generatedAt: string;
  isRepo: boolean;
  mainBranch: string;
  overview: OverviewMetrics;
  attention: AttentionItem[];
  team: TeamMemberStats[];
  branchFlow: BranchFlowRow[];
  riskRadar: RiskItem[];
  aiReview: AiReviewData;
  impact: ImpactAreaStat[];
  recentEvents: BoardEvent[];
}

export interface GitInfo {
  isRepo: boolean;
  currentBranch: string | null;
  mainBranch: string;
  remoteName: string;
  userName: string | null;
  userEmail: string | null;
  hasUncommittedChanges: boolean;
  error?: string;
}

/** Effective extension configuration, resolved from VS Code settings. */
export interface BranchBoardConfig {
  projectName: string;
  boardTitle: string;
  storageMode: "workspace-json" | "server";
  localDataFile: string;
  serverUrl: string;
  authToken: string;
  sshHost: string;
  sshPort: number;
  sqliteRemotePath: string;
  sshKeyPath: string;
  /** Allow overwriting a non-empty server board with an empty one. Data-loss guard; default false. */
  serverAllowEmptyOverwrite: boolean;
  defaultMainBranch: string;
  remoteName: string;
  autoDetectGitUser: boolean;
  autoImportGitUsers: boolean;
  syncUsersIntervalHours: number;
  currentUser: string;
  availableUsers: BoardUser[];
  syncIntervalSeconds: number;
  allowDirectMergeToMain: boolean;
  requireConfirmationBeforeMerge: boolean;
  requireCleanWorkingTreeBeforeFinish: boolean;
  runCommandBeforeFinish: string;
  deleteRemoteBranchAfterMerge: boolean;
  deleteLocalBranchAfterMerge: boolean;
  language: "pl" | "en";
  aiPromptTemplate: string;
  /** Path fragments treated as critical by the Risk Radar. */
  criticalPaths: string[];
  /** Project areas for the Impact view. */
  impactAreas: ImpactArea[];
  /** How "Update branch from main" integrates main: merge (safe) or rebase. */
  updateBranchStrategy: "merge" | "rebase";
  /** Dev/integration branch (managed by the TESTING column). */
  devBranch: string;
  /** Run the safe finish flow automatically when a task enters the DONE column. */
  finishOnMoveToDone: boolean;
  /** Allow force-deleting unmerged local branches (git branch -D). */
  allowForceDeleteBranch: boolean;
  /** Deployments (Stage 3). */
  devDeployCommand: string;
  devDeployUrlTemplate: string;
  productionBranch: string;
  productionDeployCommand: string;
  allowProductionDeploy: boolean;
  requireConfirmationBeforeProductionDeploy: boolean;
  /** Safety (Stage 3). */
  createSafetyTagBeforeMerge: boolean;
  createBackupBranchBeforeMerge: boolean;
  /** Column command hooks. */
  enableColumnHooks: boolean;
  /** Binaries column hooks are allowed to run (allowlist, no shell). */
  allowedCommands: string[];
  /** Default per-hook timeout when a hook does not specify one. */
  hookTimeoutSeconds: number;
  /** Whether the workflow uses a dev/integration branch (configurable Git model). */
  useDevBranch: boolean;
  /** Default prefix for auto-generated feature branch names. */
  defaultBranchPrefix: string;
  /** Run Git actions (branch/checkout/push/merge) driven by a column's gitStage on move. */
  runGitActionsOnMove: boolean;
  /** Ask for confirmation before destructive move-driven Git actions (merge). */
  confirmGitActionsOnMove: boolean;
  appearance: AppearanceConfig;
  titleBar: TitleBarConfig;
  notifications: NotificationSettings;
  adminAnnouncement: AdminAnnouncementConfig;
  enableAIAgentColumn: boolean;
  aiAgentColumnId: string;
  aiAgents: AIAgentDefinition[];
  requireConfirmationBeforeAIAgentRun: boolean;
  requireCleanTreeBeforeAIAgentRun: boolean;
  aiAgentTimeoutSeconds: number;
  allowedAIAgentCommands: string[];
  defaultAIBranchPrefix: string;
  moveToLocalAfterAIAgentSuccess: boolean;
  /**
   * If true, every prompt sent to an AI Agent step (Plan/Praca AI/Review) is
   * first passed through a fast/cheap "optimizer" model that rewrites it for
   * the target agent before the real run — purely a prompt-shaping pass, it
   * never executes code or touches files. Falls back to the original prompt
   * if the optimizer fails, so it can never block a run.
   */
  optimizePromptsBeforeSend: boolean;
  /** Which `aiAgents[].id` entry (CLI command/args) runs the optimization pass. Empty = use the same agent selected for the run. */
  promptOptimizerAgentId: string;
  /** Model id to request from the optimizer agent (must be in that agent's `models`). Empty = the agent's default. */
  promptOptimizerModel: string;
  /** Free-text instructions (PL/EN) given to the optimizer model describing how prompts should be technically adapted before sending. */
  promptOptimizationRules: string;

  /* ---------- AI Cost Guard / Local AI Optimizer ---------- */

  /** Overall cost posture for Cursor CLI steps; "auto" = let the rule engine + optional local model decide. */
  aiCostMode: AiCostMode;
  /** Optional local-model advisory layer that helps AiCostOptimizer pick mode/context — never executes code or Git. */
  aiLocalOptimizer: {
    enabled: boolean;
    provider: AiLocalOptimizerProvider;
    /** Binary for the "local-command" provider; must also be in branchBoard.allowedAIAgentCommands-style allowlisting handled by AiLocalModelProvider. */
    command: string;
    args: string[];
    /** Base URL for the "openai-compatible-http" provider. */
    endpoint: string;
    model: string;
    timeoutSec: number;
  };
  /** Limits/defaults for how much context BranchBoard prepares before invoking Cursor CLI. */
  aiCli: {
    defaultContextLevel: AiContextLevel;
    requireConfirmForFullContext: boolean;
    maxFilesInContext: number;
    maxPromptChars: number;
    expensiveModelsRequireConfirm: boolean;
  };
}

/** Built-in colour presets for the window title bar, matching popular themes. */
export const TITLE_BAR_PRESETS = [
  "custom",
  "default",
  "dracula",
  "oneDarkPro",
  "nightOwl",
  "monokai",
  "solarizedDark",
] as const;
export type TitleBarPreset = (typeof TITLE_BAR_PRESETS)[number];

/**
 * Window/Cursor title bar customization — the bar at the very top of the
 * editor window that normally shows the folder name or the SSH remote.
 * Implemented via two native VS Code mechanisms:
 *  - colours: merged into `workbench.colorCustomizations` (titleBar.* keys).
 *  - branch:  appended to `window.title` using the built-in
 *             `${activeRepositoryBranchName}` variable, separated visually
 *             with `branchSeparator`.
 * Note: VS Code's title bar renders as a single string with one background —
 * there is no API to give a substring (e.g. just the branch name) its own
 * background colour. `branchSeparator` is the closest practical equivalent.
 */
export interface TitleBarConfig {
  enabled: boolean;
  preset: TitleBarPreset;
  backgroundColor: string;
  foregroundColor: string;
  borderColor: string;
  inactiveBackgroundColor: string;
  inactiveForegroundColor: string;
  showBranch: boolean;
  branchSeparator: string;
  /**
   * "Branch button" — VS Code/Cursor give extensions no public API to add a
   * custom-colored button inside the native title bar itself (that's the
   * proprietary chrome where e.g. Cursor's own "Agents Window" pill lives).
   * The closest legitimate equivalent is a clickable Status Bar item, which
   * IS native VS Code chrome and DOES support a custom text color. Clicking
   * it runs branchBoard.checkoutTaskBranch (the same branch switcher used
   * elsewhere in the extension).
   */
  branchButtonEnabled: boolean;
  branchButtonColor: string;
  branchButtonBackground: BranchButtonBackground;
}

/** Status bar items only support a handful of theme-approved backgrounds
 *  (VS Code does not allow arbitrary hex backgrounds here, by design, to
 *  keep the status bar visually consistent across extensions). */
export const BRANCH_BUTTON_BACKGROUNDS = ["none", "prominent", "warning", "error"] as const;
export type BranchButtonBackground = (typeof BRANCH_BUTTON_BACKGROUNDS)[number];

/** UI appearance toggles, mirrored to the webview. */
export interface AppearanceConfig {
  compactMode: boolean;
  showBranchBadges: boolean;
  showComments: boolean;
  showChecklist: boolean;
  showAvatars: boolean;
  showPriority: boolean;
  reduceAnimations: boolean;
}

/** Per-type notification toggles, mirrored to the webview. */
export interface NotificationSettings {
  enabled: boolean;
  showToast: boolean;
  notifyTaskCreated: boolean;
  notifyCommentAdded: boolean;
  notifyAssigned: boolean;
  notifyBranchPushed: boolean;
  notifyMergeFinished: boolean;
  notifyMergeFailed: boolean;
  notifyTaskMovedToReview: boolean;
  notifyTaskDone: boolean;
  /** Play a sound alongside the bell/toast when a notification arrives. */
  soundEnabled: boolean;
  /** id of the selected sound, matches a key in NOTIFICATION_SOUNDS. */
  soundId: string;
}

export interface AdminAnnouncementConfig {
  enabled: boolean;
  id: string;
  title: string;
  message: string;
  linkUrl: string;
  linkLabel: string;
  severity: AdminAnnouncementSeverity;
}

/** Built-in notification sound files, bundled locally (no CDN). */
export const NOTIFICATION_SOUND_IDS = ["mail-alert", "bells", "double-beep"] as const;
export type NotificationSoundId = (typeof NOTIFICATION_SOUND_IDS)[number];

/** Snapshot of config the webview needs to render correctly. */
export interface AppConfig {
  language: "pl" | "en";
  projectName: string;
  boardTitle: string;
  storageMode: "workspace-json" | "server";
  /** The storage actually backing the board right now (may differ on fallback). */
  activeStorageKind: "workspace-json" | "server";
  aiPromptTemplate: string;
  /** SSH / server connection (used when storageMode === "server"). */
  ssh: {
    sshKeyPath: string;
    sshHost: string;
    sshPort: number;
    sqliteRemotePath: string;
  };
  appearance: AppearanceConfig;
  titleBar: TitleBarConfig;
  notifications: NotificationSettings;
  adminAnnouncement: AdminAnnouncementConfig;
  aiAgents: AIAgentDefinition[];
  /** webview-resolved URIs for the bundled notification sounds, keyed by id. */
  soundFiles: Record<string, string>;
  policy: {
    allowDirectMergeToMain: boolean;
    requireConfirmationBeforeMerge: boolean;
    requireCleanWorkingTreeBeforeFinish: boolean;
    runCommandBeforeFinish: string;
    defaultMainBranch: string;
    remoteName: string;
    localDataFile: string;
    syncIntervalSeconds: number;
    deleteLocalBranchAfterMerge: boolean;
    deleteRemoteBranchAfterMerge: boolean;
    criticalPaths: string[];
    impactAreas: ImpactArea[];
    updateBranchStrategy: "merge" | "rebase";
    finishOnMoveToDone: boolean;
    devDeployCommand: string;
    devDeployUrlTemplate: string;
    productionBranch: string;
    productionDeployCommand: string;
    allowProductionDeploy: boolean;
    requireConfirmationBeforeProductionDeploy: boolean;
    createSafetyTagBeforeMerge: boolean;
    createBackupBranchBeforeMerge: boolean;
    enableColumnHooks: boolean;
    allowedCommands: string[];
    hookTimeoutSeconds: number;
    useDevBranch: boolean;
    defaultBranchPrefix: string;
    /** Dev/integration branch (managed by the staging column), mirrors the host setting. */
    devBranch: string;
    /** Whether moving a task between columns triggers the column's Git automation. */
    runGitActionsOnMove: boolean;
    /** Whether move-driven Git actions ask for confirmation before running. */
    confirmGitActionsOnMove: boolean;
    enableAIAgentColumn: boolean;
    aiAgentColumnId: string;
    requireConfirmationBeforeAIAgentRun: boolean;
    requireCleanTreeBeforeAIAgentRun: boolean;
    aiAgentTimeoutSeconds: number;
    allowedAIAgentCommands: string[];
    defaultAIBranchPrefix: string;
    moveToLocalAfterAIAgentSuccess: boolean;
    optimizePromptsBeforeSend: boolean;
    promptOptimizerAgentId: string;
    promptOptimizerModel: string;
    promptOptimizationRules: string;
    aiCostMode: AiCostMode;
    /** Whether a local optimizer model is configured/enabled — the command/endpoint themselves stay host-side only. */
    aiLocalOptimizerEnabled: boolean;
    aiLocalOptimizerProvider: AiLocalOptimizerProvider;
    aiCli: {
      defaultContextLevel: AiContextLevel;
      requireConfirmForFullContext: boolean;
      maxFilesInContext: number;
      maxPromptChars: number;
      expensiveModelsRequireConfirm: boolean;
    };
  };
}

/* ---------- Webview <-> Extension message protocol ---------- */

export type InboundMessageType =
  | "ready"
  | "createTask"
  | "updateTask"
  | "deleteTask"
  | "moveTask"
  | "addColumn"
  | "renameColumn"
  | "deleteColumn"
  | "moveColumn"
  | "saveColumnConfig"
  | "runColumnHooks"
  | "addComment"
  | "assignUser"
  | "createBranch"
  | "checkoutBranch"
  | "pushBranch"
  | "finishTask"
  | "mergeToMain"
  | "getGitInfo"
  | "getTaskBranchState"
  | "runTaskVerification"
  | "generateAIAgentPrompt"
  | "runAIAgentPlan"
  | "runAIAgent"
  | "runAIAgentReview"
  | "acceptAIAgentResult"
  | "rejectAIAgentResult"
  | "cancelAIAgent"
  | "changeUser"
  | "syncUsers"
  | "selectSshKey"
  | "openConfig"
  | "copyToClipboard"
  | "saveSettings"
  | "createBoard"
  | "addUser"
  | "deleteUser"
  | "updateUser"
  | "syncNow"
  | "getDashboardData"
  | "getBranchDetail"
  | "openFile"
  | "openDiff"
  | "searchFiles"
  | "getCursorAgents"
  | "listAIAgentModels"
  | "getBranchMapGraph"
  | "getCommitDetail"
  | "openCommitDiff"
  | "updateBranchFromMain"
  | "openExternal"
  | "deployDev"
  | "deployProduction"
  | "markTested"
  | "createBackupBranch"
  | "createSafetyTag"
  | "revertLastCommit"
  | "revertFromOrigin"
  | "deleteLocalBranch"
  | "deleteRemoteBranch"
  | "archiveBranch"
  | "bulkDeleteLocalBranches"
  | "testConnection"
  | "showLogs"
  | "logEvent"
  | "markNotificationRead"
  | "markAllNotificationsRead"
  | "markTaskCommentsRead"
  | "markAnnouncementRead"
  | "refresh"
  | "getAiCostDecision";

export interface InboundMessage {
  type: InboundMessageType;
  requestId?: string;
  payload?: any;
}

export type OutboundMessageType =
  | "boardData"
  | "gitInfo"
  | "appConfig"
  | "dashboardData"
  | "branchDetail"
  | "connectionStatus"
  | "fileList"
  | "cursorAgents"
  | "aiAgentModelsResult"
  | "branchMapGraph"
  | "commitDetail"
  | "columnHookResult"
  | "taskBranchState"
  | "taskVerificationResult"
  | "aiAgentResult"
  | "aiAgentLog"
  | "aiAgentLifecycle"
  | "navigate"
  | "operationResult"
  | "error"
  | "toast"
  | "notification"
  | "aiCostDecision";

export interface OutboundMessage {
  type: OutboundMessageType;
  requestId?: string;
  payload?: any;
}

/** Result of a git/board operation reported back to the webview. */
export interface OperationResult {
  ok: boolean;
  action: string;
  message: string;
  detail?: string;
}

/**
 * Result of a "listAIAgentModels" request: either a freshly CLI-discovered
 * model list for the agent, or a clear reason why none could be fetched
 * (missing listModelsArgs, command not allowed/found, CLI exited non-zero,
 * or output that couldn't be parsed into a model list). BranchBoard never
 * guesses a model list any more than it guesses a price — `models` is only
 * ever populated when the CLI actually reported something parseable.
 */
export interface AIAgentModelsResultPayload {
  agentId: string;
  ok: boolean;
  /** Model ids/slugs parsed from the CLI's output, if any. */
  models: string[];
  /** Models already configured (in `models` or `modelPricing`) that have no usable pricing rate set. */
  modelsMissingPrice: string[];
  message?: string;
  detail?: string;
}

/**
 * Live branch-location payload for a single task, sent in response to
 * "getTaskBranchState". Drives the badge row above the task title — see
 * BranchLocationState for what each state means.
 */
export interface TaskBranchStatePayload {
  taskId: string;
  branchName: string;
  state: BranchLocationState;
  existsLocal: boolean;
  existsRemote: boolean;
  ahead: number;
  behind: number;
}

/**
 * One live chunk of an AI agent's stdout/stderr, streamed to the webview as
 * soon as it's produced by the child process (see AIAgentService.run +
 * BoardPanel.runAIAgentWorkflow). The webview appends these into a
 * Cursor-chat-like scrolling console for the task that's currently running
 * an agent — they are NOT persisted to board.json, this is a transient,
 * in-memory log only.
 */
export interface AIAgentLogPayload {
  taskId: string;
  kind: "plan" | "run" | "review";
  stream: "stdout" | "stderr" | "system";
  text: string;
}

/**
 * Lifecycle event for one AI agent run, used by the webview to know exactly
 * when to lock/unlock the run buttons and show/hide the live console — this
 * is the authoritative "is an agent busy right now" signal, independent of
 * the task's persisted aiAgents.status (which only updates once per run,
 * not per chunk).
 */
export interface AIAgentLifecyclePayload {
  taskId: string;
  kind: "plan" | "run" | "review";
  phase: "started" | "finished" | "failed" | "cancelled";
  message?: string;
}

/**
 * Result of running the configured "rules check" command for a task whose
 * branch is on origin (see GitService.runCommand). `command` is empty when
 * branchBoard.runCommandBeforeFinish isn't configured — the webview shows a
 * "set it up" hint instead of a pass/fail in that case.
 */
export interface TaskVerificationResultPayload {
  taskId: string;
  ok: boolean;
  command: string;
  message: string;
  detail: string;
  ranAt: string;
}

/**
 * Request for "getAiCostDecision": the webview sends the chat message the
 * user is about to send for a task, plus (optionally) a manual override of
 * the chosen action — used by the "Tylko przygotuj prompt" / "Uruchom Cursor
 * CLI" buttons once the user has already seen and accepted a decision.
 */
export interface AiCostDecisionRequestPayload {
  taskId: string;
  userMessage: string;
  /** Manual override (e.g. user clicked "Run Cursor CLI" directly) — skips re-asking the local model for the action. */
  forceAction?: AiDecisionAction;
  /** User asked to shrink the context after seeing a "full" decision. */
  forceContextLevel?: AiContextLevel;
  /** Confirms a previously returned decision that required confirmation (full context / high risk / expensive model). */
  confirmed?: boolean;
}

/** Response payload for "getAiCostDecision", sent back as the "aiCostDecision" outbound message. */
export interface AiCostDecisionPayload extends AiCostDecision {
  taskId: string;
  /** Whether AiLocalModelProvider was actually consulted (false = pure rules engine, or the local model failed/was disabled). */
  usedLocalModel: boolean;
  /** Set when the local model was configured but failed/timed out/returned invalid output — the rules-only decision was used instead. */
  localModelError?: string;
}
