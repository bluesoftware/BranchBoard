import { useEffect, useState } from "react";
import { BoardData, BoardTask, GitInfo } from "../types";

interface Props {
  task: BoardTask;
  board: BoardData;
  git: GitInfo | null;
  currentUserId: string | null;
  onClose: () => void;
  onSave: (patch: Partial<BoardTask>) => void;
  onDelete: () => void;
  onAssign: (userId: string | null) => void;
  onAddComment: (text: string) => void;
  onCreateBranch: (branchName: string) => void;
  onCheckoutBranch: (branchName: string) => void;
  onPushBranch: (branchName: string) => void;
  onFinishTask: () => void;
  onMergeToMain: () => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function TaskModal(props: Props) {
  const { task, board, git } = props;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [branchName, setBranchName] = useState(task.branchName);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setBranchName(task.branchName);
  }, [task.id, task.title, task.description, task.branchName]);

  const suggestedBranch = `feature/${task.id.replace(/[^a-z0-9_]/gi, "").slice(-6)}-${slugify(task.title) || "task"}`;
  const assignee = board.users.find((u) => u.id === task.assignedUserId) ?? null;
  const onTaskBranch = !!git?.currentBranch && git.currentBranch === task.branchName;

  const saveField = (patch: Partial<BoardTask>) => props.onSave(patch);

  return (
    <div className="bb-modal-overlay" onMouseDown={props.onClose}>
      <div className="bb-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bb-modal-head">
          <input
            className="bb-modal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && saveField({ title: title.trim() })}
          />
          <button className="bb-iconbtn" onClick={props.onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="bb-modal-body">
          <div className="bb-field">
            <label>Description</label>
            <textarea
              className="bb-input"
              rows={3}
              value={description}
              placeholder="Add a description…"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== task.description && saveField({ description })}
            />
          </div>

          <div className="bb-field-row">
            <div className="bb-field">
              <label>Assignee</label>
              <select
                className="bb-input"
                value={task.assignedUserId ?? ""}
                onChange={(e) => props.onAssign(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {board.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.id === props.currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="bb-field">
              <label>Status</label>
              <select
                className="bb-input"
                value={task.status}
                onChange={(e) => saveField({ status: e.target.value as BoardTask["status"] })}
              >
                <option value="open">Open</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div className="bb-field">
            <label>Git branch</label>
            <div className="bb-branch-row">
              <input
                className="bb-input"
                value={branchName}
                placeholder={suggestedBranch}
                onChange={(e) => setBranchName(e.target.value)}
                onBlur={() => branchName !== task.branchName && saveField({ branchName })}
              />
              {!branchName && (
                <button
                  className="bb-btn ghost"
                  onClick={() => {
                    setBranchName(suggestedBranch);
                    saveField({ branchName: suggestedBranch });
                  }}
                >
                  Suggest
                </button>
              )}
            </div>
            {git && !git.isRepo && <div className="bb-warn">No git repository detected in this workspace.</div>}
            {onTaskBranch && <div className="bb-ok">You are on this branch.</div>}
          </div>

          <div className="bb-git-actions">
            <button
              className="bb-btn"
              disabled={!branchName || !git?.isRepo}
              onClick={() => props.onCreateBranch(branchName || suggestedBranch)}
            >
              Create branch
            </button>
            <button
              className="bb-btn"
              disabled={!branchName || !git?.isRepo}
              onClick={() => props.onCheckoutBranch(branchName)}
            >
              Checkout
            </button>
            <button
              className="bb-btn"
              disabled={!branchName || !git?.isRepo}
              onClick={() => props.onPushBranch(branchName)}
            >
              Push
            </button>
            <button
              className="bb-btn accent"
              disabled={!branchName || !git?.isRepo}
              onClick={props.onFinishTask}
            >
              Finish task
            </button>
            <button
              className="bb-btn warn"
              disabled={!branchName || !git?.isRepo}
              onClick={props.onMergeToMain}
              title="Merge into main and close branch (asks for confirmation)"
            >
              Merge to main
            </button>
          </div>

          <div className="bb-field">
            <label>Comments ({task.comments.length})</label>
            <div className="bb-comments">
              {task.comments.length === 0 && <div className="bb-muted">No comments yet.</div>}
              {task.comments.map((c) => {
                const author = board.users.find((u) => u.id === c.authorId);
                return (
                  <div key={c.id} className="bb-comment">
                    <span className="bb-avatar small" style={{ background: author?.color ?? "#555" }}>
                      {author?.avatarText ?? "?"}
                    </span>
                    <div className="bb-comment-body">
                      <div className="bb-comment-head">
                        <strong>{author?.name ?? "Unknown"}</strong>
                        <span className="bb-muted">{new Date(c.createdAt).toLocaleString()}</span>
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
                placeholder="Write a comment…"
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    props.onAddComment(comment.trim());
                    setComment("");
                  }
                }}
              />
              <button
                className="bb-btn"
                disabled={!comment.trim()}
                onClick={() => {
                  props.onAddComment(comment.trim());
                  setComment("");
                }}
              >
                Comment
              </button>
            </div>
          </div>
        </div>

        <div className="bb-modal-foot">
          <span className="bb-muted small">
            {assignee ? `Assigned to ${assignee.name}` : "Unassigned"} · #{task.id}
          </span>
          <button className="bb-btn danger" onClick={props.onDelete}>
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
