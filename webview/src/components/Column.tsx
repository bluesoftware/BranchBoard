import { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { BoardColumn, BoardTask, BoardUser } from "../types";
import { TaskCard } from "./TaskCard";

interface Props {
  column: BoardColumn;
  tasks: BoardTask[];
  users: BoardUser[];
  currentUserId: string | null;
  dropIndex: number | null;
  isColumnDragging: boolean;
  isTaskDragging: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string, title: string) => void;
  onToggleDone: (task: BoardTask) => void;
  onRenameColumn: (id: string, name: string) => void;
  onDeleteColumn: (id: string) => void;
  onTaskDragStart: (taskId: string) => void;
  onTaskDragEnd: () => void;
  onTaskDragOver: (index: number) => void;
  onTaskDrop: () => void;
  onColumnDragStart: () => void;
  onColumnDragOverHeader: (e: ReactDragEvent) => void;
  onColumnDropHeader: () => void;
}

export function Column(props: Props) {
  const { column, tasks, users } = props;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setName(column.name), [column.name]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commitAdd = () => {
    const t = title.trim();
    if (t) {
      props.onAddTask(column.id, t);
    }
    setTitle("");
    setAdding(false);
  };

  const commitRename = () => {
    const n = name.trim();
    if (n && n !== column.name) {
      props.onRenameColumn(column.id, n);
    }
    setRenaming(false);
  };

  const placeholder = <div className="bb-drop-placeholder" />;

  return (
    <section
      className={`bb-column ${props.isColumnDragging ? "col-dragging" : ""}`}
      onDragOver={props.onColumnDragOverHeader}
      onDrop={props.onColumnDropHeader}
    >
      <div
        className="bb-column-header"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          props.onColumnDragStart();
        }}
      >
        {renaming ? (
          <input
            className="bb-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(column.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className="bb-column-name" onDoubleClick={() => setRenaming(true)}>
            {column.name}
          </span>
        )}
        <span className="bb-column-count">{tasks.length}</span>
        <div className="bb-column-menu" ref={menuRef}>
          <button className="bb-iconbtn" onClick={() => setMenuOpen((o) => !o)} title="Column menu">
            ⋯
          </button>
          {menuOpen && (
            <div className="bb-menu right">
              <button
                className="bb-menu-item"
                onClick={() => {
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                Rename
              </button>
              <button
                className="bb-menu-item"
                onClick={() => {
                  setAdding(true);
                  setMenuOpen(false);
                }}
              >
                Add task
              </button>
              <div className="bb-menu-sep" />
              <button
                className="bb-menu-item danger"
                onClick={() => {
                  props.onDeleteColumn(column.id);
                  setMenuOpen(false);
                }}
              >
                Delete column
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="bb-column-body"
        onDragOver={(e) => {
          if (props.isTaskDragging) {
            e.preventDefault();
            props.onTaskDragOver(tasks.length);
          }
        }}
        onDrop={(e) => {
          if (props.isTaskDragging) {
            e.preventDefault();
            props.onTaskDrop();
          }
        }}
      >
        {tasks.map((task, i) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              if (props.isTaskDragging) {
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                props.onTaskDragOver(after ? i + 1 : i);
              }
            }}
          >
            {props.dropIndex === i && placeholder}
            <TaskCard
              task={task}
              users={users}
              onOpen={() => props.onOpenTask(task.id)}
              onToggleDone={() => props.onToggleDone(task)}
              onDragStart={() => props.onTaskDragStart(task.id)}
              onDragEnd={props.onTaskDragEnd}
            />
          </div>
        ))}
        {props.dropIndex === tasks.length && placeholder}

        {adding ? (
          <div className="bb-addtask">
            <textarea
              className="bb-input bb-addtask-input"
              autoFocus
              value={title}
              placeholder="Task name"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitAdd();
                }
                if (e.key === "Escape") {
                  setTitle("");
                  setAdding(false);
                }
              }}
            />
            <div className="bb-addtask-actions">
              <button className="bb-btn accent" onMouseDown={(e) => e.preventDefault()} onClick={commitAdd}>
                Add task
              </button>
              <button className="bb-btn ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="bb-addtask-btn" onClick={() => setAdding(true)}>
            <span className="bb-plus">+</span> Dodaj zadanie
          </button>
        )}
      </div>
    </section>
  );
}
