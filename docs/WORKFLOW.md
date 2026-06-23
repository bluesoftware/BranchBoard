# BranchBoard Workflow

This document describes the main BranchBoard workflow from idea to production.
For product-level daily usage see [PRODUCT_HANDBOOK.md](PRODUCT_HANDBOOK.md).

## 1. Create Or Prepare A Task

Create a task from:

- Board plus button,
- quick add modal,
- command `BranchBoard: Create Task`,
- branch actions that create a task from an existing branch.

A good task contains:

- clear title,
- description,
- acceptance criteria,
- checklist,
- priority,
- due date if relevant,
- assignee,
- task type,
- attached files or `@file` mentions,
- branch name or a workflow stage that can create one.

## 2. Assign User And Scope

BranchBoard can detect the current user from:

```bash
git config user.name
git config user.email
```

It can also import commit authors into board users. The user switcher supports:

- all tasks,
- my tasks,
- individual users,
- unassigned,
- branch/no-branch filters,
- current branch,
- needs review,
- done.

## 3. Move Into Work

When a task enters a Git-enabled work column, BranchBoard can:

- suggest or create a branch,
- checkout existing branch,
- ensure branch from remote if it exists only on origin,
- run column hooks,
- enforce WIP warnings,
- update the task state.

Default work model:

| Stage | Default column | Meaning |
| --- | --- | --- |
| none | Backlog / To Do | Planning, no branch required. |
| ai-agent | AI Agent | Prompt/plan/work/review for AI task flow. |
| feature | In Progress | Local feature work. |
| review | Code Review | Branch pushed, ready for review. |
| staging | Testing | Integrated to DEV/staging. |
| production | Done | Production/main completed. |

## 4. Work In Current Branch

Use **Current Branch** when coding. It shows:

- current Git branch,
- linked task,
- changed files,
- commits,
- risk,
- suggested next step,
- task checklist,
- comments,
- work log,
- AI Agent panel.

If the current branch has no task, create or link a task from this view.

## 5. Push And Review

Before review:

1. Commit your work.
2. Push the task branch.
3. Run configured rules/test command when applicable.
4. Update checklist and comments.
5. Move the task to Code Review.

BranchBoard stores `branch_pushed` and review-related events so the Command
Center can show activity and readiness.

## 6. Deploy To DEV

If `branchBoard.devDeployCommand` is configured, a task branch can be deployed to
DEV from the task drawer, Current Branch or Command Center.

The deploy command can use:

- `{{branchName}}`,
- `{{branchSlug}}`.

After deploy:

- BranchBoard stores a `Deployment`,
- Command Center shows the environment state,
- tester can mark it as tested.

## 7. Finish The Task

Finish is the production path. It is intentionally strict.

BranchBoard checks:

- task has a branch,
- working tree is clean when required,
- branch can be checked out or ensured,
- direct merge to main is allowed,
- user confirms merge when required,
- optional pre-finish command succeeds,
- branch updates from main successfully,
- branch pushes successfully,
- optional backup branch/tag can be created,
- main pulls successfully,
- merge succeeds,
- main pushes successfully.

Only then the task can move to Done and receive `finishedAt`.

If any step fails, BranchBoard shows a clear error and does not mark the task as
done.

## 8. Cleanup Or Archive Branches

Use Command Center -> Cleanup or Branch Flow.

Safe cleanup options:

- delete local branch,
- archive local branch by creating a tag first,
- delete remote branch with confirmation,
- bulk delete local branches except current/main.

Force delete is disabled unless `branchBoard.allowForceDeleteBranch` is enabled.

## AI-Assisted Variant

For AI work:

1. Put task in AI Agent column or open AI panel on the task.
2. Attach Cursor personas if useful.
3. Generate prompt.
4. Run Plan.
5. Review the plan.
6. Run Work.
7. Run Review.
8. Accept or reject the result.
9. Continue normal Git review and finish flow.

AI can help generate changes, but Git safety remains human-controlled.

See [AI_WORKFLOW.md](AI_WORKFLOW.md).

## Command Center Review Loop

The lead's loop:

1. Open Command Center -> Overview.
2. Resolve Needs Attention.
3. Check Branch Flow for local-only, not pushed, stale and ready-to-merge work.
4. Check Risk Radar for high-risk branches.
5. Check Deployments before merging.
6. Check AI Review for AI-assisted tasks.
7. Use Activity to understand what changed recently.

## Local JSON Workflow

Default data file:

```text
.branchboard/board.json
```

BranchBoard creates it automatically, watches it for changes and backs it up to:

```text
.branchboard/board.backup.json
```

## Development Workflow

Build the WebView and extension:

```bash
npm install
cd webview
npm install
npm run build
cd ..
npm run compile
```

Run in VS Code Extension Development Host with `F5`.
