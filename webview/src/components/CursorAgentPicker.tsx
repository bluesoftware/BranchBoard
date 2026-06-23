import { useMemo, useState } from "react";
import { BoardTask, CursorSubAgentInfo } from "../types";
import { t } from "../i18n";
import { SearchIcon, RefreshIcon } from "./Icons";

interface Props {
  task: BoardTask;
  agents: CursorSubAgentInfo[];
  selectedIds: string[];
  onToggle: (agentId: string) => void;
  onRefresh: () => void;
}

/** Extracts lowercase file extensions (without the dot) referenced by a task. */
function extractTaskExtensions(task: BoardTask): Set<string> {
  const exts = new Set<string>();
  const collectFrom = (value: string) => {
    for (const match of value.matchAll(/(?:^|[\s("'`@])([\w./-]+)\.([A-Za-z0-9]{1,8})(?=$|[\s)"'`,.;:!?])/g)) {
      exts.add(match[2].toLowerCase());
    }
  };
  collectFrom(task.title || "");
  collectFrom(task.description || "");
  collectFrom(task.acceptanceCriteria || "");
  for (const item of task.checklist ?? []) {
    collectFrom(item.text || "");
  }
  for (const comment of task.comments ?? []) {
    collectFrom(comment.text || "");
  }
  for (const file of task.attachedFiles ?? []) {
    const ext = file.split(".").pop();
    if (ext) {
      exts.add(ext.toLowerCase());
    }
  }
  return exts;
}

/** True when any of the persona's `*.ext` triggers matches an extension actually used in the task. */
function isSuggested(agent: CursorSubAgentInfo, taskExtensions: Set<string>): boolean {
  if (taskExtensions.size === 0) {
    return false;
  }
  return agent.fileTriggers.some((glob) => {
    const ext = glob.replace(/^\*\./, "").toLowerCase();
    return taskExtensions.has(ext);
  });
}

function matchesQuery(agent: CursorSubAgentInfo, query: string): boolean {
  if (!query) {
    return true;
  }
  const q = query.toLowerCase();
  return (
    agent.name.toLowerCase().includes(q) ||
    agent.description.toLowerCase().includes(q) ||
    agent.id.toLowerCase().includes(q) ||
    agent.keywordTriggers.some((kw) => kw.toLowerCase().includes(q)) ||
    agent.fileTriggers.some((g) => g.toLowerCase().includes(q)) ||
    // Search inside the full persona file content too, so e.g. typing a
    // rule keyword ("ZAKAZY", "merge") still finds the right persona.
    agent.body.toLowerCase().includes(q)
  );
}

/**
 * Searchable, multi-select picker for the Cursor sub-agent persona files
 * (`.cursor/agents/*.md`) discovered in the current workspace. Personas
 * whose file-type triggers match files actually referenced by the task are
 * highlighted as "suggested" by default.
 */
export function CursorAgentPicker(props: Props) {
  const [query, setQuery] = useState("");
  const taskExtensions = useMemo(() => extractTaskExtensions(props.task), [props.task]);

  const visibleAgents = useMemo(() => {
    const filtered = props.agents.filter((agent) => matchesQuery(agent, query));
    return filtered
      .map((agent) => ({ agent, suggested: isSuggested(agent, taskExtensions) }))
      .sort((a, b) => {
        if (a.suggested !== b.suggested) {
          return a.suggested ? -1 : 1;
        }
        return a.agent.name.localeCompare(b.agent.name);
      });
  }, [props.agents, query, taskExtensions]);

  if (props.agents.length === 0) {
    return (
      <div className="bb-cursor-agent-picker">
        <span className="bb-muted small">{t("aiAgent.cursorPersonas.empty")}</span>
        <button type="button" className="bb-ai-tool-button bb-cursor-agent-refresh" onClick={props.onRefresh}>
          <RefreshIcon size={12} />
          <span>{t("aiAgent.cursorPersonas.refresh")}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bb-cursor-agent-picker">
      <div className="bb-cursor-agent-search">
        <SearchIcon size={12} />
        <input
          className="bb-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("aiAgent.cursorPersonas.searchPlaceholder")}
        />
        <button
          type="button"
          className="bb-iconbtn bb-cursor-agent-refresh"
          onClick={props.onRefresh}
          title={t("aiAgent.cursorPersonas.refresh")}
        >
          <RefreshIcon size={12} />
        </button>
      </div>

      <div className="bb-cursor-agent-list">
        {visibleAgents.length === 0 ? (
          <span className="bb-muted small">{t("aiAgent.cursorPersonas.noMatches")}</span>
        ) : (
          visibleAgents.map(({ agent, suggested }) => {
            const active = props.selectedIds.includes(agent.id);
            return (
              <label
                key={agent.id}
                className={`bb-cursor-agent-option ${active ? "active" : ""} ${suggested ? "suggested" : ""}`}
                title={agent.description || agent.id}
              >
                <input type="checkbox" checked={active} onChange={() => props.onToggle(agent.id)} />
                <span className="bb-cursor-agent-option-body">
                  <span className="bb-cursor-agent-option-name">
                    {agent.name}
                    {suggested && (
                      <span className="bb-badge tone-success bb-cursor-agent-suggested-badge">
                        {t("aiAgent.cursorPersonas.suggested")}
                      </span>
                    )}
                  </span>
                  {agent.description && <span className="bb-cursor-agent-option-desc">{agent.description}</span>}
                  {agent.fileTriggers.length > 0 && (
                    <span className="bb-cursor-agent-option-triggers">{agent.fileTriggers.join(", ")}</span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
