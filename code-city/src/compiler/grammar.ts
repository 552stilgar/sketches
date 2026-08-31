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
  /** V6 age weathering: MAX age across members with real git history, 0 if none do -- see
   *  BuildingMetrics.age doc comment (src/types.ts) for why max, not sum. */
  age: number;
  /** V5.4 scaffolding: MIN age across members with real git history, 0 if none do -- the
   *  "youngest wing" counterpart to `age`. See BuildingMetrics.newestAge (src/types.ts). */
  newestAge: number;
  /** True iff at least one member has contributors.length > 0. Gates BOTH `age` and
   *  `newestAge` -- neither is a measurement when this is false. */
  ageMeasured: boolean;
  members: RepoNode[];
}

/** RepoNode.contributors is non-empty iff the node has at least one real commit
 *  (docs/CONTRACT-repo-json.md) -- the only signal that distinguishes a genuinely-measured
 *  age from the analyzer's no-commits `age: 0` fallback (src/analyzer/git.ts). */
function hasMeasuredAge(node: RepoNode): boolean {
  return node.contributors.length > 0;
}

/**
 * Aggregates the two age extremes across a building's members, both restricted to members with a
 * real measurement:
 *   - `age`       = MAX -- the "oldest wing", what the V6 weathering overlay reads.
 *   - `newestAge` = MIN -- the "youngest wing", what the V5.4 scaffolding overlay reads
 *                   ("does this building contain a newly-created file", which a single old
 *                   sibling must not wash out).
 *
 * They are two SEPARATE signals because they answer opposite questions; collapsing them into one
 * `age` field silently breaks whichever overlay didn't define it (see docs/CONTRACT-city-json.md
 * "Age extremes"). The `hasMeasuredAge` restriction is what keeps both honest: RepoNode.age is 0
 * both for a file committed today AND for a file with no commits at all (src/analyzer/git.ts
 * `firstDate ? ... : 0`), so an unfiltered MIN would report a never-committed file as "brand new"
 * -- the fabricated-zero failure §5.5 constraint 2 forbids. A building with no measured members
 * reports ageMeasured:false and both numbers 0, which renderers MUST read as UNMEASURED.
 */
function aggregateAge(members: readonly RepoNode[]): {
  age: number;
  newestAge: number;
  ageMeasured: boolean;
} {
  const measured = members.filter(hasMeasuredAge);
  if (measured.length === 0) return { age: 0, newestAge: 0, ageMeasured: false };
  const ages = measured.map((m) => m.age);
  return { age: Math.max(...ages), newestAge: Math.min(...ages), ageMeasured: true };
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

/**
 * The top-level district a FILE path belongs to (as opposed to `topLevelPathOfDir` in
 * `src/compiler/index.ts`, which handles a bare directory string's different no-slash
 * semantics). A no-slash file path is a root-level file and maps to the "." district; extracted
 * standalone so a caller with a plain path string -- rather than a `RepoNode` -- (V5.3b's
 * `RuinRecord.path`, `src/compiler/index.ts`) can reuse the identical derivation `topLevelPath`
 * gives every live node, instead of re-deriving it and risking the two silently diverging.
 */
export function topLevelPathOfFilePath(path: string): string {
  const normalized = normalizePath(path);
  const slash = normalized.indexOf("/");
  return slash < 0 ? "." : normalized.slice(0, slash);
}

export function topLevelPath(node: RepoNode): string {
  return topLevelPathOfFilePath(node.path || node.id);
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
    ...aggregateAge(members),
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
    // One-member building: same aggregation path as a directory building, so a file's age
    // extremes are gated by hasMeasuredAge identically (age === newestAge here by definition).
    ...aggregateAge([node]),
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

/**
 * Minimum footprint side, as a fraction of the slot maximum, that ANY building can render at
 * (loc=0 included). Trade-off: raising this makes the smallest buildings read as visible blocks
 * instead of needle-thin spikes at high building density, at the cost of shrinking the visual
 * *range* between the smallest and largest buildings in a district (a district full of tiny files
 * next to one huge one looks flatter as this rises toward 1).
 *
 * NOTE ON CURRENT BEHAVIOR: the sqrt scale curve below already has its own effective floor of
 * `0.08 * maximum` (the additive term in `0.08 + 0.92 * ...`, hit at loc=0). At the shipped
 * default of 0.05 this constant is strictly dominated by that curve floor and never binds --
 * `Math.max(floor, scaled)` always picks `scaled`. That is a pre-existing tension in the V4
 * formula, not something this change fixes (out of Lane C's scope: it owns exposing the knob, not
 * rebalancing the curve) -- but it does mean the "pin" look observed in the field comes from the
 * 0.08 curve floor, not this constant, and raising THIS constant only starts to visibly widen the
 * smallest buildings once it exceeds 0.08.
 */
export const FOOTPRINT_FLOOR_DEFAULT = 0.05;

export function footprintSide(loc: number, maximum: number, locRef = 200, floorFactor = FOOTPRINT_FLOOR_DEFAULT): number {
  const safeLoc = Math.max(0, loc);
  const safeMax = Math.max(0, maximum);
  const safeFloorFactor = Math.min(1, Math.max(0, floorFactor));
  const floor = safeMax * safeFloorFactor;
  const safeRef = Math.max(1, locRef);
  const scaled = safeMax * (0.08 + 0.92 * Math.min(1, Math.sqrt(safeLoc) / Math.sqrt(safeRef)));
  return Math.min(safeMax, Math.max(floor, scaled));
}
