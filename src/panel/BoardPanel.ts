import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  AppConfig,
  BoardData,
  BranchBoardConfig,
  GitInfo,
  InboundMessage,
  NOTIFICATION_SOUND_IDS,
  NotificationType,
  OperationResult,
  OutboundMessage,
} from "../types";
import { BoardService } from "../services/BoardService";
import { GitService, finishTaskGitFlow } from "../services/GitService";
import { CommandRunnerService, HookContext } from "../services/CommandRunnerService";
import { ColumnHook } from "../types";
import { BranchAnalyticsService } from "../services/BranchAnalyticsService";
import { DashboardService } from "../services/DashboardService";
import { DeploymentService } from "../services/DeploymentService";
import { SafetyService } from "../services/SafetyService";
import { SshSqliteStorageProvider } from "../services/ServerStorageProvider";
import { Logger } from "../services/Logger";
import { ONBOARDING_COLUMNS } from "../services/StorageProvider";
import { t, setLanguage } from "../i18n";

export type CommandCenterPage = "board" | "command";

export interface ControllerDeps {
  context: vscode.ExtensionContext;
  board: BoardService;
  git: GitService;
  getConfig: () => BranchBoardConfig;
}

/**
 * Resolve the active board user from config + git identity.
 */
export function resolveCurrentUserId(
  board: BoardData,
  git: GitInfo,
  config: BranchBoardConfig
): string | null {
  if (config.currentUser && board.users.some((u) => u.id === config.currentUser)) {
    return config.currentUser;
  }
  if (config.autoDetectGitUser) {
    if (git.userEmail) {
      const byEmail = board.users.find(
        (u) => u.email && u.email.toLowerCase() === git.userEmail!.toLowerCase()
      );
      if (byEmail) {
        return byEmail.id;
      }
    }
    if (git.userName) {
      const byName = board.users.find(
        (u) => u.name && u.name.toLowerCase() === git.userName!.toLowerCase()
      );
      if (byName) {
        return byName.id;
      }
    }
  }
  return board.users[0]?.id ?? null;
}

/**
 * Wires a single vscode.Webview (panel OR sidebar view) to the services.
 * Handles all inbound messages and pushes board/git state back out.
 */
