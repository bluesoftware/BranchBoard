import { AiContextLevel, AiCostRisk } from "../types";

export interface RiskEstimationInput {
  fileCount: number;
  promptLength: number;
  contextLevel: AiContextLevel;
  includeFullFiles: boolean;
  includeChatHistory: boolean;
  /** True when modelPreference points at a known pricier model (opus/gpt-5/etc.). */
  expensiveModel: boolean;
}

/**
 * Pure scoring function: turns the shape of a planned Cursor CLI call into a
 * low/medium/high cost-risk label. No I/O, no model calls, no side effects —
 * deterministic so the UI's "Cost risk" badge is always explainable.
 */
export class AiCostRiskEstimator {
  estimate(input: RiskEstimationInput): AiCostRisk {
    let score = 0;

    if (input.fileCount > 8) score += 3;
    else if (input.fileCount > 3) score += 1;

    if (input.promptLength > 20000) score += 3;
    else if (input.promptLength > 6000) score += 1;

    if (input.contextLevel === "full") score += 3;
    else if (input.contextLevel === "normal") score += 1;

    if (input.includeFullFiles) score += 2;
    if (input.includeChatHistory) score += 2;
    if (input.expensiveModel) score += 2;

    if (score >= 7) return "high";
    if (score >= 3) return "medium";
    return "low";
  }

  /** Best-effort guess at whether a model id/name is one of the pricier tiers. */
  isExpensiveModel(modelId: string | undefined): boolean {
    if (!modelId) return false;
    const m = modelId.toLowerCase();
    return /opus|gpt-5(?!-mini)|gpt5(?!-mini)|gemini-3-pro|o1-preview|o3(?!-mini)/.test(m);
  }
}
