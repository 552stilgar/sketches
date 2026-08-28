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

// `reference` is the loc at which side ≈ maximum / sqrt(2) (~71% of the
// slot's available space). Below it the curve is proportional to sqrt(loc)
// (a 4x loc increase gives ~2x footprint, per the city.json contract);
// above it side keeps rising but only asymptotically approaches maximum, so
// large files stay distinguishable instead of all pinning to the same
// ceiling. The floor is a fraction of `maximum` rather than a fixed
// constant, so it degrades gracefully when maximum itself is small (as low
// as 0.25 for tightly packed districts) instead of swallowing the whole
// range.
export function footprintSide(loc: number, maximum: number, reference = 200): number {
  const safeLoc = Math.max(0, loc);
  const safeMax = Math.max(0, maximum);
  const floor = safeMax * 0.05;
  const scaled = safeMax * (Math.sqrt(safeLoc) / Math.sqrt(safeLoc + reference));
  return Math.min(safeMax, Math.max(floor, scaled));
}
