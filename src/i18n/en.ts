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
  "aiAgent.promptGenerated": "AI Agent prompt generated.",
  "aiAgent.confirmRunTitle": "Run the AI agent for this task?",
  "aiAgent.confirmRunAction": "Run agent",
  "aiAgent.confirmRunDetail":
    "The agent may change local files on the shown branch. BranchBoard will not push, merge, deploy or delete branches.",
  "aiAgent.noAgentSelected": "Select at least one enabled AI agent before running.",
  "aiAgent.dirtyTree": "You have local changes. Commit or stash them before running the agent.",
  "aiAgent.agent": "Agent",
  "aiAgent.command": "Command",
  "aiAgent.branch": "Branch",
  "aiAgent.promptFile": "Prompt file",
  "aiAgent.cancelled": "AI agent run cancelled.",
  "aiAgent.rejected": "AI result was rejected by the user.",
  "aiAgent.moveMissingConfig":
    "Enable AI handling and select an agent in the task drawer first.",
  "aiAgent.commandBlocked": "AI agent command '{command}' is not allowed.",
  "aiAgent.commandBlockedDetail":
    "Add the exact binary name or absolute path to branchBoard.allowedAIAgentCommands only if you trust it.",
  "aiAgent.commandMissing": "AI agent command '{command}' was not found.",
  "aiAgent.commandMissingDetail":
    "Install the agent CLI or update branchBoard.aiAgents to an installed binary. BranchBoard searched PATH and common tool folders: {paths}",
  "aiAgent.commandMissingAbsoluteDetail":
    "The configured absolute path does not exist or is not executable. Install the agent CLI or update branchBoard.aiAgents and branchBoard.allowedAIAgentCommands.",
  "aiAgent.timedOut": "The agent did not respond within {seconds}s and was stopped.",
  "aiAgent.cancelledByUser": "The agent was stopped by the user.",
  "aiAgent.modelsNoListCommand":
    "Agent '{name}' has no model-listing command configured (listModelsArgs) — add one in branchBoard.aiAgents if its CLI supports it.",
  "aiAgent.modelsFetchFailed": "Failed to fetch the model list for agent '{name}'.",
  "aiAgent.modelsUnparseable": "Agent '{name}''s CLI returned output that couldn't be recognized as a model list.",
  "aiAgent.alreadyRunning": "An agent is already running for this task — wait for it to finish or stop it.",
  "aiAgent.stopRequested": "Stop request sent to the agent.",
  "aiAgent.noActiveRun": "This agent is not currently running.",
  "aiAgent.consoleResultHeading": "Result",
  "aiAgent.consoleUsageLine":
    "📊 Tokens: input {input} • output {output} • cache read {cacheRead} • cache write {cacheWrite}",
  "aiAgent.optimizeFailed": "Prompt optimization with agent '{name}' failed — the original prompt was used instead.",
  "aiAgent.optimizeEmpty": "Agent '{name}' returned an empty prompt-optimization result — the original prompt was used instead.",
  "aiAgent.promptOptimized": "The prompt was optimized before sending (model: {name}).",
};
