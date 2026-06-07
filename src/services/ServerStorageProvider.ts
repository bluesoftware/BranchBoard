import { execFile } from "child_process";
import { BoardData } from "../types";
import { StorageProvider, createDefaultBoard } from "./StorageProvider";
import { Logger } from "./Logger";

export interface ConnectionStep {
  name: string;
  ok: boolean;
  detail: string;
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
      `sqlite3 "$D" "CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT);"`;
    await this.exec(cmd);
  }

  /* ---------------- StorageProvider ---------------- */

  async load(): Promise<BoardData> {
    Logger.info(`Loading board from ${this.target()}.`);
    await this.ensureSchema();
    const db = this.dbExpr();
    const out = await this.exec(`D=${db}; sqlite3 -batch -noheader "$D" "SELECT data FROM board WHERE id=1;"`);
    const text = out.trim();
    if (!text) {
      Logger.warn("No board row (id=1) in the database — creating a default board there.");
      const def = createDefaultBoard(this.opts.projectName, this.opts.boardTitle, this.opts.seedUsers);
      await this.save(def);
      return def;
    }
    Logger.info(`Loaded board row (${text.length} chars) from ${this.target()}.`);
    try {
      const board = JSON.parse(text) as BoardData;
      this.lastSerialized = JSON.stringify(board);
      return board;
    } catch (err: any) {
      throw new Error(`${this.target()} returned invalid board JSON: ${err?.message ?? err}`);
    }
  }

  async save(board: BoardData): Promise<void> {
    board.updatedAt = new Date().toISOString();
    const json = JSON.stringify(board); // compact, single line
    const b64 = Buffer.from(json, "utf8").toString("base64");
    const db = this.dbExpr();

    // Decode the JSON into a temp file on the target side, then load it into the
    // board row via sqlite3's readfile(). base64 is single-quote safe.
    const cmd =
      `D=${db}; mkdir -p "$(dirname "$D")" && ` +
      `printf %s '${b64}' | base64 -d > "$D.tmp.json" && ` +
      `sqlite3 "$D" "CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY, data TEXT, updated_at TEXT); ` +
      `INSERT OR REPLACE INTO board(id, data, updated_at) VALUES (1, readfile('$D.tmp.json'), datetime('now'));" && ` +
      `rm -f "$D.tmp.json"`;

    await this.exec(cmd);
    this.lastSerialized = JSON.stringify(board);
    Logger.info(`Saved board (${json.length} chars) to ${this.target()}.`);
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
