// forge — v6 BLADE geometry-depth unit tests (lane G1).
//
// These are pure-JS mirrors of the new GLSL math added to mapSword() in
// index.html (the SCENE shader chunk — fuller-groove smooth-subtraction,
// ricasso_len taper-freeze, edge_bevel_w facet, tip_style=round cap sphere).
// There is no WebGL context on this headless VPS, so the shader itself can't
// be exercised here (see test.mjs's own note: "shader layer, verified in
// browser") — this file instead locks down the underlying formulas so a typo
// or sign error in the SDF math is caught before it ever needs a render to
// notice. Every constant/formula here must stay numerically identical to its
// GLSL counterpart; the comments cite the anchor in index.html.

import test from 'node:test';
import assert from 'node:assert/strict';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// index.html SCENE: float smin(float a, float b, float k)
function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h); // mix(b,a,h) == b*(1-h)+a*h
}
// index.html SCENE: float smax(float a, float b, float k) { return -smin(-a,-b,k); }
function smax(a, b, k) { return -smin(-a, -b, k); }

// index.html mapSword: ricasso_len taper-freeze
// float tTaper = u_ricassoLen > 1e-4 ? clamp((t-ricassoLen)/max(1-ricassoLen,1e-4),0,1) : t;
function tTaperFn(t, ricassoLen) {
  if (ricassoLen <= 1e-4) return t;
  return clamp((t - ricassoLen) / Math.max(1 - ricassoLen, 1e-4), 0, 1);
}

// index.html mapSword: edge_bevel_w facet mix
// float bevelMix = smoothstep(clamp(1-edgeBevelW,0,1), 1, edgeU);
function bevelMixFn(edgeU, edgeBevelW) {
  const bevelStart = clamp(1 - edgeBevelW, 0, 1);
  return smoothstep(bevelStart, 1, edgeU);
}

const FULLER_WIDTH_FRAC = 0.34;
const FULLER_DEPTH_SCALE = 0.85;
const FULLER_FADE_BIG = 10.0;

// index.html mapSword: fuller cavity (ellipse in the lateral/thickness plane) + length-fade
function grooveCavity({ gx, qz, w, th, fullerDepth, fMask }) {
  const grooveHalfW = Math.max(w * FULLER_WIDTH_FRAC, 1e-5);
  const grooveHalfD = Math.max(th * fullerDepth * FULLER_DEPTH_SCALE, 1e-5);
  const lenv = Math.hypot(gx / grooveHalfW, qz / grooveHalfD);
  const cavFull = (lenv - 1) * Math.min(grooveHalfW, grooveHalfD);
  return fMask * cavFull + (1 - fMask) * (FULLER_FADE_BIG * grooveHalfW);
}

const TIP_ROUND_R_FRAC = 0.42;

// index.html mapSword: tip_style=round cap-sphere radius
function tipSphereR(bladeW, taper) {
  return Math.max(bladeW * (1 - taper) * TIP_ROUND_R_FRAC, 1e-4);
}

// ---------------------------------------------------------------------------

test('smin/smax reduce to plain min/max as the blend radius shrinks', () => {
  const pairs = [[0.3, -0.1], [-0.2, -0.2], [1.0, 0.05], [-0.6, 0.4]];
  for (const [a, b] of pairs) {
    assert.ok(Math.abs(smin(a, b, 1e-4) - Math.min(a, b)) < 1e-3);
    assert.ok(Math.abs(smax(a, b, 1e-4) - Math.max(a, b)) < 1e-3);
  }
});

test('smin/smax are always <= / >= both inputs (valid CSG blend, no overshoot beyond the envelope)', () => {
  for (let i = 0; i < 200; i++) {
    const a = (Math.random() - 0.5) * 2, b = (Math.random() - 0.5) * 2, k = 0.005 + Math.random() * 0.05;
    assert.ok(smin(a, b, k) <= Math.min(a, b) + 1e-9);
    assert.ok(smax(a, b, k) >= Math.max(a, b) - 1e-9);
  }
});

test('ricasso_len == 0 reduces exactly to the legacy tTaper == t identity', () => {
  for (let t = 0; t <= 1; t += 0.05) {
    assert.equal(tTaperFn(t, 0), t);
  }
});

test('ricasso_len freezes the taper ramp at 0 for t inside the ricasso, then ramps 0->1 by the tip', () => {
  const ricassoLen = 0.12;
  assert.equal(tTaperFn(0, ricassoLen), 0);
  assert.equal(tTaperFn(0.10, ricassoLen), 0);      // inside ricasso -> frozen root (no taper yet)
  assert.equal(tTaperFn(ricassoLen, ricassoLen), 0);
  assert.equal(tTaperFn(1, ricassoLen), 1);          // full taper reached by the tip regardless of ricasso
  assert.ok(tTaperFn(0.5, ricassoLen) > 0 && tTaperFn(0.5, ricassoLen) < 1);
});

