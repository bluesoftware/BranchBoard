/** Pure helpers for the chat panel: id generation, slash commands, mode-aware prompt prefixes and known-error detection. No Git/CLI side effects live here. */
import { AiChatMode } from "./aiChatTypes";

let seq = 0;
export function nextChatMessageId(): string {
  seq += 1;
  return `chat-${Date.now()}-${seq}`;
}

/** Max number of persisted chat messages kept per task (board.json/SQLite must not grow unbounded with long-lived tasks). Oldest entries are dropped first. */
export const MAX_CHAT_MESSAGES_PER_TASK = 150;

/** Max characters kept for a single persisted chat message body. Guards against a giant pasted prompt or raw CLI stderr/stdout bloating board.json — the full output still lives in TaskAIAgents.runHistory/error, this is only the chat transcript copy. */
export const MAX_CHAT_MESSAGE_CHARS = 8000;

/** Truncates an over-long message body before it's persisted, appending a visible marker so the user knows content was cut (never invisible data loss). */
export function clampChatMessageText(text: string): string {
  if (text.length <= MAX_CHAT_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_CHAT_MESSAGE_CHARS)}\n\n…[truncated, ${text.length - MAX_CHAT_MESSAGE_CHARS} more characters omitted]`;
}

/** Applies both the per-message size clamp and the per-task message-count cap before persisting a chat transcript. */
export function clampChatHistory<T extends { text?: string }>(messages: T[]): T[] {
  const clamped = messages.map((m) => (typeof m.text === "string" ? { ...m, text: clampChatMessageText(m.text) } : m));
  return clamped.length > MAX_CHAT_MESSAGES_PER_TASK ? clamped.slice(clamped.length - MAX_CHAT_MESSAGES_PER_TASK) : clamped;
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
