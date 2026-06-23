# Branch Flow

Branch Flow is the operational panel for managing branches as work items. It is
part of Command Center and combines board tasks with real Git state.

It is not only a visual pipeline. It is also where a lead can find branches that
need action, link them to tasks and clean them up safely.

## What A Row Represents

One row can represent:

- a task with a branch,
- a Git branch linked to a task,
- a Git branch without a task,
- a backup/archive branch,
- a stale branch,
- a branch ready for review/merge.

Data comes from:

- `BoardData.tasks`,
- local Git refs,
- remote-tracking refs,
- branch stats against main,
- deployments,
- risk scoring.

## Pipeline

Every branch row can show:

```text
Task -> Branch -> Commits -> Push -> DEV -> Review -> Testing -> Merge
```

The pipeline describes the operational state, not just the board column.

## Filters

Branch Flow supports filters such as:

- all,
- mine,
- active,
- without task,
- not pushed,
- local only,
- remote only,
- backup,
- stale,
- ready to review,
- ready to merge,
- cleanup,
- on DEV.

Stale detection is currently code-defined by `BranchAnalyticsService` and uses
the repository's last commit timestamp. If this becomes configurable later, add
the setting to [SETTINGS_REFERENCE.md](SETTINGS_REFERENCE.md).

## Branch Row Content

Typical row data:

- selection checkbox for bulk operations,
- branch name,
- current/main/dev badges,
- local/remote state,
- linked task title or "no task",
- assignee,
- column,
- risk level,
- stale badge,
- ahead/behind main,
- changed files count,
- last commit time/message,
- pipeline states,
- quick actions.

## Quick Actions

Depending on row state, actions include:

- checkout branch,
- push branch,
- deploy to DEV,
- open linked task,
- create task from branch,
- link branch to existing task,
- open branch details drawer,
- copy branch name or summary.

Actions that mutate Git go back through `BoardPanel` and `GitService`.

## Branch Drawer

The Branch Drawer gives deeper context:

- commits,
- changed files,
- additions/deletions,
- open file,
- open diff,
- copy AI prompt,
- push,
- deploy to DEV,
- create/link/open task,
- delete local,
- delete remote,
- archive.

Destructive actions require confirmation.

## Linking And Creating Tasks

### Create Task From Branch

Creates a task with:

- title derived from branch name,
- branch linked,
- current user as assignee when available,
- default column based on board workflow.

The user should then fill in description, acceptance criteria and checklist.

### Link Branch To Task

Attach a branch to an existing task that has no branch.

This is useful when:

- a developer created a branch manually,
- a teammate pushed a branch outside BranchBoard,
- old work is being migrated into the board.

## Cleanup

Cleanup actions:

- archive local branch,
- delete local branch,
- delete remote branch,
- bulk delete local branches.

Safety:

- current branch is protected,
- main/default branch is protected,
- bulk delete skips protected branches,
- local delete uses safe `git branch -d`,
- force delete requires `branchBoard.allowForceDeleteBranch` and confirmation,
- remote delete requires confirmation,
- archive creates an `archive/<branch>-<timestamp>` tag before local removal.

## Good Review Routine

For a lead:

1. Filter `not pushed` and ask owners to push or remove dead work.
2. Filter `without task` and create/link tasks.
3. Filter `stale` and decide whether to revive, archive or delete.
4. Filter `ready to review`.
5. Check `high risk` rows before merge.
6. Check DEV deployment/test status before production.

## Related Docs

- [COMMAND_CENTER.md](COMMAND_CENTER.md)
- [CURRENT_BRANCH.md](CURRENT_BRANCH.md)
- [SAFETY.md](SAFETY.md)
- [ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md)
