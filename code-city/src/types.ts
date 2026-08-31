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
  /**
   * Lowercase hex sha256 of the file's raw bytes (V4 contract D3, "exact content hash only" —
   * see CONTRACTS.md § "V4: datastores + clone identity"). Optional because this field lands
   * ahead of the analyzer stage that fills it in (src/analyzer/content-hash.ts) — absent means
   * NOT HASHED, never "no clones found" (PROJECT_IDEA.md 5.5: constraint 2, never fabricate,
   * applies to absence of a signal as much as to a value). Only "file"-type nodes are expected
   * to carry this; it is meaningless for aggregate node types.
   */
  contentHash?: string;
  /**
   * Count of `TODO`/`FIXME` marker occurrences in this file's tracked source (V5 — see
   * CONTRACTS.md § "V5: TODO density" and docs/CONTRACT-repo-json.md § "TODO density"). Optional
   * because it is only meaningful where the analyzer actually scans the file's text: a file in a
   * language the analyzer does not statically support gets NO real read of its source for this
   * purpose, so it must report `undefined` (NOT MEASURED), never `0` — a `0` would read as "this
   * file is clean", a fabricated measurement (PROJECT_IDEA.md 5.5, constraint 2, never fabricate,
   * applies to absence of a signal as much as to a value). A supported-language file with no
   * markers legitimately reports `0` — that is a real measurement, not an absence.
   */
  todoCount?: number;
}

/**
 * One detected schema/migration-backed datastore (V4 contract D1, "Datastore detection" —
 * docs/CONTRACT-repo-json.md). The single definition — `src/analyzer/datastores.ts` re-exports
 * this rather than declaring a second copy that could drift from the RepoGraph field below.
 */
export interface DatastoreSpec {
  /** Stable id for this datastore, derived from `dir`: `datastore:<dir>` (`datastore:.` for a
   *  bare schema.sql sitting at the repo root, mirroring the "." root-district convention
   *  `topLevelPath` already uses for flat top-level files -- see src/compiler/grammar.ts). */
  id: string;
  /** Repo-relative directory this datastore's tracked schema/migrations live under. Empty
   *  string means the repo root (a bare `schema.sql` with no directory component). */
  dir: string;
  /** Table count, derived from tracked schema source (never a live .db file) -- feeds
   *  Landmark.weight for kind "datastore" (docs/CONTRACT-city-json.md). */
  tableCount: number;
  /** Count of tracked `*.sql` files under a "migrations" directory for this datastore (0 if this
   *  datastore was detected from a bare `schema.sql` instead). */
  migrationCount: number;
}

/**
 * One RUIN (V5.3): a source file that was REMOVED from the tracked tree inside the HEAD-anchored
 * analysis window and is still absent at HEAD — see `docs/CONTRACT-repo-json.md` § "Ruins (V5.3)"
 * and `src/analyzer/ruins.ts`, whose header carries the full design rationale.
 *
 * **Deliberately not a `RepoNode`.** A deleted file has no current `loc`, `complexity`, `churn`,
 * `age`, `contributors`, `imports`, `calls`, `contentHash`, or place in the tree — every one of
 * those is UNMEASURED, not zero. Modelling a ruin as a node would force seven fabricated zeros
 * that a consumer could not tell apart from a real, tiny, quiet, brand-new file (PROJECT_IDEA.md
 * §5.5 constraint 2, and the deleted commit-prefix churn heuristic `318773d` this project already
 * had to undo). Ruins live in their own array with their own type so `nodes` can never yield one
 * by accident, and the fields git genuinely knows are the only fields that exist here.
 */
