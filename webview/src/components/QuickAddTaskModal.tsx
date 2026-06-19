import { useState } from "react";
import { BoardColumn } from "../types";
import { t } from "../i18n";

interface Props {
  columns: BoardColumn[];
  defaultColumnId?: string | null;
  onCreate: (title: string, columnId: string | undefined) => void;
  onClose: () => void;
}

/**
 * Lightweight "quick add" task modal, opened from the global FAB button.
 * Deliberately simpler than TaskDrawer (which edits a full existing task):
 * this only collects a title (required) and an optional column.
 *
 * Save/cancel semantics mirror the existing inline "add task" widget in
 * Column.tsx for consistency with the rest of the app:
 *  - Enter or the explicit "Dodaj zadanie" button commits, but ONLY when the
 *    trimmed title is non-empty.
 *  - Escape, the X button, a backdrop click, or the explicit "Anuluj" button
 *    ALWAYS discard and close — regardless of whether the title is filled
 *    in. This keeps "closing the window" predictable: it never silently
 *    saves a task, it just gives up on it.
 */
export function QuickAddTaskModal(props: Props) {
  const { columns } = props;
  const [title, setTitle] = useState("");
  const [columnId, setColumnId] = useState<string>(props.defaultColumnId ?? columns[0]?.id ?? "");

  const isTitleEmpty = title.trim().length === 0;

  const commit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    props.onCreate(trimmed, columnId || undefined);
    props.onClose();
  };

  return (
    <div className="bb-task-modal-overlay bb-quickadd-overlay" onMouseDown={props.onClose}>
      <section
        className="bb-task-modal bb-quickadd-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("quickAdd.title")}
      >
        <header className="bb-task-modal-head">
          <span className="bb-task-modal-breadcrumb">{t("quickAdd.title")}</span>
          <div className="bb-task-modal-actions">
            <button className="bb-task-modal-close" onClick={props.onClose} title={t("board.cancel")}>
              ×
            </button>
          </div>
        </header>

        <div className="bb-quickadd-body">
          <label className="bb-field-label" htmlFor="bb-quickadd-title">
            {t("quickAdd.titleLabel")}
          </label>
          <input
            id="bb-quickadd-title"
            className={`bb-input bb-quickadd-input ${isTitleEmpty ? "needs-input" : ""}`}
            autoFocus
            value={title}
            placeholder={t("board.taskName")}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                props.onClose();
              }
            }}
          />
          <div className="bb-quickadd-hint">{t("quickAdd.requiredHint")}</div>

          {columns.length > 0 && (
            <>
              <label className="bb-field-label" htmlFor="bb-quickadd-column">
                {t("quickAdd.columnLabel")}
              </label>
              <select
                id="bb-quickadd-column"
                className="bb-input"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <footer className="bb-task-modal-foot bb-quickadd-foot">
          <button className="bb-btn ghost" onClick={props.onClose}>
            {t("board.cancel")}
          </button>
          <button
            className="bb-btn accent"
            disabled={isTitleEmpty}
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
          >
            {t("board.addTask")}
          </button>
        </footer>
      </section>
    </div>
  );
}
