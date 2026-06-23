# Git And Data Safety

BranchBoard is built around one rule:

> Automation may help, but it must not surprise the developer.

The extension can run Git, command hooks, deploy commands and AI agents, so the
safety model is part of the product, not an implementation detail.

## Non-Negotiable Rules

1. **Never merge to main without explicit permission.**
   `branchBoard.allowDirectMergeToMain` is off by default. Even when enabled,
   `branchBoard.requireConfirmationBeforeMerge` defaults to true.

2. **Never delete branches without explicit confirmation.**
   Local/remote cleanup is opt-in and confirmed. Finish-flow cleanup only runs
   after successful merge and push.

3. **Never mark a task done if Git failed.**
   Failed checkout, push, update, merge, pull, pre-finish command or confirmation
   leaves the task unfinished.

4. **Never run task-controlled shell strings.**
   Git commands use `execFile`. Command hooks and AI agents use explicit binary
   allowlists and argument arrays.

5. **Never silently overwrite real board data with an empty board.**
   Local JSON has backup recovery. Server mode has empty-overwrite and
   optimistic-concurrency guards.

## Git Command Safety

`GitService` is the only place that should run Git.

Rules:

- commands run in the workspace root,
- branch names are validated with `git check-ref-format`,
- Git executable is resolved from safe candidates,
- configured SSH key is injected through `GIT_SSH_COMMAND`,
- expected Git failures return `OperationResult` instead of throwing to the UI,
- merge conflicts call `git merge --abort` where possible.

## Finish Task Flow

The production finish flow checks:

1. task has a branch,
2. working tree is clean when required,
3. BranchBoard can checkout/ensure the task branch,
4. direct merge to main is allowed,
5. user confirms merge when required,
6. optional `runCommandBeforeFinish` succeeds,
7. task branch is updated from main using merge/rebase policy,
8. task branch is pushed,
9. optional backup branch and safety tag are created,
10. main is checked out,
11. main is fast-forwarded from origin,
12. task branch merges into main,
13. main pushes successfully,
14. optional branch cleanup runs,
15. only then the task moves to Done and receives `finishedAt`.

Any failure stops the flow and explains what to do next.

## Working Tree Protection

Dirty-tree checks protect:

- finish task,
- pull/update main,
- update branch from main,
- merge into main/dev,
- resume branch from production rollback,
- AI runs when `requireCleanTreeBeforeAIAgentRun` is enabled,
- command hooks that set `requireCleanTree`.

The user should commit or stash before running these flows.

## Command Hooks

Column command hooks are run by `CommandRunnerService`.

Safety features:

- command must be in `branchBoard.allowedCommands`,
- command must be a bare binary name,
- no shell,
- arguments are separate tokens,
- task data is substituted only inside args,
- optional confirmation,
- optional clean-tree requirement,
- timeout,
- `.branchboard/audit.log` append-only audit.

Blocking hook failure moves the task back to its previous column.

## AI Agent Safety

AI agents are run by `AIAgentService`.

Safety features:

- command must be in `branchBoard.allowedAIAgentCommands`,
- no shell,
- process timeout,
- optional clean-tree requirement,
- optional confirmation,
- stop/cancel support,
- live logs visible to the user,
- AI cannot merge, push, deploy or delete through the AI service.

AI output is treated as work to review, not as an automatically trusted result.

## Deployment Safety

Deploy commands come from settings and support only explicit placeholders:

- `{{branchName}}`
- `{{branchSlug}}`

Production deploy is disabled by default:

```jsonc
"branchBoard.allowProductionDeploy": false
```

When enabled, production deploy can still require confirmation through
`branchBoard.requireConfirmationBeforeProductionDeploy`.

Every deploy attempt is recorded as a deployment record and event.

## Branch Cleanup Safety

Cleanup actions are explicit:

- delete local branch,
- force-delete local branch only when `allowForceDeleteBranch` is true,
- delete remote branch,
- archive branch by creating an archive tag first,
- bulk delete local branches.

Protections:

- current branch cannot be archived,
- current and main branches are skipped in bulk delete,
- remote delete has a modal confirmation,
- unmerged local branch deletion is refused unless force delete is enabled and
  confirmed.

## Rollback Safety

`SafetyService` creates names and manual command blocks:

- backup branch: `backup/<branch>-<timestamp>`,
- archive tag: `archive/<branch>-<timestamp>`,
- safety tag: `before-merge-<task>-<timestamp>`,
- rollback commands for manual review.

Destructive rollback commands are generated as commented examples, not executed
automatically.

See [ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md).

## Local JSON Safety

Local storage safety:

- board file is created automatically only when missing,
- schema is normalized on load,
- backup is written before each save,
- corrupted board loads backup if possible,
- no valid backup means a clear error instead of overwriting data,
- file watcher ignores own writes to avoid loops.

Files:

```text
.branchboard/board.json
.branchboard/board.backup.json
```

## Server Storage Safety

Server mode safety:

- no auto-seed on empty reachable database,
- relational schema with JSON payload preservation,
- optimistic concurrency through `updated_at`,
- empty-overwrite guard,
- board history and delta history,
- serialized load/save operations,
- fallback to local JSON is loud and logged.

See [SERVER_MODE.md](SERVER_MODE.md).

## Dashboard Safety

Dashboard and analytics reads should stay read-only:

- no automatic push,
- no automatic pull,
- no automatic fetch,
- no automatic merge,
- no automatic branch deletion.

Write operations only happen after explicit user actions such as Push, Checkout,
Deploy, Delete, Archive, Update from main or Finish.

## Recommended Safe Defaults

```jsonc
{
  "branchBoard.allowDirectMergeToMain": false,
  "branchBoard.requireConfirmationBeforeMerge": true,
  "branchBoard.requireCleanWorkingTreeBeforeFinish": true,
  "branchBoard.createBackupBranchBeforeMerge": true,
  "branchBoard.deleteLocalBranchAfterMerge": false,
  "branchBoard.deleteRemoteBranchAfterMerge": false,
  "branchBoard.allowForceDeleteBranch": false,
  "branchBoard.requireConfirmationBeforeAIAgentRun": true,
  "branchBoard.requireCleanTreeBeforeAIAgentRun": true,
  "branchBoard.allowProductionDeploy": false
}
```

Turn on direct merge or production deploy only when the team has agreed on the
release policy.
