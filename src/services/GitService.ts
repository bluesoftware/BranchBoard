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
  /** Resolve the SHA a branch ref points at (local first, then origin/<name>). */
  private async branchTip(branchName: string): Promise<string | null> {
    const remote = this.getConfig().remoteName || "origin";
    for (const ref of [branchName, `${remote}/${branchName}`]) {
      try {
        const { stdout } = await this.run(["rev-parse", "--verify", ref]);
        const sha = stdout.trim();
        if (sha) {
          return sha;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  }

  /** Find the merge commit on main that brought `branchTip` in (its 2nd parent). */
  private async findMergeCommit(branchTip: string, mainBranch: string): Promise<string | null> {
    try {
      const { stdout } = await this.run([
        "log", mainBranch, "--merges", "--format=%H %P", "-n", "800",
      ]);
      for (const line of stdout.split("\n")) {
        const parts = line.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
          continue;
        }
        const hash = parts[0];
        const parents = parts.slice(1);
        // Prefer the conventional 2nd-parent match, but accept any parent.
        if (parents[1] === branchTip || parents.includes(branchTip)) {
          return hash;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Work out how to show a branch's CONTRIBUTION, even after it was merged.
   *  - ahead of main      -> main..branch / main...branch  (live work)
   *  - already merged in  -> M^1..M^2 / M^1...M^2 from the merge commit M
   * Returns null when there's no main to compare against.
   */
  private async contributionRange(
    branchName: string,
    mainBranch: string
  ): Promise<{ logRange: string; diffSpec: string | null } | null> {
    const mainOk = mainBranch && mainBranch !== branchName && (await this.branchExists(mainBranch));
    if (!mainOk) {
      return { logRange: branchName, diffSpec: null };
    }
    const tip = await this.branchTip(branchName);
    if (!tip) {
      return { logRange: `${mainBranch}..${branchName}`, diffSpec: `${mainBranch}...${branchName}` };
    }
    let ahead = 0;
    try {
      const { stdout } = await this.run(["rev-list", "--count", `${mainBranch}..${tip}`]);
      ahead = Number(stdout.trim()) || 0;
    } catch {
      /* assume merged */
    }
    if (ahead > 0) {
      return { logRange: `${mainBranch}..${branchName}`, diffSpec: `${mainBranch}...${branchName}` };
    }
    // Merged: reconstruct the contribution from the merge commit.
    const m = await this.findMergeCommit(tip, mainBranch);
    if (m) {
      return { logRange: `${m}^1..${m}^2`, diffSpec: `${m}^1...${m}^2` };
    }
    // Couldn't find a merge commit (squash/fast-forward): nothing distinct.
    return { logRange: `${mainBranch}..${branchName}`, diffSpec: `${mainBranch}...${branchName}` };
  }

  async getCommits(branchName: string, mainBranch: string, limit = 80): Promise<
    Array<{ hash: string; shortHash: string; author: string; date: string; subject: string }>
  > {
    const resolved = await this.contributionRange(branchName, mainBranch);
    const range = resolved ? resolved.logRange : branchName;
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
    const resolved = await this.contributionRange(branchName, mainBranch);
    const base = resolved?.diffSpec ?? null;
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

  /** Does a branch exist on the remote (origin/<name>)? */
  async remoteBranchExists(name: string): Promise<boolean> {
    const remote = this.getConfig().remoteName || "origin";
    try {
      await this.run(["rev-parse", "--verify", `${remote}/${name}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Make sure `branchName` is checked out, CREATING it if it doesn't exist:
   *  - exists locally        -> checkout
   *  - exists on the remote   -> checkout -b <name> --track origin/<name>
   *  - doesn't exist anywhere -> checkout -b <name> from current HEAD
   * This is what lets moving a card act on a branch that was only ever recorded
   * on the board (e.g. created on another machine) without erroring.
   */
  async ensureBranch(branchName: string): Promise<OperationResult> {
    const action = "ensureBranch";
    try {
      await this.assertValidBranchName(branchName);
      if (await this.branchExists(branchName)) {
        await this.run(["checkout", branchName]);
        return { ok: true, action, message: `Switched to '${branchName}'.` };
      }
      const remote = this.getConfig().remoteName || "origin";
      // Fetch quietly so origin/<name> is up to date before we probe it.
      try {
        await this.run(["fetch", remote, branchName]);
      } catch {
        /* offline or no such remote branch — fall through */
      }
      if (await this.remoteBranchExists(branchName)) {
        await this.run(["checkout", "-b", branchName, "--track", `${remote}/${branchName}`]);
        return { ok: true, action, message: `Created '${branchName}' tracking ${remote}/${branchName}.` };
      }
      await this.run(["checkout", "-b", branchName]);
      return { ok: true, action, message: `Created new branch '${branchName}' from current HEAD.` };
    } catch (err: any) {
      return { ok: false, action, message: `Could not create or switch to '${branchName}'.`, detail: err?.message };
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
   * If `target` doesn't exist yet — locally or on the remote — it is created
   * from the main branch and pushed immediately, so the first task that
   * reaches a "staging" column is what brings origin/dev (or whichever
   * target) into existence. Checks out target, pulls it, merges --no-ff,
   * pushes, then returns to the original branch. Aborts cleanly on conflict
   * and never deletes anything.
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
        // Target may not exist locally yet. Refresh remote refs, then either
        // track an existing origin/<target> or create it from scratch.
        try {
          await this.run(["fetch", remote, target]);
        } catch {
          /* offline or remote has no such branch yet — fall through */
        }
        if (await this.remoteBranchExists(target)) {
          try {
            await this.run(["checkout", "-b", target, "--track", `${remote}/${target}`]);
          } catch (err: any) {
            return { ok: false, action, message: `Could not switch to '${target}'.`, detail: err?.message };
          }
        } else {
          // Target doesn't exist anywhere yet — create it from the main
          // branch and push it immediately so it exists on origin too.
          try {
            const main = await this.getMainBranch();
            await this.run(["checkout", main]);
            try {
              await this.run(["pull", remote, main]);
            } catch {
              /* main may have no upstream yet — continue with local */
            }
            await this.run(["checkout", "-b", target]);
            await this.run(["push", "-u", remote, target]);
          } catch (err: any) {
            if (original) {
              await this.run(["checkout", original]).catch(() => undefined);
            }
            return {
              ok: false,
              action,
              message: `Target branch '${target}' did not exist and could not be created.`,
              detail: err?.message,
            };
          }
        }
      } else {
        try {
          await this.run(["pull", remote, target]);
        } catch {
          /* target may have no upstream yet — continue with local */
        }
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

  /** True if `ref` has 2+ parents (i.e. it's a merge commit). */
  private async isMergeCommit(ref: string): Promise<boolean> {
    try {
      const { stdout } = await this.run(["rev-list", "--parents", "-n", "1", ref]);
      // First token is the commit itself; the rest are its parents.
      return stdout.trim().split(/\s+/).length > 2;
    } catch {
      return false;
    }
  }

  /**
   * Revert the last commit on a branch (git revert --no-edit HEAD). This is the
   * SAFE undo: it creates a new commit, it never rewrites history. Assumes the
   * branch is checked out and the tree is clean. Merge commits are detected
   * automatically and reverted with `-m 1` (against the first/mainline parent),
   * since plain `git revert` refuses a merge commit otherwise.
   */
  async revertLastCommit(): Promise<OperationResult> {
    try {
      const args = ["revert", "--no-edit"];
      if (await this.isMergeCommit("HEAD")) {
        args.push("-m", "1");
      }
      args.push("HEAD");
      const { stdout } = await this.run(args);
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

  /**
   * "Revert from origin": revert the last commit (merge-aware, see above) and,
   * only if that succeeds, push the result to the remote. This is the flow
   * for undoing something that was already pushed: the revert is a normal new
   * commit, and pushing it triggers any GitHub webhook (CI/deploy) exactly the
   * way a regular push would — so a connected deployment rolls back to the
   * previous version instead of needing a force-push or history rewrite.
   * Never touches origin if the local revert failed or conflicted.
   */
  async revertFromOrigin(branchName: string): Promise<OperationResult> {
    const revert = await this.revertLastCommit();
    if (!revert.ok) {
      return { ...revert, action: "revertFromOrigin" };
    }
    const push = await this.pushBranch(branchName);
    if (!push.ok) {
      return {
        ok: false,
        action: "revertFromOrigin",
        message: `Reverted locally, but push to origin failed. Origin still has the old commit — push '${branchName}' manually once you've resolved the issue.`,
        detail: push.detail,
      };
    }
    return {
      ok: true,
      action: "revertFromOrigin",
      message: `Reverted the last commit and pushed '${branchName}' to origin.`,
      detail: push.message,
    };
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

  // 2. Make sure we're on the task branch, creating it if it doesn't exist
  //    locally (it may have been recorded on the board from another machine).
  const current = await git.getCurrentBranch();
  if (current !== branch) {
    const checkout = await git.ensureBranch(branch);
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
