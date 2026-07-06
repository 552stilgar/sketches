// Headless smoke check for the gallery fleet (run: `npm run smoke`).
// Regenerates exactly the ships the gallery renders and asserts the invariants
// a browser-verify would eyeball: every ship is a non-empty SVG with all six
// layer groups, a legible hull-number decal, real shapes, and byte-stable
// output. Complements the vitest suite with a single gallery-shaped gate.
// Exits non-zero on the first broken invariant.

import { shipSVG, shipSpecs } from "../src/gen/ship.ts";
import { hexToSeed, seedToHex } from "../src/core/prng.ts";

// Mirror app/main.ts: the 8 pinned judgment seeds + the 12-ship fleet run.
const JUDGMENT_SEEDS = [
  "7a3f09c1", "d44e2b10", "01c9a5e7", "9b6d3f02",
  "5e0812aa", "c377fd54", "2f91b86d", "84a6c0e3",
];
const FLEET_BASE = 0x1f2a0001;
const FLEET_COUNT = 12;

const GROUP_IDS = ["hull", "detail", "shading", "kit", "paint"];
const HULLNUM_RE = /data-hull-number="(\d{2})"/;

const seeds = [
  ...JUDGMENT_SEEDS.map((h) => ({ tag: "judgment", seed: hexToSeed(h), hex: h })),
  ...Array.from({ length: FLEET_COUNT }, (_, i) => {
    const seed = FLEET_BASE + i;
    return { tag: "fleet", seed, hex: seedToHex(seed) };
  }),
];

const failures = [];
const fail = (hex, msg) => failures.push(`${hex}: ${msg}`);

for (const { seed, hex } of seeds) {
  const svg = shipSVG(seed);

  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) fail(hex, "not a well-formed SVG document");
  for (const id of GROUP_IDS) {
    if (!svg.includes(`-${id}">`)) fail(hex, `missing layer group: ${id}`);
  }

  // real geometry, not an empty shell
  const shapeCount = (svg.match(/<(polygon|rect|circle|line|ellipse)\b/g) ?? []).length;
  if (shapeCount < 20) fail(hex, `suspiciously few shapes (${shapeCount})`);

  // hull-number decal present and matches the registry format (no names, §8)
  const m = svg.match(HULLNUM_RE);
  if (!m) fail(hex, "no hull-number decal");
  else if (m[1] !== shipSpecs(seed).paint.hullNumber) fail(hex, `hull-number text ${m[1]} != spec`);

  // determinism: same seed -> byte-identical
  if (shipSVG(seed) !== svg) fail(hex, "non-deterministic output");
}

const total = seeds.length;
if (failures.length) {
  console.error(`SMOKE FAIL — ${failures.length}/${total} ships broke an invariant:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`SMOKE PASS — ${total} ships: all non-empty, 5 layer groups each, hull-number decal present, deterministic.`);
