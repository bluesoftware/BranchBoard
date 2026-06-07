# Tooltips & help — help-first UI

BranchBoard aims to be **help-first**: difficult Git, risk and deploy concepts are
explained in plain language, in Polish and English, right where they're used.

BranchBoard ma być **help-first**: trudne pojęcia Git, ryzyka i deployu są
wyjaśnione prostym językiem, po polsku i angielsku, w miejscu użycia.

## Components

- `webview/src/components/common/Tooltip.tsx` — accessible tooltip. Shows on
  hover and on keyboard focus, after a short delay (~350 ms), links content via
  `aria-describedby`, and uses VS Code hover-widget colors. Wrap any element:
  `<Tooltip text={t("tooltips.git.push")}><button…/></Tooltip>`.
- `webview/src/components/common/HelpIcon.tsx` — a small "?" / "i" marker that
  reveals a help tooltip. Use next to harder concepts.

## Translations

Tooltips use the **existing** i18n system — no new library, no second i18n. All
strings live under the `tooltips.*` namespace in `webview/src/i18n/pl.json` and
`webview/src/i18n/en.json` and are read with `t("tooltips.…")`. Groups:
`tooltips.nav`, `tooltips.git`, `tooltips.ai`, `tooltips.commandCenter`,
`tooltips.branchMap`, `tooltips.risk`, `tooltips.deploy`,
`tooltips.currentBranch`, `tooltips.settings`.

Tooltips are written for normal users, not only senior developers. For example,
"Push" is *"Sends the current branch to the Git remote so others can fetch or
review it."*, not *"Execute git push for selected ref"*.

## Dangerous actions

A tooltip is not enough for destructive operations (merge to main, delete branch,
production deploy, rollback, reset/revert). These also require a **confirmation
modal** that states what will happen, which branch is affected, whether a backup
branch/tag is created, and whether it's reversible.

## Developer rule

Every new button, icon, status, badge or setting must ship with:
- a visible label **or** `aria-label`,
- a tooltip key,
- a Polish translation,
- an English translation.

Never hardcode UI strings; always go through `t()`.
