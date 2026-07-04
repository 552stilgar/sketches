// FORGE v6 — SVG loot-card geometry (Lane S: a second MEDIUM for the same DNA).
// Pure ESM: no DOM, no randomness beyond the params object it is handed.
//
// Input:  a rolled params object — paramsFromHash(hash), or
//         applyOverrides(paramsFromHash(baseHash), decodeToken(token).overrides) — from ./params.mjs.
// Output: buildWeapon(params) -> { kind: 'sword'|'axe', layers, bounds }
//   layers: ordered back-to-front array of { d, fill, stroke, strokeWidth, opacity }
//     (flat path descriptors — no group transforms; every coordinate is baked in)
//   bounds: { minX, maxX, minY, maxY } in model space — y-up, same convention as
//     deriveLayout (sword: origin at guard center, +y toward tip; axe: origin at
//     haft base, +y up). card.html applies the view transform (flip + scale + center).
//
// derivePalette(params) -> flat 3-4 tone material palette { base, shade, highlight,
//   accent, trim, grip }, each an {h,s,l} triple. hslCss() renders one as a CSS color.
//
// This medium does not replicate the SDF raymarcher's math — it is a different,
// deliberately flatter reading of the same DNA (silhouette + line work rather than
// volume + shading). Anchors (blade root/tip, guard/grip/pommel Ys, axe haft/head Ys)
// are pulled from deriveLayout() so the two mediums agree on "where things are."

import { clamp, deriveLayout } from './params.mjs';

// ---------------------------------------------------------------------------
// numeric hygiene + path-building primitives
// ---------------------------------------------------------------------------

function num(n) {
  if (!Number.isFinite(n)) throw new Error(`card-geo: non-finite coordinate (${n})`);
  return Math.round(n * 1000) / 1000;
}

function pt([x, y]) {
  return `${num(x)},${num(y)}`;
}

function polygonPath(points) {
  if (points.length < 2) throw new Error('card-geo: polygon needs >= 2 points');
  return `M${pt(points[0])} ${points.slice(1).map(p => `L${pt(p)}`).join(' ')} Z`;
}

function polylinePath(points) {
  if (points.length < 2) throw new Error('card-geo: polyline needs >= 2 points');
  return `M${pt(points[0])} ${points.slice(1).map(p => `L${pt(p)}`).join(' ')}`;
}

class Bounds {
  constructor() {
    this.minX = Infinity; this.maxX = -Infinity;
    this.minY = Infinity; this.maxY = -Infinity;
  }
  note(x, y) {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }
  noteAll(points) { for (const [x, y] of points) this.note(x, y); }
  toJSON() {
    // guard against a layer set that never called note() (shouldn't happen — every
    // weapon draws at least a haft/blade outline — but fail loud rather than emit Infinity)
    if (!Number.isFinite(this.minX)) throw new Error('card-geo: bounds never touched');
    return { minX: num(this.minX), maxX: num(this.maxX), minY: num(this.minY), maxY: num(this.maxY) };
  }
}

function rotatePoint([x, y], angleRad, [cx, cy] = [0, 0]) {
  const dx = x - cx, dy = y - cy;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

function rotatePts(points, angleRad, center) {
  return points.map(p => rotatePoint(p, angleRad, center));
}

// sample a circle/ellipse as a closed polygon, counter-clockwise from angle 0.
// Reverse the returned array to get opposite winding (for annulus holes under
// the default nonzero fill rule — two opposite-wound overlapping loops cancel).
function circlePoints(cx, cy, rx, ry, segments = ELLIPSE_SEGMENTS) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

function ringPath(cx, cy, rOuter, rInner, segments = ELLIPSE_SEGMENTS) {
  const outer = circlePoints(cx, cy, rOuter, rOuter, segments);
  const inner = circlePoints(cx, cy, rInner, rInner, segments).reverse();
  return `${polygonPath(outer)} ${polygonPath(inner)}`;
}

// Generic "y-varying half-width, possibly laterally offset" outline builder.
// widthFn(t) -> [leftHalfW, rightHalfW] (equal for symmetric shapes).
// Shared by the blade, scent-stopper pommel, and grip body.
function buildOutline(steps, yFn, widthFn, offsetXFn, bounds) {
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = yFn(t);
    const off = offsetXFn(t);
    const [lw, rw] = widthFn(t);
    left.push([off - lw, y]);
    right.push([off + rw, y]);
  }
  bounds.noteAll(left);
  bounds.noteAll(right);
  return polygonPath([...left, ...right.slice().reverse()]);
}

const ELLIPSE_SEGMENTS = 28;

// ---------------------------------------------------------------------------
// palette — flat 3-4 tone shading derived from the material genes. Hue/sat/
// lightness formulas mirror index.html's FAMILY_COLOR so the SVG card reads
// as "the same weapon" beside the 3D raymarched view.
// ---------------------------------------------------------------------------

