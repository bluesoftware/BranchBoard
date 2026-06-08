import { useMemo, useState } from "react";
import { BoardEvent, BoardEventType, BoardTask, BoardUser, CommitInfo } from "../../types";
import { t } from "../../i18n";
import { daysOverdue, formatDate, relativeTime } from "../../utils";

interface Props {
  task: BoardTask;
  events: BoardEvent[];
  branchCommits: CommitInfo[];
  users: BoardUser[];
}

interface Entry {
  time: string;
  text: string;
  kind: "git" | "task" | "ai" | "user";
  userId: string | null;
  userName: string;
}

function category(kind: Entry["kind"]): "all" | "git" | "task" | "ai" | "user" {
  return kind;
}

function eventKind(type: BoardEventType): Entry["kind"] {
  if (type === "comment_added") return "user";
  if (type === "ai_prompt_copied") return "ai";
  if (type.startsWith("branch") || type.startsWith("merge") || type.startsWith("dev_deploy")) return "git";
  return "task";
}

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

/** Reusable work log: last 5 entries + overdue + "show all" modal with filters. */
export function WorkLog({ task, events, branchCommits, users }: Props) {
  const [open, setOpen] = useState(false);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<"all" | "git" | "task" | "ai" | "user">("all");

  const eventText = (e: BoardEvent): string => {
    const params = {
      user: users.find((u) => u.id === e.userId)?.name ?? "",
      branch: e.branchName ?? "",
      title: (e.payload?.title as string) ?? task.title,
      fromColumn: (e.payload?.fromColumn as string) ?? "",
      toColumn: (e.payload?.toColumn as string) ?? "",
    };
    return t(`cc.event.${e.type}`, params);
  };

  const entries = useMemo<Entry[]>(() => {
    const fromCommits: Entry[] = branchCommits.map((c) => ({
      time: c.date,
      text: c.subject || c.shortHash,
      kind: "git",
      userId: users.find((u) => u.name === c.author)?.id ?? null,
      userName: c.author,
    }));
    const fromEvents: Entry[] = events
      .filter((e) => e.taskId === task.id)
      .map((e) => ({
        time: e.createdAt,
        text: eventText(e),
        kind: eventKind(e.type),
        userId: e.userId ?? null,
        userName: users.find((u) => u.id === e.userId)?.name ?? "",
      }));
    return [...fromCommits, ...fromEvents]
      .filter((e) => e.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, events, branchCommits, users]);

  const last5 = entries.slice(0, 5);
  const lastAt = entries[0]?.time ?? task.updatedAt;
  const overdue = task.status === "done" ? null : daysOverdue(task.dueDate);

  const filtered = entries.filter(
    (e) =>
      (userFilter === "all" || e.userId === userFilter) &&
      (catFilter === "all" || category(e.kind) === catFilter)
  );

  return (
    <div className="bb-card bb-context">
      <div className="bb-section-head">
        <span className="bb-section-title">{t("task.workLog")}</span>
        <div className="bb-section-right">
          {overdue !== null && overdue > 0 && (
            <span className="bb-due-badge overdue">{t("task.overdueBy", { days: overdue })}</span>
          )}
          {overdue !== null && overdue === 0 && <span className="bb-due-badge due">{t("task.dueToday")}</span>}
          {overdue !== null && overdue < 0 && <span className="bb-due-badge ok">{t("task.dueIn", { days: -overdue })}</span>}
          <span className="bb-worklog-last">{t("task.lastWork")}: {relativeTime(lastAt, timeLabels())}</span>
        </div>
      </div>

      {last5.length === 0 ? (
        <div className="bb-muted small">{t("task.noWorkLog")}</div>
      ) : (
        <ul className="bb-worklog-list">
          {last5.map((w, i) => (
            <li key={i} className={`bb-worklog-item kind-${w.kind}`}>
              <span className="bb-worklog-dot" />
              <span className="bb-worklog-text">{w.text}</span>
              <span className="bb-worklog-time">{relativeTime(w.time, timeLabels())}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="bb-history-row">
        <span title={t("task.help.created")}>{t("task.created")}: <strong>{formatDate(task.createdAt)}</strong></span>
        <span title={t("task.help.updated")}>{t("task.updated")}: <strong>{formatDate(task.updatedAt)}</strong></span>
        {task.finishedAt && (
          <span title={t("task.help.finished")}>{t("task.finished")}: <strong>{formatDate(task.finishedAt)}</strong></span>
        )}
        {entries.length > 5 && (
          <button className="bb-btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setOpen(true)}>
            {t("workLog.showAll", { count: entries.length })}
          </button>
        )}
      </div>

      {open && (
        <div className="bb-modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="bb-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="bb-modal-head">
              <span className="bb-section-title">{t("task.workLog")}</span>
              <button className="bb-iconbtn" onClick={() => setOpen(false)} title={t("settings.close")}>✕</button>
            </div>
            <div className="bb-modal-filters">
              <select className="bb-input" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="all">{t("workLog.allUsers")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <select className="bb-input" value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)}>
                <option value="all">{t("cc.act.all")}</option>
                <option value="git">{t("cc.act.git")}</option>
                <option value="task">{t("cc.act.task")}</option>
                <option value="ai">{t("cc.act.ai")}</option>
                <option value="user">{t("cc.act.user")}</option>
              </select>
            </div>
            <ul className="bb-worklog-list bb-modal-body">
              {filtered.length === 0 ? (
                <div className="bb-muted small">{t("cc.act.empty")}</div>
              ) : (
                filtered.map((w, i) => (
                  <li key={i} className={`bb-worklog-item kind-${w.kind}`}>
                    <span className="bb-worklog-dot" />
                    <span className="bb-worklog-text">{w.text}</span>
                    {w.userName && <span className="bb-muted small">{w.userName}</span>}
                    <span className="bb-worklog-time">{relativeTime(w.time, timeLabels())}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
