# AI Coding Workflow

BranchBoard is built for the modern workflow: human developer, task, branch and
AI agent working in the same repository.

The goal is not to let AI silently change production. The goal is to make AI
work visible, reviewable and attached to the same card and branch as the human
work.

## AI Layers

BranchBoard has two AI layers:

1. **Copy AI Prompt** - prepares a complete prompt for Cursor, Claude or Copilot
   Chat and copies it to the clipboard.
2. **AI Agent workflow** - runs configured local CLI agents from a task with
   Plan, Work and Review steps.

## Copy AI Prompt

The prompt is built from task and project context:

- project name,
- task title,
- description,
- acceptance criteria,
- attached files,
- checklist,
- comments,
- branch name,
- configured test/build command,
- fixed rules for safe repo work.

The template is configured through `branchBoard.aiPromptTemplate`.

Supported variables:

- `{title}`
- `{description}`
- `{branch}`
- `{project}`
- `{acceptance}`
- `{files}`
- `{checklist}`
- `{comments}`
- `{command}`

Use this mode when you want the user to manually paste a prompt into an AI chat.

## AI Agent Workflow

The task drawer and Current Branch view can run a configured agent.

Recommended flow:

1. **Generate prompt**
   Build the task prompt from board, Git and attached file context.

2. **Plan**
   Ask the agent to produce only a plan. BranchBoard writes a plan file under
   `.cursor/plans` when possible.

3. **Work**
   BranchBoard ensures/creates the task branch, then runs the agent against the
   approved prompt/plan.

4. **Review**
   Ask the agent to review the work against the task, checklist and changed
   files. This step does not modify files.

5. **Accept or reject**
   Store the result on the task, then continue with normal human review and Git
   flow.

## Agent Execution Safety

AI agents are local CLI programs configured in `branchBoard.aiAgents`.

Execution rules:

- run via `spawn`, not a shell,
- command must be allowed by `branchBoard.allowedAIAgentCommands`,
- optional clean working tree gate through
  `branchBoard.requireCleanTreeBeforeAIAgentRun`,
- optional confirmation through `branchBoard.requireConfirmationBeforeAIAgentRun`,
- timeout through `branchBoard.aiAgentTimeoutSeconds`,
- no push, merge, deploy or branch deletion is performed by the AI service,
- user can stop/cancel the active process.

BranchBoard records output, status and changed files, but the developer remains
responsible for final code.

## Default Agents

The manifest ships with:

- `cursor-agent` - enabled by default,
- `claude-cli` - configured but disabled by default.

An agent definition can include:

- `id`
- `name`
- `command`
- `args`
- `enabled`
- `allowModels`
- `models`
- `pricing`
- `modelPricing`
- `listModelsArgs`

Example shape:

```jsonc
{
  "id": "cursor-agent",
  "name": "Cursor Agent",
  "command": "cursor-agent",
  "args": ["-p", "{{prompt}}", "--output-format", "json"],
  "enabled": true,
  "allowModels": true,
  "models": ["auto", "sonnet", "opus", "gpt-5", "gpt-5-codex"],
  "listModelsArgs": ["models", "--output-format", "json"]
}
```

Argument placeholders:

- `{{prompt}}`
- `{{promptFile}}`
- `{{model}}`
- `{{branch}}`
- `{{taskId}}`
- `{{taskTitle}}`
- `{{kind}}`

## Prompt And Plan Files

BranchBoard writes prompt files to:

```text
.branchboard/ai/
```

Plan files are written to:

```text
.cursor/plans/
```

These files make AI work inspectable outside the WebView and easier to reuse in
Cursor workflows.

## Live Console

AI agent output is streamed to the WebView as:

- stdout,
- stderr,
- system/result messages.

`json`, `stream-json` and plain text output are handled differently:

- buffered JSON is parsed at process close,
- stream JSON can show readable assistant/system chunks during execution,
- plain text is forwarded directly.

The raw process result is stored in the task's AI run history.

## Cursor Sub-Agents

BranchBoard reads Cursor persona files from:

```text
.cursor/agents/*.md
```

It extracts:

- name,
- description,
- markdown body,
- file triggers,
- keyword triggers,
- update timestamp.

Selected personas are inserted into the generated AI prompt. They are not runner
commands; they are context/persona documents for Cursor.

## Branches Created By AI

If a task has no branch, AI Work can suggest/create one using:

```text
branchBoard.defaultAIBranchPrefix
```

Default:

```text
ai/
```

When the AI work step succeeds, `branchBoard.moveToLocalAfterAIAgentSuccess`
can move the task into the normal local/in-progress column.

## Model Discovery

If an agent has `listModelsArgs`, BranchBoard can ask the CLI for available
models.

BranchBoard never invents model lists:

- missing `listModelsArgs` returns a clear message,
- blocked/missing command returns a clear message,
- non-zero CLI exit returns a clear message,
- unparseable output returns a clear message.

Parsed models can be combined with configured pricing.

## Usage And Cost

Agents may report token usage. BranchBoard normalizes common field names:

- `inputTokens` / `input_tokens`
- `outputTokens` / `output_tokens`
- `cacheReadTokens` / `cache_read_input_tokens`
- `cacheWriteTokens` / `cache_creation_input_tokens`

Cost estimates require both:

1. usage reported by the agent,
2. pricing configured on the agent or model.

If either is missing, BranchBoard shows usage/cost as unavailable rather than
guessing.

## AI Cost Guard

AI Cost Guard decides how much context to send and whether a run needs user
confirmation.

Decision actions:

- `answer_local`
- `prepare_prompt`
- `cursor_plan`
- `cursor_work`
- `cursor_review`

Context levels:

- `small`
- `normal`
- `full`

Risk levels:

- `low`
- `medium`
- `high`

Important settings:

- `branchBoard.aiCostMode`
- `branchBoard.aiCli.defaultContextLevel`
- `branchBoard.aiCli.requireConfirmForFullContext`
- `branchBoard.aiCli.maxFilesInContext`
- `branchBoard.aiCli.maxPromptChars`
- `branchBoard.aiCli.expensiveModelsRequireConfirm`

AI Cost Guard can use a local optimizer model, but that model is advisory only.
It cannot execute Git, commands or agent work.

## Prompt Optimizer

When `branchBoard.optimizePromptsBeforeSend` is enabled, BranchBoard runs a
text-only optimization pass before the real Plan/Work/Review agent.

Rules:

- it rewrites the prompt for clarity/structure,
- it must preserve facts, files and constraints,
- it never executes task work,
- it never edits files,
- if it fails, the original prompt is used.

Settings:

- `promptOptimizerAgentId`
- `promptOptimizerModel`
- `promptOptimizationRules`

## Branch Location Badges

Every task with a branch can show live location:

- `local` - branch exists only on this machine,
- `origin` - branch was pushed and is visible to the team,
- `dev` - branch is merged into the configured dev/staging branch,
- `prod` - branch is merged into main/production.

This state is computed from Git on demand and not persisted.

Once a branch reaches `origin`, additional actions can appear:

- check rules compliance,
- summarize changes,
- paste AI result.

## Recommended Team Policy

For production teams:

```jsonc
{
  "branchBoard.requireConfirmationBeforeAIAgentRun": true,
  "branchBoard.requireCleanTreeBeforeAIAgentRun": true,
  "branchBoard.aiAgentTimeoutSeconds": 900,
  "branchBoard.aiCostMode": "auto",
  "branchBoard.aiCli.defaultContextLevel": "normal",
  "branchBoard.aiCli.requireConfirmForFullContext": true,
  "branchBoard.aiCli.expensiveModelsRequireConfirm": true
}
```

For expensive models, configure per-model pricing and keep review required.

## What AI Must Not Do

Through BranchBoard's AI layer, AI must not:

- merge to main,
- push branches,
- deploy,
- delete branches,
- mark tasks done,
- bypass dirty-tree checks,
- bypass allowed command lists,
- silently change unrelated files.

Those actions stay in human-controlled Git and board workflows.