const BLUED_LIGHTEN_MUL = 0.72;    // blued steel: darker (matches shader's BLUED_ROUGHNESS_MUL intent)
const BLUED_HUE_SHIFT = 10;        // ...and a touch cooler
const SHADE_DELTA_L = 22;          // base -> shade tone step
const HIGHLIGHT_DELTA_L_MAX = 20;  // base -> highlight step at wear_amount = 0
const HIGHLIGHT_DELTA_L_MIN = 8;   // base -> highlight step at wear_amount = 1 (worn steel loses specular pop)
const HIGHLIGHT_SAT_BOOST = 12;
const TRIM_SAT_MUL = 0.5;
const TRIM_DELTA_L = 30;

function familyBaseHsl(p) {
  if (p.metal_family === 'iron') return { h: p.steel_hue, s: p.steel_sat * 0.35, l: 45 };
  if (p.metal_family === 'bronze') return { h: 26 + (p.steel_hue - 185) * 0.14, s: 46, l: 48 };
  return { h: p.steel_hue, s: p.steel_sat, l: 62 }; // steel (default + fallback)
}

const GRIP_HSL = {
  leather: { h: 25, s: 42, l: 26 },
  cord: { h: 36, s: 24, l: 44 },
  wire: { h: 210, s: 6, l: 58 },
};

export function derivePalette(p) {
  let base = familyBaseHsl(p);
  if (p.steel_finish === 'blued') {
    base = { h: base.h + BLUED_HUE_SHIFT, s: base.s, l: base.l * BLUED_LIGHTEN_MUL };
  }
  const highlightDeltaL = HIGHLIGHT_DELTA_L_MAX
    - (HIGHLIGHT_DELTA_L_MAX - HIGHLIGHT_DELTA_L_MIN) * p.wear_amount;
  const shade = { h: base.h, s: base.s, l: clamp(base.l - SHADE_DELTA_L, 4, 96) };
  const highlight = {
    h: base.h,
    s: clamp(base.s + HIGHLIGHT_SAT_BOOST, 0, 100),
    l: clamp(base.l + highlightDeltaL, 4, 96),
  };
  const accent = { h: p.accent_hue, s: 58, l: 48 };
  const trim = p.accent_on
    ? accent
    : { h: base.h, s: base.s * TRIM_SAT_MUL, l: clamp(base.l - TRIM_DELTA_L, 4, 96) };
  const grip = GRIP_HSL[p.grip_material] ?? GRIP_HSL.leather;
  return { base, shade, highlight, accent, trim, grip };
}

export function hslCss({ h, s, l }, alpha = 1) {
  const hh = num(((h % 360) + 360) % 360);
  const ss = num(clamp(s, 0, 100));
  const ll = num(clamp(l, 0, 100));
  const a = num(clamp(alpha, 0, 1));
  return a >= 1 ? `hsl(${hh} ${ss}% ${ll}%)` : `hsl(${hh} ${ss}% ${ll}% / ${a})`;
}

// ---------------------------------------------------------------------------
// blade — outline, tip closure, cross-section spine, fullers, edge bevel
// ---------------------------------------------------------------------------

const BLADE_SAMPLES = 24;
const CURVE_EXP = 1.6;          // lateral bow (blade_curve) grows toward the tip, not linearly
const TIP_ZONE = 0.14;          // last fraction of post-ricasso length spent closing the tip
const MIN_TAPER_MUL = 0.04;     // never let a taper collapse the blade to a literal zero-width seam
const CLIP_SPINE_EARLY = 1.6;   // clip point: the false-edge/spine side closes earlier & straighter

// per-blade_type width-profile shaping (multiplier on halfW before global taper);
// t here is the post-ricasso fraction [0,1]
const BLADE_SHAPE = {
  arming: () => 1,
  longsword: () => 1,
  falchion: t => 1 + 0.55 * Math.sin(Math.PI * t) * t,      // widens toward the cutting tip
  scimitar: t => 1 + 0.35 * Math.sin(Math.PI * t) * t,      // widens less than falchion
  leaf: t => 1 + 0.6 * Math.sin(Math.PI * t),                // classic leaf bulge at mid-length
  estoc: t => 1 - 0.25 * t,                                  // slender thruster, extra taper
};

