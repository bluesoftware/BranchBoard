// Mirror of the extension-side data model (src/types.ts).

export type TaskStatus = "open" | "in-progress" | "done";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export type TaskType = "feature" | "bugfix" | "hotfix" | "chore" | "refactor" | "docs";

export const TASK_TYPES: TaskType[] = ["feature", "bugfix", "hotfix", "chore", "refactor", "docs"];

export type GitStage = "none" | "feature" | "review" | "staging" | "production";

export interface ColumnHook {
  id: string;
  label: string;
  command: string;
  args: string[];
  requireConfirm: boolean;
  requireCleanTree: boolean;
  continueOnError: boolean;
  timeoutSec: number;
  blocking: boolean;
  enabled: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  nameEn?: string;
  gitStage?: GitStage;
  baseBranch?: string;
  targetBranch?: string;
  branchPrefix?: string;
  wipLimit?: number;
  onEnter?: ColumnHook[];
  onLeave?: ColumnHook[];
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

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  columnId: string;
  position: number;
  assignedUserId: string | null;
  branchName: string;
  priority: TaskPriority;
  taskType?: TaskType;
  comments: TaskComment[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  acceptanceCriteria?: string;
  attachedFiles?: string[];
  ai?: TaskAI;
}

export interface TaskAI {
  createdByAi: boolean;
  usedModel: string;
  generatedPrompt: string;
  aiNotes: string;
  reviewChecklist: ChecklistItem[];
}

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
  | "dev_deploy_failed";

export interface BoardEvent {
  id: string;
  type: BoardEventType;
  taskId?: string | null;
  branchName?: string | null;
  userId?: string | null;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export type NotificationType =
  | "task_created"
  | "comment_added"
  | "assigned_to_you"
  | "branch_pushed"
  | "merge_finished"
  | "merge_failed"
  | "task_moved_to_review"
  | "task_done";

export interface BoardNotificationRecord {
  id: string;
  type: NotificationType;
  taskId: string | null;
  branchName: string | null;
  actorUserId: string | null;
  recipientUserIds: string[];
  readBy: string[];
  title: string;
  message: string;
  createdAt: string;
}

export type DeploymentEnvironment = "dev" | "staging" | "production";
export type DeploymentStatus = "not_deployed" | "deploying" | "deployed" | "failed";

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
  tested: boolean;
}

export interface BoardData {
  version: number;
  projectName: string;
  boardTitle: string;
  columns: BoardColumn[];
  users: BoardUser[];
  tasks: BoardTask[];
  events: BoardEvent[];
  deployments: Deployment[];
  notifications: BoardNotificationRecord[];
  updatedAt?: string;
}

/* ---------- Command Center computed analytics ---------- */

export type RiskLevel = "low" | "medium" | "high" | "critical";

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
  changedFiles: string[];
  hasConflicts: "true" | "false" | "unknown";
  deployedToDev: boolean;
  readyToMerge: boolean;
}

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

export interface AttentionItem {
  id: string;
  reasonKey: string;
  params?: Record<string, string | number>;
  severity: RiskLevel;
  taskId?: string | null;
  branchName?: string | null;
}

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

export interface BranchFlowRow {
  branchName: string;
  taskId: string | null;
  taskTitle: string | null;
  assignedUserId: string | null;
  columnId: string | null;
  columnName: string | null;
  info: BranchInfo;
  riskLevel: RiskLevel;
  stages: BranchPipelineStages;
  stale: boolean;
}

export interface RiskReason {
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
  suggestions: string[];
}

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

export interface CommitDetail {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  files: CommitFile[];
  error?: string;
}

export interface BranchDetail {
  branchName: string;
  mainBranch: string;
  commits: CommitInfo[];
  files: CommitFile[];
  totalAdditions: number;
  totalDeletions: number;
  error?: string;
}

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

export interface BranchMapCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  branches: string[];
}

export interface BranchMapGraph {
  mainBranch: string;
  currentBranch: string | null;
  managedBranches: string[];
  commits: BranchMapCommit[];
  error?: string;
}

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

export interface AppearanceConfig {
  compactMode: boolean;
  showBranchBadges: boolean;
  showComments: boolean;
  showChecklist: boolean;
  showAvatars: boolean;
  showPriority: boolean;
  reduceAnimations: boolean;
}

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
  /** id of the selected sound, matches a key in NOTIFICATION_SOUND_IDS / soundFiles. */
  soundId: string;
}

/** Built-in notification sound files, bundled locally (no CDN). */
export const NOTIFICATION_SOUND_IDS = ["mail-alert", "bells", "double-beep"] as const;
export type NotificationSoundId = (typeof NOTIFICATION_SOUND_IDS)[number];

export interface ConnectionStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  mode: "local" | "ssh";
  target: string;
  steps: ConnectionStep[];
  /** Present when the test could not even start (e.g. not in server mode). */
  message?: string;
}

export interface AppConfig {
  language: "pl" | "en";
  projectName: string;
  boardTitle: string;
  storageMode: "workspace-json" | "server";
  activeStorageKind: "workspace-json" | "server";
  aiPromptTemplate: string;
  ssh: {
    sshKeyPath: string;
    sshHost: string;
    sshPort: number;
    sqliteRemotePath: string;
  };
  appearance: AppearanceConfig;
  notifications: NotificationSettings;
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
  };
}

/** Toast notification rendered in the webview. */
export interface ToastMessage {
  id: string;
  kind: "success" | "error" | "warning" | "info";
  text: string;
  detail?: string;
}

export type UserFilter =
  | "all"
  | "me"
  | "unassigned"
  | "current-branch"
  | "has-branch"
  | "no-branch"
  | "needs-review"
  | "done"
  | string;
