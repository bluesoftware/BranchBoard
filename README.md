# BranchBoard

**Git-connected Kanban for VS Code and Cursor. One task. One branch. One workflow.**

> Do not manage tasks next to your code. Manage tasks where code happens.

BranchBoard connects the task board with the actual Git branch, so your team
always knows who works on what, where the code is, and what is ready to review —
without leaving the editor.

---

## Why BranchBoard?

Most boards live in a browser tab, far away from the code. BranchBoard lives
inside VS Code / Cursor and treats the **task and its Git branch as one unit**.
From a card you can create a branch, switch to it, push it, and safely finish the
work — with guardrails that never merge to `main` or delete branches without your
explicit confirmation.

It is intentionally lightweight: not a Jira replacement, not heavy project
management. Fast, elegant, and directly tied to your repository.

## Who is it for?

- Small development teams (2–10 people)
- Freelancers and software houses
- Teams working in Cursor and with AI coding agents
- Teams that don't want heavy Jira
- Projects where every task should have a branch
- Legacy projects with many small fixes

## How it works

1. Open a repository in VS Code / Cursor.
2. Open the BranchBoard view from the Activity Bar.
3. Create a task. BranchBoard suggests a safe branch name (`feature/task-…`).
4. Create the branch from the card, check it out, and start coding.
5. When you're done, **Finish task** pushes the branch and moves the card forward
   — merging to `main` only if you allow it and confirm.

## Core workflow

Each task carries a title, description, assignee, priority, status, comments,
a checklist, and a linked Git branch. The board shows columns with counters,
rounded cards, avatars, branch badges, comment counts, and priority — with drag
and drop between and within columns.

Git actions available per task: **Create branch · Checkout · Push · Copy branch
name · Finish task · Merge to main** (when enabled).

## Command Center (CTO view)

Beyond the board, BranchBoard ships a **Command Center / Centrum dowodzenia** — a
lightweight engineering command center for a senior / CTO leading a small team.
Open it from the top-bar button or the `BranchBoard: Open Command Center` command.

It shows what is happening with the code, not just the to-do list: an **Overview**
with KPI tiles and an automatic "needs attention" list, a **Team** workload view
(built to spot bottlenecks, not judge people), a visual **Branch Flow** pipeline
(Task → Branch → Commits → Push → DEV → Review → Testing → Merge) with risk and
freshness badges, and an **Activity** timeline. It also covers DEV/production
deployments and safe rollback. All git analytics are read-only and network-free.

It is built to bring **order to the project, not to track hours** — the team view
literally states "this view helps detect bottlenecks, not judge people". Leads get
visibility that builds trust instead of eroding it: you see progress without having
to ask for status. See the senior/CTO guide in
[docs/CTO_WORKFLOW.md](docs/CTO_WORKFLOW.md), plus
[COMMAND_CENTER.md](docs/COMMAND_CENTER.md), [DEPLOYMENTS.md](docs/DEPLOYMENTS.md)
and [ROLLBACK_SAFETY.md](docs/ROLLBACK_SAFETY.md).

## Branch Map / Mapa branchy

Branch Map visualizes the real flow of work in your repository. It connects Git
branches with tasks, owners, commits, changed files, DEV deploys, AI assistance
and risk signals. It helps small teams understand what is happening in the
codebase without switching between Git tools, project boards and chat.

Mapa branchy pokazuje realny przepływ pracy w repozytorium: branche, zadania,
osoby, commity, zmienione pliki, deploy na DEV, pracę AI oraz ryzyka. Dzięki temu
lider techniczny widzi, co naprawdę dzieje się w projekcie. See
[docs/BRANCH_MAP.md](docs/BRANCH_MAP.md).

## Current branch / Aktualny branch

The "Current branch" view shows everything known about the current work: branch,
linked task, changed files, commits, Git status, risk, DEV deploy and the
suggested next step. It helps developers move work forward without searching for
the task on the board.

Widok „Aktualny branch" pokazuje wszystko, co wiadomo o bieżącej pracy: branch,
powiązane zadanie, zmienione pliki, commity, status Git, ryzyko, deploy DEV i
sugerowany następny krok. See [docs/CURRENT_BRANCH.md](docs/CURRENT_BRANCH.md).

