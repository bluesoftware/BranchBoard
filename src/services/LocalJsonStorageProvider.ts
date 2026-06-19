import * as vscode from "vscode";
import * as path from "path";
import { BoardData } from "../types";
import { StorageProvider, createDefaultBoard, BOARD_SCHEMA_VERSION } from "./StorageProvider";

/**
 * Stores the board in a JSON file inside the workspace
 * (default: .branchboard/board.json).
 *
 * Uses a VS Code FileSystemWatcher to detect external edits, and guards
 * against save/reload feedback loops by ignoring change events that happen
 * shortly after our own writes.
 */
export class LocalJsonStorageProvider implements StorageProvider {
  public readonly kind = "workspace-json" as const;

  private readonly fileUri: vscode.Uri;
  private watcher: vscode.FileSystemWatcher | undefined;
  private listeners: Array<(board: BoardData) => void> = [];
  private lastWriteAt = 0;
  private lastSerialized = "";

  constructor(
    private readonly workspaceRoot: vscode.Uri,
    relativeFile: string,
    private readonly projectName: string,
    private readonly boardTitle: string,
    private readonly seedUsers: BoardData["users"]
  ) {
    const normalized = relativeFile && relativeFile.trim().length > 0 ? relativeFile : ".branchboard/board.json";
    this.fileUri = vscode.Uri.joinPath(workspaceRoot, ...normalized.split(/[\\/]/));
    this.setupWatcher(normalized);
  }

  private setupWatcher(relativeFile: string) {
    try {
      const pattern = new vscode.RelativePattern(this.workspaceRoot, relativeFile);
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = async () => {
        // Ignore events caused by our own save (within 1.5s).
        if (Date.now() - this.lastWriteAt < 1500) {
          return;
        }
        try {
          const board = await this.readFile();
          const serialized = JSON.stringify(board);
          if (serialized === this.lastSerialized) {
            return; // no real change
          }
          this.lastSerialized = serialized;
          for (const l of this.listeners) {
            l(board);
          }
        } catch {
          // file mid-write or invalid; ignore
        }
      };
      this.watcher.onDidChange(onChange);
      this.watcher.onDidCreate(onChange);
    } catch (err) {
      console.error("BranchBoard: failed to create file watcher", err);
    }
  }

  /** URI of the safety backup written before each save. */
  private get backupUri(): vscode.Uri {
    return this.fileUri.with({ path: this.fileUri.path.replace(/\.json$/i, ".backup.json") });
  }

  async load(): Promise<BoardData> {
    // 1. No file yet -> create a fresh default board.
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(this.fileUri);
    } catch {
      const board = createDefaultBoard(this.projectName, this.boardTitle, this.seedUsers);
      await this.save(board);
      return board;
    }

    // 2. File exists -> parse safely. On corruption, try the backup instead of
    //    destroying the user's data by overwriting with a default board.
    try {
      const board = this.parse(bytes);
      this.lastSerialized = JSON.stringify(board);
      return board;
    } catch (primaryErr) {
      try {
        const backupBytes = await vscode.workspace.fs.readFile(this.backupUri);
        const board = this.parse(backupBytes);
        this.lastSerialized = JSON.stringify(board);
        return board;
      } catch {
        throw new Error(
          `Board file is corrupted and no valid backup was found (${this.fileUri.fsPath}). ` +
            `Fix or remove the file, then reload. Original error: ${(primaryErr as Error)?.message}`
        );
      }
    }
  }

  private parse(bytes: Uint8Array): BoardData {
    const text = Buffer.from(bytes).toString("utf8");
    const parsed = JSON.parse(text) as BoardData;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.columns)) {
      throw new Error("Board file does not contain a valid board object.");
    }
    return this.normalize(parsed);
  }

  private async readFile(): Promise<BoardData> {
    const bytes = await vscode.workspace.fs.readFile(this.fileUri);
    return this.parse(bytes);
  }

  /**
   * Make sure required arrays/fields exist and migrate older schema versions so
   * the rest of the app is always safe. New fields (e.g. priority) get sensible
   * defaults for boards created before they existed.
   */
  private normalize(board: BoardData): BoardData {
    board.columns = board.columns ?? [];
    board.users = board.users ?? [];
    // v3: events + deployments. Older boards simply start with empty arrays.
    board.events = Array.isArray(board.events) ? board.events : [];
    board.deployments = (Array.isArray(board.deployments) ? board.deployments : []).map((d) => ({
      ...d,
      tested: d.tested ?? false,
    }));
    // v4: persisted per-user notifications. Older boards start with no history.
    board.notifications = (Array.isArray(board.notifications) ? board.notifications : []).map((n) => ({
      ...n,
      recipientUserIds: Array.isArray(n.recipientUserIds) ? n.recipientUserIds : [],
      readBy: Array.isArray(n.readBy) ? n.readBy : [],
    }));
    board.announcements = (Array.isArray(board.announcements) ? board.announcements : []).map((a) => ({
      ...a,
      severity: a.severity ?? "info",
      linkUrl: a.linkUrl ?? "",
      linkLabel: a.linkLabel ?? "",
      readBy: Array.isArray(a.readBy) ? a.readBy : [],
      active: a.active ?? true,
    }));
    const createdByTaskId = new Map(
      board.events
        .filter((e) => e.type === "task_created" && e.taskId && e.userId)
        .map((e) => [e.taskId as string, e.userId as string])
    );
    board.tasks = (board.tasks ?? []).map((t) => ({
      ...t,
      comments: t.comments ?? [],
      checklist: t.checklist ?? [],
      assignedUserId: t.assignedUserId ?? null,
      createdByUserId: t.createdByUserId ?? createdByTaskId.get(t.id) ?? null,
      branchName: t.branchName ?? "",
      priority: t.priority ?? "none",
      status: t.status ?? "open",
      finishedAt: t.finishedAt ?? null,
    }));
    board.version = BOARD_SCHEMA_VERSION;
    return board;
  }

  async save(board: BoardData): Promise<void> {
    board.version = BOARD_SCHEMA_VERSION;
    board.updatedAt = new Date().toISOString();
    const text = JSON.stringify(board, null, 2);
    const dir = vscode.Uri.file(path.dirname(this.fileUri.fsPath));
    await vscode.workspace.fs.createDirectory(dir);

    // Best-effort backup of the previous good state before overwriting.
    try {
      const prev = await vscode.workspace.fs.readFile(this.fileUri);
      await vscode.workspace.fs.writeFile(this.backupUri, prev);
    } catch {
      // No previous file (first save) — nothing to back up.
    }

    this.lastWriteAt = Date.now();
    this.lastSerialized = JSON.stringify(board);
    await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(text, "utf8"));
  }

  onExternalChange(listener: (board: BoardData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  dispose(): void {
    this.watcher?.dispose();
    this.listeners = [];
  }
}
