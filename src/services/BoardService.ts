import {
  BoardData,
  BoardTask,
  BoardColumn,
  TaskComment,
  ChecklistItem,
} from "../types";
import { StorageProvider } from "./StorageProvider";

export interface BoardNotification {
  message: string;
}

/**
 * Holds the in-memory board and is the single place that mutates and persists
 * it. UI and commands go through here; everything is saved to the active
 * StorageProvider after each change.
 */
export class BoardService {
  private board: BoardData | undefined;
  private boardListeners: Array<(board: BoardData) => void> = [];
  private notificationListeners: Array<(n: BoardNotification) => void> = [];
  private disposeExternal: (() => void) | undefined;

  constructor(private storage: StorageProvider) {}

  async init(): Promise<BoardData> {
    this.board = await this.storage.load();
    this.disposeExternal = this.storage.onExternalChange((incoming) => {
      this.applyExternal(incoming);
    });
    return this.board;
  }

  getBoard(): BoardData {
    if (!this.board) {
      throw new Error("BoardService not initialised. Call init() first.");
    }
    return this.board;
  }

  onBoardChanged(listener: (board: BoardData) => void): () => void {
    this.boardListeners.push(listener);
    return () => {
      this.boardListeners = this.boardListeners.filter((l) => l !== listener);
    };
  }

