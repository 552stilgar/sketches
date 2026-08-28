#!/usr/bin/env node
// usage: node --experimental-strip-types bin/merge.ts <name>=<repo.json> [<name>=<repo.json> ...] <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { mergeRepoGraphs } from "../src/analyzer/merge.ts";
import { validateRepoGraph } from "../src/types.ts";
import type { RepoGraph } from "../src/types.ts";
import type { NamedRepoGraph } from "../src/analyzer/merge.ts";

const USAGE = "usage: node bin/merge.ts <name>=<repo.json> [<name>=<repo.json> ...] <out.json>";

function parseInput(arg: string): NamedRepoGraph {
  const eq = arg.indexOf("=");
  if (eq <= 0) {
    throw new Error(`invalid argument "${arg}" — expected <name>=<repo.json>\n${USAGE}`);
  }
  const name = arg.slice(0, eq);
  const path = arg.slice(eq + 1);
  const graph = JSON.parse(readFileSync(path, "utf-8")) as RepoGraph;
  const check = validateRepoGraph(graph);
  if (!check.ok) {
    console.error(`input "${path}" (repo "${name}") is not a valid repo.json:`);
    for (const e of check.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  return { name, graph };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(USAGE);
    process.exit(1);
  }

  const outPath = args[args.length - 1];
  const inputs = args.slice(0, -1).map(parseInput);

  const merged = mergeRepoGraphs(inputs);

  // mergeRepoGraphs already validates its own output and throws on failure (caught below), so
  // by the time we get here `merged` is known-valid — never a partial or invalid file gets
  // written.
  writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`wrote ${outPath} (${merged.nodes.length} nodes across ${inputs.length} repos)`);
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
