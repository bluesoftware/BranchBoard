import { t } from "../../i18n";
import { MainNav, AppView } from "../navigation/MainNav";
import { Tooltip } from "../common/Tooltip";
import { GearIcon, LogoMark, RefreshIcon } from "../Icons";

interface Props {
  page: AppView;
  title: string;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh?: () => void;
}

/** Shared top header (brand + view switcher + title + actions) for non-board pages. */
export function PageHeader({ page, title, onNavigate, onOpenSettings, onRefresh }: Props) {
  return (
    <header className="bb-topbar">
      <div className="bb-topbar-left">
        <span className="bb-brand">
          <span className="bb-brand-mark">
            <LogoMark size={18} />
          </span>
          <h1 className="bb-title">{title}</h1>
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
