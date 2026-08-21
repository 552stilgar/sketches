#!/usr/bin/env node
// Full-pipeline smoke test: fixture -> analyze -> compile -> render2d, validating each output
// file exists and looks sane. Exits nonzero on any failure.
//
// This WILL fail until analyzeRepo/compileCity/render2d are implemented by the build lanes —
// that is expected. It is a scaffold for the implementation lanes to run against as they land;
// it is NOT run as part of the contract-lane RED gate (see docs/CONTRACT-*.md instead).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function main() {
  const workDir = mkdtempSync(join(tmpdir(), "code-city-smoke-"));
  const fixtureRepoDir = join(workDir, "fixture-repo");
  const repoJson = join(workDir, "repo.json");
  const cityJson = join(workDir, "city.json");
  const citySvg = join(workDir, "city.svg");

  try {
    run("node", [join(ROOT, "fixtures", "build-fixture.mjs"), fixtureRepoDir]);
    run("node", ["--experimental-strip-types", join(ROOT, "bin", "analyze.ts"), fixtureRepoDir, repoJson]);
    run("node", ["--experimental-strip-types", join(ROOT, "bin", "compile.ts"), repoJson, cityJson]);
    run("node", ["--experimental-strip-types", join(ROOT, "bin", "render2d.ts"), cityJson, citySvg]);

    for (const [label, path] of [
      ["repo.json", repoJson],
      ["city.json", cityJson],
      ["city.svg", citySvg],
    ]) {
      if (!existsSync(path)) {
        throw new Error(`${label} was not written to ${path}`);
      }
    }

    const svg = readFileSync(citySvg, "utf-8");
    if (!svg.includes("<svg")) {
      throw new Error("city.svg does not contain an <svg> element");
    }

    console.log("SMOKE OK: repo.json -> city.json -> city.svg pipeline ran end to end");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
