import { execFile } from "child_process";
import { BoardTask, BranchBoardConfig, GitInfo, OperationResult } from "../types";

interface GitExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Thin, safe wrapper around the `git` CLI. All commands:
 *  - run with execFile (no shell), so task data can never be injected;
 *  - run inside the workspace folder (cwd);
 *  - return structured results instead of throwing for "expected" git errors.
 *
 * GitHub CLI is never assumed. Everything works against a plain remote.
 */
export class GitService {
  constructor(
    private readonly cwd: string,
    private readonly getConfig: () => BranchBoardConfig
  ) {}

  /* ---------------- low level ---------------- */

  private run(args: string[]): Promise<GitExecResult> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const e = new Error(stderr?.trim() || err.message);
          (e as any).stdout = stdout;
          (e as any).stderr = stderr;
          reject(e);
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });
  }

  /** Validate a branch name with git's own checker; rejects unsafe input. */
  private async assertValidBranchName(name: string): Promise<void> {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      throw new Error("Branch name is empty.");
    }
    if (trimmed.startsWith("-")) {
      throw new Error(`Invalid branch name: ${trimmed}`);
    }
    try {
      await this.run(["check-ref-format", "--branch", trimmed]);
    } catch {
      throw new Error(`Invalid branch name: ${trimmed}`);
    }
  }

  /* ---------------- reads ---------------- */

  async isRepo(): Promise<boolean> {
    try {
      const { stdout } = await this.run(["rev-parse", "--is-inside-work-tree"]);
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string | null> {
    try {
      const { stdout } = await this.run(["rev-parse", "--abbrev-ref", "HEAD"]);
      const branch = stdout.trim();
      return branch === "HEAD" ? null : branch; // detached HEAD
    } catch {
      return null;
    }
  }

  /**
   * Resolve the main branch: configured value if it exists, otherwise probe
   * common candidates (main, master) and origin/HEAD.
   */
  async getMainBranch(): Promise<string> {
    const configured = this.getConfig().defaultMainBranch || "main";
    const candidates = [configured, "main", "master"];
    for (const c of candidates) {
      try {
        await this.run(["rev-parse", "--verify", c]);
        return c;
      } catch {
        /* try next */
      }
    }
    return configured;
  }

  async getGitUser(): Promise<{ name: string | null; email: string | null }> {
    const read = async (key: string): Promise<string | null> => {
      try {
        const { stdout } = await this.run(["config", "--get", key]);
        return stdout.trim() || null;
      } catch {
        return null;
      }
    };
    return { name: await read("user.name"), email: await read("user.email") };
  }

  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const { stdout } = await this.run(["status", "--porcelain"]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<GitInfo> {
    const cfg = this.getConfig();
    const base: GitInfo = {
      isRepo: false,
      currentBranch: null,
      mainBranch: cfg.defaultMainBranch || "main",
      remoteName: cfg.remoteName || "origin",
      userName: null,
      userEmail: null,
      hasUncommittedChanges: false,
    };
    try {
      base.isRepo = await this.isRepo();
      if (!base.isRepo) {
        base.error = "No Git repository found in this workspace.";
        return base;
      }
      base.currentBranch = await this.getCurrentBranch();
      base.mainBranch = await this.getMainBranch();
      const user = await this.getGitUser();
      base.userName = user.name;
      base.userEmail = user.email;
      base.hasUncommittedChanges = await this.hasUncommittedChanges();
    } catch (err: any) {
      base.error = err?.message ?? String(err);
    }
    return base;
  }

  /* ---------------- writes ---------------- */

  async branchExists(name: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", name]);
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      if (await this.branchExists(branchName)) {
        // Already there: just check it out.
        await this.run(["checkout", branchName]);
        return { ok: true, action: "createBranch", message: `Branch '${branchName}' already existed — checked it out.` };
      }
      await this.run(["checkout", "-b", branchName]);
      return { ok: true, action: "createBranch", message: `Created and switched to '${branchName}'.` };
    } catch (err: any) {
      return { ok: false, action: "createBranch", message: `Could not create branch '${branchName}'.`, detail: err?.message };
    }
  }

  async checkoutBranch(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      if (!(await this.branchExists(branchName))) {
        return {
          ok: false,
          action: "checkoutBranch",
          message: `Branch '${branchName}' does not exist. Create it first.`,
        };
      }
      await this.run(["checkout", branchName]);
      return { ok: true, action: "checkoutBranch", message: `Switched to '${branchName}'.` };
    } catch (err: any) {
      return { ok: false, action: "checkoutBranch", message: `Could not switch to '${branchName}'.`, detail: err?.message };
    }
  }

  async pushBranch(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      const remote = this.getConfig().remoteName || "origin";
      await this.run(["push", "-u", remote, branchName]);
      return { ok: true, action: "pushBranch", message: `Pushed '${branchName}' to ${remote}.` };
    } catch (err: any) {
      return { ok: false, action: "pushBranch", message: `Push failed for '${branchName}'.`, detail: err?.message };
    }
  }

  async pullMain(): Promise<OperationResult> {
    try {
      const remote = this.getConfig().remoteName || "origin";
      const main = await this.getMainBranch();
      await this.run(["pull", remote, main]);
      return { ok: true, action: "pullMain", message: `Pulled ${remote}/${main}.` };
    } catch (err: any) {
      return { ok: false, action: "pullMain", message: "Pull failed.", detail: err?.message };
    }
  }

  /** Merge branchName into main (assumes main is already checked out). */
  async mergeBranchToMain(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      const main = await this.getMainBranch();
      const { stdout } = await this.run(["merge", "--no-ff", branchName, "-m", `Merge ${branchName} into ${main}`]);
      return { ok: true, action: "mergeBranchToMain", message: `Merged '${branchName}' into ${main}.`, detail: stdout.trim() };
    } catch (err: any) {
      // Likely a conflict. Abort the half-done merge so the tree stays clean.
      try {
        await this.run(["merge", "--abort"]);
      } catch {
        /* nothing to abort */
      }
      return {
        ok: false,
        action: "mergeBranchToMain",
        message: `Merge of '${branchName}' failed (conflict or error). Merge aborted.`,
        detail: err?.message,
      };
    }
  }

  async deleteLocalBranch(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      await this.run(["branch", "-d", branchName]);
      return { ok: true, action: "deleteLocalBranch", message: `Deleted local branch '${branchName}'.` };
    } catch (err: any) {
      return { ok: false, action: "deleteLocalBranch", message: `Could not delete local branch '${branchName}'.`, detail: err?.message };
    }
  }

  async deleteRemoteBranch(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      const remote = this.getConfig().remoteName || "origin";
      await this.run(["push", remote, "--delete", branchName]);
      return { ok: true, action: "deleteRemoteBranch", message: `Deleted remote branch '${remote}/${branchName}'.` };
    } catch (err: any) {
      return { ok: false, action: "deleteRemoteBranch", message: `Could not delete remote branch '${branchName}'.`, detail: err?.message };
    }
  }

  /** Run a configured pre-finish command (e.g. "npm run build"). */
  async runCommand(command: string): Promise<OperationResult> {
    const cmd = (command || "").trim();
    if (!cmd) {
      return { ok: true, action: "runCommand", message: "No pre-finish command configured." };
    }
    return new Promise((resolve) => {
      // Split safely: program + args, no shell metacharacters honoured.
      const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, "")) ?? [];
      const program = parts.shift();
      if (!program) {
        resolve({ ok: false, action: "runCommand", message: "Invalid pre-finish command." });
        return;
      }
      execFile(program, parts, { cwd: this.cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, shell: process.platform === "win32" }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, action: "runCommand", message: `Command '${cmd}' failed.`, detail: (stderr || err.message).toString() });
        } else {
          resolve({ ok: true, action: "runCommand", message: `Command '${cmd}' succeeded.`, detail: stdout.toString().trim() });
        }
      });
    });
  }
}

