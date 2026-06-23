import { t } from "../../../i18n";

export type AiQuickActionId = "prompt" | "plan" | "work" | "review" | "rules" | "diff" | "save";

interface Props {
  /** Inserts text into the composer (preferred, safe default) instead of sending immediately. */
  onInsert: (text: string) => void;
  /** "prompt" alone triggers the existing generate-prompt action directly since it has no destructive effect and already fills the textarea server-side. */
  onGeneratePrompt: () => void;
  disabled?: boolean;
}

/**
 * Lightweight chips above the composer, replacing the old heavy action
 * cards. Per the safety-first UX requirement, every chip except "Wygeneruj
 * prompt" inserts its slash command into the composer rather than sending —
 * the user always has a final chance to edit/cancel before anything runs.
 */
export function AiQuickActions(props: Props) {
  const items: { id: AiQuickActionId; label: string; insertText?: string }[] = [
    { id: "prompt", label: t("aiChat.quick.prompt") },
    { id: "plan", label: t("aiChat.quick.plan"), insertText: "/plan " },
    { id: "work", label: t("aiChat.quick.work"), insertText: "/work " },
    { id: "review", label: t("aiChat.quick.review"), insertText: "/review " },
    { id: "rules", label: t("aiChat.quick.rules"), insertText: "/rules " },
    { id: "diff", label: t("aiChat.quick.diff"), insertText: "/diff " },
    { id: "save", label: t("aiChat.quick.save"), insertText: "/save " },
  ];

  return (
    <div className="bb-ai-chat-quick-actions" role="toolbar" aria-label={t("aiChat.quickActionsLabel")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="bb-chip bb-ai-chat-quick-chip"
          disabled={props.disabled}
          onClick={() => (item.id === "prompt" ? props.onGeneratePrompt() : props.onInsert(item.insertText ?? ""))}
          title={t(`tooltips.aiChat.quick.${item.id}`)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
