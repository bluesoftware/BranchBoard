import { useEffect, useRef, useState } from "react";
import { BoardTask, CursorSubAgentInfo } from "../../../types";
import { t } from "../../../i18n";
import { CursorAgentPicker } from "../../CursorAgentPicker";

interface Props {
  task: BoardTask;
  agents: CursorSubAgentInfo[];
  selectedIds: string[];
  onToggle: (agentId: string) => void;
  onRefresh: () => void;
}

/**
 * Lightweight persona control for the chat top bar: a single chip showing
 * how many personas are attached, opening the existing searchable
 * multi-select CursorAgentPicker in a small popover instead of the old
 * half-screen panel. No persona logic was rewritten — this only relocates
 * the existing picker into a chip + dropdown.
 */
export function AiAgentPersonaSelector(props: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const count = props.selectedIds.length;
  const names = props.agents
    .filter((a) => props.selectedIds.includes(a.id))
    .map((a) => a.name)
    .join(", ");

  return (
    <div className="bb-menu-wrap bb-ai-chat-persona" ref={wrapRef}>
      <button
        type="button"
        className={`bb-chip bb-ai-chat-persona-chip ${count > 0 ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={count > 0 ? names : t("tooltips.aiAgent.cursorPersonas")}
        aria-expanded={open}
      >
        {t("aiChat.persona")}
        {count > 0 && <span className="bb-ai-chat-persona-count">{count}</span>}
      </button>
      {open && (
        <div className="bb-menu left bb-ai-chat-persona-pop">
          <CursorAgentPicker
            task={props.task}
            agents={props.agents}
            selectedIds={props.selectedIds}
            onToggle={props.onToggle}
            onRefresh={props.onRefresh}
          />
        </div>
      )}
    </div>
  );
}
