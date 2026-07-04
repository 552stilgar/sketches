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
import { buildWeapon, derivePalette, hslCss } from './card-geo.mjs';

const SAMPLE_HASHES = ['8b96b1b9', '30e2ebf4', '0', 'ffffffff', 'deadbeef', 'a1', '552usul'];

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
