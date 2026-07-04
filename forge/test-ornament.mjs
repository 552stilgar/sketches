// ornament resolver behavior spec (endgame-axe slice — idea-to-design Phase 1).
// Reference: Usul's 2026-07-04 dark-fantasy axe image (ceiling target, ~75% parity).
// Direction locked 2026-07-04: BOTH media in lockstep · look is the CEILING, not baseline.
//
// Confirmed behaviors (tests added one at a time, RED before implementation):
//   B1 Ceiling distribution — resolveOrnament is deterministic; over N=200 seeded
//                             hashes 'plain' is the majority tier, 'ornate' a minority
//                             band (2–25%); pierce/veins appear ONLY at 'ornate';
//                             every plan field stays inside its documented range.
//   B2 Frozen-DNA invariant — reads only genes that exist in today's params object;
//                             same params → deep-equal plan; params never mutated.
//   B3 Pierce is honest     — every hole vertex strictly inside the outer ring;
//                             toPath(rings) emits two byte-deterministic subpaths;
//                             a point inside the hole is OUTSIDE the filled region.
//   B4 Pierce zoning        — piercePlacement keeps the cutout in the cheek zone:
//                             clear of the eye-collar circle and the edge arc.
//   B5 Uniform packing      — packOrnamentUniforms maps every plan field to exactly
//                             one float slot; null features pack to 0; round-trip
//                             readback matches the plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsFromHash, mulberry32, randHex } from './params.mjs';
import {
  resolveOrnament, piercePlacement, packOrnamentUniforms, unpackOrnamentUniforms,
} from './ornament.mjs';
import { bend, taper, pierce, toPath, distanceTo } from './craft-geo.mjs';

const TIERS = ['plain', 'worked', 'ornate'];

test('B1: ceiling distribution — plain majority, ornate minority, fields in range', () => {
  const rng = mulberry32(0xf00dcafe);
  const counts = { plain: 0, worked: 0, ornate: 0 };
  for (let i = 0; i < 200; i++) {
    const hash = randHex(8, rng);
    const p = paramsFromHash(hash);
    const plan = resolveOrnament(p);
    const plan2 = resolveOrnament(paramsFromHash(hash));
    assert.deepEqual(plan, plan2, `plan must be deterministic for #${hash}`);

    assert.ok(TIERS.includes(plan.tier), `tier "${plan.tier}" must be one of ${TIERS}`);
    counts[plan.tier]++;

    // ceiling gate: the expensive ornament layers exist only at the top band
    if (plan.tier !== 'ornate') {
      assert.equal(plan.pierce, null, `pierce only at ornate (#${hash}, ${plan.tier})`);
      assert.equal(plan.veins, 0, `veins only at ornate (#${hash}, ${plan.tier})`);
    } else {
      assert.ok(plan.pierce, `ornate must pierce (#${hash})`);
      assert.ok(plan.veins > 0, `ornate must vein (#${hash})`);
    }
    // veins imply damascus — gold filigree never floats on brushed steel
    if (plan.veins > 0) assert.ok(plan.damascus > 0, `veins require damascus (#${hash})`);

    // documented ranges
    for (const k of ['damascus', 'veins', 'edgeLight']) {
      assert.ok(plan[k] >= 0 && plan[k] <= 1, `${k}=${plan[k]} out of [0,1] (#${hash})`);
    }
    assert.ok(plan.edgeLight >= 0.35, `edgeLight must never drop below the 0.35 baseline (#${hash})`);
    assert.ok(Number.isInteger(plan.plateCollars) && plan.plateCollars >= 0 && plan.plateCollars <= 3,
      `plateCollars=${plan.plateCollars} out of 0..3 (#${hash})`);
    if (plan.pierce) {
      assert.ok(plan.pierce.t > 0 && plan.pierce.t < 1, `pierce.t=${plan.pierce.t} out of (0,1)`);
      assert.ok(plan.pierce.r > 0 && plan.pierce.r < 0.5, `pierce.r=${plan.pierce.r} out of (0,0.5)`);
    }
    if (plan.backFluke) {
      assert.ok(plan.backFluke.reach > 0 && plan.backFluke.reach <= 1, 'backFluke.reach out of (0,1]');
      assert.ok(plan.backFluke.droop >= 0 && plan.backFluke.droop <= 1, 'backFluke.droop out of [0,1]');
    }
  }
  assert.ok(counts.plain > 100, `plain must be the majority (got ${counts.plain}/200)`);
  const ornateFrac = counts.ornate / 200;
  assert.ok(ornateFrac >= 0.02 && ornateFrac <= 0.25,
    `ornate must be a real minority band, 2–25% (got ${(ornateFrac * 100).toFixed(1)}%)`);
});

test('B2: frozen-DNA invariant — existing genes only, no mutation', () => {
  const rng = mulberry32(0xbeefbeef);
  for (let i = 0; i < 50; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const before = JSON.stringify(p);
    // every gene the resolver touches must already exist in today's params
    const guarded = new Proxy(p, {
      get(target, key) {
        if (typeof key === 'string' && !(key in target)) {
          throw new Error(`resolveOrnament read non-existent gene "${key}" — DNA is frozen at 57`);
        }
        return target[key];
      },
    });
    const plan = resolveOrnament(guarded);
    assert.deepEqual(resolveOrnament(p), plan, 'same params must give a deep-equal plan');
    assert.equal(JSON.stringify(p), before, 'params must never be mutated');
    resolveOrnament(Object.freeze({ ...p })); // frozen input must not throw (no writes)
  }
});

