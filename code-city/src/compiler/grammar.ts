import type { RepoNode } from "../types.ts";

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
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "unknown";
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
  const files = nodes.filter((node) => node.type === "file").sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
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

  const explicitDirectories = nodes
    .filter((node) => node.type === "package" || node.type === "module")
    .filter((node) => normalizePath(node.path).split("/").length === 2)
    .sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));

  if (explicitDirectories.length > 0) {
    return explicitDirectories.map((directory) => {
      const directoryPath = normalizePath(directory.path);
      const members = files.filter((file) => {
        const filePath = normalizePath(file.path);
        return filePath === directoryPath || filePath.startsWith(`${directoryPath}/`);
      });
      return aggregate(directory.id, directoryPath, topLevelPath(directory), members.length > 0 ? members : [directory]);
    });
  }

  const groups = new Map<string, RepoNode[]>();
  for (const file of files) {
    const district = topLevelPath(file);
    const parts = normalizePath(file.path).split("/");
    const path = parts.length > 2 ? `${parts[0]}/${parts[1]}` : district;
    const group = groups.get(path) ?? [];
    group.push(file);
    groups.set(path, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, members]) => aggregate(`directory:${path}`, path, path.split("/")[0] ?? ".", members));
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
