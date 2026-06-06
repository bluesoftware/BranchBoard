import * as vscode from "vscode";
import * as path from "path";
import { BoardData } from "../types";
import { StorageProvider, createDefaultBoard } from "./StorageProvider";

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

  async load(): Promise<BoardData> {
    try {
      const board = await this.readFile();
      this.lastSerialized = JSON.stringify(board);
      return board;
    } catch {
      // No file yet -> create the default board.
      const board = createDefaultBoard(this.projectName, this.boardTitle, this.seedUsers);
      await this.save(board);
      return board;
    }
  }

  private async readFile(): Promise<BoardData> {
    const bytes = await vscode.workspace.fs.readFile(this.fileUri);
    const text = Buffer.from(bytes).toString("utf8");
    const parsed = JSON.parse(text) as BoardData;
    return this.normalize(parsed);
  }

  /** Make sure required arrays/fields exist so the rest of the app is safe. */
  private normalize(board: BoardData): BoardData {
    board.columns = board.columns ?? [];
    board.users = board.users ?? [];
    board.tasks = (board.tasks ?? []).map((t) => ({
      ...t,
      comments: t.comments ?? [],
      checklist: t.checklist ?? [],
      assignedUserId: t.assignedUserId ?? null,
      branchName: t.branchName ?? "",
      status: t.status ?? "open",
      finishedAt: t.finishedAt ?? null,
    }));
    return board;
  }

  async save(board: BoardData): Promise<void> {
    board.updatedAt = new Date().toISOString();
    const text = JSON.stringify(board, null, 2);
    const dir = vscode.Uri.file(path.dirname(this.fileUri.fsPath));
    await vscode.workspace.fs.createDirectory(dir);
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
