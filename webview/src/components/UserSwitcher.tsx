import { useEffect, useRef, useState } from "react";
import { BoardUser, UserFilter } from "../types";
import { post } from "../vscode";

interface Props {
  users: BoardUser[];
  currentUserId: string | null;
  filter: UserFilter;
  onChange: (f: UserFilter) => void;
}

export function UserSwitcher({ users, currentUserId, filter, onChange }: Props) {
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

  const label =
    filter === "all"
      ? "All tasks"
      : filter === "me"
      ? "My tasks"
      : users.find((u) => u.id === filter)?.name ?? "Filter";

  return (
    <div className="bb-userswitcher" ref={ref}>
      <button className="bb-btn ghost" onClick={() => setOpen((o) => !o)}>
        <span className="bb-filter-dot" />
        {label} ▾
      </button>
      {open && (
        <div className="bb-menu">
          <button
            className={`bb-menu-item ${filter === "me" ? "active" : ""}`}
            onClick={() => {
              onChange("me");
              setOpen(false);
            }}
          >
            My tasks
          </button>
          <button
            className={`bb-menu-item ${filter === "all" ? "active" : ""}`}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
          >
            All tasks
          </button>
          <div className="bb-menu-sep" />
          {users.map((u) => (
            <button
              key={u.id}
              className={`bb-menu-item ${filter === u.id ? "active" : ""}`}
              onClick={() => {
                onChange(u.id);
                setOpen(false);
              }}
            >
              <span className="bb-avatar small" style={{ background: u.color }}>
                {u.avatarText}
              </span>
              {u.name}
              {u.id === currentUserId ? " (you)" : ""}
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
            Re-detect git user
          </button>
        </div>
      )}
    </div>
  );
}
