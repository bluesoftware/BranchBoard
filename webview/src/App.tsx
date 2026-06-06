import { useCallback, useEffect, useMemo, useState } from "react";
import { BoardData, BoardTask, GitInfo, UserFilter } from "./types";
import { post } from "./vscode";
import { TopBar } from "./components/TopBar";
import { Board } from "./components/Board";
import { TaskModal } from "./components/TaskModal";

export function App() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>("all");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Receive messages from the extension host.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") {
        return;
      }
      switch (msg.type) {
        case "boardData":
          setBoard(msg.payload as BoardData);
          break;
        case "gitInfo":
          setGit(msg.payload.git as GitInfo);
          setCurrentUserId(msg.payload.currentUserId ?? null);
          break;
        case "error":
          console.error("BranchBoard error:", msg.payload?.message);
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    post("ready");
    return () => window.removeEventListener("message", handler);
  }, []);

  const activeTask: BoardTask | null = useMemo(() => {
    if (!board || !activeTaskId) {
      return null;
    }
    return board.tasks.find((t) => t.id === activeTaskId) ?? null;
  }, [board, activeTaskId]);

  const visibleTasks = useCallback(
    (columnId: string): BoardTask[] => {
      if (!board) {
        return [];
      }
      let tasks = board.tasks.filter((t) => t.columnId === columnId);
      if (filter === "me" && currentUserId) {
        tasks = tasks.filter((t) => t.assignedUserId === currentUserId);
      } else if (filter !== "all" && filter !== "me") {
        tasks = tasks.filter((t) => t.assignedUserId === filter);
      }
      return tasks.sort((a, b) => a.position - b.position);
    },
    [board, filter, currentUserId]
  );

  if (!board) {
    return (
      <div className="bb-loading">
        <div className="bb-spinner" />
        <span>Loading BranchBoard…</span>
      </div>
    );
  }

  return (
    <div className="bb-app">
      <TopBar
        board={board}
        git={git}
        currentUserId={currentUserId}
        filter={filter}
        onFilterChange={setFilter}
        onAddColumn={(name) => post("addColumn", { name })}
        onRefresh={() => post("refresh")}
        onConfigure={() => post("openConfig")}
      />

      <Board
        board={board}
        git={git}
        currentUserId={currentUserId}
        getColumnTasks={visibleTasks}
        onOpenTask={setActiveTaskId}
        onAddTask={(columnId, title) => post("createTask", { title, columnId, assignedUserId: currentUserId })}
        onMoveTask={(taskId, toColumnId, toIndex) =>
          post("moveTask", { taskId, toColumnId, toIndex })
        }
        onRenameColumn={(id, name) => post("renameColumn", { id, name })}
        onDeleteColumn={(id) => post("deleteColumn", { id })}
        onMoveColumn={(orderedIds) => post("moveColumn", { orderedIds })}
        onToggleDone={(task) =>
          post("updateTask", {
            id: task.id,
            patch: { status: task.status === "done" ? "open" : "done" },
          })
        }
      />

      {activeTask && (
        <TaskModal
          task={activeTask}
          board={board}
          git={git}
          currentUserId={currentUserId}
          onClose={() => setActiveTaskId(null)}
          onSave={(patch) => post("updateTask", { id: activeTask.id, patch })}
          onDelete={() => {
            post("deleteTask", { id: activeTask.id, title: activeTask.title });
            setActiveTaskId(null);
          }}
          onAssign={(userId) => post("assignUser", { taskId: activeTask.id, userId })}
          onAddComment={(text) =>
            post("addComment", { taskId: activeTask.id, authorId: currentUserId, text })
          }
          onCreateBranch={(branchName) =>
            post("createBranch", { taskId: activeTask.id, branchName })
          }
          onCheckoutBranch={(branchName) => post("checkoutBranch", { branchName })}
          onPushBranch={(branchName) => post("pushBranch", { branchName })}
          onFinishTask={() => post("finishTask", { taskId: activeTask.id })}
          onMergeToMain={() => post("mergeToMain", { taskId: activeTask.id })}
        />
      )}
    </div>
  );
}
