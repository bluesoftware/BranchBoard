import { BoardData, BranchInfo, GitInfo } from "../types";
import { GitService } from "./GitService";

/** A branch is considered stale after this many days without commits. */
export const STALE_BRANCH_DAYS = 5;

/**
 * Combines git branch stats with board state (tasks + deployments) into the
 * BranchInfo records the Command Center's Branch Flow view renders.
 *
 * All git access is read-only and network-free (see GitService.getBranchStats).
 */
export class BranchAnalyticsService {
  constructor(private readonly git: GitService) {}

  /** Whether an ISO timestamp is older than the stale threshold. */
  static isStale(lastCommitAt: string | null): boolean {
    if (!lastCommitAt) {
      return false;
    }
    const last = new Date(lastCommitAt).getTime();
    if (Number.isNaN(last)) {
      return false;
    }
    const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return ageDays > STALE_BRANCH_DAYS;
  }

  /**
   * Build BranchInfo for every branch that matters: the union of local branches
   * and branch names referenced by tasks. Branches a task points at but that
   * don't exist locally yet still appear (existsLocal=false) so the UI can flag
   * "task without a real branch".
   */
  async buildBranchInfos(board: BoardData, gitInfo: GitInfo): Promise<BranchInfo[]> {
    if (!gitInfo.isRepo) {
      return [];
    }
    const main = gitInfo.mainBranch || "main";
    const local = await this.git.listLocalBranches();
    const localNames = new Set(local.map((b) => b.name));

    const taskByBranch = new Map<string, string>();
    for (const task of board.tasks) {
      const branch = (task.branchName || "").trim();
      if (branch && !taskByBranch.has(branch)) {
        taskByBranch.set(branch, task.id);
      }
    }

    // Union of branch names, excluding the main branch itself.
    const names = new Set<string>();
    for (const n of localNames) {
      if (n && n !== main) {
        names.add(n);
      }
    }
    for (const n of taskByBranch.keys()) {
      if (n && n !== main) {
        names.add(n);
      }
    }

    const devBranches = new Set(
      board.deployments
        .filter((d) => d.environment === "dev" && d.status === "deployed")
        .map((d) => d.branchName)
    );

    const infos: BranchInfo[] = [];
    for (const name of names) {
      const stats = await this.git.getBranchStats(name, main);
      const deployedToDev = devBranches.has(name);
      const readyToMerge = stats.existsLocal && stats.existsRemote && stats.ahead > 0;
      infos.push({
        branchName: name,
        taskId: taskByBranch.get(name) ?? null,
        current: gitInfo.currentBranch === name,
        existsLocal: stats.existsLocal,
        existsRemote: stats.existsRemote,
        lastCommitAt: stats.lastCommitAt,
        lastCommitMessage: stats.lastCommitMessage,
        commitsAheadMain: stats.ahead,
        commitsBehindMain: stats.behind,
        changedFilesCount: stats.changedFiles,
        changedFiles: stats.changedFilePaths,
        hasConflicts: "unknown",
        deployedToDev,
        readyToMerge,
      });
    }

    // Newest activity first; branches without commits sink to the bottom.
    infos.sort((a, b) => {
      const ta = a.lastCommitAt ? new Date(a.lastCommitAt).getTime() : 0;
      const tb = b.lastCommitAt ? new Date(b.lastCommitAt).getTime() : 0;
      return tb - ta;
    });
    return infos;
  }
}
