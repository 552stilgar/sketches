// craft-geo behavior spec (Stage B design contract — idea-to-design Phase 1).
// Spec doc: docs/specs/forge-game-ready-craft-2026-07-04.md
//
// Confirmed behaviors (each is one test below; written RED before implementation):
//   B1 Determinism      — identical inputs → byte-identical toPath string.
//   B2 Bend is honest   — spine hits its endpoints; max deviation from the
//                         chord equals sagitta within ε; arc length sane;
//                         mid-tangent parallel to the chord (symmetric bow).
//   B3 Sweep respects   — for a straight spine, points at ±(widthFn(t)∓δ)
//      the profile        classify inside/outside via distanceTo; outline is
//                         a simple polygon (no self-intersection).
//   B4 Collar stays     — collar geometry never extends beyond its local
//      local              neighborhood of spine.evalAt(t) (the zoning lesson,
//                         encoded at the geometry layer this time).
//   B5 Shape rule is    — assertShapeRules flags a rectangle's straight runs
//      testable           and passes a genuinely curved taper outline.
//   B6 distanceTo sign  — negative on the spine, positive off the outline,
//                         magnitude ≈ true distance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bend, sweep, taper, collar, toPath, distanceTo, assertShapeRules,
} from './craft-geo.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// segment intersection helper (proper crossings only, shared endpoints excluded)
function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function isSimplePolygon(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (they share an endpoint), incl. the closing wrap
      if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
      if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

test('B1: determinism — same inputs give a byte-identical SVG path', () => {
  const mk = () => toPath(taper(bend([0, 0], [10, 0], 1.2), 1.0, 0.3));
  const p1 = mk(), p2 = mk();
  assert.equal(typeof p1, 'string');
  assert.equal(p1, p2);
  assert.match(p1, /^M[-\d.]/, 'path must start with M<number>');
  assert.match(p1, /Z$/, 'path must close with Z');
  assert.ok(!/\d\.\d{4,}/.test(p1), 'coordinates must be rounded to ≤3 decimals');
});

test('B2: bend is honest — endpoints, sagitta, length, mid-tangent', () => {
  const p0 = [0, 0], p1 = [10, 0], sag = 1.5;
  const spine = bend(p0, p1, sag);
  assert.ok(dist(spine.evalAt(0), p0) < 1e-9, 'evalAt(0) must be p0');
  assert.ok(dist(spine.evalAt(1), p1) < 1e-9, 'evalAt(1) must be p1');
  // chord is the x-axis → deviation is |y|; max over a dense sample = sagitta
  let maxDev = 0;
  for (let i = 0; i <= 512; i++) maxDev = Math.max(maxDev, Math.abs(spine.evalAt(i / 512)[1]));
  assert.ok(Math.abs(maxDev - sag) < 1e-3, `max chord deviation ${maxDev} must equal sagitta ${sag}`);
  // arc length: longer than the chord, shorter than a gross overshoot
  assert.ok(spine.length > 10 && spine.length < 11.2, `length ${spine.length} out of sane range`);
  // symmetric bow → tangent at t=0.5 is parallel to the chord
  const tg = spine.tangentAt(0.5);
  assert.ok(Math.abs(Math.hypot(tg[0], tg[1]) - 1) < 1e-6, 'tangent must be unit');
  assert.ok(Math.abs(tg[0]) > 0.999, 'mid-tangent must be parallel to the chord');
  // normal is tangent rotated +90°
  const nm = spine.normalAt(0.5);
  assert.ok(Math.abs(nm[0] + tg[1]) < 1e-9 && Math.abs(nm[1] - tg[0]) < 1e-9);
});

test('B3: sweep respects the width profile and stays a simple polygon', () => {
  const straight = bend([0, 0], [10, 0], 0);
  const widthFn = (t) => 1 + 0.5 * Math.sin(Math.PI * t);
  const outline = sweep(straight, widthFn);
  assert.ok(Array.isArray(outline) && outline.length >= 16, 'outline must be a sampled polygon');
  for (const t of [0.25, 0.5, 0.75]) {
    const w = widthFn(t), x = 10 * t;
    assert.ok(distanceTo(outline, [x, w - 0.05]) < 0, `[${x}, ${w - 0.05}] must be inside`);
    assert.ok(distanceTo(outline, [x, w + 0.05]) > 0, `[${x}, ${w + 0.05}] must be outside`);
    assert.ok(distanceTo(outline, [x, -w + 0.05]) < 0, 'must be symmetric about the spine (−side inside)');
    assert.ok(distanceTo(outline, [x, -w - 0.05]) > 0, 'must be symmetric about the spine (−side outside)');
  }
  assert.ok(isSimplePolygon(outline), 'swept outline must not self-intersect');
  const bent = taper(bend([0, 0], [10, 0], 1.2), 1.0, 0.3);
  assert.ok(isSimplePolygon(bent), 'bent taper must not self-intersect');
});

test('B4: collar stays local — never beyond its own neighborhood', () => {
  const spine = bend([0, 0], [0, 10], 1.0);
  const t = 0.85, w = 1.2, h = 0.8;
  const band = collar(spine, t, w, h);
  assert.ok(Array.isArray(band) && band.length >= 4, 'collar must be an outline');
  const center = spine.evalAt(t);
  const reach = Math.hypot(h / 2, w) + 0.3; // corner radius + curvature slack
  for (const p of band) {
    assert.ok(dist(p, center) <= reach,
      `collar point ${p} is ${dist(p, center)} from center — beyond reach ${reach}`);
  }
  assert.ok(isSimplePolygon(band), 'collar outline must not self-intersect');
});

test('B5: shape rule is testable — rectangles flagged, curved sweeps pass', () => {
  const rect = [[0, 0], [10, 0], [10, 2], [0, 2]];
  const flags = assertShapeRules(rect);
  assert.ok(Array.isArray(flags) && flags.length > 0, 'rectangle must violate the straight-run rule');
  assert.equal(flags[0].type, 'straight-run');
  assert.ok(flags[0].frac > 0.15, 'reported run fraction must exceed the 15% rule');
  const curved = taper(bend([0, 0], [10, 0], 1.2), 1.0, 0.3);
  assert.deepEqual(assertShapeRules(curved), [], 'a genuinely curved outline must pass clean');
});

test('B6: distanceTo — signed, with true magnitude', () => {
  const outline = taper(bend([0, 0], [10, 0], 0), 1.0, 1.0); // constant half-width 1 slab
  const inside = distanceTo(outline, [5, 0]);
  assert.ok(inside < 0, 'spine point must be inside');
  assert.ok(Math.abs(inside + 1) < 0.1, `|inside distance| must be ≈1 (got ${inside})`);
  const outside = distanceTo(outline, [5, 3]);
  assert.ok(Math.abs(outside - 2) < 0.15, `outside distance must be ≈2 (got ${outside})`);
});
