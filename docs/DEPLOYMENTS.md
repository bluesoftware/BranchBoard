# Deployments (DEV / staging / production)

BranchBoard ships a lightweight deployment layer. It does not run a real deploy
itself — it runs **your** configured command and records the outcome, so the
Command Center can show what is on each environment.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `branchBoard.devDeployCommand` | `""` | Command run by **Deploy to DEV**. |
| `branchBoard.devDeployUrlTemplate` | `""` | URL for **Open DEV**. |
| `branchBoard.productionBranch` | `main` | Branch treated as production. |
| `branchBoard.productionDeployCommand` | `""` | Command for a production deploy. |
| `branchBoard.allowProductionDeploy` | `false` | Must be `true` to allow prod deploys. |
| `branchBoard.requireConfirmationBeforeProductionDeploy` | `true` | Always confirm prod. |

Both command and URL support placeholders:

- `{{branchName}}` — the task's branch name, e.g. `feature/task-ab12-login`
- `{{branchSlug}}` — a slugified, URL-safe form, e.g. `feature-task-ab12-login`

Examples:

```
devDeployCommand:     npm run deploy:dev -- --branch {{branchName}}
devDeployUrlTemplate: https://dev.example.com/{{branchSlug}}
```

## Workflow

1. Open a task with a branch → **Deploy to DEV**. BranchBoard fills the
   placeholders and runs the command (no shell metacharacters are honoured).
2. The result is stored as a `Deployment` record on the board and as a
   `dev_deploy_started` / `dev_deploy_finished` / `dev_deploy_failed` event.
3. **Open DEV** opens the resolved URL in your browser.
4. A tester clicks **Mark as tested** once the DEV build is verified.
5. The **Deployments** tab in the Command Center shows branch, task, status, who,
   when, tested, and merge-readiness across environments.

## Production safety

Production deploys are off until you explicitly set `allowProductionDeploy: true`,
and even then BranchBoard asks for confirmation (unless you turn that off). `main`
is **not** automatically treated as production — set `productionBranch` to match
your project.