export interface RuinRecord {
  /** Repo-relative POSIX path the file occupied when it was removed — its LAST KNOWN path, in the
   *  same id space live node ids use. A real measurement: git records it exactly. Never collides
   *  with a live node id (a path tracked at HEAD is a live file, not a ruin). */
  path: string;
  /** Language derived from `path`'s extension by the same `languageForPath` a live node gets
   *  (`src/analyzer/scanner.ts`) — a pure function of the path, nothing historical inferred. */
  language: string;
  /** Full sha of the commit that removed the file. */
  deletedSha: string;
  /** ISO-8601 committer date of `deletedSha`. Inside the window `[headDate - 90d, headDate]`. */
  deletedDate: string;
  /**
   * Line count of the file's content at the commit immediately BEFORE `deletedSha` — an
   * explicitly HISTORICAL measurement, taken with the same `countLines` (`src/analyzer/loc.ts`)
   * that produces a live node's `loc`, but at a different instant than `headDate`. Optional
   * because it is genuinely not always obtainable: the deleting commit may be a root commit with
   * no parent to read, or the blob may be unreadable or binary. Absent means NOT MEASURED — never
   * `0`, which would read as "the file was empty when it died" (§5.5 constraint 2). A file that
   * really was empty at deletion reports a real `0`.
   */
  lastLoc?: number;
}

export interface RepoGraph {
  nodes: RepoNode[];
  repoPath: string;
  headSha: string;
  headDate: string;
  /**
   * Datastores detected from tracked schema/migration source (V4 contract D1). Optional because
   * this field lands ahead of the analyzer stage that fills it in — absent means NOT DETECTED,
   * never "no datastores exist" (PROJECT_IDEA.md 5.5: constraint 2, never fabricate, applies to
   * absence of a signal as much as to a value). `mergeRepoGraphs` must carry this field through,
   * namespaced the same way node ids are — see CONTRACTS.md § "V4: datastores + clone identity".
   */
  datastores?: DatastoreSpec[];
  /**
   * Source files removed from the tracked tree within the HEAD-anchored analysis window (V5.3 —
   * see `RuinRecord` above). Optional because it lands ahead of any consumer: absent means NOT
   * MEASURED (nobody looked for deletions), never "nothing was demolished" — an empty array is
   * the finding that the window really held no deletions. `mergeRepoGraphs` must carry this
   * field through, namespaced the same way node ids and datastore dirs are.
   */
  ruins?: RuinRecord[];
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
  /**
   * Days from the building's YOUNGEST member file's first commit to `RepoGraph.headDate` --
   * `compileCity`'s aggregate of `RepoNode.age` (src/compiler/grammar.ts `aggregate`/
   * `toFileSource`; min across `members`, not sum, because what a "recently added" overlay
   * (src/renderer/props.ts scaffolding, V5.4) needs from a multi-file building is "does this
   * location contain a newly-created file", not a blended average age that a single old sibling
   * file would immediately wash out).
   *
   * Optional in the TYPE so a `city.json` compiled before this field shipped stays valid --
   * exactly the `Road.weight` precedent above ("Optional in the TYPE so the field can land ahead
   * of the compiler that emits it, but the compiler MUST emit it"): `compileCity` always emits a
   * real value for every building (`RepoNode.age` is a required, always-measured field --
   * src/analyzer/git.ts `readFileGitMetrics` computes it from git history alone, independent of
   * language support, so no "unsupported language" absence case exists for it the way it does for
   * `todoCount`). A renderer reading an OLDER, pre-migration `city.json` off disk sees `age`
   * missing and MUST treat that as UNMEASURED, never as age `0` -- a missing value reading as
   * "brand new" is exactly the fabricated-zero failure PROJECT_IDEA.md §5.5 constraint 2 (and the
   * deleted commit-prefix churn heuristic, `318773d`) already ruled out for every other signal in
   * this pipeline.
   */
  age?: number;
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
  /**
   * Open string by design — a landmark kind is whatever a future analyzer signal produces.
   * V4 emits exactly one kind: "datastore", detected from tracked schema/migration source
   * (docs/CONTRACT-repo-json.md § "Datastore detection", V4 contract D1). Any other kind string
   * is legal shape-wise but has no defined renderer treatment yet.
   */
  kind: string;
  /** Display label, e.g. a datastore's directory-derived name ("auth-db"). Optional so the
   *  field can land ahead of a producer that always fills it. */
  label?: string;
  /**
   * Scale signal for the renderer, meaning defined per `kind`. For "datastore", this is TABLE
   * COUNT — derived from tracked schema (migration files / schema.sql), never from a live .db
   * file's size or row counts (V4 contract D1: sizing a landmark from a runtime artifact would
   * make the city rearrange on every app restart, breaking the determinism constraint).
   */
  weight?: number;
}

