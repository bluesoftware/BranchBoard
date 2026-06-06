import { BoardTask, BoardUser } from "../types";

interface Props {
  task: BoardTask;
  users: BoardUser[];
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function TaskCard({ task, users, onOpen, onToggleDone, onDragStart, onDragEnd }: Props) {
  const assignee = users.find((u) => u.id === task.assignedUserId) ?? null;
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const isDone = task.status === "done";

  return (
    <div
      className={`bb-card ${isDone ? "done" : ""}`}
      draggable
      onClick={onOpen}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <button
        className={`bb-check ${isDone ? "checked" : ""}`}
        title={isDone ? "Mark as not done" : "Mark as done"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
      >
        {isDone ? "✓" : ""}
      </button>

      <div className="bb-card-body">
        <div className="bb-card-title">{task.title}</div>
        {task.description && <div className="bb-card-desc">{task.description}</div>}

        <div className="bb-card-meta">
          {task.branchName && (
            <span className="bb-meta-item branch" title={task.branchName}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
              </svg>
            </span>
          )}
          {checklistTotal > 0 && (
            <span className="bb-meta-item">
              ☑ {checklistDone}/{checklistTotal}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="bb-meta-item">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
              </svg>
              {task.comments.length}
            </span>
          )}
        </div>
      </div>

      {assignee && (
        <span className="bb-avatar" style={{ background: assignee.color }} title={assignee.name}>
          {assignee.avatarText}
        </span>
      )}
    </div>
  );
}
