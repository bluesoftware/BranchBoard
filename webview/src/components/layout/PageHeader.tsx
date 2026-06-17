import { AppConfig, BoardData, GitInfo } from "../../types";
import { AppView } from "../navigation/MainNav";
import { AppHeader } from "./AppHeader";

interface Props {
  page: AppView;
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId?: string | null;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh?: () => void;
  onOpenTask?: (taskId: string) => void;
}

/**
 * Thin wrapper around the shared AppHeader for non-board pages (Current
 * Branch, Branch Map). Renders the exact same header markup as the board's
 * TopBar so every page looks identical.
 */
export function PageHeader({
  page,
  board,
  git,
  appConfig,
  currentUserId,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onOpenTask,
}: Props) {
  return (
    <header className="bb-topbar">
      <AppHeader
        board={board}
        git={git}
        appConfig={appConfig}
        currentUserId={currentUserId ?? null}
        page={page}
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
        onRefresh={onRefresh ?? (() => {})}
        onOpenTask={onOpenTask}
      />
    </header>
  );
}