function tipHalfWidths(baseW, t, tipStyle) {
  const zoneStart = 1 - TIP_ZONE;
  if (t < zoneStart) return [baseW, baseW];
  const frac = (t - zoneStart) / TIP_ZONE;
  if (tipStyle === 'round') {
    const m = Math.sqrt(Math.max(0, 1 - frac * frac)); // circular-arc dome to zero
    return [baseW * m, baseW * m];
  }
  if (tipStyle === 'clip') {
    const rightZoneStart = 1 - TIP_ZONE * CLIP_SPINE_EARLY;
    const rightFrac = t < rightZoneStart ? 0 : (t - rightZoneStart) / (TIP_ZONE * CLIP_SPINE_EARLY);
    const leftM = Math.max(0, 1 - frac);         // true edge: runs to a sharp point
    const rightM = Math.max(0, 1 - rightFrac);   // spine/false edge: cuts in earlier -> off-center point
    return [baseW * leftM, baseW * rightM];
  }
  // 'point' (default): linear closure to a sharp symmetric vertex
  const m = Math.max(0, 1 - frac);
  return [baseW * m, baseW * m];
}

function bladeWidthAt(p, t) {
  const ricassoFrac = clamp(p.ricasso_len / Math.max(p.blade_len, 1e-6), 0, 0.5);
  const tShape = t <= ricassoFrac ? 0 : (t - ricassoFrac) / (1 - ricassoFrac);
  const shapeFn = BLADE_SHAPE[p.blade_type] ?? BLADE_SHAPE.arming;
  const taperMul = Math.max(1 - p.blade_taper * tShape, MIN_TAPER_MUL);
  return (p.blade_w / 2) * shapeFn(tShape) * taperMul;
}

function buildBlade(p, bladeRoot, bounds) {
  const yFn = t => bladeRoot + t * p.blade_len;
  const offsetXFn = t => p.blade_curve * p.blade_len * Math.pow(t, CURVE_EXP);
  const widthFn = t => {
    const base = bladeWidthAt(p, t);
    return tipHalfWidths(base, t, p.tip_style);
  };
  const d = buildOutline(BLADE_SAMPLES, yFn, widthFn, offsetXFn, bounds);
  return { d, fill: 'var(--blade-fill)', stroke: 'var(--blade-stroke)', strokeWidth: 0.006, opacity: 1 };
}

// blade_section: how the cross-section reads as inner line work on a flat side profile.
const CROSS_SECTION_SAMPLES = 16;
const HOLLOW_GROOVE_FRAC = 0.55;  // fraction of half-width where hollow-ground grooves sit

function buildCrossSectionLines(p, bladeRoot, palette) {
  const yStart = bladeRoot + 0.02;
  const yEnd = bladeRoot + p.blade_len * (1 - TIP_ZONE * 0.5);
  const sample = fracX => {
    const pts = [];
    for (let i = 0; i <= CROSS_SECTION_SAMPLES; i++) {
      const y = yStart + (yEnd - yStart) * (i / CROSS_SECTION_SAMPLES);
      const t = (y - bladeRoot) / p.blade_len;
      const off = p.blade_curve * p.blade_len * Math.pow(clamp(t, 0, 1), CURVE_EXP);
      const w = bladeWidthAt(p, clamp(t, 0, 1));
      pts.push([off + fracX * w, y]);
    }
    return pts;
  };
  if (p.blade_section === 'hollow_ground') {
    return [
      { d: polylinePath(sample(-HOLLOW_GROOVE_FRAC)), fill: 'none', stroke: 'var(--blade-shade)', strokeWidth: 0.004, opacity: 0.7 },
      { d: polylinePath(sample(HOLLOW_GROOVE_FRAC)), fill: 'none', stroke: 'var(--blade-shade)', strokeWidth: 0.004, opacity: 0.7 },
    ];
  }
  if (p.blade_section === 'lenticular') {
    return [{ d: polylinePath(sample(0)), fill: 'none', stroke: 'var(--blade-highlight)', strokeWidth: 0.010, opacity: 0.35 }];
  }
  // 'diamond' (default): a crisp single ridge line
  return [{ d: polylinePath(sample(0)), fill: 'none', stroke: 'var(--blade-highlight)', strokeWidth: 0.004, opacity: 0.85 }];
}

const FULLER_2_OFFSET_FRAC = 0.42;
const FULLER_END_MUL = 1.25; // fuller fades out before the tip-closure zone starts

function buildFullers(p, bladeRoot) {
  if (p.fuller_n === 0) return [];
  const ricassoFrac = clamp(p.ricasso_len / Math.max(p.blade_len, 1e-6), 0, 0.5);
  const yStart = bladeRoot + p.blade_len * (ricassoFrac + 0.03);
  const yEnd = bladeRoot + p.blade_len * (1 - TIP_ZONE * FULLER_END_MUL);
  if (yEnd <= yStart) return [];
  const steps = 12;
  const line = offsetFrac => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = yStart + (yEnd - yStart) * (i / steps);
      const t = clamp((y - bladeRoot) / p.blade_len, 0, 1);
      const off = p.blade_curve * p.blade_len * Math.pow(t, CURVE_EXP);
      const w = bladeWidthAt(p, t);
      pts.push([off + offsetFrac * w, y]);
    }
    return polylinePath(pts);
  };
  const strokeWidth = num(0.006 + p.fuller_depth * 0.014);
  const opacity = num(0.4 + p.fuller_depth * 0.4);
  const style = { fill: 'none', stroke: 'var(--blade-shade)', strokeWidth, opacity };
  return p.fuller_n === 2
    ? [{ d: line(-FULLER_2_OFFSET_FRAC), ...style }, { d: line(FULLER_2_OFFSET_FRAC), ...style }]
    : [{ d: line(0), ...style }];
}

