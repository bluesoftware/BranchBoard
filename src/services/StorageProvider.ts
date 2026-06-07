import { BoardData } from "../types";

/**
 * Abstraction over where the board lives. The MVP ships a local-JSON
 * implementation; a server implementation can be dropped in later without
 * touching the rest of the extension.
 */
export interface StorageProvider {
  readonly kind: "workspace-json" | "server";

  /** Load the board, creating a default one if nothing exists yet. */
  load(): Promise<BoardData>;

  /** Persist the full board. */
  save(board: BoardData): Promise<void>;

  /**
   * Register a callback fired when the underlying store changes externally
   * (e.g. another teammate edited the file, or a server push arrived).
   * Returns a disposer.
   */
  onExternalChange(listener: (board: BoardData) => void): () => void;

  /** Release any watchers / timers / sockets. */
  dispose(): void;
}

/** Build the default board used when no data file exists yet. */
export function createDefaultBoard(
  projectName: string,
  boardTitle: string,
  seedUsers: BoardData["users"]
): BoardData {
  const now = new Date().toISOString();
  const users =
    seedUsers && seedUsers.length > 0
      ? seedUsers
      : [
          { id: "darek", name: "Darek", email: "", avatarText: "DK", color: "#38bdf8" },
          { id: "hania", name: "Hania", email: "", avatarText: "HA", color: "#f472b6" },
        ];

  return {
    version: BOARD_SCHEMA_VERSION,
    projectName,
    boardTitle,
    updatedAt: now,
    columns: [
      { id: "app-sklep", name: "APP SKLEP", position: 1 },
      { id: "app-start", name: "APP START", position: 2 },
      { id: "koszyk", name: "KOSZYK", position: 3 },
      { id: "konto", name: "KONTO", position: 4 },
      { id: "do-testu", name: "DO TESTU", position: 5 },
      { id: "done", name: "ZROBIONE", position: 99 },
    ],
    users,
    tasks: [],
    events: [],
    deployments: [],
  };
}

/** Current on-disk board schema version. Bumped when the shape changes. */
export const BOARD_SCHEMA_VERSION = 3;

/** Hard cap on stored events so board.json never grows unbounded. */
export const MAX_STORED_EVENTS = 300;

/** Standard column set used by the onboarding "Create board" flow. */
export const ONBOARDING_COLUMNS: BoardData["columns"] = [
  { id: "backlog", name: "BACKLOG", position: 1 },
  { id: "todo", name: "TODO", position: 2 },
  { id: "in-progress", name: "IN PROGRESS", position: 3 },
  { id: "review", name: "REVIEW", position: 4 },
  { id: "testing", name: "TESTING", position: 5 },
  { id: "done", name: "DONE", position: 99 },
];
