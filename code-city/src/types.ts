// Code City — shared schemas + runtime validators.
//
// This file is the actual contract between the three pipeline stages (see CONTRACTS.md and
// docs/CONTRACT-repo-json.md / docs/CONTRACT-city-json.md for the prose spec). The two
// validators here are load-bearing: every CLI in bin/ runs its output through the matching
// validator before writing a file, and tests/types.test.ts gates the validators themselves.

// ---------------------------------------------------------------------------------------------
// repo.json — RepoGraph
// ---------------------------------------------------------------------------------------------

export type NodeType = "repo" | "package" | "module" | "file" | "class" | "function";

export const NODE_TYPES: readonly NodeType[] = ["repo", "package", "module", "file", "class", "function"];

export interface RepoNode {
  id: string;
  type: NodeType;
  language: string;
  name: string;
  path: string;
  loc: number;
  complexity: number;
  churn: number;
  age: number;
  contributors: string[];
  imports: string[];
  calls: string[];
  contains: string[];
}

export interface RepoGraph {
  nodes: RepoNode[];
  repoPath: string;
  headSha: string;
  headDate: string;
}

// ---------------------------------------------------------------------------------------------
// city.json — CityModel
// ---------------------------------------------------------------------------------------------

export interface District {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  style: string;
}

export interface BuildingMetrics {
  loc: number;
  complexity: number;
  churn: number;
}

export interface Building {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  style: string;
  metrics: BuildingMetrics;
}

export interface Road {
  from: string;
  to: string;
  /**
   * Structural edge multiplicity: how many (source node, resolved target) pairs across this
   * road's endpoints route along it, counting `imports[]` and `calls[]` alike. Integer >= 1.
   *
   * Optional in the TYPE so the field can land ahead of the compiler that emits it, but the
   * compiler MUST emit it (docs/CONTRACT-city-json.md, "Road weight"). Renderers treat a
   * missing weight as 1 — an unweighted road, never a zero-traffic one (PROJECT_IDEA §5.5:
   * unmeasured must never render as quiet).
   */
  weight?: number;
}

export interface Landmark {
  id: string;
  x: number;
  y: number;
  kind: string;
}

export interface CityModel {
  districts: District[];
  buildings: Building[];
  roads: Road[];
  landmarks: Landmark[];
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateRepoGraph(x: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(x)) {
    return { ok: false, errors: ["RepoGraph must be an object"] };
  }
  const g = x;

  if (!isNonEmptyString(g.repoPath)) errors.push("repoPath must be a non-empty string");
  if (!isNonEmptyString(g.headSha)) errors.push("headSha must be a non-empty string");
  if (!isNonEmptyString(g.headDate) || Number.isNaN(Date.parse(g.headDate))) {
    errors.push("headDate must be a non-empty ISO-8601 date string");
  }

  if (!Array.isArray(g.nodes)) {
    errors.push("nodes must be an array");
    return { ok: false, errors };
  }

  const seenIds = new Set<string>();

  g.nodes.forEach((raw: unknown, i: number) => {
    if (!isPlainObject(raw)) {
      errors.push(`nodes[${i}] must be an object`);
      return;
    }
    const n = raw;
    const label = isNonEmptyString(n.id) ? `node "${n.id}"` : `nodes[${i}]`;

    if (!isNonEmptyString(n.id)) {
      errors.push(`nodes[${i}]: missing/invalid id`);
    } else if (seenIds.has(n.id)) {
      errors.push(`duplicate node id: "${n.id}"`);
    } else {
      seenIds.add(n.id);
    }

    if (!isNonEmptyString(n.type) || !NODE_TYPES.includes(n.type as NodeType)) {
      errors.push(`${label}: type must be one of ${NODE_TYPES.join(", ")}`);
    }
    if (!isNonEmptyString(n.language)) errors.push(`${label}: missing/invalid language`);
    if (!isNonEmptyString(n.name)) errors.push(`${label}: missing/invalid name`);
    if (!isNonEmptyString(n.path)) errors.push(`${label}: missing/invalid path`);
    if (!isFiniteNumber(n.loc) || n.loc < 0) errors.push(`${label}: loc must be a non-negative number`);
    if (!isFiniteNumber(n.complexity) || n.complexity < 0) {
      errors.push(`${label}: complexity must be a non-negative number`);
    }
    if (!isFiniteNumber(n.churn) || n.churn < 0) errors.push(`${label}: churn must be a non-negative number`);
    if (!isFiniteNumber(n.age) || n.age < 0) errors.push(`${label}: age must be a non-negative number`);
    if (!isStringArray(n.contributors)) errors.push(`${label}: contributors must be a string[]`);
    if (!isStringArray(n.imports)) errors.push(`${label}: imports must be a string[]`);
    if (!isStringArray(n.calls)) errors.push(`${label}: calls must be a string[]`);
    if (!isStringArray(n.contains)) errors.push(`${label}: contains must be a string[]`);
  });

