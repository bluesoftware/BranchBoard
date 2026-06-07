import { BoardData, DashboardData, Deployment } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";
import { Badge, BadgeTone } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";

interface Props {
  board: BoardData;
  dashboard: DashboardData;
  onOpenTask: (taskId: string) => void;
  onOpenExternal: (url: string) => void;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  deployed: "success",
  deploying: "info",
  failed: "critical",
  not_deployed: "neutral",
};

export function DeploymentsView({ board, dashboard, onOpenTask, onOpenExternal }: Props) {
  const deployments = [...board.deployments].sort((a, b) =>
    (b.deployedAt ?? "").localeCompare(a.deployedAt ?? "")
  );

  if (deployments.length === 0) {
    return <EmptyState title={t("cc.deploy.empty")} hint={t("cc.deploy.emptyHint")} />;
  }

  const readyByBranch = new Map(dashboard.branchFlow.map((r) => [r.branchName, r.info.readyToMerge]));

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cc.deploy.note")}</p>
      <div className="bb-deploy-list">
        {deployments.map((d: Deployment) => {
          const task = d.taskId ? board.tasks.find((x) => x.id === d.taskId) : undefined;
          const user = board.users.find((u) => u.name === d.deployedBy);
          const ready = readyByBranch.get(d.branchName);
          return (
            <div className="bb-deploy-card" key={d.id}>
              <div className="bb-deploy-top">
                <Badge tone={d.environment === "production" ? "critical" : "info"}>
                  {d.environment.toUpperCase()}
                </Badge>
                <code className="bb-deploy-branch">{d.branchName}</code>
                <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{t(`cc.deploy.status.${d.status}`)}</Badge>
                {d.tested && <Badge tone="success">{t("cc.deploy.tested")}</Badge>}
                {ready && <Badge tone="success">{t("cc.deploy.ready")}</Badge>}
                <div className="bb-deploy-spacer" />
                {d.url && (
                  <button className="bb-btn ghost sm" onClick={() => onOpenExternal(d.url)}>
                    {t("cc.deploy.open")}
                  </button>
                )}
              </div>
              <div className="bb-deploy-meta">
                {task ? (
                  <span className="bb-flow-task clickable" onClick={() => onOpenTask(task.id)}>
                    {task.title}
                  </span>
                ) : (
                  <span className="bb-flow-task muted">{t("cc.flow.noTaskLabel")}</span>
                )}
                {d.deployedBy && (
                  <span className="bb-deploy-by">
                    {user && (
                      <span className="bb-avatar sm" style={{ background: user.color }}>
                        {user.avatarText}
                      </span>
                    )}
                    {d.deployedBy}
                  </span>
                )}
                <span className="bb-deploy-when">{formatDate(d.deployedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
