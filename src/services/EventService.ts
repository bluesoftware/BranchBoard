import { BoardData, BoardEvent, BoardEventType } from "../types";
import { MAX_STORED_EVENTS } from "./StorageProvider";

/**
 * Builds and trims the board's audit trail. Pure helpers — they mutate/return
 * the events array but never persist; BoardService owns persistence so a single
 * save covers both the change and its event.
 */
export class EventService {
  /** Create a new event object with a stable id + timestamp. */
  static create(
    type: BoardEventType,
    fields: Partial<Omit<BoardEvent, "id" | "type" | "createdAt">> = {}
  ): BoardEvent {
    return {
      id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      taskId: fields.taskId ?? null,
      branchName: fields.branchName ?? null,
      userId: fields.userId ?? null,
      createdAt: new Date().toISOString(),
      payload: fields.payload ?? {},
    };
  }

  /** Append an event to the board, trimming to the storage cap (newest kept). */
  static append(board: BoardData, event: BoardEvent): void {
    if (!Array.isArray(board.events)) {
      board.events = [];
    }
    board.events.push(event);
    if (board.events.length > MAX_STORED_EVENTS) {
      board.events.splice(0, board.events.length - MAX_STORED_EVENTS);
    }
  }

  /** Newest-first view of the events, optionally filtered by category. */
  static list(
    board: BoardData,
    filter?: "all" | "task" | "git" | "deploy" | "ai" | "user",
    limit = 100
  ): BoardEvent[] {
    const events = Array.isArray(board.events) ? board.events : [];
    const matches = (e: BoardEvent): boolean => {
      if (!filter || filter === "all") {
        return true;
      }
      const cat = EventService.category(e.type);
      return cat === filter;
    };
    return events
      .filter(matches)
      .slice()
      .reverse()
      .slice(0, limit);
  }

  /** Map an event type to a coarse category used by the Activity filter. */
  static category(type: BoardEventType): "task" | "git" | "deploy" | "ai" | "user" {
    switch (type) {
      case "branch_created":
      case "branch_checked_out":
      case "branch_pushed":
      case "merge_started":
      case "merge_finished":
      case "merge_failed":
        return "git";
      case "dev_deploy_started":
      case "dev_deploy_finished":
      case "dev_deploy_failed":
        return "deploy";
      case "ai_prompt_copied":
      case "ai_prompt_generated":
      case "ai_agent_plan_started":
      case "ai_agent_plan_finished":
      case "ai_agent_run_started":
      case "ai_agent_run_finished":
      case "ai_agent_run_failed":
      case "ai_review_started":
      case "ai_review_finished":
      case "ai_task_moved_to_local":
        return "ai";
      case "comment_added":
        return "user";
      default:
        return "task";
    }
  }
}