const EDGE_BEVEL_MIN_VISIBLE = 0.08;

function buildEdgeBevel(p, bladeRoot) {
  if (p.edge_bevel_w < EDGE_BEVEL_MIN_VISIBLE) return [];
  const yStart = bladeRoot + 0.01;
  const yEnd = bladeRoot + p.blade_len * (1 - TIP_ZONE * 0.9);
  if (yEnd <= yStart) return [];
  const steps = 14;
  const side = sign => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const y = yStart + (yEnd - yStart) * (i / steps);
      const t = clamp((y - bladeRoot) / p.blade_len, 0, 1);
      const off = p.blade_curve * p.blade_len * Math.pow(t, CURVE_EXP);
      const w = bladeWidthAt(p, t);
      const [lw, rw] = tipHalfWidths(w, t, p.tip_style);
      const edgeW = sign < 0 ? lw : rw;
      pts.push([off + sign * edgeW * (1 - p.edge_bevel_w), y]);
    }
    return polylinePath(pts);
  };
  const style = { fill: 'none', stroke: 'var(--blade-shade)', strokeWidth: 0.003, opacity: 0.5 };
  return [{ d: side(-1), ...style }, { d: side(1), ...style }];
}

// ---------------------------------------------------------------------------
// guard — bar / quillons / disc / crescent, + droop, quillon_curl, quillon_tip,
// guard_shell, guard_ext (swept / ring)
// ---------------------------------------------------------------------------

const GUARD_DROOP_ANGLE_SCALE = 0.55; // radians per unit guard_droop
const QUILLON_CTRL_FRAC = 0.55;       // bezier-ish control point placement along the limb
const QUILLON_CURL_SCALE = 0.16;      // lateral push from quillon_curl at the control point
const QUILLON_SAMPLES = 10;
const QUILLON_TIP_R_BALL = 1.0;       // multiplier on guard_thick for tip cap sizing
const QUILLON_TIP_R_FLARE = 1.6;
const QUILLON_TIP_R_SPATULATE = 1.9;
const DISC_RY_MUL = 2.4;              // guard disc: ry relative to guard_thick
const CRESCENT_INNER_MUL = 0.6;
const CRESCENT_SHIFT_MUL = 0.35;
const GUARD_SHELL_R_MUL = 1.35;       // relative to guard_span
const GUARD_EXT_RING_R_MUL = 0.55;
const SWEPT_BOW_SAMPLES = 10;

function quadBezierPoint(p0, c, p1, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
    mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1],
  ];
}

function quillonLimbPoints(sign, span, droopAngle, curl, thick) {
  const p0 = [0, 0];
  const tip = rotatePoint([sign * span, 0], droopAngle);
  const ctrlBase = rotatePoint([sign * span * QUILLON_CTRL_FRAC, 0], droopAngle);
  const ctrl = [ctrlBase[0], ctrlBase[1] + curl * QUILLON_CURL_SCALE * span * 2];
  const pts = [];
  for (let i = 0; i <= QUILLON_SAMPLES; i++) pts.push(quadBezierPoint(p0, ctrl, tip, i / QUILLON_SAMPLES));
  return { pts, tip };
}

function tipCapPoints(center, style, thick) {
  if (style === 'flare') {
    const r = thick * QUILLON_TIP_R_FLARE;
    return circlePoints(center[0], center[1], r, r * 0.65, 10);
  }
  if (style === 'spatulate') {
    const r = thick * QUILLON_TIP_R_SPATULATE;
    return circlePoints(center[0], center[1], r * 0.8, r * 0.45, 12);
  }
  const r = thick * QUILLON_TIP_R_BALL; // 'ball' default
  return circlePoints(center[0], center[1], r, r, 10);
}

