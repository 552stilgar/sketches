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

const LENGTH_SEGMENTS = 128;

/** Quadratic-bezier spine from p0 to p1 bowing `sagitta` off the chord. */
export function bend(p0, p1, sagitta) {
  const cx = p1[0] - p0[0], cy = p1[1] - p0[1];
  const chordLen = Math.hypot(cx, cy);
  if (!(chordLen > 0)) throw new Error('bend: p0 and p1 must be distinct');
  const nx = -cy / chordLen, ny = cx / chordLen; // chord normal (+90°)
  // a quadratic's t=0.5 point sits halfway between chord midpoint and the
  // control point, so ctrl = mid + normal·2·sagitta makes the max chord
  // deviation exactly `sagitta` for this symmetric bow
  const ctrl = [
    (p0[0] + p1[0]) / 2 + nx * 2 * sagitta,
    (p0[1] + p1[1]) / 2 + ny * 2 * sagitta,
  ];

  const evalAt = (t) => {
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * ctrl[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * ctrl[1] + t * t * p1[1],
    ];
  };
  const tangentAt = (t) => {
    const u = 1 - t;
    const dx = 2 * u * (ctrl[0] - p0[0]) + 2 * t * (p1[0] - ctrl[0]);
    const dy = 2 * u * (ctrl[1] - p0[1]) + 2 * t * (p1[1] - ctrl[1]);
    const m = Math.hypot(dx, dy);
    // sagitta=0 keeps the derivative equal to the chord vector, never zero
    return [dx / m, dy / m];
  };
  const normalAt = (t) => {
    const [tx, ty] = tangentAt(t);
    return [-ty, tx];
  };

  let length = 0;
  let prev = p0;
  for (let i = 1; i <= LENGTH_SEGMENTS; i++) {
    const q = evalAt(i / LENGTH_SEGMENTS);
    length += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return { evalAt, tangentAt, normalAt, length };
}

/** Closed outline swept along a spine: +side t:0→1, −side t:1→0, flat caps. */
export function sweep(spine, widthFn, opts = {}) {
  const samples = opts.samples ?? 64;
  const plus = [], minus = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const w = widthFn(t);
    if (!(w > 0)) throw new Error(`sweep: widthFn must be > 0 (got ${w} at t=${t})`);
    const c = spine.evalAt(t);
    const n = spine.normalAt(t);
    plus.push([c[0] + n[0] * w, c[1] + n[1] * w]);
    minus.push([c[0] - n[0] * w, c[1] - n[1] * w]);
  }
  minus.reverse();
  return plus.concat(minus);
}

/** Sugar over sweep(): half-width w0 at t=0 eased to w1 at t=1. */
export function taper(spine, w0, w1, ease = (t) => t) {
  return sweep(spine, (t) => w0 + (w1 - w0) * ease(t));
}

/** Junction band (guard/ferrule/langet) centered at spine.evalAt(t):
 *  ±h/2 along the tangent, ±w along the normal. Returns an outline. */
export function collar(spine, t, w, h) {
  const c = spine.evalAt(t);
  const [tx, ty] = spine.tangentAt(t);
  const [nx, ny] = spine.normalAt(t);
  const hx = tx * h / 2, hy = ty * h / 2;
  const wx = nx * w, wy = ny * w;
  return [
    [c[0] - hx - wx, c[1] - hy - wy],
    [c[0] + hx - wx, c[1] + hy - wy],
    [c[0] + hx + wx, c[1] + hy + wy],
    [c[0] - hx + wx, c[1] - hy + wy],
  ];
}

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return String(r === 0 ? 0 : r); // normalize -0
};

/** Outline → SVG path string ("M … L … Z"), coordinates rounded to 3 decimals
 *  so identical geometry yields byte-identical strings. */
export function toPath(outline) {
  const parts = outline.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`);
  return `${parts.join(' ')} Z`;
}

function pointSegDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const apx = p[0] - a[0], apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2)) : 0;
  return Math.hypot(apx - t * abx, apy - t * aby);
}

/** Signed distance from point p to the outline: negative inside, positive
 *  outside, magnitude = distance to the nearest boundary segment. */
export function distanceTo(outline, p) {
  const n = outline.length;
  let minD = Infinity;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = outline[j], b = outline[i];
    minD = Math.min(minD, pointSegDist(p, a, b));
    if ((b[1] > p[1]) !== (a[1] > p[1]) &&
        p[0] < (a[0] - b[0]) * (p[1] - b[1]) / (a[1] - b[1]) + b[0]) {
      inside = !inside;
    }
  }
  return inside ? -minD : minD;
}

/** Spec shape rule as a gate: returns an array of violations (empty = pass).
 *  A "straight run" is a chain of consecutive edges whose direction changes
 *  by < opts.straightAngleDeg (default 0.25°) totalling more than
 *  opts.maxStraightRun (default 0.15) of the outline's perimeter.
 *  Violation: { type: 'straight-run', frac, startIdx }. */
export function assertShapeRules(outline, opts = {}) {
  const maxStraightRun = opts.maxStraightRun ?? 0.15;
  const straightAngleDeg = opts.straightAngleDeg ?? 0.25;
  const n = outline.length;

  // circular edge list, zero-length edges dropped (they carry no direction)
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) edges.push({ idx: i, len, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }
  const m = edges.length;
  if (m === 0) return [];
  const perimeter = edges.reduce((s, e) => s + e.len, 0);

  const turn = (a, b) => {
    let d = Math.abs(b.ang - a.ang) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d * 180 / Math.PI;
  };

  // corners = junctions where direction actually changes; runs live between them
  const corners = [];
  for (let i = 0; i < m; i++) {
    if (turn(edges[i], edges[(i + 1) % m]) >= straightAngleDeg) corners.push(i);
  }

  const violations = [];
  const push = (runLen, startIdx) => {
    const frac = runLen / perimeter;
    if (frac > maxStraightRun) violations.push({ type: 'straight-run', frac, startIdx });
  };

  if (corners.length === 0) {
    // no direction change anywhere — the whole perimeter is one run
    push(perimeter, edges[0].idx);
    return violations;
  }
  for (let c = 0; c < corners.length; c++) {
    // run = edges after corner c, up to and including the next corner's edge
    const from = corners[c];
    const to = corners[(c + 1) % corners.length];
    let runLen = 0;
    let k = (from + 1) % m;
    const startIdx = edges[k].idx;
    while (true) {
      runLen += edges[k].len;
      if (k === to) break;
      k = (k + 1) % m;
    }
    push(runLen, startIdx);
  }
  return violations;
}
