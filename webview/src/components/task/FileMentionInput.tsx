import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { t } from "../../i18n";
import { FileIcon, FolderIcon } from "../Icons";
import type { FileMentionEntry } from "../../types";

export interface FileMentionInputHandle {
  focus: () => void;
}

/**
 * Shared "@ file mention" autocomplete behavior for plain-text fields
 * (task title, checklist items, chat composer). This intentionally reuses
 * the same detection/keyboard/dropdown logic as the rich description editor
 * (see RichDescription.tsx) so every place in the app where a user can type
 * "@" to reference a file behaves identically — without forcing
 * title/checklist/comment storage into rich HTML, which are plain strings
 * used directly in many other places (branch name suggestions, search,
 * dashboards, etc.).
 *
 * Behavior:
 *  - typing a bare "@" browses the repo root: directories first, then files,
 *    each with a distinct icon.
 *  - typing a known extension right after "@" (e.g. "@php", "@js", "@tsx")
 *    filters to files with that extension; anything typed after the
 *    extension (e.g. "@phpprod") fuzzy-narrows by name within that set.
 *  - picking a directory inserts "<path>/" and keeps the menu open, scoped
 *    to that directory's contents, so you can keep drilling in.
 *  - picking a file inserts "@<path> " and closes the menu.
 */

const FILE_MENTION_LOOKBEHIND_RE = /(?:^|\s)@([^\s@]*)$/;

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fileSuggestions: FileMentionEntry[];
  onSearchFiles: (query: string) => void;
  multiline?: boolean;
  autoGrow?: boolean;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  title?: string;
  /** Called on Enter when it isn't consumed by the mention dropdown. */
  onEnter?: () => void;
  /** Called on Escape when it isn't consumed by the mention dropdown. */
  onEscape?: () => void;
  onBlur?: () => void;
  onFocus?: () => void;
  /** Pressing Shift+Enter inserts a newline instead of triggering onEnter (multiline only). Default true. */
  allowShiftEnterNewline?: boolean;
}

export const FileMentionInput = forwardRef<FileMentionInputHandle, Props>(function FileMentionInput(
  {
    value,
    onChange,
    placeholder,
    fileSuggestions,
    onSearchFiles,
    multiline = false,
    autoGrow = false,
    className,
    autoFocus,
    disabled,
    title,
    onEnter,
    onEscape,
    onBlur,
    onFocus,
    allowShiftEnterNewline = true,
  }: Props,
  forwardedRef
) {
  const elementRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => elementRef.current?.focus(),
  }));
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(0);
  const suggestionsRef = useRef<FileMentionEntry[]>([]);

  useEffect(() => {
    suggestionsRef.current = fileSuggestions;
    selectedIndexRef.current = Math.min(selectedIndexRef.current, Math.max(0, fileSuggestions.length - 1));
  }, [fileSuggestions]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (!mentionRange) {
      return undefined;
    }
    const timer = window.setTimeout(() => onSearchFiles(mentionQuery), 90);
    return () => window.clearTimeout(timer);
  }, [mentionQuery, mentionRange, onSearchFiles]);

  useEffect(() => {
    if (autoGrow && multiline) {
      const el = elementRef.current as HTMLTextAreaElement | null;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  }, [value, autoGrow, multiline]);

  const updateMentionState = (cursor: number, text: string) => {
    const lookBehind = text.slice(0, cursor);
    const match = lookBehind.match(FILE_MENTION_LOOKBEHIND_RE);
    if (!match) {
      setMentionQuery("");
      setMentionRange(null);
      return;
    }
    const query = match[1] ?? "";
    setMentionQuery(query);
    setMentionRange({ start: cursor - query.length - 1, end: cursor });
    setSelectedIndex(0);
  };

  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    const cursor = elementRef.current?.selectionStart ?? nextValue.length;
    updateMentionState(cursor, nextValue);
  };

  const moveSelection = (delta: number) => {
    const total = suggestionsRef.current.length;
    if (total === 0) {
      return;
    }
    setSelectedIndex((current) => {
      const next = (current + delta + total) % total;
      selectedIndexRef.current = next;
      return next;
    });
  };

  const insertMention = (entry: FileMentionEntry) => {
    const range = mentionRange;
    if (!range) {
      return;
    }
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);

    if (entry.type === "dir") {
      // Drill into the directory: insert "<path>/" and keep the mention
      // active, scoped to that directory's contents, instead of closing it.
      const insertion = `@${entry.path}/`;
      const nextValue = `${before}${insertion}${after}`;
      const newCursor = before.length + insertion.length;
      onChange(nextValue);
      setSelectedIndex(0);
      setMentionRange({ start: range.start, end: newCursor });
      setMentionQuery(`${entry.path}/`);
      window.setTimeout(() => {
        const el = elementRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
      return;
    }

    const insertion = `@${entry.path} `;
    const nextValue = `${before}${insertion}${after}`;
    onChange(nextValue);
    setMentionQuery("");
    setMentionRange(null);
    window.setTimeout(() => {
      const el = elementRef.current;
      if (el) {
        const pos = before.length + insertion.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const suggestions = suggestionsRef.current;
    const mentionActive = !!mentionRange && suggestions.length > 0;

    if (mentionActive) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[selectedIndexRef.current] ?? suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery("");
        setMentionRange(null);
        return;
      }
    }

    if (event.key === "Enter") {
      if (multiline && event.shiftKey && allowShiftEnterNewline) {
        return;
      }
      if (onEnter) {
        event.preventDefault();
        onEnter();
      }
      return;
    }

    if (event.key === "Escape" && onEscape) {
      onEscape();
    }
  };

  const sharedProps = {
    className,
    value,
    placeholder,
    title,
    autoFocus,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => handleChange(e.target.value),
    onKeyDown: handleKeyDown,
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const target = e.target as HTMLTextAreaElement | HTMLInputElement;
      if (e.key !== "Enter" && e.key !== "Tab" && e.key !== "Escape") {
        updateMentionState(target.selectionStart ?? value.length, value);
      }
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const target = e.target as HTMLTextAreaElement | HTMLInputElement;
      updateMentionState(target.selectionStart ?? value.length, value);
    },
    onBlur: () => {
      setMentionQuery("");
      setMentionRange(null);
      onBlur?.();
    },
    onFocus,
  };

  const mentionOpen = !!mentionRange && fileSuggestions.length > 0;

  return (
    <div className="bb-file-mention-input-shell">
      {multiline ? (
        <textarea ref={elementRef as React.Ref<HTMLTextAreaElement>} rows={1} {...sharedProps} />
      ) : (
        <input ref={elementRef as React.Ref<HTMLInputElement>} {...sharedProps} />
      )}
      {mentionOpen && (
        <div className="bb-file-mention-menu" role="listbox" aria-label={t("task.fileMentionSuggestions")}>
          {fileSuggestions.slice(0, 8).map((entry, index) => (
            <button
              key={`${entry.type}:${entry.path}`}
              type="button"
              className={`bb-file-mention-item ${entry.type === "dir" ? "is-dir" : "is-file"} ${
                index === selectedIndex ? "active" : ""
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(entry);
              }}
            >
              {entry.type === "dir" ? (
                <FolderIcon size={12} style={{ flexShrink: 0, opacity: 0.85 }} />
              ) : (
                <FileIcon size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
              )}
              <span className="bb-file-mention-name">
                {entry.path.slice(entry.path.lastIndexOf("/") + 1)}
                {entry.type === "dir" ? "/" : ""}
              </span>
              <span className="bb-file-mention-path">{entry.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
