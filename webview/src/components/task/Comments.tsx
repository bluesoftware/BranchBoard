import { useState } from "react";
import { BoardUser, TaskComment } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";

interface Props {
  comments: TaskComment[];
  users: BoardUser[];
  onAdd: (text: string) => void;
}

/** Reusable comments thread (list + add). Used in TaskDrawer and Current Branch. */
export function Comments({ comments, users, onAdd }: Props) {
  const [comment, setComment] = useState("");
  const submit = () => {
    const text = comment.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setComment("");
  };

  return (
    <div className="bb-section">
      <div className="bb-section-title">
        {t("task.comments")} ({comments.length})
      </div>
      <div className="bb-comments">
        {comments.length === 0 && <div className="bb-muted small">{t("task.noComments")}</div>}
        {comments.map((c) => {
          const author = users.find((u) => u.id === c.authorId);
          return (
            <div key={c.id} className="bb-comment">
              <span className="bb-avatar small" style={{ background: author?.color ?? "#555" }}>
                {author?.avatarText ?? "?"}
              </span>
              <div className="bb-comment-body">
                <div className="bb-comment-head">
                  <strong>{author?.name ?? "Unknown"}</strong>
                  <span className="bb-muted small">{formatDate(c.createdAt)}</span>
                </div>
                <div>{c.text}</div>
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
