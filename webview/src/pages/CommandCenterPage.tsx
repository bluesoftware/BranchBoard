import { useEffect, useState } from "react";
import { AppConfig, BoardData, BranchDetail, BranchFlowRow, DashboardData, GitInfo } from "../types";
import { t } from "../i18n";
import { AppView } from "../components/navigation/MainNav";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { OverviewDashboard } from "../components/dashboard/OverviewDashboard";
import { TeamDashboard } from "../components/dashboard/TeamDashboard";
import { BranchFlowView } from "../components/dashboard/BranchFlowView";
import { ActivityTimeline } from "../components/dashboard/ActivityTimeline";
import { RiskRadarView } from "../components/dashboard/RiskRadarView";
import { FilesCommitsView } from "../components/dashboard/FilesCommitsView";
import { AiReviewView } from "../components/dashboard/AiReviewView";
import { DeploymentsView } from "../components/dashboard/DeploymentsView";
import { ImpactView } from "../components/dashboard/ImpactView";
import { CleanupView } from "../components/dashboard/CleanupView";
import { BranchDrawer } from "../components/branchMap/BranchDrawer";
import { EmptyState } from "../components/common/EmptyState";

type CcTab = "overview" | "team" | "flow" | "cleanup" | "deployments" | "files" | "risk" | "impact" | "activity" | "ai";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  dashboard: DashboardData | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  title: string;
  page: AppView;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onOpenInBrowser: () => void;
  onOpenTask: (taskId: string) => void;
  onCopy: (text: string, label: string) => void;
  onCheckout: (branchName: string) => void;
  branchDetail: BranchDetail | null;
  branchDetailLoading: boolean;
  onSelectBranch: (branchName: string) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (branchName: string, path: string) => void;
  onOpenExternal: (url: string) => void;
  onPush: (branchName: string) => void;
  onDeployDev: (taskId: string) => void;
  onCreateTaskFromBranch: (branchName: string) => void;
  onCopyAiPrompt: (taskId: string) => void;
  onDeleteLocal: (branchName: string) => void;
  onDeleteRemote: (branchName: string) => void;
  onArchive: (branchName: string) => void;
  onLinkBranch: (taskId: string, branchName: string) => void;
  onBulkDeleteLocal: (branches: string[]) => void;
}

export function CommandCenterPage(props: Props) {
  const { board, dashboard, currentUserId } = props;
  const [tab, setTab] = useState<CcTab>("overview");
  const [selectedRow, setSelectedRow] = useState<BranchFlowRow | null>(null);

  useEffect(() => {
    props.onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openBranch = (row: BranchFlowRow) => {
    setSelectedRow(row);
    props.onSelectBranch(row.branchName);
  };

  const tabs = [
    { id: "overview", label: t("cc.tab.overview") },
    { id: "team", label: t("cc.tab.team") },
    { id: "flow", label: t("cc.tab.flow") },
    { id: "cleanup", label: t("cc.tab.cleanup") },
    { id: "deployments", label: t("cc.tab.deployments") },
    { id: "files", label: t("cc.tab.files") },
    { id: "risk", label: t("cc.tab.risk") },
    { id: "impact", label: t("cc.tab.impact") },
    { id: "activity", label: t("cc.tab.activity") },
    { id: "ai", label: t("cc.tab.ai") },
  ];

  const renderBody = () => {
    if (!dashboard) {
      return (
        <div className="bb-loading">
          <div className="bb-spinner" />
          <span>{t("cc.loading")}</span>
        </div>
      );
    }
    if (!dashboard.isRepo && (tab === "flow" || tab === "risk" || tab === "files")) {
      return <EmptyState title={t("cc.noRepo")} hint={t("cc.noRepoHint")} />;
    }
    switch (tab) {
      case "overview":
        return <OverviewDashboard data={dashboard} board={board} onOpenTask={props.onOpenTask} />;
      case "team":
        return <TeamDashboard data={dashboard} />;
      case "flow":
        return (
          <BranchFlowView
            data={dashboard}
            board={board}
            currentUserId={currentUserId}
            onCopy={props.onCopy}
            onOpenTask={props.onOpenTask}
            onCheckout={props.onCheckout}
            onPush={props.onPush}
            onDeployDev={props.onDeployDev}
            onCreateTaskFromBranch={props.onCreateTaskFromBranch}
            onLinkBranch={props.onLinkBranch}
            onOpenBranch={openBranch}
            onBulkDeleteLocal={props.onBulkDeleteLocal}
          />
        );
      case "activity":
        return <ActivityTimeline data={dashboard} users={board.users} />;
      case "risk":
        return <RiskRadarView data={dashboard} onOpenTask={props.onOpenTask} />;
      case "files":
        return <FilesCommitsView data={dashboard} onSelectRow={openBranch} />;
      case "ai":
        return <AiReviewView data={dashboard} onOpenTask={props.onOpenTask} />;
      case "impact":
        return <ImpactView data={dashboard} />;
      case "cleanup":
        return (
          <CleanupView
            data={dashboard}
            board={board}
            onOpenBranch={openBranch}
            onCopy={props.onCopy}
            onBulkDeleteLocal={props.onBulkDeleteLocal}
          />
        );
      case "deployments":
        return (
          <DeploymentsView
            board={board}
            dashboard={dashboard}
            onOpenTask={props.onOpenTask}
            onOpenExternal={props.onOpenExternal}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <DashboardShell
        board={board}
        git={props.git}
        appConfig={props.appConfig}
        currentUserId={currentUserId}
        tabs={tabs}
        active={tab}
        page={props.page}
        onChange={(id) => setTab(id as CcTab)}
        onNavigate={props.onNavigate}
        onOpenSettings={props.onOpenSettings}
        onRefresh={props.onRefresh}
        onOpenInBrowser={props.onOpenInBrowser}
        onOpenTask={props.onOpenTask}
      >
        {renderBody()}
      </DashboardShell>

      {selectedRow && (
        <BranchDrawer
          row={selectedRow}
          board={board}
          appConfig={props.appConfig}
          detail={props.branchDetail}
          loading={props.branchDetailLoading}
          onClose={() => setSelectedRow(null)}
          onRequestDetail={props.onSelectBranch}
          onCheckout={props.onCheckout}
          onPush={props.onPush}
          onDeployDev={props.onDeployDev}
          onOpenTask={(id) => {
            setSelectedRow(null);
            props.onOpenTask(id);
          }}
          onCreateTaskFromBranch={props.onCreateTaskFromBranch}
          onCopy={props.onCopy}
          onCopyAiPrompt={props.onCopyAiPrompt}
          onOpenFile={props.onOpenFile}
          onOpenDiff={props.onOpenDiff}
          onDeleteLocal={props.onDeleteLocal}
          onDeleteRemote={props.onDeleteRemote}
          onArchive={props.onArchive}
        />
      )}
    </>
  );
}
