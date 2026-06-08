import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { BranchBoardConfig, ColumnHook, ColumnHookResult } from "../types";

/** Values available for {{token}} substitution inside hook arguments. */
export interface HookContext {
  branch: string;
  taskId: string;
  taskTitle: string;
  slug: string;
  baseBranch: string;
  targetBranch: string;
  mainBranch: string;
  columnId: string;
  columnName: string;
  user: string;
}

export interface RunHooksOptions {
  /** Ask the user to confirm a single hook. Resolve true to proceed. */
  confirm: (hook: ColumnHook, previewCommand: string) => Promise<boolean>;
  /** Returns true when the working tree has no uncommitted changes. */
  isWorkingTreeClean: () => Promise<boolean>;
  /** Optional sink for live log lines (e.g. an Output channel). */
  onLog?: (line: string) => void;
}

export interface RunHooksOutcome {
  results: ColumnHookResult[];
  /** True if a blocking hook failed / was refused — caller should revert. */
  blocked: boolean;
}

/**
 * Runs column command hooks with strict safety guarantees:
 *  - the binary must be on the configured allowlist;
 *  - commands run via execFile with NO shell (shell:false), so neither the
 *    command nor task-derived arguments can ever be interpreted by a shell;
 *  - every argument is a separate token (no string concatenation);
 *  - a hard per-hook timeout kills runaway processes;
 *  - all runs are appended to .branchboard/audit.log.
 *
 * The service never touches git itself; merge/branch operations stay in
 * GitService. Hooks are arbitrary build/test/lint style commands.
 */
export class CommandRunnerService {
  constructor(
    private readonly cwd: string,
    private readonly getConfig: () => BranchBoardConfig
  ) {}

  /** Tokens that look like shell metacharacters are rejected outright. */
  private static readonly UNSAFE_COMMAND = /[\\/]|\.\.|[\s;&|<>$`(){}\[\]'"]/;

  /** A command is allowed only if it is a bare binary name on the allowlist. */
  isAllowed(command: string): boolean {
    const cmd = (command || "").trim();
    if (!cmd || CommandRunnerService.UNSAFE_COMMAND.test(cmd)) {
      return false;
    }
    const allow = this.getConfig().allowedCommands || [];
    return allow.map((a) => a.trim()).includes(cmd);
  }

  /** Replace {{token}} occurrences inside a single argument string. */
  private substitute(arg: string, ctx: HookContext): string {
    return arg.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
      const map: Record<string, string> = {
        branch: ctx.branch,
        taskId: ctx.taskId,
        taskTitle: ctx.taskTitle,
        slug: ctx.slug,
        baseBranch: ctx.baseBranch,
        targetBranch: ctx.targetBranch,
        mainBranch: ctx.mainBranch,
        columnId: ctx.columnId,
        columnName: ctx.columnName,
        user: ctx.user,
      };
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole;
    });
  }

  private audit(line: string): void {
    try {
      const dir = path.join(this.cwd, ".branchboard");
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, "audit.log"),
        `${new Date().toISOString()} ${line}\n`,
        "utf8"
      );
    } catch {
      /* auditing must never break the flow */
    }
  }

  private exec(
    command: string,
    args: string[],
    timeoutSec: number
  ): Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          cwd: this.cwd,
          shell: false,
          windowsHide: true,
          timeout: Math.max(1, timeoutSec) * 1000,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env,
        },
        (err, stdout, stderr) => {
          const out = (stdout ?? "").toString();
          const errOut = (stderr ?? "").toString();
          if (err) {
            const code = typeof (err as any).code === "number" ? (err as any).code : null;
            resolve({ ok: false, code, stdout: out, stderr: errOut || err.message });
          } else {
            resolve({ ok: true, code: 0, stdout: out, stderr: errOut });
          }
        }
      );
    });
  }

  /** Run a single hook, applying allowlist + clean-tree gating. */
  async runHook(
    hook: ColumnHook,
    ctx: HookContext,
    opts: RunHooksOptions
  ): Promise<ColumnHookResult> {
    const args = (hook.args || []).map((a) => this.substitute(a, ctx));
    const preview = `${hook.command} ${args.join(" ")}`.trim();
    const base: ColumnHookResult = {
      hookId: hook.id,
      label: hook.label || preview,
      command: hook.command,
      args,
      ok: false,
      skipped: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      message: "",
    };

    if (!hook.enabled) {
      return { ...base, skipped: true, ok: true, message: "Disabled — skipped." };
    }

    if (!this.getConfig().enableColumnHooks) {
      return { ...base, skipped: true, ok: true, message: "Column hooks disabled in settings." };
    }

    if (!this.isAllowed(hook.command)) {
      const message = `Command '${hook.command}' is not on the allowlist (branchBoard.allowedCommands).`;
      this.audit(`BLOCKED not-allowed cmd="${preview}" user=${ctx.user}`);
      return { ...base, message };
    }

    if (hook.requireConfirm) {
      const proceed = await opts.confirm(hook, preview);
      if (!proceed) {
        this.audit(`SKIPPED declined cmd="${preview}" user=${ctx.user}`);
        return { ...base, skipped: true, message: "Declined by user." };
      }
    }

    if (hook.requireCleanTree) {
      const clean = await opts.isWorkingTreeClean();
      if (!clean) {
        const message = "Working tree is not clean — commit or stash first.";
        this.audit(`BLOCKED dirty-tree cmd="${preview}" user=${ctx.user}`);
        return { ...base, message };
      }
    }

    const timeoutSec = hook.timeoutSec > 0 ? hook.timeoutSec : this.getConfig().hookTimeoutSeconds;
    opts.onLog?.(`> ${hook.label || preview}: ${preview}`);
    const started = Date.now();
    const r = await this.exec(hook.command, args, timeoutSec);
    const durationMs = Date.now() - started;
    if (r.stdout) {
      opts.onLog?.(r.stdout.trimEnd());
    }
    if (r.stderr) {
      opts.onLog?.(r.stderr.trimEnd());
    }
    opts.onLog?.(r.ok ? `[ok] done (${durationMs}ms)` : `[fail] exit ${r.code}`);
    this.audit(
      `${r.ok ? "OK" : "FAIL"} exit=${r.code} dur=${durationMs}ms cmd="${preview}" user=${ctx.user} col=${ctx.columnName}`
    );

    return {
      ...base,
      ok: r.ok,
      exitCode: r.code,
      durationMs,
      stdout: r.stdout,
      stderr: r.stderr,
      message: r.ok ? `Completed in ${durationMs}ms.` : `Failed (exit ${r.code}).`,
    };
  }

  /**
   * Run a chain of hooks sequentially. A failed/refused hook flagged
   * `blocking` stops the chain and marks the outcome blocked (the caller
   * should revert the move). Non-blocking failures continue when
   * `continueOnError` is true.
   */
  async runHooks(
    hooks: ColumnHook[] | undefined,
    ctx: HookContext,
    opts: RunHooksOptions
  ): Promise<RunHooksOutcome> {
    const results: ColumnHookResult[] = [];
    if (!hooks || hooks.length === 0) {
      return { results, blocked: false };
    }
    for (const hook of hooks) {
      const res = await this.runHook(hook, ctx, opts);
      results.push(res);
      const failed = !res.ok && !res.skipped;
      if (failed && hook.blocking) {
        return { results, blocked: true };
      }
      if (failed && !hook.continueOnError) {
        // Non-blocking but stops the rest of the chain.
        break;
      }
    }
    return { results, blocked: false };
  }
}
