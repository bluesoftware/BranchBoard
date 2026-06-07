import {
  AiReviewData,
  AiTaskRow,
  AttentionItem,
  BoardData,
  BoardColumn,
  BranchInfo,
  BranchFlowRow,
  BranchPipelineStages,
  DashboardData,
  GitInfo,
  ImpactArea,
  ImpactAreaStat,
  OverviewMetrics,
  RiskItem,
  RiskLevel,
  StageState,
  TeamMemberStats,
} from "../types";
import { BranchAnalyticsService } from "./BranchAnalyticsService";
import { EventService } from "./EventService";
import { RiskService } from "./RiskService";

type ColumnBucket =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "testing"
  | "done"
  | "blocked"
  | "other";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A task that hasn't changed in this many days while not done = "stuck". */
const STUCK_TASK_DAYS = 4;
/** Branch ahead of main by more than this many commits = large divergence. */
const BIG_DIFF_COMMITS = 20;

/**
 * Aggregates board + git analytics into the single DashboardData payload the
 * Command Center renders. Pure computation: no mutations, no git writes.
 */
export class DashboardService {
  /**
   * Classify a column into a coarse workflow bucket using id + name so the
   * dashboard works with both the Polish default columns (APP SKLEP, DO TESTU,
   * ZROBIONE…) and the English onboarding set (TODO, REVIEW, TESTING, DONE).
   */
  static classifyColumn(col: BoardColumn): ColumnBucket {
    const id = (col.id || "").toLowerCase();
    const name = (col.name || "").toLowerCase();
    const hay = `${id} ${name}`;
    if (id === "done" || /zrobione|gotowe|\bdone\b|ukończ|ukoncz/.test(hay)) {
      return "done";
    }
    if (/block|zablokow|wstrzym/.test(hay)) {
      return "blocked";
    }
    if (/test|do.?testu|qa/.test(hay)) {
      return "testing";
    }
    if (/review|przegl|do.?zatwierdz|code.?review/.test(hay)) {
      return "review";
    }
    if (/in.?progress|w.?toku|w.?trakcie|doing|robocz/.test(hay)) {
      return "in-progress";
    }
    if (/backlog|zaleg|pomys/.test(hay)) {
      return "backlog";
    }
    if (/todo|to.?do|do.?zrobienia|nowe/.test(hay)) {
      return "todo";
    }
    return "other";
  }

  private static recent(iso: string | null | undefined, windowMs = WEEK_MS): boolean {
    if (!iso) {
      return false;
    }
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && Date.now() - t <= windowMs;
  }

