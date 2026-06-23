import * as vscode from "vscode";
import { GitService } from "./GitService";
import { TitleBarConfig } from "../types";
import { Logger } from "./Logger";

/**
 * Branch button shown in the Status Bar (bottom of the window).
 *
 * Why the status bar and not the title bar: VS Code/Cursor expose no public
 * extension API to add a custom button inside the native title bar itself —
 * that chrome (including Cursor's own "Agents Window" pill) is proprietary
 * UI, not an extension point. The Status Bar is the closest native,
 * extensible equivalent: it is real VS Code chrome, supports a clickable
 * item with a custom text color, and (unlike the title bar) a small set of
 * theme-approved background colors.
 *
 * Clicking the button runs branchBoard.checkoutTaskBranch — the same branch
 * switcher already used elsewhere in the extension — so the user can change
 * branches directly from the button, the way they would from the
 * "Agents Window" button's dropdown.
 */
export class BranchStatusBarService implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private lastBranch: string | null | undefined;
  private config: TitleBarConfig | undefined;

  constructor(private readonly git: GitService) {
    this.item = vscode.window.createStatusBarItem("branchBoard.branchButton", vscode.StatusBarAlignment.Right, 100);
    this.item.name = "BranchBoard: Branch";
    this.item.command = "branchBoard.checkoutTaskBranch";
  }

  apply(config: TitleBarConfig) {
    this.config = config;
    if (!config.branchButtonEnabled) {
      this.item.hide();
      this.stopPolling();
      return;
    }
    this.applyStyle();
    void this.refresh();
    this.startPolling();
    this.item.show();
  }

  dispose() {
    this.stopPolling();
    this.item.dispose();
  }

  private applyStyle() {
    if (!this.config) {
      return;
    }
    this.item.color = isHexColor(this.config.branchButtonColor) ? this.config.branchButtonColor : "#ffffff";
    this.item.backgroundColor = resolveBackground(this.config.branchButtonBackground);
  }

  private startPolling() {
    this.stopPolling();
    // Lightweight poll — cheap (`git rev-parse --abbrev-ref HEAD`) and keeps
    // the button correct after checkouts done outside BranchBoard (e.g. the
    // Source Control view, or the terminal).
    this.timer = setInterval(() => void this.refresh(), 4000);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async refresh() {
    try {
      const branch = await this.git.getCurrentBranch();
      if (branch === this.lastBranch) {
        return;
      }
      this.lastBranch = branch;
      this.item.text = branch ? `$(git-branch) ${branch}` : "$(git-branch) HEAD";
      this.item.tooltip = branch
        ? `BranchBoard — bieżący branch: ${branch}\nKliknij, aby przełączyć branch zadania.`
        : "BranchBoard — brak repozytorium Git lub detached HEAD.";
    } catch (err: any) {
      Logger.warn(`BranchStatusBarService: could not read current branch — ${err?.message ?? err}`);
    }
  }
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

function resolveBackground(kind: TitleBarConfig["branchButtonBackground"]): vscode.ThemeColor | undefined {
  switch (kind) {
    case "prominent":
      return new vscode.ThemeColor("statusBarItem.prominentBackground");
    case "warning":
      return new vscode.ThemeColor("statusBarItem.warningBackground");
    case "error":
      return new vscode.ThemeColor("statusBarItem.errorBackground");
    case "none":
    default:
      return undefined;
  }
}
