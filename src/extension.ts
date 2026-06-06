import * as vscode from "vscode";
import { BranchBoardConfig, BoardUser } from "./types";
import { StorageProvider } from "./services/StorageProvider";
import { LocalJsonStorageProvider } from "./services/LocalJsonStorageProvider";
import { ServerStorageProvider } from "./services/ServerStorageProvider";
import { BoardService } from "./services/BoardService";
import { GitService } from "./services/GitService";
import { BoardPanel, BoardViewProvider, ControllerDeps } from "./panel/BoardPanel";

let boardService: BoardService | undefined;
let gitService: GitService | undefined;
let storage: StorageProvider | undefined;
let syncTimer: NodeJS.Timeout | undefined;

/** Read the effective extension configuration from VS Code settings. */
function readConfig(): BranchBoardConfig {
  const c = vscode.workspace.getConfiguration("branchBoard");
  return {
    projectName: c.get("projectName", "BranchBoard"),
    boardTitle: c.get("boardTitle", "BranchBoard"),
    storageMode: c.get("storageMode", "workspace-json") as "workspace-json" | "server",
    localDataFile: c.get("localDataFile", ".branchboard/board.json"),
    serverUrl: c.get("serverUrl", ""),
    authToken: c.get("authToken", ""),
    defaultMainBranch: c.get("defaultMainBranch", "main"),
    remoteName: c.get("remoteName", "origin"),
    autoDetectGitUser: c.get("autoDetectGitUser", true),
    currentUser: c.get("currentUser", ""),
    availableUsers: c.get("availableUsers", []) as BoardUser[],
    syncIntervalSeconds: c.get("syncIntervalSeconds", 20),
    allowDirectMergeToMain: c.get("allowDirectMergeToMain", false),
    requireConfirmationBeforeMerge: c.get("requireConfirmationBeforeMerge", true),
    requireCleanWorkingTreeBeforeFinish: c.get("requireCleanWorkingTreeBeforeFinish", true),
    runCommandBeforeFinish: c.get("runCommandBeforeFinish", ""),
    deleteRemoteBranchAfterMerge: c.get("deleteRemoteBranchAfterMerge", false),
    deleteLocalBranchAfterMerge: c.get("deleteLocalBranchAfterMerge", false),
  };
}

function getWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function buildStorage(config: BranchBoardConfig, root: vscode.Uri): StorageProvider {
  if (config.storageMode === "server") {
    return new ServerStorageProvider(config.serverUrl, config.authToken, config.syncIntervalSeconds);
  }
  return new LocalJsonStorageProvider(
    root,
    config.localDataFile,
    config.projectName,
    config.boardTitle,
    config.availableUsers
  );
}

export async function activate(context: vscode.ExtensionContext) {
  const root = getWorkspaceRoot();
  if (!root) {
    // No workspace: register commands that explain the requirement, then stop.
    const warn = () =>
      vscode.window.showErrorMessage(
        "BranchBoard needs an open folder/workspace. Open your project folder and try again."
      );
    for (const cmd of [
      "branchBoard.openBoard",
      "branchBoard.createTask",
      "branchBoard.refreshBoard",
      "branchBoard.syncNow",
      "branchBoard.checkoutTaskBranch",
      "branchBoard.finishTask",
      "branchBoard.configure",
    ]) {
      context.subscriptions.push(vscode.commands.registerCommand(cmd, warn));
    }
    return;
  }

  const config = readConfig();
  storage = buildStorage(config, root.uri);
  boardService = new BoardService(storage);
  gitService = new GitService(root.uri.fsPath, readConfig);

  try {
    await boardService.init();
  } catch (err: any) {
    vscode.window.showErrorMessage(`BranchBoard: failed to load board — ${err?.message ?? err}`);
  }

  const deps: ControllerDeps = {
    context,
    board: boardService,
    git: gitService,
    getConfig: readConfig,
  };

  // Sidebar view.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BoardViewProvider.viewType, new BoardViewProvider(deps), {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  /* ---------------- Commands ---------------- */

  context.subscriptions.push(
    vscode.commands.registerCommand("branchBoard.openBoard", () => BoardPanel.createOrShow(deps)),

    vscode.commands.registerCommand("branchBoard.createTask", async () => {
      const title = await vscode.window.showInputBox({ prompt: "Task title" });
      if (title && boardService) {
        await boardService.createTask({ title });
      }
    }),

    vscode.commands.registerCommand("branchBoard.refreshBoard", () => syncNow()),

    vscode.commands.registerCommand("branchBoard.syncNow", () => syncNow()),

    vscode.commands.registerCommand("branchBoard.checkoutTaskBranch", async () => {
      if (!boardService || !gitService) {
        return;
      }
      const tasks = boardService.getBoard().tasks.filter((t) => t.branchName);
      const pick = await vscode.window.showQuickPick(
        tasks.map((t) => ({ label: t.title, description: t.branchName, taskId: t.id, branch: t.branchName })),
        { placeHolder: "Select a task branch to checkout" }
      );
      if (pick) {
        const res = await gitService.checkoutBranch(pick.branch);
        vscode.window[res.ok ? "showInformationMessage" : "showErrorMessage"](`BranchBoard: ${res.message}`);
      }
    }),

    vscode.commands.registerCommand("branchBoard.finishTask", async () => {
      await vscode.window.showInformationMessage(
        "Use the 'Finish task' button on a task card to finish it safely."
      );
      BoardPanel.createOrShow(deps);
    }),

    vscode.commands.registerCommand("branchBoard.configure", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "branchBoard")
    )
  );

  /* ---------------- Periodic sync ---------------- */
  startSyncTimer(config.syncIntervalSeconds);

  // Restart storage / timer when relevant settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("branchBoard")) {
        const newCfg = readConfig();
        startSyncTimer(newCfg.syncIntervalSeconds);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      if (syncTimer) {
        clearInterval(syncTimer);
      }
      boardService?.dispose();
      storage?.dispose();
    },
  });
}

async function syncNow() {
  if (!storage || !boardService) {
    return;
  }
  try {
    const fresh = await storage.load();
    await boardService.replaceBoard(fresh);
  } catch (err: any) {
    vscode.window.showErrorMessage(`BranchBoard: sync failed — ${err?.message ?? err}`);
  }
}

function startSyncTimer(seconds: number) {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  const ms = Math.max(5, seconds || 20) * 1000;
  // The local provider already watches the file; this timer is mainly useful
  // for server mode and as a safety net. Kept lightweight.
  syncTimer = setInterval(() => {
    if (storage?.kind === "server") {
      void syncNow();
    }
  }, ms);
}

export function deactivate() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  boardService?.dispose();
  storage?.dispose();
}
