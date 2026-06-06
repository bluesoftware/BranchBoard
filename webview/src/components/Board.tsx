import { useState } from "react";
import { BoardData, BoardTask, GitInfo } from "../types";
import { Column } from "./Column";

export interface DragState {
  taskId: string;
  fromColumnId: string;
}

interface Props {
  board: BoardData;
  git: GitInfo | null;
  currentUserId: string | null;
  getColumnTasks: (columnId: string) => BoardTask[];
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string, title: string) => void;
  onMoveTask: (taskId: string, toColumnId: string, toIndex: number) => void;
  onRenameColumn: (id: string, name: string) => void;
  onDeleteColumn: (id: string) => void;
  onMoveColumn: (orderedIds: string[]) => void;
  onToggleDone: (task: BoardTask) => void;
}

export function Board(props: Props) {
  const { board } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  const columns = [...board.columns].sort((a, b) => a.position - b.position);

  const handleTaskDrop = (toColumnId: string) => {
    if (drag && dropTarget) {
      props.onMoveTask(drag.taskId, toColumnId, dropTarget.index);
    } else if (drag) {
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
      {columns.map((col) => (
        <Column
          key={col.id}
          column={col}
          tasks={props.getColumnTasks(col.id)}
          users={board.users}
          currentUserId={props.currentUserId}
          dropIndex={dropTarget?.columnId === col.id ? dropTarget.index : null}
          isColumnDragging={draggedColumnId === col.id}
          onOpenTask={props.onOpenTask}
          onAddTask={props.onAddTask}
          onToggleDone={props.onToggleDone}
          onRenameColumn={props.onRenameColumn}
          onDeleteColumn={props.onDeleteColumn}
          // task drag
          onTaskDragStart={(taskId) => setDrag({ taskId, fromColumnId: col.id })}
          onTaskDragEnd={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onTaskDragOver={(index) => {
            if (drag) {
              setDropTarget({ columnId: col.id, index });
            }
          }}
          onTaskDrop={() => handleTaskDrop(col.id)}
          isTaskDragging={!!drag}
          // column drag
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
