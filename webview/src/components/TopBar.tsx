import { useState } from "react";
import { AppConfig, BoardData, GitInfo, UserFilter } from "../types";
import { t } from "../i18n";
import { UserSwitcher } from "./UserSwitcher";
import { AppHeader } from "./layout/AppHeader";
import { AppView } from "./navigation/MainNav";
import { SearchIcon } from "./Icons";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  filter: UserFilter;
  search: string;
  showInactive: boolean;
  inactiveTaskCount: number;
  onFilterChange: (f: UserFilter) => void;
  onSearchChange: (q: string) => void;
  onShowInactiveChange: (show: boolean) => void;
  onAddColumn: (name: string) => void;
  onRefresh: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenTask?: (taskId: string) => void;
  page: AppView;
  onNavigate: (view: AppView) => void;
}

export function TopBar({
  board,
  git,
  appConfig,
  currentUserId,
  filter,
  search,
  showInactive,
  inactiveTaskCount,
  onFilterChange,
  onSearchChange,
  onShowInactiveChange,
  onAddColumn,
  onRefresh,
  onSync,
  onOpenSettings,
  onOpenTask,
  page,
  onNavigate,
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
      <AppHeader
        board={board}
        git={git}
        appConfig={appConfig}
        currentUserId={currentUserId}
        page={page}
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
        onRefresh={onRefresh}
        onSync={onSync}
        onOpenTask={onOpenTask}
      />

      <div className="bb-topbar-row bb-topbar-row-tools">
        <div className="bb-search">
          <SearchIcon size={13} />
          <input
            id="bb-search-input"
            className="bb-input"
            value={search}
            placeholder={t("topBar.searchPlaceholder")}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button className="bb-iconbtn bb-search-clear" onClick={() => onSearchChange("")} title="Clear">
              ✕
            </button>
          )}
        </div>

        <UserSwitcher
          users={board.users}
          currentUserId={currentUserId}
          filter={filter}
          onChange={onFilterChange}
        />

        <button
          className={`bb-inactive-switch ${showInactive ? "on" : ""}`}
          type="button"
          role="switch"
          aria-checked={showInactive}
          title={showInactive ? t("topBar.hideInactive") : t("topBar.showInactive")}
          onClick={() => onShowInactiveChange(!showInactive)}
        >
          <span className="bb-inactive-switch-label">{t("topBar.inactive")}</span>
          {inactiveTaskCount > 0 && <span className="bb-inactive-switch-count">{inactiveTaskCount}</span>}
          <span className="bb-inactive-switch-track" aria-hidden="true" />
        </button>

        {adding ? (
          <input
            className="bb-input"
            style={{ width: 140 }}
            autoFocus
            value={name}
            placeholder={t("topBar.columnName")}
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
          <button className="bb-btn ghost" onClick={() => setAdding(true)} title={t("topBar.addColumn")}>
            + {t("topBar.addColumn")}
          </button>
        )}
      </div>
    </header>
  );
}
