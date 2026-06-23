# Settings Reference

All settings live under `branchBoard.*`. They can be edited in VS Code settings
or through the BranchBoard Settings drawer where supported.

This document groups settings by product area rather than by the order in
`package.json`.

## Project And Storage

| Setting | Default | Meaning |
| --- | --- | --- |
| `projectName` | `BranchBoard` | Project name stored in board data. |
| `boardTitle` | `BranchBoard` | Title displayed in the UI. |
| `storageMode` | `workspace-json` | `workspace-json` or `server`. |
| `localDataFile` | `.branchboard/board.json` | Workspace-relative local board file. |
| `syncIntervalSeconds` | `20` | Poll/sync interval. |

## Server Mode

| Setting | Default | Meaning |
| --- | --- | --- |
| `sshHost` | `""` | Empty = local SQLite. Non-empty = SSH target. |
| `sshPort` | `22` | SSH port. |
| `sqliteRemotePath` | `~/sqlite/branchboard.db` | SQLite DB path on target machine. |
| `sshKeyPath` | `""` | Optional private key path. Empty uses SSH agent/config. |
| `serverAllowEmptyOverwrite` | `false` | Allows replacing non-empty server board with empty board. Keep off except intentional reset. |
| `serverUrl` | `""` | Deprecated legacy HTTP field. |
| `authToken` | `""` | Deprecated legacy HTTP token. |

See [SERVER_MODE.md](SERVER_MODE.md).

## Git Identity And Users

| Setting | Default | Meaning |
| --- | --- | --- |
| `autoDetectGitUser` | `true` | Match current user from `git config user.name/user.email`. |
| `autoImportGitUsers` | `true` | Import commit authors into board users. |
| `syncUsersIntervalHours` | `24` | How often to re-scan Git authors. `0` means startup/manual only. |
| `currentUser` | `""` | Manual current user id override. |
| `availableUsers` | `[]` | Seed users for a new board. |

## Git Policy

| Setting | Default | Meaning |
| --- | --- | --- |
| `defaultMainBranch` | `main` | Main branch used by finish/merge. |
| `remoteName` | `origin` | Remote used for push/pull/delete. |
| `devBranch` | `dev` | Integration/staging branch. |
| `useDevBranch` | `true` | Treat `devBranch` as a real lifecycle stage. |
| `defaultBranchPrefix` | `feature/` | Default prefix for generated feature branches. |
| `updateBranchStrategy` | `merge` | `merge` or `rebase` when updating from main. |
| `runGitActionsOnMove` | `true` | Moving between Git-stage columns can run Git actions. |
| `confirmGitActionsOnMove` | `true` | Ask before destructive/important move-driven Git actions. |
| `finishOnMoveToDone` | `false` | Legacy option: run finish when moving to Done if stage automation is off. |

## Finish And Merge Safety

| Setting | Default | Meaning |
| --- | --- | --- |
| `allowDirectMergeToMain` | `false` | Allows BranchBoard to merge task branch into main. |
| `requireConfirmationBeforeMerge` | `true` | Explicit modal before merging into main. |
| `requireCleanWorkingTreeBeforeFinish` | `true` | Refuse finish on dirty working tree. |
| `runCommandBeforeFinish` | `""` | Optional build/test/rules command before finish. |
| `createBackupBranchBeforeMerge` | `true` | Create `backup/<branch>-<timestamp>` before merge. |
| `createSafetyTagBeforeMerge` | `false` | Create `before-merge-<task>-<timestamp>` tag. |
| `deleteLocalBranchAfterMerge` | `false` | Delete local branch only after successful merge/push. |
| `deleteRemoteBranchAfterMerge` | `false` | Delete remote branch only after successful merge/push. |
| `allowForceDeleteBranch` | `false` | Allows confirmed force delete for unmerged local branches. |

See [SAFETY.md](SAFETY.md).

## Column Workflow And Hooks

| Setting | Default | Meaning |
| --- | --- | --- |
| `enableColumnHooks` | `true` | Enables per-column `onEnter` / `onLeave` hooks. |
| `allowedCommands` | `["npm","pnpm","yarn","npx","node","git","make"]` | Binaries hooks may run. Bare binary names only. |
| `hookTimeoutSeconds` | `120` | Default per-hook timeout. |

Column-level data stored in board columns:

- `gitStage`
- `baseBranch`
- `targetBranch`
- `branchPrefix`
- `wipLimit`
- `onEnter`
- `onLeave`

