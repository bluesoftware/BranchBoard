import { BoardData, ColumnHook } from "../types";

/** Build a column hook with safe defaults (disabled until the user opts in). */
function hook(partial: Partial<ColumnHook> & { id: string; label: string; command: string }): ColumnHook {
  return {
    args: [],
    requireConfirm: true,
    requireCleanTree: false,
    continueOnError: false,
    timeoutSec: 120,
    blocking: false,
    enabled: false,
    ...partial,
  };
}

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
    columns: GIT_FLOW_COLUMNS_PL.map((c) => ({ ...c })),
    users,
    tasks: [],
    events: [],
    deployments: [],
    notifications: [],
    announcements: [],
  };
}

/**
 * Default board mapped onto the Git lifecycle. Columns are workflow stages
 * (status), not feature areas — feature areas live as task labels/impact areas.
 * Sample hooks are included but DISABLED, so nothing runs until the user
 * reviews and enables them.
 *
 *   Backlog / To Do  -> no branch
 *   W trakcie        -> feature/<id-slug> cut from dev  (origin/<branch>)
 *   Code review      -> branch pushed; PR feature/* -> dev
 *   Do testu         -> integrated into dev            (origin/dev, staging)
 *   Zrobione         -> released into main             (origin/main, production)
 */
export const GIT_FLOW_COLUMNS_PL: BoardData["columns"] = [
  { id: "backlog", name: "BACKLOG", nameEn: "Backlog", position: 1, gitStage: "none" },
  { id: "todo", name: "DO ZROBIENIA", nameEn: "To Do", position: 2, gitStage: "none" },
  {
    id: "ai-agent",
    name: "AI AGENT",
    nameEn: "AI Agent",
    position: 3,
    gitStage: "ai-agent",
    branchPrefix: "ai/",
    wipLimit: 3,
  },
  {
    id: "in-progress",
    name: "W TRAKCIE",
    nameEn: "In Progress",
    position: 4,
    gitStage: "feature",
    baseBranch: "dev",
    branchPrefix: "feature/",
    wipLimit: 3,
    onEnter: [
      hook({ id: "h-deps", label: "Instaluj zależności / Install deps", command: "npm", args: ["install"] }),
    ],
  },
  {
    id: "review",
    name: "CODE REVIEW",
    nameEn: "Code Review",
    position: 5,
    gitStage: "review",
    targetBranch: "dev",
    onEnter: [
      hook({ id: "h-lint", label: "Lint", command: "npm", args: ["run", "lint"], blocking: true }),
    ],
  },
  {
    id: "testing",
    name: "DO TESTU",
    nameEn: "Testing",
    position: 6,
    gitStage: "staging",
    targetBranch: "dev",
    onEnter: [
      hook({ id: "h-test", label: "Testy / Tests", command: "npm", args: ["test"], blocking: true }),
    ],
  },
  {
    id: "done",
    name: "ZROBIONE",
    nameEn: "Done",
    position: 99,
    gitStage: "production",
    targetBranch: "main",
    onEnter: [
      hook({ id: "h-build", label: "Build", command: "npm", args: ["run", "build"], blocking: true }),
    ],
  },
];

/** English-labelled equivalent used when the board is created in EN. */
export const GIT_FLOW_COLUMNS_EN: BoardData["columns"] = GIT_FLOW_COLUMNS_PL.map((c) => ({
  ...c,
  name: (c.nameEn || c.name).toUpperCase(),
}));

/** Current on-disk board schema version. Bumped when the shape changes. */
export const BOARD_SCHEMA_VERSION = 5;

/** Hard cap on stored events so board.json never grows unbounded. */
export const MAX_STORED_EVENTS = 300;

/** Hard cap on stored notifications so board.json never grows unbounded. */
export const MAX_STORED_NOTIFICATIONS = 200;

/** Hard cap on admin announcements; each announcement tracks per-user read state. */
export const MAX_STORED_ANNOUNCEMENTS = 50;

/** Standard column set used by the onboarding "Create board" flow (Git-mapped). */
export const ONBOARDING_COLUMNS: BoardData["columns"] = GIT_FLOW_COLUMNS_EN.map((c) => ({ ...c }));
