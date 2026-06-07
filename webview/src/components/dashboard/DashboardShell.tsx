import type { ReactNode } from "react";
import { t } from "../../i18n";
import { Tabs, TabItem } from "../common/Tabs";
import { Tooltip } from "../common/Tooltip";
import { MainNav, AppView } from "../navigation/MainNav";
import { GearIcon, RefreshIcon } from "../Icons";

interface Props {
  title: string;
  tabs: TabItem[];
  active: string;
  page: AppView;
  onChange: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onOpenInBrowser: () => void;
  children: ReactNode;
}

/** Frame for the Command Center: header (nav / title / actions) + tab strip. */
export function DashboardShell({
  title,
  tabs,
  active,
  page,
  onChange,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onOpenInBrowser,
  children,
}: Props) {
  return (
    <div className="bb-cc">
      <header className="bb-cc-header">
        <div className="bb-cc-header-left">
          <MainNav page={page} onNavigate={onNavigate} />
          <h1 className="bb-cc-title">{title}</h1>
        </div>
        <div className="bb-cc-header-right">
          <Tooltip text={t("cc.openInBrowserHint")}>
            <button className="bb-btn ghost" onClick={onOpenInBrowser}>
              {t("cc.openInBrowser")}
            </button>
          </Tooltip>
          <Tooltip text={t("cc.refresh")}>
            <button className="bb-btn ghost icon" onClick={onRefresh} aria-label={t("cc.refresh")}>
              <RefreshIcon size={13} />
            </button>
          </Tooltip>
          <Tooltip text={t("tooltips.nav.settings")}>
            <button className="bb-btn ghost icon" onClick={onOpenSettings} aria-label={t("nav.settings")}>
              <GearIcon size={14} />
            </button>
          </Tooltip>
        </div>
      </header>

      <Tabs tabs={tabs} active={active} onChange={onChange} />

      <div className="bb-cc-body">{children}</div>
    </div>
  );
}
