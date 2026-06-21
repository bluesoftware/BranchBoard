import { execFile } from "child_process";
import { BoardTask, BranchBoardConfig, BranchLocationState, FileMentionEntry, GitInfo, OperationResult } from "../types";
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
  private resolvedGitCommand: string | undefined;
  private fileIndex: { files: string[]; loadedAt: number } | undefined;
  private fileIndexLoad: Promise<string[]> | undefined;

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

  private gitCandidates(): string[] {
    return Array.from(new Set(["git", "/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"]));
  }

  private runWith(command: string, args: string[]): Promise<GitExecResult> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { cwd: this.cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: this.buildEnv() }, (err, stdout, stderr) => {
        if (err) {
          const e = new Error(stderr?.trim() || err.message);
          (e as any).stdout = stdout;
          (e as any).stderr = stderr;
          (e as any).code = (err as any).code;
          reject(e);
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });
  }

  private async run(args: string[]): Promise<GitExecResult> {
    if (this.resolvedGitCommand) {
      return this.runWith(this.resolvedGitCommand, args);
    }

    const notFoundErrors: string[] = [];
    for (const command of this.gitCandidates()) {
      try {
        const result = await this.runWith(command, args);
        this.resolvedGitCommand = command;
        return result;
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          notFoundErrors.push(`${command}: ${err.message}`);
          continue;
        }
        this.resolvedGitCommand = command;
        throw err;
      }
    }
    throw new Error(`Git executable was not found. Tried: ${notFoundErrors.join("; ")}`);
  }

  private async requireCleanWorkingTree(action: string, message: string): Promise<OperationResult | null> {
    if (!(await this.hasUncommittedChanges())) {
      return null;
    }
    return { ok: false, action, message };
  }

  private async fastForwardFromRemote(remote: string, branch: string): Promise<GitExecResult> {
    await this.run(["fetch", remote, branch]);
    return this.run(["-c", "merge.autoStash=false", "merge", "--ff-only", `${remote}/${branch}`]);
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
    const read = async (args: string[]): Promise<string | null> => {
      try {
        const { stdout } = await this.run(args);
        return stdout.trim() || null;
      } catch {
        return null;
      }
    };

    let name = await read(["config", "--get", "user.name"]);
    let email = await read(["config", "--get", "user.email"]);

    // In a not-yet-initialized repo, plain `git config --get` can miss local
    // data. Global config keeps "current user" usable before the first commit.
    name = name ?? (await read(["config", "--global", "--get", "user.name"]));
    email = email ?? (await read(["config", "--global", "--get", "user.email"]));

    // Last resort: if Git has no explicit identity, use the most recent author
    // so existing projects can still match a board user instead of showing an
    // empty profile.
    if (!name || !email) {
      try {
        const { stdout } = await this.run(["log", "-1", "--format=%an%x09%ae", "HEAD"]);
        const [authorName, authorEmail] = stdout.trim().split("\t");
        name = name ?? (authorName?.trim() || null);
        email = email ?? (authorEmail?.trim() || null);
      } catch {
        /* no commits yet */
      }
    }

    return { name, email };
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

  /**
   * True if `branchRef` is an ancestor of `targetBranch` — i.e. it has been
   * merged into it (fast-forward or via merge commit, doesn't matter).
   * Safe by construction: a missing ref or unrelated history just returns
   * false, never throws.
   */
  async isBranchMergedInto(branchRef: string, targetBranch: string): Promise<boolean> {
    if (!branchRef || !targetBranch || branchRef === targetBranch) {
      return false;
    }
    try {
      await this.run(["merge-base", "--is-ancestor", branchRef, targetBranch]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Picks the right ref to inspect a branch by: prefer the local branch (it
   * has the developer's latest commits), fall back to the remote-tracking
   * ref if it only exists on origin, or null if neither exists (e.g. the
   * branch was deleted after merge).
   */
  private resolveBranchRef(branchName: string, existsLocal: boolean, existsRemote: boolean): string | null {
    if (existsLocal) {
      return branchName;
    }
    if (existsRemote) {
      const remote = this.getConfig().remoteName || "origin";
      return `${remote}/${branchName}`;
    }
    return null;
  }

  /**
   * Live, Git-truth location of a task's branch — see BranchLocationState in
   * types.ts. This is deliberately computed on demand from Git, never
   * persisted: it can never go stale or contradict reality.
   *  - "prod"   the branch is merged into main.
   *  - "dev"    (only when a dev branch is configured) merged into dev, not main.
   *  - "origin" pushed to the remote, visible to the whole team, not merged anywhere.
   *  - "local"  exists only on this machine (or doesn't exist at all yet).
   */
  async getBranchLocationState(branchName: string): Promise<BranchLocationState> {
    if (!branchName) {
      return "local";
    }
    const config = this.getConfig();
    const mainBranch = await this.getMainBranch();
    const stats = await this.getBranchStats(branchName, mainBranch);
    const ref = this.resolveBranchRef(branchName, stats.existsLocal, stats.existsRemote);
    if (!ref) {
      return "local";
    }

    if (await this.isBranchMergedInto(ref, mainBranch)) {
      return "prod";
    }

    if (config.useDevBranch) {
      const devBranch = config.devBranch || "dev";
      if (await this.isBranchMergedInto(ref, devBranch)) {
        return "dev";
      }
    }

    return stats.existsRemote ? "origin" : "local";
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
    const dirty = await this.requireCleanWorkingTree(
      "updateBranchFromMain",
      `Working tree is not clean. Commit or stash changes before updating this branch from ${remote}/${main}.`
    );
    if (dirty) {
      return dirty;
    }
    try {
      await this.run(["fetch", remote, main]);
    } catch (err: any) {
      return { ok: false, action: "updateBranchFromMain", message: `Fetch of ${remote}/${main} failed.`, detail: err?.message };
    }
    try {
      if (strategy === "rebase") {
        const { stdout } = await this.run(["-c", "rebase.autoStash=false", "rebase", `${remote}/${main}`]);
        return { ok: true, action: "updateBranchFromMain", message: `Rebased onto ${remote}/${main}.`, detail: stdout.trim() };
      }
      const { stdout } = await this.run(["-c", "merge.autoStash=false", "merge", "--no-edit", `${remote}/${main}`]);
      return { ok: true, action: "updateBranchFromMain", message: `Merged ${remote}/${main} into the current branch.`, detail: stdout.trim() };
    } catch (err: any) {
      // Before aborting, capture which files are actually in conflict so the
      // user knows exactly what to resolve — the raw git error alone does
      // not reliably list this.
      let conflictFiles: string[] = [];
      try {
        const { stdout } = await this.run(["diff", "--name-only", "--diff-filter=U"]);
        conflictFiles = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      } catch {
        /* best-effort only; abort below still happens regardless */
      }
      // Abort a conflicted merge/rebase so the working tree stays clean.
      try {
        await this.run([strategy === "rebase" ? "rebase" : "merge", "--abort"]);
      } catch {
        /* nothing to abort */
      }
      const conflictDetail =
        conflictFiles.length > 0
          ? `Conflicting files (${conflictFiles.length}):\n${conflictFiles.map((f) => `  - ${f}`).join("\n")}`
          : undefined;
      return {
        ok: false,
        action: "updateBranchFromMain",
        message:
          conflictFiles.length > 0
            ? `Update from ${main} failed: ${conflictFiles.length} file(s) are in conflict. Nothing was changed — the ${strategy} was aborted.`
            : `Update from ${main} failed (conflict or error). The operation was aborted.`,
        detail: conflictDetail ? `${conflictDetail}\n\n${err?.message ?? ""}`.trim() : err?.message,
      };
    }
  }

  /**
   * Repo files (tracked + untracked, respecting .gitignore) filtered by a
   * case-insensitive substring query. Used for the task's attach-file
   * autocomplete. Read-only, no network.
   */
  private async getFileIndex(): Promise<string[]> {
    const maxAgeMs = 30_000;
    if (this.fileIndex && Date.now() - this.fileIndex.loadedAt < maxAgeMs) {
      return this.fileIndex.files;
    }
    if (this.fileIndexLoad) {
      return this.fileIndexLoad;
    }
    this.fileIndexLoad = this.run(["ls-files", "--cached", "--others", "--exclude-standard"])
      .then(({ stdout }) => {
        const files = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
        this.fileIndex = { files, loadedAt: Date.now() };
        return files;
      })
      .catch(() => [])
      .finally(() => {
        this.fileIndexLoad = undefined;
      });
    return this.fileIndexLoad;
  }

  private fileMatchScore(file: string, query: string): number {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q) {
      return 0;
    }
    const pathLower = file.toLowerCase();
    const nameLower = pathLower.slice(pathLower.lastIndexOf("/") + 1);
    const compactPath = pathLower.replace(/[._/-]+/g, "");
    const compactQuery = q.replace(/[._/-]+/g, "");

    if (pathLower === q) {
      return 0;
    }
    if (nameLower === q) {
      return 1;
    }
    if (pathLower.startsWith(q)) {
      return 10 + file.length / 1000;
    }
    if (nameLower.startsWith(q)) {
      return 20 + nameLower.length / 1000;
    }
    const nameIndex = nameLower.indexOf(q);
    if (nameIndex >= 0) {
      return 40 + nameIndex + nameLower.length / 1000;
    }
    const pathIndex = pathLower.indexOf(q);
    if (pathIndex >= 0) {
      return 70 + pathIndex + file.length / 1000;
    }
    if (compactQuery && compactPath.includes(compactQuery)) {
      return 120 + compactPath.indexOf(compactQuery) + file.length / 1000;
    }

    let pos = 0;
    let gaps = 0;
    for (const char of q) {
      const next = pathLower.indexOf(char, pos);
      if (next < 0) {
        return Number.POSITIVE_INFINITY;
      }
      gaps += next - pos;
      pos = next + 1;
    }
    return 180 + gaps + file.length / 1000;
  }

  async listTrackedFiles(query = "", limit = 10): Promise<string[]> {
    try {
      const q = query.trim().toLowerCase();
      const all = await this.getFileIndex();
      if (!q) {
        return all.slice(0, limit);
      }
      return all
        .map((file) => ({ file, score: this.fileMatchScore(file, q) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => a.score - b.score || a.file.length - b.file.length || a.file.localeCompare(b.file))
        .slice(0, limit)
        .map((entry) => entry.file);
    } catch {
      return [];
    }
  }

  /** File extensions recognized as an "extension token" right after "@", longest first so "tsx" wins over "ts". */
  private static readonly MENTION_EXTENSIONS = [
    "tsx", "jsx", "mjs", "cjs", "scss", "json", "yaml", "html", "java", "kt",
    "vue", "less", "mdx", "yml", "sql", "cpp", "hpp", "ts", "js", "py", "rb",
    "go", "rs", "php", "css", "md", "sh", "c", "h",
  ].sort((a, b) => b.length - a.length);

  /** Detects a known extension token at the start of `leaf`, e.g. "phpprod" -> {ext:"php", rest:"prod"}. */
  private detectMentionExtension(leaf: string): { ext: string; rest: string } | null {
    const lower = leaf.toLowerCase();
    for (const ext of GitService.MENTION_EXTENSIONS) {
      if (lower.startsWith(ext)) {
        return { ext, rest: leaf.slice(ext.length) };
      }
    }
    return null;
  }

  /** All directory paths implied by a flat file list, e.g. "src/a/b.ts" -> "src", "src/a". */
  private collectDirectories(files: string[]): string[] {
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.split("/");
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        dirs.add(acc);
      }
    }
    return Array.from(dirs);
  }

  /** Immediate children (dirs first, then files) of `dirPrefix` (repo-relative, trailing "/" or ""). */
  private listDirChildren(files: string[], dirPrefix: string, limit: number): FileMentionEntry[] {
    const prefixLower = dirPrefix.toLowerCase();
    const dirs = new Set<string>();
    const childFiles: string[] = [];
    for (const file of files) {
      if (dirPrefix && !file.toLowerCase().startsWith(prefixLower)) {
        continue;
      }
      const rest = dirPrefix ? file.slice(dirPrefix.length) : file;
      if (!rest) {
        continue;
      }
      const slashIdx = rest.indexOf("/");
      if (slashIdx >= 0) {
        dirs.add(dirPrefix + rest.slice(0, slashIdx));
      } else {
        childFiles.push(dirPrefix + rest);
      }
    }
    const dirEntries: FileMentionEntry[] = Array.from(dirs)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ path, type: "dir" as const }));
    const fileEntries: FileMentionEntry[] = childFiles
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ path, type: "file" as const }));
    return [...dirEntries, ...fileEntries].slice(0, limit);
  }

  /**
   * "@" file mention search: directory-aware and extension-token-aware.
   *  - Empty query (or a query ending in "/") -> browse: lists the immediate
   *    directories and files under the typed path, dirs first.
   *  - A known extension at the start of the last path segment (e.g. "php",
   *    "js", "tsx") -> filters to files with that extension, then fuzzy-
   *    narrows by whatever follows the extension (e.g. "phpprod" -> .php
   *    files fuzzy-matched against "prod").
   *  - Anything else -> falls back to fuzzy matching across both files and
   *    directories using the existing layered scorer.
   */
  async searchFileMentions(query = "", limit = 10): Promise<FileMentionEntry[]> {
    try {
      const raw = query ?? "";
      const lastSlash = raw.lastIndexOf("/");
      const dirPrefix = lastSlash >= 0 ? raw.slice(0, lastSlash + 1) : "";
      const leaf = lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
      const all = await this.getFileIndex();

      if (!leaf) {
        return this.listDirChildren(all, dirPrefix, limit);
      }

      const extToken = this.detectMentionExtension(leaf);
      if (extToken) {
        const suffix = `.${extToken.ext}`.toLowerCase();
        const prefixLower = dirPrefix.toLowerCase();
        const filtered = all.filter(
          (file) => file.toLowerCase().endsWith(suffix) && file.toLowerCase().startsWith(prefixLower),
        );
        const rest = extToken.rest.trim();
        const scored = rest
          ? filtered
              .map((file) => ({ file, score: this.fileMatchScore(file, rest) }))
              .filter((entry) => Number.isFinite(entry.score))
          : filtered.map((file) => ({ file, score: file.length }));
        if (scored.length) {
          scored.sort((a, b) => a.score - b.score || a.file.localeCompare(b.file));
          return scored.slice(0, limit).map((entry) => ({ path: entry.file, type: "file" as const }));
        }
        // No file matched that extension — fall through to the general fuzzy search below.
      }

      const dirCandidates: FileMentionEntry[] = this.collectDirectories(all).map((path) => ({
        path,
        type: "dir" as const,
      }));
      const fileCandidates: FileMentionEntry[] = all.map((path) => ({ path, type: "file" as const }));
      const scored = [...dirCandidates, ...fileCandidates]
        .map((entry) => ({ ...entry, score: this.fileMatchScore(entry.path, raw) }))
        .filter((entry) => Number.isFinite(entry.score));
      scored.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));
      return scored.slice(0, limit).map(({ path, type }) => ({ path, type }));
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

  async localBranchExists(name: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
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

  async checkoutPublicBranch(branchName: string, notPushedMessage: string): Promise<OperationResult> {
    const action = "checkoutBranch";
    try {
      await this.assertValidBranchName(branchName);
      if (await this.localBranchExists(branchName)) {
        await this.run(["checkout", branchName]);
        return { ok: true, action, message: `Switched to '${branchName}'.` };
      }

      const remote = this.getConfig().remoteName || "origin";
      try {
        await this.run([
          "fetch",
          remote,
          `refs/heads/${branchName}:refs/remotes/${remote}/${branchName}`,
        ]);
      } catch {
        return { ok: false, action, message: notPushedMessage };
      }

      if (!(await this.remoteBranchExists(branchName))) {
        return { ok: false, action, message: notPushedMessage };
      }

      await this.run(["checkout", "-b", branchName, "--track", `${remote}/${branchName}`]);
      return { ok: true, action, message: `Fetched and switched to '${branchName}' from ${remote}.` };
    } catch (err: any) {
      return { ok: false, action, message: `Could not switch to '${branchName}'.`, detail: err?.message };
    }
  }

  /**
   * Resume work on a task branch after rolling it back OUT of Production:
   *  - exists locally         -> checkout
   *  - exists on the remote    -> fetch + checkout -b --track origin/<name>
   *  - doesn't exist anywhere  -> re-cut it from the CURRENT tip of main
   *    (fast-forwarded from origin/main first, best-effort), under the SAME
   *    branch name, so work can resume and later be pushed/merged again.
   * This is the common case right after a finish flow deleted the branch on
   * merge: instead of blocking the rollback, BranchBoard recreates the
   * branch. It only ever READS origin/main (fetch / fast-forward) — it never
   * deletes or rewrites anything already on the remote.
   */
  async resumeBranchFromMain(branchName: string): Promise<OperationResult> {
    const action = "resumeBranch";
    try {
      await this.assertValidBranchName(branchName);

      const dirty = await this.requireCleanWorkingTree(
        action,
        `Working tree is not clean. Commit or stash changes before resuming '${branchName}'.`
      );
      if (dirty) {
        return dirty;
      }

      if (await this.localBranchExists(branchName)) {
        await this.run(["checkout", branchName]);
        return { ok: true, action, message: `Switched back to '${branchName}'.` };
      }

      const remote = this.getConfig().remoteName || "origin";
      try {
        await this.run([
          "fetch",
          remote,
          `refs/heads/${branchName}:refs/remotes/${remote}/${branchName}`,
        ]);
      } catch {
        /* offline or no such branch on the remote — fall through */
      }
      if (await this.remoteBranchExists(branchName)) {
        await this.run(["checkout", "-b", branchName, "--track", `${remote}/${branchName}`]);
        return { ok: true, action, message: `Fetched and switched back to '${branchName}' from ${remote}.` };
      }

      // Branch is gone everywhere (e.g. deleted after merging into main):
      // recreate it from the current tip of main, under the same name.
      const main = await this.getMainBranch();
      const original = await this.getCurrentBranch();
      try {
        await this.run(["checkout", main]);
      } catch (err: any) {
        return {
          ok: false,
          action,
          message: `Could not switch to '${main}' to recreate '${branchName}'.`,
          detail: err?.message,
        };
      }
      try {
        await this.fastForwardFromRemote(remote, main);
      } catch {
        /* main may have no upstream yet, or is already up to date — continue with local */
      }
      try {
        await this.run(["checkout", "-b", branchName]);
      } catch (err: any) {
        if (original) {
          await this.run(["checkout", original]).catch(() => undefined);
        }
        return {
          ok: false,
          action,
          message: `Could not recreate branch '${branchName}' from '${main}'.`,
          detail: err?.message,
        };
      }
      return {
        ok: true,
        action,
        message: `Branch '${branchName}' no longer existed, so it was recreated from the current '${main}'. Work can resume on it; nothing on ${remote}/${main} was touched.`,
      };
    } catch (err: any) {
      return { ok: false, action, message: `Could not resume branch '${branchName}'.`, detail: err?.message };
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
      const dirty = await this.requireCleanWorkingTree(
        "pullMain",
        `Working tree is not clean. Commit or stash changes before updating ${main}.`
      );
      if (dirty) {
        return dirty;
      }
      await this.fastForwardFromRemote(remote, main);
      return { ok: true, action: "pullMain", message: `Updated ${main} from ${remote}/${main}.` };
    } catch (err: any) {
      return { ok: false, action: "pullMain", message: "Updating main failed.", detail: err?.message };
    }
  }

  /** Merge branchName into main (assumes main is already checked out). */
  async mergeBranchToMain(branchName: string): Promise<OperationResult> {
    try {
      await this.assertValidBranchName(branchName);
      const main = await this.getMainBranch();
      const dirty = await this.requireCleanWorkingTree(
        "mergeBranchToMain",
        `Working tree is not clean. Commit or stash changes before merging '${branchName}' into ${main}.`
      );
      if (dirty) {
        return dirty;
      }
      const { stdout } = await this.run([
        "-c",
        "merge.autoStash=false",
        "merge",
        "--no-ff",
        branchName,
        "-m",
        `Merge ${branchName} into ${main}`,
      ]);
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
      const dirty = await this.requireCleanWorkingTree(
        action,
        `Working tree is not clean. Commit or stash changes before merging '${branchName}' into ${target}.`
      );
      if (dirty) {
        return dirty;
      }

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
              await this.fastForwardFromRemote(remote, main);
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
          await this.fastForwardFromRemote(remote, target);
        } catch {
          /* target may have no upstream yet — continue with local */
        }
      }

      try {
        await this.run([
          "-c",
          "merge.autoStash=false",
          "merge",
          "--no-ff",
          branchName,
          "-m",
          `Merge ${branchName} into ${target}`,
        ]);
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

function finishFailure(
  config: BranchBoardConfig,
  message: { pl: string; en: string },
  steps: { pl: string[]; en: string[] },
  gitDetail?: string
): FinishResult {
  const isPl = config.language !== "en";
  const selectedSteps = isPl ? steps.pl : steps.en;
  const detailLines = [
    isPl ? "Co zrobić:" : "How to fix:",
    ...selectedSteps.map((step, index) => `${index + 1}. ${step}`),
  ];
  const trimmedDetail = (gitDetail || "").trim();
  if (trimmedDetail) {
    detailLines.push("", isPl ? "Szczegóły Git:" : "Git details:", trimmedDetail);
  }
  return {
    ok: false,
    action: "finishTask",
    message: isPl ? message.pl : message.en,
    detail: detailLines.join("\n"),
  };
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
  const configuredRemote = config.remoteName || "origin";
  const configuredMain = config.defaultMainBranch || "main";
  const configuredProductionRef = `${configuredRemote}/${configuredMain}`;
  if (!branch) {
    return finishFailure(
      config,
      {
        pl: "Nie można zakończyć zadania: karta nie ma przypisanego brancha.",
        en: "Cannot finish the task: the card has no branch assigned.",
      },
      {
        pl: [
          "Otwórz zadanie i ustaw nazwę brancha albo przenieś je najpierw do kolumny pracy, która tworzy branch.",
          "Wypchnij zmiany na branch zadania.",
          `Dopiero po scaleniu brancha do ${configuredProductionRef} przenieś zadanie na Produkcję.`,
        ],
        en: [
          "Open the task and set a branch name, or move it to the work column that creates a branch first.",
          "Push the task branch.",
          `Move the task to Production only after the branch is merged into ${configuredProductionRef}.`,
        ],
      }
    );
  }

  // 1. Working tree must be clean (if required).
  if (config.requireCleanWorkingTreeBeforeFinish && (await git.hasUncommittedChanges())) {
    return finishFailure(
      config,
      {
        pl: "Nie można zakończyć zadania: masz niezacommitowane zmiany w working tree.",
        en: "Cannot finish the task: the working tree has uncommitted changes.",
      },
      {
        pl: [
          "Sprawdź `git status`.",
          "Zacommituj zmiany albo odłóż je świadomie przez `git stash`.",
          "Spróbuj ponownie przenieść zadanie na Produkcję.",
        ],
        en: [
          "Check `git status`.",
          "Commit the changes or intentionally stash them with `git stash`.",
          "Try moving the task to Production again.",
        ],
      }
    );
  }

  // 2. Make sure we're on the task branch, creating it if it doesn't exist
  //    locally (it may have been recorded on the board from another machine).
  const current = await git.getCurrentBranch();
  if (current !== branch) {
    const checkout = await git.ensureBranch(branch);
    if (!checkout.ok) {
      return finishFailure(
        config,
        {
          pl: `Nie można przełączyć się na branch zadania '${branch}'.`,
          en: `Cannot switch to the task branch '${branch}'.`,
        },
        {
          pl: [
            `Sprawdź, czy branch '${branch}' istnieje lokalnie albo na zdalnym repozytorium.`,
            `Jeśli branch jest tylko zdalny, uruchom \`git fetch ${config.remoteName || "origin"} ${branch}\`.`,
            "Popraw branch na karcie zadania i spróbuj ponownie.",
          ],
          en: [
            `Check whether '${branch}' exists locally or on the remote.`,
            `If it only exists remotely, run \`git fetch ${config.remoteName || "origin"} ${branch}\`.`,
            "Fix the branch on the task card and try again.",
          ],
        },
        checkout.detail
      );
    }
  }

  const main = await git.getMainBranch();
  const remote = configuredRemote;

  // Production really means merged into main. If BranchBoard is not allowed to
  // do that merge, keep the task where it was and tell the user what to change.
  if (!config.allowDirectMergeToMain) {
    return finishFailure(
      config,
      {
        pl: `Nie można przenieść zadania na Produkcję: automatyczny merge do '${main}' jest wyłączony.`,
        en: `Cannot move the task to Production: automatic merge into '${main}' is disabled.`,
      },
      {
        pl: [
          "Włącz ustawienie `branchBoard.allowDirectMergeToMain`, jeśli BranchBoard ma scalać do main.",
          `Albo scal '${branch}' ręcznie do '${remote}/${main}' poza BranchBoard.`,
          `Zadanie można zakończyć dopiero po udanym merge i push do ${remote}/${main}.`,
        ],
        en: [
          "Enable `branchBoard.allowDirectMergeToMain` if BranchBoard should merge into main.",
          `Or merge '${branch}' manually into '${remote}/${main}' outside BranchBoard.`,
          `The task can be finished only after a successful merge and push to ${remote}/${main}.`,
        ],
      }
    );
  }

  // Direct merge IS allowed -> require explicit confirmation before running
  // pre-finish commands, updating the branch, pushing, or touching main.
  if (config.requireConfirmationBeforeMerge) {
    const ok = await cb.confirm(
      config.language === "en"
        ? `Merge '${branch}' into '${main}' and push to ${remote}/${main}?`
        : `Scalić '${branch}' do '${main}' i wypchnąć na ${remote}/${main}?`,
      config.language === "en"
        ? "The task will stay in its current column unless the merge and push complete successfully."
        : "Zadanie zostanie w obecnej kolumnie, jeśli merge i push nie zakończą się sukcesem."
    );
    if (!ok) {
      return finishFailure(
        config,
        {
          pl: "Scalenie anulowane. Zadanie nie zostało przeniesione na Produkcję.",
          en: "Merge cancelled. The task was not moved to Production.",
        },
        {
          pl: [
            "Uruchom finish ponownie, kiedy chcesz faktycznie scalić branch do main.",
            `Zadanie można zakończyć dopiero po udanym merge i push do ${remote}/${main}.`,
          ],
          en: [
            "Run finish again when you are ready to actually merge the branch into main.",
            `The task can be finished only after a successful merge and push to ${remote}/${main}.`,
          ],
        }
      );
    }
  }

  // 3. Optional pre-finish command.
  if (config.runCommandBeforeFinish && config.runCommandBeforeFinish.trim()) {
    cb.info(`Running: ${config.runCommandBeforeFinish}`);
    const res = await git.runCommand(config.runCommandBeforeFinish);
    if (!res.ok) {
      return finishFailure(
        config,
        {
          pl: "Komenda przed zakończeniem zadania nie powiodła się.",
          en: "The pre-finish command failed.",
        },
        {
          pl: [
            `Uruchom lokalnie: \`${config.runCommandBeforeFinish}\`.`,
            "Napraw błąd i upewnij się, że komenda kończy się kodem 0.",
            "Dopiero potem spróbuj ponownie zakończyć zadanie.",
          ],
          en: [
            `Run locally: \`${config.runCommandBeforeFinish}\`.`,
            "Fix the failure and make sure the command exits with code 0.",
            "Then try finishing the task again.",
          ],
        },
        res.detail
      );
    }
  }

  // 4. Bring the task branch up to date with origin/main before publishing it.
  // This catches conflicts on the feature branch instead of discovering them
  // only after switching to main.
  const updateFromMain = await git.updateBranchFromMain(config.updateBranchStrategy);
  if (!updateFromMain.ok) {
    return finishFailure(
      config,
      {
        pl: `Nie udało się zaktualizować brancha '${branch}' z '${remote}/${main}'.`,
        en: `Could not update '${branch}' from '${remote}/${main}'.`,
      },
      {
        pl: [
          `Przełącz się na branch: \`git checkout ${branch}\`.`,
          `Pobierz main: \`git fetch ${remote} ${main}\`.`,
          config.updateBranchStrategy === "rebase"
            ? `Wykonaj rebase: \`git rebase ${remote}/${main}\`.`
            : `Wykonaj merge: \`git merge ${remote}/${main}\`.`,
          config.updateBranchStrategy === "rebase"
            ? "Rozwiąż konflikty, uruchom `git rebase --continue` i wypchnij branch."
            : "Rozwiąż konflikty, zacommituj merge i wypchnij branch.",
          "Potem ponownie przenieś zadanie na Produkcję.",
        ],
        en: [
          `Switch to the branch: \`git checkout ${branch}\`.`,
          `Fetch main: \`git fetch ${remote} ${main}\`.`,
          config.updateBranchStrategy === "rebase"
            ? `Rebase: \`git rebase ${remote}/${main}\`.`
            : `Merge: \`git merge ${remote}/${main}\`.`,
          config.updateBranchStrategy === "rebase"
            ? "Resolve conflicts, run `git rebase --continue`, and push the branch."
            : "Resolve conflicts, commit the merge, and push the branch.",
          "Then move the task to Production again.",
        ],
      },
      updateFromMain.detail
    );
  }
  cb.info(updateFromMain.message);

  // 5. Push the task branch.
  const push = await git.pushBranch(branch);
  if (!push.ok) {
    return finishFailure(
      config,
      {
        pl: `Nie udało się wypchnąć brancha '${branch}'.`,
        en: `Could not push branch '${branch}'.`,
      },
      {
        pl: [
          `Sprawdź połączenie i uprawnienia do remote '${remote}'.`,
          `Uruchom ręcznie: \`git push -u ${remote} ${branch}\`.`,
          "Po udanym push spróbuj ponownie zakończyć zadanie.",
        ],
        en: [
          `Check your connection and permissions for remote '${remote}'.`,
          `Run manually: \`git push -u ${remote} ${branch}\`.`,
          "After a successful push, try finishing the task again.",
        ],
      },
      push.detail
    );
  }
  cb.info(push.message);

  // 6b. Non-destructive safety nets before touching main.
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

  // 7. Checkout main, fast-forward from origin/main, merge, push.
  const checkoutMain = await git.checkoutBranch(main);
  if (!checkoutMain.ok) {
    return finishFailure(
      config,
      {
        pl: `Nie udało się przełączyć na branch '${main}'.`,
        en: `Could not switch to branch '${main}'.`,
      },
      {
        pl: [
          `Sprawdź, czy branch '${main}' istnieje lokalnie.`,
          `Jeśli go nie ma, pobierz go z remote: \`git fetch ${remote} ${main}\`.`,
          "Spróbuj ponownie po poprawnym checkout main.",
        ],
        en: [
          `Check whether branch '${main}' exists locally.`,
          `If it does not, fetch it from remote: \`git fetch ${remote} ${main}\`.`,
          "Try again after main can be checked out.",
        ],
      },
      checkoutMain.detail
    );
  }
  const pull = await git.pullMain();
  if (!pull.ok) {
    return finishFailure(
      config,
      {
        pl: `Nie udało się zaktualizować '${main}' z '${remote}/${main}'.`,
        en: `Could not update '${main}' from '${remote}/${main}'.`,
      },
      {
        pl: [
          `Uruchom: \`git checkout ${main}\`.`,
          `Potem: \`git fetch ${remote} ${main}\` i \`git merge --ff-only ${remote}/${main}\`.`,
          "Jeśli main ma lokalne zmiany albo remote jest dalej, rozwiąż to ręcznie i spróbuj ponownie.",
        ],
        en: [
          `Run: \`git checkout ${main}\`.`,
          `Then: \`git fetch ${remote} ${main}\` and \`git merge --ff-only ${remote}/${main}\`.`,
          "If main has local changes or the remote is ahead, resolve that manually and try again.",
        ],
      },
      pull.detail
    );
  }
  const merge = await git.mergeBranchToMain(branch);
  if (!merge.ok) {
    // Conflict already aborted inside mergeBranchToMain. Do NOT delete branch.
    return finishFailure(
      config,
      {
        pl: `Nie udało się scalić '${branch}' do '${main}'. Zadanie nie zostało zakończone.`,
        en: `Could not merge '${branch}' into '${main}'. The task was not finished.`,
      },
      {
        pl: [
          `Uruchom: \`git checkout ${main}\`.`,
          `Upewnij się, że main jest aktualny: \`git fetch ${remote} ${main}\` i \`git merge --ff-only ${remote}/${main}\`.`,
          `Spróbuj ręcznie: \`git merge ${branch}\`.`,
          "Rozwiąż konflikty, zacommituj merge i wypchnij main.",
          `Dopiero po udanym push do ${remote}/${main} przenieś zadanie na Produkcję.`,
        ],
        en: [
          `Run: \`git checkout ${main}\`.`,
          `Make sure main is current: \`git fetch ${remote} ${main}\` and \`git merge --ff-only ${remote}/${main}\`.`,
          `Try manually: \`git merge ${branch}\`.`,
          "Resolve conflicts, commit the merge, and push main.",
          `Move the task to Production only after a successful push to ${remote}/${main}.`,
        ],
      },
      merge.detail
    );
  }
  cb.info(merge.message);

  const pushMain = await git.pushBranch(main);
  if (!pushMain.ok) {
    return finishFailure(
      config,
      {
        pl: `Merge lokalny się udał, ale push '${main}' do '${remote}/${main}' nie powiódł się.`,
        en: `The local merge succeeded, but pushing '${main}' to '${remote}/${main}' failed.`,
      },
      {
        pl: [
          `Jesteś po lokalnym merge. Sprawdź: \`git checkout ${main}\` i \`git status\`.`,
          `Spróbuj wypchnąć main: \`git push ${remote} ${main}\`.`,
          "Jeśli push jest odrzucony, pobierz najnowszy main, rozwiąż rozjazd i wypchnij ponownie.",
          `Zadanie pozostaje nieukończone, dopóki push do ${remote}/${main} się nie uda.`,
        ],
        en: [
          `The local merge already happened. Check: \`git checkout ${main}\` and \`git status\`.`,
          `Try pushing main: \`git push ${remote} ${main}\`.`,
          "If the push is rejected, fetch the latest main, resolve the divergence, and push again.",
          `The task remains unfinished until the push to ${remote}/${main} succeeds.`,
        ],
      },
      pushMain.detail
    );
  }

  // 8. Optional branch cleanup (only after a fully successful merge+push).
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
    message:
      config.language === "en"
        ? `Task finished: '${branch}' was merged and pushed to ${remote}/${main}.`
        : `Zadanie zakończone: '${branch}' scalono i wypchnięto do ${remote}/${main}.`,
    moveToColumnId: "done",
    markDone: true,
  };
}
