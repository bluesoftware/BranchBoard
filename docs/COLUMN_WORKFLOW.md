# Column Workflow, Git Mapping And Command Hooks

BranchBoard columns are workflow stages mapped onto the Git lifecycle. They are
not meant to be feature areas. Business areas such as checkout, account, admin or
SEO should be represented by task metadata, impact areas or naming, while the
board axis stays a clean status pipeline.

## Default Columns

| PL | EN | id | Git stage | Meaning |
| --- | --- | --- | --- | --- |
| BACKLOG | Backlog | `backlog` | `none` | Ideas and unready work. |
| DO ZROBIENIA | To Do | `todo` | `none` | Ready to pick up, no branch required yet. |
| AI AGENT | AI Agent | `ai-agent` | `ai-agent` | AI Plan/Work/Review preparation. |
| W TRAKCIE | In Progress | `in-progress` | `feature` | Local feature work on a branch. |
| CODE REVIEW | Code Review | `review` | `review` | Pushed branch awaiting review. |
| DO TESTU | Testing | `testing` | `staging` | Integrated/deployed to DEV. |
| ZROBIONE | Done | `done` | `production` | Released/finished work. |

Git levels:

- `origin/<task-branch>` - feature work visible to the team,
- `origin/dev` - staging/integration when `useDevBranch` is enabled,
- `origin/main` - production/mainline.

## Column Fields

Column config can include:

- `gitStage`,
- `baseBranch`,
- `targetBranch`,
- `branchPrefix`,
- `wipLimit`,
- `onEnter`,
- `onLeave`.

Examples:

- feature column can use `branchPrefix: "feature/"`,
- AI column can use `branchPrefix: "ai/"`,
- testing column can target `dev`,
- done column can target `main`.

## Move Flow

When a task moves to another column:

1. BranchBoard checks move guards.
2. WIP limit can ask for confirmation.
3. Task order/position is updated.
4. `onLeave` hooks can run for the old column.
5. `onEnter` hooks can run for the new column.
6. Blocking hook failure moves the task back.
7. Git stage automation can run if `runGitActionsOnMove` is enabled.
8. Failed Git action moves the task back.
9. Notifications/events are recorded.

## Git Stages

| Stage | Typical action |
| --- | --- |
| `none` | No Git action. |
| `ai-agent` | Prepare AI workflow; task needs AI config before entering. |
| `feature` | Ensure/create/checkout branch. |
| `review` | Push branch and mark review state. |
| `staging` | Merge/integrate into `dev` target when configured. |
| `production` | Run finish flow before task is truly done. |

Exact behavior is controlled by `BoardPanel` and `GitService`, not by the
WebView alone.

## Command Hooks

Each column can define:

- `onEnter` hooks,
- `onLeave` hooks.

Hook fields:

- `id`,
- `label`,
- `command`,
- `args`,
- `requireConfirm`,
- `requireCleanTree`,
- `continueOnError`,
- `timeoutSec`,
- `blocking`,
- `enabled`.

Variables available inside args:

- `{{branch}}`
- `{{taskId}}`
- `{{taskTitle}}`
- `{{slug}}`
- `{{baseBranch}}`
- `{{targetBranch}}`
- `{{mainBranch}}`
- `{{columnId}}`
- `{{columnName}}`
- `{{user}}`

Variables are substituted inside separate argument tokens. They are not
concatenated into a shell string.

## Hook Safety

`CommandRunnerService` enforces:

- no shell,
- bare command names only,
- `branchBoard.allowedCommands` allowlist,
- optional modal confirmation,
- optional clean-tree gate,
- timeout,
- audit log at `.branchboard/audit.log`,
- blocking failure rollback.

Sample hooks in the default columns are disabled until the user enables them.

## WIP Limits

`wipLimit` sets a soft cap on a column.

When moving a task into a full column, BranchBoard asks whether to move anyway.
The board does not silently reject the move, because WIP rules are process
guidance, not data corruption protection.

## Settings

```jsonc
{
  "branchBoard.useDevBranch": true,
  "branchBoard.defaultBranchPrefix": "feature/",
  "branchBoard.runGitActionsOnMove": true,
  "branchBoard.confirmGitActionsOnMove": true,
  "branchBoard.enableColumnHooks": true,
  "branchBoard.allowedCommands": ["npm", "pnpm", "yarn", "npx", "node", "git", "make"],
  "branchBoard.hookTimeoutSeconds": 120
}
```

## Migration Note

Existing boards keep their current columns. New default boards use the Git-mapped
workflow columns above. If an existing board should adopt the new model, edit the
column config through the UI or migrate `.branchboard/board.json` deliberately.
