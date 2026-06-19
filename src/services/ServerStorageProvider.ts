import { execFile, spawn } from "child_process";
import { BoardData } from "../types";
import { StorageProvider } from "./StorageProvider";
import { Logger } from "./Logger";

export interface ConnectionStep {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Thrown when the server is reachable but contains NO board yet (table empty).
 * The extension treats this as "ask the user to create a board" — it must
 * never auto-seed, so an existing database can never be silently replaced.
 */
export class NoServerBoardError extends Error {
  readonly noBoard = true;
  constructor(message: string) {
    super(message);
    this.name = "NoServerBoardError";
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  mode: "local" | "ssh";
  target: string;
  steps: ConnectionStep[];
}

export interface SshSqliteOptions {
  /** SSH target (user@host or ~/.ssh/config alias). Empty = access the DB locally. */
  host: string;
  port: number;
  dbPath: string;
  sshKeyPath: string;
  projectName: string;
  boardTitle: string;
  seedUsers: BoardData["users"];
  /**
   * Allow overwriting a non-empty server board with an empty one (0 tasks).
   * Off by default — this is the main data-loss guard. Only enable for an
   * intentional reset.
   */
  allowEmptyOverwrite?: boolean;
}

const OUTPUT_BUFFER_LIMIT = 128 * 1024 * 1024;
const COLLECTION_KEYS = ["columns", "users", "tasks", "events", "deployments", "notifications", "announcements"] as const;

type CollectionKey = typeof COLLECTION_KEYS[number];

interface CollectionDelta {
  upserts: Array<{ sortOrder: number; data: unknown }>;
  deleteIds: string[];
}

interface BoardDelta {
  meta: {
    version: number;
    projectName: string;
    boardTitle: string;
    updatedAt: string;
  };
  collections: Record<CollectionKey, CollectionDelta>;
}

interface BoardChangeHistory {
  kind: "delta";
  fromUpdatedAt: string | null;
  toUpdatedAt: string;
  changes: Record<
    CollectionKey,
    {
      upserts: Array<{ id: string; sortOrder: number; before: unknown | null; after: unknown }>;
      deletes: Array<{ id: string; before: unknown | null }>;
    }
  >;
}

interface BoardSnapshot {
  collections: Record<CollectionKey, Map<string, string>>;
}

/**
 * Server mode = a shared SQLite database accessed through `sqlite3`.
 *
 *  - If `host` is set, the extension runs `sqlite3` on that host over SSH
 *    (authenticating with the configured SSH key) — use this from any other
 *    computer.
 *  - If `host` is EMPTY, the extension runs `sqlite3` locally on the same
 *    machine the DB lives on (e.g. when the extension runs ON the server).
 *
 * Either way the DB path (default ~/sqlite/branchboard.db) is the same, so a
 * teammate connecting over SSH and the server itself read/write one database.
 *
 * Storage layout: relational SQLite tables for the board metadata and each
 * top-level collection (columns, users, tasks, events, deployments,
 * notifications). Each entity row keeps indexed columns for common lookups and
 * a `data` JSON payload so newer BranchBoard fields survive migrations without
 * requiring a schema change every time.
 *
 * Older databases that only have `board(id=1, data=<whole board JSON>)` are
 * imported automatically on first load. The legacy row is left untouched as a
 * safety backup, but all future reads/writes use the relational tables.
 *
 * Requirements: `sqlite3`, `base64`, and a POSIX shell on whichever side runs
 * the command (the remote host for SSH mode, or the local machine for local
 * mode). macOS and Linux ship all three.
 */
export class SshSqliteStorageProvider implements StorageProvider {
  public readonly kind = "server" as const;

  private listeners: Array<(board: BoardData) => void> = [];
  private lastSerialized = "";
  /** updated_at of the row we last loaded — used for optimistic concurrency. */
  private lastLoadedUpdatedAt: string | null = null;
  /** Last board shape loaded/saved, used to write only changed relational rows. */
  private lastSnapshot: BoardSnapshot | null = null;
  /** Serialises load/save so concurrent calls never interleave and corrupt state. */
  private opLock: Promise<unknown> = Promise.resolve();
  private readonly local: boolean;

  constructor(private readonly opts: SshSqliteOptions) {
    this.local = !opts.host || !opts.host.trim();
    this.validate();
  }

  private validate() {
    if (!this.local && !/^[A-Za-z0-9._@-]+$/.test(this.opts.host)) {
      throw new Error(
        "Invalid 'branchBoard.sshHost'. Use user@host or an ~/.ssh/config alias, or leave it empty for local access."
      );
    }
    // Safe charset only (no spaces or shell metacharacters): the path is used
    // unquoted in a shell assignment, so this keeps it injection-proof.
    if (!/^[A-Za-z0-9._/~-]+$/.test(this.opts.dbPath)) {
      throw new Error(
        "Invalid 'branchBoard.sqliteRemotePath'. Use a simple path like ~/sqlite/branchboard.db (no spaces)."
      );
    }
  }

  /** Human-readable target for error messages. */
  private target(): string {
    return this.local ? `local SQLite (${this.opts.dbPath})` : `${this.opts.host}:${this.opts.dbPath}`;
  }

  /* ---------------- command execution (local or over SSH) ---------------- */

  private sshArgs(remoteCommand: string): string[] {
    const args: string[] = [];
    const key = (this.opts.sshKeyPath || "").trim();
    if (key) {
      args.push("-i", key, "-o", "IdentitiesOnly=yes");
    }
    if (this.opts.port && this.opts.port !== 22) {
      args.push("-p", String(this.opts.port));
    }
    args.push("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new");
    args.push(this.opts.host, remoteCommand);
    return args;
  }

