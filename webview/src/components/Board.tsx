import { useState } from "react";
import { AppConfig, BoardData, BoardTask, GitInfo } from "../types";
import { Column } from "./Column";

export interface DragState {
  taskId: string;
  fromColumnId: string;
}

interface Props {
  board: BoardData;
  appConfig: AppConfig;
  git: GitInfo | null;
  currentUserId: string | null;
  getColumnTasks: (columnId: string) => BoardTask[];
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string, title: string) => void;
  onMoveTask: (taskId: string, toColumnId: string, toIndex: number) => void;
  onRenameColumn: (id: string, name: string) => void;
  onDeleteColumn: (id: string) => void;
  onConfigureColumn: (id: string) => void;
  onMoveColumn: (orderedIds: string[]) => void;
  onToggleDone: (task: BoardTask) => void;
  canMoveTask?: (taskId: string, toColumnId: string) => boolean;
  onBlockedTaskMove?: (taskId: string, toColumnId: string) => void;
}

export function Board(props: Props) {
  const { board } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  const columns = [...board.columns].sort((a, b) => a.position - b.position);

  // Task ids with at least one unread "comment_added" notification for the
  // current user — drives the green highlight on the card's chat badge.
  const unreadCommentTaskIds = props.currentUserId
    ? new Set(
        (board.notifications ?? [])
          .filter(
            (n) =>
              n.type === "comment_added" &&
              n.taskId &&
              n.recipientUserIds.includes(props.currentUserId as string) &&
              !n.readBy.includes(props.currentUserId as string)
          )
          .map((n) => n.taskId as string)
      )
    : new Set<string>();

  const handleTaskDrop = (toColumnId: string) => {
    if (drag && dropTarget) {
      if (props.canMoveTask && !props.canMoveTask(drag.taskId, toColumnId)) {
        props.onBlockedTaskMove?.(drag.taskId, toColumnId);
        setDrag(null);
        setDropTarget(null);
        return;
      }
      props.onMoveTask(drag.taskId, toColumnId, dropTarget.index);
    } else if (drag) {
      if (props.canMoveTask && !props.canMoveTask(drag.taskId, toColumnId)) {
        props.onBlockedTaskMove?.(drag.taskId, toColumnId);
        setDrag(null);
        setDropTarget(null);
        return;
      }
      props.onMoveTask(drag.taskId, toColumnId, props.getColumnTasks(toColumnId).length);
    }
    setDrag(null);
    setDropTarget(null);
  };

  const handleColumnDrop = (targetColumnId: string) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      return;
    }
    const ids = columns.map((c) => c.id);
    const from = ids.indexOf(draggedColumnId);
    const to = ids.indexOf(targetColumnId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    props.onMoveColumn(ids);
    setDraggedColumnId(null);
  };

  return (
    <div className="bb-board">
      {columns.map((col, index) => (
        <Column
          key={col.id}
          column={col}
          tasks={props.getColumnTasks(col.id)}
          users={board.users}
          appConfig={props.appConfig}
          git={props.git}
          currentUserId={props.currentUserId}
          unreadCommentTaskIds={unreadCommentTaskIds}
          // New tasks may only be created directly into the first two
          // columns (e.g. BACKLOG / DO ZROBIENIA) — later columns are meant
          // to be reached by moving a task forward, not by adding into them.
          canAddTask={index < 2}
          dropIndex={dropTarget?.columnId === col.id ? dropTarget.index : null}
          isColumnDragging={draggedColumnId === col.id}
          onOpenTask={props.onOpenTask}
          onAddTask={props.onAddTask}
          onToggleDone={props.onToggleDone}
          onRenameColumn={props.onRenameColumn}
          onDeleteColumn={props.onDeleteColumn}
          onConfigureColumn={props.onConfigureColumn}
          onTaskDragStart={(taskId) => setDrag({ taskId, fromColumnId: col.id })}
          onTaskDragEnd={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onTaskDragOver={(index) => {
            if (drag && (!props.canMoveTask || props.canMoveTask(drag.taskId, col.id))) {
              setDropTarget({ columnId: col.id, index });
            }
          }}
          onTaskDrop={() => handleTaskDrop(col.id)}
          isTaskDragging={!!drag}
          canDropTask={!drag || !props.canMoveTask || props.canMoveTask(drag.taskId, col.id)}
          onColumnDragStart={() => setDraggedColumnId(col.id)}
          onColumnDragOverHeader={(e) => {
            if (draggedColumnId) {
              e.preventDefault();
            }
          }}
          onColumnDropHeader={() => handleColumnDrop(col.id)}
        />
      ))}
    </div>
  );
}
