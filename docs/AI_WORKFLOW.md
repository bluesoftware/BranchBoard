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