  /** Run a shell command, locally or on the remote host. */
  private exec(shellCommand: string, input?: string): Promise<string> {
    const file = this.local ? "sh" : "ssh";
    const args = this.local ? ["-c", shellCommand] : this.sshArgs(shellCommand);
    const label = this.local ? "local sh" : `ssh ${this.opts.host}`;
    const started = Date.now();

    if (input !== undefined) {
      return this.spawnWithInput(file, args, label, started, input);
    }
    return new Promise((resolve, reject) => {
      execFile(file, args, { windowsHide: true, maxBuffer: OUTPUT_BUFFER_LIMIT }, (err, stdout, stderr) => {
        const ms = Date.now() - started;
        if (err) {
          const detail = (stderr || err.message).toString().trim();
          Logger.debug(`exec[${label}]: failed after ${ms}ms — ${Logger.trunc(detail)}`);
          reject(new Error(detail));
          return;
        }
        Logger.debug(`exec[${label}]: ok after ${ms}ms`);
        resolve(stdout);
      });
    });
  }

  private spawnWithInput(
    file: string,
    args: string[],
    label: string,
    started: number,
    input: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      const maxBuffer = OUTPUT_BUFFER_LIMIT;

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes <= maxBuffer) {
          stdout.push(chunk);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= maxBuffer) {
          stderr.push(chunk);
        }
      });
      child.on("error", (err) => {
        if (settled) {
          return;
        }
        settled = true;
        const ms = Date.now() - started;
        Logger.debug(`exec[${label}]: spawn error after ${ms}ms — ${Logger.trunc(err.message)}`);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        const ms = Date.now() - started;
        const out = Buffer.concat(stdout).toString();
        const err = Buffer.concat(stderr).toString();
        if (stdoutBytes > maxBuffer || stderrBytes > maxBuffer) {
          const message = `Command output exceeded ${maxBuffer} bytes.`;
          Logger.debug(`exec[${label}]: failed after ${ms}ms — ${message}`);
          reject(new Error(message));
          return;
        }
        if (code !== 0) {
          const detail = err.trim() || `Command exited with code ${code ?? "unknown"}`;
          Logger.debug(`exec[${label}]: failed after ${ms}ms (exit ${code}) — ${Logger.trunc(detail)}`);
          reject(new Error(detail));
          return;
        }
        Logger.debug(`exec[${label}]: ok after ${ms}ms`);
        resolve(out);
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input, "utf8");
    });
  }

  /** dbPath is validated to a safe charset; tilde/$(...) handled by the shell. */
  private dbExpr(): string {
    return this.opts.dbPath;
  }

  private schemaSql(): string {
    return (
      `CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT); ` +
      `CREATE TABLE IF NOT EXISTS board_history(hid INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, updated_at TEXT, archived_at TEXT); ` +
      `CREATE TABLE IF NOT EXISTS board_change_history(` +
      `hid INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, from_updated_at TEXT, to_updated_at TEXT, archived_at TEXT` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_meta(` +
      `id INTEGER PRIMARY KEY CHECK(id=1), ` +
      `version INTEGER NOT NULL, ` +
      `project_name TEXT NOT NULL, ` +
      `board_title TEXT NOT NULL, ` +
      `updated_at TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_columns(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, name TEXT NOT NULL, position REAL NOT NULL, ` +
      `git_stage TEXT, data TEXT NOT NULL, updated_at TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_users(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, ` +
      `data TEXT NOT NULL, updated_at TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_tasks(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, title TEXT NOT NULL, column_id TEXT NOT NULL, ` +
      `position REAL NOT NULL, assigned_user_id TEXT, branch_name TEXT NOT NULL, status TEXT NOT NULL, ` +
      `priority TEXT NOT NULL, task_type TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ` +
      `finished_at TEXT, data TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_events(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, type TEXT NOT NULL, task_id TEXT, branch_name TEXT, ` +
      `user_id TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_deployments(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, task_id TEXT, branch_name TEXT NOT NULL, ` +
      `environment TEXT NOT NULL, status TEXT NOT NULL, deployed_at TEXT, data TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_notifications(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, type TEXT NOT NULL, task_id TEXT, actor_user_id TEXT, ` +
      `branch_name TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL` +
      `); ` +
      `CREATE TABLE IF NOT EXISTS board_announcements(` +
      `id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, severity TEXT NOT NULL, active INTEGER NOT NULL, ` +
      `created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL` +
      `); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_columns_position ON board_columns(position, sort_order); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_tasks_column ON board_tasks(column_id, position); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_tasks_branch ON board_tasks(branch_name); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_tasks_assignee ON board_tasks(assigned_user_id); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_events_task ON board_events(task_id, created_at); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_deployments_task ON board_deployments(task_id, environment); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_notifications_task ON board_notifications(task_id, created_at); ` +
      `CREATE INDEX IF NOT EXISTS idx_board_announcements_active ON board_announcements(active, updated_at); ` +
      `CREATE TRIGGER IF NOT EXISTS branchboard_block_legacy_board_insert ` +
      `BEFORE INSERT ON board ` +
      `WHEN NEW.id=1 AND EXISTS (SELECT 1 FROM board_meta WHERE id=1) ` +
      `BEGIN SELECT RAISE(ABORT, 'BranchBoard database has been migrated. Update the BranchBoard extension before saving.'); END; ` +
      `CREATE TRIGGER IF NOT EXISTS branchboard_block_legacy_board_update ` +
      `BEFORE UPDATE ON board ` +
      `WHEN NEW.id=1 AND EXISTS (SELECT 1 FROM board_meta WHERE id=1) ` +
      `BEGIN SELECT RAISE(ABORT, 'BranchBoard database has been migrated. Update the BranchBoard extension before saving.'); END; `
    );
  }

  private async ensureSchema(): Promise<void> {
    const db = this.dbExpr();
    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `sqlite3 -batch -bail "$D" "${this.schemaSql()}"`;
    await this.exec(cmd);
  }

  /** Lightweight metadata about the board row (no JSON transfer). */
  private async readMeta(): Promise<{ rows: number; updatedAt: string; bytes: number }> {
    const db = this.dbExpr();
    const out = await this.exec(
      `D=${db}; sqlite3 -batch -noheader "$D" ` +
        `"SELECT (SELECT count(*) FROM board WHERE id=1) || '|' || ` +
        `COALESCE((SELECT updated_at FROM board WHERE id=1),'') || '|' || ` +
        `COALESCE((SELECT length(data) FROM board WHERE id=1),0);"`
    );
    const [rows, updatedAt, bytes] = out.trim().split("|");
    return { rows: Number(rows) || 0, updatedAt: updatedAt ?? "", bytes: Number(bytes) || 0 };
  }

  /** Metadata for the relational board tables. */
  private async readRelationalMeta(): Promise<{ rows: number; updatedAt: string; tasks: number; bytes: number }> {
    const db = this.dbExpr();
    const out = await this.exec(
      `D=${db}; sqlite3 -batch -noheader "$D" ` +
        `"SELECT (SELECT count(*) FROM board_meta WHERE id=1) || '|' || ` +
        `COALESCE((SELECT updated_at FROM board_meta WHERE id=1),'') || '|' || ` +
        `COALESCE((SELECT count(*) FROM board_tasks),0) || '|' || ` +
        `COALESCE((SELECT sum(length(data)) FROM (` +
        `SELECT data FROM board_columns UNION ALL SELECT data FROM board_users UNION ALL SELECT data FROM board_tasks ` +
        `UNION ALL SELECT data FROM board_events UNION ALL SELECT data FROM board_deployments ` +
        `UNION ALL SELECT data FROM board_notifications UNION ALL SELECT data FROM board_announcements` +
        `)),0);"`
    );
    const [rows, updatedAt, tasks, bytes] = out.trim().split("|");
    return {
      rows: Number(rows) || 0,
      updatedAt: updatedAt ?? "",
      tasks: Number(tasks) || 0,
      bytes: Number(bytes) || 0,
    };
  }

  /** Full JSON of the board row (empty string when absent). */
  private async readData(): Promise<string> {
    const db = this.dbExpr();
    const out = await this.exec(`D=${db}; sqlite3 -batch -noheader "$D" "SELECT data FROM board WHERE id=1;"`);
    return out.trim();
  }

  private normalizeBoardObject(board: BoardData): BoardData {
    return {
      ...board,
      version: Number(board.version) || 1,
      projectName: board.projectName || this.opts.projectName,
      boardTitle: board.boardTitle || this.opts.boardTitle,
      columns: Array.isArray(board.columns) ? board.columns : [],
      users: Array.isArray(board.users) ? board.users : [],
      tasks: Array.isArray(board.tasks) ? board.tasks : [],
      events: Array.isArray(board.events) ? board.events : [],
      deployments: Array.isArray(board.deployments) ? board.deployments : [],
      notifications: Array.isArray(board.notifications) ? board.notifications : [],
      announcements: Array.isArray(board.announcements) ? board.announcements : [],
    };
  }

  private canonicalBoardJson(board: BoardData): string {
    return JSON.stringify(this.normalizeBoardObject(board));
  }

  private collectionItems(board: BoardData, key: CollectionKey): Array<any> {
    const value = board[key];
    return Array.isArray(value) ? value : [];
  }

  private itemId(item: any, prefix: CollectionKey, index: number): string {
    return String(item?.id || `${prefix}-${index}`);
  }

  private snapshotEntry(key: CollectionKey, sortOrder: number, item: unknown): string {
    // Task ordering is already stored in each task as columnId + position. If
    // we include the array index here, deleting one task from the middle makes
    // every later task look changed and turns a tiny delete into thousands of
    // upserts on large boards.
    return key === "tasks" ? JSON.stringify(item) : `${sortOrder}\u0000${JSON.stringify(item)}`;
  }

  private createSnapshot(board: BoardData): BoardSnapshot {
    const normalized = this.normalizeBoardObject(board);
    const collections = {} as Record<CollectionKey, Map<string, string>>;
    for (const key of COLLECTION_KEYS) {
      const map = new Map<string, string>();
      this.collectionItems(normalized, key).forEach((item, index) => {
        map.set(this.itemId(item, key, index), this.snapshotEntry(key, index, item));
      });
      collections[key] = map;
    }
    return { collections };
  }

  private createDelta(board: BoardData, nextSnapshot: BoardSnapshot): BoardDelta {
    const normalized = this.normalizeBoardObject(board);
    const collections = {} as Record<CollectionKey, CollectionDelta>;
    for (const key of COLLECTION_KEYS) {
      const previous = this.lastSnapshot?.collections[key] ?? new Map<string, string>();
      const next = nextSnapshot.collections[key];
      const upserts: Array<{ sortOrder: number; data: unknown }> = [];
      const deleteIds: string[] = [];

      this.collectionItems(normalized, key).forEach((item, index) => {
        const id = this.itemId(item, key, index);
        if (previous.get(id) !== next.get(id)) {
          upserts.push({ sortOrder: index, data: item && item.id ? item : { ...item, id } });
        }
      });

      for (const id of previous.keys()) {
        if (!next.has(id)) {
          deleteIds.push(id);
        }
      }

      collections[key] = { upserts, deleteIds };
    }

    return {
      meta: {
        version: normalized.version,
        projectName: normalized.projectName,
        boardTitle: normalized.boardTitle,
        updatedAt: normalized.updatedAt || new Date().toISOString(),
      },
      collections,
    };
  }

  private deltaSize(delta: BoardDelta): { upserts: number; deletes: number } {
    let upserts = 0;
    let deletes = 0;
    for (const key of COLLECTION_KEYS) {
      upserts += delta.collections[key].upserts.length;
      deletes += delta.collections[key].deleteIds.length;
    }
    return { upserts, deletes };
  }

  private snapshotItem(entry: string | undefined): unknown | null {
    if (!entry) {
      return null;
    }
    const sep = entry.indexOf("\u0000");
    const json = sep >= 0 ? entry.slice(sep + 1) : entry;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private createChangeHistory(delta: BoardDelta, toUpdatedAt: string): BoardChangeHistory {
    const changes = {} as BoardChangeHistory["changes"];
    for (const key of COLLECTION_KEYS) {
      const previous = this.lastSnapshot?.collections[key] ?? new Map<string, string>();
      changes[key] = {
        upserts: delta.collections[key].upserts.map((row) => {
          const id = this.itemId(row.data, key, row.sortOrder);
          return {
            id,
            sortOrder: row.sortOrder,
            before: this.snapshotItem(previous.get(id)),
            after: row.data,
          };
        }),
        deletes: delta.collections[key].deleteIds.map((id) => ({
          id,
          before: this.snapshotItem(previous.get(id)),
        })),
      };
    }
    return {
      kind: "delta",
      fromUpdatedAt: this.lastLoadedUpdatedAt,
      toUpdatedAt,
      changes,
    };
  }

  private relationalBoardSql(): string {
    const arraySql = (table: string, orderBy: string) =>
      `json(COALESCE((SELECT json_group_array(json(data)) FROM (SELECT data FROM ${table} ORDER BY ${orderBy})), '[]'))`;

    return (
      `SELECT json_object(` +
      `'version', version, ` +
      `'projectName', project_name, ` +
      `'boardTitle', board_title, ` +
      `'updatedAt', updated_at, ` +
      `'columns', ${arraySql("board_columns", "sort_order ASC, position ASC, id ASC")}, ` +
      `'users', ${arraySql("board_users", "sort_order ASC, id ASC")}, ` +
      `'tasks', ${arraySql("board_tasks", "column_id ASC, position ASC, id ASC")}, ` +
      `'events', ${arraySql("board_events", "sort_order ASC, created_at ASC, id ASC")}, ` +
      `'deployments', ${arraySql("board_deployments", "sort_order ASC, id ASC")}, ` +
      `'notifications', ${arraySql("board_notifications", "sort_order ASC, created_at ASC, id ASC")}, ` +
      `'announcements', ${arraySql("board_announcements", "sort_order ASC, updated_at ASC, id ASC")} ` +
      `) FROM board_meta WHERE id=1;`
    );
  }

  private async readRelationalBoard(): Promise<BoardData> {
    const db = this.dbExpr();
    const out = await this.exec(`D=${db}; sqlite3 -batch -noheader "$D" "${this.relationalBoardSql()}"`);
    const text = out.trim();
    if (!text) {
      throw new Error(`${this.target()}: relational board metadata is missing.`);
    }
    return this.normalizeBoardObject(JSON.parse(text) as BoardData);
  }

  /** Canonical server state, preferring relational tables and falling back to the legacy JSON row. */
  private async readCanonicalJson(): Promise<{ json: string; updatedAt: string; tasks: number; source: "relational" | "legacy" | "empty" }> {
    const relational = await this.readRelationalMeta();
    if (relational.rows > 0) {
      const board = await this.readRelationalBoard();
      return {
        json: this.canonicalBoardJson(board),
        updatedAt: relational.updatedAt,
        tasks: relational.tasks,
        source: "relational",
      };
    }

    const legacy = await this.readMeta();
    if (legacy.rows > 0) {
      const json = await this.readData();
      return { json, updatedAt: legacy.updatedAt, tasks: this.countTasks(json), source: "legacy" };
    }

    return { json: "", updatedAt: "", tasks: 0, source: "empty" };
  }

  /**
   * Canonicalise a board JSON string for comparison. sqlite stores the value via
   * readfile() (a BLOB), so the bytes read back are not necessarily identical to
   * the exact string we wrote (encoding/representation). Parsing then
   * re-stringifying gives a stable form so conflict detection compares MEANING,
   * not byte representation — this is what makes "changed elsewhere" reliable.
   */
  private normalize(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s));
    } catch {
      return s;
    }
  }

  /** Count tasks in a board JSON string. Returns -1 when it can't be parsed. */
  private countTasks(json: string): number {
    try {
      const b = JSON.parse(json) as BoardData;
      return Array.isArray(b.tasks) ? b.tasks.length : 0;
    } catch {
      return -1; // unknown — treat as "has data" to stay safe
    }
  }

  /** Run an operation exclusively — load/save never interleave. */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opLock.then(fn, fn);
    // Keep the chain alive even if this op rejects, but don't swallow the error.
    this.opLock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /* ---------------- StorageProvider ---------------- */

  load(): Promise<BoardData> {
    return this.runExclusive(() => this.loadInternal());
  }

  save(board: BoardData): Promise<void> {
    return this.runExclusive(() => this.saveInternal(board));
  }

  private async loadInternal(): Promise<BoardData> {
    Logger.info(`Loading board from ${this.target()}.`);
    await this.ensureSchema();
    const relationalMeta = await this.readRelationalMeta();
    if (relationalMeta.rows > 0) {
      try {
        const board = await this.readRelationalBoard();
        this.lastSerialized = this.normalize(this.canonicalBoardJson(board));
        this.lastLoadedUpdatedAt = relationalMeta.updatedAt || null;
        this.lastSnapshot = this.createSnapshot(board);
        Logger.info(
          `Loaded relational board (${relationalMeta.tasks} task(s), ${relationalMeta.bytes} payload bytes, updated ${
            relationalMeta.updatedAt || "?"
          }) from ${this.target()}.`
        );
        return board;
      } catch (err: any) {
        throw new Error(`${this.target()} returned invalid relational board data: ${err?.message ?? err}`);
      }
    }

    const meta = await this.readMeta();

    // No board row yet. We are CONNECTED and have CONFIRMED the table is empty,
    // but we still never auto-seed — the extension must ask the user to create a
    // board explicitly. This guarantees an existing DB is never silently
    // replaced (and that a misconfigured path can't quietly create a decoy).
    if (meta.rows === 0) {
      Logger.warn("Connected to the server, but it has no board yet — asking the user to create one.");
      throw new NoServerBoardError(
        `Connected to ${this.target()}, but there is no board on it yet.`
      );
    }

    const text = await this.readData();
    if (!text) {
      // Row exists but data is empty/null: this is corruption or a transient
      // read issue. NEVER seed over it (that would erase real data). Fail loudly.
      throw new Error(
        `${this.target()}: the board row exists but returned no data (possible corruption or locked DB). ` +
          `Not overwriting it. Check the database before retrying.`
      );
    }

    try {
      const board = this.normalizeBoardObject(JSON.parse(text) as BoardData);
      Logger.info(
        `Loaded legacy board row (${text.length} chars, updated ${meta.updatedAt || "?"}) from ${this.target()}; ` +
          `migrating to relational tables.`
      );
      await this.writeRow(board, { backup: false });
      Logger.info(`Migrated legacy board row to relational SQLite tables on ${this.target()}.`);
      return board;
    } catch (err: any) {
      // Invalid JSON in the row — do not clobber it; surface the error.
      throw new Error(`${this.target()} returned invalid board JSON: ${err?.message ?? err}`);
    }
  }

  private async saveInternal(board: BoardData): Promise<void> {
    // A board with no columns is the in-memory "no board yet" shell. Never write
    // it to the server — only an explicit "Create board" (which adds columns)
    // may seed the database.
    if (!Array.isArray(board.columns) || board.columns.length === 0) {
      Logger.warn("Skipping save: board has no columns (not a real board yet).");
      return;
    }

    const incomingTasks = Array.isArray(board.tasks) ? board.tasks.length : 0;
    await this.ensureSchema();
    const relationalMeta = await this.readRelationalMeta();
    const legacyMeta = relationalMeta.rows > 0 ? { rows: 0, updatedAt: "", bytes: 0 } : await this.readMeta();
    const hasServerData = relationalMeta.rows > 0 || legacyMeta.rows > 0;

    if (hasServerData) {
      const serverUpdatedAt = relationalMeta.rows > 0 ? relationalMeta.updatedAt : legacyMeta.updatedAt;

      // Guard 1 — optimistic concurrency using board_meta.updated_at. This is
      // intentionally metadata-only so saving one task does not require
      // downloading a large board first. When another client has written since
      // our last load/save, reload and ask the user to reapply the change.
      if (!this.lastLoadedUpdatedAt || !serverUpdatedAt || serverUpdatedAt !== this.lastLoadedUpdatedAt) {
        Logger.warn("Server board content differs from our last-known version — reloading, not overwriting.");
        await this.reloadAndNotify();
        throw new Error(
          "The board on the server was changed elsewhere since you loaded it. " +
            "It has been reloaded — reapply your change on top of the latest version."
        );
      }

      // Guard 2 — empty-overwrites-non-empty: the catastrophic case. Refuse to
      // replace a board that has tasks with one that has none.
      if (incomingTasks === 0 && !this.opts.allowEmptyOverwrite) {
        const remoteTasks = relationalMeta.rows > 0 ? relationalMeta.tasks : this.countTasks(await this.readData());
        if (remoteTasks !== 0) {
          throw new Error(
            `Refusing to overwrite the server board (${remoteTasks < 0 ? "has data" : remoteTasks + " task(s)"}) ` +
              `with an empty board (0 tasks). The SQLite file on the server is the source of truth. ` +
              `To intentionally reset it, enable branchBoard.serverAllowEmptyOverwrite.`
          );
        }
      }
    }

    await this.writeBoard(board, {
      backup: hasServerData,
      previousJson: hasServerData ? this.lastSerialized : "",
      previousUpdatedAt: hasServerData ? this.lastLoadedUpdatedAt ?? "" : "",
    });
    Logger.info(`Saved board (${incomingTasks} task(s)) to ${this.target()}.`);
  }

  /** Write the board into relational tables, using an incremental delta when we have a previous snapshot. */
  private async writeBoard(
    board: BoardData,
    opts: { backup: boolean; previousJson?: string; previousUpdatedAt?: string }
  ): Promise<void> {
    if (!this.lastSnapshot) {
      await this.writeRow(board, opts);
      return;
    }
    await this.writeDelta(board, opts);
  }

  private async writeDelta(
    board: BoardData,
    opts: { backup: boolean; previousJson?: string; previousUpdatedAt?: string }
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    board.version = Number(board.version) || 1;
    board.updatedAt = updatedAt;
    const nextSnapshot = this.createSnapshot(board);
    const delta = this.createDelta(board, nextSnapshot);
    delta.meta.updatedAt = updatedAt;
    const history = opts.backup ? this.createChangeHistory(delta, updatedAt) : null;
    const size = this.deltaSize(delta);

    const db = this.dbExpr();
    const payload = JSON.stringify({ delta, history });
    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `TMP="$D.delta.json"; trap 'rm -f "$TMP"' EXIT; ` +
      `cat > "$TMP" && ` +
      `sqlite3 -batch -bail "$D" "` +
      this.schemaSql() +
      `CREATE TEMP TABLE __branchboard_delta(payload TEXT NOT NULL); ` +
      `INSERT INTO __branchboard_delta(payload) VALUES (json(CAST(readfile('$TMP') AS TEXT))); ` +
      `BEGIN IMMEDIATE; ` +
      `INSERT INTO board_change_history(data, from_updated_at, to_updated_at, archived_at) ` +
      `SELECT json(json_extract(payload, '$.history')), json_extract(payload, '$.history.fromUpdatedAt'), ` +
      `json_extract(payload, '$.history.toUpdatedAt'), datetime('now') FROM __branchboard_delta ` +
      `WHERE json_type(payload, '$.history') = 'object'; ` +
      `DELETE FROM board_change_history WHERE hid NOT IN (SELECT hid FROM board_change_history ORDER BY hid DESC LIMIT 300); ` +
      `INSERT OR REPLACE INTO board_meta(id, version, project_name, board_title, updated_at) ` +
      `SELECT 1, COALESCE(json_extract(payload, '$.delta.meta.version'), 1), ` +
      `COALESCE(json_extract(payload, '$.delta.meta.projectName'), ''), ` +
      `COALESCE(json_extract(payload, '$.delta.meta.boardTitle'), ''), ` +
      `COALESCE(json_extract(payload, '$.delta.meta.updatedAt'), '${updatedAt}') ` +
      `FROM __branchboard_delta; ` +
      this.deltaDeleteSql("board_columns", "columns") +
      this.deltaDeleteSql("board_users", "users") +
      this.deltaDeleteSql("board_tasks", "tasks") +
      this.deltaDeleteSql("board_events", "events") +
      this.deltaDeleteSql("board_deployments", "deployments") +
      this.deltaDeleteSql("board_notifications", "notifications") +
      this.deltaDeleteSql("board_announcements", "announcements") +
      this.deltaUpsertColumnsSql(updatedAt) +
      this.deltaUpsertUsersSql(updatedAt) +
      this.deltaUpsertTasksSql() +
      this.deltaUpsertEventsSql() +
      this.deltaUpsertDeploymentsSql() +
      this.deltaUpsertNotificationsSql() +
      this.deltaUpsertAnnouncementsSql() +
      `COMMIT;"`;

    await this.exec(cmd, payload);
    this.lastSerialized = "";
    this.lastLoadedUpdatedAt = updatedAt;
    this.lastSnapshot = nextSnapshot;
    Logger.debug(`Saved relational delta (${size.upserts} upsert(s), ${size.deletes} delete(s)) to ${this.target()}.`);
  }

  private deltaDeleteSql(table: string, key: CollectionKey): string {
    return (
      `DELETE FROM ${table} WHERE id IN (` +
      `SELECT d.value FROM __branchboard_delta, json_each(payload, '$.delta.collections.${key}.deleteIds') AS d` +
      `); `
    );
  }

  private deltaUpsertColumnsSql(updatedAt: string): string {
    return (
      `INSERT OR REPLACE INTO board_columns(id, sort_order, name, position, git_stage, data, updated_at) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.name'), ''), ` +
      `COALESCE(json_extract(e.value, '$.data.position'), COALESCE(json_extract(e.value, '$.sortOrder'), 0)), ` +
      `json_extract(e.value, '$.data.gitStage'), json(json_extract(e.value, '$.data')), '${updatedAt}' ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.columns.upserts') AS e; `
    );
  }

  private deltaUpsertUsersSql(updatedAt: string): string {
    return (
      `INSERT OR REPLACE INTO board_users(id, sort_order, name, email, data, updated_at) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.name'), ''), COALESCE(json_extract(e.value, '$.data.email'), ''), ` +
      `json(json_extract(e.value, '$.data')), '${updatedAt}' ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.users.upserts') AS e; `
    );
  }

  private deltaUpsertTasksSql(): string {
    return (
      `INSERT OR REPLACE INTO board_tasks(` +
      `id, sort_order, title, column_id, position, assigned_user_id, branch_name, status, priority, task_type, ` +
      `created_at, updated_at, finished_at, data` +
      `) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.title'), ''), COALESCE(json_extract(e.value, '$.data.columnId'), ''), ` +
      `COALESCE(json_extract(e.value, '$.data.position'), COALESCE(json_extract(e.value, '$.sortOrder'), 0)), ` +
      `json_extract(e.value, '$.data.assignedUserId'), COALESCE(json_extract(e.value, '$.data.branchName'), ''), ` +
      `COALESCE(json_extract(e.value, '$.data.status'), 'open'), COALESCE(json_extract(e.value, '$.data.priority'), 'none'), ` +
      `json_extract(e.value, '$.data.taskType'), COALESCE(json_extract(e.value, '$.data.createdAt'), ''), ` +
      `COALESCE(json_extract(e.value, '$.data.updatedAt'), ''), json_extract(e.value, '$.data.finishedAt'), ` +
      `json(json_extract(e.value, '$.data')) ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.tasks.upserts') AS e; `
    );
  }

  private deltaUpsertEventsSql(): string {
    return (
      `INSERT OR REPLACE INTO board_events(id, sort_order, type, task_id, branch_name, user_id, created_at, data) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.type'), ''), json_extract(e.value, '$.data.taskId'), ` +
      `json_extract(e.value, '$.data.branchName'), json_extract(e.value, '$.data.userId'), ` +
      `COALESCE(json_extract(e.value, '$.data.createdAt'), ''), json(json_extract(e.value, '$.data')) ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.events.upserts') AS e; `
    );
  }

  private deltaUpsertDeploymentsSql(): string {
    return (
      `INSERT OR REPLACE INTO board_deployments(id, sort_order, task_id, branch_name, environment, status, deployed_at, data) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `json_extract(e.value, '$.data.taskId'), COALESCE(json_extract(e.value, '$.data.branchName'), ''), ` +
      `COALESCE(json_extract(e.value, '$.data.environment'), ''), COALESCE(json_extract(e.value, '$.data.status'), ''), ` +
      `json_extract(e.value, '$.data.deployedAt'), json(json_extract(e.value, '$.data')) ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.deployments.upserts') AS e; `
    );
  }

  private deltaUpsertNotificationsSql(): string {
    return (
      `INSERT OR REPLACE INTO board_notifications(id, sort_order, type, task_id, actor_user_id, branch_name, created_at, data) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.type'), ''), json_extract(e.value, '$.data.taskId'), ` +
      `json_extract(e.value, '$.data.actorUserId'), json_extract(e.value, '$.data.branchName'), ` +
      `COALESCE(json_extract(e.value, '$.data.createdAt'), ''), json(json_extract(e.value, '$.data')) ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.notifications.upserts') AS e; `
    );
  }

  private deltaUpsertAnnouncementsSql(): string {
    return (
      `INSERT OR REPLACE INTO board_announcements(id, sort_order, severity, active, created_at, updated_at, data) ` +
      `SELECT json_extract(e.value, '$.data.id'), COALESCE(json_extract(e.value, '$.sortOrder'), 0), ` +
      `COALESCE(json_extract(e.value, '$.data.severity'), 'info'), ` +
      `CASE WHEN COALESCE(json_extract(e.value, '$.data.active'), 1) THEN 1 ELSE 0 END, ` +
      `COALESCE(json_extract(e.value, '$.data.createdAt'), ''), COALESCE(json_extract(e.value, '$.data.updatedAt'), ''), ` +
      `json(json_extract(e.value, '$.data')) ` +
      `FROM __branchboard_delta, json_each(payload, '$.delta.collections.announcements.upserts') AS e; `
    );
  }

  private async writeRow(
    board: BoardData,
    opts: { backup: boolean; previousJson?: string; previousUpdatedAt?: string }
  ): Promise<void> {
    const updatedAt = new Date().toISOString(); // safe charset: [0-9T:.Z-]
    board.version = Number(board.version) || 1;
    board.updatedAt = updatedAt;
    const json = this.canonicalBoardJson(board);
    const db = this.dbExpr();

    if (opts.backup && opts.previousJson) {
      await this.appendHistory(opts.previousJson, opts.previousUpdatedAt || updatedAt);
    }

    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `TMP="$D.tmp.json"; trap 'rm -f "$TMP"' EXIT; ` +
      `cat > "$TMP" && ` +
      `sqlite3 -batch -bail "$D" "` +
      this.schemaSql() +
      `CREATE TEMP TABLE __branchboard_import(payload TEXT NOT NULL); ` +
      `INSERT INTO __branchboard_import(payload) VALUES (json(CAST(readfile('$TMP') AS TEXT))); ` +
      `BEGIN IMMEDIATE; ` +
      `DELETE FROM board_announcements; ` +
      `DELETE FROM board_notifications; ` +
      `DELETE FROM board_deployments; ` +
      `DELETE FROM board_events; ` +
      `DELETE FROM board_tasks; ` +
      `DELETE FROM board_users; ` +
      `DELETE FROM board_columns; ` +
      `DELETE FROM board_meta; ` +
      `INSERT INTO board_meta(id, version, project_name, board_title, updated_at) ` +
      `SELECT 1, COALESCE(json_extract(payload, '$.version'), 1), ` +
      `COALESCE(json_extract(payload, '$.projectName'), ''), ` +
      `COALESCE(json_extract(payload, '$.boardTitle'), ''), '${updatedAt}' ` +
      `FROM __branchboard_import; ` +
      `INSERT INTO board_columns(id, sort_order, name, position, git_stage, data, updated_at) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'column-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.name'), ''), COALESCE(json_extract(e.value, '$.position'), CAST(e.key AS INTEGER)), ` +
      `json_extract(e.value, '$.gitStage'), json(e.value), '${updatedAt}' ` +
      `FROM __branchboard_import, json_each(payload, '$.columns') AS e; ` +
      `INSERT INTO board_users(id, sort_order, name, email, data, updated_at) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'user-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.name'), ''), COALESCE(json_extract(e.value, '$.email'), ''), ` +
      `json(e.value), '${updatedAt}' ` +
      `FROM __branchboard_import, json_each(payload, '$.users') AS e; ` +
      `INSERT INTO board_tasks(` +
      `id, sort_order, title, column_id, position, assigned_user_id, branch_name, status, priority, task_type, ` +
      `created_at, updated_at, finished_at, data` +
      `) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'task-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.title'), ''), COALESCE(json_extract(e.value, '$.columnId'), ''), ` +
      `COALESCE(json_extract(e.value, '$.position'), CAST(e.key AS INTEGER)), ` +
      `json_extract(e.value, '$.assignedUserId'), COALESCE(json_extract(e.value, '$.branchName'), ''), ` +
      `COALESCE(json_extract(e.value, '$.status'), 'open'), COALESCE(json_extract(e.value, '$.priority'), 'none'), ` +
      `json_extract(e.value, '$.taskType'), COALESCE(json_extract(e.value, '$.createdAt'), ''), ` +
      `COALESCE(json_extract(e.value, '$.updatedAt'), ''), json_extract(e.value, '$.finishedAt'), json(e.value) ` +
      `FROM __branchboard_import, json_each(payload, '$.tasks') AS e; ` +
      `INSERT INTO board_events(id, sort_order, type, task_id, branch_name, user_id, created_at, data) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'event-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.type'), ''), json_extract(e.value, '$.taskId'), ` +
      `json_extract(e.value, '$.branchName'), json_extract(e.value, '$.userId'), ` +
      `COALESCE(json_extract(e.value, '$.createdAt'), ''), json(e.value) ` +
      `FROM __branchboard_import, json_each(payload, '$.events') AS e; ` +
      `INSERT INTO board_deployments(id, sort_order, task_id, branch_name, environment, status, deployed_at, data) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'deployment-' || e.key), CAST(e.key AS INTEGER), ` +
      `json_extract(e.value, '$.taskId'), COALESCE(json_extract(e.value, '$.branchName'), ''), ` +
      `COALESCE(json_extract(e.value, '$.environment'), ''), COALESCE(json_extract(e.value, '$.status'), ''), ` +
      `json_extract(e.value, '$.deployedAt'), json(e.value) ` +
      `FROM __branchboard_import, json_each(payload, '$.deployments') AS e; ` +
      `INSERT INTO board_notifications(id, sort_order, type, task_id, actor_user_id, branch_name, created_at, data) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'notification-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.type'), ''), json_extract(e.value, '$.taskId'), ` +
      `json_extract(e.value, '$.actorUserId'), json_extract(e.value, '$.branchName'), ` +
      `COALESCE(json_extract(e.value, '$.createdAt'), ''), json(e.value) ` +
      `FROM __branchboard_import, json_each(payload, '$.notifications') AS e; ` +
      `INSERT INTO board_announcements(id, sort_order, severity, active, created_at, updated_at, data) ` +
      `SELECT COALESCE(json_extract(e.value, '$.id'), 'announcement-' || e.key), CAST(e.key AS INTEGER), ` +
      `COALESCE(json_extract(e.value, '$.severity'), 'info'), ` +
      `CASE WHEN COALESCE(json_extract(e.value, '$.active'), 1) THEN 1 ELSE 0 END, ` +
      `COALESCE(json_extract(e.value, '$.createdAt'), ''), COALESCE(json_extract(e.value, '$.updatedAt'), ''), json(e.value) ` +
      `FROM __branchboard_import, json_each(payload, '$.announcements') AS e; ` +
      `COMMIT;"`;

    await this.exec(cmd, json);
    this.lastSerialized = this.normalize(json);
    this.lastLoadedUpdatedAt = updatedAt;
    this.lastSnapshot = this.createSnapshot(board);
  }

  private async appendHistory(json: string, updatedAt: string): Promise<void> {
    const db = this.dbExpr();
    const safeUpdatedAt = /^[0-9T:.\-Z+]+$/.test(updatedAt) ? updatedAt : new Date().toISOString();
    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `TMP="$D.history.json"; trap 'rm -f "$TMP"' EXIT; ` +
      `cat > "$TMP" && ` +
      `sqlite3 -batch -bail "$D" "` +
      `CREATE TABLE IF NOT EXISTS board_history(hid INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, updated_at TEXT, archived_at TEXT); ` +
      `INSERT INTO board_history(data, updated_at, archived_at) VALUES (CAST(readfile('$TMP') AS TEXT), '${safeUpdatedAt}', datetime('now')); ` +
      `DELETE FROM board_history WHERE hid NOT IN (SELECT hid FROM board_history ORDER BY hid DESC LIMIT 50);"`;
    await this.exec(cmd, json);
  }

  /** Re-read the server board and push it to listeners (external-change path). */
  private async reloadAndNotify(): Promise<void> {
    try {
      const current = await this.readCanonicalJson();
      if (!current.json) {
        return;
      }
      const board = current.source === "relational" ? await this.readRelationalBoard() : (JSON.parse(current.json) as BoardData);
      this.lastSerialized = this.normalize(current.json);
      this.lastLoadedUpdatedAt = current.updatedAt || null;
      this.lastSnapshot = this.createSnapshot(board);
      for (const l of this.listeners) {
        l(board);
      }
    } catch (err: any) {
      Logger.error(`reloadAndNotify failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Probe the connection end-to-end and return a step-by-step report. Used by the
   * settings "Test connection" button; logs every step to the output channel.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const mode = this.local ? "local" : "ssh";
    const target = this.target();
    Logger.info(`Testing connection: mode=${mode}, target=${target}`);
    const steps: ConnectionStep[] = [];
    const run = async (name: string, command: string, check?: (out: string) => boolean) => {
      try {
        const out = await this.exec(command);
        const ok = check ? check(out) : true;
        steps.push({ name, ok, detail: Logger.trunc(out.trim() || "(empty)", 200) });
        return ok;
      } catch (err: any) {
        steps.push({ name, ok: false, detail: Logger.trunc(err?.message ?? String(err), 300) });
        return false;
      }
    };

    // 1. Transport reachable (SSH login or local shell).
    const transport = await run(
      this.local ? "Local shell" : "SSH transport",
      "echo branchboard-ok",
      (o) => o.includes("branchboard-ok")
    );
    if (!transport) {
      Logger.error("Connection test: transport failed.");
      return { ok: false, mode, target, steps };
    }

    // 2. sqlite3 available on the target.
    await run("sqlite3 available", "sqlite3 --version || command -v sqlite3");

    // 3. SQLite JSON functions are required for lossless import into tables.
    await run("sqlite JSON functions", `sqlite3 :memory: "SELECT json_extract(char(123,34,111,107,34,58,116,114,117,101,125), '$.ok');"`, (o) => {
      const trimmed = o.trim();
      return trimmed === "1" || trimmed.toLowerCase() === "true";
    });

    // 4. Database reachable + relational board summary.
    const db = this.dbExpr();
    await run(
      "Database + relational board",
      `D=${db}; sqlite3 -batch -bail "$D" "${this.schemaSql()} ` +
        `SELECT 'meta=' || (SELECT count(*) FROM board_meta WHERE id=1) || ` +
        `' tasks=' || (SELECT count(*) FROM board_tasks) || ` +
        `' users=' || (SELECT count(*) FROM board_users) || ` +
        `' columns=' || (SELECT count(*) FROM board_columns) || ` +
        `' legacy_rows=' || (SELECT count(*) FROM board WHERE id=1) || ` +
        `' updated=' || COALESCE((SELECT updated_at FROM board_meta WHERE id=1),(SELECT updated_at FROM board WHERE id=1),'-');"`
    );

    const ok = steps.every((s) => s.ok);
    Logger.info(`Connection test ${ok ? "PASSED" : "FAILED"} for ${target}.`);
    return { ok, mode, target, steps };
  }

  onExternalChange(listener: (board: BoardData) => void): () => void {
    // External changes are detected by the extension's periodic poll + manual
    // refresh, both of which call load(). Listeners kept for API symmetry.
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  dispose(): void {
    this.listeners = [];
  }
}

/** Backwards-compatible alias (file name kept as ServerStorageProvider.ts). */
export { SshSqliteStorageProvider as ServerStorageProvider };
