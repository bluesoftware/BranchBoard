# BranchBoard

A Git-connected Kanban board that lives inside VS Code / Cursor. Built for small
development teams: every task can be tied to a Git branch, and the board can
create, switch, push, and safely finish branches without leaving the editor.

The board is a dark, Todoist-style layout — horizontal columns, rounded task
cards, column counters, assignee avatars, comment counts, and a "+ Dodaj
zadanie" button under every column.

## What it does

- **Kanban board in a WebView** (React + Vite, bundled locally — no external CDNs).
- **Activity Bar icon** opens the board in the sidebar; `BranchBoard: Open Board`
  opens it as a wide editor panel.
- **Tasks**: create, edit, describe, assign, comment, check off, drag between and
  within columns, delete (with confirmation).
- **Columns**: add, rename (double-click the title or use the `⋯` menu), delete
  empty columns, reorder by dragging the column header.
- **Git integration** per task: create branch, checkout, push, finish task, and
  (optionally) merge to main and clean up the branch.
- **User switcher**: My tasks / All tasks / per-user filtering. The current user
  is auto-detected from `git config user.name` / `user.email`.
- **Local JSON storage** at `.branchboard/board.json`, created automatically. A
  file watcher reloads the board when the file changes externally.
- **Notifications** when a task is assigned to you, when a comment is added to
  your task, or when a task moves into a review/done column.
- **Server mode** is stubbed behind a `StorageProvider` interface, ready to be
  implemented later (see "Future server mode").

## Project layout

```
package.json                         Extension manifest (commands, settings, views)
tsconfig.json
README.md
media/icon.svg                       Activity Bar icon
src/
  extension.ts                       Activation, commands, wiring, sync timer
  types.ts                           Shared data model + message protocol
  panel/BoardPanel.ts                WebView host, panel + sidebar providers, message handling
  services/
    GitService.ts                    Safe git CLI wrapper + finishTaskGitFlow
    BoardService.ts                  In-memory board, mutations, persistence, notifications
    StorageProvider.ts               Storage interface + default board factory
    LocalJsonStorageProvider.ts      .branchboard/board.json + file watcher (MVP)
    ServerStorageProvider.ts         Stub for future backend
webview/                             React + Vite UI (separate build)
  package.json, vite.config.ts, tsconfig.json, index.html
  src/
    main.tsx, App.tsx, types.ts, vscode.ts, styles.css
    components/
      TopBar.tsx, Board.tsx, Column.tsx, TaskCard.tsx, TaskModal.tsx, UserSwitcher.tsx
```

## Development setup

You need Node.js 18+ and VS Code 1.84+.

```bash
# 1. Install extension dependencies
npm install

# 2. Build the WebView UI (installs its own deps + produces webview/dist)
cd webview
npm install
npm run build
cd ..

# 3. Compile the extension TypeScript
npm run compile
```

Then press **F5** in VS Code to launch an Extension Development Host with
BranchBoard loaded. Open a folder that is a Git repository, click the
BranchBoard icon in the Activity Bar, or run **BranchBoard: Open Board**.

While developing, you can keep the extension compiler running:

```bash
npm run watch
```

and rebuild the WebView (`cd webview && npm run build`) whenever you change UI
files. A full one-shot build is available via:

```bash
npm run build:all   # builds webview + compiles extension
```

## Packaging a VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

`vsce package` runs `vscode:prepublish`, which builds the WebView and compiles
the extension, then produces `branchboard-<version>.vsix`. Install it with
`code --install-extension branchboard-0.1.0.vsix` or via the Extensions view
"Install from VSIX…" command.

## Settings

All settings live under `branchBoard.*` (Settings → search "BranchBoard"):

