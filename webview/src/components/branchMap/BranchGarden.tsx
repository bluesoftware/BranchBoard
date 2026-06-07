import { useMemo, useState } from "react";
import { BoardData, BranchDetail, BranchFlowRow, DashboardData } from "../../types";
import { t } from "../../i18n";
import { relativeTime } from "../../utils";
import { Tooltip } from "../common/Tooltip";
import { EmptyState } from "../common/EmptyState";

interface Props {
  data: DashboardData;
  board: BoardData;
  currentUserId: string | null;
  branchDetail: BranchDetail | null;
  branchDetailLoading: boolean;
  onRequestBranchDetail: (branchName: string) => void;
  onOpenBranch: (row: BranchFlowRow) => void;
  onCheckout: (branchName: string) => void;
  onOpenTask: (taskId: string) => void;
  onCopy: (text: string, label: string) => void;
}

type Health = "healthy" | "ready" | "stale" | "risk" | "backup" | "noTask";

const HEALTH_GLYPH: Record<Health, string> = {
  healthy: "🌱",
  ready: "🌸",
  stale: "🍂",
  risk: "⚠",
  backup: "🗄",
  noTask: "❓",
};

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

function healthOf(row: BranchFlowRow): Health {
  if (row.branchName.startsWith("backup/") || row.branchName.startsWith("archive/")) {
    return "backup";
  }
  if (row.riskLevel === "high" || row.riskLevel === "critical") {
    return "risk";
  }
  if (row.stale) {
    return "stale";
  }
  if (row.info.readyToMerge) {
    return "ready";
  }
  if (!row.taskId) {
    return "noTask";
  }
  return "healthy";
}

/**
 * Branch Garden — a friendly, expandable tree rooted at main. Each branch is a
 * limb growing off the trunk with a "health" indicator (gardener metaphor), so
 * even someone new to Git can read the flow at a glance and prune dead wood.
 */
const HEALTH_COLOR: Record<Health, string> = {
  healthy: "var(--bb-success)",
  ready: "var(--bb-accent)",
  stale: "var(--bb-warning)",
  risk: "var(--bb-danger)",
  backup: "var(--bb-border-strong)",
  noTask: "var(--bb-warning)",
};

