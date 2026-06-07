import { BranchMapCommit } from "../../types";

/** A laid-out commit node ready for SVG rendering. */
export interface GraphNode {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  branches: string[];
  row: number; // y index (time order)
  lane: number; // x index
}

/** A connection from a commit to one of its parents. */
export interface GraphEdge {
  fromHash: string;
  toHash: string;
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  /** Lane that colours the edge (the child's lane). */
  lane: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
}

/**
 * Assign lanes to commits using a compact variant of the classic git-graph
 * algorithm. Commits are processed newest-first (the order git returns with
 * --date-order). Each "active lane" tracks the hash it next expects; the first
 * parent continues the commit's lane, extra parents get/!reuse other lanes.
 *
 * This produces a real DAG layout (branches as separate columns, merges as
 * edges joining lanes) — not just one row per branch.
 */
export function buildGraphLayout(commits: BranchMapCommit[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  // lanes[i] = the commit hash expected next in lane i, or null if free.
  const lanes: (string | null)[] = [];
  const laneOf = new Map<string, number>();
  let laneCount = 0;

  const firstFreeLane = (): number => {
    const idx = lanes.indexOf(null);
    if (idx >= 0) {
      return idx;
    }
    lanes.push(null);
    return lanes.length - 1;
  };

  commits.forEach((commit, row) => {
    // Find the lane reserved for this commit; otherwise open a new one (a tip).
    let lane = laneOf.has(commit.hash) ? laneOf.get(commit.hash)! : -1;
    if (lane === -1) {
      lane = firstFreeLane();
    }
    lanes[lane] = null; // this commit consumes its reservation
    laneOf.delete(commit.hash);
    laneCount = Math.max(laneCount, lane + 1);

    nodes.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      author: commit.author,
      date: commit.date,
      branches: commit.branches,
      row,
      lane,
    });

    commit.parents.forEach((parent, pIndex) => {
      let parentLane: number;
      if (laneOf.has(parent)) {
        // Parent already reserved elsewhere → merge edge into that lane.
        parentLane = laneOf.get(parent)!;
      } else if (pIndex === 0) {
        // First parent continues this commit's lane.
        parentLane = lane;
        lanes[lane] = parent;
        laneOf.set(parent, lane);
      } else {
        // Additional parents branch off into a free lane.
        parentLane = firstFreeLane();
        lanes[parentLane] = parent;
        laneOf.set(parent, parentLane);
      }
      laneCount = Math.max(laneCount, parentLane + 1);
      edges.push({
        fromHash: commit.hash,
        toHash: parent,
        fromLane: lane,
        toLane: parentLane,
        fromRow: row,
        toRow: -1, // resolved below
        lane: Math.max(lane, parentLane),
      });
    });
  });

  // Resolve parent rows now that all nodes are placed (parents that exist).
  const rowOf = new Map(nodes.map((n) => [n.hash, n.row]));
  const resolved = edges.filter((e) => rowOf.has(e.toHash));
  for (const e of resolved) {
    e.toRow = rowOf.get(e.toHash)!;
  }

  return { nodes, edges: resolved, laneCount: Math.max(1, laneCount) };
}

/** Stable lane colours, themed via CSS variables defined in styles.css. */
export const LANE_COLORS = [
  "var(--bb-lane-0)",
  "var(--bb-lane-1)",
  "var(--bb-lane-2)",
  "var(--bb-lane-3)",
  "var(--bb-lane-4)",
  "var(--bb-lane-5)",
  "var(--bb-lane-6)",
  "var(--bb-lane-7)",
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}
