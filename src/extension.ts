import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BranchBoardConfig, BoardUser } from "./types";
import { StorageProvider } from "./services/StorageProvider";
import { LocalJsonStorageProvider } from "./services/LocalJsonStorageProvider";
import { ServerStorageProvider } from "./services/ServerStorageProvider";
import { BoardService } from "./services/BoardService";
import { GitService } from "./services/GitService";
import { BoardPanel, BoardViewProvider, ControllerDeps } from "./panel/BoardPanel";
import { Logger } from "./services/Logger";
import { setLanguage, t } from "./i18n";

let boardService: BoardService | undefined;
let gitService: GitService | undefined;
let storage: StorageProvider | undefined;
let syncTimer: NodeJS.Timeout | undefined;
let userTimer: NodeJS.Timeout | undefined;

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
    sshHost: c.get("sshHost", ""),
    sshPort: c.get("sshPort", 22),
    sqliteRemotePath: c.get("sqliteRemotePath", "~/sqlite/branchboard.db"),
    sshKeyPath: c.get("sshKeyPath", ""),
    defaultMainBranch: c.get("defaultMainBranch", "main"),
    remoteName: c.get("remoteName", "origin"),
    autoDetectGitUser: c.get("autoDetectGitUser", true),
    autoImportGitUsers: c.get("autoImportGitUsers", true),
    syncUsersIntervalHours: c.get("syncUsersIntervalHours", 24),
    currentUser: c.get("currentUser", ""),
    availableUsers: c.get("availableUsers", []) as BoardUser[],
    syncIntervalSeconds: c.get("syncIntervalSeconds", 20),
    allowDirectMergeToMain: c.get("allowDirectMergeToMain", false),
    requireConfirmationBeforeMerge: c.get("requireConfirmationBeforeMerge", true),
    requireCleanWorkingTreeBeforeFinish: c.get("requireCleanWorkingTreeBeforeFinish", true),
    runCommandBeforeFinish: c.get("runCommandBeforeFinish", ""),
    deleteRemoteBranchAfterMerge: c.get("deleteRemoteBranchAfterMerge", false),
    deleteLocalBranchAfterMerge: c.get("deleteLocalBranchAfterMerge", false),
    language: (c.get<string>("language", "pl") === "en" ? "en" : "pl") as "pl" | "en",
    aiPromptTemplate: c.get("aiPromptTemplate", ""),
    criticalPaths: c.get("criticalPaths", [
      "payment", "checkout", "koszyk", "order", "auth",
      "admin", "database", "migration", "config", "security",
    ]) as string[],
    impactAreas: c.get("impactAreas", [
      { id: "checkout", name: "Checkout", paths: ["checkout", "koszyk", "cart", "order", "zamowienie"] },
      { id: "auth", name: "Auth", paths: ["auth", "login", "konto", "session"] },
      { id: "admin", name: "Admin", paths: ["admin", "panel"] },
      { id: "database", name: "Database", paths: ["migration", "schema", "database", ".sql"] },
      { id: "seo", name: "SEO", paths: ["seo", "meta", "canonical", "sitemap"] },
    ]) as BranchBoardConfig["impactAreas"],
    updateBranchStrategy: (c.get<string>("updateBranchStrategy", "merge") === "rebase" ? "rebase" : "merge") as "merge" | "rebase",
    devBranch: c.get("devBranch", "dev"),
    finishOnMoveToDone: c.get("finishOnMoveToDone", false),
    allowForceDeleteBranch: c.get("allowForceDeleteBranch", false),
    devDeployCommand: c.get("devDeployCommand", ""),
    devDeployUrlTemplate: c.get("devDeployUrlTemplate", ""),
    productionBranch: c.get("productionBranch", "main"),
    productionDeployCommand: c.get("productionDeployCommand", ""),
    allowProductionDeploy: c.get("allowProductionDeploy", false),
    requireConfirmationBeforeProductionDeploy: c.get("requireConfirmationBeforeProductionDeploy", true),
    createSafetyTagBeforeMerge: c.get("createSafetyTagBeforeMerge", false),
    createBackupBranchBeforeMerge: c.get("createBackupBranchBeforeMerge", true),
    appearance: {
      compactMode: c.get("appearance.compactMode", false),
      showBranchBadges: c.get("appearance.showBranchBadges", true),
      showComments: c.get("appearance.showComments", true),
      showChecklist: c.get("appearance.showChecklist", true),
      showAvatars: c.get("appearance.showAvatars", true),
      showPriority: c.get("appearance.showPriority", true),
      reduceAnimations: c.get("appearance.reduceAnimations", false),
    },
  };
}

function getWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function buildLocalStorage(config: BranchBoardConfig, root: vscode.Uri): StorageProvider {
  return new LocalJsonStorageProvider(
    root,
    config.localDataFile,
    config.projectName,
    config.boardTitle,
    config.availableUsers
  );
}