export class WebviewController {
  private boardSub: (() => void) | undefined;
  private notifSub: (() => void) | undefined;
  private configSub: vscode.Disposable | undefined;
  private readonly analytics: BranchAnalyticsService;
  private readonly runner: CommandRunnerService;
  /** Set once the webview requests dashboard data, so we keep it live on changes. */
  private dashboardRequested = false;
  /** Page to navigate to once the webview signals "ready". */
  private pendingPage: CommandCenterPage | undefined;
  /** The board user id resolved for THIS extension/window instance — used to
   *  decide whether a native toast for a notification should appear here. */
  private currentUserId: string | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly deps: ControllerDeps
  ) {
    this.analytics = new BranchAnalyticsService(this.deps.git);
    this.runner = new CommandRunnerService(this.deps.git.getCwd(), this.deps.getConfig);
    this.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.deps.context.extensionUri, "webview", "dist"),
        vscode.Uri.joinPath(this.deps.context.extensionUri, "media"),
      ],
    };
    this.webview.html = this.getHtml();

    this.webview.onDidReceiveMessage((msg: InboundMessage) => this.onMessage(msg));

    // Re-push board on any change (and the dashboard if it's being viewed).
    this.boardSub = this.deps.board.onBoardChanged((b) => {
      this.postBoard(b);
      if (this.dashboardRequested) {
        void this.postDashboard();
      }
    });
    // External-change notifications surface as in-board info toasts.
    this.notifSub = this.deps.board.onNotification((n) =>
      this.post({ type: "notification", payload: { message: n.message } })
    );
    // Keep the webview's config in sync when the user edits settings anywhere.
    this.configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("branchBoard")) {
        setLanguage(this.deps.getConfig().language);
        this.postAppConfig();
        void this.postGitInfo();
      }
    });
  }

  dispose() {
    this.boardSub?.();
    this.notifSub?.();
    this.configSub?.dispose();
  }

  private post(msg: OutboundMessage) {
    void this.webview.postMessage(msg);
  }

  private postBoard(board: BoardData) {
    this.post({ type: "boardData", payload: board });
  }

  /** Resolve the bundled notification sound files into webview-loadable URIs. */
  private getSoundFileUris(): Record<string, string> {
    const distRoot = vscode.Uri.joinPath(this.deps.context.extensionUri, "webview", "dist");
    const files: Record<string, string> = {};
    for (const id of NOTIFICATION_SOUND_IDS) {
      files[id] = this.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "sounds", `${id}.mp3`)).toString();
    }
    return files;
  }

  private postAppConfig() {
    const c = this.deps.getConfig();
    const payload: AppConfig = {
      language: c.language,
      projectName: c.projectName,
      boardTitle: c.boardTitle,
      storageMode: c.storageMode,
      activeStorageKind: this.deps.board.getStorageKind(),
      aiPromptTemplate: c.aiPromptTemplate,
      ssh: {
        sshKeyPath: c.sshKeyPath,
        sshHost: c.sshHost,
        sshPort: c.sshPort,
        sqliteRemotePath: c.sqliteRemotePath,
      },
      appearance: c.appearance,
      notifications: c.notifications,
      soundFiles: this.getSoundFileUris(),
      policy: {
        allowDirectMergeToMain: c.allowDirectMergeToMain,
        requireConfirmationBeforeMerge: c.requireConfirmationBeforeMerge,
        requireCleanWorkingTreeBeforeFinish: c.requireCleanWorkingTreeBeforeFinish,
        runCommandBeforeFinish: c.runCommandBeforeFinish,
        defaultMainBranch: c.defaultMainBranch,
        remoteName: c.remoteName,
        localDataFile: c.localDataFile,
        syncIntervalSeconds: c.syncIntervalSeconds,
        deleteLocalBranchAfterMerge: c.deleteLocalBranchAfterMerge,
        deleteRemoteBranchAfterMerge: c.deleteRemoteBranchAfterMerge,
        criticalPaths: c.criticalPaths,
        impactAreas: c.impactAreas,
        updateBranchStrategy: c.updateBranchStrategy,
        finishOnMoveToDone: c.finishOnMoveToDone,
        devDeployCommand: c.devDeployCommand,
        devDeployUrlTemplate: c.devDeployUrlTemplate,
        productionBranch: c.productionBranch,
        productionDeployCommand: c.productionDeployCommand,
        allowProductionDeploy: c.allowProductionDeploy,
        requireConfirmationBeforeProductionDeploy: c.requireConfirmationBeforeProductionDeploy,
        createSafetyTagBeforeMerge: c.createSafetyTagBeforeMerge,
        createBackupBranchBeforeMerge: c.createBackupBranchBeforeMerge,
        enableColumnHooks: c.enableColumnHooks,
        allowedCommands: c.allowedCommands,
        hookTimeoutSeconds: c.hookTimeoutSeconds,
        useDevBranch: c.useDevBranch,
        defaultBranchPrefix: c.defaultBranchPrefix,
        devBranch: c.devBranch,
        runGitActionsOnMove: c.runGitActionsOnMove,
        confirmGitActionsOnMove: c.confirmGitActionsOnMove,
      },
    };
    this.post({ type: "appConfig", payload });
  }

  private async postGitInfo() {
    const info = await this.deps.git.getInfo();
    const board = this.deps.board.getBoard();
    const currentUserId = resolveCurrentUserId(board, info, this.deps.getConfig());
    this.currentUserId = currentUserId;
    this.deps.board.setNotificationContext(currentUserId ?? "");
    this.post({ type: "gitInfo", payload: { git: info, currentUserId } });
  }

  /** Compute and push the full Command Center dashboard payload. */
  private async postDashboard() {
    this.dashboardRequested = true;
    try {
      const board = this.deps.board.getBoard();
      const info = await this.deps.git.getInfo();
      const branchInfos = await this.analytics.buildBranchInfos(board, info);
      const cfg = this.deps.getConfig();
      const data = DashboardService.build(board, info, branchInfos, cfg.criticalPaths, cfg.impactAreas);
      this.post({ type: "dashboardData", payload: data });
    } catch (err: any) {
      this.post({ type: "error", payload: { message: err?.message ?? String(err) } });
    }
  }

  /** Compute commits + changed files for one branch and push to the webview. */
  private async postBranchDetail(branchName: string) {
    const main = (await this.deps.git.getInfo()).mainBranch || "main";
    if (!branchName) {
      this.post({
        type: "branchDetail",
        payload: { branchName, mainBranch: main, commits: [], files: [], totalAdditions: 0, totalDeletions: 0 },
      });
      return;
    }
    try {
      const [commits, files] = await Promise.all([
        this.deps.git.getCommits(branchName, main),
        this.deps.git.getBranchDiffFiles(branchName, main),
      ]);
      const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
      const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
      this.post({
        type: "branchDetail",
        payload: { branchName, mainBranch: main, commits, files, totalAdditions, totalDeletions },
      });
    } catch (err: any) {
      this.post({
        type: "branchDetail",
        payload: {
          branchName,
          mainBranch: main,
          commits: [],
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          error: err?.message ?? String(err),
        },
      });
    }
  }

  /** Ask the webview to switch pages (board <-> command center). */
  navigate(page: CommandCenterPage) {
    this.pendingPage = page;
    this.post({ type: "navigate", payload: { page } });
  }

  /** Build the {{token}} substitution context for a task's hooks. */
  private async buildHookContext(taskId: string, columnId: string): Promise<HookContext> {
    const { board, git, getConfig } = this.deps;
    const data = board.getBoard();
    const task = data.tasks.find((t) => t.id === taskId);
    const col = board.getColumn(columnId);
    const cfg = getConfig();
    const info = await git.getInfo();
    const user = data.users.find((u) => u.id === task?.assignedUserId);
    const slug = (task?.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return {
      branch: task?.branchName ?? "",
      taskId: task?.id ?? "",
      taskTitle: task?.title ?? "",
      slug,
      baseBranch: col?.baseBranch ?? (cfg.useDevBranch ? cfg.devBranch : info.mainBranch),
      targetBranch: col?.targetBranch ?? info.mainBranch,
      mainBranch: info.mainBranch,
      columnId,
      columnName: col?.name ?? columnId,
      user: user?.name ?? "",
    };
  }

  /** Run a list of hooks, posting each result to the webview + Output log. */
  private async runHookChain(
    hooks: ColumnHook[] | undefined,
    columnId: string,
    taskId: string
  ): Promise<boolean> {
    if (!hooks || hooks.length === 0) {
      return false;
    }
    const ctx = await this.buildHookContext(taskId, columnId);
    const { git } = this.deps;
    const outcome = await this.runner.runHooks(hooks, ctx, {
      confirm: async (hook, preview) =>
        (await vscode.window.showWarningMessage(
          `Run column command "${hook.label}"?`,
          { modal: true, detail: preview },
          "Run"
        )) === "Run",
      isWorkingTreeClean: async () => !(await git.hasUncommittedChanges()),
      onLog: (line) => Logger.info(`[hook] ${line}`),
    });
    for (const r of outcome.results) {
      this.post({ type: "columnHookResult", payload: { columnId, taskId, result: r } });
      if (!r.ok && !r.skipped) {
        this.toast({ ok: false, message: `${r.label}: ${r.message}` });
      }
    }
    return outcome.blocked;
  }

  /** onLeave (from-column) then onEnter (to-column). Returns true if blocked. */
  private async runColumnMoveHooks(
    taskId: string,
    fromColumnId: string,
    toColumnId: string
  ): Promise<boolean> {
    const fromCol = this.deps.board.getColumn(fromColumnId);
    const toCol = this.deps.board.getColumn(toColumnId);
    const leftBlocked = await this.runHookChain(fromCol?.onLeave, fromColumnId, taskId);
    if (leftBlocked) {
      return true;
    }
    return this.runHookChain(toCol?.onEnter, toColumnId, taskId);
  }

  /**
   * Generate a safe branch name: {type}/{title_}-task-{id}
   * e.g. feature/nowe_zadanie-task-whrpfi. The type comes from the task's
   * taskType (feature/bugfix/…); title is lowercased with spaces -> underscores.
   */
  private branchNameFor(taskId: string): string {
    const task = this.deps.board.getBoard().tasks.find((t) => t.id === taskId);
    const type = (task?.taskType || "feature").trim();
    const shortId = (task?.id.replace(/[^a-z0-9]/gi, "").slice(-6) || "task").toLowerCase();
    const titleSlug =
      (task?.title ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ł/g, "l")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40)
        .replace(/_+$/g, "") || "task";
    return `${type}/${titleSlug}-task-${shortId}`;
  }

  /** Modal confirm, or auto-yes when confirmGitActionsOnMove is off. */
  private async confirmGit(message: string, detail?: string): Promise<boolean> {
    if (!this.deps.getConfig().confirmGitActionsOnMove) {
      return true;
    }
    return (
      (await vscode.window.showWarningMessage(message, { modal: true, detail }, "Yes")) === "Yes"
    );
  }

  /** Run the safe finish flow for a task and apply its board side-effects. */
  private async runFinishFlow(msg: InboundMessage, taskId: string): Promise<OperationResult | undefined> {
    const { board, git, getConfig } = this.deps;
    const cfg = getConfig();
    const task = board.getBoard().tasks.find((t) => t.id === taskId);
    if (!task) {
      return undefined;
    }
    const result = await finishTaskGitFlow(git, cfg, task, {
      confirm: (m, detail) => this.confirmGit(m, detail),
      info: (m) => Logger.info(`[finish] ${m}`),
    });
    if (result.ok && result.moveToColumnId) {
      const targetCol =
        result.moveToColumnId === "done" ? board.findDoneColumnId() : board.findReviewColumnId();
      await board.moveTask(task.id, targetCol, 0);
      if (result.markDone) {
        await board.updateTask(task.id, { status: "done", finishedAt: new Date().toISOString() });
        await board.logEvent("merge_finished", { taskId: task.id, branchName: task.branchName });
        await this.notify("merge_finished", {
          title: t("notifMergeFinishedTitle"),
          message: t("notifMergeFinishedBody").replace("{title}", task.title),
          taskId: task.id,
          branchName: task.branchName,
          recipientUserIds: this.actionOutcomeRecipients(task),
        });
        await this.notify("task_done", {
          title: t("notifTaskDoneTitle"),
          message: t("notifTaskDoneBody").replace("{title}", task.title),
          taskId: task.id,
          branchName: task.branchName,
          recipientUserIds: this.actionOutcomeRecipients(task),
        });
      }
    } else if (!result.ok) {
      await board.logEvent("merge_failed", { taskId: task.id, branchName: task.branchName });
      await this.notify("merge_failed", {
        title: t("notifMergeFailedTitle"),
        message: t("notifMergeFailedBody").replace("{title}", task.title),
        taskId: task.id,
        branchName: task.branchName,
        recipientUserIds: this.actionOutcomeRecipients(task),
      });
    }
    this.reply(msg, result);
    this.toast(result);
    await this.postGitInfo();
    return result;
  }

  /**
   * Run the Git action implied by the destination column's gitStage:
   *  feature    -> create or checkout the task branch
   *  review     -> push the task branch
   *  staging    -> merge the task branch into the target (dev) and push
   *  production -> the safe finish flow (push + optional merge to main)
   */
  private async runStageGitActions(
    msg: InboundMessage,
    taskId: string,
    toColumnId: string
  ): Promise<OperationResult | undefined> {
    const { board, git, getConfig } = this.deps;
    const cfg = getConfig();
    if (!(await git.isRepo())) {
      return undefined;
    }
    const col = board.getColumn(toColumnId);
    const stage = col?.gitStage ?? "none";
    const task = board.getBoard().tasks.find((t) => t.id === taskId);
    if (!task) {
      return undefined;
    }

    if (stage === "feature") {
      if (!task.branchName) {
        const name = this.branchNameFor(taskId);
        const res = await git.createBranch(name);
        if (res.ok) {
          await board.updateTask(taskId, { branchName: name });
          await board.logEvent("branch_created", { taskId, branchName: name });
        }
        this.reply(msg, res);
        this.toast(res);
        await this.postGitInfo();
        return res;
      } else {
        // Branch is recorded on the card but may not exist locally yet — create
        // it (from origin or current HEAD) instead of failing.
        const res = await git.ensureBranch(task.branchName);
        if (res.ok) {
          await board.logEvent("branch_checked_out", { taskId, branchName: task.branchName });
        }
        this.reply(msg, res);
        this.toast(res);
        await this.postGitInfo();
        return res;
      }
    }

    if (stage === "review") {
      if (!task.branchName) {
        const res = { ok: false, action: "pushBranch", message: "Task has no branch — nothing to push." };
        this.toast(res);
        return res;
      }
      const ensured = await git.ensureBranch(task.branchName);
      if (!ensured.ok) {
        this.reply(msg, ensured);
        this.toast(ensured);
        return ensured;
      }
      const res = await git.pushBranch(task.branchName);
      if (res.ok) {
        await board.logEvent("branch_pushed", { taskId, branchName: task.branchName });
        await this.notify("branch_pushed", {
          title: t("notifBranchPushedTitle"),
          message: t("notifBranchPushedBody").replace("{branch}", task.branchName),
          taskId,
          branchName: task.branchName,
          recipientUserIds: this.actionOutcomeRecipients(task),
        });
      }
      this.reply(msg, res);
      this.toast(res);
      await this.postGitInfo();
      return res;
    }

    if (stage === "staging") {
      if (!task.branchName) {
        const res = { ok: false, action: "mergeIntoBranch", message: "Task has no branch — nothing to merge." };
        this.toast(res);
        return res;
      }
      const ensured = await git.ensureBranch(task.branchName);
      if (!ensured.ok) {
        this.reply(msg, ensured);
        this.toast(ensured);
        return ensured;
      }
      const target =
        (col?.targetBranch || (cfg.useDevBranch ? cfg.devBranch : cfg.defaultMainBranch) || "dev").trim();
      const ok = await this.confirmGit(
        `Merge '${task.branchName}' into '${target}' and push?`,
        "Checks out the target branch, pulls, merges --no-ff and pushes, then returns to your branch."
      );
      if (!ok) {
        return { ok: false, action: "mergeIntoBranch", message: "Merge cancelled." };
      }
      const res = await git.mergeIntoBranch(target, task.branchName);
      await board.logEvent(res.ok ? "merge_finished" : "merge_failed", {
        taskId,
        branchName: task.branchName,
        payload: { target },
      });
      this.reply(msg, res);
      this.toast(res);
      await this.postGitInfo();
      return res;
    }

    if (stage === "production") {
      return this.runFinishFlow(msg, taskId);
    }
    return undefined;
  }

  private async onMessage(msg: InboundMessage) {
    const { board, git, getConfig } = this.deps;
    try {
      switch (msg.type) {
        case "ready":
          setLanguage(getConfig().language);
          this.postAppConfig();
          this.postBoard(board.getBoard());
          await this.postGitInfo();
          if (this.pendingPage) {
            this.post({ type: "navigate", payload: { page: this.pendingPage } });
          }
          break;

        case "getDashboardData":
          await this.postDashboard();
          break;

        case "getBranchDetail":
          await this.postBranchDetail(String(msg.payload?.branchName ?? ""));
          break;

        case "openFile": {
          const rel = String(msg.payload?.path ?? "").trim();
          if (rel) {
            try {
              const abs = vscode.Uri.file(path.join(git.getCwd(), rel));
              await vscode.window.showTextDocument(abs, { preview: true });
            } catch (err: any) {
              vscode.window.showWarningMessage(
                `BranchBoard: could not open ${rel} — ${err?.message ?? err}`
              );
            }
          }
          break;
        }

        case "openExternal": {
          const url = String(msg.payload?.url ?? "").trim();
          if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          }
          break;
        }

        case "openDiff": {
          const branchName = String(msg.payload?.branchName ?? "").trim();
          const rel = String(msg.payload?.path ?? "").trim();
          if (!branchName || !rel) {
            break;
          }
          try {
            const main = (await git.getInfo()).mainBranch || "main";
            const [leftContent, rightContent] = await Promise.all([
              git.getFileAtRef(main, rel),
              git.getFileAtRef(branchName, rel),
            ]);
            if (leftContent === null && rightContent === null) {
              // Nothing to diff at either ref — just open the working copy.
              const abs = vscode.Uri.file(path.join(git.getCwd(), rel));
              await vscode.window.showTextDocument(abs, { preview: true });
              break;
            }
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchboard-diff-"));
            const baseName = path.basename(rel);
            const safe = (s: string) => s.replace(/[^\w.-]/g, "_");
            const leftPath = path.join(dir, `${safe(main)}__${baseName}`);
            const rightPath = path.join(dir, `${safe(branchName)}__${baseName}`);
            fs.writeFileSync(leftPath, leftContent ?? "");
            fs.writeFileSync(rightPath, rightContent ?? "");
            await vscode.commands.executeCommand(
              "vscode.diff",
              vscode.Uri.file(leftPath),
              vscode.Uri.file(rightPath),
              `${rel} (${main} ↔ ${branchName})`
            );
          } catch (err: any) {
            vscode.window.showWarningMessage(
              `BranchBoard: could not diff ${rel} — ${err?.message ?? err}`
            );
          }
          break;
        }

        case "showLogs":
          await vscode.commands.executeCommand("branchBoard.showLogs");
          break;

        case "deleteLocalBranch": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          if (!branch) {
            break;
          }
          const current = await git.getCurrentBranch();
          if (branch === current) {
            const r = { ok: false, action: "deleteLocalBranch", message: `Cannot delete '${branch}' — it is the current branch. Switch away first.` };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const ok =
            (await vscode.window.showWarningMessage(
              `Delete local branch '${branch}'?`,
              { modal: true, detail: "Only the local branch is removed. Unmerged work is refused (archive instead)." },
              "Delete"
            )) === "Delete";
          if (!ok) {
            break;
          }
          let res = await git.deleteLocalBranch(branch);
          if (!res.ok && getConfig().allowForceDeleteBranch) {
            const force =
              (await vscode.window.showWarningMessage(
                `'${branch}' has unmerged changes. Force-delete it?`,
                { modal: true, detail: "Force delete discards commits that are not merged anywhere. This cannot be undone." },
                "Force delete"
              )) === "Force delete";
            if (force) {
              res = await git.deleteLocalBranch(branch, true);
            }
          }
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "bulkDeleteLocalBranches": {
          const branches: string[] = Array.isArray(msg.payload?.branches) ? msg.payload.branches : [];
          const current = await git.getCurrentBranch();
          const main = (await git.getInfo()).mainBranch || "main";
          const deletable = branches.filter((b) => b && b !== current && b !== main);
          if (deletable.length === 0) {
            const r = { ok: false, action: "bulkDeleteLocalBranches", message: "Nothing to delete (main / current branch are protected)." };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const ok =
            (await vscode.window.showWarningMessage(
              `Delete ${deletable.length} local branch(es)?`,
              { modal: true, detail: deletable.join("\n") },
              "Delete"
            )) === "Delete";
          if (!ok) {
            break;
          }
          let okCount = 0;
          const failed: string[] = [];
          for (const b of deletable) {
            const r = await git.deleteLocalBranch(b);
            if (r.ok) {
              okCount++;
            } else {
              failed.push(b);
            }
          }
          const result = {
            ok: failed.length === 0,
            action: "bulkDeleteLocalBranches",
            message: `Deleted ${okCount} branch(es).${failed.length ? ` ${failed.length} skipped (unmerged): ${failed.join(", ")}` : ""}`,
          };
          this.reply(msg, result);
          this.toast(result);
          await this.postGitInfo();
          break;
        }

        case "deleteRemoteBranch": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          if (!branch) {
            break;
          }
          const remote = getConfig().remoteName || "origin";
          const ok =
            (await vscode.window.showWarningMessage(
              `Delete remote branch '${remote}/${branch}'?`,
              { modal: true, detail: "This removes the branch from the remote for everyone. This cannot be undone from here." },
              "Delete"
            )) === "Delete";
          if (!ok) {
            break;
          }
          const res = await git.deleteRemoteBranch(branch);
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "archiveBranch": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          if (!branch) {
            break;
          }
          const current = await git.getCurrentBranch();
          if (branch === current) {
            const r = { ok: false, action: "archiveBranch", message: `Cannot archive '${branch}' — it is the current branch. Switch away first.` };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const tag = SafetyService.archiveTagName(branch);
          const ok =
            (await vscode.window.showWarningMessage(
              `Archive branch '${branch}'?`,
              { modal: true, detail: `A tag '${tag}' is created to preserve the commits, then the local branch is removed (so it no longer clutters the list). You can restore it from the tag.` },
              "Archive"
            )) === "Archive";
          if (!ok) {
            break;
          }
          const tagRes = await git.createTag(tag, branch);
          if (!tagRes.ok) {
            this.reply(msg, tagRes);
            this.toast(tagRes);
            break;
          }
          const del = await git.deleteLocalBranch(branch, true);
          const res = del.ok
            ? { ok: true, action: "archiveBranch", message: `Archived '${branch}' as tag '${tag}'.` }
            : { ok: false, action: "archiveBranch", message: `Tag '${tag}' created but could not remove the branch.`, detail: del.detail };
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "getCommitDetail": {
          const hash = String(msg.payload?.hash ?? "");
          try {
            const [meta, files] = await Promise.all([git.getCommitMeta(hash), git.getCommitFiles(hash)]);
            this.post({
              type: "commitDetail",
              payload: meta
                ? { ...meta, files }
                : { hash, shortHash: hash.slice(0, 7), author: "", date: "", subject: "", files, error: "Commit not found." },
            });
          } catch (err: any) {
            this.post({
              type: "commitDetail",
              payload: { hash, shortHash: hash.slice(0, 7), author: "", date: "", subject: "", files: [], error: err?.message ?? String(err) },
            });
          }
          break;
        }

        case "openCommitDiff": {
          const hash = String(msg.payload?.hash ?? "").trim();
          const rel = String(msg.payload?.path ?? "").trim();
          if (!hash || !rel) {
            break;
          }
          try {
            const [leftContent, rightContent] = await Promise.all([
              git.getFileAtRef(`${hash}^`, rel),
              git.getFileAtRef(hash, rel),
            ]);
            if (leftContent === null && rightContent === null) {
              await vscode.window.showTextDocument(vscode.Uri.file(path.join(git.getCwd(), rel)), { preview: true });
              break;
            }
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branchboard-cdiff-"));
            const baseName = path.basename(rel);
            const short = hash.slice(0, 7);
            const leftPath = path.join(dir, `${short}^__${baseName}`);
            const rightPath = path.join(dir, `${short}__${baseName}`);
            fs.writeFileSync(leftPath, leftContent ?? "");
            fs.writeFileSync(rightPath, rightContent ?? "");
            await vscode.commands.executeCommand(
              "vscode.diff",
              vscode.Uri.file(leftPath),
              vscode.Uri.file(rightPath),
              `${rel} (${short}^ ↔ ${short})`
            );
          } catch (err: any) {
            vscode.window.showWarningMessage(`BranchBoard: could not diff ${rel} — ${err?.message ?? err}`);
          }
          break;
        }

        case "getBranchMapGraph": {
          try {
            const cfg = getConfig();
            const info = await git.getInfo();
            const [commits, tips] = await Promise.all([git.getCommitGraph(200), git.getBranchTips()]);
            const withBranches = commits.map((c) => ({ ...c, branches: tips[c.hash] ?? [] }));
            const main = info.mainBranch || "main";
            const dev = (cfg.devBranch || "dev").trim();
            const remote = cfg.remoteName || "origin";
            const managedBranches = [main, `${remote}/${main}`, dev, `${remote}/${dev}`];
            this.post({
              type: "branchMapGraph",
              payload: {
                mainBranch: main,
                currentBranch: info.currentBranch,
                managedBranches,
                commits: withBranches,
              },
            });
          } catch (err: any) {
            this.post({
              type: "branchMapGraph",
              payload: { mainBranch: "main", currentBranch: null, managedBranches: [], commits: [], error: err?.message ?? String(err) },
            });
          }
          break;
        }

        case "updateBranchFromMain": {
          const strategy = msg.payload?.strategy === "rebase" ? "rebase" : "merge";
          const main = (await git.getInfo()).mainBranch || "main";
          const detailText =
            strategy === "rebase"
              ? "Rebase rewrites local history on top of main. Use only on branches that are not shared."
              : "This fetches and merges main into the current branch (a safe merge commit).";
          const confirmed =
            (await vscode.window.showWarningMessage(
              `Update the current branch from '${main}' (${strategy})?`,
              { modal: true, detail: detailText },
              "Yes"
            )) === "Yes";
          if (!confirmed) {
            break;
          }
          if (await git.hasUncommittedChanges()) {
            const r = {
              ok: false,
              action: "updateBranchFromMain",
              message: "You have uncommitted changes. Commit or stash them before updating from main.",
            };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const res = await git.updateBranchFromMain(strategy);
          if (res.ok) {
            await board.logEvent("branch_updated_from_main", {
              branchName: (await git.getInfo()).currentBranch,
              payload: { strategy },
            });
          }
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "searchFiles": {
          const query = String(msg.payload?.query ?? "");
          // Empty query => return nothing (avoid loading the whole repo into the
          // suggestion list, which lags typing). Cap matches to 10.
          const files = query.trim().length >= 1 ? await git.listTrackedFiles(query, 10) : [];
          this.post({ type: "fileList", payload: { query, files } });
          break;
        }

        case "testConnection": {
          const cfg = getConfig();
          Logger.info("Connection test requested from settings.");
          if (cfg.storageMode !== "server") {
            this.post({
              type: "connectionStatus",
              payload: {
                ok: false,
                mode: "local",
                target: cfg.localDataFile,
                steps: [],
                message: "notServerMode",
              },
            });
            break;
          }
          let provider: SshSqliteStorageProvider | undefined;
          try {
            provider = new SshSqliteStorageProvider({
              host: cfg.sshHost,
              port: cfg.sshPort,
              dbPath: cfg.sqliteRemotePath,
              sshKeyPath: cfg.sshKeyPath,
              projectName: cfg.projectName,
              boardTitle: cfg.boardTitle,
              seedUsers: cfg.availableUsers,
            });
          } catch (err: any) {
            this.post({
              type: "connectionStatus",
              payload: {
                ok: false,
                mode: cfg.sshHost ? "ssh" : "local",
                target: cfg.sqliteRemotePath,
                steps: [{ name: "Config", ok: false, detail: err?.message ?? String(err) }],
              },
            });
            break;
          }
          const result = await provider.testConnection();
          provider.dispose();
          this.post({ type: "connectionStatus", payload: result });
          // If the live board is on a local fallback but the server is now
          // reachable, reconnect so data actually syncs.
          if (result.ok && this.deps.board.getStorageKind() !== "server") {
            Logger.info("Test passed while on local fallback — reconnecting to server.");
            await vscode.commands.executeCommand("branchBoard.reconnectServer");
            this.postAppConfig();
            this.postBoard(this.deps.board.getBoard());
          }
          break;
        }

        case "deployDev":
        case "deployProduction": {
          const task = board.getBoard().tasks.find((t) => t.id === msg.payload?.taskId);
          if (!task) {
            break;
          }
          const env = msg.type === "deployProduction" ? "production" : "dev";
          const cfg = getConfig();
          const deployer =
            board.getBoard().users.find((u) => u.id === cfg.currentUser)?.name ?? null;
          const res = await DeploymentService.deploy(git, board, cfg, task, env, deployer, {
            confirm: async (m, detail) =>
              (await vscode.window.showWarningMessage(m, { modal: true, detail }, "Yes")) === "Yes",
            info: (m) => vscode.window.showInformationMessage(`BranchBoard: ${m}`),
          });
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "markTested": {
          const task = board.getBoard().tasks.find((t) => t.id === msg.payload?.taskId);
          const branch = (task?.branchName ?? "").trim();
          if (!task || !branch) {
            this.reply(msg, { ok: false, action: "markTested", message: "Task has no branch." });
            break;
          }
          const ok = await board.markDeploymentTested(branch, "dev");
          if (!ok) {
            // No deploy record yet — record a manual "tested" marker.
            await board.upsertDeployment({
              id: `dep_${Date.now().toString(36)}`,
              taskId: task.id,
              branchName: branch,
              environment: "dev",
              status: "deployed",
              url: DeploymentService.resolveUrl(getConfig(), branch),
              deployedBy: board.getBoard().users.find((u) => u.id === getConfig().currentUser)?.name ?? null,
              deployedAt: new Date().toISOString(),
              command: "(manual)",
              logSummary: "Marked as tested without a deploy command.",
              tested: true,
            });
          }
          this.reply(msg, { ok: true, action: "markTested", message: `Marked '${branch}' as tested.` });
          break;
        }

        case "createBackupBranch": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          if (!branch) {
            break;
          }
          const res = await git.createBackupBranch(SafetyService.backupBranchName(branch), branch);
          this.reply(msg, res);
          this.toast(res);
          break;
        }

        case "createSafetyTag": {
          const taskId = String(msg.payload?.taskId ?? "");
          const main = (await git.getInfo()).mainBranch || "main";
          const res = await git.createTag(SafetyService.safetyTagName(taskId), main);
          this.reply(msg, res);
          this.toast(res);
          break;
        }

        case "revertLastCommit": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          const confirmed =
            (await vscode.window.showWarningMessage(
              `Revert the last commit on '${branch || "the current branch"}'?`,
              { modal: true, detail: "This creates a new commit that undoes the last one. It does not rewrite history." },
              "Yes"
            )) === "Yes";
          if (!confirmed) {
            break;
          }
          if (branch) {
            const cur = await git.getCurrentBranch();
            if (cur !== branch) {
              const co = await git.checkoutBranch(branch);
              if (!co.ok) {
                this.reply(msg, co);
                this.toast(co);
                break;
              }
            }
          }
          if (await git.hasUncommittedChanges()) {
            const r = {
              ok: false,
              action: "revertLastCommit",
              message: "You have uncommitted changes. Commit or stash them before reverting.",
            };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const res = await git.revertLastCommit();
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "revertFromOrigin": {
          const branch = String(msg.payload?.branchName ?? "").trim();
          const confirmed =
            (await vscode.window.showWarningMessage(
              `Revert the last commit on '${branch || "the current branch"}' and push the rollback to origin?`,
              {
                modal: true,
                detail:
                  "This creates a new commit that undoes the last one, then pushes it to origin. " +
                  "It does not rewrite history and does not force-push. If a deploy webhook is connected to this branch, " +
                  "it will fire normally for the rollback commit, the same as for any other push.",
              },
              "Yes"
            )) === "Yes";
          if (!confirmed) {
            break;
          }
          if (branch) {
            const cur = await git.getCurrentBranch();
            if (cur !== branch) {
              const co = await git.checkoutBranch(branch);
              if (!co.ok) {
                this.reply(msg, co);
                this.toast(co);
                break;
              }
            }
          }
          if (await git.hasUncommittedChanges()) {
            const r = {
              ok: false,
              action: "revertFromOrigin",
              message: "You have uncommitted changes. Commit or stash them before reverting.",
            };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const targetBranch = branch || (await git.getCurrentBranch()) || "";
          if (!targetBranch) {
            const r = {
              ok: false,
              action: "revertFromOrigin",
              message: "Could not determine which branch to push (detached HEAD?). Checkout a branch first.",
            };
            this.reply(msg, r);
            this.toast(r);
            break;
          }
          const rfo = await git.revertFromOrigin(targetBranch);
          this.reply(msg, rfo);
          this.toast(rfo);
          await this.postGitInfo();
          break;
        }

        case "logEvent":
          await board.logEvent(msg.payload?.type, {
            taskId: msg.payload?.taskId ?? null,
            branchName: msg.payload?.branchName ?? null,
            payload: msg.payload?.payload ?? {},
          });
          break;

        case "markNotificationRead": {
          const info = await git.getInfo();
          const currentUserId = resolveCurrentUserId(board.getBoard(), info, getConfig());
          if (currentUserId && msg.payload?.notificationId) {
            await board.markNotificationRead(msg.payload.notificationId, currentUserId);
          }
          break;
        }

        case "markAllNotificationsRead": {
          const info = await git.getInfo();
          const currentUserId = resolveCurrentUserId(board.getBoard(), info, getConfig());
          if (currentUserId) {
            await board.markAllNotificationsRead(currentUserId);
          }
          break;
        }

        case "refresh":
          this.postAppConfig();
          this.postBoard(board.getBoard());
          await this.postGitInfo();
          break;

        case "syncNow":
          await vscode.commands.executeCommand("branchBoard.syncNow");
          this.postBoard(board.getBoard());
          await this.postGitInfo();
          break;

        case "getGitInfo":
          await this.postGitInfo();
          break;

        case "createTask": {
          const created = await board.createTask(msg.payload);
          await this.notify("task_created", {
            title: t("notifTaskCreatedTitle"),
            message: t("notifTaskCreatedBody").replace("{title}", created.title),
            taskId: created.id,
          });
          break;
        }

        case "updateTask":
          await board.updateTask(msg.payload.id, msg.payload.patch);
          break;

        case "deleteTask": {
          // Confirmation is requested from the extension host for safety.
          const ok = await vscode.window.showWarningMessage(
            t("deleteTaskConfirm", { title: msg.payload.title ?? "" }),
            { modal: true },
            t("delete")
          );
          if (ok === t("delete")) {
            await board.deleteTask(msg.payload.id);
          }
          break;
        }

        case "moveTask": {
          const { taskId, toColumnId, toIndex } = msg.payload;
          const before = board.getBoard().tasks.find((t) => t.id === taskId);
          const fromColumnId = before?.columnId;
          const fromIndex = (before?.position ?? 1) - 1;
          const changingColumn = !!fromColumnId && fromColumnId !== toColumnId;

          // WIP-limit gate: ask before exceeding a column's limit.
          if (changingColumn) {
            const wip = board.wipStatus(toColumnId);
            if (wip.wouldExceed) {
              const colName = board.getColumn(toColumnId)?.name ?? toColumnId;
              const proceed =
                (await vscode.window.showWarningMessage(
                  `Column "${colName}" is at its WIP limit (${wip.limit}).`,
                  { modal: true, detail: "Move the task here anyway?" },
                  "Move anyway"
                )) === "Move anyway";
              if (!proceed) {
                this.postBoard(board.getBoard()); // revert optimistic UI move
                break;
              }
            }
          }

          await board.moveTask(taskId, toColumnId, toIndex);

          if (changingColumn && toColumnId === board.findReviewColumnId()) {
            const movedToReview = board.getBoard().tasks.find((t) => t.id === taskId);
            if (movedToReview) {
              await this.notify("task_moved_to_review", {
                title: t("notifTaskMovedToReviewTitle"),
                message: t("notifTaskMovedToReviewBody").replace("{title}", movedToReview.title),
                taskId,
              });
            }
          }

          // Column command hooks: onLeave (from) then onEnter (to). A blocking
          // failure reverts the move so the board stays consistent.
          if (changingColumn && getConfig().enableColumnHooks) {
            const blocked = await this.runColumnMoveHooks(taskId, fromColumnId!, toColumnId);
            if (blocked) {
              await board.moveTask(taskId, fromColumnId!, fromIndex);
              this.postBoard(board.getBoard());
              const r = {
                ok: false,
                action: "moveTask",
                message: "A blocking column command failed — the task was moved back.",
              };
              this.reply(msg, r);
              this.toast(r);
              break;
            }
          }

          // Git actions driven by the destination column's gitStage.
          const cfg = getConfig();
          if (changingColumn && cfg.runGitActionsOnMove) {
            const gitResult = await this.runStageGitActions(msg, taskId, toColumnId);
            if (gitResult && !gitResult.ok && fromColumnId) {
              await board.moveTask(taskId, fromColumnId, fromIndex);
              this.postBoard(board.getBoard());
              break;
            }
          } else if (cfg.finishOnMoveToDone) {
            // Legacy opt-in: only run the finish flow when stage actions are off.
            const enteringDone = toColumnId === board.findDoneColumnId();
            const movedTask = board.getBoard().tasks.find((t) => t.id === taskId);
            if (enteringDone && movedTask && movedTask.branchName) {
              await this.runFinishFlow(msg, movedTask.id);
            }
          }
          break;
        }

        case "addColumn":
          await board.addColumn(msg.payload.name);
          break;

        case "renameColumn":
          await board.renameColumn(msg.payload.id, msg.payload.name);
          break;

        case "deleteColumn": {
          const res = await board.deleteColumn(msg.payload.id);
          if (!res.ok) {
            this.reply(msg, { ok: false, action: "deleteColumn", message: res.reason ?? "Cannot delete column." });
          }
          break;
        }

        case "moveColumn":
          await board.moveColumn(msg.payload.orderedIds);
          break;

        case "saveColumnConfig": {
          await board.saveColumnConfig(msg.payload.id, msg.payload.patch ?? {});
          this.reply(msg, { ok: true, action: "saveColumnConfig", message: "Column updated." });
          break;
        }

        case "runColumnHooks": {
          const { columnId, taskId, trigger } = msg.payload;
          const col = board.getColumn(columnId);
          const hooks = trigger === "onLeave" ? col?.onLeave : col?.onEnter;
          const blocked = await this.runHookChain(hooks, columnId, taskId ?? "");
          this.reply(msg, {
            ok: !blocked,
            action: "runColumnHooks",
            message: blocked ? "A blocking command failed." : "Commands finished.",
          });
          await this.postGitInfo();
          break;
        }

        case "addComment": {
          await board.addComment(msg.payload.taskId, msg.payload.authorId, msg.payload.text);
          const commentedTask = board.getBoard().tasks.find((tt) => tt.id === msg.payload.taskId);
          if (commentedTask) {
            await this.notify("comment_added", {
              title: t("notifCommentAddedTitle"),
              message: t("notifCommentAddedBody").replace("{title}", commentedTask.title),
              taskId: commentedTask.id,
              actorUserId: msg.payload.authorId,
            });
          }
          break;
        }

        case "assignUser": {
          await board.updateTask(msg.payload.taskId, { assignedUserId: msg.payload.userId });
          const assignedTask = board.getBoard().tasks.find((tt) => tt.id === msg.payload.taskId);
          if (assignedTask && msg.payload.userId) {
            await this.notify("assigned_to_you", {
              title: t("notifAssignedTitle"),
              message: t("notifAssignedBody").replace("{title}", assignedTask.title),
              taskId: assignedTask.id,
              recipientUserIds: [msg.payload.userId],
            });
          }
          break;
        }

        case "changeUser":
          await vscode.workspace
            .getConfiguration("branchBoard")
            .update("currentUser", msg.payload.userId, vscode.ConfigurationTarget.Workspace);
          await this.postGitInfo();
          break;

        case "createBranch": {
          const res = await git.createBranch(msg.payload.branchName);
          if (res.ok && msg.payload.taskId) {
            await board.updateTask(msg.payload.taskId, { branchName: msg.payload.branchName });
          }
          if (res.ok) {
            await board.logEvent("branch_created", {
              taskId: msg.payload.taskId ?? null,
              branchName: msg.payload.branchName,
            });
          }
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "checkoutBranch": {
          // ensureBranch (not checkoutBranch): the branch may only exist on
          // origin (pushed by a teammate) — this creates a local tracking
          // branch and checks it out instead of failing.
          const res = await git.ensureBranch(msg.payload.branchName);
          if (res.ok) {
            await board.logEvent("branch_checked_out", { branchName: msg.payload.branchName });
          }
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "pushBranch": {
          const res = await git.pushBranch(msg.payload.branchName);
          if (res.ok) {
            await board.logEvent("branch_pushed", { branchName: msg.payload.branchName });
            await this.notify("branch_pushed", {
              title: t("notifBranchPushedTitle"),
              message: t("notifBranchPushedBody").replace("{branch}", msg.payload.branchName),
              branchName: msg.payload.branchName,
              recipientUserIds: this.actionOutcomeRecipients(),
            });
          }
          this.reply(msg, res);
          this.toast(res);
          break;
        }

        case "finishTask": {
          const task = board.getBoard().tasks.find((t) => t.id === msg.payload.taskId);
          if (!task) {
            break;
          }
          const result = await finishTaskGitFlow(git, getConfig(), task, {
            confirm: async (m, detail) =>
              (await vscode.window.showWarningMessage(m, { modal: true, detail }, "Yes")) === "Yes",
            info: (m) => vscode.window.showInformationMessage(`BranchBoard: ${m}`),
          });
          if (result.ok && result.moveToColumnId) {
            const targetCol =
              result.moveToColumnId === "done" ? board.findDoneColumnId() : board.findReviewColumnId();
            await board.moveTask(task.id, targetCol, 0);
            if (result.markDone) {
              await board.updateTask(task.id, { status: "done", finishedAt: new Date().toISOString() });
            }
          }
          if (result.markDone) {
            await board.logEvent("merge_finished", { taskId: task.id, branchName: task.branchName || null });
            await this.notify("merge_finished", {
              title: t("notifMergeFinishedTitle"),
              message: t("notifMergeFinishedBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
            await this.notify("task_done", {
              title: t("notifTaskDoneTitle"),
              message: t("notifTaskDoneBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
          } else if (!result.ok && /merge|conflict/i.test(`${result.message} ${result.detail ?? ""}`)) {
            await board.logEvent("merge_failed", { taskId: task.id, branchName: task.branchName || null });
            await this.notify("merge_failed", {
              title: t("notifMergeFailedTitle"),
              message: t("notifMergeFailedBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
          }
          this.reply(msg, result);
          this.toast(result);
          await this.postGitInfo();
          break;
        }

        case "mergeToMain": {
          // Explicit merge action from a card. Reuse finish flow but force merge.
          const task = board.getBoard().tasks.find((t) => t.id === msg.payload.taskId);
          if (!task) {
            break;
          }
          const cfg = { ...getConfig(), allowDirectMergeToMain: true };
          await board.logEvent("merge_started", { taskId: task.id, branchName: task.branchName || null });
          const result = await finishTaskGitFlow(git, cfg, task, {
            confirm: async (m, detail) =>
              (await vscode.window.showWarningMessage(m, { modal: true, detail }, "Yes")) === "Yes",
            info: (m) => vscode.window.showInformationMessage(`BranchBoard: ${m}`),
          });
          if (result.ok && result.moveToColumnId) {
            const targetCol =
              result.moveToColumnId === "done" ? board.findDoneColumnId() : board.findReviewColumnId();
            await board.moveTask(task.id, targetCol, 0);
            if (result.markDone) {
              await board.updateTask(task.id, { status: "done", finishedAt: new Date().toISOString() });
            }
          }
          if (result.markDone) {
            await board.logEvent("merge_finished", { taskId: task.id, branchName: task.branchName || null });
            await this.notify("merge_finished", {
              title: t("notifMergeFinishedTitle"),
              message: t("notifMergeFinishedBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
            await this.notify("task_done", {
              title: t("notifTaskDoneTitle"),
              message: t("notifTaskDoneBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
          } else if (!result.ok) {
            await board.logEvent("merge_failed", { taskId: task.id, branchName: task.branchName || null });
            await this.notify("merge_failed", {
              title: t("notifMergeFailedTitle"),
              message: t("notifMergeFailedBody").replace("{title}", task.title),
              taskId: task.id,
              branchName: task.branchName || null,
              recipientUserIds: this.actionOutcomeRecipients(task),
            });
          }
          this.reply(msg, result);
          this.toast(result);
          await this.postGitInfo();
          break;
        }

        case "syncUsers":
          await vscode.commands.executeCommand("branchBoard.syncUsersFromGit");
          await this.postGitInfo();
          break;

        case "selectSshKey":
          // Opens the QuickPick (with ~/.ssh list + Browse…). The command
          // persists the choice, and onDidChangeConfiguration re-pushes appConfig.
          await vscode.commands.executeCommand("branchBoard.selectSshKey");
          break;

        case "copyToClipboard":
          await vscode.env.clipboard.writeText(String(msg.payload?.text ?? ""));
          break;

        case "saveSettings": {
          const patch = (msg.payload?.patch ?? {}) as Record<string, unknown>;
          const cfg = vscode.workspace.getConfiguration("branchBoard");
          for (const [key, value] of Object.entries(patch)) {
            await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
          }
          // onDidChangeConfiguration re-pushes appConfig + gitInfo.
          break;
        }

        case "addUser": {
          const name = String(msg.payload?.name ?? "").trim();
          if (name) {
            await board.addUserManually(name, String(msg.payload?.email ?? ""));
          }
          break;
        }

        case "updateUser": {
          const userId = String(msg.payload?.userId ?? "");
          if (!userId) {
            break;
          }
          const patch = (msg.payload?.patch ?? {}) as Record<string, unknown>;
          const allowed: Record<string, unknown> = {};
          for (const key of ["name", "email", "avatarText", "color", "avatarPhoto"] as const) {
            if (key in patch) {
              allowed[key] = patch[key];
            }
          }
          await board.updateUser(userId, allowed);
          break;
        }

        case "deleteUser": {
          const userId = String(msg.payload?.userId ?? "");
          const user = board.getBoard().users.find((u) => u.id === userId);
          if (!user) {
            break;
          }
          const ok = await vscode.window.showWarningMessage(
            t("deleteUserConfirm", { name: user.name }),
            { modal: true },
            t("delete")
          );
          if (ok === t("delete")) {
            await board.removeUser(userId);
          }
          break;
        }

        case "createBoard": {
          const current = board.getBoard();
          const next: BoardData = {
            ...current,
            columns: ONBOARDING_COLUMNS.map((c) => ({ ...c })),
          };
          await board.replaceBoard(next);
          await vscode.commands.executeCommand("branchBoard.syncUsersFromGit");
          if (msg.payload?.addExamples) {
            await board.createTask({
              title: "Set up the project",
              description: "Install dependencies and run the dev server.",
              columnId: "todo",
              priority: "medium",
            });
            await board.createTask({
              title: "Build your first feature",
              description: "Create a task branch and start coding.",
              columnId: "todo",
              priority: "high",
            });
            await board.createTask({
              title: "Open BranchBoard settings",
              description: "Pick your language and Git policy.",
              columnId: "backlog",
              priority: "low",
            });
          }
          await this.postGitInfo();
          break;
        }

        case "openConfig":
          await vscode.commands.executeCommand("workbench.action.openSettings", "branchBoard");
          break;
      }
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.post({ type: "error", requestId: msg.requestId, payload: { message } });
      vscode.window.showErrorMessage(`BranchBoard: ${message}`);
    }
  }

  private reply(msg: InboundMessage, result: any) {
    this.post({ type: "operationResult", requestId: msg.requestId, payload: result });
  }

  private toast(result: { ok: boolean; message: string; detail?: string; action?: string }) {
    // Successes are shown as in-board toasts via the operationResult reply.
    // Only surface failures as native notifications so errors aren't missed
    // even when the board isn't focused.
    if (!result.ok) {
      if (result.action === "finishTask" && result.detail) {
        vscode.window.showErrorMessage(`BranchBoard: ${result.message}`, { modal: true, detail: result.detail });
        return;
      }
      vscode.window.showErrorMessage(`BranchBoard: ${result.message}${result.detail ? `\n${result.detail}` : ""}`);
    }
  }

  /**
   * Recipients for "outcome of an action" events (branch pushed, merge
   * finished/failed, task done). The person who triggered the action is
   * always included — they're the one waiting to know it actually
   * succeeded — plus the task's assignee if that's someone else.
   */
  private actionOutcomeRecipients(task?: { assignedUserId?: string | null } | null): string[] {
    return Array.from(
      new Set([this.currentUserId, task?.assignedUserId].filter((id): id is string => !!id))
    );
  }

  /**
   * Create a persisted, per-user notification — gated by the master switch and
   * the per-type setting in branchBoard.notifications.*. Optionally mirrors it
   * as a native VS Code toast when `showToast` is enabled.
   */
  private async notify(
    type: NotificationType,
    fields: {
      title: string;
      message: string;
      taskId?: string | null;
      branchName?: string | null;
      actorUserId?: string | null;
      recipientUserIds?: string[];
    }
  ): Promise<void> {
    const cfg = this.deps.getConfig().notifications;
    if (!cfg?.enabled) {
      return;
    }
    const flagByType: Record<NotificationType, boolean> = {
      task_created: cfg.notifyTaskCreated,
      comment_added: cfg.notifyCommentAdded,
      assigned_to_you: cfg.notifyAssigned,
      branch_pushed: cfg.notifyBranchPushed,
      merge_finished: cfg.notifyMergeFinished,
      merge_failed: cfg.notifyMergeFailed,
      task_moved_to_review: cfg.notifyTaskMovedToReview,
      task_done: cfg.notifyTaskDone,
    };
    if (!flagByType[type]) {
      return;
    }
    const record = await this.deps.board.addNotification(type, fields);
    if (!record || !cfg.showToast) {
      return;
    }
    // This extension/window instance only shows the native toast if ITS user
    // is actually one of the recipients — e.g. when PA assigns a task to DW,
    // PA's own window must stay quiet and only DW's window (once the change
    // syncs to DW's machine and is picked up as an "external" notification,
    // or immediately here if DW is the one performing the action) shows it.
    if (this.currentUserId && record.recipientUserIds.includes(this.currentUserId)) {
      vscode.window.showInformationMessage(`BranchBoard: ${fields.message}`);
    }
  }

  /** Build the webview HTML, pointing at the built Vite bundle. */
  private getHtml(): string {
    const distRoot = vscode.Uri.joinPath(this.deps.context.extensionUri, "webview", "dist");
    const scriptUri = this.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "assets", "index.js"));
    const styleUri = this.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "assets", "index.css"));
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${this.webview.cspSource} https: data:`,
      `style-src ${this.webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${this.webview.cspSource}`,
      `media-src ${this.webview.cspSource}`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>BranchBoard</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__BRANCHBOARD__ = true;</script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** Full-editor board panel (opened by branchBoard.openBoard). */
export class BoardPanel {
  public static current: BoardPanel | undefined;
  private controller: WebviewController;
  private disposables: vscode.Disposable[] = [];

  static createOrShow(deps: ControllerDeps, page?: CommandCenterPage) {
    const column = vscode.ViewColumn.Active;
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(column);
      if (page) {
        BoardPanel.current.controller.navigate(page);
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "branchBoard.panel",
      deps.getConfig().boardTitle || "BranchBoard",
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(deps.context.extensionUri, "media", "icon.svg");
    BoardPanel.current = new BoardPanel(panel, deps);
    if (page) {
      BoardPanel.current.controller.navigate(page);
    }
  }

  private constructor(private readonly panel: vscode.WebviewPanel, deps: ControllerDeps) {
    this.controller = new WebviewController(panel.webview, deps);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose() {
    BoardPanel.current = undefined;
    this.controller.dispose();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

/** Activity-bar sidebar view provider (branchBoard.boardView). */
export class BoardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "branchBoard.boardView";
  private controller: WebviewController | undefined;

  constructor(private readonly deps: ControllerDeps) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.controller = new WebviewController(view.webview, this.deps);
    view.onDidDispose(() => this.controller?.dispose());
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
