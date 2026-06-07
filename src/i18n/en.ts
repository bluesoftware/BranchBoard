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
  notServerMode: "BranchBoard: storage mode is not set to 'Server'. Change it in settings to connect over SSH.",
  deleteTaskConfirm: 'Delete task "{title}"?',
  deleteUserConfirm: 'Delete user "{name}"? Tasks assigned to them will be unassigned.',
  delete: "Delete",
  yes: "Yes",
  prefix: "BranchBoard: {message}",
};