See [COLUMN_WORKFLOW.md](COLUMN_WORKFLOW.md).

## Deployments

| Setting | Default | Meaning |
| --- | --- | --- |
| `devDeployCommand` | `""` | Command for Deploy to DEV. |
| `devDeployUrlTemplate` | `""` | URL template for Open DEV. |
| `productionBranch` | `main` | Branch treated as production. |
| `productionDeployCommand` | `""` | Command for production deploy. |
| `allowProductionDeploy` | `false` | Must be true to enable production deploy. |
| `requireConfirmationBeforeProductionDeploy` | `true` | Confirm before production deploy. |

Placeholders:

- `{{branchName}}`
- `{{branchSlug}}`

See [DEPLOYMENTS.md](DEPLOYMENTS.md).

## Risk And Impact

| Setting | Default | Meaning |
| --- | --- | --- |
| `criticalPaths` | checkout/payment/auth/etc. | Path fragments treated as risky. |
| `impactAreas` | checkout/auth/admin/database/seo | Named path groups for the Impact dashboard. |

These settings drive Risk Radar and Impact without AI or network calls.

## AI Prompting

| Setting | Default | Meaning |
| --- | --- | --- |
| `aiPromptTemplate` | built-in long PL template | Template for Copy AI Prompt. |
| `enableAIAgentColumn` | `false` in manifest, normalized by config reader | Adds/removes the system AI Agent column. |
| `aiAgentColumnId` | `ai-agent` | ID of the AI Agent column. |
| `defaultAIBranchPrefix` | `ai/` | Prefix for AI-created branches. |
| `moveToLocalAfterAIAgentSuccess` | `true` | Move task to local work column after successful AI run. |
| `optimizePromptsBeforeSend` | `false` | Optional prompt-rewrite pass before real AI run. |
| `promptOptimizerAgentId` | `""` | Agent used for optimization. Empty = selected task agent. |
| `promptOptimizerModel` | `""` | Model used by optimizer. |
| `promptOptimizationRules` | PL/EN default rules | Rules for text-only prompt optimization. |

Template variables for `aiPromptTemplate`:

- `{title}`
- `{description}`
- `{branch}`
- `{project}`
- `{acceptance}`
- `{files}`
- `{checklist}`
- `{comments}`
- `{command}`

## AI Agents

| Setting | Default | Meaning |
| --- | --- | --- |
| `aiAgents` | Cursor Agent enabled, Claude CLI disabled | CLI agent definitions. |
| `requireConfirmationBeforeAIAgentRun` | `true` | Confirm before Plan/Work/Review execution. |
| `requireCleanTreeBeforeAIAgentRun` | `true` | Refuse AI run on dirty tree. |
| `aiAgentTimeoutSeconds` | `900` | Max runtime for AI agent process. |
| `allowedAIAgentCommands` | `["cursor-agent","claude","node","npm","pnpm"]` | Allowed AI runner binaries. |

Agent definition fields:

- `id`
- `name`
- `command`
- `args`
- `enabled`
- `allowModels`
- `models`
- `pricing`
- `modelPricing`
- `listModelsArgs`

BranchBoard never invents model lists or costs. Model lists come from
`listModelsArgs`; cost estimates require usage from the agent and configured
pricing.

## AI Cost Guard

| Setting | Default | Meaning |
| --- | --- | --- |
| `aiCostMode` | `auto` | `auto`, `cheap`, `balanced`, `quality`, `manual`. |
| `aiLocalOptimizer.enabled` | `false` | Enable optional local advisory model. |
| `aiLocalOptimizer.provider` | `local-command` | `local-command` or `openai-compatible-http`. |
| `aiLocalOptimizer.command` | `""` | Local command provider binary. |
| `aiLocalOptimizer.args` | `[]` | Args for local command provider. |
| `aiLocalOptimizer.endpoint` | `""` | OpenAI-compatible base endpoint. |
| `aiLocalOptimizer.model` | `""` | Model id for advisory call. |
| `aiLocalOptimizer.timeoutSec` | `30` | Advisory model timeout. |
| `aiCli.defaultContextLevel` | `normal` | `small`, `normal` or `full`. |
| `aiCli.requireConfirmForFullContext` | `true` | Confirm before full context. |
| `aiCli.maxFilesInContext` | `12` | Context file cap. |
| `aiCli.maxPromptChars` | `60000` | Prompt cap. |
| `aiCli.expensiveModelsRequireConfirm` | `true` | Confirm before expensive model preference. |

