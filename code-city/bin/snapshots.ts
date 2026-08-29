#!/usr/bin/env node
// usage: node --experimental-strip-types bin/snapshots.ts <repo-path> <out-dir> [--months N]
//
// Writes <out-dir>/repo-YYYY-MM.json, one per month, for the last N months (default 24) of
// <repo-path>'s git history. Analyzer-only lane (PROJECT_IDEA.md Phase 4) -- see
// src/analyzer/snapshots.ts for the determinism/never-fabricate/no-mutation guarantees.
//
// Fail loudly (project LAW): every snapshot is validated before ANY file is written. If one
// snapshot is invalid, or resolving/analyzing history fails, nothing is written and the process
// exits non-zero -- never a partial out-dir.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateMonthlySnapshots } from "../src/analyzer/snapshots.ts";

function parseArgs(argv: string[]): { repoPath: string; outDir: string; months: number } {
  const [repoPath, outDir, ...rest] = argv;
  if (!repoPath || !outDir) {
    console.error("usage: node bin/snapshots.ts <repo-path> <out-dir> [--months N]");
    process.exit(1);
  }
  let months = 24;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--months") {
      const raw = rest[i + 1];
      const parsed = raw ? Number(raw) : NaN;
      if (!Number.isInteger(parsed) || parsed < 1) {
        console.error(`--months must be a positive integer, got ${raw}`);
        process.exit(1);
      }
      months = parsed;
      i++;
    }
  }
  return { repoPath, outDir, months };
}

async function main(): Promise<void> {
  const { repoPath, outDir, months } = parseArgs(process.argv.slice(2));

  console.log(`[code-city snapshots] resolving last ${months} month(s) of history for ${repoPath}`);

  const { snapshots, skipped } = await generateMonthlySnapshots(repoPath, {
    months,
    onProgress: (p) => {
      console.log(`[code-city snapshots] ${p.month} -> ${p.sha.slice(0, 12)} (${p.date}), ${p.fileCount} file(s)`);
    },
  });

  for (const s of skipped) {
    console.log(`[code-city snapshots] SKIPPED ${s.month}: ${s.reason}`);
  }

  if (snapshots.length === 0) {
    console.error("[code-city snapshots] no snapshots resolved -- nothing to write");
    process.exit(1);
  }

  // Every snapshot already validated inside generateMonthlySnapshots (throws before reaching
  // here otherwise) -- all-or-nothing write, no partial out-dir on a mid-run failure.
  mkdirSync(outDir, { recursive: true });
  for (const s of snapshots) {
    const outPath = join(outDir, `repo-${s.month}.json`);
    writeFileSync(outPath, JSON.stringify(s.graph, null, 2));
  }

  console.log(
    `[code-city snapshots] wrote ${snapshots.length} snapshot(s) to ${outDir} (${skipped.length} month(s) skipped)`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
