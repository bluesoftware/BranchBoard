# Rollback And Git Safety

BranchBoard is non-destructive by default. It can create safety nets and prepare
rollback commands, but it should not silently rewrite history or throw away work.

## Safety Nets Before Merge

The finish flow can create:

- backup branch: `backup/<branch>-<timestamp>`,
- safety tag: `before-merge-<taskId>-<timestamp>`.

Settings:

```jsonc
{
  "branchBoard.createBackupBranchBeforeMerge": true,
  "branchBoard.createSafetyTagBeforeMerge": false
}
```

Backup branches and safety tags are plain Git refs. They do not change the
working tree and do not remove commits.

## Manual Safety Actions

Available from task drawer / Current Branch safety areas:

- create backup branch,
- create safety tag,
- copy rollback commands,
- revert last commit,
- revert from origin,
- resume branch after production rollback where supported.

## Revert Last Commit

This is the safe undo:

```bash
git revert --no-edit HEAD
```

It creates a new commit instead of rewriting history.

BranchBoard requires a clean working tree and asks for confirmation. If revert
conflicts, BranchBoard attempts to abort so the tree stays clean.

## Revert From Origin

This is used when local work needs to be brought back to the remote-tracking
state. It is guarded and should be used only after reading the operation detail.

For destructive reset-style recovery, BranchBoard prefers copying commands for
manual review rather than running them automatically.

## Archive Instead Of Delete

Archive creates:

```text
archive/<branch>-<timestamp>
```

then removes the local branch. This preserves a reference to the commits so a
developer can recover the branch later.

## Copied Rollback Commands

Generated command blocks include:

- safe revert,
- `git log`,
- `git reflog`,
- restore from backup branch,
- clearly marked dangerous examples such as `git reset --hard`,
- merge revert examples for main.

Dangerous commands are commented out in the generated text.

## What BranchBoard Will Not Do Automatically

- `git reset --hard`,
- force push,
- delete a branch after failed merge,
- delete remote branch without confirmation,
- force-delete local branch by default,
- mark task done after failed Git operation,
- deploy to production without explicit opt-in and confirmation.

## Recovery Checklist

If production/main got a bad merge:

1. Stop new merges.
2. Inspect main:

   ```bash
   git checkout main
   git status
   git log --oneline -n 20
   ```

3. Prefer revert over reset:

   ```bash
   git revert --no-edit -m 1 <merge-commit>
   ```

4. Push only after review:

   ```bash
   git push origin main
   ```

5. Reopen or recreate the task branch if more work is needed.

## Related Docs

- [SAFETY.md](SAFETY.md)
- [WORKFLOW.md](WORKFLOW.md)
- [BRANCH_FLOW.md](BRANCH_FLOW.md)
