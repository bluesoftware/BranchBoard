# AI Coding Workflow

BranchBoard is positioned for the way modern teams actually build: **human + AI +
Git branch**. The differentiator is the **Copy AI Prompt** button on every task.

## What it does

Click **Copy AI Prompt** in the task drawer. BranchBoard builds a complete,
ready-to-paste prompt for Cursor, Claude or GitHub Copilot Chat and copies it to
your clipboard.

The prompt includes:

- the branch you're working on
- project name
- task title and description
- acceptance criteria (derived from unchecked checklist items)
- the full checklist
- a summary of comments
- your configured test/build command
- a fixed set of rules

## The rules

The built-in template instructs the agent to:

- inspect the existing code relevant to the task first
- make a short implementation plan before writing code
- change only the files required for the task — no unrelated refactors
- keep the solution simple and production-ready
- keep commits focused and small
- run the test/build command if available
- finish by summarizing changed files and how to test them

## Example output

```
You are working in this repository on branch: feature/task-ab12cd-add-login.

Project: BranchBoard

Task:
Add login form

Description:
Email + password form with validation.

Acceptance criteria:
- Validate email format
- Show inline errors

Rules:
- First inspect the existing code relevant to this task.
- Make a short implementation plan before writing code.
- Change only files required for this task. Do not refactor unrelated code.
- ...
- Run the test/build command if available: npm run build
- At the end, summarize the changed files and how to test them.
```

## Customizing the template

Edit `branchBoard.aiPromptTemplate` (or Settings → AI). Available variables:
`{title}`, `{description}`, `{branch}`, `{project}`, `{acceptance}`, `{checklist}`,
`{comments}`, `{command}`. Leave it empty to use the built-in template.

## Branch location badges (local / origin / dev / prod)

Every task with a branch shows a live **location badge** above the title in the
task drawer. It is never stored — it's computed on demand straight from Git:

- **local** — the branch only exists on your machine, nobody else can see it.
- **origin** — the branch has been pushed and is visible to the whole team.
- **dev** — the branch has been merged into the configured dev/staging branch.
- **prod** — the branch has been merged into the main branch.

The state is recomputed via `git merge-base --is-ancestor` against main (and,
if `branchBoard.useDevBranch` is on, against the dev branch) plus the existing
ahead/behind/exists checks. This is intentionally never persisted on the task —
persisting it would let the badge lie if someone merges or pushes outside of
BranchBoard.

### Action badges that appear once a branch reaches "origin"

As soon as a branch is pushed (state = `origin`), three extra clickable
badges appear next to the location badge:

- **Sprawdź zgodność z rules / Check rules compliance** — runs your configured
  `branchBoard.runCommandBeforeFinish` command (the same trusted,
  admin-configured command used by the Finish Task flow, executed the same
  safe way: `execFile`, no shell, no task-controlled input) and shows
  pass/fail plus full stdout/stderr right inside the task, so a reviewer never
  has to open a terminal.
- **Podsumuj zmiany / Summarize changes** — copies a ready-to-paste AI prompt
  built from the branch's changed files, recent commits, the task title, and
  the same fixed rules block used by "Copy AI Prompt". Paste it into
  Cursor/Claude/Copilot Chat to get a structured changes summary.
- **Wklej wynik AI / Paste AI result** — opens a textarea (backed by the
  existing `task.ai.aiNotes` field) where you paste whatever the AI produced
  — a rules check, a changes summary, anything — so the reviewer sees it
  without leaving the task.

If the local branch hasn't been pushed yet (state = `local`), a single
**Push** badge appears instead, since the AI actions only make sense once the
code is visible to the team.

This is the localhost → dev → prod path BranchBoard is built around: the
badge row tells you and your reviewer exactly where a piece of work currently
lives, and the action badges give you the verification you need before
deciding to move it further — all without leaving the task.