function buildStorage(config: BranchBoardConfig, root: vscode.Uri): StorageProvider {
  if (config.storageMode === "server") {
    // Empty sshHost = the extension runs ON the server -> access SQLite locally.
    // sshHost set = connect to that host over SSH. Same DB path either way.
    try {
      return new ServerStorageProvider({
        host: config.sshHost,
        port: config.sshPort,
        dbPath: config.sqliteRemotePath,
        sshKeyPath: config.sshKeyPath,
        projectName: config.projectName,
        boardTitle: config.boardTitle,
        seedUsers: config.availableUsers,
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `BranchBoard: invalid server config — ${err?.message ?? err}. Using local JSON.`
      );
      return buildLocalStorage(config, root);
    }
  }
  return buildLocalStorage(config, root);
}

export async function activate(context: vscode.ExtensionContext) {
  Logger.init();
  Logger.info("BranchBoard activating.");
  setLanguage(readConfig().language);
  const root = getWorkspaceRoot();
  if (!root) {
    // No workspace: register commands that explain the requirement, then stop.
    const warn = () => vscode.window.showErrorMessage(t("needWorkspace"));
    for (const cmd of [
      "branchBoard.openBoard",
      "branchBoard.openCommandCenter",
      "branchBoard.createTask",
      "branchBoard.refreshBoard",
      "branchBoard.syncNow",
      "branchBoard.checkoutTaskBranch",
      "branchBoard.finishTask",
      "branchBoard.configure",
      "branchBoard.selectSshKey",
      "branchBoard.syncUsersFromGit",
    ]) {
      context.subscriptions.push(vscode.commands.registerCommand(cmd, warn));
    }
    return;
  }

  const config = readConfig();
  Logger.info(
    `Workspace: ${root.uri.fsPath} · storageMode=${config.storageMode}` +
      (config.storageMode === "server"
        ? ` · host=${config.sshHost || "(local)"} · db=${config.sqliteRemotePath} · key=${config.sshKeyPath || "(default)"}`
        : ` · file=${config.localDataFile}`)
  );
  storage = buildStorage(config, root.uri);
  boardService = new BoardService(storage);
  gitService = new GitService(root.uri.fsPath, readConfig);

  try {
    await boardService.init();
    Logger.info(`Board loaded from ${storage.kind} storage.`);
  } catch (err: any) {
    Logger.error(`Initial load failed on ${storage.kind} storage: ${err?.message ?? err}`);
    if (storage.kind === "server") {
      // Loud, non-destructive fallback: keep the board usable on local JSON so
      // the panel still opens, but make the degradation obvious and offer
      // one-click ways back onto the server. The same boardService instance is
      // reused so panels/listeners created later stay wired.
      try {
        storage.dispose();
        storage = buildLocalStorage(config, root.uri);
        await boardService.useStorage(storage);
        Logger.warn("Server unreachable — fell back to LOCAL JSON. The board is NOT synced with the server.");
      } catch (err2: any) {
        vscode.window.showErrorMessage(t("loadFailed", { error: err2?.message ?? String(err2) }));
      }
      notifyServerUnreachable(err);
    } else {
      vscode.window.showErrorMessage(t("loadFailed", { error: err?.message ?? String(err) }));
    }
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

    vscode.commands.registerCommand("branchBoard.openCommandCenter", () =>
      BoardPanel.createOrShow(deps, "command")
    ),

    vscode.commands.registerCommand("branchBoard.createTask", async () => {
      const title = await vscode.window.showInputBox({ prompt: t("taskTitlePrompt") });
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
      await vscode.window.showInformationMessage(t("finishHint"));
      BoardPanel.createOrShow(deps);
    }),

    vscode.commands.registerCommand("branchBoard.configure", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "branchBoard")
    ),

    vscode.commands.registerCommand("branchBoard.selectSshKey", () => selectSshKey()),

    vscode.commands.registerCommand("branchBoard.syncUsersFromGit", () => syncUsersFromGit(true)),

    vscode.commands.registerCommand("branchBoard.showLogs", () => Logger.show()),

    vscode.commands.registerCommand("branchBoard.reconnectServer", () => retryServerConnection())
  );

  // Import users from Git on startup, then keep them fresh on a daily cadence.
  if (config.autoImportGitUsers) {
    void syncUsersFromGit(false);
  }
  startUserSyncTimer(config.syncUsersIntervalHours);

  /* ---------------- Periodic sync ---------------- */
  startSyncTimer(config.syncIntervalSeconds);

  // Restart storage / timer when relevant settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("branchBoard")) {
        const newCfg = readConfig();
        setLanguage(newCfg.language);
        startSyncTimer(newCfg.syncIntervalSeconds);
        startUserSyncTimer(newCfg.syncUsersIntervalHours);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      if (syncTimer) {
        clearInterval(syncTimer);
      }
      if (userTimer) {
        clearInterval(userTimer);
      }
      boardService?.dispose();
      storage?.dispose();
    },
  });
}

/**
 * Scan ~/.ssh for private keys and let the user pick one. The choice is saved
 * to branchBoard.sshKeyPath and used by GitService for all Git operations.
 */
