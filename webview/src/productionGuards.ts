import { AppConfig, BoardColumn, BoardData, BoardTask } from "./types";

export type TaskMoveGuardReason =
  | "productionServerRollback"
  | "productionChecklistIncomplete";

export function isProductionColumn(column: BoardColumn | null | undefined): boolean {
  if (!column) {
    return false;
  }
  const key = `${column.id} ${column.name} ${column.nameEn ?? ""}`.toLowerCase();
  return column.gitStage === "production" || /produkc|production/.test(key);
}

export function isProductionSqliteServer(appConfig: AppConfig): boolean {
  return (
    appConfig.storageMode === "server" &&
    appConfig.activeStorageKind === "server" &&
    !appConfig.ssh.sshHost.trim()
  );
}

export function hasIncompleteSubtasks(task: BoardTask): boolean {
  return (task.checklist ?? []).some((item) => !item.done);
}

export function getTaskColumn(board: BoardData, columnId: string): BoardColumn | null {
  return board.columns.find((column) => column.id === columnId) ?? null;
}

export function isTaskInProduction(board: BoardData, task: BoardTask): boolean {
  return isProductionColumn(getTaskColumn(board, task.columnId));
}

export function guardTaskMove(
  board: BoardData,
  appConfig: AppConfig,
  task: BoardTask,
  toColumnId: string
): { ok: true } | { ok: false; reason: TaskMoveGuardReason } {
  if (task.columnId === toColumnId) {
    return { ok: true };
  }

  const fromProduction = isTaskInProduction(board, task);
  const toProduction = isProductionColumn(getTaskColumn(board, toColumnId));

  if (fromProduction && !toProduction && isProductionSqliteServer(appConfig)) {
    return { ok: false, reason: "productionServerRollback" };
  }

  if (!fromProduction && toProduction && hasIncompleteSubtasks(task)) {
    return { ok: false, reason: "productionChecklistIncomplete" };
  }

  return { ok: true };
}
