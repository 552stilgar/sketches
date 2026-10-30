# sketches — External Agent Guide

The home guide `~/AGENTS.md` applies in full (trailers, sandbox, Fenrir CLI table, keep-outs).
This file adds only what is specific to this project.

## Registry
- Name: sketches · type: project · status: parked
- Creative coding sandbox.
- Project status and lifecycle live in `~/docs/project-registry.md`; never infer them from the tree.

## State
- Read `STATE.md` before any work.
- Never hand-write `## Open`, `STATE.md` or `CAMPAIGN.md`. `fenrir state write` and `campaign append` are plan-only for Codex: print the draft, Claude writes it.

## Commands (from fenrir.json)
- gate: none
- build: none
- smoke: none
- Run tests through the declared gate, never a bare `node --test`.

## Do not
- Don't add colors/fills into src/renderer/svg.ts -- stays presentation-free.
- Don't flip patina/scaffolding/ruins ON by default before the three rulings above.
- Don't repoint facades.ts's floor/window derivations at metrics (loc/complexity/churn/age) -- they deliberately restate geometry only; the lens system already encodes those.
- Don't raise TONE_MAPPING_EXPOSURE or WINDOW_DARKEN without checking tests/tone-mapping.test.ts / tests/facades.test.ts -- both are gated against the never-confusable lightness ladder.
- Don't run lane land with an untracked IDEAS.md in the checkout and expect it to pass: commit or move it, or hand-ff after the overlap check.
- Push, merge, or touch PM2, crontab, hooks or credentials.
