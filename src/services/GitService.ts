import { execFile } from "child_process";
import { BoardTask, BranchBoardConfig, GitInfo, OperationResult } from "../types";
import { SafetyService } from "./SafetyService";

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

  /**
   * Build the environment for git, injecting GIT_SSH_COMMAND when a specific
   * SSH key is configured so pushes/pulls use that key (and only that key).
   */
  private buildEnv(): NodeJS.ProcessEnv {
    const key = (this.getConfig().sshKeyPath || "").trim();
    if (!key) {
      return process.env;
    }
    // Quote the path so spaces are handled; IdentitiesOnly avoids the agent
    // offering other keys first.
    const sshCmd = `ssh -i "${key}" -o IdentitiesOnly=yes`;
    return { ...process.env, GIT_SSH_COMMAND: sshCmd };
  }

  private run(args: string[]): Promise<GitExecResult> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: this.buildEnv() }, (err, stdout, stderr) => {
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

  /** Unique commit authors across all branches: used to seed board users. */
  async getContributors(): Promise<Array<{ name: string; email: string }>> {
    try {
      const { stdout } = await this.run(["log", "--all", "--format=%an%x09%ae"]);
      const seen = new Set<string>();
      const out: Array<{ name: string; email: string }> = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [name, email] = line.split("\t");
        const key = (email || name || "").toLowerCase().trim();
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push({ name: (name || "").trim(), email: (email || "").trim() });
      }
      return out;
    } catch {
      // Empty repo / no commits yet.
      return [];
    }
  }

  /**
   * Local branches with their last commit timestamp/subject, newest first.
   * Pure read against refs/heads — no network access.
   */
  async listLocalBranches(): Promise<
    Array<{ name: string; lastCommitAt: string | null; lastCommitMessage: string | null }>
  > {
    try {
      const { stdout } = await this.run([
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname:short)%09%(committerdate:iso-strict)%09%(contents:subject)",
        "refs/heads",
      ]);
      const out: Array<{ name: string; lastCommitAt: string | null; lastCommitMessage: string | null }> = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [name, date, ...rest] = line.split("\t");
        out.push({
          name: (name || "").trim(),
          lastCommitAt: (date || "").trim() || null,
          lastCommitMessage: rest.join("\t").trim() || null,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /** True if a remote-tracking ref exists locally (proxy for "was pushed"). */
  async hasRemoteTrackingRef(branchName: string): Promise<boolean> {
    const remote = this.getConfig().remoteName || "origin";
    try {
      await this.run(["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compare a branch against main using only local data:
   *  - ahead/behind commit counts (rev-list --left-right)
   *  - number of files changed since the merge-base (diff --name-only A...B)
   *  - last commit time/subject
   *  - whether a remote-tracking ref exists (pushed)
   * Every field degrades gracefully to a safe default on error.
   */
  async getBranchStats(
    branchName: string,
    mainBranch: string
  ): Promise<{
    existsLocal: boolean;
    existsRemote: boolean;
    ahead: number;
    behind: number;
    changedFiles: number;
    changedFilePaths: string[];
    lastCommitAt: string | null;
    lastCommitMessage: string | null;
  }> {
    const existsLocal = await this.branchExists(branchName);
    const existsRemote = await this.hasRemoteTrackingRef(branchName);

    let ahead = 0;
    let behind = 0;
    let changedFiles = 0;
    let changedFilePaths: string[] = [];
    let lastCommitAt: string | null = null;
    let lastCommitMessage: string | null = null;

    if (existsLocal) {
      try {
        const { stdout } = await this.run(["log", "-1", "--format=%cI%x09%s", branchName]);
        const [date, ...rest] = stdout.trim().split("\t");
        lastCommitAt = date || null;
        lastCommitMessage = rest.join("\t") || null;
      } catch {
        /* no commits */
      }

      const mainOk = mainBranch && (await this.branchExists(mainBranch)) && mainBranch !== branchName;
      if (mainOk) {
        try {
          // left = commits only on main (behind), right = only on branch (ahead)
          const { stdout } = await this.run([
            "rev-list",
            "--left-right",
            "--count",
            `${mainBranch}...${branchName}`,
          ]);
          const [left, right] = stdout.trim().split(/\s+/);
          behind = Number(left) || 0;
          ahead = Number(right) || 0;
        } catch {
          /* unrelated histories etc. */
        }
        try {
          const { stdout } = await this.run([
            "diff",
            "--name-only",
            `${mainBranch}...${branchName}`,
          ]);
          changedFilePaths = stdout.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 500);
          changedFiles = changedFilePaths.length;
        } catch {
          /* ignore */
        }
      }
    }

    return {
      existsLocal,
      existsRemote,
      ahead,
      behind,
      changedFiles,
      changedFilePaths,
      lastCommitAt,
      lastCommitMessage,
    };
  }

  /** Absolute working-directory path (workspace root). */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Commit DAG across all branches, newest first, with parent hashes — the raw
   * data the Branch Map graph lays out. Read-only, no network.
   */
  async getCommitGraph(limit = 200): Promise<
    Array<{ hash: string; shortHash: string; parents: string[]; author: string; date: string; subject: string }>
  > {
    try {
      // %x1f = unit separator between fields; parents are space-separated in %P.
      const { stdout } = await this.run([
        "log",
        "--all",
        "--date-order",
        `-${limit}`,
        "--pretty=%H%x1f%h%x1f%P%x1f%an%x1f%cI%x1f%s",
      ]);
      const out: Array<{ hash: string; shortHash: string; parents: string[]; author: string; date: string; subject: string }> = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [hash, shortHash, parents, author, date, ...rest] = line.split("\x1f");
        out.push({
          hash: (hash || "").trim(),
          shortHash: (shortHash || "").trim(),
          parents: (parents || "").trim() ? parents.trim().split(/\s+/) : [],
          author: (author || "").trim(),
          date: (date || "").trim(),
          subject: rest.join("\x1f").trim(),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Files changed by a single commit (vs its first parent), with line counts. */
  async getCommitFiles(hash: string): Promise<
    Array<{ path: string; status: string; additions: number; deletions: number }>
  > {
    if (!hash || !/^[0-9a-fA-F]+$/.test(hash)) {
      return [];
    }
    const statusByPath = new Map<string, string>();
    try {
      const { stdout } = await this.run(["show", "--name-status", "--format=", hash]);
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const parts = line.split("\t");
        const status = (parts[0] || "").trim();
        const path = (parts[parts.length - 1] || "").trim();
        if (path) {
          statusByPath.set(path, status.charAt(0) || "M");
        }
      }
    } catch {
      /* ignore */
    }
    const files: Array<{ path: string; status: string; additions: number; deletions: number }> = [];
    try {
      const { stdout } = await this.run(["show", "--numstat", "--format=", hash]);
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [add, del, ...rest] = line.split("\t");
        const path = rest.join("\t").trim();
        if (!path) {
          continue;
        }
        files.push({
          path,
          status: statusByPath.get(path) || "M",
          additions: add === "-" ? 0 : Number(add) || 0,
          deletions: del === "-" ? 0 : Number(del) || 0,
        });
      }
    } catch {
      /* ignore */
    }
    return files.slice(0, 500);
  }

  /** Single-commit metadata (hash/author/date/subject). */
  async getCommitMeta(hash: string): Promise<{ hash: string; shortHash: string; author: string; date: string; subject: string } | null> {
    if (!hash || !/^[0-9a-fA-F]+$/.test(hash)) {
      return null;
    }
    try {
      const { stdout } = await this.run(["log", "-1", "--format=%H%x09%h%x09%an%x09%cI%x09%s", hash]);
      const [h, sh, author, date, ...rest] = stdout.trim().split("\t");
      return { hash: h, shortHash: sh, author, date, subject: rest.join("\t") };
    } catch {
      return null;
    }
  }

  /** Map of commit hash → branch names whose tip is that commit (local + remote-tracking). */
  async getBranchTips(): Promise<Record<string, string[]>> {
    const tips: Record<string, string[]> = {};
    try {
      const { stdout } = await this.run([
        "for-each-ref",
        "--format=%(objectname)%x09%(refname:short)",
        "refs/heads",
        "refs/remotes",
      ]);
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [hash, name] = line.split("\t");
        const h = (hash || "").trim();
        const n = (name || "").trim();
        if (!h || !n || n.endsWith("/HEAD")) {
          continue;
        }
        (tips[h] = tips[h] || []).push(n);
      }
    } catch {
      /* ignore */
    }
    return tips;
  }

  /**
   * Integrate main into the current branch. "merge" fetches and merges
   * origin/main (safe — creates a merge commit). "rebase" replays commits on top
   * of origin/main (rewrites local history). Assumes a clean working tree.
   */
  async updateBranchFromMain(strategy: "merge" | "rebase"): Promise<OperationResult> {
    const remote = this.getConfig().remoteName || "origin";
    const main = await this.getMainBranch();
    try {
      await this.run(["fetch", remote, main]);
    } catch (err: any) {
      return { ok: false, action: "updateBranchFromMain", message: `Fetch of ${remote}/${main} failed.`, detail: err?.message };
    }
    try {
      if (strategy === "rebase") {
        const { stdout } = await this.run(["rebase", `${remote}/${main}`]);
        return { ok: true, action: "updateBranchFromMain", message: `Rebased onto ${remote}/${main}.`, detail: stdout.trim() };
      }
      const { stdout } = await this.run(["merge", "--no-edit", `${remote}/${main}`]);
      return { ok: true, action: "updateBranchFromMain", message: `Merged ${remote}/${main} into the current branch.`, detail: stdout.trim() };
    } catch (err: any) {
      // Abort a conflicted merge/rebase so the working tree stays clean.
      try {
        await this.run([strategy === "rebase" ? "rebase" : "merge", "--abort"]);
      } catch {
        /* nothing to abort */
      }
      return {
        ok: false,
        action: "updateBranchFromMain",
        message: `Update from ${main} failed (conflict or error). The operation was aborted.`,
        detail: err?.message,
      };
    }
  }

  /**
   * Repo files (tracked + untracked, respecting .gitignore) filtered by a
   * case-insensitive substring query. Used for the task's attach-file
   * autocomplete. Read-only, no network.
   */
  async listTrackedFiles(query = "", limit = 10): Promise<string[]> {
    try {
      const { stdout } = await this.run(["ls-files", "--cached", "--others", "--exclude-standard"]);
      const q = query.trim().toLowerCase();
      const all = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      const matched = q ? all.filter((f) => f.toLowerCase().includes(q)) : all;
      // Prefer matches where the filename (not just the path) contains the query.
      matched.sort((a, b) => {
        if (!q) {
          return a.localeCompare(b);
        }
        const aName = a.slice(a.lastIndexOf("/") + 1).toLowerCase().includes(q) ? 0 : 1;
        const bName = b.slice(b.lastIndexOf("/") + 1).toLowerCase().includes(q) ? 0 : 1;
        return aName - bName || a.length - b.length;
      });
      return matched.slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Contents of a file at a given ref (git show ref:path). Returns null when the
   * file does not exist at that ref (e.g. it was added on the branch, so it has
   * no main version, or deleted on the branch). Never throws.
   */
  async getFileAtRef(ref: string, relPath: string): Promise<string | null> {
    const path = (relPath || "").trim();
    if (!path || !ref) {
      return null;
    }
    try {
      const { stdout } = await this.run(["show", `${ref}:${path}`]);
      return stdout;
    } catch {
      return null;
    }
  }

  /**
   * Commits unique to a branch vs main (main..branch). Falls back to the
   * branch's own log when main is unavailable. Read-only, no network.
   */
  async getCommits(branchName: string, mainBranch: string, limit = 80): Promise<
    Array<{ hash: string; shortHash: string; author: string; date: string; subject: string }>
  > {
    const range =
      mainBranch && mainBranch !== branchName && (await this.branchExists(mainBranch))
        ? `${mainBranch}..${branchName}`
        : branchName;
    try {
      const { stdout } = await this.run([
        "log",
        `-${limit}`,
        "--pretty=%H%x09%h%x09%an%x09%cI%x09%s",
        range,
      ]);
      const out: Array<{ hash: string; shortHash: string; author: string; date: string; subject: string }> = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [hash, shortHash, author, date, ...rest] = line.split("\t");
        out.push({
          hash: (hash || "").trim(),
          shortHash: (shortHash || "").trim(),
          author: (author || "").trim(),
          date: (date || "").trim(),
          subject: rest.join("\t").trim(),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Files changed on a branch vs main with status and line counts
   * (diff --numstat + --name-status, merged by path).
   */
  async getBranchDiffFiles(branchName: string, mainBranch: string): Promise<
    Array<{ path: string; status: string; additions: number; deletions: number }>
  > {
    const base =
      mainBranch && mainBranch !== branchName && (await this.branchExists(mainBranch))
        ? `${mainBranch}...${branchName}`
        : null;
    if (!base) {
      return [];
    }
    const statusByPath = new Map<string, string>();
    try {
      const { stdout } = await this.run(["diff", "--name-status", base]);
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const parts = line.split("\t");
        const status = (parts[0] || "").trim();
        const path = (parts[parts.length - 1] || "").trim();
        if (path) {
          statusByPath.set(path, status.charAt(0) || "M");
        }
      }
    } catch {
      /* ignore */
    }
    const files: Array<{ path: string; status: string; additions: number; deletions: number }> = [];
    try {
      const { stdout } = await this.run(["diff", "--numstat", base]);
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const [add, del, ...rest] = line.split("\t");
        const path = rest.join("\t").trim();
        if (!path) {
          continue;
        }
        files.push({
          path,
          status: statusByPath.get(path) || "M",
          additions: add === "-" ? 0 : Number(add) || 0,
          deletions: del === "-" ? 0 : Number(del) || 0,
        });
      }
    } catch {
      /* ignore */
    }
    return files.slice(0, 500);
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

  /**
   * Merge `branchName` into `target` (e.g. a feature branch into dev) and push.
   * Checks out target, pulls it, merges --no-ff, pushes, then returns to the
   * original branch. Aborts cleanly on conflict and never deletes anything.
   */
  async mergeIntoBranch(target: string, branchName: string): Promise<OperationResult> {
    const action = "mergeIntoBranch";
    try {
      await this.assertValidBranchName(target);
      await this.assertValidBranchName(branchName);
      const remote = this.getConfig().remoteName || "origin";
      const original = await this.getCurrentBranch();

      // Make sure the work is pushed before integrating.
      try {
        await this.run(["push", "-u", remote, branchName]);
      } catch {
        /* push is best-effort here; merge below uses local refs */
      }

      const co = await this.checkoutBranch(target);
      if (!co.ok) {
        // target may not exist locally yet — try to create it from remote.
        try {
          await this.run(["checkout", "-b", target, `${remote}/${target}`]);
        } catch {
          return { ok: false, action, message: `Could not switch to '${target}'.`, detail: co.detail };
        }
      }
      try {
        await this.run(["pull", remote, target]);
      } catch {
        /* target may have no upstream yet — continue with local */
      }

      try {
        await this.run(["merge", "--no-ff", branchName, "-m", `Merge ${branchName} into ${target}`]);
      } catch (err: any) {
        try {
          await this.run(["merge", "--abort"]);
        } catch {
          /* nothing to abort */
        }
        if (original) {
          await this.run(["checkout", original]).catch(() => undefined);
        }
        return {
          ok: false,
          action,
          message: `Merge of '${branchName}' into '${target}' failed (conflict or error). Merge aborted.`,
          detail: err?.message,
        };
      }

      let pushDetail = "";
      try {
        await this.run(["push", remote, target]);
      } catch (err: any) {
        pushDetail = err?.message ?? "";
      }

      // Return to the branch the user was on so their context is preserved.
      if (original && original !== target) {
        await this.run(["checkout", original]).catch(() => undefined);
      }

      return {
        ok: true,
        action,
        message: `Merged '${branchName}' into '${target}'${pushDetail ? " (local merge; push failed)" : ` and pushed to ${remote}`}.`,
        detail: pushDetail || undefined,
      };
    } catch (err: any) {
      return { ok: false, action, message: `Merge into '${target}' failed.`, detail: err?.message };
    }
  }

  async deleteLocalBranch(branchName: string, force = false): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      // -d refuses to delete unmerged work (safe); -D forces (used after archiving).
      await this.run(["branch", force ? "-D" : "-d", branchName]);
      return { ok: true, action: "deleteLocalBranch", message: `Deleted local branch '${branchName}'.` };
    } catch (err: any) {
      return {
        ok: false,
        action: "deleteLocalBranch",
        message: force
          ? `Could not delete local branch '${branchName}'.`
          : `Could not delete '${branchName}' — it may have unmerged changes. Archive it instead, or merge first.`,
        detail: err?.message,
      };
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

  /** Create a lightweight tag at a given ref (default HEAD). Safe, non-destructive. */
  async createTag(tagName: string, ref = "HEAD"): Promise<OperationResult> {
    try {
      const name = (tagName || "").trim();
      if (!name || name.startsWith("-")) {
        throw new Error(`Invalid tag name: ${tagName}`);
      }
      await this.run(["tag", name, ref]);
      return { ok: true, action: "createTag", message: `Created tag '${name}'.` };
    } catch (err: any) {
      return { ok: false, action: "createTag", message: `Could not create tag '${tagName}'.`, detail: err?.message };
    }
  }

  /**
   * Create a backup branch pointing at `source` WITHOUT checking it out
   * (git branch <backup> <source>). Non-destructive snapshot.
   */
  async createBackupBranch(backupName: string, source: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(backupName);
      await this.assertValidBranchName(source);
      await this.run(["branch", backupName, source]);
      return { ok: true, action: "createBackupBranch", message: `Backup branch '${backupName}' created.` };
    } catch (err: any) {
      return {
        ok: false,
        action: "createBackupBranch",
        message: `Could not create backup branch '${backupName}'.`,
        detail: err?.message,
      };
    }
  }

  /**
   * Revert the last commit on a branch (git revert --no-edit HEAD). This is the
   * SAFE undo: it creates a new commit, it never rewrites history. Assumes the
   * branch is checked out and the tree is clean.
   */
  async revertLastCommit(): Promise<OperationResult> {
    try {
      const { stdout } = await this.run(["revert", "--no-edit", "HEAD"]);
      return { ok: true, action: "revertLastCommit", message: "Reverted the last commit.", detail: stdout.trim() };
    } catch (err: any) {
      // Abort a conflicted revert so the tree is left clean.
      try {
        await this.run(["revert", "--abort"]);
      } catch {
        /* nothing to abort */
      }
      return {
        ok: false,
        action: "revertLastCommit",
        message: "Could not revert the last commit (conflict or error). Revert aborted.",
        detail: err?.message,
      };
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

  // 5b. Non-destructive safety nets before touching main.
  if (config.createBackupBranchBeforeMerge) {
    const backup = SafetyService.backupBranchName(branch);
    const res = await git.createBackupBranch(backup, branch);
    cb.info(res.ok ? `Backup branch created: ${backup}` : `Backup branch failed: ${res.detail ?? res.message}`);
  }
  if (config.createSafetyTagBeforeMerge) {
    const tag = SafetyService.safetyTagName(task.id);
    const res = await git.createTag(tag, main);
    cb.info(res.ok ? `Safety tag created: ${tag}` : `Safety tag failed: ${res.detail ?? res.message}`);
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
