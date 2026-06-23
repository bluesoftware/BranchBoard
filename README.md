# BranchBoard

**Git-connected Kanban for VS Code and Cursor. One task, one branch, one workflow.**

BranchBoard is a local-first engineering board for small development teams. It
keeps the task, the Git branch, the current work state, deployment status,
notifications and AI-agent context inside the editor where the code is already
happening.

It is not a Jira clone. It is a working cockpit for teams that ship from a Git
repository and want every card to answer:

- What is the task?
- Who owns it?
- Which branch contains the work?
- Where is that branch now: local, origin, DEV or production?
- What changed, what is risky, and what should happen next?

## What BranchBoard Does

BranchBoard combines five product layers:

1. **Kanban board** - dark Todoist-like board with horizontal columns, counters,
   rounded cards, avatars, priority, due dates, comments, checklist, branch
   badges and drag-and-drop ordering.
2. **Current branch view** - a focused page for the branch you are actually on:
   linked task, changed files, commits, risk, work log, AI panel and the next
   suggested action.
3. **Today view** - personal or team task planning by due date, overdue work and
   priority.
4. **Command Center** - a lightweight CTO/senior dashboard: overview, team
   workload, branch flow, cleanup, deployments, files, risk radar, impact areas,
   activity and AI review.
5. **Branch Map** - a Git graph view that connects commits, branches and managed
   board work.

All of this runs inside VS Code / Cursor as a WebView backed by the VS Code
Extension API.

## Product Workflow

1. Open a Git repository in VS Code or Cursor.
2. Open BranchBoard from the Activity Bar or run `BranchBoard: Open Board`.
3. Create a task, assign a user, set priority/due date and add acceptance
   criteria or file mentions.
4. Move it into the work column. BranchBoard can create or checkout the branch
   based on the column's Git stage.
5. Work normally in the repository.
6. Push the task branch, deploy to DEV when configured, review the branch and
   move the card through testing.
7. Finish only when the Git flow succeeds. BranchBoard never marks a task done
   when Git failed.

The default board is local-first and stored in `.branchboard/board.json`.

## Core Features

- Activity Bar integration and persistent BranchBoard status bar entry.
- React + Vite WebView UI with Polish as the default language and English as an
  optional language.
- Local JSON storage with schema migration, file watcher and
  `board.backup.json` safety backup.
- Optional server mode through SQLite accessed locally or over SSH.
- Create, edit, delete, reorder and configure columns.
- Create, edit, delete, assign, comment, checklist, schedule and move tasks.
- Git user detection from `git config user.name` / `git config user.email`.
- Automatic user import from Git commit authors.
- Task filters for all tasks, my tasks, unassigned, branch/no-branch,
  current branch, review and done.
- Safe Git actions: create branch, ensure branch, checkout, push, update from
  main, merge to dev/main, delete/archive branches and rollback helpers.
- Column Git stages: none, AI agent, feature, review, staging and production.
- Column command hooks with allowlisted binaries, argument tokens, confirmation,
  clean-tree checks, timeout and `.branchboard/audit.log`.
- WIP limits per column.
- Deploy to DEV / production commands with `{{branchName}}` and
  `{{branchSlug}}` placeholders.
- Persisted per-user notifications, bell dropdown, native toasts and bundled
  local notification sounds.
- Admin announcements synced through the board data.
- Optional title bar / status bar customization for VS Code and Cursor.
- File mention picker for task text, comments and AI prompts.

## AI Workflow

BranchBoard has two AI layers.

**Copy AI Prompt** builds a ready-to-paste prompt from the task, branch,
description, acceptance criteria, checklist, comments, attached files and test
command.

**AI Agent workflow** can run configured local CLI agents such as Cursor Agent or
Claude CLI from a task. It supports:

- Plan, Work and Review steps.
- Safe `spawn` execution with no shell.
- Command allowlist through `branchBoard.allowedAIAgentCommands`.
- Optional clean-tree requirement before AI runs.
- Live stdout/stderr console in the WebView.
- Stop/cancel support.
- Prompt files in `.branchboard/ai`.
- Plan files in `.cursor/plans`.
- Cursor sub-agent persona discovery from `.cursor/agents/*.md`.
- Model discovery through configured `listModelsArgs`.
- Token usage and optional per-model cost estimates.
- AI Cost Guard with local/rule-based decisioning, context limits and
  confirmation for high-risk/full-context/expensive runs.

See [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).

## Git Safety

BranchBoard is intentionally conservative:

- Git commands use `execFile` with argument arrays, not shell strings.
- Branch names are validated with `git check-ref-format`.
- Dirty working tree checks protect finish, merge, update and AI flows.
- Direct merge to `main` is disabled by default.
- Merge to production requires explicit confirmation when enabled.
- Failed merge attempts abort cleanly with `git merge --abort`.
- Branch deletion is opt-in and only runs after successful merge/push in the
  finish flow.
