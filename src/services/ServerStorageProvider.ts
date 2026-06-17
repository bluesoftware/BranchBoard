import { execFile } from "child_process";
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
 * Storage layout: one row holding the whole board as JSON:
 *   CREATE TABLE board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT);
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
  private exec(shellCommand: string): Promise<string> {
    const file = this.local ? "sh" : "ssh";
    const args = this.local ? ["-c", shellCommand] : this.sshArgs(shellCommand);
    const label = this.local ? "local sh" : `ssh ${this.opts.host}`;
    const started = Date.now();
    Logger.debug(`exec[${label}]: ${Logger.trunc(shellCommand, 300)}`);
    return new Promise((resolve, reject) => {
      execFile(file, args, { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
        const ms = Date.now() - started;
        if (err) {
          const detail = (stderr || err.message).toString().trim();
          Logger.error(`exec[${label}] failed in ${ms}ms: ${Logger.trunc(detail)}`);
          reject(new Error(detail));
          return;
        }
        Logger.debug(`exec[${label}] ok in ${ms}ms (${stdout.length} bytes)`);
        resolve(stdout.toString());
      });
    });
  }

  /** dbPath is validated to a safe charset; tilde/$(...) handled by the shell. */
  private dbExpr(): string {
    return this.opts.dbPath;
  }

  private async ensureSchema(): Promise<void> {
    const db = this.dbExpr();
    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `sqlite3 "$D" "CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT); ` +
      `CREATE TABLE IF NOT EXISTS board_history(hid INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, updated_at TEXT, archived_at TEXT);"`;
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

  /** Full JSON of the board row (empty string when absent). */
  private async readData(): Promise<string> {
    const db = this.dbExpr();
    const out = await this.exec(`D=${db}; sqlite3 -batch -noheader "$D" "SELECT data FROM board WHERE id=1;"`);
    return out.trim();
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
      const board = JSON.parse(text) as BoardData;
      // Remember a CANONICAL form of what we last saw; used for content-based
      // conflict detection (reliable across read/write representations).
      this.lastSerialized = this.normalize(text);
      this.lastLoadedUpdatedAt = meta.updatedAt || null;
      Logger.info(`Loaded board row (${text.length} chars, updated ${meta.updatedAt || "?"}) from ${this.target()}.`);
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
    const serverText = await this.readData();
    const hasServerData = serverText !== "";

    if (hasServerData) {
      // Guard 1 — content-based conflict detection: only block when the data on
      // the server actually differs from what we last loaded/saved. This does
      // NOT depend on timestamp formats, so it never false-positives on a
      // single user editing their own board.
      if (this.lastSerialized && this.normalize(serverText) !== this.lastSerialized) {
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
        const remoteTasks = this.countTasks(serverText);
        if (remoteTasks !== 0) {
          throw new Error(
            `Refusing to overwrite the server board (${remoteTasks < 0 ? "has data" : remoteTasks + " task(s)"}) ` +
              `with an empty board (0 tasks). The SQLite file on the server is the source of truth. ` +
              `To intentionally reset it, enable branchBoard.serverAllowEmptyOverwrite.`
          );
        }
      }
    }

    await this.writeRow(board, { backup: hasServerData });
    Logger.info(`Saved board (${incomingTasks} task(s)) to ${this.target()}.`);
  }

  /**
   * Write the board into row id=1. When `backup` is true, the current row is
   * first copied into board_history (capped at 50 entries) — all inside one
   * IMMEDIATE transaction so a failure can never leave a half-written row.
   */
  private async writeRow(board: BoardData, opts: { backup: boolean }): Promise<void> {
    const updatedAt = new Date().toISOString(); // safe charset: [0-9T:.Z-]
    board.updatedAt = updatedAt;
    const json = JSON.stringify(board);
    const b64 = Buffer.from(json, "utf8").toString("base64");
    const db = this.dbExpr();

    const backupSql = opts.backup
      ? `INSERT INTO board_history(data, updated_at, archived_at) SELECT data, updated_at, datetime('now') FROM board WHERE id=1; ` +
        `DELETE FROM board_history WHERE hid NOT IN (SELECT hid FROM board_history ORDER BY hid DESC LIMIT 50); `
      : "";

    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `printf %s '${b64}' | base64 -d > "$D.tmp.json" && ` +
      `sqlite3 "$D" "` +
      `CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT); ` +
      `CREATE TABLE IF NOT EXISTS board_history(hid INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, updated_at TEXT, archived_at TEXT); ` +
      `BEGIN IMMEDIATE; ` +
      backupSql +
      `INSERT OR REPLACE INTO board(id, data, updated_at) VALUES (1, readfile('$D.tmp.json'), '${updatedAt}'); ` +
      `COMMIT;" && ` +
      `rm -f "$D.tmp.json"`;

    await this.exec(cmd);
    this.lastSerialized = json;
    this.lastLoadedUpdatedAt = updatedAt;
  }

  /** Re-read the server board and push it to listeners (external-change path). */
  private async reloadAndNotify(): Promise<void> {
    try {
      const text = await this.readData();
      if (!text) {
        return;
      }
      const board = JSON.parse(text) as BoardData;
      const meta = await this.readMeta();
      this.lastSerialized = this.normalize(text);
      this.lastLoadedUpdatedAt = meta.updatedAt || null;
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

    // 3. Database reachable + board row count + size.
    const db = this.dbExpr();
    await run(
      "Database + board row",
      `D=${db}; sqlite3 "$D" "CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT); ` +
        `SELECT 'rows=' || count(*) || ' bytes=' || COALESCE(length(data),0) || ' updated=' || COALESCE(updated_at,'-') FROM board WHERE id=1;"`
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
