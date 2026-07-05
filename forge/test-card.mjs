// FORGE — Lane S design contract (card-geo.mjs, SVG loot-card MEDIUM)
//
// Public interface (card-geo.mjs, pure ESM, no DOM):
//   buildWeapon(params) -> { kind: 'sword'|'axe', layers, bounds }
//     layers: ordered back-to-front { d, fill, stroke, strokeWidth, opacity }[]
//     bounds: { minX, maxX, minY, maxY } in model space (y-up, deriveLayout convention)
//   derivePalette(params) -> { base, shade, highlight, accent, trim, grip } — each {h,s,l}
//   hslCss(hsl, alpha=1) -> CSS color string
//
// Behaviors under test:
//   C1 determinism  — same hash -> deeply identical layer list, every time
//   C2 layer floor  — every weapon_class (and every archetype within it) produces >= 5 layers
//   C3 finite paths — every path's numeric tokens are finite; bounds are finite and well-ordered
//   C4 palette sane — derivePalette bounded/finite for all 3 metal families + both accent states
//   C5 v6 genes read — ricasso_len, quillon_curl, langets, pommel_facets visibly change output
//
// Out of scope (eyes-gated): silhouette craft/aesthetics, palette taste, card.html layout —
// this file verifies the medium doesn't crash and the DNA demonstrably drives it, nothing more.

import test from 'node:test';
import assert from 'node:assert/strict';
import { paramsFromHash, randHex, mulberry32, DNA } from './params.mjs';
import {
  buildWeapon, derivePalette, hslCss,
  haftSpine, haftOutline, haftButtCapOutline, HAFT_BUTT_R_MUL, HAFT_BUTT_EXTEND,
  gripSpine, gripOutline, gripHalfWidthAt, gripFerruleOutline, FERRULE_HEIGHT_MUL,
} from './card-geo.mjs';
import { assertShapeRules } from './craft-geo.mjs';
import { HAFT_CURVE_TAME } from './axe-head.mjs';

const SAMPLE_HASHES = ['8b96b1b9', '30e2ebf4', '0', 'ffffffff', 'deadbeef', 'a1', '552usul'];

