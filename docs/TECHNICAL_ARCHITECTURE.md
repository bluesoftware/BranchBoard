# Technical Architecture

BranchBoard is a VS Code / Cursor extension with a React WebView UI. The
architecture is intentionally split into small services so local JSON storage can
coexist with a future shared server backend and so Git operations stay isolated
from UI state.

## Runtime Shape

```text
VS Code Extension Host
  src/extension.ts
    reads configuration
    builds storage
    creates BoardService and GitService
    registers commands and WebView providers

  src/panel/BoardPanel.ts
    owns WebView HTML
    bridges messages between WebView and services
    coordinates confirmations, toasts and native VS Code APIs

  src/services/*
    board mutation
    storage
    Git
    analytics
    AI agent execution
    deployment
    safety
    notifications
    title/status bar

WebView
  webview/src/App.tsx
    top-level React state
    message receiver
    page routing

  webview/src/pages/*
    board-level pages

  webview/src/components/*
    UI components, task drawer, dashboards, settings
```

## Top-Level Entry Points

### `src/extension.ts`

Responsibilities:

- initialize logger and i18n,
- require a workspace root,
- read `branchBoard.*` configuration,
- build `LocalJsonStorageProvider` or `ServerStorageProvider`,
- initialize `BoardService` and `GitService`,
- apply optional title bar/status bar customizations,
- register the Activity Bar WebView and commands,
- start periodic sync and Git-user import timers,
- handle configuration changes.

Important commands:

- `branchBoard.openBoard`
- `branchBoard.openCommandCenter`
- `branchBoard.createTask`
- `branchBoard.refreshBoard`
- `branchBoard.syncNow`
- `branchBoard.checkoutTaskBranch`
- `branchBoard.finishTask`
- `branchBoard.configure`
- `branchBoard.selectSshKey`
- `branchBoard.syncUsersFromGit`
- `branchBoard.showLogs`

### `src/panel/BoardPanel.ts`

This is the application controller. It should stay the only place that knows
both VS Code UI APIs and WebView messages.

Responsibilities:

- create WebView HTML and asset URIs,
- send `boardData`, `gitInfo`, `appConfig`, dashboard and branch payloads,
- handle inbound WebView messages,
- run user confirmations through native VS Code modals,
- surface operation results as in-board toasts and native errors,
- run column move automation,
- coordinate finish/merge/deploy/AI workflows,
- create persisted notifications.

BoardPanel should orchestrate services, not store business state itself.

## Data Model

The canonical extension-side model lives in `src/types.ts`. The WebView mirrors
it in `webview/src/types.ts`.

Persistent board data:

- `columns`
- `users`
- `tasks`
- `events`
- `deployments`
- `notifications`
- `announcements`
- `updatedAt`

Important task fields:

- `title`, `description`, `acceptanceCriteria`
- `columnId`, `position`, `status`
- `assignedUserId`, `createdByUserId`
- `branchName`
- `priority`, `taskType`, `dueDate`
- `comments`, `checklist`, `attachedFiles`
- `ai` and `aiAgents`

Computed, non-persistent data:

- `GitInfo`
- `BranchInfo`
- `DashboardData`
- `BranchMapGraph`
- `TaskBranchStatePayload`
- `AiCostDecisionPayload`

Computed data should stay out of `board.json` unless it represents user-visible
history or a durable decision.

## Storage Layer

### `StorageProvider`

`src/services/StorageProvider.ts` defines the storage boundary:

```ts
interface StorageProvider {
  readonly kind: "workspace-json" | "server";
  load(): Promise<BoardData>;
  save(board: BoardData): Promise<void>;
  onExternalChange(listener: (board: BoardData) => void): () => void;
  dispose(): void;
}
```

The rest of the extension should talk to `BoardService`, not directly to a
storage provider.

### Local JSON

`LocalJsonStorageProvider` stores the whole board at
`.branchboard/board.json`.

It handles:

- default board creation,
- schema normalization,
- `.branchboard/board.backup.json`,
- file watcher for external changes,
- own-write debounce to prevent save/reload loops.

### Server SQLite

`ServerStorageProvider` is an alias of `SshSqliteStorageProvider`.

It supports:

