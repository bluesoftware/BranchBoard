import { AppConfig, BoardData, GitInfo } from "../../types";
import { t } from "../../i18n";
import { MainNav, AppView } from "../navigation/MainNav";
import { Tooltip } from "../common/Tooltip";
import { BranchIcon, GearIcon, LogoMark, RefreshIcon } from "../Icons";

interface Props {
  page: AppView;
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh?: () => void;
}

/**
 * Shared top header for non-board pages — identical structure to the board
 * TopBar (brand + branch/storage chips + view switcher) so navigation feels the
 * same everywhere.
 */
export function PageHeader({ page, board, git, appConfig, onNavigate, onOpenSettings, onRefresh }: Props) {
  const branchLabel = git?.isRepo ? git.currentBranch ?? t("topBar.detached") : t("topBar.noRepo");
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
        <span className={`bb-chip bb-branch-chip ${git?.hasUncommittedChanges ? "dirty" : ""}`} title={git?.error ?? ""}>
          <BranchIcon size={12} />
          {branchLabel}
          {git?.hasUncommittedChanges ? " •" : ""}
        </span>
        <span className={`bb-chip bb-storage-chip ${appConfig.storageMode === "server" ? "server" : ""}`}>
          {appConfig.storageMode === "server" ? t("topBar.storageServer") : t("topBar.storageLocal")}
        </span>
      </div>

      <MainNav page={page} onNavigate={onNavigate} />

      <div className="bb-topbar-spacer" />

      <div className="bb-topbar-right">
        {onRefresh && (
          <Tooltip text={t("branchMap.refresh")}>
            <button className="bb-btn ghost icon" onClick={onRefresh} aria-label={t("branchMap.refresh")}>
              <RefreshIcon size={13} />
            </button>
          </Tooltip>
        )}
        <Tooltip text={t("tooltips.nav.settings")}>
          <button className="bb-btn ghost icon" onClick={onOpenSettings} aria-label={t("nav.settings")}>
            <GearIcon size={14} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
