import {
  BoardData,
  BoardTask,
  BoardColumn,
  TaskComment,
  ChecklistItem,
  BoardEvent,
  BoardEventType,
} from "../types";
import { StorageProvider } from "./StorageProvider";
import { EventService } from "./EventService";

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
    this.board = this.ensureArrays(await this.storage.load());
    this.disposeExternal = this.storage.onExternalChange((incoming) => {
      this.applyExternal(this.ensureArrays(incoming));
    });
    return this.board;
  }

  /** Guarantee the v3 collections exist regardless of the storage backend. */
  private ensureArrays(board: BoardData): BoardData {
    board.events = Array.isArray(board.events) ? board.events : [];
    board.deployments = Array.isArray(board.deployments) ? board.deployments : [];
    return board;
  }

  /**
   * Swap the underlying storage provider and reload — used when reconnecting to
   * the server after a failed start, or when falling back to local JSON. Keeps
   * the same BoardService instance so existing panels/listeners stay wired.
   */
  async useStorage(storage: StorageProvider): Promise<BoardData> {
    this.disposeExternal?.();
    this.disposeExternal = undefined;
    this.storage = storage;
    await this.init();
    this.emitBoard();
    return this.getBoard();
  }

  getBoard(): BoardData {
    if (!this.board) {
      throw new Error("BoardService not initialised. Call init() first.");
    }
    return this.board;
  }

  /** The kind of the storage currently backing the board (may be a fallback). */
  getStorageKind(): "workspace-json" | "server" {
    return this.storage.kind;
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

  /* ---------------- Events ---------------- */

  /** Record an event on the board (in-memory). Caller persists afterwards. */
  private record(
    type: BoardEventType,
    fields: Partial<Omit<BoardEvent, "id" | "type" | "createdAt">> = {}
  ): void {
    if (!this.board) {
      return;
    }
    const userId = fields.userId ?? this.currentUserId ?? null;
    EventService.append(this.board, EventService.create(type, { ...fields, userId }));
  }

  /**
   * Public entry point for the panel to log events that originate from git
   * operations (branch created/pushed, merge, ai prompt copied, etc.). Persists
   * so the audit trail survives reloads.
   */
  async logEvent(
    type: BoardEventType,
    fields: Partial<Omit<BoardEvent, "id" | "type" | "createdAt">> = {}
  ): Promise<void> {
    this.record(type, fields);
    await this.persist();
  }

  /* ---------------- Deployments ---------------- */

  /** Insert or replace a deployment record (matched by id), then persist. */
  async upsertDeployment(dep: import("../types").Deployment): Promise<void> {
    const board = this.getBoard();
    const idx = board.deployments.findIndex((d) => d.id === dep.id);
    if (idx >= 0) {
      board.deployments[idx] = dep;
    } else {
      board.deployments.push(dep);
    }
    await this.persist();
  }

  /** Mark the latest deployment for a branch+environment as tested. */
  async markDeploymentTested(branchName: string, environment: string): Promise<boolean> {
    const board = this.getBoard();
    const matches = board.deployments
      .filter((d) => d.branchName === branchName && d.environment === environment)
      .sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""));
    const latest = matches[0];
    if (!latest) {
      return false;
    }
    latest.tested = true;
    await this.persist();
    return true;
  }

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
      priority: input.priority ?? "none",
      comments: input.comments ?? [],
      checklist: input.checklist ?? [],
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      status: input.status ?? "open",
    };
    board.tasks.push(task);
    this.record("task_created", {
      taskId: task.id,
      branchName: task.branchName || null,
      payload: { title: task.title, columnId: task.columnId },
    });
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
    const removed = board.tasks.find((t) => t.id === id);
    board.tasks = board.tasks.filter((t) => t.id !== id);
    if (removed) {
      this.record("task_deleted", { taskId: id, payload: { title: removed.title } });
    }
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
    const fromCol = board.columns.find((c) => c.id === fromColumnId);
    const enteringDone =
      !!destCol && (destCol.id === "done" || /zrobione|done/i.test(destCol.name));
    if (enteringDone) {
      task.status = "done";
      task.finishedAt = task.finishedAt ?? this.now();
    } else if (task.status === "done") {
      task.status = "open";
      task.finishedAt = null;
    }

    if (fromColumnId !== toColumnId) {
      this.record("task_moved", {
        taskId: task.id,
        branchName: task.branchName || null,
        payload: {
          fromColumn: fromCol?.name ?? fromColumnId,
          toColumn: destCol?.name ?? toColumnId,
          title: task.title,
        },
      });
      if (enteringDone) {
        this.record("task_finished", { taskId: task.id, payload: { title: task.title } });
      }
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
    this.record("comment_added", {
      taskId: task.id,
      userId: authorId || null,
      payload: { title: task.title },
    });
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

  /**
   * Merge Git commit authors into the board's user list. Existing users are
   * matched by email (preferred) or name and left untouched (email is
   * backfilled if it was empty). Returns the number of newly added users.
   */
  async importUsersFromGit(contributors: Array<{ name: string; email: string }>): Promise<number> {
    const board = this.getBoard();
    const palette = [
      "#38bdf8", "#f472b6", "#34d399", "#fbbf24",
      "#a78bfa", "#fb7185", "#60a5fa", "#f59e0b",
      "#4ade80", "#e879f9", "#22d3ee", "#facc15",
    ];
    const initials = (s: string): string => {
      const cleaned = s.replace(/<.*?>/g, "").trim();
      const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return (cleaned.slice(0, 2) || "??").toUpperCase();
    };

    let added = 0;
    for (const c of contributors) {
      const email = (c.email || "").toLowerCase();
      const existing = board.users.find(
        (u) =>
          (u.email && email && u.email.toLowerCase() === email) ||
          (u.name && c.name && u.name.toLowerCase() === c.name.toLowerCase())
      );
      if (existing) {
        if (!existing.email && c.email) {
          existing.email = c.email; // backfill so auto-detection works
        }
        continue;
      }

      const base =
        ((c.email.split("@")[0] || c.name || "user")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")) || "user";
      let id = base;
      let n = 1;
      while (board.users.some((u) => u.id === id)) {
        id = `${base}-${n++}`;
      }

      board.users.push({
        id,
        name: c.name || c.email || id,
        email: c.email,
        avatarText: initials(c.name || c.email || id),
        color: palette[board.users.length % palette.length],
      });
      added++;
    }

    if (added > 0) {
      await this.persist();
    }
    return added;
  }

  /** Add a user manually (from the settings UI). Returns the created user. */
  async addUserManually(name: string, email: string): Promise<BoardData["users"][number]> {
    const board = this.getBoard();
    const palette = [
      "#38bdf8", "#f472b6", "#34d399", "#fbbf24",
      "#a78bfa", "#fb7185", "#60a5fa", "#f59e0b",
    ];
    const clean = (name || email || "user").trim();
    const base =
      clean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "user";
    let id = base;
    let n = 1;
    while (board.users.some((u) => u.id === id)) {
      id = `${base}-${n++}`;
    }
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    const avatarText =
      (parts.length >= 2 ? parts[0][0] + parts[1][0] : clean.slice(0, 2) || "??").toUpperCase();
    const user = {
      id,
      name: clean,
      email: (email || "").trim(),
      avatarText,
      color: palette[board.users.length % palette.length],
    };
    board.users.push(user);
    await this.persist();
    return user;
  }

  /**
   * Remove a user from the board. Any tasks assigned to them are unassigned so
   * no task ends up pointing at a non-existent user.
   */
  async removeUser(userId: string): Promise<void> {
    const board = this.getBoard();
    const before = board.users.length;
    board.users = board.users.filter((u) => u.id !== userId);
    if (board.users.length === before) {
      return; // nothing removed
    }
    for (const task of board.tasks) {
      if (task.assignedUserId === userId) {
        task.assignedUserId = null;
        task.updatedAt = this.now();
      }
    }
    await this.persist();
  }

  /** Replace the entire board (used by external reloads / imports). */
  async replaceBoard(board: BoardData): Promise<void> {
    this.board = this.ensureArrays(board);
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
