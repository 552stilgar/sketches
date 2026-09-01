---
project: sketches
updated: 2026-09-01
next: "Start the visual phase — V1 (tone mapping + exposure + sky/IBL in src/renderer/scene.ts) and V2 (procedural facades: floors/windows/roofs/setbacks derived from existing metrics, hash-deterministic like ruins.ts). Independent files, they parallelize."
phase: "code-city V5.2b independently reviewed (2 read-only codex lanes) → 17 findings, 7 HIGH. L1 (rename lineage) merged; L2–L5 deferred by ruling. Comparison surface rebuilt and reachable again."
campaign_ref: "2026-09-01 — code-city: independent review + L1 rename-lineage fix + compare-surface rebuild"
gates:
  - "L1 verified on the real corpus by A/B at identical HEAD: ages only increase (max +144d), churn only increases, no contributors lost. Suite green on main."
  - "Comparison surface link-checked in-browser: every href 200, overlays confirmed off by default, ruin data-count == rendered mesh count."
---

# sketches — STATE

## Now

code-city's semantic layer is complete and now honest about renames. An independent review found
the V5.2b merge's never-fabricate bug was not isolated — 5 of 7 HIGH findings are the same shape
(an absent or partial measurement acquiring a confident default). L1 fixed the analyzer half and
uncovered more than briefed: `--follow` returned *nothing* for 42 files that entered via the
qol/itba/frd-ops fold merges, so real 124-day-old files were being reported as unmeasured. Last
session's "42 correctly-skipped unmeasured buildings" was itself an artifact of that bug. Analyze
also went 9x faster (a repo-wide git log had been running once per file).

## Open

- **Four rulings owed, none made.** District weight (`derived` gives the largest district 81.5%
  vs `log`'s 40.3% — `derived` is the current default and undoes what the log ruling fixed),
  patina, scaffolding, ruins. Surface: https://fenrir-vps.komodo-deneb.ts.net:7500/compare.html
  (backend = `python3 -m http.server 8099 --bind 127.0.0.1 --directory ~/sketches/code-city/dist`;
  it was down, which is why nothing had been seen).
  District weight is safe to rule any time; the other three read metrics L2/L3 would change.
- **L2–L5 deferred, fully scoped, not forgotten** —
  `~/docs/reusable-playbooks/legacy-audits/outputs/code-city/2026-09-01/lanes-pending.md`
  (sized, executor-assigned, with the hard L4→L5 ordering edge). Findings: `findings.md`, same dir.
- Patina fires but is imperceptible at the default camera; scaffolding covers 898/1108 buildings
  on this repo (younger than its 90-day window). Both are ruling-relevant, not defects.
- `public/city-ruins.json` + `repo-usul-mgmt-v53.json` were deleted mid-session by an
  unidentified actor and restored from `dist`. The `bash-audit` hook cannot see a dispatched
  agent's internal shell — that blind spot is real and unclosed.
- Footprint-floor default still unset. The 0.008 district-legibility floor still answers square
  geometry while districts lay out as full-width strips — fix-floor vs fix-layout is Usul's call.
- 12 active worktrees; `git worktree remove` still permission-denied.

## Do not

- Don't add colors/fills into `src/renderer/svg.ts` — stays presentation-free.
- Don't flip patina/scaffolding/ruins ON by default before the rulings above.
- Don't trust screenshot-derived numbers from a subagent without re-measuring — the browser lane
  reported district shares that were an unlabelled visual estimate, off by ~20 points.
- Don't fix churn or age with a per-file `git log --follow`: that was ~1170 subprocesses on the
  real corpus. The rename map is built once per `analyzeRepo` run.
