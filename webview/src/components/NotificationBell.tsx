import { useEffect, useRef, useState } from "react";
import { BoardNotificationRecord } from "../types";
import { post } from "../vscode";
import { t } from "../i18n";
import { BellIcon } from "./Icons";

interface Props {
  notifications: BoardNotificationRecord[];
  currentUserId: string | null;
  onOpenTask?: (taskId: string) => void;
}

/** Relative "x min/h/d ago" formatting, reusing the same short units as the
 * Command Center activity feed. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) {
    return t("cc.time.now");
  }
  if (mins < 60) {
    return `${mins} ${t("cc.time.m")}`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours} ${t("cc.time.h")}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${t("cc.time.d")}`;
}

export function NotificationBell({ notifications, currentUserId, onOpenTask }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const mine = currentUserId
    ? notifications.filter((n) => n.recipientUserIds.includes(currentUserId))
    : [];
  const sorted = [...mine].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unread = sorted.filter((n) => !currentUserId || !n.readBy.includes(currentUserId));
  const unreadCount = unread.length;

  const markRead = (n: BoardNotificationRecord) => {
    if (currentUserId && !n.readBy.includes(currentUserId)) {
      post("markNotificationRead", { notificationId: n.id });
    }
    if (n.taskId && onOpenTask) {
      onOpenTask(n.taskId);
      setOpen(false);
    }
  };

  const markAll = () => {
    post("markAllNotificationsRead");
  };

  return (
    <div className="bb-userswitcher" ref={ref}>
      <button
        className="bb-btn ghost icon bb-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("notifications.title")}
        title={t("notifications.title")}
      >
        <BellIcon size={14} />
        {unreadCount > 0 && (
          <span className="bb-bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="bb-menu bb-notif-menu">
          <div className="bb-notif-head">
            <span className="bb-menu-label" style={{ padding: 0 }}>
              {t("notifications.title")}
            </span>
            {unreadCount > 0 && (
              <button className="bb-link-btn" onClick={markAll}>
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
          {sorted.length === 0 ? (
            <div className="bb-notif-empty">{t("notifications.empty")}</div>
          ) : (
            sorted.slice(0, 30).map((n) => {
              const isUnread = !currentUserId || !n.readBy.includes(currentUserId);
              return (
                <button
                  key={n.id}
                  className={`bb-notif-item ${isUnread ? "unread" : ""}`}
                  onClick={() => markRead(n)}
                >
                  <span className="bb-notif-dot" />
                  <span className="bb-notif-body">
                    <span className="bb-notif-title">{n.title}</span>
                    <span className="bb-notif-message">{n.message}</span>
                    <span className="bb-notif-time">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