  return { ok: errors.length === 0, errors };
}

export function validateCity(x: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(x)) {
    return { ok: false, errors: ["CityModel must be an object"] };
  }
  const c = x;

  if (!Array.isArray(c.districts)) errors.push("districts must be an array");
  if (!Array.isArray(c.buildings)) errors.push("buildings must be an array");
  if (!Array.isArray(c.roads)) errors.push("roads must be an array");
  if (!Array.isArray(c.landmarks)) errors.push("landmarks must be an array");
  if (errors.length > 0) return { ok: false, errors };

  const districts = c.districts as unknown[];
  const buildings = c.buildings as unknown[];
  const roads = c.roads as unknown[];
  const landmarks = c.landmarks as unknown[];

  const districtIds = new Set<string>();
  districts.forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      errors.push(`districts[${i}] must be an object`);
      return;
    }
    const d = raw;
    const label = isNonEmptyString(d.id) ? `district "${d.id}"` : `districts[${i}]`;
    if (!isNonEmptyString(d.id)) {
      errors.push(`districts[${i}]: missing/invalid id`);
    } else if (districtIds.has(d.id)) {
      errors.push(`duplicate district id: "${d.id}"`);
    } else {
      districtIds.add(d.id);
    }
    if (!isNonEmptyString(d.name)) errors.push(`${label}: missing/invalid name`);
    for (const f of ["x", "y", "width", "depth"] as const) {
      if (!isFiniteNumber(d[f])) errors.push(`${label}: ${f} must be a number`);
    }
    if (!isNonEmptyString(d.style)) errors.push(`${label}: missing/invalid style`);
  });

  const buildingIds = new Set<string>();
  buildings.forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      errors.push(`buildings[${i}] must be an object`);
      return;
    }
    const b = raw;
    const label = isNonEmptyString(b.id) ? `building "${b.id}"` : `buildings[${i}]`;
    if (!isNonEmptyString(b.id)) {
      errors.push(`buildings[${i}]: missing/invalid id`);
    } else if (buildingIds.has(b.id)) {
      errors.push(`duplicate building id: "${b.id}"`);
    } else {
      buildingIds.add(b.id);
    }
    for (const f of ["x", "y", "width", "depth", "height"] as const) {
      if (!isFiniteNumber(b[f])) errors.push(`${label}: ${f} must be a number`);
    }
    if (!isNonEmptyString(b.style)) errors.push(`${label}: missing/invalid style`);
    if (!isPlainObject(b.metrics)) {
      errors.push(`${label}: metrics must be an object`);
    } else {
      const m = b.metrics;
      for (const f of ["loc", "complexity", "churn"] as const) {
        if (!isFiniteNumber(m[f])) errors.push(`${label}: metrics.${f} must be a number`);
      }
    }
  });

  roads.forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      errors.push(`roads[${i}] must be an object`);
      return;
    }
    const r = raw;
    if (!isNonEmptyString(r.from)) {
      errors.push(`roads[${i}]: missing/invalid from`);
    } else if (!buildingIds.has(r.from)) {
      errors.push(`roads[${i}]: from references unknown building id "${r.from}"`);
    }
    if (!isNonEmptyString(r.to)) {
      errors.push(`roads[${i}]: missing/invalid to`);
    } else if (!buildingIds.has(r.to)) {
      errors.push(`roads[${i}]: to references unknown building id "${r.to}"`);
    }
    if (r.weight !== undefined && (!isFiniteNumber(r.weight) || !Number.isInteger(r.weight) || r.weight < 1)) {
      errors.push(`roads[${i}]: weight must be an integer >= 1 when present`);
    }
  });

  landmarks.forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      errors.push(`landmarks[${i}] must be an object`);
      return;
    }
    const l = raw;
    if (!isNonEmptyString(l.id)) errors.push(`landmarks[${i}]: missing/invalid id`);
    if (!isFiniteNumber(l.x) || !isFiniteNumber(l.y)) errors.push(`landmarks[${i}]: x/y must be numbers`);
    if (!isNonEmptyString(l.kind)) errors.push(`landmarks[${i}]: missing/invalid kind`);
  });

  return { ok: errors.length === 0, errors };
}
