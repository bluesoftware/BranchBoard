# Changelog

All notable changes to BranchBoard are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] — 2026-06-06

### Added
- **Internationalization (i18n).** Full Polish (default) and English UI, switchable
  in Settings → Appearance → Language or via `branchBoard.language`. All UI strings
  moved to `webview/src/i18n/{pl,en}.json`; extension-side messages in
  `src/i18n/{pl,en}.ts`. Helper `t()` with `{param}` interpolation and PL → key fallback.
- **Premium UI rebuild** based on `--bb-*` design tokens derived from VS Code theme
  variables (works in Cursor Dark, Dark+, GitHub Dark, One Dark Pro, Dracula, Nord, …).
- **Right-side task drawer** replacing the modal, with Git status, history, priority,
  checklist progress, and inline comments.
- **AI coding workflow:** "Copy AI Prompt" generates a Cursor/Claude/Copilot-ready
  prompt; template editable via `branchBoard.aiPromptTemplate`.
- **Search and filters:** search across title/description/branch/comments/assignee;
  filters for My / All / Unassigned / Current branch / Has branch / No branch /
  Needs review / Done.
- **Toast notifications**, **onboarding** first-run screen, and an in-app **Settings
  drawer** (General / Git / Users / Appearance / Sync / AI).
- **Task priority** (`none`/`low`/`medium`/`high`/`urgent`) with card badges.
- **Keyboard shortcuts:** `/` focus search, `n` new task, `Esc` close panels.
- Quick Git actions (checkout / push / finish) on card hover.
- Appearance toggles: compact mode, branch badges, comments, checklist, avatars,
  priority, reduced animations.

### Changed
- Board storage now backs up to `board.backup.json` before each save and refuses to
  overwrite a corrupted file (restores from backup instead). Schema migrated to v2.
- Git operation successes show as in-board toasts; failures still raise native
  notifications so they're never missed.

### Safety
- Direct merge to `main` and branch deletion remain off by default and always require
  explicit confirmation. Tasks are never marked done when a Git step fails.

## [0.1.0]

### Added
- Initial MVP: Activity Bar view, WebView Kanban board, local JSON storage,
  create/edit/delete/move tasks and columns, Git user detection, branch
  create/checkout/push, safe Finish-task flow, file watcher, server storage stub.
