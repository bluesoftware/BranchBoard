import { useEffect, useRef, useState } from "react";
import { UserFilter } from "../types";
import { post } from "../vscode";
import { t } from "../i18n";

interface Props {
  currentUserId: string | null;
  filter: UserFilter;
  onChange: (f: UserFilter) => void;
}

const STATIC_FILTERS: Array<{ key: UserFilter; labelKey: string }> = [
  { key: "me", labelKey: "topBar.myTasks" },
  { key: "all", labelKey: "topBar.allTasks" },
  { key: "unassigned", labelKey: "topBar.unassigned" },
  { key: "current-branch", labelKey: "topBar.currentBranch" },
  { key: "has-branch", labelKey: "topBar.hasBranch" },
  { key: "no-branch", labelKey: "topBar.noBranch" },
  { key: "needs-review", labelKey: "topBar.needsReview" },
  { key: "done", labelKey: "topBar.done" },
];

export function UserSwitcher({ currentUserId, filter, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const staticLabel = STATIC_FILTERS.find((f) => f.key === filter);
  const label = staticLabel ? t(staticLabel.labelKey) : t("topBar.filter");

  const choose = (f: UserFilter) => {
    onChange(f);
    setOpen(false);
  };

  return (
    <div className="bb-userswitcher" ref={ref}>
      <button className="bb-btn ghost" onClick={() => setOpen((o) => !o)}>
        <span className="bb-filter-dot" />
        {label} ▾
      </button>
      {open && (
        <div className="bb-menu">
          {STATIC_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`bb-menu-item ${filter === f.key ? "active" : ""}`}
              onClick={() => choose(f.key)}
            >
              {t(f.labelKey)}
            </button>
          ))}
          <div className="bb-menu-sep" />
          <button
            className="bb-menu-item"
            onClick={() => {
              if (currentUserId) {
                post("changeUser", { userId: currentUserId });
              }
              setOpen(false);
            }}
          >
            {t("topBar.redetectUser")}
          </button>
          <button
            className="bb-menu-item"
            onClick={() => {
              post("syncUsers");
              setOpen(false);
            }}
          >
            {t("topBar.importUsers")}
          </button>
        </div>
      )}
    </div>
  );
}