function buildGuard(p, palette, bounds) {
  const layers = [];
  const span = p.guard_span, thick = p.guard_thick;
  const droopAngle = p.guard_droop * GUARD_DROOP_ANGLE_SCALE;
  const style = { fill: 'var(--guard-fill)', stroke: 'var(--guard-stroke)', strokeWidth: 0.005, opacity: 1 };

  if (p.guard_type === 'quillons') {
    for (const sign of [-1, 1]) {
      const { pts, tip } = quillonLimbPoints(sign, span, droopAngle, p.quillon_curl, thick);
      bounds.noteAll(pts);
      layers.push({ d: polylinePath(pts), fill: 'none', stroke: 'var(--guard-fill)', strokeWidth: thick * 1.8, opacity: 1 });
      const cap = tipCapPoints(tip, p.quillon_tip, thick);
      bounds.noteAll(cap);
      layers.push({ d: polygonPath(cap), ...style });
    }
  } else if (p.guard_type === 'disc') {
    const pts = rotatePts(circlePoints(0, 0, span, thick * DISC_RY_MUL), droopAngle);
    bounds.noteAll(pts);
    layers.push({ d: polygonPath(pts), ...style });
  } else if (p.guard_type === 'crescent') {
    const R = span, r = span * CRESCENT_INNER_MUL, dx = -span * CRESCENT_SHIFT_MUL;
    const outer = [];
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const a = -Math.PI / 2 + Math.PI * (i / segs);
      outer.push([R * Math.sin(a), -R * Math.cos(a)]);
    }
    const inner = [];
    for (let i = segs; i >= 0; i--) {
      const a = -Math.PI / 2 + Math.PI * (i / segs);
      inner.push([dx + r * Math.sin(a), -r * Math.cos(a)]);
    }
    const pts = rotatePts([...outer, ...inner], droopAngle);
    bounds.noteAll(pts);
    layers.push({ d: polygonPath(pts), ...style });
  } else {
    // 'bar' — simple rotated rectangle
    const corners = rotatePts(
      [[-span, -thick / 2], [span, -thick / 2], [span, thick / 2], [-span, thick / 2]],
      droopAngle,
    );
    bounds.noteAll(corners);
    layers.push({ d: polygonPath(corners), ...style });
  }

  if (p.guard_shell === 1) {
    const r = span * GUARD_SHELL_R_MUL;
    const shell = circlePoints(0, thick * 0.5, r, r * 0.7, 20).filter(([, y]) => y <= thick * 0.5 + 0.001);
    if (shell.length >= 2) {
      bounds.noteAll(shell);
      layers.push({ d: polylinePath(shell), fill: 'none', stroke: 'var(--accent)', strokeWidth: 0.004, opacity: 0.6 });
    }
  }

  if (p.guard_ext === 'swept') {
    const from = rotatePoint([span, 0], droopAngle);
    const to = [span * 0.15, -span * 1.5];
    const ctrl = [span * 1.3, -span * 0.7];
    const pts = [];
    for (let i = 0; i <= SWEPT_BOW_SAMPLES; i++) pts.push(quadBezierPoint(from, ctrl, to, i / SWEPT_BOW_SAMPLES));
    bounds.noteAll(pts);
    layers.push({ d: polylinePath(pts), fill: 'none', stroke: 'var(--trim)', strokeWidth: thick * 1.2, opacity: 0.9 });
  } else if (p.guard_ext === 'ring') {
    const r = span * GUARD_EXT_RING_R_MUL;
    const cx = span * 0.35;
    const pts = circlePoints(cx, 0, r, r, 24);
    bounds.noteAll(pts);
    layers.push({ d: polylinePath([...pts, pts[0]]), fill: 'none', stroke: 'var(--trim)', strokeWidth: thick * 1.1, opacity: 0.95 });
  }

  return layers;
}

// ---------------------------------------------------------------------------
// grip — body (grip_profile), wrap_bands, grip_risers ripple, ferrule_on
// ---------------------------------------------------------------------------

const GRIP_SAMPLES = 14;
const GRIP_WAIST_AMOUNT = 0.35;
const GRIP_BARREL_AMOUNT = 0.30;
const RISER_RIPPLE_AMP = 0.06;
const FERRULE_HEIGHT_MUL = 0.5; // relative to grip_r

function gripWidthMul(u, profile) {
  if (profile === 'waisted') return 1 - GRIP_WAIST_AMOUNT * Math.sin(Math.PI * u);
  if (profile === 'barrel') return 1 + GRIP_BARREL_AMOUNT * Math.sin(Math.PI * u);
  return 1;
}

