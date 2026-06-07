# Branch Flow / Przepływ branchy

Branch Flow is the operational panel for **managing branches as tasks**. It is not
just a list — it's where a senior/CTO sees which branches need action and acts on
them safely.

Przepływ branchy to operacyjne centrum zarządzania branchami jako zadaniami.

## Summary bar

Clickable tiles set a filter: Active, Without task, Local only, Remote only,
Backups, Stale, Cleanup, High risk.

## Categories / Kategorie

Each branch card shows a category badge, derived from its real state:

- **Active** — linked to a task and recently worked on.
- **Without task** — exists in Git but not linked to a BranchBoard task.
- **Local only** — exists on your machine, not pushed (others can't see it).
- **Remote only** — on origin but not checked out locally.
- **Backup** — `backup/…` or `archive/…` safety branches.
- **Stale** — no activity for a while (`branchBoard.staleBranchDays`).
- **Ready to merge** — pushed, ahead of main, not critical risk.
- **Cleanup** — likely removable (backups, stale without a task, no commits).
- **High risk** — flagged by the Risk Radar rules.

## Filters & search

Filters: All, Mine, Active, Without task, Not pushed, Local only, Remote only,
Backups, Stale, Ready for review, Ready to merge, Cleanup, On DEV.

## Branch card

Per branch: selection checkbox (bulk), monospace name (click to copy, hover for
full name), category + risk + AI/DEV/current/main badges, linked task (or "no
task"), owner avatar, ahead/behind, changed-files count, last activity, the
pipeline (Task → Branch → Commits → Push → DEV → Review → Testing → Merge), and
quick actions.

Quick actions: **Checkout · Open task / Create task + Link task · Push · DEV ·
More**. "Open task" reuses the existing task drawer (no second task editor).
"More" opens the Branch Details Drawer (commits, changed files, impact areas, and
the destructive actions).

## Linking & creating

- **Create task from branch** — creates a task (title from the branch name,
  branch linked, assigned to you) and opens it for details.
- **Link to task** — pick a task that has no branch; the branch is attached.

## Cleanup & deletion (safe)

Destructive actions live in the Branch Details Drawer and bulk toolbar, always
confirmed in the extension host:

- **Archive** — tag `archive/<branch>-<ts>` then remove the local branch.
- **Delete local** — `git branch -d` (refuses unmerged work unless
  `branchBoard.allowForceDeleteBranch` is on, which then asks for a force
  confirmation).
- **Delete remote** — `git push origin --delete` with a strong warning.
- **Bulk delete local** — select branches, one confirmation, `main` and the
  current branch are always skipped; a report lists any skipped (unmerged).

Safety rules: never delete `main`/default, never delete the current branch, never
force-delete by default, never delete without confirmation.

## Settings

`branchBoard.allowForceDeleteBranch` (default off), `branchBoard.devBranch`,
`branchBoard.finishOnMoveToDone`, `branchBoard.staleBranchDays`,
`branchBoard.criticalPaths`, `branchBoard.impactAreas`.
