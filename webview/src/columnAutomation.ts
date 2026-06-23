import { AppConfig, BoardColumn } from "./types";
import { t } from "./i18n";

/** Plain-language description of a column's built-in Git automation, shared
 * between the column header badge (short branch label) and the column
 * configuration modal (full sentence + disabled-state warning). */
export interface ColumnAutomationInfo {
  /** Resolved branch this column's automation targets, e.g. "origin/main". Null when the
   * column has no single fixed branch (feature/none stages use a per-task branch). */
  branchLabel: string | null;
  /** Full sentence explaining what runs automatically when a task enters this column. */
  description: string;
  /** True when branchBoard.runGitActionsOnMove is off, so `description` won't actually fire. */
  disabled: boolean;
}

/**
 * Only "staging" and "production" columns map to a single, shared branch
 * (e.g. origin/dev, origin/main) — that's what we show as a fixed badge.
 * "feature" and "review" columns work on a *per-task* branch (a different
 * one for every card), so they intentionally have no single branch label;
 * `baseBranch`/`targetBranch` on those stages describe where the branch is
 * cut from / merged into, not "the" branch of the column, and must not leak
 * into the badge — otherwise every stage ends up showing the same
 * "origin/dev" text.
 */
function effectiveBranch(column: BoardColumn, policy: AppConfig["policy"]): string | null {
  if (column.gitStage === "staging") {
    if (column.targetBranch && column.targetBranch.trim()) {
      return column.targetBranch.trim();
    }
    return (policy.useDevBranch ? policy.devBranch : policy.defaultMainBranch) || "dev";
  }
  if (column.gitStage === "production") {
    if (column.targetBranch && column.targetBranch.trim()) {
      return column.targetBranch.trim();
    }
    return policy.defaultMainBranch || policy.productionBranch || "main";
  }
  return null;
}

export function describeColumnAutomation(
  column: BoardColumn,
  policy: AppConfig["policy"]
): ColumnAutomationInfo {
  const stage = column.gitStage ?? "none";
  const remote = policy.remoteName || "origin";
  const branch = effectiveBranch(column, policy);
  const branchLabel = branch ? `${remote}/${branch}` : null;

  let description: string;
  switch (stage) {
    case "feature":
      description = t("columnConfig.automation.feature").replace(
        "{prefix}",
        column.branchPrefix || policy.defaultBranchPrefix || "feature/"
      );
      break;
    case "ai-agent":
      description = t("columnConfig.automation.aiAgent");
      break;
    case "review":
      description = t("columnConfig.automation.review").replace("{remote}", remote);
      break;
    case "staging":
      description = t("columnConfig.automation.staging")
        .replace("{branch}", branchLabel || branch || "dev")
        .replace(/\{remote\}/g, remote);
      break;
    case "production":
      description = policy.allowDirectMergeToMain
        ? t("columnConfig.automation.productionMerge").replace(/\{branch\}/g, branchLabel || branch || "main")
        : t("columnConfig.automation.productionNoMerge").replace(/\{branch\}/g, branchLabel || branch || "main");
      break;
    default:
      description = t("columnConfig.automation.none");
  }

  return { branchLabel, description, disabled: !policy.runGitActionsOnMove };
}