test('B3: pierce is honest — hole inside outer, evenodd subpaths, fill semantics', () => {
  const outer = taper(bend([0, 0], [10, 0], 1.2), 2.2, 1.4);
  const hole = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    hole.push([5 + 0.6 * Math.cos(a), 0.5 + 0.6 * Math.sin(a)]);
  }
  const rings = pierce(outer, hole);
  assert.equal(rings.length, 2, 'pierce must return [outer, hole]');
  for (const v of rings[1]) {
    assert.ok(distanceTo(rings[0], v) < 0, `hole vertex ${v} must be strictly inside the outer ring`);
  }
  // toPath on rings: two byte-deterministic subpaths, one Z each
  const d1 = toPath(rings), d2 = toPath(pierce(outer, hole));
  assert.equal(d1, d2, 'rings path must be byte-deterministic');
  assert.equal((d1.match(/M/g) || []).length, 2, 'rings path must contain two subpaths');
  assert.equal((d1.match(/Z/g) || []).length, 2, 'each subpath must close');
  // fill semantics (the SDF-subtraction mirror): inside the hole = OUTSIDE the piece
  assert.ok(distanceTo(rings, [5, 0.5]) > 0, 'a point inside the hole must be outside the filled region');
  assert.ok(distanceTo(rings, [2, 0]) < 0, 'solid material away from the hole stays inside');
  assert.ok(distanceTo(rings, [5, 4]) > 0, 'points beyond the outer ring stay outside');
  // a hole that breaches the outer ring is a hard error, never silent geometry
  assert.throws(() => pierce(outer, hole.map(([x, y]) => [x + 8, y])),
    /pierce/, 'out-of-bounds hole must throw');
});

test('B4: pierce zoning — cutout stays in the cheek, clear of eye collar and edge arc', () => {
  const rng = mulberry32(0xdeadfa11);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 30; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const plan = resolveOrnament(p);
    if (!plan.pierce) continue;
    placed++;
    // head-local frame (mapAxe convention): eye collar at x=0 with radius eyeR,
    // edge arc out at x=edgeReach, cheek half-height halfH
    const geo = { eyeR: p.haft_r * 1.9, halfH: p.head_w * 0.5, edgeReach: p.head_w * 1.1 };
    const c = piercePlacement(plan, geo);
    assert.ok(c && c.r > 0, 'ornate plan + valid geometry must place a circle');
    const CLEAR = 0.008; // structural web the cutout must leave standing
    assert.ok(c.cx - c.r >= geo.eyeR + CLEAR,
      `hole (cx=${c.cx}, r=${c.r}) must stay clear of the eye collar (eyeR=${geo.eyeR})`);
    assert.ok(c.cx + c.r <= geo.edgeReach * 0.82,
      `hole (cx=${c.cx}, r=${c.r}) must stay out of the edge-bevel zone (reach=${geo.edgeReach})`);
    assert.ok(Math.abs(c.cy) + c.r <= geo.halfH * 0.75,
      `hole must stay inside the cheek vertically (cy=${c.cy}, r=${c.r}, halfH=${geo.halfH})`);
  }
  assert.ok(placed >= 20, `need a real sample of ornate placements (got ${placed})`);
  // a head too small to hold a structurally-sound hole must refuse, not shrink to nonsense
  const tiny = piercePlacement({ pierce: { t: 0.5, r: 0.14 } }, { eyeR: 0.06, halfH: 0.02, edgeReach: 0.08 });
  assert.equal(tiny, null, 'impossible geometry must return null, never a degenerate hole');
});

test('B5: uniform packing — one slot per field, nulls pack to 0, round-trip exact', () => {
  const rng = mulberry32(0x0ddba11);
  const seen = new Set();
  for (let i = 0; i < 400 && seen.size < 3; i++) {
    const plan = resolveOrnament(paramsFromHash(randHex(8, rng)));
    seen.add(plan.tier);
    const u = packOrnamentUniforms(plan);
    for (const [k, v] of Object.entries(u)) {
      assert.ok(k.startsWith('u_orn'), `uniform name "${k}" must carry the u_orn prefix`);
      assert.ok(typeof v === 'number' && Number.isFinite(v), `${k} must be a finite float`);
    }
    if (plan.pierce === null) {
      assert.equal(u.u_ornPierceOn, 0, 'null pierce packs to 0');
    }
    if (plan.backFluke === null) {
      assert.equal(u.u_ornFlukeOn, 0, 'null fluke packs to 0');
    }
    const back = unpackOrnamentUniforms(u);
    assert.deepEqual(back, plan, `round-trip must reproduce the plan exactly (tier ${plan.tier})`);
  }
  assert.equal(seen.size, 3, `packing must be exercised across all three tiers (saw: ${[...seen]})`);
});
