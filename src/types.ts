/**
 * Shared data model for BranchBoard (extension side).
 * The webview keeps an identical copy in webview/src/types.ts.
 */

export type TaskStatus = "open" | "in-progress" | "done";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

/**
 * Where a column sits in the Git lifecycle. Drives branch naming + merge
 * targets and lets the board reason about "what does main/dev/feature mean here".
 *  - none:       no branch involved (Backlog / To Do).
 *  - feature:    work happens on origin/<prefix><branch>, cut from baseBranch.
 *  - review:     branch is pushed; a PR/code-review is expected.
 *  - staging:    integrated into the dev/integration branch (e.g. origin/dev).
 *  - production: released into the production branch (e.g. origin/main).
 */
export type GitStage = "none" | "feature" | "review" | "staging" | "production";

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

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  columnId: string;
  position: number;
  assignedUserId: string | null;
  branchName: string;
  priority: TaskPriority;
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
  | "branch_updated_from_main";

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
}

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
  | "changeUser"
  | "syncUsers"
  | "selectSshKey"
  | "openConfig"
  | "copyToClipboard"
  | "saveSettings"
  | "createBoard"
  | "addUser"
  | "deleteUser"
  | "syncNow"
  | "getDashboardData"
  | "getBranchDetail"
  | "openFile"
  | "openDiff"
  | "searchFiles"
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
  | "deleteLocalBranch"
  | "deleteRemoteBranch"
  | "archiveBranch"
  | "bulkDeleteLocalBranches"
  | "testConnection"
  | "showLogs"
  | "logEvent"
  | "refresh";

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
  | "branchMapGraph"
  | "commitDetail"
  | "columnHookResult"
  | "navigate"
  | "operationResult"
  | "error"
  | "toast"
  | "notification";

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
