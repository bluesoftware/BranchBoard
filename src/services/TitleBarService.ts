import * as vscode from "vscode";
import { TitleBarConfig, TitleBarPreset } from "../types";
import { Logger } from "./Logger";

/**
 * Applies BranchBoard's `titleBar.*` settings to the VS Code / Cursor chrome:
 *  - colors  -> merged into the workspace's `workbench.colorCustomizations`
 *               (only the keys this service owns; everything else the user
 *               already set there is preserved untouched).
 *  - branch  -> appended to `window.title` using the built-in
 *               `${activeRepositoryBranchName}` variable.
 *
 * Limitation (by design of the VS Code API, not a bug here): the title bar
 * renders as a single line of text with ONE background color. There is no
 * public API to give a substring — e.g. just the branch name — its own
 * background "badge" inside the native title bar. `branchSeparator` is the
 * closest practical equivalent: a visually distinct marker placed right
 * before the branch name.
 */

const OWNED_COLOR_KEYS = [
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.activeBorder",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
  "titleBar.border",
] as const;

/** Color presets matching popular themes (active bg/fg/border, inactive bg/fg). */
const PRESETS: Record<Exclude<TitleBarPreset, "custom">, {
  backgroundColor: string;
  foregroundColor: string;
  borderColor: string;
  inactiveBackgroundColor: string;
  inactiveForegroundColor: string;
}> = {
  default: {
    backgroundColor: "#1f1f1f",
    foregroundColor: "#cccccc",
    borderColor: "#000000",
    inactiveBackgroundColor: "#181818",
    inactiveForegroundColor: "#6b6b6b",
  },
  dracula: {
    backgroundColor: "#282a36",
    foregroundColor: "#f8f8f2",
    borderColor: "#191a21",
    inactiveBackgroundColor: "#21222c",
    inactiveForegroundColor: "#6272a4",
  },
  oneDarkPro: {
    backgroundColor: "#282c34",
    foregroundColor: "#abb2bf",
    borderColor: "#181a1f",
    inactiveBackgroundColor: "#21252b",
    inactiveForegroundColor: "#5c6370",
  },
  nightOwl: {
    backgroundColor: "#011627",
    foregroundColor: "#d6deeb",
    borderColor: "#01101d",
    inactiveBackgroundColor: "#010e1a",
    inactiveForegroundColor: "#4b6479",
  },
  monokai: {
    backgroundColor: "#272822",
    foregroundColor: "#f8f8f2",
    borderColor: "#1e1f1a",
    inactiveBackgroundColor: "#1e1f1a",
    inactiveForegroundColor: "#75715e",
  },
  solarizedDark: {
    backgroundColor: "#073642",
    foregroundColor: "#eee8d5",
    borderColor: "#04282f",
    inactiveBackgroundColor: "#04282f",
    inactiveForegroundColor: "#657b83",
  },
};

export function resolveTitleBarPreset(preset: TitleBarPreset): TitleBarConfig | null {
  if (preset === "custom") {
    return null;
  }
  const colors = PRESETS[preset];
  if (!colors) {
    return null;
  }
  return {
    enabled: true,
    preset,
    showBranch: true,
    branchSeparator: "  ⎇ ",
    branchButtonEnabled: true,
    branchButtonColor: "#ffffff",
    branchButtonBackground: "prominent",
    ...colors,
  };
}

/** Default `window.title` VS Code ships with (used as the base when disabling). */
const DEFAULT_WINDOW_TITLE = "${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}";

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

export const TitleBarService = {
  /**
   * Apply (or remove) BranchBoard's title bar customization for the current
   * workspace. Safe to call repeatedly — it's idempotent and only ever
   * touches the keys it owns.
   */
  async apply(config: TitleBarConfig): Promise<void> {
    try {
      await applyColors(config);
      await applyWindowTitle(config);
    } catch (err: any) {
      Logger.warn(`TitleBarService: could not apply title bar settings — ${err?.message ?? err}`);
    }
  },
};

async function applyColors(config: TitleBarConfig): Promise<void> {
  const wb = vscode.workspace.getConfiguration("workbench");
  const inspected = wb.inspect<Record<string, string>>("colorCustomizations");
  const current = { ...(inspected?.workspaceValue ?? {}) };

  // Always start from "no opinion" on the keys we own, then re-add them if enabled.
  for (const key of OWNED_COLOR_KEYS) {
    delete current[key];
  }

  if (config.enabled) {
    const effective = config.preset !== "custom" ? resolveTitleBarPreset(config.preset) ?? config : config;
    const bg = isHexColor(effective.backgroundColor) ? effective.backgroundColor : "#1f1f1f";
    const fg = isHexColor(effective.foregroundColor) ? effective.foregroundColor : "#cccccc";
    const border = isHexColor(effective.borderColor) ? effective.borderColor : bg;
    const inactiveBg = isHexColor(effective.inactiveBackgroundColor) ? effective.inactiveBackgroundColor : bg;
    const inactiveFg = isHexColor(effective.inactiveForegroundColor) ? effective.inactiveForegroundColor : fg;

    current["titleBar.activeBackground"] = bg;
    current["titleBar.activeForeground"] = fg;
    current["titleBar.activeBorder"] = border;
    current["titleBar.border"] = border;
    current["titleBar.inactiveBackground"] = inactiveBg;
    current["titleBar.inactiveForeground"] = inactiveFg;
  }

  const hasAnyCustomization = Object.keys(current).length > 0;
  await wb.update(
    "colorCustomizations",
    hasAnyCustomization ? current : undefined,
    vscode.ConfigurationTarget.Workspace
  );
}

async function applyWindowTitle(config: TitleBarConfig): Promise<void> {
  const win = vscode.workspace.getConfiguration("window");
  const inspected = win.inspect<string>("title");

  if (!config.enabled || !config.showBranch) {
    // Only clear the value if WE were the ones who last set it (it still
    // contains our marker variable), so we never clobber a title the user
    // wrote by hand for unrelated reasons.
    if (inspected?.workspaceValue?.includes("${activeRepositoryBranchName}")) {
      await win.update("title", undefined, vscode.ConfigurationTarget.Workspace);
    }
    return;
  }

  const base = inspected?.workspaceValue ?? inspected?.globalValue ?? DEFAULT_WINDOW_TITLE;
  // Don't double-append if it's already there (e.g. settings re-applied).
  if (base.includes("${activeRepositoryBranchName}")) {
    return;
  }
  const withBranch = `${base}${config.branchSeparator}\${activeRepositoryBranchName}`;
  await win.update("title", withBranch, vscode.ConfigurationTarget.Workspace);
}
