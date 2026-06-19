import type { MouseEvent, ReactNode } from "react";

/**
 * Shared rendering for "@file/path" mentions inside plain-text fields
 * (checklist items, chat comments). Keeps the same detection rule as
 * FileMentionInput's typing behavior and RichDescription's HTML linkifier,
 * so a mention looks and behaves the same everywhere it appears.
 *
 * Outside of edit mode, clicking a rendered mention must open the file
 * directly instead of falling through to the surrounding row's "enter
 * edit mode" click handler — callers should stop propagation on the
 * mention click (handled here) so the rest of the text keeps its normal
 * click-to-edit behavior.
 */

export const FILE_MENTION_RE = /(^|[\s([{"'`])@([A-Za-z0-9._/-]+)/g;

export function shouldLinkFileMention(path: string): boolean {
  return path.includes("/") || /\.[A-Za-z0-9]{1,12}$/.test(path);
}

interface MentionSegment {
  key: string;
  text: string;
  filePath: string | null;
}

function splitMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  FILE_MENTION_RE.lastIndex = 0;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(FILE_MENTION_RE)) {
    const matchIndex = match.index ?? 0;
    const prefix = match[1] ?? "";
    const filePath = (match[2] ?? "").replace(/[),.;!?]+$/, "");
    if (!shouldLinkFileMention(filePath)) {
      continue;
    }
    const mentionStart = matchIndex + prefix.length;
    if (mentionStart > last) {
      segments.push({ key: `t${index++}`, text: text.slice(last, mentionStart), filePath: null });
    }
    segments.push({ key: `m${index++}`, text: `@${filePath}`, filePath });
    last = mentionStart + 1 + filePath.length;
  }
  if (last < text.length) {
    segments.push({ key: `t${index++}`, text: text.slice(last), filePath: null });
  }
  return segments;
}

/**
 * Renders `text` with any "@file/path" mentions turned into clickable
 * links that call `onOpenFile`. Plain text segments are rendered as-is
 * (no special click handling), so a surrounding row's onClick still fires
 * for clicks outside a mention.
 */
export function renderTextWithFileMentions(
  text: string,
  onOpenFile: ((path: string) => void) | undefined
): ReactNode {
  if (!text.includes("@") || !onOpenFile) {
    return text;
  }

  const segments = splitMentions(text);
  if (segments.every((segment) => segment.filePath === null)) {
    return text;
  }

  const handleMentionClick = (event: MouseEvent<HTMLAnchorElement>, filePath: string) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFile(filePath);
  };

  return segments.map((segment) =>
    segment.filePath ? (
      <a
        key={segment.key}
        href="#"
        className="bb-file-mention-link"
        onClick={(event) => handleMentionClick(event, segment.filePath as string)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {segment.text}
      </a>
    ) : (
      <span key={segment.key}>{segment.text}</span>
    )
  );
}
