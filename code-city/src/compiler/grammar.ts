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

/**
 * D4 clone-aware LOD scope (CONTRACTS.md V4, docs/CONTRACT-city-json.md "D4"):
 *   - "district": a clone-participating file exempts its ENTIRE top-level district from
 *     directory-aggregate LOD -- every file in that district keeps file-level granularity. This
 *     is the original V4 behavior and stays the default so omitting the option is bit-for-bit
 *     unchanged.
 *   - "directory": exemption is scoped to the aggregation GROUP the clone file itself would fall
 *     into (the same key `groups` below partitions on -- the file's immediate top-level dir, or
 *     its second-level dir when nested deeper) rather than the whole district. Non-clone-bearing
 *     sibling directories inside the same district still collapse normally.
 */
export type CloneLodScope = "district" | "directory";

/** The aggregation-group key a file falls into past the 500-file threshold -- same key `groups`
 *  below is partitioned on. Exposed standalone so both the clone-exemption pass and the grouping
 *  pass agree on exactly the same key without recomputing it differently in two places. */
function aggregationGroupKey(file: RepoNode): string {
  const filePath = normalizePath(file.path);
  const district = topLevelPath(file);
  const parts = filePath.split("/");
  return district === "." ? filePath : parts.length > 2 ? `${parts[0]}/${parts[1]}` : district;
}

export function selectBuildingSources(
  nodes: readonly RepoNode[],
  opts?: { cloneLodScope?: CloneLodScope },
): BuildingSource[] {
  const cloneLodScope: CloneLodScope = opts?.cloneLodScope ?? "district";
  const files = nodes.filter((node) => node.type === "file").sort(comparePathThenId);
  const toFileSource = (node: RepoNode): BuildingSource => ({
    id: node.id,
    path: normalizePath(node.path || node.id),
    districtPath: topLevelPath(node),
    language: node.language,
    loc: node.loc,
    complexity: node.complexity,
    churn: node.churn,
    members: [node],
  });
  if (files.length <= 500) {
    return files.map(toFileSource);
  }

  const filesByHash = new Map<string, RepoNode[]>();
  for (const file of files) {
    if (file.contentHash === undefined) continue;
    const matches = filesByHash.get(file.contentHash) ?? [];
    matches.push(file);
    filesByHash.set(file.contentHash, matches);
  }
  // Exemption keys: either the whole top-level district ("district" scope, original V4 behavior)
  // or just the aggregation group each clone file itself belongs to ("directory" scope).
  const exemptKeys = new Set<string>();
  for (const matches of filesByHash.values()) {
    if (matches.length < 2) continue;
    for (const file of matches) {
      exemptKeys.add(cloneLodScope === "directory" ? aggregationGroupKey(file) : topLevelPath(file));
    }
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
    const path = aggregationGroupKey(file);
    const district = topLevelPath(file);
    const group = groups.get(path) ?? { districtPath: district, members: [] };
    group.members.push(file);
    groups.set(path, group);
  }
  return [...groups]
    .sort(([a], [b]) => compareCodepoints(a, b))
    .flatMap(([path, { districtPath, members }]) => {
      const exempt = cloneLodScope === "directory" ? exemptKeys.has(path) : exemptKeys.has(districtPath);
      return exempt
        ? [...members].sort(comparePathThenId).map(toFileSource)
        : [aggregate(`directory:${path}`, path, districtPath, members)];
    });
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