test('tTaper is monotonic non-decreasing in t for any ricasso_len in its DNA range', () => {
  for (const ricassoLen of [0, 0.02, 0.08, 0.16]) {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const v = tTaperFn(clamp(t, 0, 1), ricassoLen);
      assert.ok(v >= prev - 1e-9, `tTaper regressed at t=${t}, ricassoLen=${ricassoLen}`);
      prev = v;
    }
  }
});

test('edge_bevel_w: bevelMix is 0 away from the edge and rises toward 1 only inside the bevel band', () => {
  // low bevel width -> bevel band is a thin sliver right at the edge (edgeU near 1)
  assert.equal(bevelMixFn(0.5, 0.05), 0);
  assert.ok(bevelMixFn(0.999, 0.05) > 0.5);
  // high bevel width (DNA max 0.40) -> band starts further from the edge
  assert.ok(bevelMixFn(0.65, 0.40) > 0, 'wide bevel should already be rising at edgeU=0.65');
  assert.equal(bevelMixFn(0.0, 0.40), 0, 'spine center is never inside the bevel band');
});

test('edge_bevel_w: bevelMix is monotonic non-decreasing in edgeU and always in [0,1]', () => {
  for (const w of [0.05, 0.2, 0.4]) {
    let prev = -1;
    for (let u = 0; u <= 1.0001; u += 0.02) {
      const v = bevelMixFn(clamp(u, 0, 1), w);
      assert.ok(v >= 0 && v <= 1);
      assert.ok(v >= prev - 1e-9);
      prev = v;
    }
  }
});

test('groove cavity is negative (cuts material) at the channel center when fully faded in', () => {
  const cav = grooveCavity({ gx: 0, qz: 0, w: 0.08, th: 0.03, fullerDepth: 0.4, fMask: 1 });
  assert.ok(cav < 0, 'the groove centerline must be inside the cavity so it actually carves a channel');
});

test('groove cavity collapses to "no cavity" (large positive) as fMask -> 0 (root/tip fade)', () => {
  const params = { gx: 0, qz: 0, w: 0.08, th: 0.03, fullerDepth: 0.4, fMask: 0 };
  const cav = grooveCavity(params);
  assert.ok(cav > 0.1, 'faded-out groove must not carve near the root/tip');
});

test('groove cavity fade is monotonic: more fMask never carves less at the channel center', () => {
  let prevCav = Infinity;
  for (let fMask = 0; fMask <= 1.0001; fMask += 0.1) {
    const cav = grooveCavity({ gx: 0, qz: 0, w: 0.08, th: 0.03, fullerDepth: 0.4, fMask: clamp(fMask, 0, 1) });
    assert.ok(cav <= prevCav + 1e-9);
    prevCav = cav;
  }
});

test('groove cavity is positive (no cut) well outside the channel width regardless of depth', () => {
  const cav = grooveCavity({ gx: 100, qz: 0, w: 0.08, th: 0.03, fullerDepth: 0.6, fMask: 1 });
  assert.ok(cav > 0);
});

test('groove cavity never divides by zero for the full fuller_depth DNA range [0.15, 0.60]', () => {
  for (let fullerDepth = 0.15; fullerDepth <= 0.60; fullerDepth += 0.05) {
    const cav = grooveCavity({ gx: 0.01, qz: 0.001, w: 0.06, th: 0.02, fullerDepth, fMask: 0.8 });
    assert.ok(Number.isFinite(cav));
  }
});

test('tip_style=round cap-sphere radius is positive, finite, and shrinks as blade_taper grows', () => {
  const rLowTaper = tipSphereR(0.08, 0.15);   // DNA min taper
  const rHighTaper = tipSphereR(0.08, 0.90);  // DNA max taper
  assert.ok(Number.isFinite(rLowTaper) && rLowTaper > 0);
  assert.ok(Number.isFinite(rHighTaper) && rHighTaper > 0);
  assert.ok(rHighTaper < rLowTaper, 'a more heavily tapered blade should get a smaller tip cap, not a bigger one');
});

test('tip_style=round cap-sphere radius scales linearly with blade_w', () => {
  const r1 = tipSphereR(0.05, 0.4);
  const r2 = tipSphereR(0.10, 0.4);
  assert.ok(Math.abs(r2 - 2 * r1) < 1e-9);
});

test('tip_style=round cap-sphere radius has a positive floor even at the extreme taper=1 edge case', () => {
  assert.ok(tipSphereR(0.045, 1.0) >= 1e-4);
});
