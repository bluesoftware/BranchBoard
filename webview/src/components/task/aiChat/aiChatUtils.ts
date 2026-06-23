/** Pure helpers for the chat panel: id generation, slash commands, mode-aware prompt prefixes and known-error detection. No Git/CLI side effects live here. */
import { AiChatMode } from "./aiChatTypes";

let seq = 0;
export function nextChatMessageId(): string {
  seq += 1;
  return `chat-${Date.now()}-${seq}`;
}

export type SlashCommandId = "prompt" | "plan" | "work" | "review" | "rules" | "diff" | "save";

export interface SlashCommandDef {
  id: SlashCommandId;
  /** Typed token, without the leading slash. */
  token: string;
  labelKey: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { id: "prompt", token: "prompt", labelKey: "aiChat.slash.prompt" },
  { id: "plan", token: "plan", labelKey: "aiChat.slash.plan" },
  { id: "work", token: "work", labelKey: "aiChat.slash.work" },
  { id: "review", token: "review", labelKey: "aiChat.slash.review" },
  { id: "rules", token: "rules", labelKey: "aiChat.slash.rules" },
  { id: "diff", token: "diff", labelKey: "aiChat.slash.diff" },
  { id: "save", token: "save", labelKey: "aiChat.slash.save" },
];

/** Parses "/cmd rest of text" at the start of a composer message. Returns null when the text isn't a recognized slash command (it is then sent as a normal chat message). */
export function parseSlashCommand(raw: string): { command: SlashCommandDef; rest: string } | null {
  const text = raw.trim();
  if (!text.startsWith("/")) return null;
  const spaceIdx = text.indexOf(" ");
  const token = (spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();
  const command = SLASH_COMMANDS.find((c) => c.token === token);
  return command ? { command, rest } : null;
}

/**
 * Mode-specific instruction appended/prepended to whatever ends up in
 * `TaskAIAgents.prompt` before a run. This is the entire "mode" mechanism on
 * the front end — the backend already refuses file changes for the "plan"
 * kind, so Debug/Multitask/Ask are safe by construction, not by convention.
 */
export function modePromptPrefix(mode: AiChatMode, t: (key: string, params?: Record<string, string | number>) => string): string {
  switch (mode) {
    case "debug":
      return t("aiChat.modePromptDebug");
    case "multitask":
      return t("aiChat.modePromptMultitask");
    case "ask":
      return t("aiChat.modePromptAsk");
    case "plan":
      return t("aiChat.modePromptPlan");
    case "agent":
    default:
      return "";
  }
}

/** Combines an optional mode prefix with the user's free-text message into one prompt body. */
export function composePrompt(mode: AiChatMode, userText: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const prefix = modePromptPrefix(mode, t);
  const body = userText.trim();
  if (!prefix) return body;
  if (!body) return prefix;
  return `${prefix}\n\n${body}`;
}

const WORKSPACE_TRUST_PATTERNS = [/workspace trust required/i, /workspacetrustrequired/i, /trust this workspace/i];

/** Detects the Cursor Agent headless "Workspace Trust Required" failure so the panel can render a structured fix instead of raw stderr. */
export function isWorkspaceTrustError(text: string | undefined | null): boolean {
  if (!text) return false;
  return WORKSPACE_TRUST_PATTERNS.some((re) => re.test(text));
}

/** Suggested config snippet shown in the Workspace Trust error message. Adds an explicit `--trust` flag — never `--yolo` or `-f`. */
export function buildWorkspaceTrustFixSnippet(agentId: string, command: string): string {
  return JSON.stringify(
    {
      "branchBoard.aiAgents": [
        {
          id: agentId || "cursor-agent",
          command,
          args: ["--trust", "--print"],
        },
      ],
    },
    null,
    2
  );
}