  private static olderThanDays(iso: string | null | undefined, days: number): boolean {
    if (!iso) {
      return false;
    }
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) {
      return false;
    }
    return (Date.now() - t) / (1000 * 60 * 60 * 24) > days;
  }

  /** Light risk classification for the Branch Flow view (full Risk Radar is a later stage). */
  private static riskFor(info: BranchInfo, bucket: ColumnBucket, hasTask: boolean): RiskLevel {
    let score = 0;
    if (info.changedFilesCount > BIG_DIFF_COMMITS) {
      score += 25;
    } else if (info.changedFilesCount > 8) {
      score += 10;
    }
    if (BranchAnalyticsService.isStale(info.lastCommitAt)) {
      score += 20;
    }
    if (info.commitsBehindMain > 10) {
      score += 15;
    }
    if (!hasTask) {
      score += 15;
    }
    if ((bucket === "review" || bucket === "testing") && !info.deployedToDev) {
      score += 15;
    }
    if (info.commitsAheadMain > 0 && !info.existsRemote) {
      score += 10;
    }
    if (score >= 60) {
      return "critical";
    }
    if (score >= 35) {
      return "high";
    }
    if (score >= 15) {
      return "medium";
    }
    return "low";
  }

  private static stagesFor(
    info: BranchInfo,
    bucket: ColumnBucket,
    hasTask: boolean,
    stale: boolean
  ): BranchPipelineStages {
    const task: StageState = hasTask ? "done" : "attention";
    const branch: StageState = info.existsLocal ? "done" : "idle";
    const commits: StageState = info.commitsAheadMain > 0 ? "done" : info.existsLocal ? "attention" : "idle";
    const push: StageState = info.existsRemote
      ? "done"
      : info.commitsAheadMain > 0
        ? "attention"
        : "idle";
    const dev: StageState = info.deployedToDev ? "done" : "idle";
    const reviewReached = bucket === "review" || bucket === "testing" || bucket === "done";
    const review: StageState = reviewReached ? "done" : "idle";
    const testingReached = bucket === "testing" || bucket === "done";
    const testing: StageState = testingReached
      ? "done"
      : bucket === "review"
        ? "active"
        : "idle";
    const merge: StageState =
      bucket === "done" ? "done" : info.readyToMerge ? "active" : "idle";

    const stages: BranchPipelineStages = { task, branch, commits, push, dev, review, testing, merge };
    if (stale) {
      // Surface staleness on whichever stage is currently the frontier.
      if (commits === "done" && push !== "done") {
        stages.push = "attention";
      } else if (push === "done" && dev !== "done") {
        stages.dev = "attention";
      }
    }
    return stages;
  }

  /** Build the complete dashboard payload. */
  /** Group changed files of active branches into configured impact areas. */
  static classifyChangedFiles(
    branchInfos: BranchInfo[],
    board: BoardData,
    areas: ImpactArea[],
    criticalPaths: string[]
  ): ImpactAreaStat[] {
    const crit = (criticalPaths.length ? criticalPaths : []).map((p) => p.toLowerCase());
    const taskTitle = (taskId: string | null) =>
      taskId ? board.tasks.find((t) => t.id === taskId)?.title ?? null : null;
    return areas
      .map((area) => {
        const needles = area.paths.map((p) => p.toLowerCase()).filter(Boolean);
        const branches = new Set<string>();
        const tasks = new Set<string>();
        let files = 0;
        let critical = false;
        for (const info of branchInfos) {
          let hit = false;
          for (const f of info.changedFiles) {
            const lower = f.toLowerCase();
            if (needles.some((n) => lower.includes(n))) {
              files++;
              hit = true;
              if (crit.some((c) => lower.includes(c))) {
                critical = true;
              }
            }
          }
          if (hit) {
            branches.add(info.branchName);
            const tt = taskTitle(info.taskId);
            if (tt) {
              tasks.add(tt);
            }
          }
        }
        return {
          id: area.id,
          name: area.name,
          files,
          branches: Array.from(branches),
          tasks: Array.from(tasks),
          critical,
        };
      })
      .filter((a) => a.files > 0)
      .sort((a, b) => b.files - a.files);
  }

  static build(
    board: BoardData,
    gitInfo: GitInfo,
    branchInfos: BranchInfo[],
    criticalPaths: string[] = [],
    impactAreas: ImpactArea[] = []
  ): DashboardData {
    const colById = new Map(board.columns.map((c) => [c.id, c]));
    const bucketOf = (columnId: string): ColumnBucket => {
      const col = colById.get(columnId);
      return col ? DashboardService.classifyColumn(col) : "other";
    };

    /* ---------- Overview metrics ---------- */
    const overview: OverviewMetrics = {
      activeTasks: 0,
      inProgress: 0,
      inReview: 0,
      inTesting: 0,
      readyToMerge: 0,
      blocked: 0,
      branchesWithoutTask: 0,
      tasksWithoutBranch: 0,
      doneThisWeek: 0,
      totalTasks: board.tasks.length,
    };

    for (const task of board.tasks) {
      const bucket = bucketOf(task.columnId);
      const isDone = bucket === "done" || task.status === "done";
      if (isDone) {
        if (DashboardService.recent(task.finishedAt) || DashboardService.recent(task.updatedAt)) {
          overview.doneThisWeek++;
        }
        continue;
      }
      overview.activeTasks++;
      if (bucket === "in-progress") {
        overview.inProgress++;
      }
      if (bucket === "review") {
        overview.inReview++;
      }
      if (bucket === "testing") {
        overview.inTesting++;
      }
      if (bucket === "blocked") {
        overview.blocked++;
      }
      if (!task.branchName || !task.branchName.trim()) {
        overview.tasksWithoutBranch++;
      }
    }

    overview.branchesWithoutTask = branchInfos.filter((b) => b.existsLocal && !b.taskId).length;
    overview.readyToMerge = branchInfos.filter((b) => b.readyToMerge).length;

    /* ---------- Branch flow rows ---------- */
    const taskById = new Map(board.tasks.map((t) => [t.id, t]));
    const branchFlow: BranchFlowRow[] = branchInfos.map((info) => {
      const task = info.taskId ? taskById.get(info.taskId) : undefined;
      const col = task ? colById.get(task.columnId) : undefined;
      const bucket = col ? DashboardService.classifyColumn(col) : "other";
      const stale = BranchAnalyticsService.isStale(info.lastCommitAt);
      return {
        branchName: info.branchName,
        taskId: info.taskId,
        taskTitle: task?.title ?? null,
        assignedUserId: task?.assignedUserId ?? null,
        columnId: task?.columnId ?? null,
        columnName: col?.name ?? null,
        info,
        riskLevel: DashboardService.riskFor(info, bucket, !!task),
        stages: DashboardService.stagesFor(info, bucket, !!task, stale),
        stale,
      };
    });

    /* ---------- Team stats ---------- */
    const branchCountByUser = new Map<string, number>();
    for (const row of branchFlow) {
      if (row.assignedUserId) {
        branchCountByUser.set(row.assignedUserId, (branchCountByUser.get(row.assignedUserId) ?? 0) + 1);
      }
    }
    const lastActivityByUser = new Map<string, string>();
    for (const ev of board.events) {
      if (ev.userId) {
        const prev = lastActivityByUser.get(ev.userId);
        if (!prev || ev.createdAt > prev) {
          lastActivityByUser.set(ev.userId, ev.createdAt);
        }
      }
    }

    const team: TeamMemberStats[] = board.users.map((u) => {
      const stats: TeamMemberStats = {
        userId: u.id,
        name: u.name,
        email: u.email,
        avatarText: u.avatarText,
        color: u.color,
        active: 0,
        inReview: 0,
        inTesting: 0,
        doneThisWeek: 0,
        branches: branchCountByUser.get(u.id) ?? 0,
        lastActivityAt: lastActivityByUser.get(u.id) ?? null,
        blocked: 0,
      };
      for (const task of board.tasks) {
        if (task.assignedUserId !== u.id) {
          continue;
        }
        const bucket = bucketOf(task.columnId);
        const isDone = bucket === "done" || task.status === "done";
        if (isDone) {
          if (DashboardService.recent(task.finishedAt) || DashboardService.recent(task.updatedAt)) {
            stats.doneThisWeek++;
          }
          continue;
        }
        stats.active++;
        if (bucket === "review") {
          stats.inReview++;
        }
        if (bucket === "testing") {
          stats.inTesting++;
        }
        if (bucket === "blocked") {
          stats.blocked++;
        }
      }
      return stats;
    });

    /* ---------- Attention items ---------- */
    const attention: AttentionItem[] = [];
    const branchByName = new Map(branchInfos.map((b) => [b.branchName, b]));

    for (const task of board.tasks) {
      const bucket = bucketOf(task.columnId);
      const isDone = bucket === "done" || task.status === "done";
      if (isDone) {
        continue;
      }
      const branch = task.branchName ? branchByName.get(task.branchName.trim()) : undefined;

      if (DashboardService.olderThanDays(task.updatedAt, STUCK_TASK_DAYS)) {
        attention.push({
          id: `stuck_${task.id}`,
          reasonKey: "cc.attn.stuck",
          params: { title: task.title, days: STUCK_TASK_DAYS },
          severity: "medium",
          taskId: task.id,
        });
      }
      if (!task.assignedUserId) {
        attention.push({
          id: `noassignee_${task.id}`,
          reasonKey: "cc.attn.noAssignee",
          params: { title: task.title },
          severity: "low",
          taskId: task.id,
        });
      }
      if (!task.branchName || !task.branchName.trim()) {
        attention.push({
          id: `nobranch_${task.id}`,
          reasonKey: "cc.attn.taskNoBranch",
          params: { title: task.title },
          severity: "low",
          taskId: task.id,
        });
      }
      if (branch && branch.existsLocal && branch.commitsAheadMain === 0) {
        attention.push({
          id: `nocommits_${task.id}`,
          reasonKey: "cc.attn.noCommits",
          params: { branch: branch.branchName },
          severity: "low",
          taskId: task.id,
          branchName: branch.branchName,
        });
      }
      if (branch && branch.commitsAheadMain > 0 && !branch.existsRemote) {
        attention.push({
          id: `notpushed_${task.id}`,
          reasonKey: "cc.attn.notPushed",
          params: { branch: branch.branchName },
          severity: "medium",
          taskId: task.id,
          branchName: branch.branchName,
        });
      }
      if (branch && branch.commitsAheadMain > BIG_DIFF_COMMITS) {
        attention.push({
          id: `bigdiff_${task.id}`,
          reasonKey: "cc.attn.bigDiff",
          params: { branch: branch.branchName, count: branch.commitsAheadMain },
          severity: "high",
          taskId: task.id,
          branchName: branch.branchName,
        });
      }
      if ((bucket === "review" || bucket === "testing") && branch && !branch.deployedToDev) {
        attention.push({
          id: `reviewnodev_${task.id}`,
          reasonKey: "cc.attn.reviewNoDev",
          params: { title: task.title },
          severity: "medium",
          taskId: task.id,
          branchName: branch.branchName,
        });
      }
    }

    // Local branches not linked to any task.
    for (const info of branchInfos) {
      if (info.existsLocal && !info.taskId) {
        attention.push({
          id: `branchnotask_${info.branchName}`,
          reasonKey: "cc.attn.branchNoTask",
          params: { branch: info.branchName },
          severity: "low",
          branchName: info.branchName,
        });
      }
    }

    const severityRank: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    /* ---------- Risk Radar ---------- */
    const riskByTask = new Map<string, RiskItem>();
    const riskRadar: RiskItem[] = [];
    for (const task of board.tasks) {
      const bucket = bucketOf(task.columnId);
      if (bucket === "done" || task.status === "done") {
        continue;
      }
      const branch = task.branchName ? branchByName.get(task.branchName.trim()) ?? null : null;
      const item = RiskService.assess(task, branch, {
        criticalPaths,
        columnName: colById.get(task.columnId)?.name ?? null,
        inReviewOrTesting: bucket === "review" || bucket === "testing",
      });
      riskByTask.set(task.id, item);
      if (item.score > 0) {
        riskRadar.push(item);
      }
    }
    riskRadar.sort((a, b) => b.score - a.score);

    /* ---------- AI Review ---------- */
    const aiReview = DashboardService.buildAiReview(board, colById, bucketOf, riskByTask);

    return {
      generatedAt: new Date().toISOString(),
      isRepo: gitInfo.isRepo,
      mainBranch: gitInfo.mainBranch || "main",
      overview,
      attention,
      team,
      branchFlow,
      riskRadar,
      aiReview,
      impact: DashboardService.classifyChangedFiles(branchInfos, board, impactAreas, criticalPaths),
      recentEvents: EventService.list(board, "all", 60),
    };
  }

  private static buildAiReview(
    board: BoardData,
    colById: Map<string, BoardColumn>,
    bucketOf: (columnId: string) => ColumnBucket,
    riskByTask: Map<string, RiskItem>
  ): AiReviewData {
    const assisted: AiTaskRow[] = [];
    const withoutChecklist: AiTaskRow[] = [];
    const highRisk: AiTaskRow[] = [];
    const readyForReview: AiTaskRow[] = [];

    for (const task of board.tasks) {
      if (!task.ai?.createdByAi) {
        continue;
      }
      const checklist = task.ai.reviewChecklist ?? [];
      const done = checklist.filter((c) => c.done).length;
      const risk = riskByTask.get(task.id);
      const row: AiTaskRow = {
        taskId: task.id,
        title: task.title,
        columnName: colById.get(task.columnId)?.name ?? null,
        assignedUserId: task.assignedUserId,
        riskLevel: risk?.level ?? "low",
        usedModel: task.ai.usedModel || "",
        checklistDone: done,
        checklistTotal: checklist.length,
      };
      assisted.push(row);
      const isDone = bucketOf(task.columnId) === "done" || task.status === "done";
      if (checklist.length === 0) {
        withoutChecklist.push(row);
      }
      if ((row.riskLevel === "high" || row.riskLevel === "critical") && !isDone) {
        highRisk.push(row);
      }
      if (checklist.length > 0 && done === checklist.length && !isDone) {
        readyForReview.push(row);
      }
    }

    return { totalAssisted: assisted.length, assisted, withoutChecklist, highRisk, readyForReview };
  }
}
