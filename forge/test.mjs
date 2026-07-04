// FORGE — design contract (usul-idea-to-design, 2026-07-03)
//
// Public interface (params.mjs, pure ESM, no DOM):
//   hashToSeed(hex: string) -> int32
//   mulberry32(seed: int) -> () => float [0,1)
//   randHex(n: int, rng?) -> hex string
//   DNA: ParamSpec[]  — ordered table; {key, section, min, max, decimals} or {key, section, options[]}
//   paramsFromHash(hash: string) -> params object (weapon_class + every DNA param, rolled in DNA order)
//   deriveLayout(params) -> assembly geometry (component anchors, total length) for shader + invariant checks
//   encodeToken(hash, params, baseParams) -> shareable token (hash, or hash~base64url(overrides))
//   decodeToken(token) -> { baseHash, overrides: [idx, value][] }
//   applyOverrides(params, overrides) -> params (clamped to DNA ranges)
//
// Behaviors under test:
//   B1 determinism — same hash -> deeply identical params, every time
//   B2 validity    — all params within DNA min/max, discrete values from allowed sets, no NaN anywhere
//   B3 coverage    — over ~500 random seeds, every archetype option of every discrete param appears
//   B4 assembly    — layout invariants hold: parts connect in order, total length bounded, all finite
//   B5 token       — decodeToken(encodeToken(...)) round-trips hash + overrides exactly
//
// Out of scope (browser-verify + Usul's eyes): metal material feel, silhouette quality, grid UI.
//
// v2 additions (2026-07-04) — advanced graphics slice:
//   DNA appends (indices 36-39): steel_finish (brushed×2 weighted / damascus / blued),
//     wear_amount, damascus_scale, damascus_warp — appended AFTER light_el so every
//     v1 hash keeps its existing 36 rolls bit-identical.
//   deriveMaterial(params) -> { finishIdx, wear, damascusScale, damascusWarp,
//     anisoStrength, baseRoughness } — pure shader-facing material block, mirrors
//     deriveLayout's role. Consumed as uniforms by the raymarcher.
//
//   B6 append-only  — golden fixtures: 3 known v1 hashes' first-36 params unchanged
//   B7 finish valid — new params in range; every steel_finish option rolled in 800 seeds
//   B8 material     — deriveMaterial: finite, deterministic, wear∈[0,1], aniso/roughness bounded
//   B9 token v2     — steel_finish + wear_amount overrides round-trip via share token
//
// Out of scope for v2 (eyes-gated): env reflection look, GGX lobe shape, wear placement,
//   damascus band aesthetics — the shader layer is verified in browser, not here.
//
// v4 additions (2026-07-04) — variability + detail slice:
//   DNA appends (indices 40-44): metal_family (steel×3 weighted / iron / bronze),
//     grip_material (leather×2 / cord / wire), guard_ext (inherit×2 / swept / ring),
//     engrave_on (0×3 / 1), engrave_density — appended AFTER damascus_warp so every
//     v1/v2 hash keeps its existing 40 rolls bit-identical.
//   deriveMaterial gains: familyIdx (0 steel / 1 iron / 2 bronze), gripIdx
//     (0 leather / 1 cord / 2 wire), engraveOn, engraveDensity; iron adds roughness.
//
//   B10 append-only v4 — golden fixtures: v2 finish rolls unchanged, 5 new keys appended
//   B11 v4 params valid — every new option rolled in 800 seeds, density in range
//   B12 material v4     — familyIdx/gripIdx contracts, iron rougher than steel, bounded
//
// Out of scope for v4 (eyes-gated): family color feel, wood grain, engraving aesthetics,
//   nick/rust/patina placement — shader layer, verified in browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { paramsFromHash, DNA, randHex, mulberry32, deriveLayout } from './params.mjs';

test('B1: same hash yields deeply identical params on every call', () => {
  const a = paramsFromHash('8b96b1b9');
  const b = paramsFromHash('8b96b1b9');
  assert.deepEqual(a, b);

  // and a different hash yields a different artifact
  const c = paramsFromHash('d740b6e3');
  assert.notDeepEqual(a, c);

  // stability across many invocations interleaved with other hashes
  for (let i = 0; i < 50; i++) {
    paramsFromHash(i.toString(16).padStart(8, '0'));
    assert.deepEqual(paramsFromHash('8b96b1b9'), a);
  }
});

