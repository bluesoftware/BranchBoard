# Rollback & Git safety

BranchBoard's guiding rule: **non-destructive by default**. It will happily
create safety nets for you, but it will never rewrite history or throw away work
automatically. Anything destructive is generated as commands for you to review
and run yourself.

## Safety nets before merge

When the finish flow merges a task branch into main, it can first create:

- a **backup branch** `backup/<branch>-<timestamp>`
  (`branchBoard.createBackupBranchBeforeMerge`, default **on**), and/or
- a **safety tag** `before-merge-<taskId>-<timestamp>` at the main tip
  (`branchBoard.createSafetyTagBeforeMerge`, default **off**).

Both are plain pointers to existing commits — they change nothing in your tree,
and they give you a guaranteed way back if a merge goes wrong.

## Manual safety actions (task drawer → Safety)

- **Create backup branch** — snapshot the current branch without checking it out.
- **Create safety tag** — tag the main tip.
- **Copy rollback commands** — copies a reviewed list of commands (safe undo,
  history inspection, and clearly-marked DANGER commands) to your clipboard.
- **Revert last commit** — the safe undo: runs `git revert --no-edit HEAD`, which
  creates a new commit. It requires a clean working tree and asks for
  confirmation. A conflicted revert is aborted automatically so your tree stays
  clean.
- **Git guide** — opens the official `git revert` documentation.

## What BranchBoard will never do automatically

- `git reset --hard` (or any history rewrite)
- delete a branch after a failed merge
- mark a task done if a git operation failed
- deploy to production without an explicit opt-in and confirmation

If you need a destructive operation, copy the rollback commands, read them, and
run the one you actually want.
