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
