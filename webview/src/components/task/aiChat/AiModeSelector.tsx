import { AI_CHAT_MODES, AiChatMode } from "./aiChatTypes";
import { t } from "../../../i18n";

interface Props {
  value: AiChatMode;
  onChange: (mode: AiChatMode) => void;
  disabled?: boolean;
}

/** Composer mode dropdown: Agent / Plan / Debug / Multitask / Ask. Purely a prompt/routing switch on the front end — see aiChatUtils.modePromptPrefix. */
export function AiModeSelector(props: Props) {
  const active = AI_CHAT_MODES.find((m) => m.id === props.value) ?? AI_CHAT_MODES[0];
  return (
    <select
      className="bb-input bb-ai-chat-mode-select"
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value as AiChatMode)}
      title={t(active.helpKey)}
      aria-label={t("aiChat.modeLabel")}
    >
      {AI_CHAT_MODES.map((mode) => (
        <option key={mode.id} value={mode.id} title={t(mode.helpKey)}>
          {t(mode.labelKey)}
        </option>
      ))}
    </select>
  );
}
