#!/usr/bin/env node
// Full-pipeline smoke test: fixture -> analyze -> compile -> render2d -> validate outputs ->
// vitest. Exits nonzero on any failure. This is the CI-shaped gate for the whole repo: it only
// exits 0 when the real pipeline runs end to end AND the unit suite is green.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRepoGraph, validateCity } from "../src/types.ts";

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

    const repoGraph = JSON.parse(readFileSync(repoJson, "utf-8"));
    const repoCheck = validateRepoGraph(repoGraph);
    if (!repoCheck.ok) {
      throw new Error(`repo.json failed validateRepoGraph:\n  - ${repoCheck.errors.join("\n  - ")}`);
    }

    const cityModel = JSON.parse(readFileSync(cityJson, "utf-8"));
    const cityCheck = validateCity(cityModel);
    if (!cityCheck.ok) {
      throw new Error(`city.json failed validateCity:\n  - ${cityCheck.errors.join("\n  - ")}`);
    }

    const svg = readFileSync(citySvg, "utf-8");
    if (!svg.includes("<svg")) {
      throw new Error("city.svg does not contain an <svg> element");
    }

    console.log("SMOKE OK: repo.json -> city.json -> city.svg pipeline ran end to end, outputs schema-valid");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  run("npx", ["vitest", "run"]);
  console.log("SMOKE OK: vitest suite green");
}

main();