async function selectSshKey() {
  const sshDir = path.join(os.homedir(), ".ssh");
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sshDir);
  } catch {
    vscode.window.showErrorMessage(`BranchBoard: could not read ${sshDir}. Does the .ssh folder exist?`);
    return;
  }

  // Exclude public keys and non-key files; keep likely private keys.
  const skip = new Set(["known_hosts", "known_hosts.old", "config", "authorized_keys", "environment"]);
  const keys = entries
    .filter((f) => !f.endsWith(".pub") && !f.startsWith(".") && !skip.has(f))
    .filter((f) => {
      try {
        return fs.statSync(path.join(sshDir, f)).isFile();
      } catch {
        return false;
      }
    })
    .sort();

  type KeyPick = vscode.QuickPickItem & { value: string };
  const items: KeyPick[] = [
    { label: "$(circle-slash) Default (SSH agent / ~/.ssh/config)", description: "Clear the configured key", value: "" },
    ...keys.map((k) => ({
      label: `$(key) ${k}`,
      description: path.join(sshDir, k),
      value: path.join(sshDir, k),
    })),
    { label: "$(folder) Browse…", description: "Pick a key file from anywhere", value: "__browse__" },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select the SSH private key for Git / server connections",
  });
  if (!picked) {
    return;
  }

  let value = picked.value;
  if (value === "__browse__") {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      defaultUri: vscode.Uri.file(sshDir),
      openLabel: "Use this SSH key",
    });
    if (!uris || uris.length === 0) {
      return;
    }
    value = uris[0].fsPath;
  }

  // Saved per-project (Workspace -> .vscode/settings.json) so it sticks across
  // restarts together with the rest of the BranchBoard config for this repo.
  await vscode.workspace
    .getConfiguration("branchBoard")
    .update("sshKeyPath", value, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(
    value ? `BranchBoard: using SSH key ${value}` : "BranchBoard: cleared SSH key (using default)."
  );
}

/**
 * Server mode could not be reached at start (or on a retry). Show a clear,
 * actionable warning instead of silently degrading. The board keeps working on
 * local JSON in the meantime.
 */
function notifyServerUnreachable(err: any) {
  const msg = t("serverUnreachable", { error: err?.message ?? String(err) });
  const retry = t("retry");
  const pickKey = t("selectSshKeyAction");
  const open = t("openSettings");
  void vscode.window.showWarningMessage(msg, retry, pickKey, open).then((choice) => {
    if (choice === retry) {
      void retryServerConnection();
    } else if (choice === pickKey) {
      void selectSshKey();
    } else if (choice === open) {
      void vscode.commands.executeCommand("workbench.action.openSettings", "branchBoard");
    }
  });
}

/**
 * Try to (re)connect to the SSH/SQLite server with the current settings. On
 * success the board is reloaded from the shared DB; on failure we stay on local
 * JSON and re-offer the actions. Reuses the existing BoardService instance.
 */
async function retryServerConnection() {
  const root = getWorkspaceRoot();
  const cfg = readConfig();
  if (!root || !boardService) {
    return;
  }
  if (cfg.storageMode !== "server") {
    vscode.window.showInformationMessage(t("notServerMode"));
    return;
  }
  const candidate = buildStorage(cfg, root.uri);
  if (candidate.kind !== "server") {
    // buildStorage already reported the invalid config and returned local JSON.
    return;
  }
  try {
    storage?.dispose();
    storage = candidate;
    await boardService.useStorage(candidate);
    Logger.info("Reconnected to server storage; board reloaded from the shared database.");
    vscode.window.showInformationMessage(t("serverReconnected"));
  } catch (err: any) {
    Logger.error(`Reconnect failed: ${err?.message ?? err}`);
    candidate.dispose();
    storage = buildLocalStorage(cfg, root.uri);
    try {
      await boardService.useStorage(storage);
    } catch {
      /* board already loaded on the previous provider; keep it */
    }
    notifyServerUnreachable(err);
  }
}

/**
 * Pull commit authors from Git and merge them into the board's user list.
 * @param announce show a message even when nothing new was found (manual use).
 */
async function syncUsersFromGit(announce: boolean) {
  if (!gitService || !boardService) {
    return;
  }
  try {
    if (!(await gitService.isRepo())) {
      if (announce) {
        vscode.window.showWarningMessage(t("noGitRepo"));
      }
      return;
    }
    const contributors = await gitService.getContributors();
    const added = await boardService.importUsersFromGit(contributors);
    if (added > 0) {
      vscode.window.showInformationMessage(t("usersImported", { count: added }));
    } else if (announce) {
      vscode.window.showInformationMessage(t("usersUpToDate"));
    }
  } catch (err: any) {
    if (announce) {
      vscode.window.showErrorMessage(t("userSyncFailed", { error: err?.message ?? String(err) }));
    }
  }
}

function startUserSyncTimer(hours: number) {
  if (userTimer) {
    clearInterval(userTimer);
    userTimer = undefined;
  }
  if (!hours || hours <= 0) {
    return; // only startup + manual
  }
  const ms = hours * 60 * 60 * 1000;
  userTimer = setInterval(() => {
    if (readConfig().autoImportGitUsers) {
      void syncUsersFromGit(false);
    }
  }, ms);
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
  if (userTimer) {
    clearInterval(userTimer);
  }
  boardService?.dispose();
  storage?.dispose();
  Logger.dispose();
}
