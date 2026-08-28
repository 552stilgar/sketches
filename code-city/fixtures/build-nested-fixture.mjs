#!/usr/bin/env node
// Nested-subdir regression fixture: git-inits a wrapper repo whose root is ABOVE the directory
// analyzeRepo is pointed at — reproduces code-city's own dogfood shape (this project living
// inside the larger `sketches` monorepo, so `repoPath` is a subdirectory of the git root, not
// the root itself).
//
// `git log --name-only` always prints paths relative to the git ROOT, never to an arbitrary
// cwd. readFileGitMetrics compares those against `filePath`, which scanSourceFiles produces
// relative to `repoPath`. When repoPath is a subdirectory, the two path spaces never match and
// churn silently reads 0 for every file, however real the commit history is.
//
// Usage: node fixtures/build-nested-fixture.mjs <target-dir>
// Prints (stdout, last line): the subdirectory to pass to analyzeRepo (<target-dir>/project).

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "sample-project-src");

const AUTHOR_NAME = "Fixture Bot";
const AUTHOR_EMAIL = "fixture@example.com";

function git(target, args, env) {
  execFileSync("git", args, {
    cwd: target,
    stdio: "ignore",
    env: { ...process.env, ...env },
  });
}

function commit(target, { message, date, files }) {
  git(target, ["add", ...files]);
  git(target, ["commit", "-m", message], {
    GIT_AUTHOR_NAME: AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
    GIT_COMMITTER_DATE: date,
  });
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node fixtures/build-nested-fixture.mjs <target-dir>");
    process.exit(1);
  }

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(target, { recursive: true });

  // Unrelated content at the git root, sibling to project/ — this is what makes the repo root
  // differ from the analysis target, exactly like sketches/ has other sketches sibling to
  // code-city/.
  mkdirSync(join(target, "other-sibling-project"), { recursive: true });
  writeFileSync(join(target, "other-sibling-project", "README.md"), "unrelated sibling\n");
  writeFileSync(join(target, "README.md"), "wrapper repo root\n");

  const projectDir = join(target, "project");
  cpSync(SRC, projectDir, { recursive: true });

  git(target, ["init", "-q"]);
  git(target, ["config", "user.name", AUTHOR_NAME]);
  git(target, ["config", "user.email", AUTHOR_EMAIL]);
  git(target, ["config", "commit.gpgsign", "false"]);

  commit(target, {
    message: "initial: wrapper root + nested project",
    date: "2024-01-01T12:00:00+00:00",
    files: ["."],
  });

  // Real content mutation inside project/, landing at HEAD — this must be detected as churn
  // for "payments/ledger.ts" once resolved against the "project" repoPath (not fabricated, not
  // dropped because it's actually recorded under "project/payments/ledger.ts" at the git root).
  const ledgerPath = join(projectDir, "payments", "ledger.ts");
  const content = readFileSync(ledgerPath, "utf8");
  writeFileSync(ledgerPath, content.replace("recorded", "recorded entry"));

  commit(target, {
    message: "project: rework ledger recording",
    date: "2024-06-01T12:00:00+00:00",
    files: ["project/payments/ledger.ts"],
  });

  console.log(projectDir);
}

main();
