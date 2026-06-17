import type { ReactNode } from "react";
import { AppConfig, BoardData, GitInfo } from "../../types";
import { t } from "../../i18n";
import { MainNav, AppView } from "../navigation/MainNav";
import { NotificationBell } from "../NotificationBell";
import { Tooltip } from "../common/Tooltip";
import { BranchIcon, GearIcon, LogoMark, RefreshIcon } from "../Icons";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  page: AppView;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSync?: () => void;
  onOpenTask?: (taskId: string) => void;
  /** Extra page-specific buttons rendered before the standard icon group (e.g. "Otwórz dashboard"). */
  extraActions?: ReactNode;
}

/**
 * The single, canonical page header. Every top-level page (Board, Current
 * Branch, Command Center, Branch Map) renders this exact component so the
 * brand/chips row and the view-switcher row look and behave identically
 * everywhere. Page-specific toolbars (search bar, tabs, ...) are additional
 * rows that the host component renders below this one — they never replace
 * or duplicate this header.
 */
export function AppHeader({
  board,
  git,
  appConfig,
  currentUserId,
  page,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onSync,
  onOpenTask,
  extraActions,
}: Props) {
  const branchLabel = git?.isRepo ? git.currentBranch ?? t("topBar.detached") : t("topBar.noRepo");
  const currentUser = board.users.find((u) => u.id === currentUserId) ?? null;

  return (
    <>
      <div className="bb-topbar-row bb-topbar-row-top">
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

        <div className="bb-topbar-spacer" />

        <div className="bb-topbar-icons">
          {extraActions}

          <Tooltip text={t("topBar.refresh")}>
            <button
              className="bb-btn ghost icon"
              onClick={onSync ?? onRefresh}
              onDoubleClick={onSync ? onRefresh : undefined}
              aria-label={t("topBar.refresh")}
            >
              <RefreshIcon size={13} />
            </button>
          </Tooltip>

          <NotificationBell
            notifications={board.notifications}
            currentUserId={currentUserId}
            onOpenTask={onOpenTask}
          />

          <Tooltip
            text={currentUser ? `${currentUser.name} · ${t("tooltips.nav.settings")}` : t("tooltips.nav.settings")}
          >
            <button className="bb-account-btn" onClick={onOpenSettings} aria-label={t("topBar.settings")}>
              {currentUser ? (
                <span
                  className={`bb-avatar small ${currentUser.avatarPhoto ? "has-photo" : ""}`}
                  style={
                    currentUser.avatarPhoto
                      ? { backgroundImage: `url(${currentUser.avatarPhoto})` }
                      : { background: currentUser.color }
                  }
                >
                  {!currentUser.avatarPhoto && currentUser.avatarText}
                </span>
              ) : (
                <GearIcon size={14} />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="bb-topbar-row bb-topbar-row-nav">
        <MainNav page={page} onNavigate={onNavigate} />
      </div>
    </>
  );
}
