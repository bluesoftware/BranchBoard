/**
 * Local-only data model for the chat-first AI Agent UX. Nothing here is
 * persisted as a new board/task field: assistant turns are derived from the
 * already-persisted `TaskAIAgents.runHistory`, and user/system/error bubbles
 * live only in React state for the lifetime of the panel (see
 * AiAgentChatPanel.tsx for why this is an intentional, low-risk choice).
 */
import { AIAgentRunHistoryItem } from "../../../types";

/** One of the five BranchBoard chat modes. Cursor's mode selector is the UX inspiration only — the backend mapping is BranchBoard's own. */
export type AiChatMode = "agent" | "plan" | "debug" | "multitask" | "ask";

export interface AiChatModeDef {
  id: AiChatMode;
  labelKey: string;
  helpKey: string;
  /** "run" maps to the real, branch-aware AI Agent run; "plan" maps to the existing read-only plan kind (never touches files). */
  backendKind: "run" | "plan";
}

/** Order shown in the mode dropdown — Agent first because it's the primary, most common action. */
export const AI_CHAT_MODES: AiChatModeDef[] = [
  { id: "agent", labelKey: "aiChat.mode.agent", helpKey: "tooltips.aiChat.modeAgent", backendKind: "run" },
  { id: "plan", labelKey: "aiChat.mode.plan", helpKey: "tooltips.aiChat.modePlan", backendKind: "plan" },
  { id: "debug", labelKey: "aiChat.mode.debug", helpKey: "tooltips.aiChat.modeDebug", backendKind: "plan" },
  { id: "multitask", labelKey: "aiChat.mode.multitask", helpKey: "tooltips.aiChat.modeMultitask", backendKind: "plan" },
  { id: "ask", labelKey: "aiChat.mode.ask", helpKey: "tooltips.aiChat.modeAsk", backendKind: "plan" },
];

export type AiChatRole = "user" | "assistant" | "system" | "error" | "tool";

/** A small, well-known error this panel knows how to explain instead of just dumping raw stderr. */
export type AiChatKnownErrorKind = "workspace-trust" | "generic";

export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  /** Plain text body. For "assistant" messages backed by a real run, prefer `turn` for rich rendering and keep this as a short fallback/summary. */
  text: string;
  createdAt: string;
  /** Present when this message represents one real Plan/Praca AI/Review turn from TaskAIAgents.runHistory. */
  turn?: AIAgentRunHistoryItem;
  /** Present on "error" messages so the UI can render a structured fix instead of plain text. */
  errorKind?: AiChatKnownErrorKind;
  /** The chat mode active when this user message was sent — shown as a small label on the bubble. */
  mode?: AiChatMode;
}
