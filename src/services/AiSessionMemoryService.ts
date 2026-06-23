import { AiSessionMemory, BoardTask, BoardUser, TaskComment } from "../types";

const MAX_SUMMARY_CHARS = 800;
const MAX_FIELD_SUMMARY_CHARS = 500;

/**
 * Keeps a short, persisted per-task memory (plan/run/review summaries, last
 * file list, rolling chat summary) so AiPromptOptimizer can skip re-sending
 * full chat/run history once a summary is available. Pure data manipulation
 * — reads/writes the task object the caller already has loaded from the
 * board; BoardService/BoardPanel are responsible for actually persisting it.
 */
export class AiSessionMemoryService {
  /** Reads the current memory for a task, never returning undefined. */
  getMemory(task: BoardTask): AiSessionMemory {
    return task.aiAgents?.costMemory ?? {};
  }

  /** Ensures task.aiAgents exists and writes back the given memory fields. */
  private write(task: BoardTask, patch: Partial<AiSessionMemory>): AiSessionMemory {
    if (!task.aiAgents) {
      task.aiAgents = {
        enabled: false,
        status: "not_configured",
        selectedAgentIds: [],
      };
    }
    const next: AiSessionMemory = {
      ...(task.aiAgents.costMemory ?? {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    task.aiAgents.costMemory = next;
    return next;
  }

  recordPlanSummary(task: BoardTask, planText: string): AiSessionMemory {
    return this.write(task, { lastPlanSummary: truncate(planText, MAX_FIELD_SUMMARY_CHARS) });
  }

  recordRunSummary(task: BoardTask, resultText: string, changedFiles: string[]): AiSessionMemory {
    return this.write(task, {
      lastRunSummary: truncate(resultText, MAX_FIELD_SUMMARY_CHARS),
      lastFileList: changedFiles.slice(0, 50),
    });
  }

  recordReviewSummary(task: BoardTask, reviewText: string): AiSessionMemory {
    return this.write(task, { lastReviewSummary: truncate(reviewText, MAX_FIELD_SUMMARY_CHARS) });
  }

  /**
   * Refreshes the rolling chat summary from the task's comment thread. Kept
   * deterministic (no model call) so it always works even with the local
   * optimizer disabled: takes the most recent comments, prefixes each with
   * the author's name, and hard-trims to MAX_SUMMARY_CHARS.
   */
  refreshChatSummary(task: BoardTask, comments: TaskComment[], users: BoardUser[]): AiSessionMemory {
    const byId = new Map(users.map((u) => [u.id, u.name] as const));
    const recent = comments.slice(-8);
    const lines = recent.map((c) => `${byId.get(c.authorId) || "User"}: ${truncate(c.text, 160)}`);
    const summary = truncate(lines.join("\n"), MAX_SUMMARY_CHARS);
    return this.write(task, { lastChatSummary: summary });
  }

  /** True once a usable chat summary exists, so callers can skip raw history. */
  hasChatSummary(task: BoardTask): boolean {
    return !!task.aiAgents?.costMemory?.lastChatSummary;
  }
}

function truncate(text: string, max: number): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
