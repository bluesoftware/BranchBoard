import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BoardTask, BoardUser, TaskComment } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";
import { FileMentionInput, type FileMentionInputHandle } from "./FileMentionInput";
import { renderTextWithFileMentions } from "../../fileMentionDisplay";

interface Props {
  comments: TaskComment[];
  users: BoardUser[];
  task?: Pick<BoardTask, "assignedUserId" | "createdByUserId">;
  currentUserId: string | null;
  onAdd: (text: string) => void;
  fileSuggestions?: string[];
  onSearchFiles?: (query: string) => void;
  onOpenFile?: (path: string) => void;
}

function Avatar({ user, fallback = "?" }: { user?: BoardUser; fallback?: string }) {
  return (
    <span
      className={`bb-chat-avatar ${user?.avatarPhoto ? "has-photo" : ""}`}
      style={
        user?.avatarPhoto
          ? { backgroundImage: `url(${user.avatarPhoto})` }
          : { background: user?.color ?? "linear-gradient(135deg, #3f4654, #22252d)" }
      }
      title={user?.name ?? fallback}
      aria-hidden="true"
    >
      {!user?.avatarPhoto && (user?.avatarText ?? fallback)}
    </span>
  );
}

export function Comments({
  comments,
  users,
  task,
  currentUserId,
  onAdd,
  fileSuggestions = [],
  onSearchFiles = () => {},
  onOpenFile,
}: Props) {
  const [message, setMessage] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<FileMentionInputHandle>(null);

  const currentUser = users.find((u) => u.id === currentUserId);
  const participants = useMemo(() => {
    const ids = new Set<string>();
    const add = (userId?: string | null) => {
      if (userId && users.some((u) => u.id === userId)) {
        ids.add(userId);
      }
    };
    add(task?.createdByUserId);
    add(task?.assignedUserId);
    comments.forEach((comment) => add(comment.authorId));
    if (currentUserId) {
      add(currentUserId);
    }
    return Array.from(ids)
      .map((id) => users.find((u) => u.id === id))
      .filter((user): user is BoardUser => !!user);
  }, [comments, currentUserId, task?.assignedUserId, task?.createdByUserId, users]);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [comments.length]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setMessage("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="bb-section bb-chat-section">
      <div className="bb-chat-top">
        <div>
          <div className="bb-section-title bb-chat-title">
            {t("task.comments")} <span>{comments.length}</span>
          </div>
          <div className="bb-chat-subtitle">
            {participants.length > 0
              ? t("task.chatParticipants", { count: participants.length })
              : t("task.noComments")}
          </div>
        </div>
        {participants.length > 0 && (
          <div className="bb-chat-participants" aria-label={t("task.chatParticipants", { count: participants.length })}>
            {participants.slice(0, 4).map((participant) => (
              <Avatar key={participant.id} user={participant} />
            ))}
            {participants.length > 4 && <span className="bb-chat-avatar more">+{participants.length - 4}</span>}
          </div>
        )}
      </div>
      <div className="bb-comments bb-chat-scroll" ref={listRef}>
        {comments.length === 0 && (
          <div className="bb-chat-empty">
            <span>{t("task.noComments")}</span>
            <small>{t("task.chatEmptyHint")}</small>
          </div>
        )}
        {comments.map((c) => {
          const author = users.find((u) => u.id === c.authorId);
          const isOwn = !!currentUserId && c.authorId === currentUserId;
          return (
            <div key={c.id} className={`bb-comment bb-chat-message${isOwn ? " own" : ""}`}>
              {!isOwn && <Avatar user={author} />}
              <div className="bb-chat-message-stack">
                <div className="bb-comment-head bb-chat-meta">
                  <strong>{isOwn ? t("topBar.you") : author?.name ?? "Unknown"}</strong>
                  <span className="bb-muted small">{formatDate(c.createdAt)}</span>
                </div>
                <div className="bb-comment-bubble">{renderTextWithFileMentions(c.text, onOpenFile)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="bb-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Avatar user={currentUser ?? undefined} fallback={t("topBar.you").slice(0, 1)} />
        <FileMentionInput
          ref={inputRef}
          multiline
          autoGrow
          className="bb-chat-input"
          value={message}
          placeholder={t("task.commentPlaceholder")}
          fileSuggestions={fileSuggestions}
          onSearchFiles={onSearchFiles}
          onChange={setMessage}
          onEnter={submit}
        />
        <button className="bb-chat-send" disabled={!message.trim()} type="button" onClick={() => submit()}>
          {t("task.comment")}
        </button>
      </form>
    </div>
  );
}
