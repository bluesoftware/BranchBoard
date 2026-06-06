import { useState } from "react";
import { BoardData, GitInfo, UserFilter } from "../types";
import { UserSwitcher } from "./UserSwitcher";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  currentUserId: string | null;
  filter: UserFilter;
  onFilterChange: (f: UserFilter) => void;
  onAddColumn: (name: string) => void;
  onRefresh: () => void;
  onConfigure: () => void;
}

export function TopBar({
  board,
  git,
  currentUserId,
  filter,
  onFilterChange,
  onAddColumn,
  onRefresh,
  onConfigure,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onAddColumn(trimmed);
    }
    setName("");
    setAdding(false);
  };

  return (
    <header className="bb-topbar">
      <div className="bb-topbar-left">
        <h1 className="bb-title">{board.boardTitle || board.projectName}</h1>
        {git && (
          <span className={`bb-branch-chip ${git.hasUncommittedChanges ? "dirty" : ""}`} title={git.error ?? ""}>
            {git.isRepo ? (
              <>
                <BranchIcon />
                {git.currentBranch ?? "detached"}
                {git.hasUncommittedChanges ? " •" : ""}
              </>
            ) : (
              "no git repo"
            )}
          </span>
        )}
      </div>

      <div className="bb-topbar-right">
        <UserSwitcher
          users={board.users}
          currentUserId={currentUserId}
          filter={filter}
          onChange={onFilterChange}
        />
        {adding ? (
          <input
            className="bb-input bb-addcol-input"
            autoFocus
            value={name}
            placeholder="Column name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            onBlur={commit}
          />
        ) : (
          <button className="bb-btn ghost" onClick={() => setAdding(true)} title="Add column">
            + Column
          </button>
        )}
        <button className="bb-btn ghost icon" onClick={onRefresh} title="Refresh">
          ⟳
        </button>
        <button className="bb-btn ghost icon" onClick={onConfigure} title="Settings">
          ⚙
        </button>
      </div>
    </header>
  );
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
    </svg>
  );
}
