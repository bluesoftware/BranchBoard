import { AppConfig, BoardTask, BoardUser, GitInfo, TaskPriority } from "../types";
import { t } from "../i18n";
import { daysOverdue } from "../utils";
import { richTextToPlainText } from "../richText";
import { BranchIcon, CalendarIcon, CommentIcon, FileIcon, SparkleIcon } from "./Icons";

interface Props {
  task: BoardTask;
  users: BoardUser[];
  appConfig: AppConfig;
  git: GitInfo | null;
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (!priority || priority === "none") {
    return null;
  }
  return (
    <span className={`bb-prio ${priority}`}>
      <span className="bb-prio-dot" />
      {t(`priority.${priority}`)}
    </span>
  );
}

export function TaskCard({
  task,
  users,
  appConfig,
  git,
  onOpen,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: Props) {
  const assignee = users.find((u) => u.id === task.assignedUserId) ?? null;
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const isDone = task.status === "done";
  const { appearance } = appConfig;
  const hasBranch = !!task.branchName;
  const isCurrentBranch = !!git?.currentBranch && git.currentBranch === task.branchName;
  const isAi = !!task.ai?.createdByAi;
  const attachedCount = task.attachedFiles?.length ?? 0;
  const overdue = isDone ? null : daysOverdue(task.dueDate);
  const descriptionPreview = richTextToPlainText(task.description);

  // Compact due chip shown in the card flags: red overdue, amber today/soon,
  // muted date otherwise.
  let due: { label: string; tone: string; title: string } | null = null;
  if (task.dueDate && !isDone && overdue !== null) {
    const [y, m, d] = task.dueDate.split("-");
    const shortDate = d && m ? `${d}.${m}` : task.dueDate;
    if (overdue > 0) {
      due = { label: `${overdue}d`, tone: "overdue", title: t("task.overdueBy", { days: overdue }) };
    } else if (overdue === 0) {
      due = { label: t("card.today"), tone: "soon", title: t("task.dueToday") };
    } else {
      due = {
        label: shortDate,
        tone: overdue >= -2 ? "soon" : "normal",
        title: t("task.dueIn", { days: -overdue }),
      };
    }
  }

  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={`bb-task-card ${isDone ? "done" : ""} prio-${task.priority}`}
      draggable
      role="button"
      tabIndex={0}
      aria-label={t("task.open")}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="bb-task-card-main">
        <button
          className={`bb-check ${isDone ? "checked" : ""}`}
          title={isDone ? t("task.statusOpen") : t("task.statusDone")}
          onClick={(e) => stop(e, onToggleDone)}
        >
          {isDone ? "✓" : ""}
        </button>

        <div className="bb-task-card-copy">
          <div className="bb-task-card-titleline">
            <div className="bb-task-card-title">{task.title}</div>
            {isAi && (
              <span className="bb-flag ai" title={t("card.aiFlag")}>
                <SparkleIcon size={11} />
              </span>
            )}
            {due && (
              <span className={`bb-flag due ${due.tone}`} title={due.title}>
                <CalendarIcon size={11} />
                {due.label}
              </span>
            )}
          </div>
          {descriptionPreview && <div className="bb-task-card-desc">{descriptionPreview}</div>}
        </div>
      </div>

      <div className="bb-task-card-bottom">
        <div className="bb-task-card-meta">
          {appearance.showPriority && <PriorityBadge priority={task.priority} />}
          {attachedCount > 0 && (
            <span className="bb-meta-item" title={t("card.attachedFiles", { count: attachedCount })}>
              <FileIcon size={11} />
              {attachedCount}
            </span>
          )}
          {appearance.showBranchBadges && hasBranch && (
            <span className={`bb-meta-item branch ${isCurrentBranch ? "current" : ""}`} title={task.branchName}>
              <BranchIcon size={11} />
              {task.branchName.replace(/^feature\//, "")}
            </span>
          )}
          {appearance.showChecklist && checklistTotal > 0 && (
            <span className="bb-meta-item">
              ☑ {checklistDone}/{checklistTotal}
            </span>
          )}
          {appearance.showComments && task.comments.length > 0 && (
            <span className="bb-meta-item">
              <CommentIcon size={12} />
              {task.comments.length}
            </span>
          )}
        </div>

        {appearance.showAvatars && assignee && (
          <span className="bb-avatar" style={{ background: assignee.color }} title={assignee.name}>
            {assignee.avatarText}
          </span>
        )}
      </div>
    </div>
  );
}
