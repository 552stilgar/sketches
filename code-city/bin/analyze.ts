#!/usr/bin/env node
// usage: node --experimental-strip-types bin/analyze.ts <repo-path> <output.json>
import { writeFileSync } from "node:fs";
import { analyzeRepo } from "../src/analyzer/index.ts";
import { validateRepoGraph } from "../src/types.ts";

async function main(): Promise<void> {
  const [, , repoPath, outPath] = process.argv;
  if (!repoPath || !outPath) {
    console.error("usage: node bin/analyze.ts <repo-path> <output.json>");
    process.exit(1);
  }

  const graph = await analyzeRepo(repoPath);

  const result = validateRepoGraph(graph);
  if (!result.ok) {
    console.error("analyzeRepo produced an invalid RepoGraph:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(graph, null, 2));
  console.log(`wrote ${outPath} (${graph.nodes.length} nodes)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