function buildGrip(p, gripTopY, gripBotY, bounds) {
  const layers = [];
  const len = gripTopY - gripBotY;
  const yFn = t => gripTopY - t * len; // t=0 at guard end, t=1 at pommel end
  const widthFn = t => {
    let mul = gripWidthMul(t, p.grip_profile);
    if (p.grip_risers > 0) mul *= 1 + RISER_RIPPLE_AMP * Math.sin(t * Math.PI * 2 * p.grip_risers);
    const w = p.grip_r * mul;
    return [w, w];
  };
  const d = buildOutline(GRIP_SAMPLES, yFn, widthFn, () => 0, bounds);
  layers.push({ d, fill: 'var(--grip-fill)', stroke: 'var(--grip-stroke)', strokeWidth: 0.004, opacity: 1 });

  if (p.wrap_bands > 0) {
    for (let i = 1; i <= p.wrap_bands; i++) {
      const t = i / (p.wrap_bands + 1);
      const y = yFn(t);
      const w = p.grip_r * gripWidthMul(t, p.grip_profile);
      layers.push({ d: polylinePath([[-w, y], [w, y]]), fill: 'none', stroke: 'var(--grip-stroke)', strokeWidth: 0.0035, opacity: 0.7 });
    }
  }

  if (p.ferrule_on === 1) {
    const h = p.grip_r * FERRULE_HEIGHT_MUL;
    const yTop = gripTopY, yBot = gripTopY - h;
    const wTop = p.grip_r * gripWidthMul(0, p.grip_profile) * 1.05;
    const wBot = p.grip_r * gripWidthMul(h / len, p.grip_profile) * 1.05;
    const rect = [[-wTop, yTop], [wTop, yTop], [wBot, yBot], [-wBot, yBot]];
    bounds.noteAll(rect);
    layers.push({ d: polygonPath(rect), fill: 'var(--trim)', stroke: 'none', strokeWidth: 0, opacity: 1 });
  }

  return layers;
}

// ---------------------------------------------------------------------------
// pommel — disc / sphere / scent_stopper / faceted (pommel_facets) / ring
// ---------------------------------------------------------------------------

const DEFAULT_FACETED_SIDES = 8; // pommel_facets == 0 -> legacy fixed-octahedron look
const RING_INNER_FRAC = 0.5;
const SCENT_SHOULDER_T = 0.28;
const SCENT_TAPER_EXP = 1.2;

function buildPommel(p, pommelY, bounds) {
  const style = { fill: 'var(--guard-fill)', stroke: 'var(--guard-stroke)', strokeWidth: 0.004, opacity: 1 };
  if (p.pommel_type === 'sphere') {
    const pts = circlePoints(0, pommelY, p.pommel_r, p.pommel_r);
    bounds.noteAll(pts);
    return [{ d: polygonPath(pts), ...style }];
  }
  if (p.pommel_type === 'disc') {
    const pts = circlePoints(0, pommelY, p.pommel_r, p.pommel_r * 0.55);
    bounds.noteAll(pts);
    return [{ d: polygonPath(pts), ...style }];
  }
  if (p.pommel_type === 'ring') {
    const d = ringPath(0, pommelY, p.pommel_r, p.pommel_r * RING_INNER_FRAC);
    bounds.note(-p.pommel_r, pommelY - p.pommel_r);
    bounds.note(p.pommel_r, pommelY + p.pommel_r);
    return [{ d, ...style }];
  }
  if (p.pommel_type === 'faceted') {
    const sides = p.pommel_facets > 0 ? p.pommel_facets : DEFAULT_FACETED_SIDES;
    const pts = circlePoints(0, pommelY, p.pommel_r, p.pommel_r, sides);
    bounds.noteAll(pts);
    return [{ d: polygonPath(pts), ...style }];
  }
  // 'scent_stopper' — tapered cone, wide shoulder near the grip, narrowing to a point away from it
  const yTop = pommelY - p.pommel_r; // shoulder end (nearer the grip)
  const yBot = pommelY + p.pommel_r; // tapered point end
  const yFn = t => yTop + t * (yBot - yTop);
  const widthFn = t => {
    const w = t < SCENT_SHOULDER_T ? p.pommel_r : p.pommel_r * Math.pow(1 - (t - SCENT_SHOULDER_T) / (1 - SCENT_SHOULDER_T), SCENT_TAPER_EXP);
    return [w, w];
  };
  const d = buildOutline(10, yFn, widthFn, () => 0, bounds);
  return [{ d, ...style }];
}

// ---------------------------------------------------------------------------
// sword assembly
// ---------------------------------------------------------------------------

function buildSword(p, palette, bounds) {
  const layout = deriveLayout(p);
  const layers = [];
  // back-to-front: pommel, grip, guard, blade body, blade line-work on top
  layers.push(...buildPommel(p, layout.pommelY, bounds));
  layers.push(...buildGrip(p, -p.guard_thick / 2, layout.gripBot, bounds));
  layers.push(...buildGuard(p, palette, bounds));
  layers.push(buildBlade(p, layout.bladeRoot, bounds));
  layers.push(...buildCrossSectionLines(p, layout.bladeRoot, palette));
  layers.push(...buildFullers(p, layout.bladeRoot));
  layers.push(...buildEdgeBevel(p, layout.bladeRoot));
  return layers;
}

// ---------------------------------------------------------------------------
// axe — haft, head (bearded/broad/double_bit/war), cheek_profile, poll_type,
// langets, haft_butt, haft_wrap
// ---------------------------------------------------------------------------

