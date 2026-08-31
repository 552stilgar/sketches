// V5.3 — ruins (deleted files) in repo.json. See src/analyzer/ruins.ts's header for the design
// call this gates: a ruin is NOT a RepoNode, and the only fields it carries are the ones git
// genuinely knows.
//
// Every fixture here is a real git repo built in a temp dir with pinned author/committer dates,
// the same pattern tests/git-inferred-touch.test.ts uses — a synthetic log string would not
// exercise git's rename detection, which is the whole trap this signal has to survive.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepo } from "../src/analyzer/index.ts";
import { mergeRepoGraphs } from "../src/analyzer/merge.ts";
import { readRuins } from "../src/analyzer/ruins.ts";
import { validateRepoGraph } from "../src/types.ts";

const AUTHOR_NAME = "Fixture Bot";
const AUTHOR_EMAIL = "fixture@example.com";

const repoDirs: string[] = [];

afterEach(() => {
  while (repoDirs.length > 0) rmSync(repoDirs.pop()!, { recursive: true, force: true });
});

function newRepo(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `code-city-${label}-`));
  repoDirs.push(dir);
  execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  for (const [k, v] of [
    ["user.name", AUTHOR_NAME],
    ["user.email", AUTHOR_EMAIL],
    ["commit.gpgsign", "false"],
    // Deliberately hostile: turn the ambient rename-detection config OFF. readRuins must pass
    // -M explicitly, so a renamed file stays out of the ruins list even here.
    ["diff.renames", "false"],
  ]) {
    execFileSync("git", ["config", k, v], { cwd: dir, stdio: "ignore" });
  }
  return dir;
}

function commit(dir: string, message: string, date: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", message], {
    cwd: dir,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
      GIT_COMMITTER_DATE: date,
    },
  });
}

