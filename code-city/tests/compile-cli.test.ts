// bin/compile.ts CLI flag validation. --clone-lod-scope's invalid-value behavior is exercised
// only in-process via compileCity() elsewhere; this covers the CLI's own argv parsing/validation
// for --district-weight (V5.1, sketches/CAMPAIGN.md district-weighting task) end to end as a
// subprocess, same pattern as "bin/snapshots.ts CLI" in tests/snapshots.test.ts.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";

const SCRIPT = fileURLToPath(new URL("../bin/compile.ts", import.meta.url));

let workDir: string;
let repoJsonPath: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "code-city-compile-cli-"));
  repoJsonPath = join(workDir, "repo.json");
  writeFileSync(repoJsonPath, JSON.stringify(makeFixedRepoGraph()));
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("bin/compile.ts CLI — --district-weight", () => {
  it("(c) exits non-zero and names the legal values when given an invalid --district-weight", () => {
    const outPath = join(workDir, "city-invalid.json");
    let stderr = "";
    let threw = false;
    try {
      execFileSync(
        "node",
        ["--experimental-strip-types", SCRIPT, repoJsonPath, outPath, "--district-weight=cube"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err: unknown) {
      threw = true;
      stderr = (err as { stderr?: string }).stderr ?? "";
    }
    expect(threw).toBe(true);
    expect(stderr).toMatch(/invalid --district-weight value "cube"/);
    // The failure names all four legal values, not just one, so the caller doesn't have to guess.
    expect(stderr).toMatch(/linear/);
    expect(stderr).toMatch(/sqrt/);
    expect(stderr).toMatch(/log/);
    expect(stderr).toMatch(/derived/);
    expect(existsSync(outPath)).toBe(false);
  });

  it("accepts each legal --district-weight value and writes a validated city.json", () => {
    for (const mode of ["linear", "sqrt", "log", "derived"]) {
      const outPath = join(workDir, `city-${mode}.json`);
      const result = execFileSync(
        "node",
        ["--experimental-strip-types", SCRIPT, repoJsonPath, outPath, `--district-weight=${mode}`],
        { encoding: "utf8" },
      );
      expect(result).toMatch(/wrote /);
      const city = JSON.parse(readFileSync(outPath, "utf8"));
      expect(city.districts.length).toBeGreaterThan(0);
    }
  });

  it("omitting --district-weight still compiles (defaults to derived, unchanged CLI behavior)", () => {
    const outPath = join(workDir, "city-default.json");
    const result = execFileSync("node", ["--experimental-strip-types", SCRIPT, repoJsonPath, outPath], {
      encoding: "utf8",
    });
    expect(result).toMatch(/wrote /);
    expect(existsSync(outPath)).toBe(true);
  });
});