const HAFT_SAMPLES = 20;
const HAFT_BUTT_EXTEND = 0.035;
const HAFT_BUTT_R_MUL = 1.6;
const HAFT_WRAP_ZONE = [0.02, 0.22]; // fraction of haft length near the base, grip zone
const HAFT_WRAP_BANDS = 5;

const LANGET_X_OFFSET_MUL = 1.15; // relative to haft_r
const LANGET_WIDTH_MUL = 0.55;
const LANGET_MIN_VISIBLE = 0.02;

const HEAD_SAMPLES = 12;
const BEARD_HOOK_EXP = 1.4;
const CHEEK_BOW_FRAC = 0.35; // how far the cheek line bows relative to cheek_thick
const EYE_COLLAR_R_MUL = 1.35; // relative to haft_r — the eye/haft-collar always renders (floor layer)

const DOUBLE_BIT_ASYM_BY_POLL = { flat: 0, hammer: 0.12, spike: -0.12 };

function buildHaft(p, bounds) {
  const yFn = t => t * p.haft_len;
  const offsetXFn = t => p.haft_curve * p.haft_len * Math.pow(t, CURVE_EXP);
  const widthFn = () => [p.haft_r, p.haft_r];
  const d = buildOutline(HAFT_SAMPLES, yFn, widthFn, offsetXFn, bounds);
  const layers = [{ d, fill: 'var(--haft-fill)', stroke: 'var(--haft-stroke)', strokeWidth: 0.004, opacity: 1 }];

  if (p.haft_wrap === 1) {
    const [t0, t1] = HAFT_WRAP_ZONE;
    for (let i = 1; i <= HAFT_WRAP_BANDS; i++) {
      const t = t0 + (t1 - t0) * (i / (HAFT_WRAP_BANDS + 1));
      const y = yFn(t);
      const off = p.haft_curve * p.haft_len * Math.pow(t, CURVE_EXP);
      layers.push({ d: polylinePath([[off - p.haft_r, y], [off + p.haft_r, y]]), fill: 'none', stroke: 'var(--trim)', strokeWidth: 0.003, opacity: 0.6 });
    }
  }

  if (p.haft_butt === 1) {
    const r = p.haft_r * HAFT_BUTT_R_MUL;
    const rect = [[-r, 0], [r, 0], [p.haft_r, HAFT_BUTT_EXTEND * -1], [-p.haft_r, HAFT_BUTT_EXTEND * -1]];
    bounds.noteAll(rect);
    layers.push({ d: polygonPath(rect), fill: 'var(--trim)', stroke: 'none', strokeWidth: 0, opacity: 1 });
  }

  return layers;
}

function headEdgeProfile(p, headHalfH) {
  // returns fn(t) -> forward reach at t in [-1,1] along the head's vertical span (0 = center)
  const sweep = p.edge_sweep;
  switch (p.head_type) {
    case 'bearded':
      // short reach above center, deep hook (beard) below center
      return t => t >= 0 ? sweep * (1 - t) : sweep * 0.3 + p.beard_depth * Math.pow(-t, BEARD_HOOK_EXP);
    case 'broad':
      return t => sweep * (1 - 0.4 * t * t) + p.beard_depth * 0.25 * Math.max(0, -t);
    case 'war':
      return t => sweep * 0.7 * (1 - Math.abs(t) * 0.6);
    default: // double_bit handled separately (two mirrored edges)
      return t => sweep * (1 - Math.abs(t) * 0.5);
  }
}

function buildHead(p, layout, bounds) {
  const layers = [];
  const cy = layout.headY;
  const hh = layout.headHalfH;
  const reach = layout.edgeReach;

  const buildEdgePolygon = (mirrorSign, edgeFn, xBase) => {
    const pts = [];
    for (let i = 0; i <= HEAD_SAMPLES; i++) {
      const t = -1 + 2 * (i / HEAD_SAMPLES);
      const fwd = xBase + reach * edgeFn(t) * mirrorSign;
      pts.push([fwd, cy + t * hh]);
    }
    // back to the haft line to close the silhouette
    const backPts = [[xBase, cy + hh], [xBase, cy - hh]];
    const all = mirrorSign > 0 ? [...pts, ...backPts] : [...backPts.slice().reverse(), ...pts.slice().reverse()];
    bounds.noteAll(all);
    return polygonPath(all);
  };

  const style = { fill: 'var(--haft-fill)', stroke: 'var(--haft-stroke)', strokeWidth: 0.005, opacity: 1 };

  if (p.head_type === 'double_bit') {
    const asym = DOUBLE_BIT_ASYM_BY_POLL[p.poll_type] ?? 0;
    const frontFn = t => p.edge_sweep * (1 - Math.abs(t) * 0.5) * (1 + asym);
    const backFn = t => p.edge_sweep * (1 - Math.abs(t) * 0.5) * (1 - asym);
    layers.push({ d: buildEdgePolygon(1, frontFn, 0), ...style });
    layers.push({ d: buildEdgePolygon(-1, backFn, 0), ...style });
  } else {
    const edgeFn = headEdgeProfile(p, hh);
    layers.push({ d: buildEdgePolygon(1, edgeFn, 0), ...style });
    layers.push(...buildPoll(p, cy, hh));
  }

  layers.push(...buildCheekLine(p, cy, hh, reach));
  layers.push(...buildEyeCollar(p, cy, hh, bounds));
  return layers;
}

