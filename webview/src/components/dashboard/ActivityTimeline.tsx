import { useState } from "react";
import { BoardEvent, BoardEventType, BoardUser, DashboardData } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { EmptyState } from "../common/EmptyState";

type ActFilter = "all" | "task" | "git" | "deploy" | "ai" | "user";

interface Props {
  data: DashboardData;
  users: BoardUser[];
}

/** Mirror of EventService.category (extension side) for client filtering. */
function category(type: BoardEventType): Exclude<ActFilter, "all"> {
  switch (type) {
    case "branch_created":
    case "branch_checked_out":
    case "branch_pushed":
    case "merge_started":
    case "merge_finished":
    case "merge_failed":
      return "git";
    case "dev_deploy_started":
    case "dev_deploy_finished":
    case "dev_deploy_failed":
      return "deploy";
    case "ai_prompt_copied":
      return "ai";
    case "comment_added":
      return "user";
    default:
      return "task";
  }
}

function bucket(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t0 = d.getTime();
  if (t0 >= startToday) {
    return "today";
  }
  if (t0 >= startToday - 24 * 60 * 60 * 1000) {
    return "yesterday";
  }
  if (t0 >= startToday - 7 * 24 * 60 * 60 * 1000) {
    return "week";
  }
  return "older";
}

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

export function ActivityTimeline({ data, users }: Props) {
  const [filter, setFilter] = useState<ActFilter>("all");

  const filters: ActFilter[] = ["all", "task", "git", "deploy", "ai", "user"];
  const events = data.recentEvents.filter((e) => filter === "all" || category(e.type) === filter);

  const describe = (e: BoardEvent): string => {
    const user = users.find((u) => u.id === e.userId)?.name ?? "";
    const params: Record<string, string | number> = {
      user,
      branch: e.branchName ?? "",
      title: (e.payload?.title as string) ?? "",
      fromColumn: (e.payload?.fromColumn as string) ?? "",
      toColumn: (e.payload?.toColumn as string) ?? "",
    };
    return t(`cc.event.${e.type}`, params);
  };

  const groups: Array<{ key: "today" | "yesterday" | "week" | "older"; label: string }> = [
    { key: "today", label: t("cc.act.today") },
    { key: "yesterday", label: t("cc.act.yesterday") },
    { key: "week", label: t("cc.act.week") },
    { key: "older", label: t("cc.act.older") },
  ];

  return (
    <div className="bb-cc-section">
      <div className="bb-chipbar">
        {filters.map((f) => (
          <button
            key={f}
            className={`bb-chip-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {t(`cc.act.${f}`)}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState title={t("cc.act.empty")} hint={t("cc.act.emptyHint")} />
      ) : (
        groups.map((g) => {
          const list = events.filter((e) => bucket(e.createdAt) === g.key);
          if (list.length === 0) {
            return null;
          }
          return (
            <div className="bb-act-group" key={g.key}>
              <h4 className="bb-act-grouptitle">{g.label}</h4>
              <ul className="bb-act-list">
                {list.map((e) => (
                  <li className={`bb-act-item cat-${category(e.type)}`} key={e.id}>
                    <span className="bb-act-dot" />
                    <span className="bb-act-text">{describe(e)}</span>
                    <span className="bb-act-time">{relativeTime(e.createdAt, timeLabels())}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
