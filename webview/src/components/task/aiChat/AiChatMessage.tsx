import { AIAgentRunHistoryItem } from "../../../types";
import { t } from "../../../i18n";
import { formatDate } from "../../../utils";
import { CommentIcon, CopyIcon, FileIcon, SparkleIcon } from "../../Icons";
import { AiChatMessage as AiChatMessageModel } from "./aiChatTypes";
import { buildWorkspaceTrustFixSnippet } from "./aiChatUtils";

function formatTokenCount(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("pl-PL") : "—";
}

function formatCost(value: number, currency: string): string {
  const amount = value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `${amount} ${currency}`;
}

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

/** Renders one real Plan/Praca AI/Review turn — same information the old AiAgentPanel showed, now as one assistant chat bubble. */
function TurnBody(props: { turn: AIAgentRunHistoryItem; onOpenFile: (path: string) => void }) {
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
        <span className={`bb-badge tone-${turn.status === "failed" ? "critical" : turn.status === "finished" ? "success" : "warning"}`}>
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

/** Structured rendering for the Cursor Agent headless "Workspace Trust Required" failure: short explanation + a safe `--trust` snippet (never `--yolo`/`-f`) + copy button. */
function WorkspaceTrustError(props: { agentId: string; command: string; onCopy: (text: string, label: string) => void }) {
  const snippet = buildWorkspaceTrustFixSnippet(props.agentId, props.command);
  return (
    <div className="bb-ai-chat-error-card">
      <div className="bb-ai-chat-error-title">{t("aiChat.error.workspaceTrustTitle")}</div>
      <div className="bb-ai-chat-error-desc">{t("aiChat.error.workspaceTrustDesc")}</div>
      <div className="bb-ai-chat-error-fix">{t("aiChat.error.workspaceTrustFix")}</div>
      <pre className="bb-ai-chat-error-code">{snippet}</pre>
      <button
        type="button"
        className="bb-btn ghost sm"
        onClick={() => props.onCopy(snippet, t("aiChat.error.solutionCopied"))}
        title={t("tooltips.aiChat.copySolution")}
      >
        <CopyIcon size={12} />
        {t("aiChat.error.copySolution")}
      </button>
    </div>
  );
}

interface Props {
  message: AiChatMessageModel;
  onOpenFile: (path: string) => void;
  onCopyClipboard: (text: string, label: string) => void;
  workspaceTrustAgentId: string;
  workspaceTrustCommand: string;
}

/** One bubble in the chat timeline: user / assistant / system / error / tool. */
export function AiChatMessage(props: Props) {
  const { message } = props;

  if (message.turn) {
    return (
      <div className="bb-ai-chat-msg assistant">
        <TurnBody turn={message.turn} onOpenFile={props.onOpenFile} />
      </div>
    );
  }

  if (message.role === "error" && message.errorKind === "workspace-trust") {
    return (
      <div className="bb-ai-chat-msg error">
        <WorkspaceTrustError
          agentId={props.workspaceTrustAgentId}
          command={props.workspaceTrustCommand}
          onCopy={props.onCopyClipboard}
        />
      </div>
    );
  }

  return (
    <div className={`bb-ai-chat-msg ${message.role}`}>
      {message.role === "user" && message.mode && <span className="bb-ai-chat-msg-mode">{t(`aiChat.mode.${message.mode}`)}</span>}
      <div className="bb-ai-chat-msg-text">{message.text}</div>
      <div className="bb-ai-chat-msg-time">{formatDate(message.createdAt)}</div>
    </div>
  );
}