test('B2: every param is in range / in its option set, no NaN', () => {
  const rng = mulberry32(0xb2b2b2b2);
  for (let i = 0; i < 300; i++) {
    const p = paramsFromHash(randHex(8, rng));
    for (const spec of DNA) {
      const v = p[spec.key];
      if (spec.options) {
        assert.ok(spec.options.includes(v), `${p.hash} ${spec.key}=${v} not in options`);
      } else {
        assert.ok(Number.isFinite(v), `${p.hash} ${spec.key}=${v} not finite`);
        assert.ok(v >= spec.min && v <= spec.max, `${p.hash} ${spec.key}=${v} outside [${spec.min},${spec.max}]`);
      }
    }
  }
});

test('B3: over 800 random seeds every discrete archetype appears (no dead DNA)', () => {
  const rng = mulberry32(0xc0ffee);
  const seen = new Map(DNA.filter(s => s.options).map(s => [s.key, new Set()]));
  for (let i = 0; i < 800; i++) {
    const p = paramsFromHash(randHex(8, rng));
    for (const [key, set] of seen) set.add(p[key]);
  }
  for (const spec of DNA) {
    if (!spec.options) continue;
    for (const opt of spec.options) {
      assert.ok(seen.get(spec.key).has(opt), `option ${spec.key}=${opt} never rolled in 800 seeds`);
    }
  }
});

