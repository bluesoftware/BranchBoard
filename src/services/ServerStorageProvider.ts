import { BoardData } from "../types";
import { StorageProvider } from "./StorageProvider";

/**
 * STUB. Prepared for a future VPS backend (Node.js API + SQLite + WebSocket).
 *
 * The full server mode is intentionally not implemented in the MVP. The shape
 * below documents exactly what the real implementation needs to provide so the
 * rest of the extension can switch to it without changes:
 *
 *   GET    {serverUrl}/api/board            -> BoardData            (load)
 *   PUT    {serverUrl}/api/board            <- BoardData            (save)
 *   WS     {serverUrl}/ws                    -> { type: "board", data } (push)
 *
 * Authentication: Authorization: Bearer {authToken}
 */
export class ServerStorageProvider implements StorageProvider {
  public readonly kind = "server" as const;

  private listeners: Array<(board: BoardData) => void> = [];

  constructor(
    private readonly serverUrl: string,
    private readonly authToken: string,
    private readonly syncIntervalSeconds: number
  ) {}

  private notImplemented(): never {
    throw new Error(
      "BranchBoard server mode is not available yet. " +
        "Set branchBoard.storageMode to 'workspace-json' to use local storage."
    );
  }

  async load(): Promise<BoardData> {
    // Future:
    //   const res = await fetch(`${this.serverUrl}/api/board`, {
    //     headers: { Authorization: `Bearer ${this.authToken}` },
    //   });
    //   return (await res.json()) as BoardData;
    return this.notImplemented();
  }

  async save(_board: BoardData): Promise<void> {
    // Future:
    //   await fetch(`${this.serverUrl}/api/board`, {
    //     method: "PUT",
    //     headers: {
    //       "Content-Type": "application/json",
    //       Authorization: `Bearer ${this.authToken}`,
    //     },
    //     body: JSON.stringify(_board),
    //   });
    return this.notImplemented();
  }

  onExternalChange(listener: (board: BoardData) => void): () => void {
    // Future: open a WebSocket to `${this.serverUrl}/ws` and call listener on
    // every "board" push. Poll every `syncIntervalSeconds` as a fallback.
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  dispose(): void {
    this.listeners = [];
  }
}
