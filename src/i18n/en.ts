import type { ExtMessages } from "./pl";

/** English messages used on the extension host side (VS Code notifications). */
export const en: ExtMessages = {
  needWorkspace:
    "BranchBoard needs an open folder/workspace. Open your project folder and try again.",
  finishHint: "Use the 'Finish task' button on a task card to finish it safely.",
  serverInvalid: "BranchBoard: invalid server config — {error}. Using local JSON.",
  serverUnreachable:
    "BranchBoard: could not reach the server over SSH — {error}. Using local JSON until it's reachable.",
  loadFailed: "BranchBoard: failed to load board — {error}",
  syncFailed: "BranchBoard: sync failed — {error}",
  taskTitlePrompt: "Task title",
  selectTaskBranch: "Select a task branch to checkout",
  noGitRepo: "BranchBoard: no Git repository in this workspace.",
  branchNotPushedPublic:
    "This task does not have a publicly pushed branch on {remote} yet. Push the branch first.",
  productionRollbackLocked:
    "On the production server with local SQLite, tasks cannot be moved back from Production. Move them from a local SSH client.",
  productionChecklistIncomplete:
    "A task cannot be moved to Production until all subtasks are done.",
  productionChecklistLocked:
    "Subtasks are locked in the Production column and cannot be edited.",
  productionRollbackNeedsBranch:
    "To move a task back from Production, the task must have a linked branch.",
  productionRollbackRecreated:
    "Branch '{branch}' no longer existed locally or on {remote}, so it was recreated from the current '{main}' — work can resume on it. Nothing on {remote}/{main} was deleted.",
  usersImported: "BranchBoard: imported {count} user(s) from Git.",
  usersUpToDate: "BranchBoard: users are up to date with Git.",
  userSyncFailed: "BranchBoard: user sync failed — {error}",
  selectSshKey: "Select the SSH private key for Git / server connections",
  sshDefault: "Default (SSH agent / ~/.ssh/config)",
  sshClear: "Clear the configured key",
  sshBrowse: "Browse…",
  sshBrowseHint: "Pick a key file from anywhere",
  sshUseKey: "Use this SSH key",
  sshReadFail: "BranchBoard: could not read {dir}. Does the .ssh folder exist?",
  sshUsing: "BranchBoard: using SSH key {key}",
  sshCleared: "BranchBoard: cleared SSH key (using default).",
  retry: "Retry",
  selectSshKeyAction: "Select SSH key",
  openSettings: "Open settings",
  serverReconnected: "BranchBoard: connected to the server (SSH / SQLite). Board loaded from the shared database.",
  serverNoBoardMessage:
    "BranchBoard: connected to the server, but it has no board yet. Nothing was written. Create a new board to get started.",
  serverNoBoardCreate: "Create board",
  notServerMode: "BranchBoard: storage mode is not set to 'Server'. Change it in settings to connect over SSH.",
  deleteTaskConfirm: 'Delete task "{title}"?',
  deleteUserConfirm: 'Delete user "{name}"? Tasks assigned to them will be unassigned.',
  delete: "Delete",
  yes: "Yes",
  prefix: "BranchBoard: {message}",
  notifTaskCreatedTitle: "New task",
  notifTaskCreatedBody: 'New task created: "{title}"',
  notifCommentAddedTitle: "New chat message",
  notifCommentAddedBody: 'New chat message on "{title}"',
  notifAssignedTitle: "Assigned to you",
  notifAssignedBody: 'You were assigned to "{title}"',
  notifBranchPushedTitle: "Branch pushed",
  notifBranchPushedBody: "Branch {branch} was pushed to the remote.",
  notifMergeFinishedTitle: "Merge finished",
  notifMergeFinishedBody: '"{title}" was merged successfully.',
  notifMergeFailedTitle: "Merge failed",
  notifMergeFailedBody: 'Finishing/merging "{title}" failed — check the error for details.',
  notifTaskMovedToReviewTitle: "Ready for review",
  notifTaskMovedToReviewBody: '"{title}" moved to review/testing.',
  notifTaskDoneTitle: "Task done",
  notifTaskDoneBody: '"{title}" was marked as done.',
  notifOpenTaskAction: "Open task",
};
