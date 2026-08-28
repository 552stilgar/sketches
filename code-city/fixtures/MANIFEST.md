# Fixture Manifest

Source: `fixtures/sample-project-src/` — 15 TypeScript files across 4 directories, copied
byte-for-byte by `fixtures/build-fixture.mjs <target-dir>`, then committed into a fresh git
repo at `<target-dir>` with 6 fixed-date commits. This manifest exists so a later lane can
derive exact test assertions (LOC, import edges, commit history) without re-deriving them
from the fixture source.

## Files (LOC via `wc -l`)

| File | LOC | Imports (relative) | Exports |
|---|---|---|---|
| `utils/logger.ts` | 38 | — | `LogLevel`, `Logger`, `createLogger` |
| `utils/format.ts` | 25 | — | `formatCurrency`, `formatDate`, `truncate`, `titleCase` |
| `utils/validate.ts` | 27 | — | `isNonEmpty`, `isEmail`, `isPositiveInt`, `assert`, `ValidationError` |
| `auth/types.ts` | 17 | — | `User`, `Credentials`, `Session` |
| `auth/tokens.ts` | 28 | `../utils/logger.ts` | `generateToken`, `decodeToken`, `TokenStore` |
| `auth/session.ts` | 39 | `./tokens.ts`, `../utils/logger.ts`, `./types.ts` | `SessionManager`, `newSessionManager` |
| `auth/login.ts` | 27 | `./session.ts`, `./types.ts`, `../utils/validate.ts` | `login`, `logout` |
| `payments/types.ts` | 20 | — | `Charge`, `Refund`, `LedgerEntry` |
| `payments/ledger.ts` | 25 | `../utils/logger.ts`, `./types.ts` | `Ledger`, `globalLedger` |
| `payments/charge.ts` | 32 | `./ledger.ts`, `../utils/validate.ts`, `../utils/logger.ts`, `./types.ts` | `createCharge`, `settleCharge` |
| `payments/refund.ts` | 31 | `./ledger.ts`, `./types.ts`, `../utils/logger.ts` | `createRefund`, `refundReasonSummary` |
| `ui/types.ts` | 11 | — | `ButtonProps`, `FormField` |
| `ui/button.ts` | 22 | `../utils/format.ts`, `./types.ts` | `renderButton`, `ButtonGroup` |
| `ui/form.ts` | 30 | `./button.ts`, `../utils/validate.ts`, `./types.ts` | `Form`, `newForm` |
| `ui/dashboard.ts` | 22 | `./form.ts`, `./button.ts`, `../auth/session.ts`, `../payments/ledger.ts`, `../utils/format.ts` | `renderDashboard`, `isDashboardAccessible` |

Total LOC: 394. All files within the 10-120 LOC band.

## Import edge list (22 edges total, ≥12 required)

1. `auth/tokens.ts` → `utils/logger.ts`
2. `auth/session.ts` → `auth/tokens.ts`
3. `auth/session.ts` → `utils/logger.ts`
4. `auth/session.ts` → `auth/types.ts`
5. `auth/login.ts` → `auth/session.ts`
6. `auth/login.ts` → `auth/types.ts`
7. `auth/login.ts` → `utils/validate.ts`
8. `payments/ledger.ts` → `utils/logger.ts`
9. `payments/ledger.ts` → `payments/types.ts`
10. `payments/charge.ts` → `payments/ledger.ts`
11. `payments/charge.ts` → `utils/validate.ts`
12. `payments/charge.ts` → `utils/logger.ts`
13. `payments/charge.ts` → `payments/types.ts`
14. `payments/refund.ts` → `payments/ledger.ts`
15. `payments/refund.ts` → `payments/types.ts`
16. `payments/refund.ts` → `utils/logger.ts`
17. `ui/button.ts` → `utils/format.ts`
18. `ui/button.ts` → `ui/types.ts`
19. `ui/form.ts` → `ui/button.ts`
20. `ui/form.ts` → `utils/validate.ts`
21. `ui/form.ts` → `ui/types.ts`
22. `ui/dashboard.ts` → `ui/form.ts`
23. `ui/dashboard.ts` → `ui/button.ts`
24. `ui/dashboard.ts` → `auth/session.ts`
25. `ui/dashboard.ts` → `payments/ledger.ts`
26. `ui/dashboard.ts` → `utils/format.ts`

(26 edges when type-only imports are counted; 22 if you exclude the 4 `types.ts` edges
already implied by sibling non-type imports — either count clears the ≥12 bar.)

`utils/logger.ts` is imported by 5 files (`auth/tokens.ts`, `auth/session.ts`,
`payments/ledger.ts`, `payments/charge.ts`, `payments/refund.ts`) — the "utils imported by
many" fixture requirement.

`ui/dashboard.ts` has **zero importers** — nothing in the fixture imports it. It is the
top-of-tree entry-point-shaped file.

## Commit plan (`fixtures/build-fixture.mjs`)

Fixed author/committer: `Fixture Bot <fixture@example.com>`. Every commit is a real, non-empty
diff — commits 5 and 6 mutate an existing log-message string in place (same line count, so
LOC stays matched to the table above) in the payments files they claim to touch, rather than
re-adding unchanged content or using `--allow-empty`.

| # | Date (UTC) | Message | Files touched |
|---|---|---|---|
| 1 | 2024-01-01T12:00:00+00:00 | `utils: add logger, format, validate` | `utils/` |
| 2 | 2024-06-15T12:00:00+00:00 | `auth: add types, tokens, session, login` | `auth/` |
| 3 | 2024-12-01T12:00:00+00:00 | `ui: add types, button, form, dashboard` | `ui/` |
| 4 | 2025-04-10T12:00:00+00:00 | `payments: initial charge and ledger` | `payments/types.ts`, `payments/ledger.ts`, `payments/charge.ts` |
| 5 | 2025-10-20T12:00:00+00:00 | `payments: add refund flow` | `payments/refund.ts`, `payments/ledger.ts` |
| 6 | 2026-06-01T12:00:00+00:00 | `payments: rework ledger and charge handling` | `payments/ledger.ts`, `payments/charge.ts`, `payments/refund.ts` |

`payments/` is touched in commits 4, 5, and 6 — the designated churn hotspot (3 of 6
commits, 50%, vs. `utils/`, `auth/`, `ui/` at 1 commit each). Commit 6's date
(`2026-06-01T12:00:00+00:00`) is the fixed HEAD date — `git log -1 --format=%cI` on a
built fixture must equal it exactly.

`git log --oneline | wc -l` on a built fixture must equal `6`.
