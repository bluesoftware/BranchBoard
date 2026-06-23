# Current Branch

Current Branch is the developer's work hub. It shows everything BranchBoard knows
about the branch currently checked out in the repository.

Use it when you are coding and want one answer:

> What is this branch, what task owns it, what changed and what should I do next?

## What It Shows

- current branch,
- dirty working-tree state,
- ahead/behind main,
- linked task or no-task state,
- task title, description, assignee, checklist and comments,
- changed files,
- commits,
- risk level,
- work log,
- deployment state,
- AI Agent panel,
- suggested next step,
- safe actions.

## Main States

### On Main

When the current branch is the main branch, Current Branch shows a calm state
with shortcuts to Board and Branch Map. It does not encourage push/finish from
main.

### Feature Branch With Linked Task

This is the full working state:

- task context,
- branch details,
- actions such as push, deploy, finish, copy prompt,
- technical details tabs,
- AI Agent controls.

### Branch Without Task

BranchBoard offers:

- create task from current branch,
- link current branch to an existing task.

This is useful when a developer created a branch manually before opening
BranchBoard.

## Suggested Next Step

BranchBoard suggests the next action based on current state:

- link/create task,
- commit or clean dirty tree,
- push branch,
- check high risk,
- deploy to DEV,
- move to review,
- finish/merge when ready.

The suggestion is advisory. It does not run automatically.

## Technical Detail Tabs

Current Branch can show technical details such as:

- changed files,
- commits,
- safety/rollback actions,
- AI Agent panel when the task is AI-assisted or in the AI column.

Opening files and diffs uses VS Code APIs through BoardPanel.

## Task Flow From This View

The task flow pipeline lets the user move the linked task between board columns.

Moving a task can trigger the same safeguards as dragging on the board:

- WIP confirmation,
- column hooks,
- Git stage automation,
- finish flow for production,
- rollback if a blocking step fails.

## AI Agent In Current Branch

The same AI panel used in the task drawer is available here when relevant.

It can:

- generate prompt,
- run Plan,
- run Work,
- run Review,
- show live logs,
- stop active run,
- store usage/cost/result history.

This keeps AI context close to the actual branch instead of hiding it in a
separate chat.

## Moving Changes Between Branches

BranchBoard does not move individual files between Git branches automatically.

For local uncommitted changes, Current Branch can copy safe transfer commands for
the user to review:

```bash
git stash
git checkout <target-branch>
git stash pop
```

or a patch-based approach:

```bash
git diff > branchboard-transfer.patch
```

Nothing is executed automatically.

## Workflow Stage Vs Branch Location

There are two different concepts:

### Workflow Stage

The board column says where the task is intended to be in the process:

```text
none -> feature -> review -> staging -> production
```

This is set by moving the task.

### Branch Location

The branch location badge says where the code actually is:

- `local`,
- `origin`,
- `dev`,
- `prod`.

This is computed from Git on demand and is not persisted.

If the two disagree, trust the Git-truth badge and investigate why the board
column is stale.

## Safety

Current Branch does not run destructive operations automatically.

Actions that need confirmation keep their confirmation:

- merge to main,
- production deploy,
- delete branch,
- force delete,
- archive,
- revert,
- update branch from main when needed.

Related docs:

- [WORKFLOW.md](WORKFLOW.md)
- [SAFETY.md](SAFETY.md)
- [AI_WORKFLOW.md](AI_WORKFLOW.md)
- [ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md)