- Backup branches and safety tags are available before touching production.
- Rollback commands are generated for review instead of being run blindly.

See [docs/SAFETY.md](docs/SAFETY.md) and
[docs/ROLLBACK_SAFETY.md](docs/ROLLBACK_SAFETY.md).

## Storage Modes

### Local Workspace JSON

Default and recommended for local development:

```text
.branchboard/board.json
.branchboard/board.backup.json
.branchboard/audit.log
.branchboard/ai/
```

The JSON file is created automatically, watched for external changes, migrated
to the current schema and backed up before writes.

### Server Mode

Server mode stores the board in SQLite, accessed either locally or over SSH. The
schema uses relational tables for columns, users, tasks, events, deployments,
notifications and announcements while preserving each entity as JSON payload for
forward compatibility.

See [docs/SERVER_MODE.md](docs/SERVER_MODE.md).

## Documentation

Start here:

- [docs/README.md](docs/README.md) - full documentation map.
- [docs/PRODUCT_HANDBOOK.md](docs/PRODUCT_HANDBOOK.md) - how a team should use
  BranchBoard day to day.
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) - extension,
  WebView, storage, services and message protocol.
- [docs/SETTINGS_REFERENCE.md](docs/SETTINGS_REFERENCE.md) - settings grouped by
  product area.
- [docs/COMMAND_CENTER.md](docs/COMMAND_CENTER.md) - dashboard and operational
  views.
- [docs/WORKFLOW.md](docs/WORKFLOW.md) - task and branch workflow.

## Commands

BranchBoard contributes these VS Code commands:

- `branchBoard.openBoard` - open the board.
- `branchBoard.openCommandCenter` - open the Command Center.
- `branchBoard.createTask` - create a task from a quick input.
- `branchBoard.refreshBoard` - refresh board data.
- `branchBoard.syncNow` - force storage sync.
- `branchBoard.checkoutTaskBranch` - pick and checkout a task branch.
- `branchBoard.finishTask` - open the board and guide finish from the task UI.
- `branchBoard.configure` - open BranchBoard settings.
- `branchBoard.selectSshKey` - select a private key for Git/server SSH.
- `branchBoard.syncUsersFromGit` - import commit authors as board users.
- `branchBoard.showLogs` - open the BranchBoard output channel.

## Development Setup

```bash
npm install
cd webview
npm install
npm run build
cd ..
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

Useful scripts:

```bash
npm run build:all
npm run build:webview
npm run compile
npm run watch
```

Package a VSIX:

```bash
npm install -g @vscode/vsce
vsce package
```

## Project Structure

```text
src/
  extension.ts                  VS Code activation, commands and configuration
  panel/BoardPanel.ts           WebView controller and message bridge
  services/                     Git, storage, board, dashboard, AI, deploy, safety
  i18n/                         extension-side translations
  types.ts                      shared extension data contracts

webview/
  src/App.tsx                   WebView application shell
  src/pages/                    Board pages: today, current branch, command, map
  src/components/               Board, task drawer, settings, dashboards
  src/i18n/                     WebView translations
  src/types.ts                  mirrored WebView data contracts

docs/                           product, workflow and technical documentation
media/                          extension icons
```

## Settings Snapshot

Everything is configured under `branchBoard.*`. The most important groups are:

- Storage: `storageMode`, `localDataFile`, `sshHost`, `sqliteRemotePath`,
  `sshKeyPath`.
- Git policy: `defaultMainBranch`, `remoteName`, `devBranch`,
  `allowDirectMergeToMain`, `updateBranchStrategy`, `runGitActionsOnMove`.
- Safety: `requireCleanWorkingTreeBeforeFinish`,
  `requireConfirmationBeforeMerge`, `createBackupBranchBeforeMerge`,
  `createSafetyTagBeforeMerge`, cleanup toggles.
- AI: `aiAgents`, `allowedAIAgentCommands`, `aiCostMode`, `aiCli.*`,
  `aiLocalOptimizer.*`, `optimizePromptsBeforeSend`.
- UI: `language`, `appearance.*`, `titleBar.*`.
- Notifications: `notifications.*`, `adminAnnouncement.*`.

Full reference: [docs/SETTINGS_REFERENCE.md](docs/SETTINGS_REFERENCE.md).

## Roadmap

- Browser-hosted Command Center mode.
- Pull request provider integrations.
- More complete multi-user server sync UX.
- More languages.
- WIP analytics and lightweight team reporting.

## Polish Summary

BranchBoard to tablica Kanban dla programistów, działająca bezpośrednio w
VS Code i Cursorze. Każde zadanie może mieć branch Git, osobę odpowiedzialną,
komentarze, checklistę, deadline, workflow AI, deploy na DEV i bezpieczny flow
zakończenia. Celem jest porządek w pracy zespołu bez ciężkiego narzędzia
projektowego obok kodu.

## License

MIT - see [LICENSE](LICENSE).
