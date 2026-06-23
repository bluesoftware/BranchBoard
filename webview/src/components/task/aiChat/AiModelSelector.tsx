import { AIAgentDefinition } from "../../../types";
import { t } from "../../../i18n";
import { GearIcon } from "../../Icons";

interface Props {
  /** Only ENABLED agents from BranchBoard settings — never a hardcoded list. */
  enabledAIAgents: AIAgentDefinition[];
  selectedAIAgent: AIAgentDefinition | null;
  selectedModel: string;
  customModelMode: boolean;
  onSelectModel: (model: string) => void;
  onSetCustomMode: (custom: boolean) => void;
  onOpenSettings?: () => void;
  disabled?: boolean;
}

/**
 * Model dropdown for the chat composer. Options come ONLY from the currently
 * selected active AIAgentDefinition's `models` (when it allows model choice)
 * — identical derivation to the one used by the legacy AiAgentPanel, kept in
 * one place conceptually even though it's inlined by the caller, so both UIs
 * always agree on what "active models" means.
 */
export function AiModelSelector(props: Props) {
  if (props.enabledAIAgents.length === 0) {
    return (
      <div className="bb-ai-chat-model-empty">
        <span className="bb-muted small">{t("aiChat.noActiveModels")}</span>
        {props.onOpenSettings && (
          <button type="button" className="bb-btn ghost sm" onClick={props.onOpenSettings} title={t("tooltips.aiChat.openSettings")}>
            <GearIcon size={12} />
            {t("aiChat.openSettings")}
          </button>
        )}
      </div>
    );
  }

  const options = props.selectedAIAgent?.allowModels
    ? Array.from(new Set(["auto", ...(props.selectedAIAgent.models ?? []).filter((m) => m.trim().length > 0)]))
    : ["auto"];
  const isCustom = props.customModelMode || (props.selectedModel !== "" && !options.includes(props.selectedModel));

  return (
    <div className="bb-ai-chat-model-picker">
      <select
        className="bb-input bb-ai-chat-model-select"
        value={isCustom ? "__custom" : props.selectedModel || "auto"}
        disabled={props.disabled || !props.selectedAIAgent?.allowModels}
        onChange={(e) => {
          const custom = e.target.value === "__custom";
          props.onSetCustomMode(custom);
          props.onSelectModel(custom ? "" : e.target.value);
        }}
        title={t("tooltips.aiAgent.model")}
        aria-label={t("aiChat.modelLabel")}
      >
        {options.map((model) => (
          <option key={model} value={model}>
            {model === "auto" ? t("aiAgent.modelAuto") : model}
          </option>
        ))}
        {props.selectedAIAgent?.allowModels && <option value="__custom">{t("aiAgent.modelCustom")}</option>}
      </select>
      {isCustom && props.selectedAIAgent?.allowModels && (
        <input
          className="bb-input bb-ai-chat-model-custom"
          value={props.selectedModel}
          placeholder={t("aiAgent.modelPlaceholder")}
          onChange={(e) => props.onSelectModel(e.target.value)}
          title={t("tooltips.aiAgent.modelCustom")}
        />
      )}
    </div>
  );
}
