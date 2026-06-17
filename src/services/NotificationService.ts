import { BoardData, BoardNotificationRecord, NotificationType } from "../types";
import { MAX_STORED_NOTIFICATIONS } from "./StorageProvider";

/**
 * Persisted, per-user notification records. Mirrors EventService's shape so
 * the two systems stay easy to reason about side by side: events are an
 * audit trail, notifications are a per-user inbox with read-state.
 */
export class NotificationService {
  static create(
    type: NotificationType,
    fields: Partial<Omit<BoardNotificationRecord, "id" | "type" | "createdAt" | "readBy">> & {
      title: string;
      message: string;
    }
  ): BoardNotificationRecord {
    return {
      id: `nt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      taskId: fields.taskId ?? null,
      branchName: fields.branchName ?? null,
      actorUserId: fields.actorUserId ?? null,
      recipientUserIds: fields.recipientUserIds ?? [],
      readBy: [],
      title: fields.title,
      message: fields.message,
      createdAt: new Date().toISOString(),
    };
  }

  /** Append a notification, trimming the oldest entries past the cap. */
  static append(board: BoardData, record: BoardNotificationRecord): void {
    if (!Array.isArray(board.notifications)) {
      board.notifications = [];
    }
    // Nothing to deliver — skip storing dead records (e.g. solo user boards).
    if (record.recipientUserIds.length === 0) {
      return;
    }
    board.notifications.push(record);
    if (board.notifications.length > MAX_STORED_NOTIFICATIONS) {
      board.notifications.splice(0, board.notifications.length - MAX_STORED_NOTIFICATIONS);
    }
  }

  /** All notifications meant for a given user, newest first. */
  static listFor(board: BoardData, userId: string, onlyUnread = false): BoardNotificationRecord[] {
    const list = Array.isArray(board.notifications) ? board.notifications : [];
    return list
      .filter((n) => n.recipientUserIds.includes(userId))
      .filter((n) => !onlyUnread || !n.readBy.includes(userId))
      .slice()
      .reverse();
  }

  /** Unread count for a given user. */
  static unreadCount(board: BoardData, userId: string): number {
    return NotificationService.listFor(board, userId, true).length;
  }

  /** Mark one notification as read by a user. Returns true if it changed anything. */
  static markRead(board: BoardData, notificationId: string, userId: string): boolean {
    const record = (board.notifications ?? []).find((n) => n.id === notificationId);
    if (!record) {
      return false;
    }
    if (!record.readBy.includes(userId)) {
      record.readBy.push(userId);
      return true;
    }
    return false;
  }

  /** Mark every notification addressed to a user as read. Returns the count changed. */
  static markAllRead(board: BoardData, userId: string): number {
    let changed = 0;
    for (const record of board.notifications ?? []) {
      if (record.recipientUserIds.includes(userId) && !record.readBy.includes(userId)) {
        record.readBy.push(userId);
        changed++;
      }
    }
    return changed;
  }

  /** Every board user except the given actor — the default "notify everyone else" recipient set. */
  static everyoneExcept(board: BoardData, actorUserId: string | null): string[] {
    return board.users.map((u) => u.id).filter((id) => id !== actorUserId);
  }
}
