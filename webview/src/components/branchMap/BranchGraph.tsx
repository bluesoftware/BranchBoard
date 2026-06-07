import { useMemo, useState } from "react";
import { BranchMapGraph } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";
import { EmptyState } from "../common/EmptyState";
import { buildGraphLayout, laneColor } from "./graphLayout";

interface Props {
  graph: BranchMapGraph | null;
  loading: boolean;
  /** Click a branch label → open its details. */
  onOpenBranch: (branchName: string) => void;
  /** Click a commit node / row → open commit details. */
  onSelectCommit: (hash: string) => void;
  onCopy: (text: string, label: string) => void;
}

const ROW_H = 32;
const LANE_W = 20;
const PAD_LEFT = 14;
const NODE_R = 5;

/**
 * Real commit-DAG rendered as SVG (lanes for branches, edges for parent links),
 * themed with VS Code colors. Layout is computed by buildGraphLayout().
 */
export function BranchGraph({ graph, loading, onOpenBranch, onSelectCommit, onCopy }: Props) {
  const layout = useMemo(() => (graph ? buildGraphLayout(graph.commits) : null), [graph]);
  const [zoom, setZoom] = useState(1);
  const clampZoom = (z: number) => Math.max(0.5, Math.min(1.6, Math.round(z * 10) / 10));
  const managed = useMemo(() => new Set(graph?.managedBranches ?? []), [graph]);

  if (loading || !graph) {
    return (
      <div className="bb-loading">
        <div className="bb-spinner" />
        <span>{t("branchMap.graphLoading")}</span>
      </div>
    );
  }
  if (graph.error) {
    return <EmptyState title={t("branchMap.noData")} hint={graph.error} />;
  }
  if (!layout || layout.nodes.length === 0) {
    return <EmptyState title={t("branchMap.graphEmpty")} hint={t("branchMap.subtitle")} />;
  }

  const graphW = PAD_LEFT + layout.laneCount * LANE_W + 8;
  const height = layout.nodes.length * ROW_H + 16;
  const cx = (lane: number) => PAD_LEFT + lane * LANE_W + LANE_W / 2;
  const cy = (row: number) => row * ROW_H + ROW_H / 2 + 8;
  const textX = graphW + 8;
  const contentW = graphW + 520;

  return (
    <div className="bb-graph-container">
      <div className="bb-graph-toolbar">
        <button className="bb-btn ghost sm" onClick={() => setZoom((z) => clampZoom(z - 0.1))} aria-label="-">
          −
        </button>
        <span className="bb-graph-zoomval">{Math.round(zoom * 100)}%</span>
        <button className="bb-btn ghost sm" onClick={() => setZoom((z) => clampZoom(z + 0.1))} aria-label="+">
          +
        </button>
        <button className="bb-btn ghost sm" onClick={() => setZoom(1)}>
          {t("branchMap.fitToScreen")}
        </button>
      </div>

      <div className="bb-graph-wrap">
        <div style={{ width: contentW * zoom, height: height * zoom }}>
          <div
            className="bb-graph-canvas"
            style={{ width: contentW, height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            <svg className="bb-graph-svg" width={graphW} height={height} role="img" aria-label={t("branchMap.graph")}>
              {layout.edges.map((e, i) => {
                const x1 = cx(e.fromLane);
                const y1 = cy(e.fromRow);
                const x2 = cx(e.toLane);
                const y2 = cy(e.toRow);
                const my = (y1 + y2) / 2;
                const d =
                  x1 === x2
                    ? `M ${x1} ${y1} L ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
                return <path key={i} d={d} stroke={laneColor(e.lane)} strokeWidth={1.6} fill="none" opacity={0.8} />;
              })}
              {layout.nodes.map((n) => {
                const isCurrentTip = n.branches.includes(graph.currentBranch ?? "__none__");
                const isManagedTip = n.branches.some((b) => managed.has(b));
                const emphasized = isCurrentTip || isManagedTip;
                return (
                  <circle
                    key={n.hash}
                    className="bb-graph-node"
                    cx={cx(n.lane)}
                    cy={cy(n.row)}
                    r={emphasized ? NODE_R + 1.5 : NODE_R}
                    fill={laneColor(n.lane)}
                    stroke={isCurrentTip ? "var(--bb-text)" : isManagedTip ? "var(--bb-warning)" : "var(--bb-bg)"}
                    strokeWidth={emphasized ? 2 : 1.5}
                    onClick={() => onSelectCommit(n.hash)}
                  >
                    <title>{`${n.shortHash} · ${n.subject}`}</title>
                  </circle>
                );
              })}
            </svg>

            {layout.nodes.map((n) => (
              <div
                className="bb-graph-row"
                key={n.hash}
                style={{ top: cy(n.row) - ROW_H / 2, height: ROW_H, left: textX, width: contentW - textX - 14 }}
                title={`${n.shortHash} · ${n.author} · ${formatDate(n.date)}`}
              >
                {n.branches.map((b) => (
                  <button
                    key={b}
                    className={`bb-graph-branch ${b === graph.currentBranch ? "current" : ""} ${
                      managed.has(b) ? "managed" : ""
                    }`}
                    onClick={() => onOpenBranch(b)}
                  >
                    {b.replace(/^origin\//, "↟")}
                  </button>
                ))}
                <code className="bb-graph-hash" onClick={() => onCopy(n.hash, n.shortHash)}>
                  {n.shortHash}
                </code>
                <span className="bb-graph-subject" onClick={() => onSelectCommit(n.hash)}>
                  {n.subject}
                </span>
                <span className="bb-graph-author">{n.author}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