| Setting | Default | Description |
| --- | --- | --- |
| `projectName` | `BranchBoard` | Project name stored in the data file. |
| `boardTitle` | `BranchBoard` | Title shown at the top of the board. |
| `storageMode` | `workspace-json` | `workspace-json` (local file) or `server` (preview). |
| `localDataFile` | `.branchboard/board.json` | Path to the local board file. |
| `serverUrl` | `` | Base URL for server mode. |
| `authToken` | `` | Bearer token for server mode. |
| `defaultMainBranch` | `main` | Branch merges target. |
| `remoteName` | `origin` | Remote used for push/pull. |
| `autoDetectGitUser` | `true` | Match the current user from git config. |
| `currentUser` | `` | Force a specific board user id. |
| `availableUsers` | `[]` | Users to seed into a new board file. |
| `syncIntervalSeconds` | `20` | External-change poll interval (mainly server mode). |
| `allowDirectMergeToMain` | `false` | Allow Finish task to merge into main. |
| `requireConfirmationBeforeMerge` | `true` | Always confirm before merging. |
| `requireCleanWorkingTreeBeforeFinish` | `true` | Block finishing with uncommitted changes. |
| `runCommandBeforeFinish` | `` | e.g. `npm run build`; finish aborts if it fails. |
| `deleteRemoteBranchAfterMerge` | `false` | Delete remote branch after a successful merge. |
| `deleteLocalBranchAfterMerge` | `false` | Delete local branch after a successful merge. |

## Git safety notes

BranchBoard never does anything destructive silently:

- The `git` CLI is invoked with `execFile` (no shell), and branch names are
  validated with `git check-ref-format` before use, so task data cannot inject
  commands.
- **Merging to main is off by default** (`allowDirectMergeToMain: false`). When
  off, Finish task only pushes the branch and moves the card for review.
- When direct merge is on, you are still asked to confirm before the merge runs
  (`requireConfirmationBeforeMerge`).
- **Finishing is blocked** while the working tree is dirty (unless you turn
  `requireCleanWorkingTreeBeforeFinish` off).
- On a **merge conflict**, the merge is aborted automatically, the task is *not*
  closed, and the branch is *not* deleted.
- Branches are only deleted after a fully successful merge **and** push, and only
  if you opted in via the delete-after-merge settings.
- GitHub CLI is never required — everything works on a plain Git remote.

### Finish task flow

1. Verify the task has a branch name.
2. Verify the working tree is clean (if required) — otherwise stop.
3. Ensure the task branch is checked out.
4. Run `runCommandBeforeFinish` if configured — stop on failure.
5. `git push origin <branch>`.
6. If direct merge is **disabled**: move the card to the review/done column, done.
7. If direct merge is **enabled**: confirm → checkout main → pull → merge →
   push main → optional branch cleanup → mark done + set `finishedAt` → move to
   ZROBIONE.

## Data file

`.branchboard/board.json` is created on first run. Shape:

```json
{
  "version": 1,
  "projectName": "BranchBoard",
  "boardTitle": "BranchBoard",
  "columns": [{ "id": "app-sklep", "name": "APP SKLEP", "position": 1 }],
  "users": [{ "id": "darek", "name": "Darek", "email": "", "avatarText": "DK", "color": "#38bdf8" }],
  "tasks": []
}
```

It is safe to commit this file so the whole team shares the same board, or to
gitignore it for a personal board.

## Future server mode

The architecture is ready for a VPS backend. `ServerStorageProvider` documents
the exact contract the server must implement:

- `GET  {serverUrl}/api/board` → `BoardData`
- `PUT  {serverUrl}/api/board` ← `BoardData`
- `WS   {serverUrl}/ws` → `{ type: "board", data }` push for real-time sync
- Auth via `Authorization: Bearer {authToken}`

A reference backend would use **Node.js + SQLite + WebSocket** with token login.
Because all storage goes through the `StorageProvider` interface, switching
`branchBoard.storageMode` to `server` is the only change the rest of the
extension needs.

## What's implemented vs. left for later

**Implemented (working MVP):** activity bar + editor board, local JSON storage
with auto-create and file watcher, full task CRUD, columns CRUD + reorder, drag
and drop (within and across columns), user detection and filtering, comments,
all GitService operations, the safe finish-task flow, VS Code notifications, and
all configuration settings.

**Intentionally left for later:** the real server backend (interface + stub only),
real-time multi-user WebSocket sync, and richer conflict resolution beyond the
`updatedAt` guard used by the local watcher.
