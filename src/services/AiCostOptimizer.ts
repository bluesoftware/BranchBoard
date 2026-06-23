import {
  AiCostDecision,
  AiCostDecisionRequestPayload,
  AiDecisionAction,
  BoardTask,
  BranchBoardConfig,
} from "../types";
import { GitService } from "./GitService";
import { AiContextSelector } from "./AiContextSelector";
import { AiCostRiskEstimator } from "./AiCostRiskEstimator";
import { AiPromptOptimizer } from "./AiPromptOptimizer";
import { AiLocalModelProvider } from "./AiLocalModelProvider";
import { AiSessionMemoryService } from "./AiSessionMemoryService";

export interface AiCostOptimizerResult extends AiCostDecision {
  usedLocalModel: boolean;
  localModelError?: string;
}

/**
 * Main decision service for the AI Cost Guard / Local AI Optimizer feature.
 *
 * IMPORTANT — this service ONLY decides what to send to Cursor CLI. It never
 * runs Git, never executes commands, and never invokes Cursor CLI itself;
 * BoardPanel calls the existing AIAgentService/GitService for that, gated by
 * the `action`/`requiresUserConfirmation` this returns. An optional local
 * model (AiLocalModelProvider) may advise on `action`/`contextLevel`/
 * `modelPreference`, but its output is strictly validated and can never
 * bypass the settings limits applied here (maxFilesInContext,
 * maxPromptChars, requireConfirmForFullContext, expensiveModelsRequireConfirm).
 */
export class AiCostOptimizer {
  private readonly contextSelector = new AiContextSelector();
  private readonly riskEstimator = new AiCostRiskEstimator();
  private readonly promptOptimizer = new AiPromptOptimizer();
  private readonly localModel: AiLocalModelProvider;
  private readonly sessionMemory = new AiSessionMemoryService();

  constructor(
    private readonly cwd: string,
    private readonly getConfig: () => BranchBoardConfig,
    private readonly git: GitService
  ) {
    this.localModel = new AiLocalModelProvider(cwd, getConfig);
  }

