import { useEffect, useRef, useState } from "react";
import {
  AIAgentLogPayload,
  AIAgentRunHistoryItem,
  AIAgentRunKind,
  AIAgentStatus,
  AppConfig,
  BoardData,
  BoardTask,
  CursorSubAgentInfo,
  TaskAIAgents,
  AiCostDecisionPayload,
  AiCostDecisionRequestPayload,
  AiContextLevel,
} from "../../types";
import { t } from "../../i18n";
import { guardTaskMove } from "../../productionGuards";
import { CheckoutIcon, CommentIcon, CopyIcon, FileIcon, SparkleIcon } from "../Icons";
import { CursorAgentPicker } from "../CursorAgentPicker";
import { Help, LabelHelp } from "../common/Help";
import { EmptyState } from "../common/EmptyState";
import { formatDate } from "../../utils";

export const AI_STATUS_TONE: Record<AIAgentStatus, string> = {
  not_configured: "tone-neutral",
  ready: "tone-info",
  planning: "tone-warning",
  running: "tone-warning",
  reviewing: "tone-warning",
  finished: "tone-success",
  failed: "tone-critical",
  cancelled: "tone-neutral",
};

/** Formats a token count for display, or an em dash when unknown. */
function formatTokenCount(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("pl-PL") : "—";
}

/** Formats an approximate cost amount with its currency code. */
function formatCost(value: number, currency: string): string {
  const amount = value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `${amount} ${currency}`;
}

/** Label for a chat-turn kind ("plan" / "run" / "review"), defaulting to "run" for older history items saved before `kind` existed. */
function turnKindLabel(kind: AIAgentRunHistoryItem["kind"]): string {
  switch (kind) {
    case "plan":
      return t("aiAgent.turnPlan");
    case "review":
      return t("aiAgent.turnReview");
    default:
      return t("aiAgent.turnRun");
  }
}

/**
 * One message bubble in the AI Agent chat timeline — a single Plan/Praca
 * AI/Review turn with its prompt (collapsed), output, changed files and
 * usage/cost, styled like a Cursor/Claude Code agent conversation.
 */
