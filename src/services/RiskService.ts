import { BoardTask, BranchInfo, RiskItem, RiskLevel, RiskReason } from "../types";
import { BranchAnalyticsService } from "./BranchAnalyticsService";

/** Default critical path fragments if none are configured. */
export const DEFAULT_CRITICAL_PATHS = [
  "payment", "checkout", "koszyk", "order", "auth",
  "admin", "database", "migration", "config", "security",
];

const LARGE_FILE_COUNT = 20;
const BIG_TASK_FILE_COUNT = 15;
const DIVERGED_BEHIND = 10;

/**
 * Rule-based risk scoring (0–100). No AI, no network — just the board state and
 * the read-only git analytics already gathered for the dashboard.
 */
export class RiskService {
  static level(score: number): RiskLevel {
    if (score >= 70) {
      return "critical";
    }
    if (score >= 45) {
      return "high";
    }
    if (score >= 20) {
      return "medium";
    }
    return "low";
  }

  private static touchesCritical(files: string[], criticalPaths: string[]): string | null {
    const paths = (criticalPaths.length ? criticalPaths : DEFAULT_CRITICAL_PATHS)
      .map((p) => p.toLowerCase())
      .filter(Boolean);
    for (const f of files) {
      const lower = f.toLowerCase();
      const hit = paths.find((p) => lower.includes(p));
      if (hit) {
        return hit;
      }
    }
    return null;
  }

  /**
   * Assess one task (optionally with its branch analytics). `inReviewOrTesting`
   * tells us whether a missing DEV deploy is a real warning.
   */
  static assess(
    task: BoardTask,
    branch: BranchInfo | null,
    opts: {
      criticalPaths: string[];
      columnName: string | null;
      inReviewOrTesting: boolean;
    }
  ): RiskItem {
    const reasons: RiskReason[] = [];
    const suggestions = new Set<string>();
    const add = (key: string, points: number, params?: Record<string, string | number>) =>
      reasons.push({ key, points, params });

    if (branch && branch.changedFilesCount > LARGE_FILE_COUNT) {
      add("cc.risk.r.manyFiles", 20, { count: branch.changedFilesCount });
      suggestions.add("cc.suggest.splitTask");
      suggestions.add("cc.suggest.checkFiles");
    }
    if (branch && BranchAnalyticsService.isStale(branch.lastCommitAt)) {
      add("cc.risk.r.staleBranch", 15);
      suggestions.add("cc.suggest.updateFromMain");
    }
    if (branch && branch.commitsBehindMain > DIVERGED_BEHIND) {
      add("cc.risk.r.behindMain", 20, { count: branch.commitsBehindMain });
      suggestions.add("cc.suggest.updateFromMain");
    }
    if (!task.description || !task.description.trim()) {
      add("cc.risk.r.noDescription", 15);
      suggestions.add("cc.suggest.addDescription");
    }
    if (!task.assignedUserId) {
      add("cc.risk.r.noAssignee", 10);
      suggestions.add("cc.suggest.assign");
    }
    if (branch) {
      const hit = RiskService.touchesCritical(branch.changedFiles, opts.criticalPaths);
      if (hit) {
        add("cc.risk.r.criticalPath", 20, { path: hit });
        suggestions.add("cc.suggest.requestReview");
        suggestions.add("cc.suggest.checkFiles");
      }
    }
    if (branch && opts.inReviewOrTesting && !branch.deployedToDev) {
      add("cc.risk.r.reviewNoDev", 20);
      suggestions.add("cc.suggest.deployDev");
    }
    if (
      branch &&
      branch.changedFilesCount > BIG_TASK_FILE_COUNT &&
      task.comments.length === 0
    ) {
      add("cc.risk.r.bigNoComments", 10);
      suggestions.add("cc.suggest.requestReview");
    }
    const aiNoChecklist =
      !!task.ai?.createdByAi && (!task.ai.reviewChecklist || task.ai.reviewChecklist.length === 0);
    if (aiNoChecklist) {
      add("cc.risk.r.aiNoChecklist", 15);
      suggestions.add("cc.suggest.addAiChecklist");
    }

    const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));
    return {
      taskId: task.id,
      taskTitle: task.title,
      branchName: task.branchName || branch?.branchName || null,
      assignedUserId: task.assignedUserId,
      columnName: opts.columnName,
      score,
      level: RiskService.level(score),
      reasons: reasons.sort((a, b) => b.points - a.points),
      suggestions: Array.from(suggestions),
    };
  }
}
