import { DashboardData, TeamMemberStats } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { ProgressBar } from "../common/ProgressBar";
import { Badge } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";

interface Props {
  data: DashboardData;
}

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

/** Team workload view — surfaces bottlenecks, not individual judgement. */
export function TeamDashboard({ data }: Props) {
  const maxActive = Math.max(1, ...data.team.map((m) => m.active));

  if (data.team.length === 0) {
    return <EmptyState title={t("cc.team.empty")} hint={t("cc.team.emptyHint")} />;
  }

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("cc.team.disclaimer")}</p>
      <div className="bb-team-grid">
        {data.team.map((m: TeamMemberStats) => (
          <div className="bb-team-card" key={m.userId}>
            <div className="bb-team-head">
              <span className="bb-avatar" style={{ background: m.color }}>
                {m.avatarText}
              </span>
              <div className="bb-team-id">
                <div className="bb-team-name">{m.name}</div>
                {m.email && <div className="bb-team-email">{m.email}</div>}
              </div>
              {m.blocked > 0 && <Badge tone="critical">{t("cc.team.blocked")}: {m.blocked}</Badge>}
            </div>

            <div className="bb-team-workload">
              <div className="bb-team-workload-row">
                <span>{t("cc.team.active")}</span>
                <strong>{m.active}</strong>
              </div>
              <ProgressBar value={m.active} max={maxActive} color={m.color} />
            </div>

            <div className="bb-team-stats">
              <span title={t("cc.team.inReview")}>
                {t("cc.team.review")} <strong>{m.inReview}</strong>
              </span>
              <span title={t("cc.team.inTesting")}>
                {t("cc.team.testing")} <strong>{m.inTesting}</strong>
              </span>
              <span title={t("cc.team.branchesHint")}>
                {t("cc.team.branches")} <strong>{m.branches}</strong>
              </span>
              <span title={t("cc.team.doneThisWeekHint")}>
                {t("cc.team.doneWeek")} <strong>{m.doneThisWeek}</strong>
              </span>
            </div>

            <div className="bb-team-foot">
              {t("cc.team.lastActivity")}: {relativeTime(m.lastActivityAt, timeLabels())}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
