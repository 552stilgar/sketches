#!/usr/bin/env node
// Deterministic fixture builder: copies sample-project-src into a target dir,
// then git-inits it with 6 fixed-date, fixed-author commits (commits 4-6
// repeatedly touch payments/ to simulate a churn hotspot).
//
// Commits 5 and 6 mutate real file content in-place (same line count, so LOC stays matched
// to fixtures/MANIFEST.md) rather than using --allow-empty — churn must come from real git
// diffs, never from a fixture that fakes history the analyzer then has to infer around.
//
// Usage: node fixtures/build-fixture.mjs <target-dir>

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
    stdio: "inherit",
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

// In-place, same-line-count content edit — a real diff without changing wc -l, so
// fixtures/MANIFEST.md's LOC figures (and the analyzer.test.ts assertions derived from them)
// stay valid across the "rework" commits.
function mutateLine(target, relPath, from, to) {
  const filePath = join(target, relPath);
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(from)) {
    throw new Error(`fixture mutation failed: "${from}" not found in ${relPath}`);
  }
  writeFileSync(filePath, content.replace(from, to));
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node fixtures/build-fixture.mjs <target-dir>");
    process.exit(1);
  }

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(target, { recursive: true });

  cpSync(SRC, target, { recursive: true });

  git(target, ["init", "-q"]);
  git(target, ["config", "user.name", AUTHOR_NAME]);
  git(target, ["config", "user.email", AUTHOR_EMAIL]);
  git(target, ["config", "commit.gpgsign", "false"]);

  // Fixed dates spread over 2024-01-01 .. 2026-06-01 (UTC noon, deterministic).
  const DATES = [
    "2024-01-01T12:00:00+00:00", // commit 1: utils
    "2024-06-15T12:00:00+00:00", // commit 2: auth
    "2024-12-01T12:00:00+00:00", // commit 3: ui
    "2025-04-10T12:00:00+00:00", // commit 4: payments (churn 1)
    "2025-10-20T12:00:00+00:00", // commit 5: payments (churn 2)
    "2026-06-01T12:00:00+00:00", // commit 6: payments (churn 3, HEAD)
  ];

  commit(target, {
    message: "utils: add logger, format, validate",
    date: DATES[0],
    files: ["utils/"],
  });

  commit(target, {
    message: "auth: add types, tokens, session, login",
    date: DATES[1],
    files: ["auth/"],
  });

  commit(target, {
    message: "ui: add types, button, form, dashboard",
    date: DATES[2],
    files: ["ui/"],
  });

  commit(target, {
    message: "payments: initial charge and ledger",
    date: DATES[3],
    files: ["payments/types.ts", "payments/ledger.ts", "payments/charge.ts"],
  });

  // refund.ts is new (real add); ledger.ts already exists from commit 4, so mutate a log
  // message in place (same line count) to produce a real diff instead of a no-op re-add.
  mutateLine(target, "payments/ledger.ts", "recorded ${entry.type} ${entry.id}", "recorded entry ${entry.type}/${entry.id}");

  commit(target, {
    message: "payments: add refund flow",
    date: DATES[4],
    files: ["payments/refund.ts", "payments/ledger.ts"],
  });

  // All three already exist by now — mutate each in place (same line count) so this "rework"
  // commit carries a real diff for every file it claims to touch.
  mutateLine(target, "payments/ledger.ts", "recorded entry ${entry.type}/${entry.id}", "recorded entry ${entry.type} #${entry.id}");
  mutateLine(target, "payments/charge.ts", "created charge ${charge.id}", "charge created: ${charge.id}");
  mutateLine(target, "payments/refund.ts", "refund ${refund.id} for charge ${chargeId}", "refund issued ${refund.id} for charge ${chargeId}");

  commit(target, {
    message: "payments: rework ledger and charge handling",
    date: DATES[5],
    files: ["payments/ledger.ts", "payments/charge.ts", "payments/refund.ts"],
  });

  console.log(`fixture built at ${target}`);
}

main();
