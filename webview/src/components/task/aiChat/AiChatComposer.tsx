import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { AIAgentDefinition, BoardTask, CursorSubAgentInfo } from "../../../types";
import { t } from "../../../i18n";
import { AttachIcon, SendIcon } from "../../Icons";
import { AiChatMode } from "./aiChatTypes";
import { AiModeSelector } from "./AiModeSelector";
import { AiModelSelector } from "./AiModelSelector";
import { AiAgentPersonaSelector } from "./AiAgentPersonaSelector";

export type AiChatStatus = "idle" | "busy" | "error";

interface Props {
  task: BoardTask;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  mode: AiChatMode;
  onModeChange: (mode: AiChatMode) => void;
  status: AiChatStatus;
  busy: boolean;

  enabledAIAgents: AIAgentDefinition[];
  selectedAIAgent: AIAgentDefinition | null;
  selectedModel: string;
  customModelMode: boolean;
  onSelectModel: (model: string) => void;
  onSetCustomMode: (custom: boolean) => void;
  onOpenSettings?: () => void;

  cursorAgents: CursorSubAgentInfo[];
  selectedCursorAgentIds: string[];
  onTogglePersona: (agentId: string) => void;
  onRefreshPersonas: () => void;
}

const STATUS_LABEL: Record<AiChatStatus, string> = {
  idle: "aiChat.status.idle",
  busy: "aiChat.status.busy",
  error: "aiChat.status.error",
};

/** Bottom composer: textarea + mode/model/persona pickers + send/stop + status. Enter sends, Shift+Enter inserts a newline. */
export function AiChatComposer(props: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!props.busy && props.value.trim()) {
        props.onSend();
      }
    }
  };

  const insertAttachMarker = () => {
    const el = textareaRef.current;
    const marker = "@task ";
    if (!el) {
      props.onChange(`${props.value}${marker}`);
      return;
    }
    const start = el.selectionStart ?? props.value.length;
    const end = el.selectionEnd ?? props.value.length;
    const next = `${props.value.slice(0, start)}${marker}${props.value.slice(end)}`;
    props.onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + marker.length;
    });
  };

  return (
    <div className="bb-ai-chat-composer">
      <div className="bb-ai-chat-composer-input">
        <textarea
          ref={textareaRef}
          className="bb-textarea bb-ai-chat-textarea"
          value={props.value}
          placeholder={t("aiChat.composerPlaceholder")}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={props.busy}
          title={t("tooltips.aiChat.composer")}
        />
        <div className="bb-ai-chat-composer-side">
          <button
            type="button"
            className="bb-btn ghost sm bb-ai-chat-attach"
            onClick={insertAttachMarker}
            title={t("tooltips.aiChat.attach")}
            aria-label={t("aiChat.attach")}
            disabled={props.busy}
          >
            <AttachIcon size={13} />
          </button>
          {props.busy ? (
            <button type="button" className="bb-btn danger sm" onClick={props.onCancel} title={t("tooltips.aiAgent.stop")}>
              {t("aiAgent.stop")}
            </button>
          ) : (
            <button
              type="button"
              className="bb-btn accent sm bb-ai-chat-send"
              onClick={props.onSend}
              disabled={!props.value.trim()}
              title={t("tooltips.aiChat.send")}
              aria-label={t("aiChat.send")}
            >
              <SendIcon size={13} />
              {t("aiChat.send")}
            </button>
          )}
        </div>
      </div>

      <div className="bb-ai-chat-composer-controls">
        <AiModeSelector value={props.mode} onChange={props.onModeChange} disabled={props.busy} />
        <AiModelSelector
          enabledAIAgents={props.enabledAIAgents}
          selectedAIAgent={props.selectedAIAgent}
          selectedModel={props.selectedModel}
          customModelMode={props.customModelMode}
          onSelectModel={props.onSelectModel}
          onSetCustomMode={props.onSetCustomMode}
          onOpenSettings={props.onOpenSettings}
          disabled={props.busy}
        />
        <AiAgentPersonaSelector
          task={props.task}
          agents={props.cursorAgents}
          selectedIds={props.selectedCursorAgentIds}
          onToggle={props.onTogglePersona}
          onRefresh={props.onRefreshPersonas}
        />
        <span className={`bb-ai-chat-status ${props.status}`}>
          <span className="bb-ai-chat-status-dot" />
          {t(STATUS_LABEL[props.status])}
        </span>
      </div>
    </div>
  );
}