/* ---------------- Finish-task flow ---------------- */

export interface FinishCallbacks {
  /** Ask the user a yes/no question; resolve true to proceed. */
  confirm: (message: string, detail?: string) => Promise<boolean>;
  /** Report progress / informational messages. */
  info: (message: string) => void;
}

export interface FinishResult extends OperationResult {
  /** Where the task should be moved to, if anywhere. */
  moveToColumnId?: "review" | "done";
  /** Whether the task should be marked done. */
  markDone?: boolean;
}

/**
 * Safe "finish task" flow. Never merges or deletes without confirmation, never
 * marks done if a git step failed.
 */
export async function finishTaskGitFlow(
  git: GitService,
  config: BranchBoardConfig,
  task: BoardTask,
  cb: FinishCallbacks
): Promise<FinishResult> {
  const branch = (task.branchName || "").trim();
  if (!branch) {
    return { ok: false, action: "finishTask", message: "This task has no branch name. Add one first." };
  }

  // 1. Working tree must be clean (if required).
  if (config.requireCleanWorkingTreeBeforeFinish && (await git.hasUncommittedChanges())) {
    return {
      ok: false,
      action: "finishTask",
      message: "You have uncommitted changes. Commit or stash them before finishing the task.",
    };
  }

  // 2. Make sure we're on the task branch.
  const current = await git.getCurrentBranch();
  if (current !== branch) {
    const checkout = await git.checkoutBranch(branch);
    if (!checkout.ok) {
      return { ok: false, action: "finishTask", message: checkout.message, detail: checkout.detail };
    }
  }

  // 3. Optional pre-finish command.
  if (config.runCommandBeforeFinish && config.runCommandBeforeFinish.trim()) {
    cb.info(`Running: ${config.runCommandBeforeFinish}`);
    const res = await git.runCommand(config.runCommandBeforeFinish);
    if (!res.ok) {
      return { ok: false, action: "finishTask", message: res.message, detail: res.detail };
    }
  }

  // 4. Push the task branch.
  const push = await git.pushBranch(branch);
  if (!push.ok) {
    return { ok: false, action: "finishTask", message: push.message, detail: push.detail };
  }
  cb.info(push.message);

  // 5. Branch on direct-merge policy.
  if (!config.allowDirectMergeToMain) {
    return {
      ok: true,
      action: "finishTask",
      message: `Pushed '${branch}'. Direct merge to main is disabled — task moved for review.`,
      moveToColumnId: "review",
    };
  }

  // Direct merge IS allowed -> require explicit confirmation.
  const main = await git.getMainBranch();
  if (config.requireConfirmationBeforeMerge) {
    const ok = await cb.confirm(
      `Merge '${branch}' into '${main}' and push?`,
      "This checks out main, pulls, merges, and pushes. The task branch will be merged into main."
    );
    if (!ok) {
      return {
        ok: true,
        action: "finishTask",
        message: "Merge cancelled. Branch was pushed; task moved for review.",
        moveToColumnId: "review",
      };
    }
  }

  // 6. Checkout main, pull, merge, push.
  const checkoutMain = await git.checkoutBranch(main);
  if (!checkoutMain.ok) {
    return { ok: false, action: "finishTask", message: checkoutMain.message, detail: checkoutMain.detail };
  }
  const pull = await git.pullMain();
  if (!pull.ok) {
    return { ok: false, action: "finishTask", message: pull.message, detail: pull.detail };
  }
  const merge = await git.mergeBranchToMain(branch);
  if (!merge.ok) {
    // Conflict already aborted inside mergeBranchToMain. Do NOT delete branch.
    return { ok: false, action: "finishTask", message: merge.message, detail: merge.detail };
  }
  cb.info(merge.message);

  const pushMain = await git.pushBranch(main);
  if (!pushMain.ok) {
    return {
      ok: false,
      action: "finishTask",
      message: `Merged locally but failed to push ${main}. Resolve manually; task not closed.`,
      detail: pushMain.detail,
    };
  }

  // 7. Optional branch cleanup (only after a fully successful merge+push).
  if (config.deleteLocalBranchAfterMerge) {
    const del = await git.deleteLocalBranch(branch);
    cb.info(del.message);
  }
  if (config.deleteRemoteBranchAfterMerge) {
    const del = await git.deleteRemoteBranch(branch);
    cb.info(del.message);
  }

  return {
    ok: true,
    action: "finishTask",
    message: `Task finished: '${branch}' merged into ${main}.`,
    moveToColumnId: "done",
    markDone: true,
  };
}
