/**
 * Shared data model for BranchBoard (extension side).
 * The webview keeps an identical copy in webview/src/types.ts.
 */

export type TaskStatus = "open" | "in-progress" | "done";

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
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
  comments: TaskComment[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: TaskStatus;
}

export interface BoardData {
  version: number;
  projectName: string;
  boardTitle: string;
  columns: BoardColumn[];
  users: BoardUser[];
  tasks: BoardTask[];
  /** Bumped on every save so external watchers can detect change ordering. */
  updatedAt?: string;
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
  defaultMainBranch: string;
  remoteName: string;
  autoDetectGitUser: boolean;
  currentUser: string;
  availableUsers: BoardUser[];
  syncIntervalSeconds: number;
  allowDirectMergeToMain: boolean;
  requireConfirmationBeforeMerge: boolean;
  requireCleanWorkingTreeBeforeFinish: boolean;
  runCommandBeforeFinish: string;
  deleteRemoteBranchAfterMerge: boolean;
  deleteLocalBranchAfterMerge: boolean;
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
  | "addComment"
  | "assignUser"
  | "createBranch"
  | "checkoutBranch"
  | "pushBranch"
  | "finishTask"
  | "mergeToMain"
  | "getGitInfo"
  | "changeUser"
  | "openConfig"
  | "refresh";

export interface InboundMessage {
  type: InboundMessageType;
  requestId?: string;
  payload?: any;
}

export type OutboundMessageType =
  | "boardData"
  | "gitInfo"
  | "operationResult"
  | "error"
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
