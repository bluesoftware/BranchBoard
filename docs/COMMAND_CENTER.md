# BranchBoard Command Center

The Command Center is the second product layer of BranchBoard: a lightweight
"engineering command center" for a senior / CTO / tech lead managing a small
team (up to ~10 developers). It answers not only *"what is left to do"* but
*"what is happening with the code"* — branches, commits, review, testing, risks
and team activity — without turning into a heavy Jira.

Centrum dowodzenia to drugi poziom produktu BranchBoard: lekkie centrum
dowodzenia kodem dla seniora / CTO / lidera technicznego małego zespołu. Pokazuje
nie tylko "co jest do zrobienia", ale też "co dzieje się z kodem".

## How to open / Jak otworzyć

- Click **Command Center / Centrum dowodzenia** in the board top bar, or
- Run the command **BranchBoard: Open Command Center** (`branchBoard.openCommandCenter`), or
- Use the icon in the BranchBoard sidebar view title.

An **Open dashboard** button is present in the header as the entry point for a
future "open in browser" mode (architecture is prepared; not yet implemented).

## Implemented now (Stage 1) / Zaimplementowane (Etap 1)

- **Overview / Przegląd** — KPI tiles (active, in progress, in review, in testing,
  ready to merge, blocked, branches without task, tasks without branch, done this
  week) plus an automatic **"Needs attention"** list (stuck tasks, branches with
  no commits, not pushed, large divergence from main, no assignee, branch not
  linked to a task, review/testing without a DEV deploy).
- **Team / Zespół** — per-developer workload (active, review, testing, done this
  week, branch count, last activity, blockers) with simple progress bars. Framed
  to detect bottlenecks, not to judge people.
- **Branch Flow / Przepływ branchy** — the signature view. Each branch is a card
  with a visual pipeline **Task → Branch → Commits → Push → DEV → Review →
  Testing → Merge**, commit ahead/behind counts, changed-files count, last commit
  time, pushed / DEV / stale / risk badges, and filters (all, mine, stale, ready
  to merge, not pushed, no task, on DEV).
- **Activity / Aktywność** — a timeline grouped by Today / Yesterday / This week /
  Earlier, filterable by category (task, git, deploy, ai, comments). Events are
  recorded into `board.json` (`events[]`).

All git analytics are **read-only and network-free** (local refs and
remote-tracking refs only) so opening the dashboard never triggers a fetch.

## Implemented now (Stage 2) / Zaimplementowane (Etap 2)

- **Risk Radar / Ryzyka** — rule-based score (0–100) per task with reasons and
  suggested actions, sorted by risk, badged Low/Medium/High/Critical. Critical
  directories are configurable via `branchBoard.criticalPaths`. No AI, no network.
- **Files & Commits / Pliki i commity** — pick a branch and see its commits
  (`main..branch`) and changed files (`diff --name-status` + `--numstat`) with
  add/del counts. Actions: copy file list, copy commit summary, open a file in the
  editor.
- **AI Review / Przegląd AI** — each task can be marked **AI-assisted** (model +
  review checklist) in its drawer; the dashboard lists AI tasks, AI without a
  checklist, AI with high risk, and AI ready for review.
- **Task drawer upgrades** — the edit modal now shows a **work log** (last 5 work
  entries: branch commits + task events) and an **overdue counter** at the **top**,
  plus a due-date field. Branch Flow cards open their linked kanban task directly
  in this modal, where you can add comments.

## Implemented now (Stage 3) / Zaimplementowane (Etap 3)

- **Deployments / Wdrożenia** — a DEV/staging/production model. The task drawer
  gets **Deploy to DEV**, **Open DEV**, **Mark as tested** and (only when enabled)
  **Deploy to PRODUCTION**. Commands come from settings with `{{branchName}}` /
  `{{branchSlug}}` placeholders; every attempt is recorded as a `Deployment` and
  an event. The Deployments tab shows what's on each environment: branch, task,
  status, who, when, tested, ready-to-merge. See [DEPLOYMENTS.md](DEPLOYMENTS.md).
- **Production safety** — production deploy is **disabled by default**
  (`allowProductionDeploy`) and always asks for confirmation. `productionBranch`
  is configurable; main is not assumed to be production.
- **Safety & rollback / Bezpieczeństwo** — before merging to main the finish flow
  can create a **backup branch** (`createBackupBranchBeforeMerge`, default on) and
  a **safety tag** (`createSafetyTagBeforeMerge`). The drawer's Safety section adds
  Create backup branch, Create safety tag, Copy rollback commands, Revert last
  commit (safe, confirmed) and a Git guide link. Destructive commands are only
  **generated and copied**, never run automatically. See
  [ROLLBACK_SAFETY.md](ROLLBACK_SAFETY.md).

## Coming later / W kolejnych etapach

- **Stage 4:** documentation polish, "open in browser" dashboard, i18n completion.

The data model already carries `events[]` and `deployments[]` (schema v3, with
automatic migration of older boards), and the services are split per concern
(`EventService`, `BranchAnalyticsService`, `DashboardService`, with
`RiskService` / `DeploymentService` / `SafetyService` planned) so later stages
drop in without reshaping the app.

## Manual test checklist / Checklista testów

Command Center:

- [ ] Opens from the top bar button and from `branchBoard.openCommandCenter`.
- [ ] Overview tiles show sensible counts; "Needs attention" lists real issues.
- [ ] Team cards render with workload bars and last activity.
- [ ] Branch Flow lists branches with the pipeline and filters work.
- [ ] Activity timeline groups events and category filters work.
- [ ] Deployments / Files / Risk / AI tabs show a clear "coming soon" state.
- [ ] Switching board language to English re-labels every Command Center string.

Git:

- [ ] Current branch is marked (●) in Branch Flow.
- [ ] Changed-files count and ahead/behind reflect the real repository.
- [ ] Branches without a task appear under "branches without task".
- [ ] Tasks without a branch appear under "tasks without branch".

Safety:

- [ ] Opening the dashboard performs no network calls (no push/pull/fetch).
- [ ] No git write operations are triggered by viewing analytics.
