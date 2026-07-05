// FORGE — format resolver behavior spec (weapon-size variety from existing genes).
// Direction locked 2026-07-05: formats are pure EXPRESSION — the length gene the
// DNA already rolls (blade_len / haft_len) is quantized into size bands (the band
// IS the format, the leftover fraction is in-band length variation), and coupled
// genes (grip/guard/head/pommel) rescale coherently. No new genes, no new draws.
//
// Public interface (format.mjs):
//   resolveFormat(p) -> { format, t }
//     sword formats: dagger | shortsword | sword | longsword | greatsword
//     axe formats:   hatchet | axe | battleaxe | greataxe
//     t in [0,1] — position inside the band (t=0 possible at an exact-min roll)
//   applyFormat(p) -> p' — NEW object; driver gene remapped into the format's
//     target range, coupled genes multiplied, everything else passthrough.
//     p' carries `_format`; applying twice THROWS (no silent double-scaling).
//
// Confirmed behaviors (tests added one at a time, RED before implementation):
//   F1 Distribution — deterministic; over N=200 seeded hashes every format of
//                     both classes appears; the standard band is the plurality.
//   F2 Frozen DNA   — reads only existing genes (Proxy guard); input never
//                     mutated; frozen input never throws.
//   F3 Coupling     — effective driver ranges are DISJOINT and ordered across
//                     formats; within a format longer raw roll -> longer
//                     effective weapon; scaled values finite/positive; unscaled
//                     genes pass through byte-identical.
//   F4 Media        — buildWeapon consumes the plan: same base genes rolled to
//                     the dagger vs greatsword band produce (much) smaller
//                     bounds; the format name is exposed for the card badge.
//   F5 Invariance   — share tokens round-trip RAW genes untouched;
//                     applyFormat(applyFormat(p)) throws (single-application).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsFromHash, mulberry32, randHex, encodeToken, decodeToken, applyOverrides } from './params.mjs';
import { resolveFormat, applyFormat, SWORD_FORMATS, AXE_FORMATS } from './format.mjs';
import { buildWeapon } from './card-geo.mjs';

const SWORD_NAMES = SWORD_FORMATS.map(f => f.name);
const AXE_NAMES = AXE_FORMATS.map(f => f.name);

test('F1: distribution — deterministic, every format reachable, standards plural', () => {
  const rng = mulberry32(0xf047a7);
  const counts = {};
  for (let i = 0; i < 200; i++) {
    const hash = randHex(8, rng);
    const p = paramsFromHash(hash);
    const a = resolveFormat(p);
    assert.deepEqual(resolveFormat(paramsFromHash(hash)), a, `format must be deterministic for #${hash}`);
    const names = p.weapon_class === 'axe' ? AXE_NAMES : SWORD_NAMES;
    assert.ok(names.includes(a.format), `"${a.format}" must be a ${p.weapon_class} format`);
    assert.ok(a.t >= 0 && a.t <= 1, `t=${a.t} out of [0,1] (#${hash})`);
    counts[a.format] = (counts[a.format] || 0) + 1;
  }
  for (const name of [...SWORD_NAMES, ...AXE_NAMES]) {
    assert.ok(counts[name] > 0, `format "${name}" never appeared over 200 seeded rolls`);
  }
  const swordTotal = SWORD_NAMES.reduce((s, n) => s + (counts[n] || 0), 0);
  const axeTotal = AXE_NAMES.reduce((s, n) => s + (counts[n] || 0), 0);
  assert.ok(counts.sword >= Math.max(...SWORD_NAMES.filter(n => n !== 'sword').map(n => counts[n] || 0)),
    `standard sword must be the sword plurality (got ${JSON.stringify(counts)})`);
  assert.ok(counts.axe >= Math.max(...AXE_NAMES.filter(n => n !== 'axe').map(n => counts[n] || 0)),
    'standard axe must be the axe plurality');
  assert.equal(swordTotal + axeTotal, 200, 'every roll must land in exactly one format');
});

test('F2: frozen DNA — existing genes only, no mutation, frozen input ok', () => {
  const rng = mulberry32(0xdafbee);
  for (let i = 0; i < 50; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const before = JSON.stringify(p);
    const guarded = new Proxy(p, {
      get(target, key) {
        if (typeof key === 'string' && !(key in target)) {
          throw new Error(`format resolver read non-existent gene "${key}" — DNA is frozen`);
        }
        return target[key];
      },
    });
    const f = resolveFormat(guarded);
    const fp = applyFormat(guarded);
    assert.deepEqual(resolveFormat(p), f);
    assert.equal(fp._format, f.format, 'applied params must carry their format marker');
    assert.equal(JSON.stringify(p), before, 'params must never be mutated');
    resolveFormat(Object.freeze({ ...p }));
    applyFormat(Object.freeze({ ...p }));
  }
});