/**
 * A CLONE IDENTITY link (V4 contract D2/D3): a group of 2+ buildings whose source files are
 * byte-identical (sha256 over raw content — D3, exact hash only, no near-duplicate fuzzing).
 * This is deliberately NOT a Road: a road asserts traffic, and vendored copies carry zero
 * traffic between them by construction — that is the entire finding an identityLink exists to
 * show (CONTRACTS.md § "V4", D2). Renderers give identityLinks their own visual channel
 * (src/renderer/tethers.ts) distinct from roads: elevated, static, no motion.
 */
export interface IdentityLink {
  /** Lowercase hex sha256 of the shared content — the grouping key. */
  hash: string;
  /** Building ids that share this hash. Always 2 or more (a single match is not a clone group).
   *  Sorted by codepoint (compareCodepoints, src/util/compare.ts) for determinism. */
  members: string[];
}

export interface CityModel {
  districts: District[];
  buildings: Building[];
  roads: Road[];
  landmarks: Landmark[];
  /**
   * Byte-identical content clusters across the whole city. `compileCity` MUST always emit this
   * array (possibly empty) — same discipline as `Road.weight` (docs/CONTRACT-city-json.md,
   * "Road weight"): required in this TYPE because a producer always has an answer, but
   * `validateCity` treats a MISSING `identityLinks` key as legal on read (defaults to `[]`) so
   * every `city.json` written before V4 still validates unchanged.
   */
  identityLinks: IdentityLink[];
}

// ---------------------------------------------------------------------------------------------
// timeline.json — TimelineManifest (Phase 4, "git time-travel" — see CONTRACTS.md § "Timeline
// manifest (Phase 4)")
// ---------------------------------------------------------------------------------------------

/**
 * One resolved monthly snapshot in a scrubbable sequence: `src/compiler/sequence.ts`'s
 * `buildTimelineManifest()` is the sole producer, `bin/sequence.ts` writes it, and
 * `src/renderer/timeline.ts` is the sole consumer (fetches `cityFile` alongside this manifest).
 */
export interface TimelineEntry {
  /** "YYYY-MM", unique across the manifest, ascending order. */
  month: string;
  /** ISO-8601 commit date this snapshot is anchored to (RepoGraph.headDate, carried through
   *  compileCity unchanged) -- the renderer's date HUD reads this, never wall-clock "now". */
  date: string;
  /** Filename of this month's compiled CityModel, relative to the same directory as
   *  timeline.json (e.g. "city-2026-01.json"). */
  cityFile: string;
  buildingCount: number;
  districtCount: number;
  /**
   * True when this entry's month is NOT the calendar month immediately following the previous
   * entry's month -- i.e. one or more months with no qualifying commit were skipped between them
   * (src/analyzer/snapshots.ts never fabricates an empty/interpolated graph for a missing month).
   * Always false for the first entry (nothing precedes it to be a gap from). A renderer scrubbing
   * across a `gapBefore: true` boundary MUST NOT morph smoothly across it (never-fabricate,
   * extended to time) -- see CONTRACTS.md.
   */
  gapBefore: boolean;
}

