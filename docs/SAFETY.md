# Git Safety

BranchBoard is built so that automation never surprises you. The guiding rules:

1. **Never merge to `main` without explicit confirmation.** Direct merge is off by
   default (`allowDirectMergeToMain: false`). Even when enabled,
   `requireConfirmationBeforeMerge` (default `true`) forces a modal confirmation.
2. **Never delete a branch unless a merge fully succeeded.** Local/remote branch
   cleanup is opt-in (`deleteLocalBranchAfterMerge`, `deleteRemoteBranchAfterMerge`)
   and only runs after a successful merge **and** push.
3. **Never mark a task done if a Git step failed.** Any failure stops the flow and
   leaves the task in place.
4. **Conflicts are aborted cleanly.** A failed merge runs `git merge --abort` so the
   working tree is never left half-merged. The branch is not deleted.

## Command execution

All Git calls use `execFile` (no shell), so task data can never be injected into a
command. Branch names are validated with `git check-ref-format` before use. The
optional pre-finish command is split into program + args without honoring shell
metacharacters.

## Working-tree protection

With `requireCleanWorkingTreeBeforeFinish` on (default), finishing a task with
uncommitted changes is refused with a clear message: *commit or stash first*.

## Clear error messages

Each failure explains what happened, what to do, and confirms the task was **not**
closed. Covered cases include: no Git repository, branch not found, dirty working
tree, push failed, merge conflict, `main` pull failed, and pre-finish command failed.

## Data safety

The local board file is backed up to `board.backup.json` before every write. A
corrupted `board.json` is never overwritten with a default board — BranchBoard
restores from the backup, or reports the problem so you can fix it. The file
watcher ignores events caused by its own writes to avoid save/reload loops.
