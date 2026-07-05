// FORGE — axe-head plan behavior spec (slice 1 of the endgame-reference queue:
// docs/reference-endgame-axe.md). The head finally goes through the Stage-B
// craft vocabulary: horns with recurve, a real beard hook, gothic eye cusps,
// bevel-band geometry, an ornate top spike, and the composed back structure
// (ring fluke: C-arm enclosing a true void). One numeric plan, both media.
//
// Public interface (axe-head.mjs):
//   resolveHeadPlan(p, ornPlan) -> {
//     hornTop: { reach, recurve },      // forward reach x edgeReach; tip curl 0..1
//     hornBottom: { reach, drop },      // drop: how far below -halfH the tip hooks
//     edgeBelly,                        // mid-edge forward bulge 0..1 (S-curve)
//     eyeCusps,                         // 0 | 2 | 3 — tier-gated gothic scallops
//     bevelBand,                        // polished band width, fraction of local depth
//     topSpike: null | { h, lean },     // x halfH; ornate always, worked+spike-poll
//     backForm: 'poll' | 'fluke' | 'ringFluke',
//   }
//   packHeadUniforms(plan) / unpackHeadUniforms(u) — exact inverses, u_hd* floats.
//
// Confirmed behaviors (RED before implementation, one at a time):
//   H1 Plan determinism + gating — existing genes only (Proxy guard); ranges
//      documented above hold over a seeded sweep; topSpike/ringFluke/eyeCusps
//      only at their tiers; backForm consistent with the ornament plan.
//   H5 Uniform bridge — pack -> unpack round-trips exactly; nulls pack to 0.
//   H2 Card outline craft — new buildHead outline is a simple polygon, passes
//      assertShapeRules (no straight-run violations) across a seeded sweep.
//   H3 Differentiation — bearded hooks below the cheek (hornBottom drop > 0),
//      war heads stay compact vs broad (smaller total reach), measurably.
//   H4 Honest ring void — ringFluke renders as evenodd rings whose void center
//      stays clear of the eye collar; cheek pierce is OFF when ringFluke is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsFromHash, mulberry32, randHex } from './params.mjs';
import { resolveOrnament } from './ornament.mjs';
import { resolveHeadPlan, packHeadUniforms, unpackHeadUniforms } from './axe-head.mjs';
import { buildWeapon } from './card-geo.mjs';
import { assertShapeRules } from './craft-geo.mjs';

function axeParams(hash, force = {}) {
  return { ...paramsFromHash(hash), weapon_class: 'axe', ...force };
}

test('H1: head plan — deterministic, gene-gated, documented ranges', () => {
  const rng = mulberry32(0x4ead);
  const seenBack = new Set(), seenCusps = new Set();
  for (let i = 0; i < 200; i++) {
    const hash = randHex(8, rng);
    const p = axeParams(hash);
    const orn = resolveOrnament(p);
    const guarded = new Proxy(p, {
      get(t, k) {
        if (typeof k === 'string' && !(k in t)) throw new Error(`head plan read non-existent gene "${k}"`);
        return t[k];
      },
    });
    const plan = resolveHeadPlan(guarded, orn);
    assert.deepEqual(resolveHeadPlan(p, orn), plan, `head plan must be deterministic (#${hash})`);

    assert.ok(plan.hornTop.reach > 0 && plan.hornTop.reach <= 1.6, `hornTop.reach=${plan.hornTop.reach}`);
    assert.ok(plan.hornTop.recurve >= 0 && plan.hornTop.recurve <= 1);
    assert.ok(plan.hornBottom.reach > 0 && plan.hornBottom.reach <= 1.6);
    assert.ok(plan.hornBottom.drop >= 0 && plan.hornBottom.drop <= 1, `drop=${plan.hornBottom.drop}`);
    assert.ok(plan.edgeBelly >= 0 && plan.edgeBelly <= 1);
    assert.ok(plan.bevelBand >= 0.06 && plan.bevelBand <= 0.2, `bevelBand=${plan.bevelBand}`);
    assert.ok([0, 2, 3].includes(plan.eyeCusps));
    seenCusps.add(plan.eyeCusps);
    seenBack.add(plan.backForm);

    // tier gates
    if (orn.tier === 'plain') {
      assert.equal(plan.eyeCusps, 0, 'plain heads carry no gothic cusps');
      assert.equal(plan.topSpike, null, 'plain heads carry no top spike');
      assert.notEqual(plan.backForm, 'ringFluke', 'ring fluke is an ornate form');
    }
    if (orn.tier === 'ornate') {
      assert.equal(plan.backForm, 'ringFluke', 'every ornate head composes the ring fluke');
      assert.ok(plan.topSpike && plan.topSpike.h > 0 && plan.topSpike.h <= 2.0, 'ornate must spike');
      assert.ok(Math.abs(plan.topSpike.lean) <= 0.35);
    }
    // backForm consistency with the ornament plan
    if (plan.backForm === 'fluke') {
      assert.ok(orn.backFluke, 'fluke form requires the ornament plan to carry fluke numbers');
    }
    // bearded heads hook below; others never do
    if (p.head_type === 'bearded') assert.ok(plan.hornBottom.drop > 0.1, `bearded must hook (#${hash})`);
    if (p.head_type === 'war') assert.equal(plan.hornBottom.drop, 0, 'war heads do not hook');
  }
  assert.ok(seenBack.size >= 2, `sweep must exercise multiple back forms (saw ${[...seenBack]})`);
  assert.ok(seenCusps.size >= 2, 'sweep must exercise cusp gating');
});

