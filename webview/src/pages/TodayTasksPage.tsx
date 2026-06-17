import { useMemo, useState } from "react";
import { AppConfig, BoardData, BoardTask, GitInfo } from "../types";
import { t } from "../i18n";
import { daysOverdue } from "../utils";
import { AppView } from "../components/navigation/MainNav";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { HelpIcon } from "../components/common/HelpIcon";
import { PriorityBadge } from "../components/TaskCard";
import { BranchIcon, CalendarIcon, CommentIcon, FileIcon, SparkleIcon } from "../components/Icons";

type RangeMode = "today" | "next3" | "week" | "custom";
type Scope = "mine" | "all";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  page: AppView;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (task: BoardTask) => void;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string, offset: number, lang: string): string {
  if (offset === 0) return t("today.section.today");
  if (offset === 1) return t("today.section.tomorrow");
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-US", { weekday: "long" });
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dm = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  return `${label} ${dm}`;
}

interface DueChip {
  label: string;
  tone: string;
  title: string;
}

function dueChipFor(task: BoardTask): DueChip | null {
  const overdue = daysOverdue(task.dueDate);
  if (!task.dueDate || overdue === null) return null;
  const [, m, d] = task.dueDate.split("-");
  const shortDate = d && m ? `${d}.${m}` : task.dueDate;
  if (overdue > 0) {
    return { label: t("card.overdueShort", { days: overdue }), tone: "overdue", title: t("task.overdueBy", { days: overdue }) };
  }
  if (overdue === 0) {
    return { label: t("card.today"), tone: "soon", title: t("task.dueToday") };
  }
  return { label: shortDate, tone: overdue >= -2 ? "soon" : "normal", title: t("task.dueIn", { days: -overdue }) };
}

function Section({
  title,
  count,
  hint,
  tone,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  tone?: "overdue";
  children: React.ReactNode;
}) {
  return (
    <div className="bb-card bb-today-section">
      <div className="bb-section-head">
        <span className={`bb-section-title ${tone === "overdue" ? "bb-today-overdue-title" : ""}`}>{title}</span>
        {hint && <HelpIcon text={hint} />}
        {typeof count === "number" && count > 0 && <span className="bb-count">{count}</span>}
      </div>
      <div className="bb-today-rows">{children}</div>
    </div>
  );
}

function TodayRow({
  task,
  board,
  appConfig,
  onOpen,
  onToggleDone,
}: {
  task: BoardTask;
  board: BoardData;
  appConfig: AppConfig;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const assignee = board.users.find((u) => u.id === task.assignedUserId) ?? null;
  const colName = board.columns.find((c) => c.id === task.columnId)?.name ?? "";
  const due = dueChipFor(task);
  const checklistTotal = task.checklist.length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const attachedCount = task.attachedFiles?.length ?? 0;
  const isAi = !!task.ai?.createdByAi;
  const { appearance } = appConfig;

  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="bb-trow" onClick={onOpen}>
      <button className="bb-check" title={t("task.statusDone")} onClick={(e) => stop(e, onToggleDone)}>
        {""}
      </button>
      <div className="bb-trow-main">
        <div className="bb-trow-titlerow">
          <span className="bb-trow-title">{task.title}</span>
          {isAi && (
            <span className="bb-flag ai" title={t("card.aiFlag")}>
              <SparkleIcon size={11} />
            </span>
          )}
          {task.branchName && (
            <span className="bb-flag branch" title={task.branchName}>
              <BranchIcon size={11} />
            </span>
          )}
        </div>
        {task.description && <div className="bb-trow-desc">{task.description}</div>}
        <div className="bb-trow-meta">
          {colName && <span className="bb-meta-item bb-today-col">{colName}</span>}
          {appearance.showPriority && <PriorityBadge priority={task.priority} />}
          {due && (
            <span className={`bb-flag due ${due.tone}`} title={due.title}>
              <CalendarIcon size={11} />
              {due.label}
            </span>
          )}
          {attachedCount > 0 && (
            <span className="bb-meta-item" title={t("card.attachedFiles", { count: attachedCount })}>
              <FileIcon size={11} />
              {attachedCount}
            </span>
          )}
          {appearance.showChecklist && checklistTotal > 0 && (
            <span className="bb-meta-item">
              ☑ {checklistDone}/{checklistTotal}
            </span>
          )}
          {appearance.showComments && task.comments.length > 0 && (
            <span className="bb-meta-item">
              <CommentIcon size={12} />
              {task.comments.length}
            </span>
          )}
        </div>
      </div>
      {appearance.showAvatars && assignee && (
        <span className="bb-avatar small" style={{ background: assignee.color }} title={assignee.name}>
          {assignee.avatarText}
        </span>
      )}
    </div>
  );
}

