import { AppConfig, BoardTask, BoardUser, GitInfo, TaskPriority } from "../types";
import { t } from "../i18n";
import { daysOverdue } from "../utils";
import { Tooltip } from "./common/Tooltip";
import { BranchIcon, CalendarIcon, CheckoutIcon, CommentIcon, FileIcon, FinishIcon, PushIcon, SparkleIcon } from "./Icons";

interface Props {
  task: BoardTask;
  users: BoardUser[];
  appConfig: AppConfig;
  git: GitInfo | null;
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCheckout: (branchName: string) => void;
  onPush: (branchName: string) => void;
  onFinish: (taskId: string) => void;
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
  onCheckout,
  onPush,
  onFinish,
}: Props) {
  const assignee = users.find((u) => u.id === task.assignedUserId) ?? null;
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const isDone = task.status === "done";
  const { appearance } = appConfig;
  const hasBranch = !!task.branchName;
  const gitEnabled = !!git?.isRepo;
  const isAi = !!task.ai?.createdByAi;
  const attachedCount = task.attachedFiles?.length ?? 0;
  const overdue = isDone ? null : daysOverdue(task.dueDate);

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
      className={`bb-card ${isDone ? "done" : ""} prio-${task.priority}`}
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
        title={isDone ? t("task.statusOpen") : t("task.statusDone")}
        onClick={(e) => stop(e, onToggleDone)}
      >
        {isDone ? "✓" : ""}
      </button>

      <div className="bb-card-body">
        <div className="bb-card-titlerow">
          <div className="bb-card-title">{task.title}</div>
          <div className="bb-card-flags">
            {isAi && (
              <span className="bb-flag ai" title={t("card.aiFlag")}>
                <SparkleIcon size={11} />
              </span>
            )}
            {hasBranch && (
              <span className="bb-flag branch" title={task.branchName}>
                <BranchIcon size={11} />
              </span>
            )}
            {due && (
              <span className={`bb-flag due ${due.tone}`} title={due.title}>
                <CalendarIcon size={11} />
                {due.label}
              </span>
            )}
          </div>
        </div>
        {task.description && <div className="bb-card-desc">{task.description}</div>}

        <div className="bb-card-meta">
          {appearance.showPriority && <PriorityBadge priority={task.priority} />}
          {attachedCount > 0 && (
            <span className="bb-meta-item" title={t("card.attachedFiles", { count: attachedCount })}>
              <FileIcon size={11} />
              {attachedCount}
            </span>
          )}
          {appearance.showBranchBadges && hasBranch && (
            <span className="bb-meta-item branch" title={task.branchName}>
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
      </div>

      {appearance.showAvatars && assignee && (
        <span className="bb-avatar" style={{ background: assignee.color }} title={assignee.name}>
          {assignee.avatarText}
        </span>
      )}

      {gitEnabled && hasBranch && (
        <div className="bb-card-actions">
          <Tooltip text={t("tooltips.git.checkout")}>
            <button
              className="bb-iconbtn"
              aria-label={t("task.checkoutBranch")}
              onClick={(e) => stop(e, () => onCheckout(task.branchName))}
            >
              <CheckoutIcon size={12} />
            </button>
          </Tooltip>
          <Tooltip text={t("tooltips.git.push")}>
            <button
              className="bb-iconbtn"
              aria-label={t("task.pushBranch")}
              onClick={(e) => stop(e, () => onPush(task.branchName))}
            >
              <PushIcon size={12} />
            </button>
          </Tooltip>
          <Tooltip text={t("task.finishHint")}>
            <button
              className="bb-iconbtn"
              aria-label={t("task.finish")}
              onClick={(e) => stop(e, () => onFinish(task.id))}
            >
              <FinishIcon size={12} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