export interface TimelineManifest {
  entries: TimelineEntry[];
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

// Lowercase hex sha256 digest -- shared shape check for RepoNode.contentHash and
// IdentityLink.hash (V4 contract D3: exact content hash only, no other hash form accepted).
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function isSha256Hex(v: unknown): v is string {
  return typeof v === "string" && SHA256_HEX_RE.test(v);
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
    if (n.contentHash !== undefined && !isSha256Hex(n.contentHash)) {
      errors.push(`${label}: contentHash must be a lowercase hex sha256 string when present`);
    }
    if (n.todoCount !== undefined && (!isFiniteNumber(n.todoCount) || n.todoCount < 0 || !Number.isInteger(n.todoCount))) {
      errors.push(`${label}: todoCount must be a non-negative integer when present`);
    }
  });

  if (g.datastores !== undefined) {
    if (!Array.isArray(g.datastores)) {
      errors.push("datastores must be an array when present");
    } else {
      (g.datastores as unknown[]).forEach((raw, i) => {
        if (!isPlainObject(raw)) {
          errors.push(`datastores[${i}] must be an object`);
          return;
        }
        const d = raw;
        const label = isNonEmptyString(d.id) ? `datastore "${d.id}"` : `datastores[${i}]`;
        if (!isNonEmptyString(d.id)) errors.push(`datastores[${i}]: missing/invalid id`);
        if (typeof d.dir !== "string") errors.push(`${label}: dir must be a string`);
        if (!isFiniteNumber(d.tableCount) || d.tableCount < 0 || !Number.isInteger(d.tableCount)) {
          errors.push(`${label}: tableCount must be a non-negative integer`);
        }
        if (!isFiniteNumber(d.migrationCount) || d.migrationCount < 0 || !Number.isInteger(d.migrationCount)) {
          errors.push(`${label}: migrationCount must be a non-negative integer`);
        }
      });
    }
  }

  // ruins (V5.3): absent is always legal — it means nobody looked for deletions. An empty array
  // is a different (and stronger) statement: the window really held none.
  if (g.ruins !== undefined) {
    if (!Array.isArray(g.ruins)) {
      errors.push("ruins must be an array when present");
    } else {
      const seenRuinPaths = new Set<string>();
      (g.ruins as unknown[]).forEach((raw, i) => {
        if (!isPlainObject(raw)) {
          errors.push(`ruins[${i}] must be an object`);
          return;
        }
        const r = raw;
        const label = isNonEmptyString(r.path) ? `ruin "${r.path}"` : `ruins[${i}]`;
        if (!isNonEmptyString(r.path)) {
          errors.push(`ruins[${i}]: path must be a non-empty string`);
        } else if (seenRuinPaths.has(r.path)) {
          errors.push(`duplicate ruin path: "${r.path}"`);
        } else {
          seenRuinPaths.add(r.path);
          // A path cannot be both demolished and standing. This is not the referential-integrity
          // checking this validator deliberately skips for imports/calls — it is a direct
          // contradiction inside one document, and it is exactly what a broken rename-detection
          // or re-add filter would produce.
          if (seenIds.has(r.path)) {
            errors.push(`${label}: path is also a live node id — a file cannot be both a ruin and a node`);
          }
        }
        if (!isNonEmptyString(r.language)) errors.push(`${label}: language must be a non-empty string`);
        if (!isNonEmptyString(r.deletedSha)) errors.push(`${label}: deletedSha must be a non-empty string`);
        if (!isNonEmptyString(r.deletedDate) || Number.isNaN(Date.parse(r.deletedDate as string))) {
          errors.push(`${label}: deletedDate must be a non-empty ISO-8601 date string`);
        }
        if (r.lastLoc !== undefined && (!isFiniteNumber(r.lastLoc) || r.lastLoc < 0 || !Number.isInteger(r.lastLoc))) {
          errors.push(`${label}: lastLoc must be a non-negative integer when present`);
        }
      });
    }
  }

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
      // age is OPTIONAL (see BuildingMetrics.age doc comment) -- absence is legal (a
      // pre-migration city.json), but a PRESENT value must still be a real, non-negative
      // measurement, same discipline every other numeric metric here gets.
      if (m.age !== undefined && (!isFiniteNumber(m.age) || m.age < 0)) {
        errors.push(`${label}: metrics.age must be a non-negative number when present`);
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
    if (l.label !== undefined && !isNonEmptyString(l.label)) {
      errors.push(`landmarks[${i}]: label must be a non-empty string when present`);
    }
    if (l.weight !== undefined && (!isFiniteNumber(l.weight) || l.weight < 0)) {
      errors.push(`landmarks[${i}]: weight must be a non-negative number when present`);
    }
  });

  // identityLinks (V4 contract D2/D3): absent is legal on read -- every city.json written before
  // V4 lacks this key entirely, and validateCity must keep accepting those unchanged (schema
  // check only; compileCity's obligation to always EMIT the array, even empty, is a producer
  // contract in src/types.ts's CityModel doc comment, not something the reader can enforce).
  if (c.identityLinks !== undefined) {
    if (!Array.isArray(c.identityLinks)) {
      errors.push("identityLinks must be an array when present");
    } else {
      (c.identityLinks as unknown[]).forEach((raw, i) => {
        if (!isPlainObject(raw)) {
          errors.push(`identityLinks[${i}] must be an object`);
          return;
        }
        const link = raw;
        const label = isSha256Hex(link.hash) ? `identityLink "${link.hash}"` : `identityLinks[${i}]`;
        if (!isSha256Hex(link.hash)) {
          errors.push(`${label}: hash must be a lowercase hex sha256 string`);
        }
        if (!isStringArray(link.members)) {
          errors.push(`${label}: members must be a string[]`);
        } else {
          if (link.members.length < 2) {
            errors.push(`${label}: members must contain at least 2 building ids`);
          }
          for (const memberId of link.members) {
            if (!buildingIds.has(memberId)) {
              errors.push(`${label}: members references unknown building id "${memberId}"`);
            }
          }
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** Runtime validator for `timeline.json` -- same discipline as validateRepoGraph/validateCity:
 *  bin/sequence.ts runs its manifest through this before writing (Failure Discipline LAW). */
export function validateTimelineManifest(x: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(x)) {
    return { ok: false, errors: ["TimelineManifest must be an object"] };
  }
  const m = x;

  if (!Array.isArray(m.entries)) {
    return { ok: false, errors: ["entries must be an array"] };
  }

  const seenMonths = new Set<string>();
  const entries = m.entries as unknown[];
  entries.forEach((raw, i) => {
    if (!isPlainObject(raw)) {
      errors.push(`entries[${i}] must be an object`);
      return;
    }
    const e = raw;
    const label = isNonEmptyString(e.month) ? `entry "${e.month}"` : `entries[${i}]`;

    if (!isNonEmptyString(e.month) || !MONTH_KEY_RE.test(e.month)) {
      errors.push(`entries[${i}]: month must be a "YYYY-MM" string`);
    } else if (seenMonths.has(e.month)) {
      errors.push(`duplicate month in timeline manifest: "${e.month}"`);
    } else {
      seenMonths.add(e.month);
    }
    if (!isNonEmptyString(e.date) || Number.isNaN(Date.parse(e.date))) {
      errors.push(`${label}: date must be a non-empty ISO-8601 date string`);
    }
    if (!isNonEmptyString(e.cityFile)) errors.push(`${label}: cityFile must be a non-empty string`);
    if (!isFiniteNumber(e.buildingCount) || e.buildingCount < 0 || !Number.isInteger(e.buildingCount)) {
      errors.push(`${label}: buildingCount must be a non-negative integer`);
    }
    if (!isFiniteNumber(e.districtCount) || e.districtCount < 0 || !Number.isInteger(e.districtCount)) {
      errors.push(`${label}: districtCount must be a non-negative integer`);
    }
    if (typeof e.gapBefore !== "boolean") errors.push(`${label}: gapBefore must be a boolean`);
    if (i === 0 && e.gapBefore === true) {
      errors.push(`${label}: the first entry's gapBefore must be false (nothing precedes it)`);
    }
  });

  // Ascending order is a manifest invariant, not just a build-time convenience -- a renderer
  // scrubs entries[] by index, so an out-of-order manifest would make the slider jump backward
  // in time as the user drags it forward.
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1] as Record<string, unknown>;
    const cur = entries[i] as Record<string, unknown>;
    if (isNonEmptyString(prev.month) && isNonEmptyString(cur.month) && prev.month >= cur.month) {
      errors.push(`entries must be in ascending month order: "${prev.month}" then "${cur.month}"`);
    }
  }

  return { ok: errors.length === 0, errors };
}
