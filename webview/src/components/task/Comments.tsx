import { useEffect, useRef, useState } from "react";
import { BoardUser, TaskComment } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";

interface Props {
  comments: TaskComment[];
  users: BoardUser[];
  currentUserId: string | null;
  onAdd: (text: string) => void;
}

/**
 * Comments rendered as a compact chat thread: your own messages float to the
 * right in an accent bubble, everyone else's sit to the left. Keeps a fixed,
 * scrollable height so it stays usable near the top of a crowded drawer, and
 * auto-scrolls to the latest message when the thread grows.
 */
export function Comments({ comments, users, currentUserId, onAdd }: Props) {
  const [comment, setComment] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  const submit = () => {
    const text = comment.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setComment("");
  };

  return (
    <div className="bb-section bb-chat-section">
      <div className="bb-section-title">
        {t("task.comments")} ({comments.length})
      </div>
      <div className="bb-comments bb-chat-scroll" ref={listRef}>
        {comments.length === 0 && <div className="bb-muted small">{t("task.noComments")}</div>}
        {comments.map((c) => {
          const author = users.find((u) => u.id === c.authorId);
          const isOwn = !!currentUserId && c.authorId === currentUserId;
          return (
            <div key={c.id} className={`bb-comment${isOwn ? " own" : ""}`}>
              <span className="bb-avatar small" style={{ background: author?.color ?? "#555" }}>
                {author?.avatarText ?? "?"}
              </span>
              <div className="bb-comment-body">
                <div className="bb-comment-head">
                  <strong>{isOwn ? t("topBar.you") : author?.name ?? "Unknown"}</strong>
                  <span className="bb-muted small">{formatDate(c.createdAt)}</span>
                </div>
                <div className="bb-comment-bubble">{c.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="bb-comment-add">
        <input
          className="bb-input"
          value={comment}
          placeholder={t("task.commentPlaceholder")}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && comment.trim()) {
              submit();
            }
          }}
        />
        <button className="bb-btn" disabled={!comment.trim()} onClick={submit}>
          {t("task.comment")}
        </button>
      </div>
    </div>
  );
}
