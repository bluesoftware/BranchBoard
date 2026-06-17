import type { ReactNode } from "react";
import { AppConfig, BoardData, GitInfo } from "../../types";
import { t } from "../../i18n";
import { Tabs, TabItem } from "../common/Tabs";
import { Tooltip } from "../common/Tooltip";
import { AppView } from "../navigation/MainNav";
import { AppHeader } from "../layout/AppHeader";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  tabs: TabItem[];
  active: string;
  page: AppView;
  onChange: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onOpenInBrowser: () => void;
  onOpenTask?: (taskId: string) => void;
  children: ReactNode;
}

/** Frame for the Command Center: the shared AppHeader + a tab strip. */
export function DashboardShell({
  board,
  git,
  appConfig,
  currentUserId,
  tabs,
  active,
  page,
  onChange,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onOpenInBrowser,
  onOpenTask,
  children,
}: Props) {
  return (
    <div className="bb-cc">
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
          onOpenTask={onOpenTask}
          extraActions={
            <Tooltip text={t("cc.openInBrowserHint")}>
              <button className="bb-btn ghost" onClick={onOpenInBrowser}>
                {t("cc.openInBrowser")}
              </button>
            </Tooltip>
          }
        />
      </header>

      <Tabs tabs={tabs} active={active} onChange={onChange} />

      <div className="bb-cc-body">{children}</div>
    </div>
  );
}