test('H5: uniform bridge — one slot per field, exact round-trip', () => {
  const rng = mulberry32(0xb41d6e);
  const seen = new Set();
  for (let i = 0; i < 600 && seen.size < 3; i++) {
    const p = axeParams(randHex(8, rng));
    const orn = resolveOrnament(p);
    const plan = resolveHeadPlan(p, orn);
    seen.add(plan.backForm);
    const u = packHeadUniforms(plan);
    for (const [k, v] of Object.entries(u)) {
      assert.ok(k.startsWith('u_hd'), `uniform "${k}" must carry the u_hd prefix`);
      assert.ok(typeof v === 'number' && Number.isFinite(v), `${k} must be a finite float`);
    }
    if (plan.topSpike === null) assert.equal(u.u_hdSpikeOn, 0);
    assert.deepEqual(unpackHeadUniforms(u), plan, `round-trip must be exact (${plan.backForm})`);
  }
  assert.equal(seen.size, 3, `packing must cover all back forms (saw ${[...seen]})`);
});

test('H2: card head outline — simple polygon, no straight runs, across a sweep', () => {
  const rng = mulberry32(0x2b0d1e5);
  let checked = 0;
  for (let i = 0; i < 300 && checked < 60; i++) {
    const p = axeParams(randHex(8, rng));
    if (p.head_type === 'double_bit') continue; // keeps its mirrored legacy build this slice
    checked++;
    const w = buildWeapon(p);
    const head = w.layers.find(l => l.role === 'head');
    assert.ok(head, 'head layer must carry role "head"');
    assert.ok(head.outline, 'head layer must expose its outline points for rule checks');
    const outer = Array.isArray(head.outline[0][0]) ? head.outline[0] : head.outline;
    assert.ok(outer.length >= 40, `head outline must be curve-sampled, not a 12-gon (got ${outer.length})`);
    const violations = assertShapeRules(outer, { maxStraightRun: 0.18 });
    assert.deepEqual(violations, [], `straight-run violation on #${w.format} head`);
  }
  assert.ok(checked >= 60, `need a real sweep (got ${checked})`);
});

test('H3: differentiation — beard hooks below, war stays compact', () => {
  const base = axeParams('8b96b1b9', { steel_finish: 'brushed', accent_on: 0 }); // plain tier
  const heightOf = (head_type) => {
    const w = buildWeapon({ ...base, head_type });
    const head = w.layers.find(l => l.role === 'head');
    const outer = Array.isArray(head.outline[0][0]) ? head.outline[0] : head.outline;
    const ys = outer.map(pt => pt[1]);
    const xs = outer.map(pt => pt[0]);
    return { ySpan: Math.max(...ys) - Math.min(...ys), xReach: Math.max(...xs) };
  };
  const bearded = heightOf('bearded');
  const broad = heightOf('broad');
  const war = heightOf('war');
  assert.ok(bearded.ySpan > broad.ySpan * 1.05, 'bearded hook must extend the vertical span past broad');
  assert.ok(war.xReach < broad.xReach * 0.92, 'war heads must stay compact vs broad');
});

test('H4: ring fluke — honest evenodd void, clear of the eye, replaces cheek pierce', () => {
  const rng = mulberry32(0x0c1a11);
  let seen = 0;
  for (let i = 0; i < 300 && seen < 12; i++) {
    const p = axeParams(randHex(8, rng), { steel_finish: 'damascus', accent_on: 1 }); // force ornate
    if (p.head_type === 'double_bit') continue;
    seen++;
    const w = buildWeapon(p);
    const ringLayers = w.layers.filter(l => l.fillRule === 'evenodd' && l.role === 'back');
    assert.equal(ringLayers.length, 1, 'ornate single-bit must compose exactly one ring-fluke plate');
    const rings = ringLayers[0].outline;
    assert.ok(Array.isArray(rings[0][0]) && rings.length === 2, 'back plate must be [outer, void] rings');
    const void_ = rings[1];
    const cx = void_.reduce((s, pt) => s + pt[0], 0) / void_.length;
    const cy = void_.reduce((s, pt) => s + pt[1], 0) / void_.length;
    assert.ok(cx < 0, `ring void must sit BEHIND the haft line (cx=${cx})`);
    const eyeR = p.haft_r * 1.9;
    assert.ok(Math.hypot(cx, 0) > eyeR, 'void center stays clear of the eye radius');
    // composed back replaces the cheek pierce — no second evenodd hole in the head
    const head = w.layers.find(l => l.role === 'head');
    assert.ok(!head.fillRule, 'cheek pierce must be OFF when the ring fluke carries the void');
  }
  assert.ok(seen >= 12, `need a real ornate sample (got ${seen})`);
});
