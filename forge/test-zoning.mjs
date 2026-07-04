// Material-zoning regression tests (spec: docs/specs/forge-game-ready-craft-2026-07-04.md).
//
// Mirrors the GLSL union math of mapAxe's langet and butt-cap branches
// (forge/index.html) exactly, at representative uniform values. The v6 bug:
// both branches unioned `smin(feature, dHaft, k)` as a STEEL/ACCENT material.
// Since smin(x, dHaft) <= dHaft everywhere (and opU's `a.x < b.x ? a : b`
// hands ties to the newcomer), the steel branch claimed the ENTIRE haft —
// wood hafts rendered as blotchy steel. The fix clamps each blend to its
// feature's neighborhood: max(smin(feature, dHaft, k), feature - reach).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// -- GLSL mirrors --------------------------------------------------------
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a + (b - a) * t;

function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// sdCapsule(p, A=(0,0,0), B=(0,L,0), r) for points in bent space q
function sdHaftCapsule(q, L, r) {
  const ty = clamp(q[1] / L, 0.0, 1.0);
  const d = Math.hypot(q[0], q[1] - ty * L, q[2]);
  return (d - r) * 0.9; // shader multiplies by 0.9
}

function sdBox(p, b) {
  const q = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]];
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return outside + Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0.0);
}

function sdCylY(p, halfH, r) {
  const d = [Math.hypot(p[0], p[2]) - r, Math.abs(p[1]) - halfH];
  return Math.min(Math.max(d[0], d[1]), 0.0) + Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0));
}

// -- representative uniforms (mid-range axe roll, zero haft curve) --------
const U = {
  haftLen: 0.9, haftR: 0.03, haftCurve: 0.0,
  headY: 0.85, headHalfH: 0.12, langetLen: 0.2,
};

const hrAt = (t) => U.haftR * (1.0 + 0.18 * (1.0 - t));
const dHaft = (p) => sdHaftCapsule(p, U.haftLen, hrAt(clamp(p[1] / U.haftLen, 0, 1)));

// langet branch distances at point p (mirrors index.html mapAxe langet block)
function langetBranch(p) {
  const halfH = U.headHalfH;
  const lTopY = U.headY - halfH * 0.55;
  const lMidY = lTopY - U.langetLen * 0.5;
  const ltt = clamp(lMidY / U.haftLen, 0, 1);
  const lhr = U.haftR * (1.0 + 0.18 * (1.0 - ltt));
  const lp = [p[0], p[1] - lMidY, Math.abs(p[2]) - (lhr + 0.006)];
  const dLanget = sdBox(lp, [U.haftR * 1.4, U.langetLen * 0.5, U.haftR * 0.28]);
  const dh = dHaft(p);
  return {
    old: smin(dLanget, dh, 0.018),
    fixed: Math.max(smin(dLanget, dh, 0.018), dLanget - 0.022),
    dLanget,
    dh,
  };
}

// butt-cap branch distances at point p (bent space q == p at zero curve)
function buttBranch(p) {
  const hr = hrAt(clamp(p[1] / U.haftLen, 0, 1));
  const dButtCap = sdCylY(p, 0.028, hr * 1.35);
  const dh = dHaft(p);
  return {
    old: smin(dButtCap, dh, 0.02),
    fixed: Math.max(smin(dButtCap, dh, 0.02), dButtCap - 0.03),
    dButtCap,
    dh,
  };
}

// a point ON the haft surface at height y (z=0, +x side)
const haftSurfacePoint = (y) => [hrAt(clamp(y / U.haftLen, 0, 1)), y, 0];

// -- tests -----------------------------------------------------------------

test('bug reproduced: unclamped langet smin ties/beats the haft far from the strap', () => {
  const p = haftSurfacePoint(0.30); // mid-haft, well below the langet (bottom ~0.58)
  const { old, dh } = langetBranch(p);
  // opU hands ties to the newer (steel) branch, so <= means steel wins
  assert.ok(old <= dh + 1e-12, `expected old form ${old} <= dHaft ${dh}`);
});

test('fixed: clamped langet branch loses to the wood haft far from the strap', () => {
  for (const y of [0.05, 0.20, 0.30, 0.45]) {
    const { fixed, dh } = langetBranch(haftSurfacePoint(y));
    assert.ok(fixed > dh, `y=${y}: clamped langet ${fixed} must be > dHaft ${dh}`);
  }
});

test('fixed: langet fillet survives near the strap itself', () => {
  const halfH = U.headHalfH;
  const lTopY = U.headY - halfH * 0.55;
  const lMidY = lTopY - U.langetLen * 0.5;
  // a point right at the strap's outer face (front side)
  const lhr = U.haftR * (1.0 + 0.18 * (1.0 - clamp(lMidY / U.haftLen, 0, 1)));
  const p = [0, lMidY, lhr + 0.006];
  const { old, fixed, dLanget } = langetBranch(p);
  assert.ok(dLanget < 0.022, 'probe point must be inside the clamp reach');
  assert.ok(Math.abs(fixed - old) < 1e-12, 'clamp must not alter the blend near the strap');
});

test('bug reproduced + fixed: butt cap — steel stays at the base, wood keeps the shaft', () => {
  const pFar = haftSurfacePoint(0.50);
  const far = buttBranch(pFar);
  assert.ok(far.old <= far.dh + 1e-12, 'old form claimed the mid-haft');
  assert.ok(far.fixed > far.dh, 'clamped form must lose the mid-haft');
  const pNear = [hrAt(0.02 / U.haftLen) * 1.35, 0.0, 0]; // on the flared cap rim
  const near = buttBranch(pNear);
  assert.ok(near.dButtCap < 0.03, 'probe point must be inside the clamp reach');
  assert.ok(Math.abs(near.fixed - near.old) < 1e-12, 'fillet unchanged at the cap');
});
