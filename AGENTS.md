This folder contains a VS Code / Cursor extension project called BranchBoard.

BranchBoard is a Git-connected Kanban board for small development teams. The goal is to build a working extension where tasks are displayed as Kanban cards and each task can be connected to a Git branch.

Main rules for working in this folder:

1. Always write production-quality TypeScript.
2. Do not create pseudocode.
3. Do not skip files or leave TODO placeholders unless clearly marked as future work.
4. Keep the architecture modular and easy to extend.
5. Build the MVP first before adding advanced features.
6. Prefer simple, reliable solutions over over-engineered ones.
7. The extension must work locally first using .branchboard/board.json.
8. Later it should be easy to add a server backend with Node.js, SQLite and WebSocket sync.
9. All Git operations must be safe.
10. Never merge to main or delete branches without explicit user confirmation.
11. If a Git operation fails, show a clear error and do not mark the task as finished.
12. The UI should visually match the attached reference screenshot: dark Todoist-like Kanban, horizontal columns, rounded task cards, counters, avatars, comments count and plus buttons.
13. Use React + Vite for the WebView UI.
14. Use VS Code Extension API and TypeScript for the extension side.
15. Do not use external CDN assets.
16. All code should be runnable in VS Code Extension Development Host.
17. When changing the project, first inspect existing files, then make a short plan, then implement.
18. After every major implementation step, explain how to run and test it.

Expected project structure:

- package.json
- tsconfig.json
- README.md
- src/extension.ts
- src/panel/BoardPanel.ts
- src/services/GitService.ts
- src/services/BoardService.ts
- src/services/StorageProvider.ts
- src/services/LocalJsonStorageProvider.ts
- src/services/ServerStorageProvider.ts
- src/types.ts
- webview/package.json
- webview/vite.config.ts
- webview/tsconfig.json
- webview/index.html
- webview/src/main.tsx
- webview/src/App.tsx
- webview/src/types.ts
- webview/src/styles.css
- webview/src/components/Board.tsx
- webview/src/components/Column.tsx
- webview/src/components/TaskCard.tsx
- webview/src/components/TaskModal.tsx
- webview/src/components/UserSwitcher.tsx
- webview/src/components/TopBar.tsx

Core features:

- Activity Bar icon
- WebView Kanban board
- local JSON storage in .branchboard/board.json
- create/edit/delete/move tasks
- create/edit/delete columns
- assign users
- detect Git user using git config user.name and git config user.email
- switch between My tasks / All tasks / selected user
- connect task to branch
- create branch from task
- checkout branch
- push branch
- safe finish task flow
- optional merge to main only after confirmation
- optional branch cleanup only after successful merge
- file watcher for board.json
- prepared StorageProvider interface for future server mode

Development commands should stay simple:

npm install
cd webview
npm install
npm run build
cd ..
npm run compile

The project should be packaged later with:

npm install -g @vscode/vsce
vsce package

## Imported Claude Cowork project instructions

You are working as a senior VS Code extension architect and senior TypeScript developer.

This project is called BranchBoard.

Your task is to build a complete VS Code / Cursor extension that works as a Git-connected Kanban board for small development teams.

The extension must be production-quality, clean, modular, and easy to extend later with a server backend.

MAIN GOAL

Build a VS Code extension that displays a Kanban board inside VS Code/Cursor. The board must look visually similar to the attached screenshot: dark theme, horizontal columns, rounded task cards, column counters, small user avatars, comments count, plus buttons, and a clean Todoist-like board layout.

Each task can be connected to a Git branch. The developer should be able to create a branch, switch to a branch, push the branch, and safely finish the task by merging it into main and optionally deleting the branch.

IMPORTANT

Do not create pseudocode.
Do not skip files.
Do not provide only fragments.
Create a working MVP first.
Use clean TypeScript.
Use safe Git operations.
Never merge to main or delete branches without explicit confirmation.
The UI must be close to the screenshot.

TECH STACK

Use:

- VS Code Extension API
- TypeScript
- WebView panel
- React + Vite for the WebView UI
- Local JSON storage for MVP
- Git commands through child_process
- No external CDN
- All assets and code must be local

PROJECT STRUCTURE

Create a complete project structure:

package.json
tsconfig.json
README.md
src/extension.ts
src/panel/BoardPanel.ts
src/services/GitService.ts
src/services/BoardService.ts
src/services/StorageProvider.ts
src/services/LocalJsonStorageProvider.ts
src/services/ServerStorageProvider.ts
src/types.ts
webview/package.json
webview/vite.config.ts
webview/tsconfig.json
webview/index.html
webview/src/main.tsx
webview/src/App.tsx
webview/src/types.ts
webview/src/styles.css
webview/src/components/Board.tsx
webview/src/components/Column.tsx
webview/src/components/TaskCard.tsx
webview/src/components/TaskModal.tsx
webview/src/components/UserSwitcher.tsx
webview/src/components/TopBar.tsx

EXTENSION FEATURES

1. Activity Bar

Add a BranchBoard icon in the VS Code Activity Bar.

When clicked, it opens the Kanban board WebView.

2. Commands

Register these commands:

branchBoard.openBoard
branchBoard.createTask
branchBoard.refreshBoard
branchBoard.configure
branchBoard.checkoutTaskBranch
branchBoard.finishTask
branchBoard.syncNow

3. Configuration

Add settings in package.json contributes.configuration:

branchBoard.projectName
branchBoard.boardTitle
branchBoard.storageMode
branchBoard.localDataFile
branchBoard.serverUrl
branchBoard.authToken
branchBoard.defaultMainBranch
branchBoard.remoteName
branchBoard.autoDetectGitUser
branchBoard.currentUser
branchBoard.availableUsers
branchBoard.syncIntervalSeconds
branchBoard.allowDirectMergeToMain
branchBoard.requireConfirmationBeforeMerge
branchBoard.requireCleanWorkingTreeBeforeFinish
branchBoard.runCommandBeforeFinish
branchBoard.deleteRemoteBranchAfterMerge
branchBoard.deleteLocalBranchAfterMerge

Default values:

projectName: "BranchBoard"
boardTitle: "BranchBoard"
storageMode: "workspace-json"
localDataFile: ".branchboard/board.json"
defaultMainBranch: "main"
remoteName: "origin"
autoDetectGitUser: true
syncIntervalSeconds: 20
allowDirectMergeToMain: false
requireConfirmationBeforeMerge: true
requireCleanWorkingTreeBeforeFinish: true
runCommandBeforeFinish: ""
deleteRemoteBranchAfterMerge: false
deleteLocalBranchAfterMerge: false

4. Local storage

For MVP use local JSON storage.

The file should be:

.branchboard/board.json

If it does not exist, create it automatically.

Default board should contain columns similar to:

APP SKLEP
APP START
KOSZYK
KONTO
DO TESTU
ZROBIONE

Example structure:

{
  "version": 1,
  "projectName": "BranchBoard",
  "boardTitle": "BranchBoard",
  "columns": [
    {
      "id": "app-sklep",
      "name": "APP SKLEP",
      "position": 1
    },
    {
      "id": "app-start",
      "name": "APP START",
      "position": 2
    },
    {
      "id": "koszyk",
      "name": "KOSZYK",
      "position": 3
    },
    {
      "id": "konto",
      "name": "KONTO",
      "position": 4
    },
    {
      "id": "do-testu",
      "name": "DO TESTU",
      "position": 5
    },
    {
      "id": "zrobione",
      "name": "ZROBIONE",
      "position": 99
    }
  ],
  "users": [
    {
      "id": "darek",
      "name": "Darek",
      "email": "",
      "avatarText": "DK",
      "color": "#38bdf8"
    },
    {
      "id": "hania",
      "name": "Hania",
      "email": "",
      "avatarText": "HA",
      "color": "#f472b6"
    }
  ],
  "tasks": []
}

5. Board UI

The UI must be dark and visually close to the screenshot.

Requirements:

- almost black background
- board title at top-left
- horizontal column layout
- column header with name and task counter
- three-dot menu in each column
- task cards with dark gray background
- rounded corners
- subtle border and shadow
- circle checkbox on left
- title text
- optional description
- optional small avatar on right
- comments icon with number
- plus button under every column
- horizontal scrolling when there are many columns
- drag and drop tasks between columns
- drag and drop tasks inside the same column
- update task position after drag
- preserve order

Use CSS carefully. The board should look polished, not default.

6. Tasks

Each task should support:

id
title
description
columnId
position
assignedUserId
branchName
comments
checklist
createdAt
updatedAt
finishedAt
status

The user must be able to:

- add a task
- edit a task
- delete a task after confirmation
- assign user
- add/change branch name
- add comments
- move task between columns
- mark as done
- create branch from task
- checkout branch
- push branch
- finish task

7. Users

Detect current Git user using:

git config user.name
git config user.email

Try to match Git user to board users by email or name.

Add a user switcher in UI:

- My tasks
- All tasks
- specific users

The user should be able to switch view between all tasks and selected user tasks.

8. Git integration

Create GitService with these methods:

getGitUser()
getCurrentBranch()
getMainBranch()
hasUncommittedChanges()
checkoutBranch(branchName)
createBranch(branchName)
pushBranch(branchName)
pullMain()
mergeBranchToMain(branchName)
deleteLocalBranch(branchName)
deleteRemoteBranch(branchName)
runCommand(command)
finishTaskGitFlow(task)

Use child_process execFile/spawn safely.

All Git operations must run in the current workspace folder.

If no workspace is open, show a clear error.

9. Finish task Git flow

Implement a safe flow:

When user clicks "Finish task":

- check if task has branchName
- check current working tree
- if there are uncommitted changes and requireCleanWorkingTreeBeforeFinish is true, stop and show error
- if runCommandBeforeFinish is configured, run it and stop on failure
- push current task branch to origin
- if allowDirectMergeToMain is false:
  - move task to "DO TESTU" or "ZROBIONE"
  - show message that direct merge is disabled
  - do not merge to main
- if allowDirectMergeToMain is true:
  - ask explicit confirmation
  - checkout main
  - pull origin main
  - merge task branch
  - push origin main
  - optionally delete local branch
  - optionally delete remote branch
  - move task to "ZROBIONE"
  - set finishedAt
  - save board

Never delete a branch if merge failed.
Never mark as done if Git operation failed.
If conflict occurs, show useful error and stop.

10. WebView communication

Implement message passing between WebView and extension:

WebView -> Extension:

ready
createTask
updateTask
deleteTask
moveTask
createBranch
checkoutBranch
pushBranch
finishTask
getGitInfo
changeUser
refresh

Extension -> WebView:

boardData
gitInfo
operationResult
error
notification

11. File watcher

Watch .branchboard/board.json.

If the file changes externally, reload board and update WebView.

Avoid infinite save/reload loops.

12. Server architecture stub

Create StorageProvider interface.

Implement:

LocalJsonStorageProvider - fully working
ServerStorageProvider - stub prepared for future API

Do not implement full server now, but architecture must allow it later.

13. README

Add README with:

- what the extension does
- installation
- development setup
- how to run in VS Code
- how to build WebView
- how to compile extension
- how to package VSIX
- settings description
- Git safety notes
- future server mode plan

14. Development commands

At the end, provide exact commands:

npm install
cd webview
npm install
npm run build
cd ..
npm run compile

Then run extension with F5 in VS Code.

Also provide VSIX packaging command:

npm install -g @vscode/vsce
vsce package

15. Output style

First inspect the current folder.
Then create a clear implementation plan.
Then create files.
Then explain how to run.
Then explain what is implemented and what is intentionally left for later.

Do not stop after planning.
Implement the project.

Use the attached screenshot as the visual reference for the Kanban board UI. The final WebView should be visually close to it: dark Todoist-like board, horizontal columns, rounded cards, counters, avatars, comments, and plus buttons.
