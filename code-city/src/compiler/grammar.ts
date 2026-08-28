import type { RepoNode } from "../types.ts";
import { compareCodepoints, comparePathThenId } from "../util/compare.ts";

export interface BuildingSource {
  id: string;
  path: string;
  districtPath: string;
  language: string;
  loc: number;
  complexity: number;
  churn: number;
  members: RepoNode[];
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

export function topLevelPath(node: RepoNode): string {
  const path = normalizePath(node.path || node.id);
  const slash = path.indexOf("/");
  return slash < 0 ? "." : path.slice(0, slash);
}

export function dominantLanguage(nodes: readonly RepoNode[]): string {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.language, (counts.get(node.language) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || compareCodepoints(a[0], b[0]))[0]?.[0] ?? "unknown";
}

function aggregate(id: string, path: string, districtPath: string, members: RepoNode[]): BuildingSource {
  return {
    id,
    path,
    districtPath,
    language: dominantLanguage(members),
    loc: members.reduce((sum, node) => sum + node.loc, 0),
    complexity: members.reduce((sum, node) => sum + node.complexity, 0),
    churn: members.reduce((sum, node) => sum + node.churn, 0),
    members,
  };
}

export function selectBuildingSources(nodes: readonly RepoNode[]): BuildingSource[] {
  const files = nodes.filter((node) => node.type === "file").sort(comparePathThenId);
  if (files.length <= 500) {
    return files.map((node) => ({
      id: node.id,
      path: normalizePath(node.path || node.id),
      districtPath: topLevelPath(node),
      language: node.language,
      loc: node.loc,
      complexity: node.complexity,
      churn: node.churn,
      members: [node],
    }));
  }

  // Aggregate into one building per top-level directory (or per
  // second-level directory when a top-level dir nests deeper), so building
  // count stays well below file count. Flat top-level files (no directory
  // at all, districtPath === ".") have no directory to roll up into --
  // grouping them by their own path instead of collapsing them all onto a
  // shared "." key keeps a repo's top-level files distinguishable instead
  // of erasing every one of them into a single building.
  const groups = new Map<string, { districtPath: string; members: RepoNode[] }>();
  for (const file of files) {
    const filePath = normalizePath(file.path);
    const district = topLevelPath(file);
    const parts = filePath.split("/");
    const path = district === "." ? filePath : parts.length > 2 ? `${parts[0]}/${parts[1]}` : district;
    const group = groups.get(path) ?? { districtPath: district, members: [] };
    group.members.push(file);
    groups.set(path, group);
  }
  return [...groups]
    .sort(([a], [b]) => compareCodepoints(a, b))
    .map(([path, { districtPath, members }]) => aggregate(`directory:${path}`, path, districtPath, members));
}

/** Nearest-rank 95th percentile, floored at 1. Does not mutate the input. */
export function p95(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(sorted.length * 0.95);
  return Math.max(1, sorted[rank - 1]);
}

export function footprintSide(loc: number, maximum: number, locRef = 200): number {
  const safeLoc = Math.max(0, loc);
  const safeMax = Math.max(0, maximum);
  const floor = safeMax * 0.05;
  const safeRef = Math.max(1, locRef);
  const scaled = safeMax * (0.08 + 0.92 * Math.min(1, Math.sqrt(safeLoc) / Math.sqrt(safeRef)));
  return Math.min(safeMax, Math.max(floor, scaled));
}