// segment-intersection helper (proper crossings only, shared endpoints excluded) —
// mirrors test-craft.mjs's own isSimplePolygon idiom, duplicated here since it's a
// small self-contained test check and these files don't share a test-utils module.
function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function isSimplePolygon(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

function numericTokensOf(d) {
  return (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}

test('C1: determinism — same hash produces deeply identical layers, repeatedly', () => {
  for (const hash of SAMPLE_HASHES) {
    const p = paramsFromHash(hash);
    const a = buildWeapon(paramsFromHash(hash));
    const b = buildWeapon(p);
    assert.deepEqual(a, b, `hash ${hash} produced different geometry on repeat calls`);
  }
});

test('C2: every weapon_class produces >= 5 layers, across a wide seed sweep', () => {
  const rng = mulberry32(0xC0FFEE);
  const seenClass = { sword: 0, axe: 0 };
  const minLayers = { sword: Infinity, axe: Infinity };
  for (let i = 0; i < 1500; i++) {
    const hash = randHex(8, rng);
    const p = paramsFromHash(hash);
    const w = buildWeapon(p);
    seenClass[w.kind]++;
    minLayers[w.kind] = Math.min(minLayers[w.kind], w.layers.length);
    assert.ok(w.layers.length >= 5, `${hash} (${w.kind}) produced only ${w.layers.length} layers`);
  }
  assert.ok(seenClass.sword > 0 && seenClass.axe > 0, 'sweep did not hit both weapon classes');
  assert.ok(minLayers.sword >= 5 && minLayers.axe >= 5);
});

test('C2b: layer floor holds for every discrete archetype combination (worst-case gene rolls)', () => {
  // Force every options-kind gene to its first (neutral/legacy) value and every
  // range-kind gene to its minimum, per weapon_class x blade_type x head_type x
  // tip_style x guard_type x pommel_type x poll_type x cheek_profile combination —
  // this is the "everything optional turned off" floor case.
  const base = paramsFromHash('8b96b1b9');
  const neutral = { ...base };
  for (const spec of DNA) {
    neutral[spec.key] = spec.options ? spec.options[0] : spec.min;
  }
  for (const weapon_class of ['sword', 'axe']) {
    const bladeTypes = weapon_class === 'sword' ? DNA.find(s => s.key === 'blade_type').options : [neutral.blade_type];
    const headTypes = weapon_class === 'axe' ? DNA.find(s => s.key === 'head_type').options : [neutral.head_type];
    for (const blade_type of bladeTypes) {
      for (const head_type of headTypes) {
        const p = { ...neutral, weapon_class, blade_type, head_type };
        const w = buildWeapon(p);
        assert.ok(w.layers.length >= 5, `neutral ${weapon_class}/${blade_type}/${head_type} only produced ${w.layers.length} layers`);
      }
    }
  }
});

test('C3: every path is finite, well-formed, and bounds are sane', () => {
  const rng = mulberry32(777);
  for (let i = 0; i < 400; i++) {
    const hash = randHex(8, rng);
    const p = paramsFromHash(hash);
    const w = buildWeapon(p);
    for (const layer of w.layers) {
      assert.equal(typeof layer.d, 'string');
      assert.ok(layer.d.length > 0, `empty path d for ${hash}`);
      assert.ok(/^M/.test(layer.d), `path does not start with M for ${hash}: ${layer.d}`);
      for (const n of numericTokensOf(layer.d)) {
        assert.ok(Number.isFinite(n), `non-finite coordinate ${n} in ${hash}: ${layer.d}`);
      }
      assert.equal(typeof layer.fill, 'string');
      assert.equal(typeof layer.stroke, 'string');
      assert.ok(Number.isFinite(layer.strokeWidth));
      assert.ok(Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1);
    }
    const { minX, maxX, minY, maxY } = w.bounds;
    for (const v of [minX, maxX, minY, maxY]) assert.ok(Number.isFinite(v), `non-finite bound in ${hash}`);
    assert.ok(maxX > minX, `degenerate X bounds for ${hash}`);
    assert.ok(maxY > minY, `degenerate Y bounds for ${hash}`);
  }
});

test('C4: derivePalette is bounded and finite for all 3 metal families x both accent states x finishes', () => {
  const base = paramsFromHash('8b96b1b9');
  const finishes = ['brushed', 'damascus', 'blued'];
  for (const metal_family of ['steel', 'iron', 'bronze']) {
    for (const accent_on of [0, 1]) {
      for (const steel_finish of finishes) {
        const p = { ...base, metal_family, accent_on, steel_finish };
        const pal = derivePalette(p);
        for (const key of ['base', 'shade', 'highlight', 'accent', 'trim', 'grip']) {
          const c = pal[key];
          assert.ok(Number.isFinite(c.h), `${key}.h not finite for ${metal_family}/${steel_finish}`);
          assert.ok(Number.isFinite(c.s) && c.s >= 0 && c.s <= 100, `${key}.s out of bounds for ${metal_family}`);
          assert.ok(Number.isFinite(c.l) && c.l >= 0 && c.l <= 100, `${key}.l out of bounds for ${metal_family}`);
          const css = hslCss(c);
          assert.ok(/^hsl\(/.test(css));
        }
        // shade is always darker than highlight (flat 3-4 tone shading contract)
        assert.ok(pal.shade.l < pal.highlight.l, `shade not darker than highlight for ${metal_family}/${steel_finish}`);
      }
    }
  }
});

test('C5: v6 genes visibly change the SVG output relative to their neutral value', () => {
  const base = paramsFromHash('8b96b1b9');

  // ricasso_len: a real ricasso should change the blade outline
  const noRicasso = buildWeapon({ ...base, weapon_class: 'sword', ricasso_len: 0 });
  const withRicasso = buildWeapon({ ...base, weapon_class: 'sword', ricasso_len: 0.15 });
  assert.notDeepEqual(noRicasso.layers, withRicasso.layers, 'ricasso_len did not change sword geometry');

  // quillon_curl: only meaningful when guard_type is quillons
  const straight = buildWeapon({ ...base, weapon_class: 'sword', guard_type: 'quillons', quillon_curl: 0 });
  const curled = buildWeapon({ ...base, weapon_class: 'sword', guard_type: 'quillons', quillon_curl: 0.7 });
  assert.notDeepEqual(straight.layers, curled.layers, 'quillon_curl did not change guard geometry');

  // langets: langet_len above the visibility floor should add layers vs. none
  const noLangets = buildWeapon({ ...base, weapon_class: 'axe', langet_len: 0 });
  const withLangets = buildWeapon({ ...base, weapon_class: 'axe', langet_len: 0.2 });
  assert.ok(withLangets.layers.length > noLangets.layers.length, 'langet_len did not add layers');

  // pommel_facets: only meaningful when pommel_type is faceted; facet count changes vertex count
  const facet6 = buildWeapon({ ...base, weapon_class: 'sword', pommel_type: 'faceted', pommel_facets: 6 });
  const facet10 = buildWeapon({ ...base, weapon_class: 'sword', pommel_type: 'faceted', pommel_facets: 10 });
  assert.notEqual(facet6.layers[0].d, facet10.layers[0].d, 'pommel_facets did not change the pommel polygon');
});

// ---------------------------------------------------------------------------
// Stage B — card-geo now flows its SPINED parts through craft-geo.mjs (bend/
// sweep/collar). These tests cover the craft-geo integration itself: the haft
// spine's curved outline still obeys the shape rule, the grip's swept outline
// stays simple and its width profile still orders waisted < straight < barrel,
// and the collar-derived trim layers (butt cap, ferrule) stay local to their
// anchor point — the same "zoning" invariant craft-geo's own B4 test encodes,
// re-checked here at card-geo's two concrete call sites.
// ---------------------------------------------------------------------------

test('D1: haft is head-anchored and near-straight by design (slice 6 composition)', () => {
  // slice 6 replaced the cantilever bow with a head-anchored, tamed spine:
  // the top of the haft meets the eye at x=0, the base drifts by the tamed
  // offset, and a real (if subtle) bow survives. The old "must pass the
  // straight-run rule" assertion no longer applies — near-straight is the
  // deliberate reference read, not a craft failure.
  const base = paramsFromHash('8b96b1b9');
  const p = { ...base, weapon_class: 'axe', haft_curve: 0.14, haft_len: 1.0 };
  const spine = haftSpine(p);
  const top = spine.evalAt(1), bot = spine.evalAt(0);
  assert.ok(Math.abs(top[0]) < 1e-9, `haft top must meet the head at x=0 (got ${top[0]})`);
  const expected = -p.haft_curve * p.haft_len * HAFT_CURVE_TAME;
  assert.ok(Math.abs(bot[0] - expected) < 1e-9, `base must drift by the tamed offset (got ${bot[0]}, want ${expected})`);
  const outline = haftOutline(p);
  assert.ok(Array.isArray(outline) && outline.length >= 16, 'haftOutline must return a sampled polygon');
  const mid = spine.evalAt(0.5);
  const chordMidX = (top[0] + bot[0]) / 2;
  assert.ok(Math.abs(mid[0] - chordMidX) > 1e-4, 'the haft must still carry a real (if subtle) bow');
});

test('D2: grip outline is a simple polygon (straight profile, curved risers)', () => {
  const base = paramsFromHash('8b96b1b9');
  const p = { ...base, weapon_class: 'sword', grip_profile: 'straight', grip_risers: 6, grip_r: 0.03, grip_len: 0.3, guard_thick: 0.03 };
  const outline = gripOutline(p, -p.guard_thick / 2, -p.grip_len);
  assert.ok(isSimplePolygon(outline), 'grip outline must not self-intersect');

  // also check the waisted profile — its narrower waist is the shape most likely
  // to pinch into a self-intersection if the sweep math were wrong
  const waisted = { ...p, grip_profile: 'waisted' };
  assert.ok(isSimplePolygon(gripOutline(waisted, -waisted.guard_thick / 2, -waisted.grip_len)));
});

test('D2b: grip half-width at mid-grip orders waisted < straight < barrel', () => {
  const base = paramsFromHash('8b96b1b9');
  const mk = grip_profile => ({ ...base, weapon_class: 'sword', grip_profile, grip_risers: 0, grip_r: 0.03 });
  const waisted = gripHalfWidthAt(mk('waisted'), 0.5);
  const straight = gripHalfWidthAt(mk('straight'), 0.5);
  const barrel = gripHalfWidthAt(mk('barrel'), 0.5);
  assert.ok(waisted < straight, `waisted half-width ${waisted} must be < straight ${straight} at mid-grip`);
  assert.ok(straight < barrel, `straight half-width ${straight} must be < barrel ${barrel} at mid-grip`);
});

// ---------------------------------------------------------------------------
// E — ornament wiring (endgame-axe slice). buildWeapon consumes the ornament
// plan (resolveOrnament) so the card medium renders tier/pierce/fluke/collars/
// damascus/veins/edge-light. Ornament layers carry a `role` tag so craft-loop
// directives ("fewer veins") map onto named layer groups, and so these tests
// don't have to fingerprint stroke widths.
// ---------------------------------------------------------------------------

test('E1: ornate single-bit axe pierces the cheek with an evenodd ring pair', () => {
  const rng = mulberry32(0xacce55);
  let pierced = 0, checked = 0;
  for (let i = 0; i < 400 && pierced < 8; i++) {
    const p = { ...paramsFromHash(randHex(8, rng)), weapon_class: 'axe', steel_finish: 'damascus', accent_on: 1 };
    if (p.head_type === 'double_bit') continue;
    checked++;
    const w = buildWeapon(p);
    assert.equal(w.tier, 'ornate');
    const ringLayers = w.layers.filter(l => l.fillRule === 'evenodd');
    if (ringLayers.length === 0) continue; // placement may legitimately refuse (small head)
    pierced++;
    for (const l of ringLayers) {
      assert.equal((l.d.match(/M/g) || []).length, 2, 'pierced head must carry exactly two subpaths');
      assert.equal((l.d.match(/Z/g) || []).length, 2, 'both subpaths must close');
    }
    assert.deepEqual(buildWeapon(p), w, 'pierced axe must stay deterministic');
  }
  assert.ok(pierced >= 8, `need a real pierced sample (got ${pierced}/${checked} checked)`);
});

test('E2: ornament tiers add role-tagged layers — ornate > plain on the same base genes', () => {
  for (const weapon_class of ['sword', 'axe']) {
    const base = { ...paramsFromHash('8b96b1b9'), weapon_class };
    const plain = buildWeapon({ ...base, steel_finish: 'brushed', accent_on: 0 });
    const ornate = buildWeapon({ ...base, steel_finish: 'damascus', accent_on: 1 });
    assert.equal(plain.tier, 'plain', `${weapon_class} brushed/no-accent must resolve plain`);
    assert.equal(ornate.tier, 'ornate', `${weapon_class} damascus+accent must resolve ornate`);
    assert.ok(ornate.layers.length > plain.layers.length,
      `${weapon_class}: ornate must add layers (${ornate.layers.length} vs ${plain.layers.length})`);
    const roles = new Set(ornate.layers.map(l => l.role).filter(Boolean));
    assert.ok(roles.has('damascus'), `${weapon_class}: ornate must carry damascus etch layers`);
    assert.ok(roles.has('vein'), `${weapon_class}: ornate must carry gold vein layers`);
    // plain carries no ornament-role layers at all
    assert.ok(plain.layers.every(l => !l.role), `${weapon_class}: plain must carry zero ornament layers`);
  }
});

test('E3: ornate axe gets back fluke + stacked plate collars (single-bit heads)', () => {
  const rng = mulberry32(0xf1ee7);
  let seen = 0;
  for (let i = 0; i < 200 && seen < 10; i++) {
    const p = { ...paramsFromHash(randHex(8, rng)), weapon_class: 'axe', steel_finish: 'damascus', accent_on: 1 };
    if (p.head_type === 'double_bit') continue;
    seen++;
    const w = buildWeapon(p);
    const roles = w.layers.map(l => l.role).filter(Boolean);
    // slice 1 composed the ornate back: ring-fluke plate ('back') replaced the bare fluke
    assert.ok(roles.filter(r => r === 'back').length >= 3,
      'every ornate single-bit axe must compose the ring-fluke back (neck + ring + points)');
    const collars = roles.filter(r => r === 'collar').length;
    assert.ok(collars >= 2 && collars <= 3, `ornate haft must stack 2-3 plate collars (got ${collars})`);
    assert.ok(roles.includes('edge-light'), 'ornate axe must carry the edge-light stroke');
    assert.ok(roles.includes('spike'), 'every ornate single-bit axe must carry the top spike');
  }
  assert.ok(seen >= 10, `need a real ornate axe sample (got ${seen})`);
});

test('D3: collar-derived layers (haft butt cap, grip ferrule) stay within a local neighborhood of their anchor', () => {
  const base = paramsFromHash('8b96b1b9');

  // haft butt cap: anchored near the very base of the haft spine
  const axeP = { ...base, weapon_class: 'axe', haft_curve: 0.1, haft_len: 1.0, haft_butt: 1 };
  const haftAnchor = haftSpine(axeP).evalAt(0.01);
  const capW = axeP.haft_r * HAFT_BUTT_R_MUL;
  const capReach = Math.hypot(HAFT_BUTT_EXTEND / 2, capW) + 0.01; // corner radius + slack
  const cap = haftButtCapOutline(axeP);
  assert.ok(cap.length >= 4);
  for (const pt of cap) {
    const d = Math.hypot(pt[0] - haftAnchor[0], pt[1] - haftAnchor[1]);
    assert.ok(d <= capReach, `butt cap point ${pt} is ${d} from anchor — beyond reach ${capReach}`);
  }

  // grip ferrule: anchored near the guard end of the grip spine
  const swordP = { ...base, weapon_class: 'sword', ferrule_on: 1, grip_r: 0.03, grip_len: 0.3, guard_thick: 0.03, grip_profile: 'straight' };
  const gripTopY = -swordP.guard_thick / 2, gripBotY = -swordP.grip_len;
  const len = gripTopY - gripBotY;
  const h = swordP.grip_r * FERRULE_HEIGHT_MUL;
  const tCenter = (h / 2) / len;
  const ferruleAnchor = gripSpine(swordP, gripTopY, gripBotY).evalAt(tCenter);
  const ferruleW = swordP.grip_r * 1.05;
  const ferruleReach = Math.hypot(h / 2, ferruleW) + 0.01;
  const ferrule = gripFerruleOutline(swordP, gripTopY, gripBotY);
  assert.ok(ferrule.length >= 4);
  for (const pt of ferrule) {
    const d = Math.hypot(pt[0] - ferruleAnchor[0], pt[1] - ferruleAnchor[1]);
    assert.ok(d <= ferruleReach, `ferrule point ${pt} is ${d} from anchor — beyond reach ${ferruleReach}`);
  }
});