function headDateOf(dir: string): string {
  const raw = execFileSync("git", ["log", "-1", "--format=%cI", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  return new Date(raw).toISOString();
}

const BODY = "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n";

describe("readRuins — a deleted source file becomes a ruin", () => {
  it("reports path, language, deleting commit and lastLoc for a file removed inside the window", async () => {
    const dir = newRepo("ruin-delete");
    mkdirSync(join(dir, "legacy"));
    writeFileSync(join(dir, "legacy", "old.ts"), BODY);
    writeFileSync(join(dir, "keep.ts"), "export const keep = 1;\n");
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "legacy", "old.ts"));
    commit(dir, "drop legacy", "2024-02-01T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins).toHaveLength(1);
    expect(ruins[0].path).toBe("legacy/old.ts");
    expect(ruins[0].language).toBe("typescript");
    expect(ruins[0].deletedDate).toBe("2024-02-01T12:00:00.000Z");
    expect(ruins[0].deletedSha).toMatch(/^[0-9a-f]{40}$/);
    // lastLoc is a HISTORICAL measurement -- the file's real line count at the commit before it
    // was removed, counted the same way a live node's `loc` is.
    expect(ruins[0].lastLoc).toBe(3);
  });

  it("does not report a file that still exists at HEAD, nor one deleted and later re-added", async () => {
    const dir = newRepo("ruin-readd");
    writeFileSync(join(dir, "a.ts"), BODY);
    writeFileSync(join(dir, "b.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "b.ts"));
    commit(dir, "drop b", "2024-01-15T12:00:00+00:00");

    writeFileSync(join(dir, "b.ts"), "export const b = 99;\n");
    commit(dir, "bring b back", "2024-02-01T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins).toEqual([]);
  });

  it("ignores a deleted non-source file — a ruin must be something that could have been a building", async () => {
    const dir = newRepo("ruin-nonsource");
    writeFileSync(join(dir, "a.ts"), BODY);
    writeFileSync(join(dir, "NOTES.md"), "notes\n");
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "NOTES.md"));
    commit(dir, "drop notes", "2024-02-01T12:00:00+00:00");

    expect(await readRuins(dir, headDateOf(dir))).toEqual([]);
  });
});

describe("readRuins — a RENAME is not a ruin", () => {
  it("does not report a file moved to a new path in one commit, even with diff.renames=false", async () => {
    const dir = newRepo("ruin-rename");
    mkdirSync(join(dir, "old"));
    writeFileSync(join(dir, "old", "service.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    // A pure move: identical content at a new path, in ONE commit. Git stores this as delete+add;
    // rename detection (-M50%) is what keeps it out of the ruins list.
    unlinkSync(join(dir, "old", "service.ts"));
    mkdirSync(join(dir, "new"));
    writeFileSync(join(dir, "new", "service.ts"), BODY);
    commit(dir, "move service", "2024-02-01T12:00:00+00:00");

    expect(await readRuins(dir, headDateOf(dir))).toEqual([]);
  });

  it("still reports a genuine deletion made in the same commit as an unrelated rename", async () => {
    const dir = newRepo("ruin-rename-mixed");
    writeFileSync(join(dir, "moved.ts"), BODY);
    writeFileSync(join(dir, "doomed.ts"), "export const doomed = 1;\n");
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "moved.ts"));
    writeFileSync(join(dir, "relocated.ts"), BODY);
    unlinkSync(join(dir, "doomed.ts"));
    commit(dir, "reshuffle", "2024-02-01T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins.map((r) => r.path)).toEqual(["doomed.ts"]);
  });
});

describe("readRuins — the window is HEAD-anchored, never wall-clock", () => {
  it("excludes a deletion older than 90 days before headDate, and includes one inside it", async () => {
    const dir = newRepo("ruin-window");
    writeFileSync(join(dir, "ancient.ts"), BODY);
    writeFileSync(join(dir, "recent.ts"), BODY);
    writeFileSync(join(dir, "anchor.ts"), "export const anchor = 1;\n");
    commit(dir, "initial", "2023-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "ancient.ts"));
    commit(dir, "drop ancient", "2023-02-01T12:00:00+00:00");

    unlinkSync(join(dir, "recent.ts"));
    commit(dir, "drop recent", "2024-05-15T12:00:00+00:00");

    // HEAD lands 2024-06-01; the window is [2024-03-03, 2024-06-01]. "ancient.ts" died over a
    // year before that and must NOT appear, however long ago the analysis is run.
    writeFileSync(join(dir, "anchor.ts"), "export const anchor = 2;\n");
    commit(dir, "touch anchor", "2024-06-01T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins.map((r) => r.path)).toEqual(["recent.ts"]);
  });

  it("DETERMINISM: the same fixture analyzed 'later' yields byte-identical ruins", async () => {
    const dir = newRepo("ruin-determinism");
    writeFileSync(join(dir, "gone.ts"), BODY);
    writeFileSync(join(dir, "stays.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "gone.ts"));
    commit(dir, "demolish", "2024-02-01T12:00:00+00:00");

    const headDate = headDateOf(dir);
    const first = await readRuins(dir, headDate);

    // Simulate "later": move wall-clock a decade forward. Nothing about the answer may move,
    // because the window is anchored to headDate, not to Date.now().
    const realNow = Date.now;
    const realDate = Date;
    try {
      const shift = 10 * 365 * 24 * 60 * 60 * 1000;
      Date.now = () => realNow() + shift;
      const second = await readRuins(dir, headDate);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      // And the same repo state re-analyzed end to end agrees with the direct read.
      const graph = await analyzeRepo(dir);
      expect(JSON.stringify(graph.ruins)).toBe(JSON.stringify(first));
    } finally {
      Date.now = realNow;
      globalThis.Date = realDate;
    }
  });
});

describe("analyzeRepo + validateRepoGraph — ruins are a separate array, never nodes", () => {
  it("emits ruins on the graph, keeps the demolished path out of nodes, and validates", async () => {
    const dir = newRepo("ruin-graph");
    writeFileSync(join(dir, "alive.ts"), BODY);
    writeFileSync(join(dir, "dead.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    unlinkSync(join(dir, "dead.ts"));
    commit(dir, "demolish", "2024-02-01T12:00:00+00:00");

    const graph = await analyzeRepo(dir);
    expect(graph.nodes.map((n) => n.id)).toEqual(["alive.ts"]);
    expect(graph.ruins?.map((r) => r.path)).toEqual(["dead.ts"]);
    // No fabricated node-shaped fields snuck onto the record.
    expect(Object.keys(graph.ruins![0]).sort()).toEqual([
      "deletedDate",
      "deletedSha",
      "language",
      "lastLoc",
      "path",
    ]);
    expect(validateRepoGraph(graph).ok).toBe(true);
  });

  it("emits an empty ruins array (a finding) for a repo with no deletions in the window", async () => {
    const dir = newRepo("ruin-none");
    writeFileSync(join(dir, "alive.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    const graph = await analyzeRepo(dir);
    expect(graph.ruins).toEqual([]);
  });
});

describe("validateRepoGraph — ruins schema", () => {
  const base = {
    nodes: [],
    repoPath: "/tmp/x",
    headSha: "abc",
    headDate: "2024-06-01T00:00:00.000Z",
  };

  it("accepts an absent ruins field (NOT MEASURED) and a well-formed one", () => {
    expect(validateRepoGraph(base).ok).toBe(true);
    expect(
      validateRepoGraph({
        ...base,
        ruins: [{ path: "a.ts", language: "typescript", deletedSha: "def", deletedDate: "2024-05-01T00:00:00.000Z" }],
      }).ok,
    ).toBe(true);
  });

  it("rejects a malformed deletedDate, a negative lastLoc, and a duplicate path", () => {
    const bad = validateRepoGraph({
      ...base,
      ruins: [
        { path: "a.ts", language: "typescript", deletedSha: "def", deletedDate: "not-a-date" },
        { path: "a.ts", language: "typescript", deletedSha: "def", deletedDate: "2024-05-01T00:00:00.000Z", lastLoc: -1 },
      ],
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes("deletedDate"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("duplicate ruin path"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("lastLoc"))).toBe(true);
  });

  it("rejects a ruin whose path is also a live node id — a file cannot be both", () => {
    const result = validateRepoGraph({
      ...base,
      nodes: [
        {
          id: "a.ts",
          type: "file",
          language: "typescript",
          name: "a.ts",
          path: "a.ts",
          loc: 1,
          complexity: 1,
          churn: 0,
          age: 0,
          contributors: [],
          imports: [],
          calls: [],
          contains: [],
        },
      ],
      ruins: [{ path: "a.ts", language: "typescript", deletedSha: "def", deletedDate: "2024-05-01T00:00:00.000Z" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("cannot be both a ruin and a node"))).toBe(true);
  });
});

describe("mergeRepoGraphs — the V4 datastores scar, not repeated for ruins", () => {
  const graphWith = (ruins: unknown): Record<string, unknown> => ({
    nodes: [],
    repoPath: "/tmp/x",
    headSha: "abc",
    headDate: "2024-06-01T00:00:00.000Z",
    ...(ruins === undefined ? {} : { ruins }),
  });

  it("namespaces each ruin's path with its repo name and carries every other field through", () => {
    const merged = mergeRepoGraphs([
      {
        name: "alpha",
        graph: graphWith([
          { path: "src/gone.ts", language: "typescript", deletedSha: "aaa", deletedDate: "2024-05-01T00:00:00.000Z", lastLoc: 7 },
        ]) as never,
      },
      {
        name: "beta",
        graph: graphWith([
          { path: "lib/old.ts", language: "typescript", deletedSha: "bbb", deletedDate: "2024-05-02T00:00:00.000Z" },
        ]) as never,
      },
    ]);
    expect(merged.ruins).toEqual([
      { path: "alpha/src/gone.ts", language: "typescript", deletedSha: "aaa", deletedDate: "2024-05-01T00:00:00.000Z", lastLoc: 7 },
      { path: "beta/lib/old.ts", language: "typescript", deletedSha: "bbb", deletedDate: "2024-05-02T00:00:00.000Z" },
    ]);
  });

  it("keeps ruins absent only when NO input carried the field", () => {
    const none = mergeRepoGraphs([{ name: "alpha", graph: graphWith(undefined) as never }]);
    expect(none.ruins).toBeUndefined();

    const some = mergeRepoGraphs([
      { name: "alpha", graph: graphWith(undefined) as never },
      { name: "beta", graph: graphWith([]) as never },
    ]);
    expect(some.ruins).toEqual([]);
  });
});