- local SQLite access when `sshHost` is empty,
- SSH + SQLite when `sshHost` is configured,
- relational tables for board collections,
- JSON payload preservation per entity,
- legacy whole-board row migration,
- optimistic concurrency through `updated_at`,
- empty overwrite guard,
- board history and delta change history,
- `testConnection()` reports for the Settings drawer.

See [SERVER_MODE.md](SERVER_MODE.md).

## Board Mutation Layer

`BoardService` is the single in-memory owner of `BoardData`.

Responsibilities:

- initialize board from storage,
- apply external board changes,
- persist every mutation,
- recover from failed saves,
- emit board changes to panels,
- manage notifications and admin announcements,
- create/update/delete/move tasks,
- create/update/delete/move columns,
- enforce WIP metadata,
- import users from Git authors,
- maintain events and deployment records.

Important design detail: saves are optimistic for UI responsiveness. If storage
save fails, `BoardService` reloads authoritative storage data and emits it so
the UI does not drift.

## Git Layer

`GitService` is the safe wrapper around the `git` CLI.

Rules:

- always use `execFile`, never a shell,
- run inside the workspace root,
- validate branch names with `git check-ref-format`,
- return `OperationResult` for expected failures,
- use configured `sshKeyPath` by injecting `GIT_SSH_COMMAND`,
- keep dashboard reads network-free unless a user explicitly runs an action.

Main responsibilities:

- Git identity and repository info,
- branch existence and checkout,
- branch stats and location state,
- commit graph and changed files,
- file mention search,
- create/push/update/merge/delete branches,
- safety tags and backup branches,
- revert helpers,
- finish task Git flow.

`finishTaskGitFlow()` is exported from `GitService.ts` as the orchestrated
production finish flow. It does not mutate board data directly; it returns a
`FinishResult` and BoardPanel/BoardService apply task state only after success.

## Column Automation

Column automation combines data from `BoardColumn` and settings:

- `gitStage`: none, ai-agent, feature, review, staging, production.
- `baseBranch`, `targetBranch`, `branchPrefix`.
- `wipLimit`.
- `onEnter` / `onLeave` command hooks.

Move flow in `BoardPanel`:

1. Guard invalid moves, especially production/subtask rules.
2. Ask before exceeding WIP limit.
3. Move task optimistically through `BoardService`.
4. Run column hooks. Blocking failures move the task back.
5. Run Git stage actions if `runGitActionsOnMove` is enabled.
6. Move task back if Git action fails.
7. Emit notifications and updated Git info.

Command hooks are executed by `CommandRunnerService`, which uses:

- binary allowlist,
- no shell,
- argument token substitution,
- confirmation,
- clean-tree check,
- timeout,
- audit log.

See [COLUMN_WORKFLOW.md](COLUMN_WORKFLOW.md).

## Dashboard And Analytics

Read-only analytics services:

- `BranchAnalyticsService` builds per-branch facts.
- `DashboardService` builds `DashboardData`.
- `RiskService` scores tasks/branches from local Git and configured critical
  paths.
- `EventService` creates and filters durable event history.

Command Center tabs are WebView components:

- Overview
- Team
- Branch Flow
- Cleanup
- Deployments
- Files & Commits
- Risk Radar
- Impact
- Activity
- AI Review

These views should not mutate Git just by opening. Actions such as checkout,
push, deploy, delete or archive are explicit user-triggered messages.

## AI Architecture

AI features are split deliberately:

- `AIAgentService` runs configured CLI agents safely.
- `AiCostOptimizer` decides whether to answer locally, prepare a prompt or run
  Cursor CLI with a given context size.
- `AiContextSelector` chooses files/context.
- `AiCostRiskEstimator` estimates low/medium/high risk.
- `AiPromptOptimizer` builds compact prompts for agent execution.
- `AiLocalModelProvider` optionally asks a local model for advice.
- `AiSessionMemoryService` stores short cost/context memory on the task.
- `CursorAgentsService` reads `.cursor/agents/*.md` persona files.

Safety boundaries:

- AI agents run via `spawn`, no shell.
- Command must be in `allowedAIAgentCommands`.
- Dirty-tree gate can block AI runs.
- AI agents do not push, merge, deploy or delete branches through BranchBoard.
- Token usage and cost are stored only when reported/configured.

