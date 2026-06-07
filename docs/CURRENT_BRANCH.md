# Current branch / Aktualny branch

The **Current branch** view is the developer's quick work hub. Open it and you
immediately see everything BranchBoard knows about the branch you're on — without
hunting for the task on the board.

Widok **Aktualny branch** to szybkie centrum pracy programisty: pokazuje wszystko
o branchu, na którym jesteś, i powiązanym zadaniu.

## What it shows

- Current branch, working-tree state (dirty), ahead/behind main.
- The linked task (title, status/column, description) or a clear empty state.
- Changed files vs main (open / compare).
- Branch commits (`main..branch`).
- A **suggested next step** based on the real state.
- A **task flow** pipeline to move the task between stages.
- Safe actions for the branch.

## States

- **On a feature branch with a task** — full task summary, task-flow pipeline,
  changed files, commits and actions.
- **Branch without a task** — empty state with *Create task from branch* and
  *Link branch to existing task*.
- **On main** — a reminder that main should hold finished work, with shortcuts to
  the board and Branch Map (no push/finish offered by default).

## Task flow

The pipeline shows your board columns; the current one is highlighted. Clicking a
stage moves the task there and logs an event. Moving into a "done" column routes
through the **safe Finish task flow** (it never silently marks done when a branch
is involved).

## Suggested next step

BranchBoard suggests, never auto-runs: e.g. "push the branch", "deploy to DEV so a
tester can verify", "this branch looks ready to merge", or "elevated risk — check
the changed files first".

## Moving changes between branches

Code physically belongs to the current Git branch. BranchBoard does **not** move
individual files between branches automatically. Moving a task between stages
changes work status and suggests the right Git/deploy action. For actually moving
local changes elsewhere, use **Copy transfer commands**, which copies a safe,
reviewable sequence (`git stash` / `git checkout` / `git stash pop`, or a patch) —
nothing is executed for you.

## Safety

No destructive operations run automatically. Reset --hard, force push, delete
branch, rebase, merge to main and production deploy all require their own
confirmed flows.
