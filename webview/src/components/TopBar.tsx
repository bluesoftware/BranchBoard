import { useState } from "react";
import { AppConfig, BoardData, GitInfo, UserFilter } from "../types";
import { t } from "../i18n";
import { UserSwitcher } from "./UserSwitcher";
import { MainNav, AppView } from "./navigation/MainNav";
import { Tooltip } from "./common/Tooltip";
import { BranchIcon, GearIcon, LogoMark, RefreshIcon, SearchIcon } from "./Icons";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  filter: UserFilter;
  search: string;
  onFilterChange: (f: UserFilter) => void;
  onSearchChange: (q: string) => void;
  onAddColumn: (name: string) => void;
  onRefresh: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
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
  onFilterChange,
  onSearchChange,
  onAddColumn,
  onRefresh,
  onSync,
  onOpenSettings,
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

  const branchLabel = git?.isRepo
    ? git.currentBranch ?? t("topBar.detached")
    : t("topBar.noRepo");

  return (
    <header className="bb-topbar">
      <div className="bb-topbar-left">
        <span className="bb-brand">
          <span className="bb-brand-mark">
            <LogoMark size={18} />
          </span>
          <h1 className="bb-title">{board.boardTitle || appConfig.boardTitle}</h1>
        </span>
        {appConfig.projectName && appConfig.projectName !== board.boardTitle && (
          <span className="bb-project">· {appConfig.projectName}</span>
        )}
        <span
          className={`bb-chip bb-branch-chip ${git?.hasUncommittedChanges ? "dirty" : ""}`}
          title={git?.error ?? ""}
        >
          <BranchIcon size={12} />
          {branchLabel}
          {git?.hasUncommittedChanges ? " •" : ""}
        </span>
        <span
          className={`bb-chip bb-storage-chip ${appConfig.storageMode === "server" ? "server" : ""}`}
        >
          {appConfig.storageMode === "server" ? t("topBar.storageServer") : t("topBar.storageLocal")}
        </span>
      </div>

      <MainNav page={page} onNavigate={onNavigate} />

      <div className="bb-topbar-spacer" />

      <div className="bb-topbar-right">
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

        <Tooltip text={t("topBar.refresh")}>
          <button
            className="bb-btn ghost icon"
            onClick={onSync}
            onDoubleClick={onRefresh}
            aria-label={t("topBar.refresh")}
          >
            <RefreshIcon size={13} />
          </button>
        </Tooltip>
        <Tooltip text={t("tooltips.nav.settings")}>
          <button className="bb-btn ghost icon" onClick={onOpenSettings} aria-label={t("topBar.settings")}>
            <GearIcon size={14} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
