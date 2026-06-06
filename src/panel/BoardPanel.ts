import * as vscode from "vscode";
import {
  BoardData,
  BranchBoardConfig,
  GitInfo,
  InboundMessage,
  OutboundMessage,
} from "../types";
import { BoardService } from "../services/BoardService";
import { GitService, finishTaskGitFlow } from "../services/GitService";

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

  constructor(
    private readonly webview: vscode.Webview,
    private readonly deps: ControllerDeps
  ) {
    this.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.deps.context.extensionUri, "webview", "dist"),
        vscode.Uri.joinPath(this.deps.context.extensionUri, "media"),
      ],
    };
    this.webview.html = this.getHtml();

    this.webview.onDidReceiveMessage((msg: InboundMessage) => this.onMessage(msg));

    // Re-push board on any change.
    this.boardSub = this.deps.board.onBoardChanged((b) => this.postBoard(b));
    this.notifSub = this.deps.board.onNotification((n) =>
      vscode.window.showInformationMessage(`BranchBoard: ${n.message}`)
    );
  }

  dispose() {
    this.boardSub?.();
    this.notifSub?.();
  }

  private post(msg: OutboundMessage) {
    void this.webview.postMessage(msg);
  }

  private postBoard(board: BoardData) {
    this.post({ type: "boardData", payload: board });
  }

  private async postGitInfo() {
    const info = await this.deps.git.getInfo();
    const board = this.deps.board.getBoard();
    const currentUserId = resolveCurrentUserId(board, info, this.deps.getConfig());
    this.deps.board.setNotificationContext(currentUserId ?? "");
    this.post({ type: "gitInfo", payload: { git: info, currentUserId } });
  }

  private async onMessage(msg: InboundMessage) {
    const { board, git, getConfig } = this.deps;
    try {
      switch (msg.type) {
        case "ready":
          this.postBoard(board.getBoard());
          await this.postGitInfo();
          break;

        case "refresh":
          this.postBoard(board.getBoard());
          await this.postGitInfo();
          break;

        case "getGitInfo":
          await this.postGitInfo();
          break;

        case "createTask":
          await board.createTask(msg.payload);
          break;

        case "updateTask":
          await board.updateTask(msg.payload.id, msg.payload.patch);
          break;

        case "deleteTask": {
          // Confirmation is requested from the extension host for safety.
          const ok = await vscode.window.showWarningMessage(
            `Delete task "${msg.payload.title ?? ""}"?`,
            { modal: true },
            "Delete"
          );
          if (ok === "Delete") {
            await board.deleteTask(msg.payload.id);
          }
          break;
        }

        case "moveTask":
          await board.moveTask(msg.payload.taskId, msg.payload.toColumnId, msg.payload.toIndex);
          break;

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

        case "addComment":
          await board.addComment(msg.payload.taskId, msg.payload.authorId, msg.payload.text);
          break;

        case "assignUser":
          await board.updateTask(msg.payload.taskId, { assignedUserId: msg.payload.userId });
          break;

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
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "checkoutBranch": {
          const res = await git.checkoutBranch(msg.payload.branchName);
          this.reply(msg, res);
          this.toast(res);
          await this.postGitInfo();
          break;
        }

        case "pushBranch": {
          const res = await git.pushBranch(msg.payload.branchName);
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
          this.reply(msg, result);
          this.toast(result);
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

  private toast(result: { ok: boolean; message: string; detail?: string }) {
    if (result.ok) {
      vscode.window.showInformationMessage(`BranchBoard: ${result.message}`);
    } else {
      vscode.window.showErrorMessage(`BranchBoard: ${result.message}${result.detail ? `\n${result.detail}` : ""}`);
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

  static createOrShow(deps: ControllerDeps) {
    const column = vscode.ViewColumn.Active;
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(column);
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
