import { useEffect, useRef } from "react";
import { t } from "../../../i18n";
import { EmptyState } from "../../common/EmptyState";
import { AiChatMessage as AiChatMessageModel } from "./aiChatTypes";
import { AiChatMessage } from "./AiChatMessage";

interface Props {
  messages: AiChatMessageModel[];
  onOpenFile: (path: string) => void;
  onCopyClipboard: (text: string, label: string) => void;
  workspaceTrustAgentId: string;
  workspaceTrustCommand: string;
}

/** Scrollable chat history. Autoscrolls to the latest message unless the user has scrolled up to read older ones. */
export function AiChatMessageList(props: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages]);

  if (props.messages.length === 0) {
    return (
      <div className="bb-ai-chat-history empty">
        <EmptyState title={t("aiChat.emptyTitle")} hint={t("aiChat.emptyHint")} />
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="bb-ai-chat-history"
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
      }}
    >
      {props.messages.map((message) => (
        <AiChatMessage
          key={message.id}
          message={message}
          onOpenFile={props.onOpenFile}
          onCopyClipboard={props.onCopyClipboard}
          workspaceTrustAgentId={props.workspaceTrustAgentId}
          workspaceTrustCommand={props.workspaceTrustCommand}
        />
      ))}
    </div>
  );
}