export function BranchGarden(props: Props) {
  const { data, board } = props;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<"health" | "user">("health");

  // Newest first; the trunk (main) is shown as the root, not as a limb.
  // Memoized so re-renders (expand, color toggle) stay cheap on large repos.
  const limbs = useMemo(
    () =>
      [...data.branchFlow]
        .filter((r) => r.branchName !== data.mainBranch)
        .sort((a, b) => {
          const ta = a.info.lastCommitAt ? new Date(a.info.lastCommitAt).getTime() : 0;
          const tb = b.info.lastCommitAt ? new Date(b.info.lastCommitAt).getTime() : 0;
          return tb - ta;
        }),
    [data.branchFlow, data.mainBranch]
  );

  const limbColor = (row: BranchFlowRow, health: Health): string => {
    if (colorBy === "user") {
      const u = board.users.find((x) => x.id === row.assignedUserId);
      return u?.color ?? "var(--bb-border-strong)";
    }
    return HEALTH_COLOR[health];
  };

  const toggle = (name: string) => {
    if (expanded === name) {
      setExpanded(null);
    } else {
      setExpanded(name);
      props.onRequestBranchDetail(name);
    }
  };

  const legend: Health[] = ["healthy", "ready", "stale", "risk", "backup", "noTask"];

  return (
    <div className="bb-cc-section">
      <p className="bb-cc-note">{t("garden.intro")}</p>

      {/* Legend — explains the tree for newcomers */}
      <div className="bb-garden-legend">
        {legend.map((h) => (
          <Tooltip key={h} text={t(`garden.help.${h}`)}>
            <span className="bb-garden-leg">
              <span className="bb-garden-glyph">{HEALTH_GLYPH[h]}</span>
              {t(`garden.health.${h}`)}
            </span>
          </Tooltip>
        ))}
      </div>

      {/* Color toggle: by health or by person */}
      <div className="bb-chipbar">
        <span className="bb-muted small" style={{ alignSelf: "center" }}>{t("garden.colorBy.label")}:</span>
        <button className={`bb-chip-btn ${colorBy === "health" ? "active" : ""}`} onClick={() => setColorBy("health")}>
          {t("garden.colorBy.health")}
        </button>
        <button className={`bb-chip-btn ${colorBy === "user" ? "active" : ""}`} onClick={() => setColorBy("user")}>
          {t("garden.colorBy.user")}
        </button>
      </div>

      {limbs.length === 0 ? (
        /* No branches yet — main is a sprout; the tree grows upward from here. */
        <div className="bb-garden-sprout">
          <div className="bb-garden-sprout-glyph">🌱</div>
          <code className="bb-garden-trunk-name">{data.mainBranch}</code>
          <div className="bb-garden-sprout-title">{t("garden.sproutTitle")}</div>
          <div className="bb-muted small">{t("garden.sproutHint")}</div>
        </div>
      ) : (
        <div className="bb-garden">
          <div className="bb-garden-trunk">
            <span className="bb-garden-trunk-dot" />
            <Tooltip text={t("tooltips.git.main")}>
              <code className="bb-garden-trunk-name">🌳 {data.mainBranch}</code>
            </Tooltip>
            <span className="bb-muted small">{t("garden.trunk")}</span>
          </div>

          <div className="bb-garden-limbs">
            {limbs.map((row) => {
              const health = healthOf(row);
              const user = board.users.find((u) => u.id === row.assignedUserId);
              const open = expanded === row.branchName;
              const detail =
                props.branchDetail && props.branchDetail.branchName === row.branchName
                  ? props.branchDetail
                  : null;
              const color = limbColor(row, health);
              return (
                <div className={`bb-limb health-${health}`} key={row.branchName}>
                  <span className="bb-limb-connector" style={{ background: color }} />
                  <div className="bb-limb-card" style={{ borderLeftColor: color }}>
                    <div className="bb-limb-head">
                      <button className="bb-limb-toggle" onClick={() => toggle(row.branchName)} aria-expanded={open}>
                        {open ? "▾" : "▸"}
                      </button>
                      <Tooltip text={t(`garden.help.${health}`)}>
                        <span className="bb-garden-glyph">{HEALTH_GLYPH[health]}</span>
                      </Tooltip>
                      <Tooltip text={row.branchName}>
                        <code className="bb-limb-name" onClick={() => props.onCopy(row.branchName, t("cc.flow.branchCopied"))}>
                          {row.info.current ? "● " : ""}
                          {row.branchName}
                        </code>
                      </Tooltip>
                      {user && (
                        <span className="bb-avatar sm" style={{ background: user.color }} title={user.name}>
                          {user.avatarText}
                        </span>
                      )}
                      <div className="bb-topbar-spacer" />
                      <span className="bb-muted small">↑{row.info.commitsAheadMain} ↓{row.info.commitsBehindMain}</span>
                      <span className="bb-muted small">{relativeTime(row.info.lastCommitAt, timeLabels())}</span>
                    </div>

                    <div className="bb-limb-meta">
                      {row.taskTitle ? (
                        <span className="bb-flow-task clickable" onClick={() => row.taskId && props.onOpenTask(row.taskId)}>
                          {row.taskTitle}
                        </span>
                      ) : (
                        <span className="bb-flow-task muted">{t("cc.flow.noTaskLabel")}</span>
                      )}
                      <div className="bb-topbar-spacer" />
                      {!row.info.current && row.info.existsLocal && (
                        <button className="bb-btn ghost sm" onClick={() => props.onCheckout(row.branchName)}>
                          {t("branchFlow.checkout")}
                        </button>
                      )}
                      <button className="bb-btn ghost sm" onClick={() => props.onOpenBranch(row)}>
                        {t("branchFlow.more")}
                      </button>
                    </div>

                    {open && (
                      <div className="bb-limb-leaves">
                        {!detail ? (
                          <div className="bb-muted small">{t("cc.files.loading")}</div>
                        ) : detail.commits.length === 0 ? (
                          <div className="bb-muted small">{t("currentBranch.noCommits")}</div>
                        ) : (
                          detail.commits.map((c) => (
                            <div className="bb-leaf" key={c.hash}>
                              <span className="bb-leaf-dot" />
                              <code className="bb-leaf-hash" onClick={() => props.onCopy(c.hash, c.shortHash)}>
                                {c.shortHash}
                              </code>
                              <span className="bb-leaf-subject">{c.subject}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