The local optimizer is advisory only. It cannot run Git, commands or agent work.

## Appearance

| Setting | Default | Meaning |
| --- | --- | --- |
| `language` | `pl` | `pl` or `en`. |
| `appearance.compactMode` | `false` | Denser UI. |
| `appearance.showBranchBadges` | `true` | Show branch badges on cards. |
| `appearance.showComments` | `true` | Show comment counts. |
| `appearance.showChecklist` | `true` | Show checklist progress. |
| `appearance.showAvatars` | `true` | Show avatars. |
| `appearance.showPriority` | `true` | Show priority badges. |
| `appearance.reduceAnimations` | `false` | Reduce UI motion. |

## Title Bar And Status Bar

| Setting | Default | Meaning |
| --- | --- | --- |
| `titleBar.enabled` | `false` | Apply workspace title bar colors/title. |
| `titleBar.preset` | `default` | `custom`, `default`, `dracula`, `oneDarkPro`, `nightOwl`, `monokai`, `solarizedDark`. |
| `titleBar.backgroundColor` | `#1f1f1f` | Active background for custom preset. |
| `titleBar.foregroundColor` | `#cccccc` | Active foreground. |
| `titleBar.borderColor` | `#000000` | Border. |
| `titleBar.inactiveBackgroundColor` | `#181818` | Inactive background. |
| `titleBar.inactiveForegroundColor` | `#6b6b6b` | Inactive foreground. |
| `titleBar.showBranch` | `true` | Append `${activeRepositoryBranchName}` to window title. |
| `titleBar.branchSeparator` | `  ⎇ ` | Separator before branch name. |
| `titleBar.branchButtonEnabled` | `true` | Show native status bar branch button equivalent. |
| `titleBar.branchButtonColor` | `#ffffff` | Status bar item foreground. |
| `titleBar.branchButtonBackground` | `prominent` | `none`, `prominent`, `warning`, `error`. |

VS Code does not expose an API for arbitrary styled substrings inside the native
title bar. BranchBoard uses supported color customizations, window title text and
status bar items.

## Notifications

| Setting | Default | Meaning |
| --- | --- | --- |
| `notifications.enabled` | `true` | Master switch. |
| `notifications.showToast` | `true` | Native VS Code toast in addition to bell. |
| `notifications.notifyTaskCreated` | `true` | Notify on task creation. |
| `notifications.notifyCommentAdded` | `true` | Notify on comments. |
| `notifications.notifyAssigned` | `true` | Notify assignee. |
| `notifications.notifyBranchPushed` | `true` | Notify branch push. |
| `notifications.notifyMergeFinished` | `true` | Notify successful merge. |
| `notifications.notifyMergeFailed` | `true` | Notify failed merge. |
| `notifications.notifyTaskMovedToReview` | `true` | Notify review move. |
| `notifications.notifyTaskDone` | `true` | Notify done. |
| `notifications.soundEnabled` | `true` | Play bundled sound. |
| `notifications.soundId` | `mail-alert` | `mail-alert`, `bells`, `double-beep`. |

Sounds are local files under `webview/public/sounds`.

## Admin Announcements

| Setting | Default | Meaning |
| --- | --- | --- |
| `adminAnnouncement.enabled` | `false` | Publish synced announcement. |
| `adminAnnouncement.id` | `""` | Stable announcement id. |
| `adminAnnouncement.title` | `""` | Title. |
| `adminAnnouncement.message` | `""` | Body. |
| `adminAnnouncement.linkUrl` | `""` | Optional link. |
| `adminAnnouncement.linkLabel` | `""` | Link label. |
| `adminAnnouncement.severity` | `info` | `info`, `warning`, `critical`. |

Announcements are stored in board data and track per-user read state.

## Recommended Baseline For A Team

```jsonc
{
  "branchBoard.language": "pl",
  "branchBoard.defaultMainBranch": "main",
  "branchBoard.devBranch": "dev",
  "branchBoard.remoteName": "origin",
  "branchBoard.runCommandBeforeFinish": "npm run build",
  "branchBoard.allowDirectMergeToMain": false,
  "branchBoard.requireCleanWorkingTreeBeforeFinish": true,
  "branchBoard.createBackupBranchBeforeMerge": true,
  "branchBoard.runGitActionsOnMove": true,
  "branchBoard.confirmGitActionsOnMove": true
}
```

Enable direct merge only after the team agrees how production merges should work.