function AiChatTurn(props: { turn: AIAgentRunHistoryItem; onOpenFile: (path: string) => void }) {
  const { turn } = props;
  const kind = turn.kind ?? "run";
  const content = turn.reviewResult || turn.result || turn.plan || "";
  const TurnIcon = kind === "review" ? CommentIcon : SparkleIcon;
  return (
    <div className={`bb-ai-chat-turn kind-${kind} status-${turn.status}`}>
      <div className="bb-ai-chat-turn-head">
        <span className="bb-ai-chat-turn-icon">
          <TurnIcon size={13} />
        </span>
        <strong className="bb-ai-chat-turn-label">{turnKindLabel(kind)}</strong>
        {turn.model && <code className="bb-ai-chat-turn-model">{turn.model}</code>}
        <span className={`bb-badge ${AI_STATUS_TONE[turn.status] ?? "tone-neutral"}`}>
          {t(`aiAgent.status.${turn.status}`)}
        </span>
        <span className="bb-ai-chat-turn-time">{formatDate(turn.finishedAt || turn.startedAt)}</span>
      </div>
      {turn.prompt && (
        <details className="bb-ai-chat-turn-prompt">
          <summary>{t("aiAgent.turnPrompt")}</summary>
          <pre>{turn.prompt}</pre>
        </details>
      )}
      {turn.error ? (
        <div className="bb-callout warn">{turn.error}</div>
      ) : (
        content && <pre className="bb-ai-chat-turn-body">{content}</pre>
      )}
      {(turn.changedFiles ?? []).length > 0 && (
        <div className="bb-ai-chat-turn-files">
          {(turn.changedFiles ?? []).map((file) => (
            <span
              key={`${file.status}-${file.path}`}
              className="bb-ai-chat-file-chip"
              onClick={() => props.onOpenFile(file.path)}
              title={file.path}
            >
              <FileIcon size={11} />
              <span className="bb-ai-chat-file-status">{t(`aiAgent.fileStatus.${file.status}`)}</span>
              <span className="bb-ai-chat-file-path">{file.path}</span>
            </span>
          ))}
        </div>
      )}
      {turn.usage && (
        <div className="bb-ai-chat-turn-footer">
          <span>
            {t("aiAgent.usageInput")}: <strong>{formatTokenCount(turn.usage.inputTokens)}</strong>
          </span>
          <span>
            {t("aiAgent.usageOutput")}: <strong>{formatTokenCount(turn.usage.outputTokens)}</strong>
          </span>
          {turn.cost && (
            <span>
              {t("aiAgent.estimatedCost")}: <strong>{formatCost(turn.cost.totalCost, turn.cost.currency)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  task: BoardTask;
  board: BoardData;
  appConfig: AppConfig;
  cursorAgents: CursorSubAgentInfo[];
  aiAgentLog: AIAgentLogPayload[];
  aiAgentRunningKind: AIAgentRunKind | null;
  /** Latest AI Cost Guard decision for this task's chat, or null until the first check. */
  aiCostDecision: AiCostDecisionPayload | null;
  /** Asks the extension to (re)compute the cost-guard decision. Never runs Git or Cursor CLI itself. */
  onRequestAiCostDecision: (req: Omit<AiCostDecisionRequestPayload, "taskId">) => void;
  onSave: (patch: Partial<BoardTask>) => void;
  onGenerateAIAgentPrompt: () => void;
  onRunAIAgentPlan: () => void;
  onRunAIAgent: () => void;
  onRunAIAgentReview: () => void;
  onAcceptAIAgentResult: () => void;
  onRejectAIAgentResult: () => void;
  onCancelAIAgent: () => void;
  onCopyClipboard: (text: string, label: string) => void;
  onAiPromptCopied: () => void;
  onCheckoutBranch: (branchName: string) => void;
  onOpenFile: (path: string) => void;
  onRefreshCursorAgents: () => void;
  /**
   * Compact mode used outside the full task editor (e.g. the "Aktualny
   * branch" view): when the agent isn't enabled yet, shows a short empty
   * state with a single "Skonfiguruj AI Agent" button instead of the full
   * configuration grid. Clicking it reveals the same full panel inline —
   * there is only ever one AI Agent UI, just two entry points into it.
   */
  compact?: boolean;
}

/**
 * Single source of truth for the AI Agent UI: agent/model/persona pickers,
 * prompt generation, plan/run/review actions, live console, results and the
 * accept/reject decision. Used by both the full task editor (TaskDrawer) and
 * the "Aktualny branch" page so there is exactly one place that knows how to
 * drive an AI Agent run for a task.
 */
export function AiAgentPanel(props: Props) {
  const { task, board, appConfig } = props;
  const [customAiModelMode, setCustomAiModelMode] = useState(false);
  // Optimistic local override for the Cursor persona checkboxes — see note in
  // the previous TaskDrawer implementation this was lifted from. The webview
  // only learns about a saved selection once the extension host round-trips a
  // fresh `boardData` message, which is slower than two quick clicks in the
  // picker. Without this, the second click would compute its "selected" set
  // from the still-stale prop and silently lose the first click's choice.
  const [cursorAgentOverride, setCursorAgentOverride] = useState<{ taskId: string; ids: string[] } | null>(null);
  // Compact mode starts collapsed behind an empty state until the user
  // explicitly asks to configure the agent (or it's already enabled).
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    setCustomAiModelMode(false);
    setForceOpen(false);
    setCursorAgentOverride((current) => (current && current.taskId !== task.id ? null : current));
  }, [task.id]);

  const enabledAIAgents = (appConfig.aiAgents ?? []).filter((agent) => agent.enabled);
  const aiAgents: TaskAIAgents = task.aiAgents ?? {
    enabled: false,
    status: "not_configured",
    selectedAgentIds: enabledAIAgents[0] ? [enabledAIAgents[0].id] : [],
    selectedCursorAgentIds: [],
    selectedModel: "auto",
    prompt: "",
    plan: "",
    planFile: "",
    result: "",
    reviewResult: "",
    error: "",
    createdBranch: "",
    changedFiles: [],
    runHistory: [],
  };
  const saveAIAgents = (patch: Partial<TaskAIAgents>) => props.onSave({ aiAgents: { ...aiAgents, ...patch } });
  const selectedAIAgentId = aiAgents.selectedAgentIds?.[0] ?? "";
  const selectedAIAgent = selectedAIAgentId
    ? enabledAIAgents.find((agent) => agent.id === selectedAIAgentId) ?? null
    : enabledAIAgents[0] ?? null;
  const configuredModelOptions = selectedAIAgent?.allowModels
    ? selectedAIAgent.models?.filter((model) => model.trim().length > 0) ?? []
    : [];
  const aiModelOptions = Array.from(new Set(["auto", ...configuredModelOptions]));
  const rawSelectedModel = aiAgents.selectedModel ?? "";
  const selectedModel = rawSelectedModel || "auto";
  const customModelSelected =
    customAiModelMode || (rawSelectedModel !== "" && !aiModelOptions.includes(rawSelectedModel));
  const isAgentRunning = !!props.aiAgentRunningKind;
  // Disabled while busy — this stops the user from re-triggering Plan/Praca
  // AI/Review while a run is in flight. The real lock lives server-side; this
  // is just the UI half so it doesn't even look clickable.
  const canRunAIAgent = aiAgents.enabled && (aiAgents.selectedAgentIds ?? []).length > 0 && !isAgentRunning;
  const toggleAIAgent = (agentId: string) => {
    const selected = new Set(aiAgents.selectedAgentIds ?? []);
    selected.has(agentId) ? selected.delete(agentId) : selected.add(agentId);
    saveAIAgents({
      enabled: true,
      selectedAgentIds: Array.from(selected),
      status: selected.size > 0 ? "ready" : "not_configured",
    });
  };
  const effectiveSelectedCursorAgentIds =
    cursorAgentOverride && cursorAgentOverride.taskId === task.id
      ? cursorAgentOverride.ids
      : aiAgents.selectedCursorAgentIds ?? [];
  const toggleCursorAgent = (agentId: string) => {
    const selected = new Set(effectiveSelectedCursorAgentIds);
    selected.has(agentId) ? selected.delete(agentId) : selected.add(agentId);
    const next = Array.from(selected);
    setCursorAgentOverride({ taskId: task.id, ids: next });
    saveAIAgents({ selectedCursorAgentIds: next });
  };
  const canMoveToColumn = (columnId: string) => guardTaskMove(board, appConfig, task, columnId).ok;
  const aiAgentColumnId =
    board.columns.find((column) => column.id === appConfig.policy.aiAgentColumnId || column.gitStage === "ai-agent")
      ?.id ?? "";
  const canMoveToAIAgent =
    !!aiAgentColumnId &&
    aiAgents.enabled &&
    (aiAgents.selectedAgentIds ?? []).length > 0 &&
    !isAgentRunning &&
    task.columnId !== aiAgentColumnId &&
    canMoveToColumn(aiAgentColumnId);
  const copyAIAgentPrompt = () => {
    const prompt = aiAgents.prompt?.trim();
    if (!prompt) {
      props.onGenerateAIAgentPrompt();
      return;
    }
    props.onCopyClipboard(prompt, t("toast.aiPromptCopied"));
    props.onAiPromptCopied();
  };

  // --- AI Cost Guard / Local AI Optimizer -----------------------------------
  // Purely advisory UI: it only ever decides WHAT to send to Cursor CLI (or
  // whether to bother at all). It never runs Git and never launches Cursor
  // CLI on its own — every action below either updates local UI state or
  // calls one of the existing onRunAIAgent*/onGenerateAIAgentPrompt handlers,
  // which already go through BoardPanel's normal confirmation/lock checks.
  const [costMessage, setCostMessage] = useState("");
  const [showCostPrompt, setShowCostPrompt] = useState(false);
  const pendingPrepareOnlyRef = useRef(false);
  const decision = props.aiCostDecision;
  const costPolicy = appConfig.policy;

  useEffect(() => {
    setCostMessage("");
    setShowCostPrompt(false);
    pendingPrepareOnlyRef.current = false;
  }, [task.id]);

  useEffect(() => {
    if (pendingPrepareOnlyRef.current && decision?.action === "prepare_prompt" && decision.optimizedPrompt) {
      saveAIAgents({ prompt: decision.optimizedPrompt, status: "ready" });
      pendingPrepareOnlyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  const requestCostDecision = (overrides?: Partial<Omit<AiCostDecisionRequestPayload, "taskId">>) => {
    props.onRequestAiCostDecision({
      userMessage: costMessage.trim() || aiAgents.prompt || task.title,
      ...overrides,
    });
  };

  const toggleCostPrompt = () => {
    if (!decision) {
      requestCostDecision();
    }
    setShowCostPrompt((s) => !s);
  };

  const reduceCostContext = () => {
    const order: AiContextLevel[] = ["small", "normal", "full"];
    const current = decision?.contextLevel ?? "normal";
    const idx = order.indexOf(current);
    const next = order[Math.max(0, idx - 1)];
    requestCostDecision({ forceContextLevel: next });
  };

  const applyCostModelSuggestion = () => {
    if (decision?.modelPreference) {
      saveAIAgents({ selectedModel: decision.modelPreference });
    }
  };

  const prepareCostPromptOnly = () => {
    pendingPrepareOnlyRef.current = true;
    requestCostDecision({ forceAction: "prepare_prompt" });
  };

  const runViaCostGuard = () => {
    if (!decision) {
      requestCostDecision();
      return;
    }
    if (decision.requiresUserConfirmation) {
      const confirmed = window.confirm(`${decision.reason}\n\n${t("aiCostGuard.confirmRun")}`);
      if (!confirmed) {
        return;
      }
    }
    if (decision.action === "cursor_plan") {
      props.onRunAIAgentPlan();
    } else if (decision.action === "cursor_review") {
      props.onRunAIAgentReview();
    } else {
      props.onRunAIAgent();
    }
  };

  const aiConsoleRef = useRef<HTMLDivElement>(null);
  const aiConsoleStickToBottomRef = useRef(true);
  useEffect(() => {
    const el = aiConsoleRef.current;
    if (el && aiConsoleStickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.aiAgentLog]);

  const hasAnyAiData =
    !!aiAgents.prompt || !!aiAgents.plan || !!aiAgents.result || !!aiAgents.reviewResult || !!aiAgents.createdBranch;

  // Chat timeline: prefer the real per-turn runHistory (kind/changedFiles per
  // turn). Older tasks saved before runHistory existed only have the flat
  // plan/result/reviewResult fields — fall back to a synthesized turn per
  // non-empty field so the chat view still has something to render.
  const chatTurns: AIAgentRunHistoryItem[] =
    aiAgents.runHistory && aiAgents.runHistory.length > 0
      ? [...aiAgents.runHistory].sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""))
      : (() => {
          const legacy: AIAgentRunHistoryItem[] = [];
          const baseTurn = {
            agentId: selectedAIAgentId,
            status: "finished" as const,
            startedAt: aiAgents.lastRunAt ?? "",
            finishedAt: aiAgents.lastFinishedAt,
            prompt: aiAgents.prompt ?? "",
          };
          if (aiAgents.plan || aiAgents.planFile) {
            legacy.push({ ...baseTurn, id: "legacy-plan", kind: "plan", plan: aiAgents.plan });
          }
          if (aiAgents.result) {
            legacy.push({
              ...baseTurn,
              id: "legacy-run",
              kind: "run",
              result: aiAgents.result,
              changedFiles: aiAgents.changedFiles,
              usage: aiAgents.lastUsage,
              cost: aiAgents.lastCost,
            });
          }
          if (aiAgents.reviewResult) {
            legacy.push({ ...baseTurn, id: "legacy-review", kind: "review", reviewResult: aiAgents.reviewResult });
          }
          return legacy;
        })();

  // Compact mode (Aktualny branch): until the user explicitly opens it, an
  // unconfigured agent is a one-line empty state instead of the full grid —
  // this is the "AI Agent nie jest skonfigurowany" state from the redesign.
  if (props.compact && !aiAgents.enabled && !hasAnyAiData && !forceOpen) {
    return (
      <div className="bb-ai-agent-panel bb-ai-agent-compact-empty">
        <EmptyState
          title={t("aiAgent.notConfiguredTitle")}
          hint={t("aiAgent.notConfiguredHint")}
        />
        <button className="bb-btn accent" onClick={() => setForceOpen(true)} title={t("tooltips.aiAgent.configure")}>
          <SparkleIcon size={13} />
          {t("aiAgent.configure")}
        </button>
      </div>
    );
  }

  return (
    <div className="bb-ai-agent-panel">
      <div className="bb-ai-agent-summary">
        <label className="bb-ai-toggle" title={t("tooltips.aiAgent.enable")}>
          <input
            type="checkbox"
            checked={aiAgents.enabled}
            onChange={(e) =>
              saveAIAgents({
                enabled: e.target.checked,
                status: e.target.checked ? "ready" : "not_configured",
              })
            }
          />
          <span>{t("aiAgent.enable")}</span>
        </label>
        <span className="bb-ai-agent-summary-text">{t("aiAgent.safetyNote")}</span>
      </div>

      <div className="bb-ai-agent-config">
        <div className="bb-field">
          <LabelHelp label={t("aiAgent.chooseAgent")} help={t("tooltips.aiAgent.chooseAgent")} />
          <div className="bb-ai-agent-grid">
            {enabledAIAgents.length === 0 ? (
              <span className="bb-muted small">{t("aiAgent.noAgentsConfigured")}</span>
            ) : (
              enabledAIAgents.map((agent) => {
                const active = (aiAgents.selectedAgentIds ?? []).includes(agent.id);
                return (
                  <label
                    key={agent.id}
                    className={`bb-ai-agent-option ${active ? "active" : ""}`}
                    title={t("tooltips.aiAgent.agentCommand", {
                      command: `${agent.command} ${agent.args.join(" ")}`.trim(),
                    })}
                  >
                    <input type="checkbox" checked={active} onChange={() => toggleAIAgent(agent.id)} />
                    <span className="bb-ai-agent-name">{agent.name}</span>
                    <code>{agent.command}</code>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="bb-field">
          <LabelHelp label={t("aiAgent.cursorPersonas.title")} help={t("tooltips.aiAgent.cursorPersonas")} />
          <CursorAgentPicker
            task={task}
            agents={props.cursorAgents}
            selectedIds={effectiveSelectedCursorAgentIds}
            onToggle={toggleCursorAgent}
            onRefresh={props.onRefreshCursorAgents}
          />
        </div>

        <div className="bb-field">
          <LabelHelp label={t("aiAgent.model")} help={t("tooltips.aiAgent.model")} />
          <div className="bb-ai-model-picker">
            <select
              className="bb-input bb-ai-model-select"
              value={customModelSelected ? "__custom" : selectedModel}
              disabled={!selectedAIAgent?.allowModels}
              onChange={(e) => {
                const custom = e.target.value === "__custom";
                setCustomAiModelMode(custom);
                saveAIAgents({ selectedModel: custom ? "" : e.target.value });
              }}
              title={t("tooltips.aiAgent.model")}
            >
              {aiModelOptions.map((model) => (
                <option key={model} value={model}>
                  {model === "auto" ? t("aiAgent.modelAuto") : model}
                </option>
              ))}
              <option value="__custom">{t("aiAgent.modelCustom")}</option>
            </select>
            {(customModelSelected || selectedModel === "") && (
              <input
                className="bb-input"
                value={customModelSelected ? aiAgents.selectedModel ?? "" : ""}
                placeholder={t("aiAgent.modelPlaceholder")}
                onChange={(e) => saveAIAgents({ selectedModel: e.target.value })}
                title={t("tooltips.aiAgent.modelCustom")}
              />
            )}
          </div>
          <div className="bb-ai-agent-hint">
            {selectedAIAgent?.allowModels ? t("aiAgent.modelHint") : t("aiAgent.modelDisabled")}
          </div>
        </div>
      </div>

      <div className="bb-ai-agent-actionbar">
        <div className="bb-ai-prompt-tools">
          <button className="bb-ai-tool-button" onClick={props.onGenerateAIAgentPrompt} title={t("tooltips.aiAgent.generatePrompt")}>
            <SparkleIcon size={13} />
            <span>
              <strong>{t("aiAgent.generatePrompt")}</strong>
              <small>{t("aiAgent.generatePromptDesc")}</small>
            </span>
          </button>
          <button className="bb-ai-tool-button" onClick={copyAIAgentPrompt} title={t("tooltips.aiAgent.copyPrompt")}>
            <CopyIcon size={13} />
            <span>
              <strong>{t("aiAgent.copyPrompt")}</strong>
              <small>{t("aiAgent.copyPromptDesc")}</small>
            </span>
          </button>
        </div>

        <div className="bb-ai-run-strip" aria-label={t("aiAgent.workflowActions")}>
          <button
            className="bb-ai-action-card"
            disabled={!canRunAIAgent}
            onClick={props.onRunAIAgentPlan}
            title={t("tooltips.aiAgent.runPlan")}
          >
            <strong>{t("aiAgent.runPlanShort")}</strong>
            <small>{t("aiAgent.runPlanDesc")}</small>
          </button>
          <button
            className="bb-ai-action-card accent"
            disabled={!canRunAIAgent}
            onClick={props.onRunAIAgent}
            title={t("tooltips.aiAgent.runAgent")}
          >
            <strong>{t("aiAgent.runAgentShort")}</strong>
            <small>{t("aiAgent.runAgentDesc")}</small>
          </button>
          <button
            className="bb-ai-action-card"
            disabled={!canRunAIAgent}
            onClick={props.onRunAIAgentReview}
            title={t("tooltips.aiAgent.review")}
          >
            <strong>{t("aiAgent.runReviewShort")}</strong>
            <small>{t("aiAgent.runReviewDesc")}</small>
          </button>
          <button
            className="bb-ai-action-card"
            disabled={!canMoveToAIAgent}
            onClick={() => aiAgentColumnId && canMoveToColumn(aiAgentColumnId) && props.onSave({ columnId: aiAgentColumnId })}
            title={t("tooltips.aiAgent.moveToColumn")}
          >
            <strong>{t("aiAgent.moveToColumnShort")}</strong>
            <small>{t("aiAgent.moveToColumnDesc")}</small>
          </button>
          {isAgentRunning && (
            <button
              type="button"
              className="bb-ai-action-card danger"
              onClick={props.onCancelAIAgent}
              title={t("tooltips.aiAgent.stop")}
            >
              <strong>{t("aiAgent.stop")}</strong>
              <small>{t("aiAgent.stopDesc")}</small>
            </button>
          )}
        </div>
      </div>

      {(isAgentRunning || props.aiAgentLog.length > 0) && (
        <div className="bb-field">
          <LabelHelp label={t("aiAgent.console")} help={t("tooltips.aiAgent.console")} />
          <div
            ref={aiConsoleRef}
            className={`bb-ai-console ${isAgentRunning ? "running" : ""}`}
            onScroll={(e) => {
              const el = e.currentTarget;
              aiConsoleStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
          >
            {props.aiAgentLog.length === 0 ? (
              <div className="bb-ai-console-line system">{t("aiAgent.consoleWaiting")}</div>
            ) : (
              props.aiAgentLog.map((entry, i) => (
                <div key={i} className={`bb-ai-console-line ${entry.stream}`}>
                  {entry.text}
                </div>
              ))
            )}
            {isAgentRunning && (
              <div className="bb-ai-console-line system bb-ai-console-cursor">
                <span className="bb-ai-console-dot" />
                {t(`aiAgent.status.${aiAgents.status}`)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bb-ai-cost-guard">
        <div className="bb-ai-cost-guard-head">
          <span>{t("aiCostGuard.title")}</span>
          <Help text={t("tooltips.aiCostGuard.main")} />
        </div>
        <div className="bb-ai-cost-guard-row">
          <textarea
            className="bb-textarea bb-ai-cost-guard-message"
            placeholder={t("aiCostGuard.messagePlaceholder")}
            value={costMessage}
            onChange={(e) => setCostMessage(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="bb-btn sm accent"
            onClick={() => requestCostDecision()}
            title={t("tooltips.aiCostGuard.check")}
          >
            {t("aiCostGuard.check")}
          </button>
        </div>

        {decision && (
          <>
            <div className="bb-ai-cost-guard-grid">
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.costMode")}</span>
                <strong>{t(`aiCostGuard.costModeValue.${costPolicy.aiCostMode}`)}</strong>
              </div>
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.optimizer")}</span>
                <strong>{costPolicy.aiLocalOptimizerEnabled ? t("aiCostGuard.optimizerOn") : t("aiCostGuard.optimizerOff")}</strong>
              </div>
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.decision")}</span>
                <strong>{t(`aiCostGuard.action.${decision.action}`)}</strong>
              </div>
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.context")}</span>
                <strong>{t(`aiCostGuard.contextLevel.${decision.contextLevel}`)}</strong>
              </div>
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.files")}</span>
                <strong>{decision.selectedFiles.length}</strong>
              </div>
              <div className="bb-ai-cost-guard-cell">
                <span className="bb-muted small">{t("aiCostGuard.costRisk")}</span>
                <span
                  className={`bb-badge ${
                    decision.costRisk === "high"
                      ? "tone-critical"
                      : decision.costRisk === "medium"
                        ? "tone-warning"
                        : "tone-success"
                  }`}
                >
                  {t(`aiCostGuard.risk.${decision.costRisk}`)}
                </span>
              </div>
            </div>
            <div className="bb-ai-cost-guard-reason">{decision.reason}</div>
            {decision.usedLocalModel && (
              <div className="bb-muted small">{t("aiCostGuard.usedLocalModel")}</div>
            )}
            {decision.localModelError && <div className="bb-callout warn">{decision.localModelError}</div>}

            <div className="bb-ai-cost-guard-actions">
              <button type="button" className="bb-btn ghost sm" onClick={toggleCostPrompt} title={t("tooltips.aiCostGuard.showPrompt")}>
                {t("aiCostGuard.showPrompt")}
              </button>
              <button
                type="button"
                className="bb-btn ghost sm"
                onClick={reduceCostContext}
                disabled={decision.contextLevel === "small"}
                title={t("tooltips.aiCostGuard.reduceContext")}
              >
                {t("aiCostGuard.reduceContext")}
              </button>
              <button
                type="button"
                className="bb-btn ghost sm"
                onClick={applyCostModelSuggestion}
                disabled={!decision.modelPreference}
                title={t("tooltips.aiCostGuard.changeModel")}
              >
                {t("aiCostGuard.changeModel")}
              </button>
              <button type="button" className="bb-btn ghost sm" onClick={prepareCostPromptOnly} title={t("tooltips.aiCostGuard.prepareOnly")}>
                {t("aiCostGuard.prepareOnly")}
              </button>
              <button
                type="button"
                className="bb-btn accent sm"
                disabled={isAgentRunning}
                onClick={runViaCostGuard}
                title={t("tooltips.aiCostGuard.runCursor")}
              >
                {t("aiCostGuard.runCursor")}
              </button>
            </div>

            {showCostPrompt && (
              <div className="bb-field">
                <textarea className="bb-textarea bb-ai-cost-guard-prompt" value={decision.optimizedPrompt} readOnly rows={8} />
                <button
                  type="button"
                  className="bb-btn ghost sm"
                  onClick={() => props.onCopyClipboard(decision.optimizedPrompt, t("toast.aiPromptCopied"))}
                  title={t("tooltips.aiAgent.copyPrompt")}
                >
                  {t("aiAgent.copyPrompt")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bb-field">
        <LabelHelp label={t("aiAgent.promptPreview")} help={t("tooltips.aiAgent.prompt")} />
        <textarea
          className="bb-textarea bb-ai-agent-textarea"
          value={aiAgents.prompt ?? ""}
          placeholder={t("aiAgent.promptPlaceholder")}
          onChange={(e) => saveAIAgents({ prompt: e.target.value, status: e.target.value ? "ready" : aiAgents.status })}
          rows={7}
        />
      </div>

      {aiAgents.error && <div className="bb-callout warn">{aiAgents.error}</div>}

      {aiAgents.createdBranch && (
        <div className="bb-ai-branch-card">
          <span className="bb-ai-branch-label">{t("aiAgent.createdBranch")}</span>
          <code>{aiAgents.createdBranch}</code>
          <button
            className="bb-btn ghost sm"
            onClick={() => props.onCheckoutBranch(aiAgents.createdBranch!)}
            title={t("tooltips.aiAgent.checkoutBranch")}
          >
            {t("aiAgent.checkoutBranch")}
          </button>
        </div>
      )}

      {chatTurns.length > 0 && (
        <div className="bb-field">
          <LabelHelp label={t("aiAgent.chatTitle")} help={t("tooltips.aiAgent.chat")} />
          {aiAgents.planFile && (
            <button
              type="button"
              className="bb-ai-plan-file"
              onClick={() => props.onOpenFile(aiAgents.planFile!)}
              title={t("tooltips.aiAgent.planFile")}
            >
              {t("aiAgent.planFile")}: <code>{aiAgents.planFile}</code>
            </button>
          )}
          <div className="bb-ai-chat">
            {chatTurns.map((turn) => (
              <AiChatTurn key={turn.id} turn={turn} onOpenFile={props.onOpenFile} />
            ))}
          </div>
        </div>
      )}

      {aiAgents.lastUsage && (
        <div className="bb-ai-usage-card">
          <div className="bb-section-subtitle">{t("aiAgent.usage")}</div>
          <div className="bb-ai-usage-tokens">
            <span>
              {t("aiAgent.usageInput")}: <strong>{formatTokenCount(aiAgents.lastUsage.inputTokens)}</strong>
            </span>
            <span>
              {t("aiAgent.usageOutput")}: <strong>{formatTokenCount(aiAgents.lastUsage.outputTokens)}</strong>
            </span>
            {typeof aiAgents.lastUsage.cacheReadTokens === "number" && (
              <span>
                {t("aiAgent.usageCacheRead")}: <strong>{formatTokenCount(aiAgents.lastUsage.cacheReadTokens)}</strong>
              </span>
            )}
            {typeof aiAgents.lastUsage.cacheWriteTokens === "number" && (
              <span>
                {t("aiAgent.usageCacheWrite")}:{" "}
                <strong>{formatTokenCount(aiAgents.lastUsage.cacheWriteTokens)}</strong>
              </span>
            )}
          </div>
          {aiAgents.lastCost ? (
            <div className="bb-ai-usage-cost">
              {t("aiAgent.estimatedCost")}: <strong>{formatCost(aiAgents.lastCost.totalCost, aiAgents.lastCost.currency)}</strong>
            </div>
          ) : (
            <div className="bb-ai-usage-cost muted">{t("aiAgent.costNotConfigured")}</div>
          )}
        </div>
      )}

      {(aiAgents.changedFiles ?? []).length > 0 && (
        <div className="bb-ai-agent-files">
          <div className="bb-section-subtitle">
            {t("aiAgent.changedFiles")} ({aiAgents.changedFiles?.length ?? 0})
          </div>
          <ul className="bb-files-filelist">
            {(aiAgents.changedFiles ?? []).map((file) => (
              <li key={`${file.status}-${file.path}`} className="bb-file-row">
                <span className="bb-badge tone-info">{t(`aiAgent.fileStatus.${file.status}`)}</span>
                <span className="bb-file-path" onClick={() => props.onOpenFile(file.path)}>
                  {file.path}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bb-ai-decision-panel">
        <div className="bb-ai-decision-head">
          <span>{t("aiAgent.decisionTitle")}</span>
          <Help text={t("tooltips.aiAgent.decision")} />
        </div>
        <button className="bb-ai-decision-card accept" onClick={props.onAcceptAIAgentResult} title={t("tooltips.aiAgent.accept")}>
          <strong>{t("aiAgent.acceptResult")}</strong>
          <small>{t("aiAgent.acceptResultDesc")}</small>
        </button>
        <button className="bb-ai-decision-card reject" onClick={props.onRejectAIAgentResult} title={t("tooltips.aiAgent.reject")}>
          <strong>{t("aiAgent.rejectResult")}</strong>
          <small>{t("aiAgent.rejectResultDesc")}</small>
        </button>
      </div>
    </div>
  );
}

/** Icon import re-exported for callers that only need the checkout icon next to a created branch. */
export { CheckoutIcon };
