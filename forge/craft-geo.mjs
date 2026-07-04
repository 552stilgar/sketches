// craft-geo.mjs — shared curve-primitive contract for forge's craft layer.
// Spec: docs/specs/forge-game-ready-craft-2026-07-04.md (Stage B).
//
// Pure ESM, no DOM, no deps. Consumed by card-geo.mjs (SVG loot cards) now,
// and by the JS math-mirrors of the 3D SDF later (Stage C) — so every export
// must stay renderer-agnostic: geometry in, geometry out.
//
// Conventions:
//   - points are [x, y] arrays
//   - a "spine" is { evalAt(t), tangentAt(t), normalAt(t), length } with
//     t ∈ [0,1]; tangent/normal are unit vectors, normal = tangent rotated
//     +90° ([-ty, tx]); positive bend sagitta bows toward +normal of the chord
//   - an "outline" is a closed polygon: an array of [x, y] points, closing
//     edge implied from last back to first
//   - width functions return HALF-width (spine to edge), must be > 0
//
// Behavior spec lives as the comment block at the top of test-craft.mjs.

/** Quadratic-bezier spine from p0 to p1 bowing `sagitta` off the chord. */
export function bend(p0, p1, sagitta) {
  throw new Error('craft-geo: bend not implemented');
}

/** Closed outline swept along a spine: +side t:0→1, −side t:1→0, flat caps. */
export function sweep(spine, widthFn, opts = {}) {
  throw new Error('craft-geo: sweep not implemented');
}

/** Sugar over sweep(): half-width w0 at t=0 eased to w1 at t=1. */
export function taper(spine, w0, w1, ease = (t) => t) {
  throw new Error('craft-geo: taper not implemented');
}

/** Junction band (guard/ferrule/langet) centered at spine.evalAt(t):
 *  ±h/2 along the tangent, ±w along the normal. Returns an outline. */
export function collar(spine, t, w, h) {
  throw new Error('craft-geo: collar not implemented');
}

/** Outline → SVG path string ("M … L … Z"), coordinates rounded to 3 decimals
 *  so identical geometry yields byte-identical strings. */
export function toPath(outline) {
  throw new Error('craft-geo: toPath not implemented');
}

/** Signed distance from point p to the outline: negative inside, positive
 *  outside, magnitude = distance to the nearest boundary segment. */
export function distanceTo(outline, p) {
  throw new Error('craft-geo: distanceTo not implemented');
}

/** Spec shape rule as a gate: returns an array of violations (empty = pass).
 *  A "straight run" is a chain of consecutive edges whose direction changes
 *  by < opts.straightAngleDeg (default 0.25°) totalling more than
 *  opts.maxStraightRun (default 0.15) of the outline's perimeter.
 *  Violation: { type: 'straight-run', frac, startIdx }. */
export function assertShapeRules(outline, opts = {}) {
  throw new Error('craft-geo: assertShapeRules not implemented');
}
