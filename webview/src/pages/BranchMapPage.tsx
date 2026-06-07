import { useEffect, useState } from "react";
import { AppConfig, BoardData, BranchDetail, BranchFlowRow, BranchMapGraph, CommitDetail, DashboardData } from "../types";
import { t } from "../i18n";
import { relativeTime } from "../utils";
import { AppView } from "../components/navigation/MainNav";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, BadgeTone } from "../components/common/Badge";
import { Tooltip } from "../components/common/Tooltip";
import { EmptyState } from "../components/common/EmptyState";
import { MetricCard } from "../components/dashboard/MetricCard";
import { BranchPipeline } from "../components/dashboard/BranchPipeline";
import { ImpactView } from "../components/dashboard/ImpactView";
import { BranchDrawer } from "../components/branchMap/BranchDrawer";
import { BranchGraph } from "../components/branchMap/BranchGraph";
import { BranchGarden } from "../components/branchMap/BranchGarden";
import { CommitDrawer } from "../components/branchMap/CommitDrawer";

type MapMode = "garden" | "graph" | "active" | "timeline" | "task" | "risk" | "impact";
type MapFilter =
  | "all"
  | "mine"
  | "stale"
  | "ready"
  | "no-task"
  | "high-risk"
  | "ai"
  | "dev"
  | "not-deployed";

interface Props {
  board: BoardData;
  dashboard: DashboardData | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  page: AppView;
  branchDetail: BranchDetail | null;
  branchDetailLoading: boolean;
  branchMapGraph: BranchMapGraph | null;
  branchMapGraphLoading: boolean;
  commitDetail: CommitDetail | null;
  commitDetailLoading: boolean;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onRequestGraph: () => void;
  onRequestCommitDetail: (hash: string) => void;
  onOpenCommitDiff: (hash: string, path: string) => void;
  onRequestBranchDetail: (branchName: string) => void;
  onOpenTask: (taskId: string) => void;
  onCheckout: (branchName: string) => void;
  onPush: (branchName: string) => void;
  onDeployDev: (taskId: string) => void;
  onCreateTaskFromBranch: (branchName: string) => void;
  onCopyAiPrompt: (taskId: string) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (branchName: string, path: string) => void;
  onDeleteLocal: (branchName: string) => void;
  onDeleteRemote: (branchName: string) => void;
  onArchive: (branchName: string) => void;
  onCopy: (text: string, label: string) => void;
}

const RISK_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