test('F3: coupling coherence — disjoint ordered bands, in-band monotonic, safe values', () => {
  const rng = mulberry32(0xc0113d);
  const byFormat = {};
  for (let i = 0; i < 400; i++) {
    const p = paramsFromHash(randHex(8, rng));
    const fp = applyFormat(p);
    const driver = p.weapon_class === 'axe' ? 'haft_len' : 'blade_len';
    (byFormat[fp._format] ||= []).push({ raw: p[driver], eff: fp[driver] });
    // every field: finite, positive where scaled, byte-identical where not
    const spec = (p.weapon_class === 'axe' ? AXE_FORMATS : SWORD_FORMATS).find(f => f.name === fp._format);
    const touched = new Set([driver, ...Object.keys(spec.mul), '_format']);
    for (const k of Object.keys(p)) {
      if (typeof p[k] === 'number') {
        assert.ok(Number.isFinite(fp[k]), `${k} not finite after applyFormat`);
      }
      if (!touched.has(k)) assert.deepEqual(fp[k], p[k], `untouched gene ${k} must pass through`);
      else if (k !== '_format' && typeof p[k] === 'number') {
        assert.ok(fp[k] > 0, `scaled gene ${k}=${fp[k]} must stay positive`);
      }
    }
  }
  // disjoint + ordered effective driver ranges, per class
  for (const names of [SWORD_NAMES, AXE_NAMES]) {
    for (let i = 1; i < names.length; i++) {
      const lo = byFormat[names[i - 1]], hi = byFormat[names[i]];
      if (!lo || !hi) continue; // F1 guarantees coverage at N=200; 400 here makes gaps unlikely
      const maxLo = Math.max(...lo.map(s => s.eff));
      const minHi = Math.min(...hi.map(s => s.eff));
      assert.ok(maxLo < minHi,
        `${names[i - 1]} effective lengths (max ${maxLo}) must sit below ${names[i]} (min ${minHi})`);
    }
  }
  // within a format: longer raw roll -> longer (never shorter) effective weapon
  for (const [name, samples] of Object.entries(byFormat)) {
    const sorted = samples.slice().sort((a, b) => a.raw - b.raw);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].eff >= sorted[i - 1].eff - 1e-9,
        `${name}: effective length must be monotonic in the raw roll`);
    }
  }
});

test('F4: media consumption — dagger shrinks bounds vs greatsword, badge exposed', () => {
  const base = paramsFromHash('8b96b1b9');
  const dagger = buildWeapon({ ...base, weapon_class: 'sword', blade_len: 0.71 });
  const great = buildWeapon({ ...base, weapon_class: 'sword', blade_len: 1.29 });
  assert.equal(dagger.format, 'dagger');
  assert.equal(great.format, 'greatsword');
  const h = b => b.bounds.maxY - b.bounds.minY;
  assert.ok(h(dagger) < h(great) * 0.55,
    `dagger (${h(dagger)}) must be far shorter than greatsword (${h(great)})`);

  const hatchet = buildWeapon({ ...base, weapon_class: 'axe', haft_len: 0.61 });
  const greataxe = buildWeapon({ ...base, weapon_class: 'axe', haft_len: 1.24 });
  assert.equal(hatchet.format, 'hatchet');
  assert.equal(greataxe.format, 'greataxe');
  assert.ok(h(hatchet) < h(greataxe) * 0.55, 'hatchet must be far shorter than greataxe');

  // determinism through the full media path
  assert.deepEqual(buildWeapon({ ...base, weapon_class: 'sword', blade_len: 0.71 }), dagger);
});

test('F5: token invariance + single application', () => {
  const base = paramsFromHash('8b96b1b9');
  const token = encodeToken('8b96b1b9', { ...base, blade_len: 0.72 }, base);
  const { baseHash, overrides } = decodeToken(token);
  const pOver = applyOverrides(paramsFromHash(baseHash), overrides);
  // format derivation must not leak into the raw-gene token layer
  assert.equal(pOver.blade_len, 0.72, 'tokens carry RAW genes, untouched by format');
  // formatting an overridden roll == formatting is downstream of overrides
  const fp = applyFormat(pOver);
  assert.equal(fp._format, resolveFormat(pOver).format);
  // double application is a hard error, never silent double-scaling
  assert.throws(() => applyFormat(fp), /format/i, 'applyFormat twice must throw');
});
