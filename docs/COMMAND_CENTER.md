# BranchBoard Command Center

Command Center is the operational layer of BranchBoard. It is built for a
senior developer, tech lead or CTO who needs to understand what is happening in
the repository without interrupting the team for status updates.

It answers:

- what is active,
- what is blocked,
- which branches are not pushed,
- which work is ready for review or merge,
- what reached DEV,
- what is risky,
- what changed,
- what AI-assisted work needs review,
- which local branches should be cleaned up.

Opening Command Center is read-only for Git analytics. It should not fetch, pull,
push, merge or delete anything until the user clicks an explicit action.

## Opening

- Board top navigation: **Command Center / Centrum dowodzenia**.
- Command palette: `BranchBoard: Open Command Center`.
- Activity Bar WebView title actions.

## Tabs

### Overview

The overview is the first triage screen.

It shows:

- active tasks,
- in progress,
- in review,
- in testing,
- ready to merge,
- blocked,
- branches without task,
- tasks without branch,
- done this week,
- automatic "Needs attention" list.

Typical attention items:

- task stuck for several days,
- branch has no commits,
- branch is not pushed,
- task has no assignee,
- branch is not linked to a task,
- review/testing work has no DEV deployment,
- branch diverged heavily from main.

### Team

The team tab shows workload per board user:

- active work,
- review,
- testing,
- done this week,
- branch count,
- last activity,
- blocked count.

This view is explicitly for bottleneck detection, not people scoring. The
product language should keep that framing.

### Branch Flow

Branch Flow is the main operational panel for branch-driven work.

Every row combines task data and Git data:

- branch name,
- linked task,
- assignee,
- column,
- exists local/remote,
- ahead/behind main,
- changed files count,
- last commit,
- stale state,
- risk level,
- pipeline stages.

Pipeline:

```text
Task -> Branch -> Commits -> Push -> DEV -> Review -> Testing -> Merge
```

Actions:

- checkout branch,
- push branch,
- deploy to DEV,
- open/create/link task,
- copy branch or AI prompt,
- open branch drawer,
- bulk delete local branches.

Filters include:

- mine,
- active,
- without task,
- not pushed,
- local only,
- remote only,
- backup,
- stale,
- ready to review,
- ready to merge,
- cleanup,
- dev.

### Cleanup

Cleanup focuses on branches that can clutter the repository:

- stale branches,
- local-only branches,
- remote-only branches,
- backup/archive candidates,
- branches without tasks.

Supported operations are explicit and confirmed:

- archive local branch by creating an archive tag first,
- delete local branch,
- bulk delete local branches,
- copy branch lists for manual review.

Current branch and main branch are protected from bulk deletion.

### Deployments

Deployments shows board deployment records:

- environment,
- branch,
- task,
- status,
- who deployed,
- when deployed,
- URL,
- tested state,
- ready-to-merge context.

Deploy attempts are recorded even when they fail.

See [DEPLOYMENTS.md](DEPLOYMENTS.md).

### Files & Commits

Files & Commits lets the user inspect branch-level technical change:

- commits in the branch range,
- changed files,
- additions/deletions,
- copy summary,
- select a branch for detail,
- open files or diffs through VS Code.

This is useful before review and before deciding whether a branch is safe to
merge.

### Risk Radar

Risk Radar is a rule-based view. It does not call AI and does not use the
network.

Signals include:

- many changed files,
- branch divergence,
- stale branch,
- critical path touched,
- review/testing without DEV,
- missing branch/task linkage,
- no commits,
- dirty workflow signals.

Critical paths come from `branchBoard.criticalPaths`.

### Impact

Impact groups changed files into configured project areas such as checkout,
auth, admin, database or SEO.

It is powered by `branchBoard.impactAreas`.

Use it to answer:

- which business area is touched,
- how many branches touch this area,
- whether several tasks collide in one sensitive area.

### Activity

Activity shows stored board events grouped by time.

Event categories:

- task,
- git,
- deploy,
- AI,
- user/comment.

Events are persisted in `board.events` and capped so the board data does not
grow forever.

### AI Review

AI Review surfaces AI-assisted work:

- AI-assisted tasks,
- tasks without review checklist,
- high-risk AI work,
- AI work ready for review.

This is the place for a lead to check whether AI output was reviewed as part of
normal engineering flow.

## Branch Drawer

Branch Flow and related tabs can open the Branch Drawer. It shows branch detail
without leaving the dashboard:

- task link,
- commits,
- files,
- changed-file diff actions,
- push/checkout/deploy actions,
- AI prompt actions,
- cleanup actions,
- delete/archive branch actions.

All write actions still go through native confirmations where appropriate.

## Data Sources

Command Center combines:

- persisted board data from `BoardService`,
- read-only Git data from `GitService`,
- computed branch analytics from `BranchAnalyticsService`,
- risk scoring from `RiskService`,
- dashboard aggregation from `DashboardService`,
- events from `EventService`,
- deployments stored in `BoardData.deployments`.

## Safety Model

Safe by default:

- opening Command Center does not run Git write operations,
- dashboards should not fetch network data automatically,
- branch deletion requires confirmation,
- force delete requires `allowForceDeleteBranch`,
- production deploy requires `allowProductionDeploy`,
- merge/finish follows [SAFETY.md](SAFETY.md).

## Manual Test Checklist

Command Center:

- [ ] Opens from top navigation and command palette.
- [ ] Overview metrics match board and Git state.
- [ ] Team rows match assigned tasks.
- [ ] Branch Flow filters work.
- [ ] Branch drawer loads commits/files for a selected branch.
- [ ] Cleanup protects current and main branches.
- [ ] Deployments show recorded deploy attempts.
- [ ] Files & Commits can open files and diffs.
- [ ] Risk Radar updates after changing `criticalPaths`.
- [ ] Impact updates after changing `impactAreas`.
- [ ] Activity shows task, git, deploy and AI events.
- [ ] AI Review shows AI-assisted tasks.

Git safety:

- [ ] Opening Command Center performs no push/pull/merge/delete.
- [ ] Checkout/push/delete/archive actions require explicit clicks.
- [ ] Deleting remote branch asks for confirmation.
- [ ] Bulk delete skips current and main branches.