See [AI_WORKFLOW.md](AI_WORKFLOW.md).

## Deployment And Rollback

`DeploymentService` runs configured deploy commands and records outcomes.

Supported placeholders:

- `{{branchName}}`
- `{{branchSlug}}`

Production deploy is disabled by default and can require confirmation.

`SafetyService` centralizes naming and generated rollback commands:

- `backup/<branch>-<timestamp>`
- `archive/<branch>-<timestamp>`
- `before-merge-<task>-<timestamp>`
- rollback command blocks for manual review.

See [DEPLOYMENTS.md](DEPLOYMENTS.md) and
[ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md).

## WebView Message Protocol

Inbound messages from WebView to extension include:

- board operations: `createTask`, `updateTask`, `deleteTask`, `moveTask`
- columns: `addColumn`, `renameColumn`, `deleteColumn`, `saveColumnConfig`
- Git: `createBranch`, `checkoutBranch`, `pushBranch`, `finishTask`,
  `mergeToMain`, `updateBranchFromMain`
- dashboard: `getDashboardData`, `getBranchDetail`, `getBranchMapGraph`,
  `getCommitDetail`
- files: `openFile`, `openDiff`, `openCommitDiff`, `searchFiles`
- AI: `generateAIAgentPrompt`, `runAIAgentPlan`, `runAIAgent`,
  `runAIAgentReview`, `cancelAIAgent`, `getAiCostDecision`
- deployment/safety: `deployDev`, `deployProduction`, `markTested`,
  `createBackupBranch`, `createSafetyTag`, `revertLastCommit`,
  `revertFromOrigin`, `deleteLocalBranch`, `deleteRemoteBranch`,
  `archiveBranch`, `bulkDeleteLocalBranches`
- settings/users/notifications: `saveSettings`, `addUser`, `updateUser`,
  `deleteUser`, `markNotificationRead`, `markAllNotificationsRead`,
  `markTaskCommentsRead`, `markAnnouncementRead`

Outbound messages include:

- `boardData`
- `gitInfo`
- `appConfig`
- `dashboardData`
- `branchDetail`
- `branchMapGraph`
- `commitDetail`
- `taskBranchState`
- `taskVerificationResult`
- `aiAgentLog`
- `aiAgentLifecycle`
- `aiCostDecision`
- `operationResult`
- `notification`
- `toast`
- `error`

Keep the protocol typed in `src/types.ts` and mirrored in `webview/src/types.ts`.

## UI Architecture

The WebView is a React + Vite app.

Main files:

- `webview/src/App.tsx` - app state, message handling and page routing.
- `webview/src/pages/TodayTasksPage.tsx`
- `webview/src/pages/CurrentBranchPage.tsx`
- `webview/src/pages/CommandCenterPage.tsx`
- `webview/src/pages/BranchMapPage.tsx`
- `webview/src/components/Board.tsx`
- `webview/src/components/TaskDrawer.tsx`
- `webview/src/components/SettingsDrawer.tsx`
- `webview/src/components/dashboard/*`
- `webview/src/components/task/*`
- `webview/src/styles.css`

Design constraints:

- local assets only, no CDN,
- dark Todoist-like board,
- compact operational UI,
- reusable common components for badges, tabs, tooltips, help icons,
- i18n through `webview/src/i18n/pl.json` and `en.json`.

## Adding A New Feature

Recommended path:

1. Extend `src/types.ts` and `webview/src/types.ts` together.
2. Add storage normalization in `LocalJsonStorageProvider` and `BoardService`
   if persistent fields are involved.
3. Keep mutations in `BoardService`.
4. Keep Git writes in `GitService`.
5. Add message handling in `BoardPanel`.
6. Add WebView UI and i18n keys.
7. Update relevant docs and settings reference.
8. Run:

```bash
cd webview
npm run build
cd ..
npm run compile
```

## Non-Negotiable Safety Rules

- Never merge to main without explicit confirmation.
- Never delete branches without explicit confirmation.
- Never mark a task done if Git failed.
- Never execute task-controlled shell strings.
- Never silently overwrite server data with an empty board.
- Never make dashboard reads mutate Git state.
