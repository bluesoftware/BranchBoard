# Deployments

BranchBoard has a lightweight deployment layer. It does not know your hosting
provider and does not ship code by itself. It runs the command you configure,
records the result and shows deployment state in the task drawer, Current Branch
and Command Center.

## Environments

Deployment records support:

- `dev`,
- `staging`,
- `production`.

The current UI focuses on DEV and production.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `branchBoard.devDeployCommand` | `""` | Command run by Deploy to DEV. |
| `branchBoard.devDeployUrlTemplate` | `""` | URL used by Open DEV. |
| `branchBoard.productionBranch` | `main` | Branch treated as production. |
| `branchBoard.productionDeployCommand` | `""` | Command run by production deploy. |
| `branchBoard.allowProductionDeploy` | `false` | Must be true to enable production deploy. |
| `branchBoard.requireConfirmationBeforeProductionDeploy` | `true` | Modal confirmation before production deploy. |

## Placeholders

Commands and DEV URL templates support:

- `{{branchName}}` - original branch, e.g. `feature/task-ab12-login`
- `{{branchSlug}}` - URL-safe slug, e.g. `feature-task-ab12-login`

Example:

```jsonc
{
  "branchBoard.devDeployCommand": "npm run deploy:dev -- --branch {{branchName}}",
  "branchBoard.devDeployUrlTemplate": "https://dev.example.com/{{branchSlug}}"
}
```

## DEV Workflow

1. Open a task with a branch.
2. Click **Deploy to DEV**.
3. BranchBoard fills placeholders and runs the configured command.
4. It stores a `Deployment` record with status `deploying`.
5. After the command exits, status becomes `deployed` or `failed`.
6. It stores a board event:
   - `dev_deploy_started`,
   - `dev_deploy_finished`,
   - `dev_deploy_failed`.
7. Tester can click **Mark as tested**.
8. Command Center -> Deployments shows the result.

## Production Workflow

Production deploy is disabled by default.

To enable:

```jsonc
{
  "branchBoard.allowProductionDeploy": true,
  "branchBoard.productionDeployCommand": "npm run deploy:prod -- --branch {{branchName}}",
  "branchBoard.requireConfirmationBeforeProductionDeploy": true
}
```

Production deploy asks for confirmation when configured. This is separate from
the Git finish/merge flow. A team may choose:

- merge to production branch through BranchBoard and deploy elsewhere,
- deploy through BranchBoard after merge,
- keep production deploy disabled and use an external release system.

## Deployment Records

A deployment record stores:

- id,
- task id,
- branch name,
- environment,
- status,
- URL,
- deployed by,
- deployed at,
- command,
- log summary,
- tested flag.

Records are persisted in `BoardData.deployments`.

## Command Execution

Deploy commands are run through `GitService.runCommand()`. They are configured
by the user/admin, not generated from task content.

The command output is summarized and saved to the deployment record.

## Command Center

The Deployments tab shows:

- environment,
- branch,
- linked task,
- status,
- deploy author,
- timestamp,
- URL,
- tested state.

Use it before merge decisions:

- Is the branch deployed to DEV?
- Did deploy fail?
- Was it tested?
- Which task owns this deploy?

## Safety Rules

- Production deploy is off by default.
- Production deploy can require modal confirmation.
- A failed deploy is recorded as failed.
- Deploy does not mark a task done.
- Deploy does not merge branches.
- Deploy does not delete branches.
- DEV URL opening is separate from command execution.

## Troubleshooting

No DEV button:

- configure `branchBoard.devDeployCommand`,
- make sure the task has a branch.

Command failed:

- inspect the operation result/toast,
- check BranchBoard logs,
- run the filled command manually in the workspace.

Open DEV has no URL:

- configure `branchBoard.devDeployUrlTemplate`.

Production deploy blocked:

- set `branchBoard.allowProductionDeploy` to true,
- configure `branchBoard.productionDeployCommand`,
- confirm the modal.
