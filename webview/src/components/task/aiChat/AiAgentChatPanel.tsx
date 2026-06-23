import { useEffect, useMemo, useRef, useState } from "react";
import {
  AIAgentLogPayload,
  AIAgentRunHistoryItem,
  AIAgentRunKind,
  AppConfig,
  BoardData,
  BoardTask,
  CursorSubAgentInfo,
  TaskAIAgents,
  AiCostDecisionPayload,
  AiCostDecisionRequestPayload,
} from "../../../types";
import { t } from "../../../i18n";
import { guardTaskMove } from "../../../productionGuards";
import { BranchIcon, ChevronDownIcon, CopyIcon, GearIcon, RefreshIcon, SparkleIcon } from "../../Icons";
import { EmptyState } from "../../common/EmptyState";
import { Help } from "../../common/Help";
import { AI_CHAT_MODES, AiChatMessage, AiChatMode } from "./aiChatTypes";
import { composePrompt, isWorkspaceTrustError, nextChatMessageId, parseSlashCommand } from "./aiChatUtils";
import { AiChatMessageList } from "./AiChatMessageList";
import { AiChatComposer } from "./AiChatComposer";
import { AiQuickActions } from "./AiQuickActions";

interface Props {
  task: BoardTask;
  board: BoardData;
  appConfig: AppConfig;
  cursorAgents: CursorSubAgentInfo[];
  aiAgentLog: AIAgentLogPayload[];
  aiAgentRunningKind: AIAgentRunKind | null;
  aiCostDecision: AiCostDecisionPayload | null;
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
  /** Optional: live local/origin/dev/prod git state, used only to show whether the task's branch is currently checked out — BranchBoard never fabricates a dev/prod badge it can't actually verify. */
  git?: { currentBranch: string | null } | null;
  /** Optional deep link to settings, shown in the "no active models" empty state and the agent picker menu when available. */
  onOpenSettings?: () => void;
  compact?: boolean;
}

/**
 * Chat-first AI Agent panel. Cursor Chat is the UX reference for layout and
 * interaction (history + bottom composer + mode/model pickers), but the
 * workflow underneath is BranchBoard's own: task → branch → model → mode →
 * result → review. Every backend call below is one of the same handlers the
 * old grid-based AiAgentPanel used (onRunAIAgentPlan/onRunAIAgent/
 * onRunAIAgentReview/onGenerateAIAgentPrompt/onRequestAiCostDecision) — no
 * extension-host code changes were needed because "plan"/"review" already
 * never touch files server-side.
 */
