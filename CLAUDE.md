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