Top navigation switches between **Board · Current branch · Command Center · Branch
Map · Settings**, all sharing the same `board.json` / server data.

The Command Center's **Branch Flow** tab is an operational panel for managing
branches as tasks: categories (local-only, remote-only, backup, stale, cleanup,
high risk), filters, quick actions (checkout, open/create/link task, push, DEV),
bulk selection, and safe archive/delete (local + remote) with confirmations. See
[docs/BRANCH_FLOW.md](docs/BRANCH_FLOW.md).

BranchBoard is **help-first**: Git, risk and deploy concepts are explained in
plain language via tooltips, in Polish and English. See
[docs/TOOLTIPS_AND_HELP.md](docs/TOOLTIPS_AND_HELP.md).

## AI coding workflow

Every task has a **Copy AI Prompt** button. It generates a ready-to-paste prompt
for Cursor, Claude or Copilot Chat containing the title, description, branch,
project name, acceptance criteria, checklist, comments summary and your test
command — plus rules that tell the agent to inspect the code first, make a plan,
change only what's needed, and keep commits focused. The template is fully
editable in Settings.

See [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).

## Git safety

BranchBoard never merges to `main` or deletes a branch without explicit
confirmation, and never marks a task done if a Git operation failed. Clean
working-tree checks, a configurable pre-finish command, and conflict-aware merges
are built in. See [docs/SAFETY.md](docs/SAFETY.md).

## Languages / Języki

BranchBoard runs in **Polish by default** and can switch to **English** in
Settings → Appearance → Language (or the `branchBoard.language` setting). UI
strings live in `webview/src/i18n/pl.json` and `webview/src/i18n/en.json`, so
adding another language is just a new file.

Dostępne języki: **Polski**, **English**.

## Installation

Install from a packaged `.vsix`:

```bash
code --install-extension branchboard-0.2.0.vsix
```

…or run from source (see below) and press `F5`.

## Development setup

```bash
npm install
cd webview
npm install
npm run build
cd ..
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

Package a VSIX:

```bash
npm install -g @vscode/vsce
vsce package
```

## Settings

Key settings (all under `branchBoard.*`, editable in the in-app Settings drawer):

- `language` — `pl` (default) or `en`
- `boardTitle`, `projectName`
- `storageMode` — `workspace-json` (default) or `server`
- `localDataFile` — default `.branchboard/board.json`
- `defaultMainBranch` (`main`), `remoteName` (`origin`)
- `allowDirectMergeToMain` (default `false`)
- `requireConfirmationBeforeMerge` (default `true`)
- `requireCleanWorkingTreeBeforeFinish` (default `true`)
- `runCommandBeforeFinish` — e.g. `npm run build`
- `deleteLocalBranchAfterMerge`, `deleteRemoteBranchAfterMerge`
- `aiPromptTemplate` — custom AI prompt template
- `appearance.*` — compact mode, badges, comments, checklist, avatars, priority, reduced animations

## Local JSON mode

By default the board is stored in `.branchboard/board.json` inside the workspace.
The file is created automatically, watched for external edits, migrated across
schema versions, and backed up to `board.backup.json` before each write so a
corrupted file never destroys your data.

## Server mode preview

A `ServerStorageProvider` (SSH + SQLite) is wired through the same
`StorageProvider` interface as a preview for shared, real-time boards. Local JSON
mode is the supported MVP today.

## Roadmap

- Real-time multi-user server mode (SQLite + WebSocket sync)
- Per-board column WIP limits
- Pull-request integration
- More languages

---

## Opis po polsku

BranchBoard to tablica Kanban dla programistów, która działa bezpośrednio w
VS Code i Cursorze. Każde zadanie może mieć przypisany branch Git, osobę
odpowiedzialną, komentarze, priorytet, listę zadań i bezpieczny flow zakończenia
pracy. BranchBoard łączy tablicę zadań z prawdziwym branchem Git, więc zespół
zawsze wie, kto nad czym pracuje, gdzie jest kod i co jest gotowe do review.

Interfejs domyślnie działa po polsku; język można zmienić na angielski w
ustawieniach (`branchBoard.language`). BranchBoard nigdy nie scala do `main` ani
nie usuwa brancha bez wyraźnego potwierdzenia.

## License

MIT — see [LICENSE](LICENSE).