export function AiAgentChatPanel(props: Props) {
  const { task, board, appConfig } = props;

  const [forceOpen, setForceOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [mode, setMode] = useState<AiChatMode>("agent");
  const [ephemeral, setEphemeral] = useState<AiChatMessage[]>([]);
  const [customAiModelMode, setCustomAiModelMode] = useState(false);
  const [cursorAgentOverride, setCursorAgentOverride] = useState<{ taskId: string; ids: string[] } | null>(null);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const lastSeenErrorRef = useRef<string>("");

  useEffect(() => {
    setForceOpen(false);
    setComposerText("");
    setEphemeral([]);
    setCustomAiModelMode(false);
    setCursorAgentOverride((current) => (current && current.taskId !== task.id ? null : current));
    lastSeenErrorRef.current = "";
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
  const rawSelectedModel = aiAgents.selectedModel ?? "";
  const selectedModel = rawSelectedModel || "auto";

  const isAgentRunning = !!props.aiAgentRunningKind;
  const hasAnyAiData =
    !!aiAgents.prompt || !!aiAgents.plan || !!aiAgents.result || !!aiAgents.reviewResult || !!aiAgents.createdBranch;

  const effectiveSelectedCursorAgentIds =
    cursorAgentOverride && cursorAgentOverride.taskId === task.id
      ? cursorAgentOverride.ids
      : aiAgents.selectedCursorAgentIds ?? [];
  const togglePersona = (agentId: string) => {
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
    enabledAIAgents.length > 0 &&
    !isAgentRunning &&
    task.columnId !== aiAgentColumnId &&
    canMoveToColumn(aiAgentColumnId);

  // Auto-enable on first real interaction instead of exposing a separate
  // "enable AI Agent" toggle in the chat UI — the chat itself IS the
  // configuration surface now. Existing tasks already enabled keep working
  // exactly as before.
  const ensureEnabled = () => {
    if (!aiAgents.enabled) {
      saveAIAgents({ enabled: true, selectedAgentIds: aiAgents.selectedAgentIds?.length ? aiAgents.selectedAgentIds : enabledAIAgents[0] ? [enabledAIAgents[0].id] : [] });
    }
  };

  const pushMessage = (msg: Omit<AiChatMessage, "id" | "createdAt">) => {
    setEphemeral((prev) => [...prev, { ...msg, id: nextChatMessageId(), createdAt: new Date().toISOString() }]);
  };

  // --- Chat timeline: persisted runHistory turns + ephemeral local bubbles ---
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
          if (aiAgents.plan || aiAgents.planFile) legacy.push({ ...baseTurn, id: "legacy-plan", kind: "plan", plan: aiAgents.plan });
          if (aiAgents.result)
            legacy.push({
              ...baseTurn,
              id: "legacy-run",
              kind: "run",
              result: aiAgents.result,
              changedFiles: aiAgents.changedFiles,
              usage: aiAgents.lastUsage,
              cost: aiAgents.lastCost,
            });
          if (aiAgents.reviewResult) legacy.push({ ...baseTurn, id: "legacy-review", kind: "review", reviewResult: aiAgents.reviewResult });
          return legacy;
        })();

  const combinedMessages: AiChatMessage[] = useMemo(() => {
    const turnMessages: AiChatMessage[] = chatTurns.map((turn) => ({
      id: `turn-${turn.id}`,
      role: "assistant",
      text: turn.result || turn.plan || turn.reviewResult || turn.error || "",
      createdAt: turn.startedAt || turn.finishedAt || "",
      turn,
    }));
    return [...turnMessages, ...ephemeral].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  }, [chatTurns, ephemeral]);

  // --- Workspace Trust Required detection -----------------------------------
  // Surface the Cursor Agent headless trust failure as a clear chat message
  // instead of letting it sit as raw stderr/aiAgents.error text. Never
  // suggests --yolo/-f — only an explicit --trust the user must add and
  // confirm themselves.
  useEffect(() => {
    const errorText = aiAgents.error || "";
    if (!errorText || errorText === lastSeenErrorRef.current) return;
    lastSeenErrorRef.current = errorText;
    if (isWorkspaceTrustError(errorText)) {
      pushMessage({ role: "error", text: errorText, errorKind: "workspace-trust" });
    } else {
      pushMessage({ role: "error", text: errorText, errorKind: "generic" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAgents.error]);

  // --- AI Cost Guard (reachable via /rules) ---------------------------------
  const decision = props.aiCostDecision;
  const lastDecisionRenderedRef = useRef<AiCostDecisionPayload | null>(null);
  useEffect(() => {
    if (decision && decision !== lastDecisionRenderedRef.current) {
      lastDecisionRenderedRef.current = decision;
      const lines = [
        t("aiChat.rulesSummaryTitle"),
        `${t("aiCostGuard.decision")}: ${t(`aiCostGuard.action.${decision.action}`)}`,
        `${t("aiCostGuard.context")}: ${t(`aiCostGuard.contextLevel.${decision.contextLevel}`)}`,
        `${t("aiCostGuard.costRisk")}: ${t(`aiCostGuard.risk.${decision.costRisk}`)}`,
        decision.reason,
      ];
      pushMessage({ role: "system", text: lines.join("\n") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  const saveResultToTask = () => {
    const latestTurn = [...chatTurns].reverse().find((turn) => turn.result || turn.plan || turn.reviewResult);
    const resultText = latestTurn?.result || latestTurn?.reviewResult || latestTurn?.plan || aiAgents.result || aiAgents.reviewResult || aiAgents.plan || "";
    if (!resultText.trim()) {
      pushMessage({ role: "system", text: t("aiChat.noResultToSave") });
      return;
    }
    props.onSave({
      ai: {
        reviewChecklist: task.ai?.reviewChecklist ?? [],
        ...(task.ai ?? {}),
        createdByAi: true,
        usedModel: selectedModel,
        generatedPrompt: aiAgents.prompt ?? "",
        aiNotes: resultText,
      },
    });
    pushMessage({ role: "system", text: t("aiChat.savedToTask") });
  };

  const saveAsChecklist = () => {
    const latestTurn = [...chatTurns].reverse().find((turn) => turn.plan || turn.result);
    const text = latestTurn?.plan || latestTurn?.result || "";
    const items = text
      .split("\n")
      .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter((line) => line.length > 0);
    if (items.length === 0) {
      pushMessage({ role: "system", text: t("aiChat.noResultToSave") });
      return;
    }
    const existing = task.checklist ?? [];
    const next = [
      ...existing,
      ...items.map((label, i) => ({ id: `ai-${Date.now()}-${i}`, text: label, done: false })),
    ];
    props.onSave({ checklist: next });
    pushMessage({ role: "system", text: t("aiChat.savedChecklist", { count: items.length }) });
  };

  const runReviewForDiff = () => {
    ensureEnabled();
    pushMessage({ role: "user", text: t("aiChat.slash.diff"), mode });
    props.onRunAIAgentReview();
  };

  const handleGeneratePrompt = () => {
    ensureEnabled();
    props.onGenerateAIAgentPrompt();
    pushMessage({ role: "system", text: t("aiChat.promptGenerated") });
  };

  const handleCopyFullPrompt = () => {
    const prompt = (aiAgents.prompt ?? "").trim();
    if (!prompt) {
      handleGeneratePrompt();
      return;
    }
    props.onCopyClipboard(prompt, t("toast.aiPromptCopied"));
    props.onAiPromptCopied();
  };

  const send = () => {
    const raw = composerText;
    if (!raw.trim() || isAgentRunning) return;
    ensureEnabled();

    const slash = parseSlashCommand(raw);
    if (slash) {
      setComposerText("");
      switch (slash.command.id) {
        case "prompt":
          handleGeneratePrompt();
          return;
        case "plan":
          if (slash.rest) saveAIAgents({ prompt: slash.rest, status: "ready" });
          pushMessage({ role: "user", text: raw, mode: "plan" });
          props.onRunAIAgentPlan();
          return;
        case "work":
          if (slash.rest) saveAIAgents({ prompt: slash.rest, status: "ready" });
          pushMessage({ role: "user", text: raw, mode: "agent" });
          props.onRunAIAgent();
          return;
        case "review":
          pushMessage({ role: "user", text: raw, mode });
          props.onRunAIAgentReview();
          return;
        case "rules":
          pushMessage({ role: "user", text: raw, mode });
          props.onRequestAiCostDecision({ userMessage: slash.rest || aiAgents.prompt || task.title });
          return;
        case "diff":
          runReviewForDiff();
          return;
        case "save":
          saveResultToTask();
          return;
      }
    }

    const prompt = composePrompt(mode, raw, t);
    saveAIAgents({ prompt, status: "ready" });
    pushMessage({ role: "user", text: raw, mode });
    setComposerText("");
    const modeDef = AI_CHAT_MODES.find((m) => m.id === mode) ?? AI_CHAT_MODES[0];
    if (modeDef.backendKind === "run") {
      props.onRunAIAgent();
    } else {
      props.onRunAIAgentPlan();
    }
  };

  const status: "idle" | "busy" | "error" = isAgentRunning ? "busy" : aiAgents.status === "failed" ? "error" : "idle";

  const latestTurnHasContent = chatTurns.some((turn) => (turn.plan || turn.result || turn.reviewResult)?.trim());

  if (props.compact && !aiAgents.enabled && !hasAnyAiData && !forceOpen) {
    return (
      <div className="bb-ai-agent-panel bb-ai-chat-panel bb-ai-agent-compact-empty">
        <EmptyState title={t("aiAgent.notConfiguredTitle")} hint={t("aiAgent.notConfiguredHint")} />
        <button className="bb-btn accent" onClick={() => setForceOpen(true)} title={t("tooltips.aiAgent.configure")}>
          <SparkleIcon size={13} />
          {t("aiAgent.configure")}
        </button>
      </div>
    );
  }

  const branchMatches = !!props.git?.currentBranch && props.git.currentBranch === task.branchName;

  return (
    <div className="bb-ai-chat-panel">
      <div className="bb-ai-chat-topbar">
        <div className="bb-ai-chat-topbar-main">
          <strong className="bb-ai-chat-topbar-title">{task.title}</strong>
          {task.branchName ? (
            <span className={`bb-badge ${branchMatches ? "tone-success" : "tone-neutral"}`} title={t("tooltips.aiChat.branchBadge")}>
              <BranchIcon size={11} />
              <code>{task.branchName}</code>
              {branchMatches && <span className="bb-ai-chat-branch-here">{t("aiChat.branchCheckedOut")}</span>}
            </span>
          ) : (
            <span className="bb-badge tone-neutral">{t("task.noBranch")}</span>
          )}
        </div>
        <div className="bb-ai-chat-topbar-actions">
          <div className="bb-menu-wrap">
            <button
              type="button"
              className="bb-btn ghost sm"
              onClick={() => setAgentMenuOpen((v) => !v)}
              title={t("tooltips.aiChat.agentMenu")}
            >
              {selectedAIAgent ? selectedAIAgent.name : t("aiAgent.noAgentsConfigured")}
              <ChevronDownIcon size={10} />
            </button>
            {agentMenuOpen && (
              <div className="bb-menu left" onMouseLeave={() => setAgentMenuOpen(false)}>
                <div className="bb-menu-label">{t("aiAgent.chooseAgent")}</div>
                {enabledAIAgents.length === 0 ? (
                  <div className="bb-menu-item" style={{ opacity: 0.7 }}>
                    {t("aiAgent.noAgentsConfigured")}
                  </div>
                ) : (
                  enabledAIAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      className={`bb-menu-item ${agent.id === selectedAIAgentId ? "active" : ""}`}
                      onClick={() => {
                        saveAIAgents({ enabled: true, selectedAgentIds: [agent.id] });
                        setAgentMenuOpen(false);
                      }}
                    >
                      {agent.name}
                    </button>
                  ))
                )}
                {canMoveToAIAgent && (
                  <>
                    <div className="bb-menu-sep" />
                    <button
                      type="button"
                      className="bb-menu-item"
                      onClick={() => {
                        if (aiAgentColumnId && canMoveToColumn(aiAgentColumnId)) props.onSave({ columnId: aiAgentColumnId });
                        setAgentMenuOpen(false);
                      }}
                    >
                      {t("aiAgent.moveToColumnShort")}
                    </button>
                  </>
                )}
                {props.onOpenSettings && (
                  <>
                    <div className="bb-menu-sep" />
                    <button type="button" className="bb-menu-item" onClick={props.onOpenSettings}>
                      <GearIcon size={12} />
                      {t("aiChat.openSettings")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button type="button" className="bb-btn ghost sm" onClick={handleCopyFullPrompt} title={t("tooltips.aiChat.copyFullPrompt")}>
            <CopyIcon size={12} />
            {t("aiChat.copyFullPrompt")}
          </button>
          <button type="button" className="bb-btn ghost sm" onClick={saveResultToTask} title={t("tooltips.aiChat.saveToTask")}>
            {t("aiChat.saveToTask")}
          </button>
          <button
            type="button"
            className="bb-btn ghost sm"
            onClick={() => setEphemeral([])}
            title={t("tooltips.aiChat.clearConversation")}
          >
            {t("aiChat.clearConversation")}
          </button>
          <Help text={t("tooltips.aiChat.main")} />
        </div>
      </div>

      <AiChatMessageList
        messages={combinedMessages}
        onOpenFile={props.onOpenFile}
        onCopyClipboard={props.onCopyClipboard}
        workspaceTrustAgentId={selectedAIAgent?.id ?? ""}
        workspaceTrustCommand={selectedAIAgent?.command ?? "cursor-agent"}
      />

      {isAgentRunning && (
        <div className="bb-ai-chat-live">
          <span className="bb-ai-console-dot" />
          {t(`aiAgent.status.${aiAgents.status}`)}
          {props.aiAgentLog.length > 0 && (
            <code className="bb-ai-chat-live-line">{props.aiAgentLog[props.aiAgentLog.length - 1].text}</code>
          )}
        </div>
      )}

      {aiAgents.createdBranch && (
        <div className="bb-ai-branch-card">
          <span className="bb-ai-branch-label">{t("aiAgent.createdBranch")}</span>
          <code>{aiAgents.createdBranch}</code>
          <button className="bb-btn ghost sm" onClick={() => props.onCheckoutBranch(aiAgents.createdBranch!)} title={t("tooltips.aiAgent.checkoutBranch")}>
            {t("aiAgent.checkoutBranch")}
          </button>
        </div>
      )}

      <div className="bb-ai-decision-panel bb-ai-chat-decision">
        <button className="bb-ai-decision-card accept" onClick={props.onAcceptAIAgentResult} title={t("tooltips.aiAgent.accept")}>
          <strong>{t("aiAgent.acceptResult")}</strong>
        </button>
        <button className="bb-ai-decision-card reject" onClick={props.onRejectAIAgentResult} title={t("tooltips.aiAgent.reject")}>
          <strong>{t("aiAgent.rejectResult")}</strong>
        </button>
        {latestTurnHasContent && (
          <button type="button" className="bb-btn ghost sm" onClick={saveAsChecklist} title={t("tooltips.aiChat.saveChecklist")}>
            {t("aiChat.saveChecklist")}
          </button>
        )}
        {!aiAgents.enabled && enabledAIAgents.length === 0 && (
          <button type="button" className="bb-btn ghost sm" onClick={props.onRefreshCursorAgents} title={t("tooltips.aiAgent.cursorPersonas")}>
            <RefreshIcon size={12} />
            {t("aiAgent.cursorPersonas.refresh")}
          </button>
        )}
      </div>

      <AiQuickActions onInsert={(text) => setComposerText((prev) => `${prev}${text}`)} onGeneratePrompt={handleGeneratePrompt} disabled={isAgentRunning} />

      <AiChatComposer
        task={task}
        value={composerText}
        onChange={setComposerText}
        onSend={send}
        onCancel={props.onCancelAIAgent}
        mode={mode}
        onModeChange={setMode}
        status={status}
        busy={isAgentRunning}
        enabledAIAgents={enabledAIAgents}
        selectedAIAgent={selectedAIAgent}
        selectedModel={selectedModel}
        customModelMode={customAiModelMode}
        onSelectModel={(model) => saveAIAgents({ selectedModel: model })}
        onSetCustomMode={setCustomAiModelMode}
        onOpenSettings={props.onOpenSettings}
        cursorAgents={props.cursorAgents}
        selectedCursorAgentIds={effectiveSelectedCursorAgentIds}
        onTogglePersona={togglePersona}
        onRefreshPersonas={props.onRefreshCursorAgents}
      />
    </div>
  );
}
