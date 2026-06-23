import { AiContextLevel, AiSessionMemory } from "../types";

export interface PromptBuildInput {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria?: string;
  branchName: string;
  userMessage: string;
  selectedFiles: string[];
  includeDiff: boolean;
  includeFullFiles: boolean;
  contextLevel: AiContextLevel;
  /** Use the persisted summary instead of full chat history when both are available. */
  sessionMemory?: AiSessionMemory;
  includeChatHistory: boolean;
  includeChatSummary: boolean;
  /** Raw recent comments, only used when includeChatHistory is true (kept short — caller already filters). */
  recentChatTurns: string[];
  maxPromptChars: number;
}

/**
 * Builds a short, concrete prompt for Cursor CLI. Pure string assembly — no
 * I/O, no model calls. Prefers a persisted session summary over re-sending
 * full chat history, removes duplicate lines, and hard-trims to
 * maxPromptChars so a runaway context can never blow past the configured
 * budget.
 */
export class AiPromptOptimizer {
  build(input: PromptBuildInput): string {
    const lines: string[] = [];

    lines.push(`Task: ${input.taskTitle}`.trim());
    if (input.branchName) {
      lines.push(`Branch: ${input.branchName}`);
    }
    if (input.taskDescription) {
      lines.push("", "Description:", input.taskDescription.trim());
    }
    if (input.acceptanceCriteria) {
      lines.push("", "Acceptance criteria:", input.acceptanceCriteria.trim());
    }

    if (input.sessionMemory?.lastChatSummary && input.includeChatSummary) {
      lines.push("", "Summary of earlier conversation:", input.sessionMemory.lastChatSummary.trim());
    } else if (input.includeChatHistory && input.recentChatTurns.length > 0) {
      lines.push("", "Recent conversation:");
      for (const turn of input.recentChatTurns) {
        lines.push(`- ${turn.trim()}`);
      }
    }

    if (input.sessionMemory?.lastPlanSummary) {
      lines.push("", "Previous plan summary:", input.sessionMemory.lastPlanSummary.trim());
    }
    if (input.sessionMemory?.lastRunSummary) {
      lines.push("", "Previous run summary:", input.sessionMemory.lastRunSummary.trim());
    }
    if (input.sessionMemory?.lastReviewSummary) {
      lines.push("", "Previous review summary:", input.sessionMemory.lastReviewSummary.trim());
    }

    if (input.selectedFiles.length > 0) {
      lines.push(
        "",
        input.includeDiff
          ? `Relevant files (review the diff for these, not the whole file unless needed):`
          : input.includeFullFiles
            ? `Relevant files (full contents may be needed):`
            : `Relevant files:`
      );
      for (const f of input.selectedFiles) {
        lines.push(`- ${f}`);
      }
    }

    lines.push("", "Request:", input.userMessage.trim());

    const deduped = dedupeConsecutive(lines);
    const joined = deduped.join("\n").trim();

    const max = Math.max(500, input.maxPromptChars || 60000);
    if (joined.length <= max) {
      return joined;
    }
    return `${joined.slice(0, max - 20).trimEnd()}\n…(trimmed to fit aiCli.maxPromptChars)`;
  }
}

function dedupeConsecutive(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && out[out.length - 1] === "") continue;
    if (line !== "" && line === out[out.length - 1]) continue;
    out.push(line);
  }
  return out;
}
