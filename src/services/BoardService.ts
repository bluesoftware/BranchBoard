import {
  BoardData,
  BoardTask,
  BoardColumn,
  TaskComment,
  ChecklistItem,
  BoardEvent,
  BoardEventType,
  BoardNotificationRecord,
  NotificationType,
  AdminAnnouncementConfig,
} from "../types";
import { StorageProvider, MAX_STORED_ANNOUNCEMENTS, MAX_STORED_NOTIFICATIONS } from "./StorageProvider";
import { EventService } from "./EventService";
import { NotificationService } from "./NotificationService";
import { Logger } from "./Logger";

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
  /** Fired when a persisted notification record addressed to the current user
   *  arrives via an external board change (poll/file-watch on a DIFFERENT
   *  machine than the one that performed the action) — see applyExternal(). */
  private externalRecordListeners: Array<(record: BoardNotificationRecord) => void> = [];
  private disposeExternal: (() => void) | undefined;
  /**
   * Bumped every time a local edit is applied to `this.board` (see `persist()`).
   * `refreshFromStorage()` snapshots this before its (possibly slow, e.g.
   * SSH+sqlite) `storage.load()` call and re-checks it afterwards: if it
   * changed in the meantime, a local edit landed WHILE the read was in
   * flight, so the read's result is stale relative to memory and must be
   * dropped instead of overwriting the edit the user just made. Without this,
   * a poll that started just before a save (so the existing `inFlightSave`
   * guard — checked only at the start — saw nothing to wait for) could
   * resolve after the save finished and clobber it, e.g. silently un-checking
   * a just-selected Cursor persona the moment the next sync tick lands.
   */
  private saveGeneration = 0;

  constructor(private storage: StorageProvider) {}

  async init(): Promise<BoardData> {
    this.board = this.ensureArrays(await this.storage.load());
    this.disposeExternal = this.storage.onExternalChange((incoming) => {
      this.applyExternal(this.ensureArrays(incoming));
    });
    return this.board;
  }

  /** Guarantee the v3/v4 collections exist regardless of the storage backend. */
  private ensureArrays(board: BoardData): BoardData {
    board.events = Array.isArray(board.events) ? board.events : [];
    board.deployments = Array.isArray(board.deployments) ? board.deployments : [];
    board.notifications = Array.isArray(board.notifications) ? board.notifications : [];
    board.announcements = (Array.isArray(board.announcements) ? board.announcements : []).map((a) => ({
      ...a,
      severity: a.severity ?? "info",
      linkUrl: a.linkUrl ?? "",
      linkLabel: a.linkLabel ?? "",
      readBy: Array.isArray(a.readBy) ? a.readBy : [],
      active: a.active ?? true,
    }));
    board.tasks = (Array.isArray(board.tasks) ? board.tasks : []).map((task) => ({
      ...task,
      comments: Array.isArray(task.comments) ? task.comments : [],
      checklist: Array.isArray(task.checklist) ? task.checklist : [],
      aiAgents: task.aiAgents
        ? {
            enabled: !!task.aiAgents.enabled,
            status: task.aiAgents.status ?? "not_configured",
            selectedAgentIds: Array.isArray(task.aiAgents.selectedAgentIds)
              ? task.aiAgents.selectedAgentIds
              : [],
            selectedModel: task.aiAgents.selectedModel ?? "",
            prompt: task.aiAgents.prompt ?? "",
            plan: task.aiAgents.plan ?? "",
            planFile: task.aiAgents.planFile ?? "",
            result: task.aiAgents.result ?? "",
            reviewResult: task.aiAgents.reviewResult ?? "",
            lastRunAt: task.aiAgents.lastRunAt,
            lastFinishedAt: task.aiAgents.lastFinishedAt,
            error: task.aiAgents.error ?? "",
            createdBranch: task.aiAgents.createdBranch ?? "",
            changedFiles: Array.isArray(task.aiAgents.changedFiles) ? task.aiAgents.changedFiles : [],
            runHistory: Array.isArray(task.aiAgents.runHistory) ? task.aiAgents.runHistory : [],
          }
        : undefined,
    }));
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

  /**
   * Put a board into memory WITHOUT persisting it, and wire external-change
   * listening. Used when the server is reachable but has no board yet: the UI
   * can render an onboarding/empty state, and nothing is written until the user
   * explicitly creates a board.
   */
  async initWithBoard(board: BoardData): Promise<BoardData> {
    this.disposeExternal?.();
    this.board = this.ensureArrays(board);
    this.disposeExternal = this.storage.onExternalChange((incoming) => {
      this.applyExternal(this.ensureArrays(incoming));
    });
    this.emitBoard();
    return this.board;
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

  /**
   * Subscribe to persisted notification records that this user only learns
   * about via an external board change (i.e. someone else's machine created
   * the record; this machine picked it up through its poll/file-watcher).
   * Lets the panel mirror it as a native VS Code toast on the recipient's
   * own window, the same way `notify()` does for locally-triggered actions.
   */
  onExternalNotificationRecord(listener: (record: BoardNotificationRecord) => void): () => void {
    this.externalRecordListeners.push(listener);
    return () => {
      this.externalRecordListeners = this.externalRecordListeners.filter((l) => l !== listener);
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

  // Tracks the save currently in flight (if any) so refreshFromStorage()
  // can wait for it instead of reading the remote store mid-write. Without
  // this, a periodic poll (e.g. SSH+sqlite, which can take several seconds
  // round trip) can read storage AFTER an edit was emitted optimistically
  // but BEFORE the write actually landed, see the pre-edit data, and shove
  // it back into the in-memory board — visibly reverting whatever the user
  // just typed (title/description/branch/etc.) the moment that poll's
  // boardData message reaches the webview.
  private inFlightSave: Promise<void> | null = null;

  private async persist() {
    if (!this.board) {
      return;
    }
    // Optimistic UI update: the in-memory board is already mutated by the
    // caller, so push it to listeners (and thus the webview) immediately.
    // For local JSON storage this was already instant; for the remote/server
    // backend (SSH + sqlite3) the save below involves one or two round trips
    // and used to block the UI update until it finished, which felt slow.
    // Now the UI updates right away and the slow write happens in the
    // background — if it fails, recoverFromFailedSave() reloads the
    // authoritative board so the UI never drifts from what's actually saved.
    this.saveGeneration++;
    this.emitBoard();
    const board = this.board;
    const savePromise = (async () => {
      try {
        await this.storage.save(board);
      } catch (err) {
        await this.recoverFromFailedSave();
        throw err;
      }
    })();
    this.inFlightSave = savePromise.finally(() => {
      if (this.inFlightSave === savePromise) {
        this.inFlightSave = null;
      }
    });
    await savePromise;
  }

  /**
   * After a failed save, reload the authoritative board from storage and
   * notify listeners so the UI rolls back to what's really persisted instead
   * of showing an optimistic change that never made it to the database.
   */
  private async recoverFromFailedSave(): Promise<void> {
    try {
      this.board = this.ensureArrays(await this.storage.load());
      this.emitBoard();
    } catch {
      // Reload failed too (e.g. offline) — keep the optimistic in-memory
      // state; the next successful sync will reconcile it.
    }
  }

  /** Apply a board that changed outside this instance, raising notifications. */
  private applyExternal(incoming: BoardData) {
    const previous = this.board;
    this.board = incoming;
    if (previous) {
      this.raiseExternalNotifications(previous, incoming, this.currentUserId);
      this.raiseExternalNotificationRecords(previous, incoming, this.currentUserId);
    }
    this.emitBoard();
  }

  /**
   * Persisted notifications (board.notifications, written by addNotification
   * on whichever machine performed the action) sync like any other board
   * data. When a poll/file-watch on THIS machine picks up new records meant
   * for the current user, surface them through onExternalNotificationRecord
   * so the panel can show a native toast — mirroring what notify() already
   * does for the machine that performed the action itself.
   */
  private raiseExternalNotificationRecords(prev: BoardData, next: BoardData, currentUserId?: string) {
    if (!currentUserId || this.externalRecordListeners.length === 0) {
      return;
    }
    const prevIds = new Set((prev.notifications ?? []).map((n) => n.id));
    const newRecords = (next.notifications ?? []).filter(
      (n) => !prevIds.has(n.id) && n.recipientUserIds.includes(currentUserId)
    );
    for (const record of newRecords) {
      Logger.debug(
        `raiseExternalNotificationRecords(${record.type}): new record for ${currentUserId} arrived via external sync — "${record.message}"`
      );
      for (const l of this.externalRecordListeners) {
        l(record);
      }
    }
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

      // New chat message in a conversation I participate in.
      if (before && task.comments.length > before.comments.length) {
        const newComments = task.comments.slice(before.comments.length);
        const participates =
          task.createdByUserId === currentUserId ||
          task.assignedUserId === currentUserId ||
          before.comments.some((comment) => comment.authorId === currentUserId) ||
          task.comments.some((comment) => comment.authorId === currentUserId);
        const fromSomeoneElse = newComments.some((comment) => comment.authorId !== currentUserId);
        if (participates && fromSomeoneElse) {
          this.emitNotification(`New chat message on "${task.title}"`);
        }
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

  /* ---------------- Notifications ---------------- */

  /**
   * Create and store a persisted notification, then persist the board.
   * Defaults the recipient list to "every other board user" when not given,
   * and never sends a notification to its own actor.
   */
  async addNotification(
    type: NotificationType,
    fields: {
      title: string;
      message: string;
      taskId?: string | null;
      branchName?: string | null;
      actorUserId?: string | null;
      recipientUserIds?: string[];
    }
  ): Promise<BoardNotificationRecord | undefined> {
    const board = this.getBoard();
    const actorUserId = fields.actorUserId ?? this.currentUserId ?? null;
    // Only auto-exclude the actor when we fall back to the "everyone" default
    // (broadcast-style events such as a new task or a comment, where the
    // person who acted doesn't need to be told about their own action).
    // When the caller passes an explicit recipient list (e.g. "this merge
    // you just ran finished", "you were assigned"), trust it as-is — the
    // actor is very often the intended recipient there and must not be
    // silently dropped.
    const recipients = fields.recipientUserIds
      ? Array.from(new Set(fields.recipientUserIds))
      : NotificationService.everyoneExcept(board, actorUserId).filter((id) => id !== actorUserId);
    const record = NotificationService.create(type, {
      title: fields.title,
      message: fields.message,
      taskId: fields.taskId ?? null,
      branchName: fields.branchName ?? null,
      actorUserId,
      recipientUserIds: recipients,
    });
    NotificationService.append(board, record);
    await this.persist();
    return recipients.length > 0 ? record : undefined;
  }

  /** All notifications addressed to a user, newest first. */
  getNotificationsFor(userId: string, onlyUnread = false): BoardNotificationRecord[] {
    return NotificationService.listFor(this.getBoard(), userId, onlyUnread);
  }

  /** Unread notification count for a user (for the bell badge). */
  getUnreadNotificationCount(userId: string): number {
    return NotificationService.unreadCount(this.getBoard(), userId);
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    const board = this.getBoard();
    if (NotificationService.markRead(board, notificationId, userId)) {
      await this.persist();
    }
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const board = this.getBoard();
    if (NotificationService.markAllRead(board, userId) > 0) {
      await this.persist();
    }
  }

  /** Clears the unread-comment indicator for one task once the user has opened its chat. */
  async markTaskCommentsRead(taskId: string, userId: string): Promise<void> {
    const board = this.getBoard();
    if (NotificationService.markTaskCommentsRead(board, taskId, userId) > 0) {
      await this.persist();
    }
  }

  /* ---------------- Admin announcements ---------------- */

  async syncAdminAnnouncement(config: AdminAnnouncementConfig, actorUserId?: string | null): Promise<void> {
    if (!config.enabled || !config.id.trim() || !config.title.trim() || !config.message.trim()) {
      return;
    }
    const board = this.getBoard();
    board.announcements = Array.isArray(board.announcements) ? board.announcements : [];
    const now = this.now();
    const id = config.id.trim();
    const existing = board.announcements.find((a) => a.id === id);
    const next = {
      id,
      title: config.title.trim(),
      message: config.message.trim(),
      severity: config.severity,
      linkUrl: config.linkUrl.trim(),
      linkLabel: config.linkLabel.trim(),
      active: true,
    };

    if (existing) {
      const changed =
        existing.title !== next.title ||
        existing.message !== next.message ||
        existing.severity !== next.severity ||
        existing.linkUrl !== next.linkUrl ||
        existing.linkLabel !== next.linkLabel ||
        existing.active !== true;
      if (!changed) {
        return;
      }
      Object.assign(existing, next, {
        updatedAt: now,
        createdByUserId: actorUserId ?? existing.createdByUserId ?? null,
        readBy: [],
      });
    } else {
      board.announcements.push({
        ...next,
        createdAt: now,
        updatedAt: now,
        createdByUserId: actorUserId ?? null,
        readBy: [],
      });
    }

    const notificationId = `admin_nt_${id}`;
    const recipientUserIds = board.users.map((user) => user.id);
    const existingNotification = (board.notifications ?? []).find((n) => n.id === notificationId);
    const notificationPayload: BoardNotificationRecord = {
      id: notificationId,
      type: "admin_announcement",
      taskId: null,
      branchName: null,
      actorUserId: actorUserId ?? null,
      recipientUserIds,
      readBy: [],
      title: next.title,
      message: next.linkUrl ? `${next.message}\n${next.linkUrl}` : next.message,
      createdAt: existingNotification?.createdAt ?? now,
    };
    if (existingNotification) {
      const changed =
        existingNotification.title !== notificationPayload.title ||
        existingNotification.message !== notificationPayload.message ||
        existingNotification.recipientUserIds.join("|") !== recipientUserIds.join("|");
      if (changed) {
        Object.assign(existingNotification, notificationPayload);
      }
    } else if (recipientUserIds.length > 0) {
      board.notifications.push(notificationPayload);
    }
    if (board.notifications.length > MAX_STORED_NOTIFICATIONS) {
      board.notifications.splice(0, board.notifications.length - MAX_STORED_NOTIFICATIONS);
    }

    board.announcements.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (board.announcements.length > MAX_STORED_ANNOUNCEMENTS) {
      board.announcements.splice(0, board.announcements.length - MAX_STORED_ANNOUNCEMENTS);
    }
    await this.persist();
  }

  async markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
    const board = this.getBoard();
    const announcement = (board.announcements ?? []).find((a) => a.id === announcementId);
    if (!announcement || announcement.readBy.includes(userId)) {
      return;
    }
    announcement.readBy.push(userId);
    announcement.updatedAt = this.now();
    const notification = (board.notifications ?? []).find((n) => n.id === `admin_nt_${announcementId}`);
    if (notification && notification.recipientUserIds.includes(userId) && !notification.readBy.includes(userId)) {
      notification.readBy.push(userId);
    }
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
      createdByUserId: input.createdByUserId ?? this.currentUserId ?? input.assignedUserId ?? null,
      branchName: input.branchName ?? "",
      priority: input.priority ?? "none",
      taskType: input.taskType ?? "feature",
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
      !!destCol && (
        destCol.gitStage === "production" ||
        destCol.id === "done" ||
        /zrobione|done|produkc/i.test(destCol.name)
      );
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

  async addComment(taskId: string, authorId: string | null | undefined, text: string): Promise<void> {
    const board = this.getBoard();
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task) {
      return;
    }
    const resolvedAuthorId = authorId || this.currentUserId || "";
    const comment: TaskComment = {
      id: `c_${Date.now().toString(36)}`,
      authorId: resolvedAuthorId,
      text: text.trim(),
      createdAt: this.now(),
    };
    task.comments.push(comment);
    task.updatedAt = this.now();
    this.record("comment_added", {
      taskId: task.id,
      userId: resolvedAuthorId || null,
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

  getColumn(id: string): BoardColumn | undefined {
    return this.getBoard().columns.find((c) => c.id === id);
  }

  /**
   * Persist column configuration (git stage, base/target branch, prefix, WIP
   * limit, and command hooks). Only known config fields are written; id and
   * position are preserved.
   */
  async saveColumnConfig(id: string, patch: Partial<BoardColumn>): Promise<BoardColumn | undefined> {
    const col = this.getColumn(id);
    if (!col) {
      return undefined;
    }
    const allowed: (keyof BoardColumn)[] = [
      "name", "nameEn", "gitStage", "baseBranch", "targetBranch",
      "branchPrefix", "wipLimit", "onEnter", "onLeave",
    ];
    for (const key of allowed) {
      if (key in patch) {
        (col as any)[key] = (patch as any)[key];
      }
    }
    await this.persist();
    return col;
  }

  /**
   * WIP status for a column. `exceeded` is true when adding one more task
   * would break the limit (limit of 0/undefined means unlimited).
   */
  wipStatus(columnId: string): { limit: number; count: number; wouldExceed: boolean } {
    const board = this.getBoard();
    const limit = board.columns.find((c) => c.id === columnId)?.wipLimit ?? 0;
    const count = board.tasks.filter((t) => t.columnId === columnId).length;
    return { limit, count, wouldExceed: limit > 0 && count >= limit };
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

  /**
   * Add/update the system AI AGENT column for existing boards. It is inserted
   * before the first local/feature work column without renaming existing IDs.
   */
  async ensureAIAgentColumn(enabled: boolean, columnId = "ai-agent"): Promise<void> {
    const board = this.getBoard();

    if (!enabled) {
      const existingDisabled = board.columns.find(
        (c) => c.id === columnId || c.gitStage === "ai-agent" || /ai.?agent/i.test(`${c.id} ${c.name}`)
      );
      if (!existingDisabled) {
        return;
      }
      const fallback =
        [...board.columns]
          .filter((c) => c.id !== existingDisabled.id)
          .sort((a, b) => a.position - b.position)[0] ?? null;
      if (fallback) {
        for (const task of board.tasks) {
          if (task.columnId === existingDisabled.id) {
            task.columnId = fallback.id;
            task.updatedAt = new Date().toISOString();
          }
        }
      }
      board.columns = board.columns.filter((c) => c.id !== existingDisabled.id);
      board.columns.sort((a, b) => a.position - b.position);
      await this.persist();
      return;
    }

    const existing = board.columns.find((c) => c.id === columnId);
    const sorted = [...board.columns].sort((a, b) => a.position - b.position);
    const localColumn =
      sorted.find((c) => /(^|\s)local(\s|$)|w.?trakcie|in.?progress/i.test(`${c.id} ${c.name} ${c.nameEn ?? ""}`)) ??
      sorted.find((c) => c.gitStage === "feature") ??
      sorted.find((c) => /origin|push|review|test|dev|prod|zrobione|done/i.test(`${c.id} ${c.name} ${c.nameEn ?? ""}`));
    const targetPosition = Math.max(1, localColumn ? localColumn.position : Math.min(3, sorted.length + 1));

    let changed = false;
    if (!existing) {
      for (const col of board.columns) {
        if (col.position >= targetPosition && col.position < 99) {
          col.position += 1;
        }
      }
      board.columns.push({
        id: columnId,
        name: "AI AGENT",
        nameEn: "AI Agent",
        position: targetPosition,
        gitStage: "ai-agent",
        branchPrefix: "ai/",
        wipLimit: 3,
      });
      changed = true;
    } else {
      const before = JSON.stringify(existing);
      existing.name = existing.name || "AI AGENT";
      existing.nameEn = existing.nameEn || "AI Agent";
      existing.gitStage = "ai-agent";
      existing.branchPrefix = existing.branchPrefix || "ai/";
      changed = before !== JSON.stringify(existing);
    }

    if (changed) {
      board.columns.sort((a, b) => a.position - b.position);
      await this.persist();
    }
  }

  findAIAgentColumnId(columnId = "ai-agent"): string | null {
    const board = this.getBoard();
    const col = board.columns.find((c) => c.id === columnId || c.gitStage === "ai-agent" || /ai.?agent/i.test(`${c.id} ${c.name}`));
    return col?.id ?? null;
  }

  findLocalColumnId(): string {
    const board = this.getBoard();
    const sorted = [...board.columns].sort((a, b) => a.position - b.position);
    const local =
      sorted.find((c) => /(^|\s)local(\s|$)|w.?trakcie|in.?progress/i.test(`${c.id} ${c.name} ${c.nameEn ?? ""}`)) ??
      sorted.find((c) => c.gitStage === "feature") ??
      sorted.find((c) => /origin|push|review|test|dev|prod|zrobione|done/i.test(`${c.id} ${c.name} ${c.nameEn ?? ""}`));
    return local?.id ?? sorted[0]?.id ?? "todo";
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
   * Update a user's own profile fields (name, email, avatar initials, color,
   * photo). Used by the "My profile" editor in Settings. Only the provided
   * fields are changed; everything else (id, tasks, etc.) is left untouched.
   */
  async updateUser(
    userId: string,
    patch: Partial<Pick<BoardData["users"][number], "name" | "email" | "avatarText" | "color" | "avatarPhoto">>
  ): Promise<BoardData["users"][number] | null> {
    const board = this.getBoard();
    const user = board.users.find((u) => u.id === userId);
    if (!user) {
      return null;
    }
    if (typeof patch.name === "string" && patch.name.trim()) {
      user.name = patch.name.trim();
    }
    if (typeof patch.email === "string") {
      user.email = patch.email.trim();
    }
    if (typeof patch.avatarText === "string" && patch.avatarText.trim()) {
      user.avatarText = patch.avatarText.trim().slice(0, 2).toUpperCase();
    }
    if (typeof patch.color === "string" && patch.color.trim()) {
      user.color = patch.color.trim();
    }
    if ("avatarPhoto" in patch) {
      // Empty string / null clears the photo (falls back to initials).
      user.avatarPhoto = patch.avatarPhoto || undefined;
    }
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

  /** Replace the entire board (used by external reloads / imports). Persists. */
  async replaceBoard(board: BoardData): Promise<void> {
    this.board = this.ensureArrays(board);
    await this.persist();
  }

  /**
   * Reload from storage and apply in memory WITHOUT writing back. Used by the
   * periodic server poll so it never echoes data straight back to the server
   * (which both wastes writes and races with the user's own saves).
   */
  async refreshFromStorage(): Promise<void> {
    // If a save triggered by a local edit is still writing, wait for it
    // before reading — otherwise this poll could fetch the pre-edit data
    // and overwrite the in-memory board (and the open task editor) with a
    // stale snapshot. See the comment on `inFlightSave` above.
    if (this.inFlightSave) {
      try {
        await this.inFlightSave;
      } catch {
        // persist() already routed the failure through recoverFromFailedSave().
      }
    }
    // Snapshot the edit counter right before the (possibly slow, e.g.
    // SSH+sqlite) read starts. If a NEW local edit lands while we're waiting
    // on storage.load() — the `inFlightSave` check above only protects
    // against a save that was already running, not one that starts during
    // this very read — the loaded snapshot predates that edit and must be
    // discarded instead of overwriting it. The edit's own save (already
    // emitted optimistically) remains in memory; the next poll will pick up
    // its persisted result.
    const generationBeforeLoad = this.saveGeneration;
    const fresh = this.ensureArrays(await this.storage.load());
    if (this.saveGeneration !== generationBeforeLoad) {
      Logger.debug(
        "refreshFromStorage(): a local edit landed while the read was in flight — discarding the now-stale snapshot instead of overwriting it."
      );
      return;
    }
    this.applyExternal(fresh);
  }

  /** Find the review/done column to drop a finished task into. */
  findReviewColumnId(): string {
    const board = this.getBoard();
    const review = board.columns.find((c) => /do.?test|do.?zatwierdz/i.test(c.name));
    if (review) {
      return review.id;
    }
    const done = board.columns.find((c) =>
      c.gitStage === "production" || c.id === "done" || /zrobione|done|produkc/i.test(c.name)
    );
    return done?.id ?? board.columns[board.columns.length - 1]?.id ?? "done";
  }

  findDoneColumnId(): string {
    const board = this.getBoard();
    const done = board.columns.find((c) =>
      c.gitStage === "production" || c.id === "done" || /zrobione|done|produkc/i.test(c.name)
    );
    return done?.id ?? board.columns[board.columns.length - 1]?.id ?? "done";
  }

  dispose() {
    this.disposeExternal?.();
    this.boardListeners = [];
    this.notificationListeners = [];
  }
}
