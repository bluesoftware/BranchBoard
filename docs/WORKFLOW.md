# BranchBoard Workflow

The core idea: **one task = one branch = one unit of work**.

## 1. Create a task

Add a task to any column. Give it a title, optional description, assignee and
priority. BranchBoard immediately suggests a Git-safe branch name based on the
title, e.g. `feature/task-ab12cd-add-login-form`.

The suggested name is:

- lowercase, ASCII only (Polish diacritics folded, `ł` → `l`)
- spaces and special characters collapsed to single dashes
- length-capped and trimmed
- validated by `git check-ref-format` before use

## 2. Create the branch

From the task drawer, click **Create branch**. BranchBoard runs
`git checkout -b <branch>` (or checks it out if it already exists) and links the
branch to the task. The card now shows a branch badge.

## 3. Work

Switch branches at any time with **Checkout** (card hover or drawer). The drawer
shows the current branch, the task branch, whether they match, and whether you
have uncommitted changes.

## 4. Push

**Push branch** runs `git push -u <remote> <branch>`.

## 5. Finish the task

**Finish task** runs the safe flow:

1. Verify the task has a branch.
2. If `requireCleanWorkingTreeBeforeFinish` is on and the tree is dirty → stop.
3. Check out the task branch.
4. If `runCommandBeforeFinish` is set (e.g. `npm run build`) → run it, stop on failure.
5. Push the task branch.
6. **If direct merge is disabled** (default): move the task to a review column. No
   merge happens.
7. **If direct merge is enabled**: ask for explicit confirmation, then check out
   `main`, pull, merge, push, optionally clean up the branch, and mark the task done.

A failure at any step stops the flow and leaves the task open. See
[SAFETY.md](SAFETY.md).

## Columns

New boards created via onboarding use: `BACKLOG · TODO · IN PROGRESS · REVIEW ·
TESTING · DONE`. Columns can be renamed, reordered (drag the header), and deleted
when empty. Moving a task into a "done" column marks it done; moving it back
reopens it.

## Filters & search

Filter by My / All / Unassigned / Current branch / Has branch / No branch / Needs
review / Done, or by a specific user. Search matches title, description, branch,
comments and assignee. Press `/` to focus search, `n` for a new task, `Esc` to
close panels.
