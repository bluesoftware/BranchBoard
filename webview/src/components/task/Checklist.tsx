import { useState } from "react";
import { ChecklistItem, FileMentionEntry } from "../../types";
import { t } from "../../i18n";
import { FileMentionInput } from "./FileMentionInput";
import { renderTextWithFileMentions } from "../../fileMentionDisplay";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  titleKey?: string;
  titleLabel?: string;
  readOnly?: boolean;
  readOnlyMessage?: string;
  fileSuggestions?: FileMentionEntry[];
  onSearchFiles?: (query: string) => void;
  onOpenFile?: (path: string) => void;
}

/** Reusable checklist (progress + toggle/remove + add). Used in TaskDrawer and Current Branch. */
export function Checklist({
  items,
  onChange,
  titleKey = "task.checklist",
  titleLabel,
  readOnly = false,
  readOnlyMessage,
  fileSuggestions = [],
  onSearchFiles = () => {},
  onOpenFile,
}: Props) {
  const [newItem, setNewItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const done = items.filter((i) => i.done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  const add = () => {
    if (readOnly) {
      return;
    }
    const text = newItem.trim();
    if (!text) {
      return;
    }
    onChange([...items, { id: `ci_${Date.now().toString(36)}`, text, done: false }]);
    setNewItem("");
  };
  const toggle = (id: string) => {
    if (!readOnly) {
      onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
    }
  };
  const remove = (id: string) => {
    if (!readOnly) {
      onChange(items.filter((i) => i.id !== id));
    }
  };
  const beginEditItem = (item: ChecklistItem) => {
    if (readOnly) {
      return;
    }
    setEditingId(item.id);
    setEditingText(item.text);
  };
  const commitEditItem = () => {
    if (editingId) {
      const text = editingText.trim();
      if (text) {
        onChange(items.map((i) => (i.id === editingId ? { ...i, text } : i)));
      }
    }
    setEditingId(null);
    setEditingText("");
  };
  const cancelEditItem = () => {
    setEditingId(null);
    setEditingText("");
  };

  return (
    <div className="bb-section">
      <div className="bb-section-title">
        {titleLabel ?? t(titleKey)} {items.length > 0 ? `(${done}/${items.length})` : ""}
      </div>
      {items.length > 0 && (
        <div className="bb-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="bb-checklist">
        {items.map((c) => (
          <div key={c.id} className="bb-check-item">
            <button
              className={`bb-check square ${c.done ? "checked" : ""}`}
              disabled={readOnly}
              onClick={() => toggle(c.id)}
            >
              {c.done ? "✓" : ""}
            </button>
            {editingId === c.id ? (
              <FileMentionInput
                className="bb-input bb-check-text-edit"
                value={editingText}
                fileSuggestions={fileSuggestions}
                onSearchFiles={onSearchFiles}
                autoFocus
                onChange={setEditingText}
                onEnter={commitEditItem}
                onEscape={cancelEditItem}
                onBlur={commitEditItem}
              />
            ) : (
              <span
                className={`bb-check-text ${c.done ? "done" : ""}`}
                role="button"
                tabIndex={readOnly ? -1 : 0}
                onClick={() => beginEditItem(c)}
                title={readOnly ? undefined : t("task.help.title")}
              >
                {renderTextWithFileMentions(c.text, onOpenFile)}
              </span>
            )}
            <button
              className="bb-iconbtn"
              disabled={readOnly}
              onClick={() => remove(c.id)}
              title={t("common.delete")}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {readOnly ? (
        readOnlyMessage ? <div className="bb-muted small">{readOnlyMessage}</div> : null
      ) : (
        <div className="bb-comment-add">
          <FileMentionInput
            className="bb-input"
            value={newItem}
            placeholder={t("task.checklistItem")}
            fileSuggestions={fileSuggestions}
            onSearchFiles={onSearchFiles}
            onChange={setNewItem}
            onEnter={add}
          />
          <button className="bb-btn" disabled={!newItem.trim()} onClick={add}>
            {t("task.addItem")}
          </button>
        </div>
      )}
    </div>
  );
}