  async decide(task: BoardTask, request: AiCostDecisionRequestPayload): Promise<AiCostOptimizerResult> {
    const cfg = this.getConfig();

    const mainBranch = await this.git.getMainBranch().catch(() => "main");
    const [hasUncommitted, workingTreeChanged, branchDiffFiles] = await Promise.all([
      this.git.hasUncommittedChanges().catch(() => false),
      this.git.getWorkingTreeChangedFiles().catch(() => []),
      task.branchName ? this.git.getBranchDiffFiles(task.branchName, mainBranch).catch(() => []) : Promise.resolve([]),
    ]);

    const branchChangedFiles: string[] = Array.isArray(branchDiffFiles)
      ? branchDiffFiles.map((f: any) => f.path).filter(Boolean)
      : [];
    const workingTreeChangedFiles: string[] = Array.isArray(workingTreeChanged)
      ? workingTreeChanged.map((f: any) => f.path).filter(Boolean)
      : [];
    const attachedFiles = task.attachedFiles || [];

    const memory = this.sessionMemory.getMemory(task);
    const recentChatTurns = (task.comments || []).slice(-4).map((c) => c.text);

    // 1. Decide the action — explicit override first, then a small set of
    // deterministic heuristics, then (optionally) the local model's advice.
    let action: AiDecisionAction = request.forceAction || ruleBasedAction(request.userMessage, cfg.aiCostMode);
    let modelPreference: string | undefined;
    let reasonParts: string[] = [];
    let usedLocalModel = false;
    let localModelError: string | undefined;

    if (!request.forceAction && cfg.aiLocalOptimizer?.enabled) {
      const advice = await this.localModel.getSuggestion({
        taskTitle: task.title,
        userMessage: request.userMessage,
        fileCount: branchChangedFiles.length + workingTreeChangedFiles.length,
        hasUncommittedChanges: !!hasUncommitted,
        costMode: cfg.aiCostMode,
        defaultContextLevel: cfg.aiCli.defaultContextLevel,
        chatSummary: memory.lastChatSummary,
      });
      if (advice.ok && advice.suggestion) {
        usedLocalModel = true;
        if (advice.suggestion.action) {
          action = advice.suggestion.action;
        }
        if (advice.suggestion.modelPreference) {
          modelPreference = advice.suggestion.modelPreference;
        }
        if (advice.suggestion.reason) {
          reasonParts.push(advice.suggestion.reason);
        }
      } else if (advice.error && advice.error !== "disabled") {
        localModelError = advice.error;
      }
    }

    // 2. Pick context level + files.
    const contextSelection = this.contextSelector.select({
      action,
      branchChangedFiles,
      workingTreeChangedFiles,
      attachedFiles,
      defaultContextLevel: cfg.aiCli.defaultContextLevel,
      maxFilesInContext: cfg.aiCli.maxFilesInContext,
      requireConfirmForFullContext: cfg.aiCli.requireConfirmForFullContext,
      alreadyConfirmed: !!request.confirmed,
    });

    let contextLevel = request.forceContextLevel || contextSelection.contextLevel;
    let selectedFiles = contextSelection.selectedFiles;
    let includeDiff = contextSelection.includeDiff;
    let includeFullFiles = contextSelection.includeFullFiles;
    if (request.forceContextLevel && request.forceContextLevel !== contextSelection.contextLevel) {
      // The user explicitly shrank the context — never re-expand it here.
      includeFullFiles = request.forceContextLevel === "full" && !cfg.aiCli.requireConfirmForFullContext;
      includeDiff = true;
      reasonParts.push(
        request.forceContextLevel === "small"
          ? "Context manually reduced by the user."
          : `Context manually set to ${request.forceContextLevel}.`
      );
    }

    const includeChatSummary = !!memory.lastChatSummary && action !== "answer_local";
    const includeChatHistory = !includeChatSummary && action !== "answer_local" && recentChatTurns.length > 0;

    // 3. Build the optimized prompt.
    const optimizedPrompt = this.promptOptimizer.build({
      taskTitle: task.title,
      taskDescription: task.description || "",
      acceptanceCriteria: task.acceptanceCriteria,
      branchName: task.branchName || "",
      userMessage: request.userMessage,
      selectedFiles,
      includeDiff,
      includeFullFiles,
      contextLevel,
      sessionMemory: memory,
      includeChatHistory,
      includeChatSummary,
      recentChatTurns,
      maxPromptChars: cfg.aiCli.maxPromptChars,
    });

    // 4. Estimate cost risk from the *final* shape of the request.
    const expensiveModel = this.riskEstimator.isExpensiveModel(modelPreference);
    const costRisk = this.riskEstimator.estimate({
      fileCount: selectedFiles.length,
      promptLength: optimizedPrompt.length,
      contextLevel,
      includeFullFiles,
      includeChatHistory,
      expensiveModel,
    });

    // 5. Decide whether explicit confirmation is required, and honor an
    // already-confirmed request (the user clicked "confirm" on a previous
    // decision with the same shape).
    const needsContextConfirm = contextSelection.requiresUserConfirmation && !request.forceContextLevel;
    const needsModelConfirm = expensiveModel && cfg.aiCli.expensiveModelsRequireConfirm;
    const needsRiskConfirm = costRisk === "high";
    const requiresUserConfirmation = !request.confirmed && (needsContextConfirm || needsModelConfirm || needsRiskConfirm);

    if (needsContextConfirm) reasonParts.push("Full context requires confirmation.");
    if (needsModelConfirm) reasonParts.push(`Model "${modelPreference}" is pricier and requires confirmation.`);
    if (needsRiskConfirm) reasonParts.push("Estimated cost risk is high.");
    if (reasonParts.length === 0) {
      reasonParts.push(defaultReason(action, contextLevel));
    }

    return {
      action,
      costRisk,
      contextLevel,
      modelPreference,
      selectedFiles,
      includeDiff,
      includeFullFiles,
      includeChatHistory,
      includeChatSummary,
      requiresUserConfirmation,
      reason: reasonParts.join(" "),
      optimizedPrompt,
      usedLocalModel,
      localModelError,
    };
  }
}

function ruleBasedAction(userMessage: string, costMode: BranchBoardConfig["aiCostMode"]): AiDecisionAction {
  const msg = (userMessage || "").trim();
  const lower = msg.toLowerCase();

  if (/review|sprawd[zź]|code\s*review|popraw(?:noś[cć])?\s*kod/.test(lower)) {
    return "cursor_review";
  }
  if (/^\s*(plan|zaplanuj|jak\s+bym|how\s+would)/.test(lower)) {
    return "cursor_plan";
  }
  const isQuestionOnly = /\?\s*$/.test(msg) && !/(zmień|dodaj|napraw|zaimplementuj|add|fix|implement|refactor|change)/.test(lower);
  if (isQuestionOnly && msg.length < 200) {
    return costMode === "cheap" ? "answer_local" : "answer_local";
  }
  if (costMode === "manual") {
    return "prepare_prompt";
  }
  return "cursor_work";
}

function defaultReason(action: AiDecisionAction, contextLevel: string): string {
  switch (action) {
    case "answer_local":
      return "Looks like a quick question — answered locally without using Cursor CLI.";
    case "prepare_prompt":
      return "Prompt prepared for manual review before running anything.";
    case "cursor_plan":
      return `Planning step via Cursor CLI with ${contextLevel} context.`;
    case "cursor_review":
      return `Review via Cursor CLI, preferring a diff over full files (${contextLevel} context).`;
    default:
      return `Work step via Cursor CLI with ${contextLevel} context.`;
  }
}