export function TodayTasksPage(props: Props) {
  const { board, currentUserId, appConfig } = props;
  const [scope, setScope] = useState<Scope>(currentUserId ? "mine" : "all");
  const [range, setRange] = useState<RangeMode>("next3");
  const today = isoToday();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(addDaysIso(today, 7));

  const header = (
    <PageHeader
      page={props.page}
      board={board}
      git={props.git}
      appConfig={appConfig}
      currentUserId={currentUserId}
      onNavigate={props.onNavigate}
      onOpenSettings={props.onOpenSettings}
      onRefresh={props.onRefresh}
      onOpenTask={props.onOpenTask}
    />
  );

  const open = useMemo(
    () =>
      board.tasks.filter(
        (tsk) => tsk.status !== "done" && (scope === "all" || (!!currentUserId && tsk.assignedUserId === currentUserId))
      ),
    [board.tasks, scope, currentUserId]
  );

  const sortByPriorityThenDate = (a: BoardTask, b: BoardTask): number => {
    const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    if (pr !== 0) return pr;
    return b.updatedAt.localeCompare(a.updatedAt);
  };

  const overdue = useMemo(
    () =>
      open
        .filter((tsk) => (daysOverdue(tsk.dueDate) ?? -1) > 0)
        .sort((a, b) => (daysOverdue(b.dueDate) ?? 0) - (daysOverdue(a.dueDate) ?? 0)),
    [open]
  );

  const rangeDays = range === "today" ? 0 : range === "next3" ? 3 : range === "week" ? 7 : null;

  const groupedUpcoming = useMemo(() => {
    if (range === "custom" || rangeDays === null) return [];
    const matches = open.filter((tsk) => {
      const ov = daysOverdue(tsk.dueDate);
      if (ov === null) return false;
      return ov <= 0 && -ov <= rangeDays;
    });
    const byDate = new Map<string, BoardTask[]>();
    for (const tsk of matches) {
      const key = tsk.dueDate as string;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(tsk);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, tasks]) => {
        const ov = daysOverdue(date) ?? 0;
        return {
          date,
          label: dayLabel(date, -ov, appConfig.language),
          tasks: tasks.sort(sortByPriorityThenDate),
        };
      });
  }, [open, range, rangeDays, appConfig.language]);

  const customTasks = useMemo(() => {
    if (range !== "custom") return [];
    return open
      .filter((tsk) => !!tsk.dueDate && tsk.dueDate >= customFrom && tsk.dueDate <= customTo)
      .sort((a, b) => {
        const dc = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
        if (dc !== 0) return dc;
        return sortByPriorityThenDate(a, b);
      });
  }, [open, range, customFrom, customTo]);

  const noDate = useMemo(
    () => open.filter((tsk) => !tsk.dueDate).sort(sortByPriorityThenDate),
    [open]
  );

  const toggleDone = (tsk: BoardTask) => props.onToggleDone(tsk);

  const RANGE_ITEMS: Array<{ id: RangeMode; label: string }> = [
    { id: "today", label: t("today.range.today") },
    { id: "next3", label: t("today.range.next3") },
    { id: "week", label: t("today.range.week") },
    { id: "custom", label: t("today.range.custom") },
  ];

  const isEmptyMain =
    range !== "custom"
      ? overdue.length === 0 && groupedUpcoming.length === 0
      : customTasks.length === 0;

  return (
    <div className="bb-page">
      {header}
      <div className="bb-page-body bb-today">
        <div className="bb-card bb-today-controls">
          <div className="bb-today-titlerow">
            <div>
              <div className="bb-section-title">{t("today.title")}</div>
              <div className="bb-muted small">{t("today.subtitle")}</div>
            </div>
            <div className="bb-seg">
              <button
                className={`bb-seg-btn ${scope === "mine" ? "active" : ""}`}
                disabled={!currentUserId}
                onClick={() => setScope("mine")}
              >
                {t("today.scope.mine")}
              </button>
              <button className={`bb-seg-btn ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                {t("today.scope.all")}
              </button>
            </div>
          </div>

          <div className="bb-tabs" role="tablist">
            {RANGE_ITEMS.map((it) => (
              <button
                key={it.id}
                role="tab"
                aria-selected={range === it.id}
                className={`bb-tab ${range === it.id ? "active" : ""}`}
                onClick={() => setRange(it.id)}
              >
                {it.label}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="bb-today-customrange">
              <label>
                {t("today.range.from")}
                <input
                  type="date"
                  className="bb-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label>
                {t("today.range.to")}
                <input
                  type="date"
                  className="bb-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {range !== "custom" && overdue.length > 0 && (
          <Section title={t("today.section.overdue")} count={overdue.length} tone="overdue">
            {overdue.map((tsk) => (
              <TodayRow
                key={tsk.id}
                task={tsk}
                board={board}
                appConfig={appConfig}
                onOpen={() => props.onOpenTask(tsk.id)}
                onToggleDone={() => toggleDone(tsk)}
              />
            ))}
          </Section>
        )}

        {isEmptyMain && (
          <EmptyState title={t("today.empty.title")} hint={t("today.empty.hint")} />
        )}

        {range !== "custom" &&
          groupedUpcoming.map((g) => (
            <Section key={g.date} title={g.label} count={g.tasks.length}>
              {g.tasks.map((tsk) => (
                <TodayRow
                  key={tsk.id}
                  task={tsk}
                  board={board}
                  appConfig={appConfig}
                  onOpen={() => props.onOpenTask(tsk.id)}
                  onToggleDone={() => toggleDone(tsk)}
                />
              ))}
            </Section>
          ))}

        {range === "custom" && customTasks.length > 0 && (
          <Section title={t("today.section.custom")} count={customTasks.length}>
            {customTasks.map((tsk) => (
              <TodayRow
                key={tsk.id}
                task={tsk}
                board={board}
                appConfig={appConfig}
                onOpen={() => props.onOpenTask(tsk.id)}
                onToggleDone={() => toggleDone(tsk)}
              />
            ))}
          </Section>
        )}

        <Section title={t("today.section.noDate")} count={noDate.length} hint={t("today.section.noDateHint")}>
          {noDate.length === 0 ? (
            <div className="bb-muted small">{t("today.empty.noDate")}</div>
          ) : (
            noDate.map((tsk) => (
              <TodayRow
                key={tsk.id}
                task={tsk}
                board={board}
                appConfig={appConfig}
                onOpen={() => props.onOpenTask(tsk.id)}
                onToggleDone={() => toggleDone(tsk)}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