export function BranchMapPage(props: Props) {
  const { board, dashboard, currentUserId } = props;
  const [mode, setMode] = useState<MapMode>("garden");
  const [filter, setFilter] = useState<MapFilter>("all");
  const [selected, setSelected] = useState<BranchFlowRow | null>(null);
  const [commitHash, setCommitHash] = useState<string | null>(null);

  useEffect(() => {
    props.onRefresh();
    props.onRequestGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openBranchByName = (branchName: string) => {
    const clean = branchName.replace(/^origin\//, "");
    const row =
      dashboard?.branchFlow.find((r) => r.branchName === branchName) ??
      dashboard?.branchFlow.find((r) => r.branchName === clean);
    if (row) {
      setSelected(row);
      props.onRequestBranchDetail(row.branchName);
    }
  };

  const header = (
    <PageHeader
      page={props.page}
      title={t("branchMap.title")}
      onNavigate={props.onNavigate}
      onOpenSettings={props.onOpenSettings}
      onRefresh={props.onRefresh}
    />
  );

  if (!dashboard) {
    return (
      <div className="bb-page">
        {header}
        <div className="bb-loading">
          <div className="bb-spinner" />
          <span>{t("cc.loading")}</span>
        </div>
      </div>
    );
  }

  if (!dashboard.isRepo) {
    return (
      <div className="bb-page">
        {header}
        <div className="bb-page-body">
          <EmptyState title={t("branchMap.noData")} hint={t("cc.noRepoHint")} />
        </div>
      </div>
    );
  }

  const aiTaskIds = new Set(board.tasks.filter((x) => x.ai?.createdByAi).map((x) => x.id));
  const isAi = (row: BranchFlowRow) => !!row.taskId && aiTaskIds.has(row.taskId);

  const rows = dashboard.branchFlow.filter((row) => {
    switch (filter) {
      case "mine":
        return !!currentUserId && row.assignedUserId === currentUserId;
      case "stale":
        return row.stale;
      case "ready":
        return row.info.readyToMerge;
      case "no-task":
        return !row.taskId;
      case "high-risk":
        return row.riskLevel === "high" || row.riskLevel === "critical";
      case "ai":
        return isAi(row);
      case "dev":
        return row.info.deployedToDev;
      case "not-deployed":
        return !row.info.deployedToDev;
      default:
        return true;
    }
  });

  const sorted = [...rows].sort((a, b) => {
    if (mode === "risk") {
      const order = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
      return order[a.riskLevel] - order[b.riskLevel];
    }
    const ta = a.info.lastCommitAt ? new Date(a.info.lastCommitAt).getTime() : 0;
    const tb = b.info.lastCommitAt ? new Date(b.info.lastCommitAt).getTime() : 0;
    return tb - ta;
  });
  const visible = mode === "task" ? sorted.filter((r) => r.taskId) : sorted;

  // Summary numbers.
  const all = dashboard.branchFlow;
  const sum = {
    active: all.length,
    withoutTask: all.filter((r) => !r.taskId).length,
    ready: all.filter((r) => r.info.readyToMerge).length,
    highRisk: all.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical").length,
    ai: all.filter(isAi).length,
    changedFiles: all.reduce((s, r) => s + r.info.changedFilesCount, 0),
  };

  const modes: Array<{ id: MapMode; label: string }> = [
    { id: "garden", label: t("branchMap.garden") },
    { id: "graph", label: t("branchMap.graph") },
    { id: "active", label: t("branchMap.activeBranches") },
    { id: "timeline", label: t("branchMap.timeline") },
    { id: "task", label: t("branchMap.taskGraph") },
    { id: "risk", label: t("branchMap.riskGraph") },
    { id: "impact", label: t("branchMap.impactView") },
  ];

  const filters: Array<{ id: MapFilter; label: string }> = [
    { id: "all", label: t("branchMap.all") },
    { id: "mine", label: t("branchMap.mine") },
    { id: "stale", label: t("branchMap.stale") },
    { id: "ready", label: t("branchMap.readyToMerge") },
    { id: "no-task", label: t("branchMap.withoutTask") },
    { id: "high-risk", label: t("branchMap.highRisk") },
    { id: "ai", label: t("branchMap.aiAssisted") },
    { id: "dev", label: "DEV" },
    { id: "not-deployed", label: t("branchMap.notDeployed") },
  ];

  return (
    <div className="bb-page">
      {header}
      <div className="bb-page-body">
        <p className="bb-cc-note">{t("branchMap.subtitle")}</p>

        {/* Summary strip — each tile filters the map */}
        <div className="bb-metric-grid">
          <MetricCard label={t("branchMap.activeBranchesCount")} value={sum.active} tone="neutral" onClick={() => setFilter("all")} />
          <MetricCard label={t("branchMap.withoutTask")} value={sum.withoutTask} tone="medium" onClick={() => setFilter("no-task")} />
          <MetricCard label={t("branchMap.readyToMerge")} value={sum.ready} tone="success" onClick={() => setFilter("ready")} />
          <MetricCard label={t("branchMap.highRisk")} value={sum.highRisk} tone="critical" onClick={() => setFilter("high-risk")} />
          <MetricCard label={t("branchMap.aiAssisted")} value={sum.ai} tone="info" onClick={() => setFilter("ai")} />
          <MetricCard label={t("branchMap.changedFiles")} value={sum.changedFiles} tone="neutral" />
        </div>

        {/* Mode tabs */}
        <div className="bb-chipbar">
          {modes.map((m) => (
            <button key={m.id} className={`bb-chip-btn ${mode === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === "garden" ? (
          <BranchGarden
            data={dashboard}
            board={board}
            currentUserId={currentUserId}
            branchDetail={props.branchDetail}
            branchDetailLoading={props.branchDetailLoading}
            onRequestBranchDetail={props.onRequestBranchDetail}
            onOpenBranch={(row) => {
              setSelected(row);
              props.onRequestBranchDetail(row.branchName);
            }}
            onCheckout={props.onCheckout}
            onOpenTask={props.onOpenTask}
            onCopy={props.onCopy}
          />
        ) : mode === "graph" ? (
          <BranchGraph
            graph={props.branchMapGraph}
            loading={props.branchMapGraphLoading}
            onOpenBranch={openBranchByName}
            onSelectCommit={setCommitHash}
            onCopy={props.onCopy}
          />
        ) : mode === "impact" ? (
          <ImpactView data={dashboard} />
        ) : (
          <>
            {/* Filters */}
            <div className="bb-chipbar">
              {filters.map((f) => (
                <button key={f.id} className={`bb-chip-btn ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* The map: main line + branch lanes */}
            <div className="bb-map">
          <Tooltip text={t("tooltips.git.main")}>
            <div className="bb-map-main">
              <span className="bb-map-main-dot" />
              {dashboard.mainBranch}
              <span className="bb-map-main-line" />
            </div>
          </Tooltip>

          {visible.length === 0 ? (
            <EmptyState title={t("branchMap.noBranches")} hint={t("branchMap.subtitle")} />
          ) : (
            visible.map((row) => {
              const user = board.users.find((u) => u.id === row.assignedUserId);
              const dots = Math.min(row.info.commitsAheadMain, 12);
              return (
                <div
                  className={`bb-lane risk-${row.riskLevel} clickable`}
                  key={row.branchName}
                  onClick={() => setSelected(row)}
                  title={t("branchMap.openBranch")}
                >
                  <div className="bb-lane-top">
                    <code
                      className="bb-lane-branch"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onCopy(row.branchName, t("cc.flow.branchCopied"));
                      }}
                    >
                      {row.info.current ? "● " : ""}
                      {row.branchName}
                    </code>
                    {user && (
                      <span className="bb-avatar sm" style={{ background: user.color }} title={user.name}>
                        {user.avatarText}
                      </span>
                    )}
                    {row.taskTitle ? (
                      <span className="bb-lane-task">{row.taskTitle}</span>
                    ) : (
                      <span className="bb-lane-task muted">{t("branchMap.noTaskLabel")}</span>
                    )}
                    <div className="bb-lane-badges">
                      {isAi(row) && <Badge tone="info">AI</Badge>}
                      {row.info.deployedToDev && <Badge tone="info">DEV</Badge>}
                      {row.stale && <Badge tone="warning">{t("cc.flow.staleBadge")}</Badge>}
                      <Tooltip text={t("tooltips.risk.score")}>
                        <Badge tone={RISK_TONE[row.riskLevel]}>{t(`branchMap.risk${cap(row.riskLevel)}`)}</Badge>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="bb-lane-rail">
                    <span className="bb-lane-connector" />
                    {Array.from({ length: dots }).map((_, i) => (
                      <span className="bb-lane-commit" key={i} />
                    ))}
                    {row.info.commitsAheadMain > 12 && (
                      <span className="bb-lane-more">+{row.info.commitsAheadMain - 12}</span>
                    )}
                  </div>

                  <BranchPipeline stages={row.stages} />

                  <div className="bb-lane-foot">
                    <span>↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}</span>
                    <span>{t("branchMap.files")}: {row.info.changedFilesCount}</span>
                    <span>{relativeTime(row.info.lastCommitAt, timeLabels())}</span>
                    {!row.info.current && row.info.existsLocal && (
                      <button
                        className="bb-btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onCheckout(row.branchName);
                        }}
                      >
                        {t("branchMap.checkoutBranch")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <BranchDrawer
          row={selected}
          board={board}
          appConfig={props.appConfig}
          detail={props.branchDetail}
          loading={props.branchDetailLoading}
          onClose={() => setSelected(null)}
          onRequestDetail={props.onRequestBranchDetail}
          onCheckout={props.onCheckout}
          onPush={props.onPush}
          onDeployDev={props.onDeployDev}
          onOpenTask={(id) => {
            setSelected(null);
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

      {commitHash && (
        <CommitDrawer
          hash={commitHash}
          detail={props.commitDetail}
          loading={props.commitDetailLoading}
          onClose={() => setCommitHash(null)}
          onRequestDetail={props.onRequestCommitDetail}
          onCopy={props.onCopy}
          onOpenFile={props.onOpenFile}
          onOpenCommitDiff={props.onOpenCommitDiff}
        />
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