  onNotification(listener: (n: BoardNotification) => void): () => void {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((l) => l !== listener);
    };
  }

  private emitBoard() {
    if (!this.board) {
      return;
    }
    for (const l of this.boardListeners) {
      l(this.board);
    }
  }

  private emitNotification(message: string) {
    for (const l of this.notificationListeners) {
      l({ message });
    }
  }

  private async persist() {
    if (!this.board) {
      return;
    }
    await this.storage.save(this.board);
    this.emitBoard();
  }

  /** Apply a board that changed outside this instance, raising notifications. */
  private applyExternal(incoming: BoardData) {
    const previous = this.board;
    this.board = incoming;
    if (previous) {
      this.raiseExternalNotifications(previous, incoming, this.currentUserId);
    }
    this.emitBoard();
  }

  /**
   * Compare two board snapshots and notify the current user about changes that
   * concern them (assignment, new comments, moves into review/done columns).
   */
  private raiseExternalNotifications(prev: BoardData, next: BoardData, currentUserId?: string) {
    const prevById = new Map(prev.tasks.map((t) => [t.id, t]));
    const reviewColumnIds = new Set(
      next.columns
        .filter((c) => /do.?test|do.?zatwierdz|zrobione|done/i.test(c.name) || c.id === "done")
        .map((c) => c.id)
    );
    const colName = (id: string) => next.columns.find((c) => c.id === id)?.name ?? id;

    for (const task of next.tasks) {
      const before = prevById.get(task.id);

      // Moved into a review / done column.
      if (before && before.columnId !== task.columnId && reviewColumnIds.has(task.columnId)) {
        this.emitNotification(`"${task.title}" moved to ${colName(task.columnId)}`);
      }

      if (!currentUserId) {
        continue;
      }

      // Newly assigned to me.
      if (
        task.assignedUserId === currentUserId &&
        (!before || before.assignedUserId !== currentUserId)
      ) {
        this.emitNotification(`You were assigned "${task.title}"`);
      }

      // New comment on my task.
      if (before && task.assignedUserId === currentUserId && task.comments.length > before.comments.length) {
        this.emitNotification(`New comment on your task "${task.title}"`);
      }
    }
  }

  /** Public helper so the panel can pass the resolved current user id. */
  setNotificationContext(_currentUserId: string) {
    // Stored implicitly; raiseExternalNotifications reads from the latest call.
    this.currentUserId = _currentUserId;
  }
  private currentUserId: string | undefined;

  /* ---------------- Tasks ---------------- */

  private now() {
    return new Date().toISOString();
  }

  private nextPosition(columnId: string): number {
    const tasks = this.getBoard().tasks.filter((t) => t.columnId === columnId);
    return tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.position)) + 1;
  }

  async createTask(input: Partial<BoardTask> & { title: string; columnId?: string }): Promise<BoardTask> {
    const board = this.getBoard();
    const columnId = input.columnId ?? board.columns[0]?.id ?? "todo";
    const now = this.now();
    const task: BoardTask = {
      id: input.id ?? `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: input.title.trim() || "Untitled",
      description: input.description ?? "",
      columnId,
      position: input.position ?? this.nextPosition(columnId),
      assignedUserId: input.assignedUserId ?? null,
      branchName: input.branchName ?? "",
      comments: input.comments ?? [],
      checklist: input.checklist ?? [],
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      status: input.status ?? "open",
    };
    board.tasks.push(task);
    await this.persist();
    return task;
  }

  async updateTask(id: string, patch: Partial<BoardTask>): Promise<BoardTask | undefined> {
    const board = this.getBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) {
      return undefined;
    }
    Object.assign(task, patch, { id: task.id, updatedAt: this.now() });
    await this.persist();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const board = this.getBoard();
    board.tasks = board.tasks.filter((t) => t.id !== id);
    await this.persist();
  }

  /** Move a task to a column at a target index, recomputing positions. */
  async moveTask(taskId: string, toColumnId: string, toIndex: number): Promise<void> {
    const board = this.getBoard();
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task) {
      return;
    }
    const fromColumnId = task.columnId;
    task.columnId = toColumnId;
    task.updatedAt = this.now();

    const reindex = (columnId: string) => {
      const inCol = board.tasks
        .filter((t) => t.columnId === columnId)
        .sort((a, b) => a.position - b.position);
      inCol.forEach((t, i) => (t.position = i + 1));
      return inCol;
    };

    // Pull task out, then insert at index in destination ordering.
    const dest = board.tasks
      .filter((t) => t.columnId === toColumnId && t.id !== taskId)
      .sort((a, b) => a.position - b.position);
    const clampedIndex = Math.max(0, Math.min(toIndex, dest.length));
    dest.splice(clampedIndex, 0, task);
    dest.forEach((t, i) => (t.position = i + 1));

    if (fromColumnId !== toColumnId) {
      reindex(fromColumnId);
    }

    // Auto status when entering the done column.
    const destCol = board.columns.find((c) => c.id === toColumnId);
    if (destCol && (destCol.id === "done" || /zrobione|done/i.test(destCol.name))) {
      task.status = "done";
      task.finishedAt = task.finishedAt ?? this.now();
    } else if (task.status === "done") {
      task.status = "open";
      task.finishedAt = null;
    }

    await this.persist();
  }

  async addComment(taskId: string, authorId: string, text: string): Promise<void> {
    const board = this.getBoard();
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task) {
      return;
    }
    const comment: TaskComment = {
      id: `c_${Date.now().toString(36)}`,
      authorId,
      text: text.trim(),
      createdAt: this.now(),
    };
    task.comments.push(comment);
    task.updatedAt = this.now();
    await this.persist();
  }

  async setChecklist(taskId: string, checklist: ChecklistItem[]): Promise<void> {
    await this.updateTask(taskId, { checklist });
  }

  /* ---------------- Columns ---------------- */

  async addColumn(name: string): Promise<BoardColumn> {
    const board = this.getBoard();
    const id =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `col-${Date.now().toString(36)}`;
    const uniqueId = board.columns.some((c) => c.id === id) ? `${id}-${Date.now().toString(36)}` : id;
    const position =
      board.columns.length === 0 ? 1 : Math.max(...board.columns.filter((c) => c.position < 99).map((c) => c.position), 0) + 1;
    const column: BoardColumn = { id: uniqueId, name: name.trim().toUpperCase(), position };
    board.columns.push(column);
    board.columns.sort((a, b) => a.position - b.position);
    await this.persist();
    return column;
  }

  async renameColumn(id: string, name: string): Promise<void> {
    const board = this.getBoard();
    const col = board.columns.find((c) => c.id === id);
    if (col) {
      col.name = name.trim();
      await this.persist();
    }
  }

  async deleteColumn(id: string): Promise<{ ok: boolean; reason?: string }> {
    const board = this.getBoard();
    const hasTasks = board.tasks.some((t) => t.columnId === id);
    if (hasTasks) {
      return { ok: false, reason: "Column is not empty." };
    }
    board.columns = board.columns.filter((c) => c.id !== id);
    await this.persist();
    return { ok: true };
  }

  /** Reorder columns given the full ordered list of column ids. */
  async moveColumn(orderedIds: string[]): Promise<void> {
    const board = this.getBoard();
    orderedIds.forEach((id, i) => {
      const col = board.columns.find((c) => c.id === id);
      if (col) {
        col.position = i + 1;
      }
    });
    board.columns.sort((a, b) => a.position - b.position);
    await this.persist();
  }

  /* ---------------- Misc ---------------- */

  /** Replace the entire board (used by external reloads / imports). */
  async replaceBoard(board: BoardData): Promise<void> {
    this.board = board;
    await this.persist();
  }

  /** Find the review/done column to drop a finished task into. */
  findReviewColumnId(): string {
    const board = this.getBoard();
    const review = board.columns.find((c) => /do.?test|do.?zatwierdz/i.test(c.name));
    if (review) {
      return review.id;
    }
    const done = board.columns.find((c) => c.id === "done" || /zrobione|done/i.test(c.name));
    return done?.id ?? board.columns[board.columns.length - 1]?.id ?? "done";
  }

  findDoneColumnId(): string {
    const board = this.getBoard();
    const done = board.columns.find((c) => c.id === "done" || /zrobione|done/i.test(c.name));
    return done?.id ?? board.columns[board.columns.length - 1]?.id ?? "done";
  }

  dispose() {
    this.disposeExternal?.();
    this.boardListeners = [];
    this.notificationListeners = [];
  }
}
