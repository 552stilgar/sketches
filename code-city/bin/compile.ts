#!/usr/bin/env node
// usage: node --experimental-strip-types bin/compile.ts <repo.json> <city.json> [--clone-lod-scope=district|directory]
import { readFileSync, writeFileSync } from "node:fs";
import { compileCity } from "../src/compiler/index.ts";
import type { CloneLodScope } from "../src/compiler/grammar.ts";
import { validateRepoGraph, validateCity } from "../src/types.ts";
import type { RepoGraph } from "../src/types.ts";

const CLONE_LOD_SCOPES: readonly CloneLodScope[] = ["district", "directory"];

function main(): void {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [inPath, outPath] = positional;
  if (!inPath || !outPath) {
    console.error("usage: node bin/compile.ts <repo.json> <city.json> [--clone-lod-scope=district|directory]");
    process.exit(1);
  }

  let cloneLodScope: CloneLodScope | undefined;
  const scopeFlag = args.find((a) => a.startsWith("--clone-lod-scope="));
  if (scopeFlag) {
    const value = scopeFlag.slice("--clone-lod-scope=".length);
    if (!(CLONE_LOD_SCOPES as readonly string[]).includes(value)) {
      console.error(`invalid --clone-lod-scope value "${value}" -- must be one of: ${CLONE_LOD_SCOPES.join(", ")}`);
      process.exit(1);
    }
    cloneLodScope = value as CloneLodScope;
  }

  const graph = JSON.parse(readFileSync(inPath, "utf-8")) as RepoGraph;
  const graphCheck = validateRepoGraph(graph);
  if (!graphCheck.ok) {
    console.error("input repo.json is invalid:");
    for (const e of graphCheck.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const city = compileCity(graph, { cloneLodScope });

  const cityCheck = validateCity(city);
  if (!cityCheck.ok) {
    console.error("compileCity produced an invalid CityModel:");
    for (const e of cityCheck.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(city, null, 2));
  console.log(`wrote ${outPath} (${city.buildings.length} buildings, ${city.districts.length} districts)`);
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
