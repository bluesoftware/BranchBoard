# Branch Map / Mapa branchy

Branch Map is a visual map of the **real flow of work** in your repository. It is
not a Git Graph clone: it connects Git branches with BranchBoard tasks, owners,
commits, changed files, DEV deploys, AI assistance and risk signals.

Mapa branchy pokazuje realny przepływ pracy: branche, zadania, osoby, commity,
zmienione pliki, deploy na DEV, pracę AI oraz ryzyka.

## How it differs from Git Graph

A normal Git Graph shows commits and merges. Branch Map answers product
questions a lead actually asks: which branches are active, which are linked to
tasks (and which are not), which are stale, ready to merge, risky, AI-assisted,
or deployed to DEV — in one place, in plain language.

## Opening

Top navigation → **Branch Map / Mapa branchy** (or from the Command Center).
The map reuses the same analytics as the Command Center (`dashboard.branchFlow`),
so it is read-only and network-free.

## Modes / Tryby

- **Graph / Graf** — a real commit DAG rendered as SVG: lanes per branch, edges
  for parent links, branch tips labelled, the current branch highlighted. Built
  from `git log --all` (read-only). Click a branch label to open its details;
  click a commit hash to copy it.
- **Active branches / Aktywne branche** — every active branch as a lane.
- **Timeline / Oś czasu** — lanes ordered by last commit.
- **Task graph / Graf zadań** — only branches linked to a task.
- **Risk graph / Graf ryzyka** — lanes ordered and coloured by risk.
- *Impact view* — prepared for a later stage (`branchBoard.impactAreas`).

## Reading the map

The top line is `main`. Each branch is a lane below it showing: the branch name
(click to copy), owner avatar, linked task (or "no task"), commit dots (ahead of
main), the pipeline **Task → Branch → Commits → Push → DEV → Review → Testing →
Merge**, ahead/behind counts, changed-files count, last-commit time and badges
for AI / DEV / stale / risk. The left edge colour encodes risk.

Clicking a lane opens its linked task. Branches without a task are flagged so you
can create or link one.

## Colours / Kolory

Risk is shown as a subtle left-edge colour and a badge, themed to VS Code:
- **Low** — neutral, **Medium** — amber, **High / Critical** — red.

## Summary strip

Tiles above the map (active, without task, ready to merge, high risk,
AI-assisted, changed files) are clickable and filter the map.

## Safety

Branch Map is read-only. Allowed actions: checkout, copy branch name, open task.
Merge to main, delete, reset, force-push and production deploy are **not**
available here and still go through the safe confirmation flows.