function buildEyeCollar(p, cy, hh, bounds) {
  // the eye/haft-collar (research §3c) — always drawn regardless of gene rolls,
  // a small ring where the head meets the haft
  const collarY = cy + hh; // haft-facing edge of the head
  const r = p.haft_r * EYE_COLLAR_R_MUL;
  const pts = circlePoints(0, collarY, r, r * 0.7, 16);
  bounds.noteAll(pts);
  return [{ d: polygonPath(pts), fill: 'none', stroke: 'var(--trim)', strokeWidth: 0.004, opacity: 0.8 }];
}

const POLL_HAMMER_DEPTH_MUL = 0.55;
const POLL_SPIKE_DEPTH_MUL = 0.9;
const POLL_HALF_H_MUL = 0.6;

function buildPoll(p, cy, hh) {
  if (p.poll_type === 'flat') {
    return [{ d: polylinePath([[0, cy - hh * 0.8], [0, cy + hh * 0.8]]), fill: 'none', stroke: 'var(--haft-stroke)', strokeWidth: 0.004, opacity: 0.6 }];
  }
  const depthMul = p.poll_type === 'spike' ? POLL_SPIKE_DEPTH_MUL : POLL_HAMMER_DEPTH_MUL;
  const depth = -hh * depthMul;
  const pollHalfH = hh * POLL_HALF_H_MUL;
  const pts = p.poll_type === 'spike'
    ? [[0, cy - pollHalfH * 0.3], [depth, cy], [0, cy + pollHalfH * 0.3]]
    : [[0, cy - pollHalfH], [depth, cy - pollHalfH], [depth, cy + pollHalfH], [0, cy + pollHalfH]];
  return [{ d: polygonPath(pts), fill: 'var(--haft-fill)', stroke: 'var(--haft-stroke)', strokeWidth: 0.004, opacity: 1 }];
}

function buildCheekLine(p, cy, hh, reach) {
  const bow = p.cheek_profile === 'concave' ? -1 : p.cheek_profile === 'convex' ? 1 : 0;
  const steps = 10;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = -1 + 2 * (i / steps);
    const baseX = reach * 0.45 * (1 - Math.abs(t) * 0.3);
    const bowOffset = bow * p.cheek_thick * CHEEK_BOW_FRAC * (1 - t * t);
    pts.push([baseX + bowOffset, cy + t * hh * 0.9]);
  }
  return [{ d: polylinePath(pts), fill: 'none', stroke: 'var(--haft-shade)', strokeWidth: 0.003, opacity: 0.55 }];
}

function buildLangets(p, layout, bounds) {
  if (p.langet_len < LANGET_MIN_VISIBLE) return [];
  const yTop = layout.headY - layout.headHalfH;
  const yBot = yTop - p.langet_len * p.haft_len;
  if (yBot >= yTop) return [];
  const style = { fill: 'var(--trim)', stroke: 'none', strokeWidth: 0, opacity: 0.9 };
  const layers = [];
  for (const sign of [-1, 1]) {
    const xBase = sign * p.haft_r * LANGET_X_OFFSET_MUL;
    const w = p.haft_r * LANGET_WIDTH_MUL;
    const rect = [[xBase - w / 2, yTop], [xBase + w / 2, yTop], [xBase + w * 0.3, yBot], [xBase - w * 0.3, yBot]];
    bounds.noteAll(rect);
    layers.push({ d: polygonPath(rect), ...style });
  }
  return layers;
}

function buildAxe(p, palette, bounds) {
  const layout = deriveLayout(p);
  const layers = [];
  layers.push(...buildHaft(p, bounds));
  layers.push(...buildHead(p, layout, bounds));
  layers.push(...buildLangets(p, layout, bounds));
  return layers;
}

// ---------------------------------------------------------------------------
// public entry point
// ---------------------------------------------------------------------------

export function buildWeapon(p) {
  const bounds = new Bounds();
  const palette = derivePalette(p);
  const layers = p.weapon_class === 'axe' ? buildAxe(p, palette, bounds) : buildSword(p, palette, bounds);
  return { kind: p.weapon_class, layers, bounds: bounds.toJSON() };
}
