import { useState } from "react";
import { ChecklistItem } from "../../types";
import { t } from "../../i18n";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  titleKey?: string;
  titleLabel?: string;
}

/** Reusable checklist (progress + toggle/remove + add). Used in TaskDrawer and Current Branch. */
export function Checklist({ items, onChange, titleKey = "task.checklist", titleLabel }: Props) {
  const [newItem, setNewItem] = useState("");
  const done = items.filter((i) => i.done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  const add = () => {
    const text = newItem.trim();
    if (!text) {
      return;
    }
    onChange([...items, { id: `ci_${Date.now().toString(36)}`, text, done: false }]);
    setNewItem("");
  };
  const toggle = (id: string) => onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));

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
            <button className={`bb-check square ${c.done ? "checked" : ""}`} onClick={() => toggle(c.id)}>
              {c.done ? "✓" : ""}
            </button>
            <span className={`bb-check-text ${c.done ? "done" : ""}`}>{c.text}</span>
            <button className="bb-iconbtn" onClick={() => remove(c.id)} title={t("common.delete")}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="bb-comment-add">
        <input
          className="bb-input"
          value={newItem}
          placeholder={t("task.checklistItem")}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="bb-btn" disabled={!newItem.trim()} onClick={add}>
          {t("task.addItem")}
        </button>
      </div>
    </div>
  );
}