test('B4: assembly invariants — parts connect, lengths bounded, all finite', () => {
  const rng = mulberry32(0xa55e4b1e);
  for (let i = 0; i < 300; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const L = deriveLayout(p);
    for (const [k, v] of Object.entries(L)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${p.hash} layout.${k}=${v} not finite`);
    }
    assert.equal(L.kind, p.weapon_class);
    if (L.kind === 'sword') {
      assert.ok(L.tipY > L.bladeRoot, `${p.hash} blade has no length`);
      assert.ok(L.gripBot < 0 && L.gripBot === -p.grip_len, `${p.hash} grip not below guard`);
      assert.ok(L.pommelY < L.gripBot, `${p.hash} pommel not below grip end`);
      assert.ok(p.guard_span > p.blade_w, `${p.hash} guard narrower than blade`);
      assert.ok(L.totalLen > 0.85 && L.totalLen < 1.9, `${p.hash} sword totalLen=${L.totalLen}`);
    } else {
      assert.ok(L.headY - L.headHalfH > 0.3 * p.haft_len, `${p.hash} axe head too low on haft`);
      assert.ok(L.headY + L.headHalfH <= p.haft_len + 1e-9, `${p.hash} axe head floats above haft`);
      assert.ok(L.edgeReach > p.haft_r * 2, `${p.hash} edge does not clear the haft`);
      assert.ok(L.totalLen > 0.55 && L.totalLen < 1.4, `${p.hash} axe totalLen=${L.totalLen}`);
    }
  }
});

// Golden v1 fixtures — captured from params.mjs BEFORE the v2 DNA append.
// If any of these drift, a v2 change broke every existing shared artifact.
const V1_GOLDEN = {
  '8b96b1b9': { weapon_class: 'axe', blade_type: 'scimitar', blade_len: 0.941, blade_w: 0.085, blade_taper: 0.57, blade_curve: 0.111, fuller_n: 2, fuller_depth: 0.32, tip_style: 'clip', guard_type: 'quillons', guard_span: 0.337, guard_thick: 0.026, guard_droop: 0.02, grip_len: 0.253, grip_r: 0.036, wrap_bands: 0, pommel_type: 'scent_stopper', pommel_r: 0.065, haft_len: 1.157, haft_r: 0.03, haft_curve: 0.071, haft_wrap: 0, head_type: 'double_bit', head_w: 0.203, edge_sweep: 0.48, beard_depth: 0.2, cheek_thick: 0.028, poll_type: 'spike', head_drop: 0.081, steel_hue: 220, steel_sat: 3, accent_on: 0, accent_hue: 41, light_az: -45, light_el: 22 },
  'd740b6e3': { weapon_class: 'sword', blade_type: 'longsword', blade_len: 1.297, blade_w: 0.114, blade_taper: 0.43, blade_curve: 0.158, fuller_n: 0, fuller_depth: 0.36, tip_style: 'clip', guard_type: 'bar', guard_span: 0.214, guard_thick: 0.029, guard_droop: 0.3, grip_len: 0.241, grip_r: 0.031, wrap_bands: 7, pommel_type: 'ring', pommel_r: 0.049, haft_len: 0.608, haft_r: 0.033, haft_curve: 0.082, haft_wrap: 0, head_type: 'war', head_w: 0.324, edge_sweep: 0.38, beard_depth: 0.15, cheek_thick: 0.041, poll_type: 'spike', head_drop: 0.091, steel_hue: 235, steel_sat: 3, accent_on: 1, accent_hue: 33, light_az: -50, light_el: 31 },
  '00c0ffee': { weapon_class: 'axe', blade_type: 'longsword', blade_len: 1.227, blade_w: 0.058, blade_taper: 0.19, blade_curve: 0.219, fuller_n: 0, fuller_depth: 0.27, tip_style: 'round', guard_type: 'bar', guard_span: 0.294, guard_thick: 0.032, guard_droop: 0.16, grip_len: 0.229, grip_r: 0.035, wrap_bands: 5, pommel_type: 'faceted', pommel_r: 0.056, haft_len: 1, haft_r: 0.032, haft_curve: 0.033, haft_wrap: 0, head_type: 'broad', head_w: 0.24, edge_sweep: 0.4, beard_depth: 0.33, cheek_thick: 0.048, poll_type: 'hammer', head_drop: 0.064, steel_hue: 194, steel_sat: 11, accent_on: 0, accent_hue: 40, light_az: 19, light_el: 45 },
};

test('B6: v2 DNA append preserves every v1 roll (golden fixtures) and adds the finish params', () => {
  // the four v2 params exist, appended after light_el (index 36+)
  const keys = DNA.map(s => s.key);
  const lightElIdx = keys.indexOf('light_el');
  for (const k of ['steel_finish', 'wear_amount', 'damascus_scale', 'damascus_warp']) {
    assert.ok(keys.indexOf(k) > lightElIdx, `${k} missing or not appended after light_el`);
  }

  // every golden v1 hash still rolls its original 36 params bit-identical
  for (const [hash, golden] of Object.entries(V1_GOLDEN)) {
    const p = paramsFromHash(hash);
    for (const [k, v] of Object.entries(golden)) {
      assert.deepEqual(p[k], v, `${hash} ${k}: v1 roll changed (${v} -> ${p[k]})`);
    }
  }
});

test('B7: finish params valid + every steel_finish rolled (incl. weighted brushed)', () => {
  const rng = mulberry32(0xf1215);
  const finishes = new Set();
  for (let i = 0; i < 800; i++) {
    const p = paramsFromHash(randHex(8, rng));
    finishes.add(p.steel_finish);
    assert.ok(p.wear_amount >= 0 && p.wear_amount <= 1, `${p.hash} wear_amount=${p.wear_amount}`);
    assert.ok(p.damascus_scale >= 18 && p.damascus_scale <= 60, `${p.hash} damascus_scale=${p.damascus_scale}`);
    assert.ok(p.damascus_warp >= 0.15 && p.damascus_warp <= 0.85, `${p.hash} damascus_warp=${p.damascus_warp}`);
  }
  for (const fin of ['brushed', 'damascus', 'blued']) {
    assert.ok(finishes.has(fin), `steel_finish=${fin} never rolled in 800 seeds`);
  }
});

test('B8: deriveMaterial — deterministic, finite, bounded shader-facing block', async () => {
  const { deriveMaterial } = await import('./params.mjs');
  const rng = mulberry32(0x8a7e21a1);
  for (let i = 0; i < 300; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const M = deriveMaterial(p);

    assert.deepEqual(M, deriveMaterial(p), `${p.hash} deriveMaterial not deterministic`);
    for (const [k, v] of Object.entries(M)) {
      assert.ok(Number.isFinite(v), `${p.hash} material.${k}=${v} not finite`);
    }
    assert.ok(Number.isInteger(M.finishIdx) && M.finishIdx >= 0 && M.finishIdx <= 2,
      `${p.hash} finishIdx=${M.finishIdx}`);
    assert.equal(M.wear, p.wear_amount, `${p.hash} wear should pass wear_amount through`);
    assert.equal(M.damascusScale, p.damascus_scale);
    assert.equal(M.damascusWarp, p.damascus_warp);
    assert.ok(M.anisoStrength >= 0 && M.anisoStrength <= 0.9, `${p.hash} aniso=${M.anisoStrength}`);
    assert.ok(M.baseRoughness >= 0.1 && M.baseRoughness <= 0.6, `${p.hash} roughness=${M.baseRoughness}`);
  }

  // finish maps to a stable index contract the shader branches on
  const base = paramsFromHash('8b96b1b9');
  assert.equal(deriveMaterial({ ...base, steel_finish: 'brushed' }).finishIdx, 0);
  assert.equal(deriveMaterial({ ...base, steel_finish: 'damascus' }).finishIdx, 1);
  assert.equal(deriveMaterial({ ...base, steel_finish: 'blued' }).finishIdx, 2);

  // polish ordering: an estoc (thrusting, polished) is smoother than a war axe
  const estoc = deriveMaterial({ ...base, weapon_class: 'sword', blade_type: 'estoc', steel_finish: 'brushed' });
  const war = deriveMaterial({ ...base, weapon_class: 'axe', head_type: 'war', steel_finish: 'brushed' });
  assert.ok(estoc.baseRoughness < war.baseRoughness, 'estoc should be more polished than a war axe');
});

test('B9: v2 finish params override + round-trip via share token', async () => {
  const { encodeToken, decodeToken, applyOverrides } = await import('./params.mjs');
  const base = paramsFromHash('8b96b1b9');

  const edited = { ...base, steel_finish: 'damascus', wear_amount: 0.85 };
  const tok = decodeToken(encodeToken('8b96b1b9', edited, base));
  assert.equal(tok.overrides.length, 2);
  const restored = applyOverrides(paramsFromHash(tok.baseHash), tok.overrides);
  assert.deepEqual(restored, edited);

  // a v1-era token (overrides only in the first 36 indices) still applies cleanly
  const v1edited = { ...base, blade_len: 1.2 };
  const v1restored = applyOverrides(paramsFromHash('8b96b1b9'),
    decodeToken(encodeToken('8b96b1b9', v1edited, base)).overrides);
  assert.deepEqual(v1restored, v1edited);
});

// Golden v2 fixtures — captured from params.mjs BEFORE the v4 DNA append.
const V2_GOLDEN = {
  '8b96b1b9': { steel_finish: 'blued', wear_amount: 0.48, damascus_scale: 27, damascus_warp: 0.76 },
  'd740b6e3': { steel_finish: 'brushed', wear_amount: 0.19, damascus_scale: 37, damascus_warp: 0.34 },
  '00c0ffee': { steel_finish: 'brushed', wear_amount: 0.77, damascus_scale: 54, damascus_warp: 0.16 },
};

test('B10: v4 DNA append preserves every v1+v2 roll and adds the variability params', () => {
  const keys = DNA.map(s => s.key);
  const warpIdx = keys.indexOf('damascus_warp');
  for (const k of ['metal_family', 'grip_material', 'guard_ext', 'engrave_on', 'engrave_density']) {
    assert.ok(keys.indexOf(k) > warpIdx, `${k} missing or not appended after damascus_warp`);
  }

  for (const [hash, golden] of Object.entries({ ...V1_GOLDEN })) {
    const p = paramsFromHash(hash);
    for (const [k, v] of Object.entries(golden)) {
      assert.deepEqual(p[k], v, `${hash} ${k}: v1 roll changed (${v} -> ${p[k]})`);
    }
    for (const [k, v] of Object.entries(V2_GOLDEN[hash])) {
      assert.deepEqual(p[k], v, `${hash} ${k}: v2 roll changed (${v} -> ${p[k]})`);
    }
  }
});

test('B11: v4 params valid + every new option rolled in 800 seeds', () => {
  const rng = mulberry32(0x44444);
  const seen = { metal_family: new Set(), grip_material: new Set(), guard_ext: new Set(), engrave_on: new Set() };
  for (let i = 0; i < 800; i++) {
    const p = paramsFromHash(randHex(8, rng));
    for (const k of Object.keys(seen)) seen[k].add(p[k]);
    assert.ok(p.engrave_density >= 0.3 && p.engrave_density <= 1.0, `${p.hash} engrave_density=${p.engrave_density}`);
  }
  for (const fam of ['steel', 'iron', 'bronze']) assert.ok(seen.metal_family.has(fam), `metal_family=${fam} never rolled`);
  for (const g of ['leather', 'cord', 'wire']) assert.ok(seen.grip_material.has(g), `grip_material=${g} never rolled`);
  for (const g of ['inherit', 'swept', 'ring']) assert.ok(seen.guard_ext.has(g), `guard_ext=${g} never rolled`);
  for (const e of [0, 1]) assert.ok(seen.engrave_on.has(e), `engrave_on=${e} never rolled`);
});

test('B12: deriveMaterial v4 — family/grip index contracts, iron rougher, still bounded', async () => {
  const { deriveMaterial } = await import('./params.mjs');
  const base = paramsFromHash('8b96b1b9');

  assert.equal(deriveMaterial({ ...base, metal_family: 'steel' }).familyIdx, 0);
  assert.equal(deriveMaterial({ ...base, metal_family: 'iron' }).familyIdx, 1);
  assert.equal(deriveMaterial({ ...base, metal_family: 'bronze' }).familyIdx, 2);
  assert.equal(deriveMaterial({ ...base, grip_material: 'leather' }).gripIdx, 0);
  assert.equal(deriveMaterial({ ...base, grip_material: 'cord' }).gripIdx, 1);
  assert.equal(deriveMaterial({ ...base, grip_material: 'wire' }).gripIdx, 2);

  // iron is a rougher working metal than polished steel, same weapon
  const steel = deriveMaterial({ ...base, weapon_class: 'sword', blade_type: 'arming', steel_finish: 'brushed', metal_family: 'steel' });
  const iron = deriveMaterial({ ...base, weapon_class: 'sword', blade_type: 'arming', steel_finish: 'brushed', metal_family: 'iron' });
  assert.ok(iron.baseRoughness > steel.baseRoughness, 'iron should be rougher than steel');

  // engrave passthrough + global bounds over many seeds
  const rng = mulberry32(0x12e4a);
  for (let i = 0; i < 300; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const M = deriveMaterial(p);
    assert.equal(M.engraveOn, p.engrave_on);
    assert.equal(M.engraveDensity, p.engrave_density);
    assert.ok(M.baseRoughness >= 0.1 && M.baseRoughness <= 0.6, `${p.hash} roughness=${M.baseRoughness}`);
    assert.ok(Number.isInteger(M.familyIdx) && M.familyIdx >= 0 && M.familyIdx <= 2, `${p.hash} familyIdx=${M.familyIdx}`);
    assert.ok(Number.isInteger(M.gripIdx) && M.gripIdx >= 0 && M.gripIdx <= 2, `${p.hash} gripIdx=${M.gripIdx}`);
  }
});

test('B5: share token round-trips hash + overrides exactly', async () => {
  const { encodeToken, decodeToken, applyOverrides } = await import('./params.mjs');
  const base = paramsFromHash('8b96b1b9');

  // no edits -> token is just the hash
  assert.equal(encodeToken('8b96b1b9', base, base), '8b96b1b9');
  assert.deepEqual(decodeToken('8b96b1b9'), { baseHash: '8b96b1b9', overrides: [] });

  // edited params -> token carries only the diff, and applying it restores them
  const edited = { ...base, blade_len: 1.111, guard_type: 'disc', steel_hue: 200 };
  const tok = decodeToken(encodeToken('8b96b1b9', edited, base));
  assert.equal(tok.baseHash, '8b96b1b9');
  assert.equal(tok.overrides.length, 3);
  const restored = applyOverrides(paramsFromHash(tok.baseHash), tok.overrides);
  assert.deepEqual(restored, edited);

  // overrides are clamped to DNA ranges on apply
  const idx = DNA.findIndex(s => s.key === 'blade_len');
  const wild = applyOverrides(paramsFromHash('8b96b1b9'), [[idx, 99]]);
  assert.equal(wild.blade_len, DNA[idx].max);

  // garbage after ~ degrades to base hash, never throws
  assert.deepEqual(decodeToken('8b96b1b9~%%%'), { baseHash: '8b96b1b9', overrides: [] });
});
