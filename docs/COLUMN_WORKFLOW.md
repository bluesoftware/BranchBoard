# Column workflow, Git mapping & command hooks

BranchBoard columns are **workflow stages mapped onto the Git lifecycle**, not
feature areas. Feature areas (KOSZYK, KONTO, …) belong on tasks as labels /
impact areas, so the board axis stays a clean status pipeline that maps to
branches.

## Default columns (PL / EN) and Git mapping

| PL | EN | id | Git stage | Branch / target |
|----|----|----|-----------|-----------------|
| BACKLOG | Backlog | `backlog` | none | no branch |
| DO ZROBIENIA | To Do | `todo` | none | no branch |
| W TRAKCIE | In Progress | `in-progress` | feature | `feature/<id-slug>` from `dev` (origin/&lt;branch&gt;) |
| CODE REVIEW | Code Review | `review` | review | branch pushed; PR `feature/* → dev` |
| DO TESTU | Testing | `testing` | staging | integrated into `dev` (origin/dev) |
| ZROBIONE | Done | `done` | production | released into `main` (origin/main) |

Three Git levels: `origin/main` = production (Done), `origin/dev` = staging
(Testing), `origin/<branch>` = feature work (In Progress / Review).

The Git model is configurable:

- `branchBoard.useDevBranch` — set `false` for a simpler `feature → main` flow
  (no dev/staging layer).
- `branchBoard.defaultBranchPrefix` — prefix for auto-named branches.
- Per column: `gitStage`, `baseBranch`, `targetBranch`, `branchPrefix`, `wipLimit`.

## Per-column command hooks

Each column has two command lists, edited from the column menu →
**Configure commands…**:

- **onEnter** — run when a task enters the column.
- **onLeave** — run when a task leaves the column.

Each command (hook) has: `label`, `command`, `args[]`, and flags
`enabled`, `blocking`, `requireConfirm`, `requireCleanTree`,
`continueOnError`, `timeoutSec`.

Variables substituted into arguments (as separate, safe tokens):
`{{branch}}`, `{{taskId}}`, `{{slug}}`, `{{baseBranch}}`,
`{{targetBranch}}`, `{{mainBranch}}`, `{{columnId}}`, `{{columnName}}`, `{{user}}`.

A **blocking** hook that fails moves the task back to its previous column, so
the board never lies about state.

## WIP limits

Set `wipLimit` on a column to cap how many tasks it can hold. Moving a task in
past the limit asks for confirmation first (header shows `count/limit`, turns
red when full).

## Security model

Command hooks are designed so task data can never become executable:

1. **No shell** — commands run via `execFile` with `shell: false`; metacharacters
   (`&&`, `|`, `;`, `$()`, quotes) are never interpreted.
2. **Allowlist** — only binaries in `branchBoard.allowedCommands` run; anything
   else (or any name containing a path separator / `..`) is refused.
3. **Separate arguments** — args are an array, never a concatenated string.
4. **Workspace-scoped** — every command runs with `cwd` = the repo root.
5. **Confirmation** — `requireConfirm` shows the exact command before running.
6. **Clean-tree gating** — `requireCleanTree` refuses to run on a dirty tree.
7. **Timeout** — runaway processes are killed past `timeoutSec`.
8. **Audit log** — every attempt (ok / fail / blocked / declined) is appended to
   `.branchboard/audit.log`.
9. **Master switch** — `branchBoard.enableColumnHooks` disables all hooks at once;
   sample hooks ship **disabled** by default.

Destructive Git actions (merge to main, branch deletion) remain behind their
existing explicit confirmations — hooks never perform them.

## Settings reference

```jsonc
"branchBoard.useDevBranch": true,
"branchBoard.defaultBranchPrefix": "feature/",
"branchBoard.enableColumnHooks": true,
"branchBoard.allowedCommands": ["npm","pnpm","yarn","npx","node","git","make"],
"branchBoard.hookTimeoutSeconds": 120
```

> Existing boards keep their current columns — these defaults apply to newly
> created boards. To adopt the Git-mapped columns on an existing board, edit
> `.branchboard/board.json` (the file watcher reloads it) or recreate the board.

## Further automation ideas (roadmap)

Auto-named branches from task id+title, auto-PR creation via `gh` on entering
Review, branch state sync (merged/conflict badges), stale-branch detection,
checklist-gated Done, and CI status badges on cards.
