import { AiContextLevel, AiDecisionAction } from "../types";

/** Everything AiContextSelector needs to know to pick files/context size. */
export interface ContextSelectionInput {
  action: AiDecisionAction;
  /** Files changed on the task's branch vs main (path only, newest-relevant first). */
  branchChangedFiles: string[];
  /** Files with uncommitted local changes right now (path only). */
  workingTreeChangedFiles: string[];
  /** Files the user explicitly attached to the task. */
  attachedFiles: string[];
  /** User's default context level (branchBoard.aiCli.defaultContextLevel). */
  defaultContextLevel: AiContextLevel;
  /** Hard cap on number of files in context (branchBoard.aiCli.maxFilesInContext). */
  maxFilesInContext: number;
  /** Ask for confirmation before "full" context (branchBoard.aiCli.requireConfirmForFullContext). */
  requireConfirmForFullContext: boolean;
  /** User already confirmed a previous "full context" prompt for this request. */
  alreadyConfirmed: boolean;
}

export interface ContextSelectionResult {
  contextLevel: AiContextLevel;
  selectedFiles: string[];
  includeDiff: boolean;
  includeFullFiles: boolean;
  requiresUserConfirmation: boolean;
}

/**
 * Picks which files (and how much of them) should be sent to Cursor CLI.
 * Pure, synchronous, rule-based — no I/O, no model calls. AiCostOptimizer
 * supplies the file lists (already fetched via GitService) and this module
 * only reasons about counts/levels, never reads file content itself.
 */
export class AiContextSelector {
  select(input: ContextSelectionInput): ContextSelectionResult {
    const dedup = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    // Priority: files the task explicitly references > files with local,
    // uncommitted work > files already committed on the branch vs main.
    const ordered = dedup([
      ...input.attachedFiles,
      ...input.workingTreeChangedFiles,
      ...input.branchChangedFiles,
    ]);

    const totalCandidateFiles = ordered.length;

    // A review step always prefers a diff over dumping full files — far
    // cheaper, and usually all a reviewer needs.
    const isReview = input.action === "cursor_review";

    let level: AiContextLevel;
    if (totalCandidateFiles <= 3) {
      level = "small";
    } else if (totalCandidateFiles <= 8) {
      level = "normal";
    } else {
      level = "full";
    }

    // Never escalate past the user's configured default unless the change
    // itself is small enough to safely shrink below it.
    if (levelRank(level) > levelRank(input.defaultContextLevel) && input.defaultContextLevel !== "full") {
      level = input.defaultContextLevel;
    }

    const requiresUserConfirmation =
      level === "full" && input.requireConfirmForFullContext && !input.alreadyConfirmed;

    const cap = Math.max(1, input.maxFilesInContext || 12);
    const selectedFiles = ordered.slice(0, cap);

    const includeDiff = isReview || level !== "full";
    const includeFullFiles = !isReview && level === "full" && !requiresUserConfirmation;

    return {
      contextLevel: level,
      selectedFiles,
      includeDiff,
      includeFullFiles,
      requiresUserConfirmation,
    };
  }
}

function levelRank(level: AiContextLevel): number {
  return level === "small" ? 0 : level === "normal" ? 1 : 2;
}
