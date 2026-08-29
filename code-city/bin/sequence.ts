#!/usr/bin/env node
// usage: node --experimental-strip-types bin/sequence.ts <snapshots-dir> <out-dir>
//        [--clone-lod-scope=district|directory]
//
// Compiles a directory of monthly repo-YYYY-MM.json snapshots (bin/snapshots.ts's output) into a
// scrubbable sequence of CityModels for the timeline-scrub renderer (PROJECT_IDEA.md Phase 4):
// one city-YYYY-MM.json per month, via the SAME compileCity() bin/compile.ts calls (reused, never
// re-implemented -- DESIGN.md's "CLIs are thin wiring" rule), plus a timeline.json manifest
// (src/compiler/sequence.ts's buildTimelineManifest) that orders the months and marks any gap
// where a month had no qualifying commit (never-fabricate: a gap must render as a gap, not a
// smooth interpolation across missing history).
//
// Fail loudly (project LAW): every repo.json is validated on read, every city.json validated
// before writing, and the whole run aborts on the FIRST invalid snapshot -- nothing is written
// until every snapshot in the directory has compiled and validated cleanly. Never a partial
// out-dir.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileCity } from "../src/compiler/index.ts";
import { buildTimelineManifest, parseSnapshotMonth } from "../src/compiler/sequence.ts";
import type { CloneLodScope } from "../src/compiler/grammar.ts";
import { validateRepoGraph, validateCity, validateTimelineManifest } from "../src/types.ts";
import type { CityModel, RepoGraph } from "../src/types.ts";

const CLONE_LOD_SCOPES: readonly CloneLodScope[] = ["district", "directory"];

function parseArgs(argv: string[]): { snapshotsDir: string; outDir: string; cloneLodScope?: CloneLodScope } {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const [snapshotsDir, outDir] = positional;
  if (!snapshotsDir || !outDir) {
    console.error(
      "usage: node bin/sequence.ts <snapshots-dir> <out-dir> [--clone-lod-scope=district|directory]",
    );
    process.exit(1);
  }

  let cloneLodScope: CloneLodScope | undefined;
  const scopeFlag = argv.find((a) => a.startsWith("--clone-lod-scope="));
  if (scopeFlag) {
    const value = scopeFlag.slice("--clone-lod-scope=".length);
    if (!(CLONE_LOD_SCOPES as readonly string[]).includes(value)) {
      console.error(`invalid --clone-lod-scope value "${value}" -- must be one of: ${CLONE_LOD_SCOPES.join(", ")}`);
      process.exit(1);
    }
    cloneLodScope = value as CloneLodScope;
  }

  return { snapshotsDir, outDir, cloneLodScope };
}

interface CompiledEntry {
  month: string;
  date: string;
  cityFile: string;
  city: CityModel;
}

function main(): void {
  const { snapshotsDir, outDir, cloneLodScope } = parseArgs(process.argv.slice(2));

  const months = readdirSync(snapshotsDir)
    .map((f) => ({ file: f, month: parseSnapshotMonth(f) }))
    .filter((e): e is { file: string; month: string } => e.month !== null)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  if (months.length === 0) {
    console.error(`no repo-YYYY-MM.json snapshots found in ${snapshotsDir}`);
    process.exit(1);
  }

  const compiled: CompiledEntry[] = [];

  for (const { file, month } of months) {
    const inPath = join(snapshotsDir, file);
    let graph: RepoGraph;
    try {
      graph = JSON.parse(readFileSync(inPath, "utf-8")) as RepoGraph;
    } catch (err) {
      console.error(`${inPath}: failed to read/parse -- ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    const graphCheck = validateRepoGraph(graph);
    if (!graphCheck.ok) {
      console.error(`${inPath}: invalid RepoGraph:`);
      for (const e of graphCheck.errors) console.error(`  - ${e}`);
      process.exit(1);
    }

    const city = compileCity(graph, { cloneLodScope });
    const cityCheck = validateCity(city);
    if (!cityCheck.ok) {
      console.error(`${inPath}: compileCity produced an invalid CityModel:`);
      for (const e of cityCheck.errors) console.error(`  - ${e}`);
      process.exit(1);
    }

    compiled.push({ month, date: graph.headDate, cityFile: `city-${month}.json`, city });
  }

  const manifest = buildTimelineManifest(
    compiled.map((c) => ({
      month: c.month,
      date: c.date,
      cityFile: c.cityFile,
      buildingCount: c.city.buildings.length,
      districtCount: c.city.districts.length,
    })),
  );

  const manifestCheck = validateTimelineManifest(manifest);
  if (!manifestCheck.ok) {
    console.error("buildTimelineManifest produced an invalid TimelineManifest:");
    for (const e of manifestCheck.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Every snapshot compiled and validated, and the manifest itself is valid -- write everything
  // now, all at once (Failure Discipline LAW: never a partial out-dir on a mid-run failure).
  mkdirSync(outDir, { recursive: true });
  for (const c of compiled) {
    writeFileSync(join(outDir, c.cityFile), JSON.stringify(c.city, null, 2));
  }
  writeFileSync(join(outDir, "timeline.json"), JSON.stringify(manifest, null, 2));

  const gaps = manifest.entries.filter((e) => e.gapBefore).length;
  console.log(
    `wrote ${compiled.length} city snapshot(s) + timeline.json to ${outDir} (${gaps} gap(s) in the sequence)`,
  );
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
