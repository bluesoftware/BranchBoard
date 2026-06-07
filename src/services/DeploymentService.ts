import {
  BoardTask,
  BranchBoardConfig,
  Deployment,
  DeploymentEnvironment,
  OperationResult,
} from "../types";
import { GitService } from "./GitService";
import { BoardService } from "./BoardService";

/** Git-safe slug for URL templates (mirror of the webview slugify). */
function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Replace {{branchName}} / {{branchSlug}} placeholders in a template. */
export function fillTemplate(template: string, branchName: string): string {
  return (template || "")
    .replace(/\{\{\s*branchName\s*\}\}/g, branchName)
    .replace(/\{\{\s*branchSlug\s*\}\}/g, slugify(branchName));
}

export interface DeployCallbacks {
  confirm: (message: string, detail?: string) => Promise<boolean>;
  info: (message: string) => void;
}

/**
 * Runs configured deploy commands and records the result on the board.
 *
 * Safety model:
 *  - DEV deploys run the configured command (no shell metacharacters honoured).
 *  - Production deploys are refused unless allowProductionDeploy is true, and
 *    always require explicit confirmation when configured.
 *  - Every attempt is recorded as a Deployment + a board event, success or fail.
 */
export class DeploymentService {
  private static id(): string {
    return `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  static resolveUrl(config: BranchBoardConfig, branchName: string): string {
    if (!config.devDeployUrlTemplate) {
      return "";
    }
    return fillTemplate(config.devDeployUrlTemplate, branchName);
  }

  /**
   * Deploy a task's branch to an environment. Returns the operation result; the
   * Deployment record + events are written through BoardService.
   */
  static async deploy(
    git: GitService,
    board: BoardService,
    config: BranchBoardConfig,
    task: BoardTask,
    environment: DeploymentEnvironment,
    deployedBy: string | null,
    cb: DeployCallbacks
  ): Promise<OperationResult> {
    const branch = (task.branchName || "").trim();
    if (!branch) {
      return { ok: false, action: "deploy", message: "This task has no branch to deploy." };
    }

    const isProd = environment === "production";
    if (isProd && !config.allowProductionDeploy) {
      return {
        ok: false,
        action: "deploy",
        message: "Production deploy is disabled. Enable branchBoard.allowProductionDeploy first.",
      };
    }

    const rawCommand = isProd ? config.productionDeployCommand : config.devDeployCommand;
    if (!rawCommand || !rawCommand.trim()) {
      return {
        ok: false,
        action: "deploy",
        message: isProd
          ? "No production deploy command configured (branchBoard.productionDeployCommand)."
          : "No DEV deploy command configured (branchBoard.devDeployCommand).",
      };
    }

    if (isProd && config.requireConfirmationBeforeProductionDeploy) {
      const ok = await cb.confirm(
        `Deploy '${branch}' to PRODUCTION?`,
        `This runs: ${fillTemplate(rawCommand, branch)}`
      );
      if (!ok) {
        return { ok: true, action: "deploy", message: "Production deploy cancelled." };
      }
    }

    const command = fillTemplate(rawCommand, branch);
    const url = environment === "dev" ? DeploymentService.resolveUrl(config, branch) : "";

    // Record an in-progress deployment first.
    const dep: Deployment = {
      id: DeploymentService.id(),
      taskId: task.id,
      branchName: branch,
      environment,
      status: "deploying",
      url,
      deployedBy,
      deployedAt: new Date().toISOString(),
      command,
      logSummary: "",
      tested: false,
    };
    await board.upsertDeployment(dep);
    await board.logEvent("dev_deploy_started", { taskId: task.id, branchName: branch, payload: { environment } });
    cb.info(`Deploying ${branch} → ${environment}: ${command}`);

    const result = await git.runCommand(command);
    dep.status = result.ok ? "deployed" : "failed";
    dep.logSummary = (result.detail || result.message || "").slice(0, 2000);
    await board.upsertDeployment(dep);
    await board.logEvent(result.ok ? "dev_deploy_finished" : "dev_deploy_failed", {
      taskId: task.id,
      branchName: branch,
      payload: { environment },
    });

    return result.ok
      ? {
          ok: true,
          action: "deploy",
          message: `Deployed '${branch}' to ${environment}${url ? ` — ${url}` : ""}.`,
          detail: dep.logSummary,
        }
      : {
          ok: false,
          action: "deploy",
          message: `Deploy of '${branch}' to ${environment} failed.`,
          detail: dep.logSummary,
        };
  }
}
