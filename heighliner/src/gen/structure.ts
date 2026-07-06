// structure(seedS) -> StructureSpec. Frigate role only (session 2).
// Fixed spine: engine -> drive -> mid* -> hull -> nose, now with silhouette
// layer 1 (brief §6): profile curves, edge features, join collars.
// Per-segment draws come from derive(seedS, segmentId) streams so adding
// draws to one segment never disturbs another. Draw order inside a segment
// stream is FROZEN: dims first, then profile, then edge features, then collar
// — new draws must only ever be appended after the collar draws.

import { derive, int, pick, range, stream, type Prng } from "../core/prng";
import type {
  EdgeFeature,
  EdgeFeatureType,
  JoinCollar,
  ProfileType,
  Segment,
  SegmentType,
  Socket,
  StructureSpec,
} from "./types";

// Frigate profile as data (brief §4.3); more roles = more rows, later.
// Spreads widened ~50-60% from session 1 (operator verdict: fleet read too
// similar); midRepeats up to 3 for longer stacks.
const FRIGATE = {
  midRepeats: [1, 3] as const,
  engine: { len: [7, 13], foreShrink: [0.67, 0.95], aftHalfWidth: [5.8, 9.8] },
  drive: { len: [8.5, 17.5], step: [0.81, 1.04], taper: [0.86, 1.09] },
  mid: { len: [8.5, 17.5], step: [0.91, 1.17], taper: [0.88, 1.12] },
  hull: { len: [14, 26], step: [1.08, 1.47], taper: [0.81, 1.04] },
  nose: { len: [8.5, 17.5], step: [0.85, 1.03], tipFraction: [0.08, 0.32] },
};

// --- profile curves -----------------------------------------------------------

// Weighted profile choice per segment type — plausibility bias (engine skirts
// flare, drives taper toward the stack, hulls carry the mass, noses close).
const PROFILE_WEIGHTS: Record<SegmentType, readonly (readonly [ProfileType, number])[]> = {
  engine: [["flare", 0.45], ["taper", 0.4], ["chamferStep", 0.15]],
  drive: [["taper", 0.65], ["flare", 0.2], ["chamferStep", 0.15]],
  mid: [["taper", 0.4], ["bulge", 0.3], ["chamferStep", 0.3]],
  hull: [["bulge", 0.4], ["flare", 0.3], ["taper", 0.3]],
  nose: [["taper", 0.6], ["chamferStep", 0.4]],
};

function weightedPick<T>(rng: Prng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

interface ProfileDraw {
  profile: ProfileType;
  peak?: number;
  profileT?: number;
}

/** One profile pick + its params, drawn AFTER the segment's dims draws. */
function drawProfile(rng: Prng, type: SegmentType, aft: number, fore: number): ProfileDraw {
  const profile = weightedPick(rng, PROFILE_WEIGHTS[type]);
  const lo = Math.min(aft, fore);
  const hi = Math.max(aft, fore);
  switch (profile) {
    case "taper":
      return { profile };
    case "flare":
      // peak = quadratic-bezier control half-width, biased toward the narrow
      // end: the edge hugs the narrow width then swells toward the wide end.
      // Control strictly between aft and fore keeps the edge monotone.
      return { profile, peak: lo + (hi - lo) * range(rng, 0.1, 0.35) };
    case "bulge":
      // Peak must exceed both ends so the belly reads as a real bulge.
      return { profile, peak: hi * range(rng, 1.08, 1.28), profileT: range(rng, 0.35, 0.65) };
    case "chamferStep":
      // Hard width step at profileT, reached via a short 45°-ish chamfer.
      return { profile, profileT: range(rng, 0.3, 0.7) };
  }
}

/** Axial window [tLo, tHi] of the chamferStep transition (pure, from spec). */
function chamferWindow(seg: Segment): [number, number] {
  const { aft, fore } = seg.halfWidth;
  // 45°-ish: axial run of the chamfer ≈ the width change, clamped sane.
  const cFrac = Math.min(0.18, Math.max(0.03, Math.abs(aft - fore) / seg.length));
  const tHi = Math.min(seg.profileT ?? 0.5, 0.92);
  const tLo = Math.max(tHi - cFrac, 0.05);
  return [tLo, tHi];
}

/** Base (feature-free) half-width of the profile curve at axial fraction t. */
function profileHalfWidth(seg: Segment, t: number): number {
  const { aft, fore, peak } = seg.halfWidth;
  switch (seg.profile) {
    case "taper":
      return aft + (fore - aft) * t;
    case "flare": {
      const c = peak ?? (aft + fore) / 2;
      const u = 1 - t;
      return u * u * aft + 2 * u * t * c + t * t * fore;
    }
    case "bulge": {
      const p = peak ?? Math.max(aft, fore) * 1.15;
      const pT = Math.min(0.95, Math.max(0.05, seg.profileT ?? 0.5));
      if (t <= pT) return aft + (p - aft) * Math.sin((Math.PI / 2) * (t / pT));
      return fore + (p - fore) * Math.cos((Math.PI / 2) * ((t - pT) / (1 - pT)));
    }
    case "chamferStep": {
      const [tLo, tHi] = chamferWindow(seg);
      if (t <= tLo) return aft;
      if (t >= tHi) return fore;
      return aft + (fore - aft) * ((t - tLo) / (tHi - tLo));
    }
  }
}

// --- edge features --------------------------------------------------------------

const FEATURE_TYPES: readonly EdgeFeatureType[] = ["shoulderStep", "notch", "sponson", "chamfer"];

// Signed depth ranges (fraction of local half-width): sponson/shoulderStep
// push outboard (+), notch/chamfer cut inboard (−).
const FEATURE_DEPTH: Record<EdgeFeatureType, readonly [number, number]> = {
  shoulderStep: [0.08, 0.18],
  sponson: [0.14, 0.3],
  notch: [-0.25, -0.12],
  chamfer: [-0.18, -0.08],
};

/** End margin: features never touch t=0/1 so joins stay clean. */
const FEATURE_MARGIN = 0.12;

/**
 * 0-2 features per segment; restraint reads engineered so most segments get
 * none. Two features draw from disjoint axial windows so spans never overlap.
 */
function drawEdgeFeatures(rng: Prng): EdgeFeature[] {
  const roll = rng();
  const count = roll < 0.55 ? 0 : roll < 0.88 ? 1 : 2;
  const windows: readonly (readonly [number, number])[] =
    count === 2
      ? [
          [FEATURE_MARGIN, 0.47],
          [0.53, 1 - FEATURE_MARGIN],
        ]
      : [[FEATURE_MARGIN, 1 - FEATURE_MARGIN]];
  const features: EdgeFeature[] = [];
  for (let i = 0; i < count; i++) {
    const [wLo, wHi] = windows[i]!;
    const type = pick(rng, FEATURE_TYPES);
    const len = range(rng, 0.08, Math.min(0.3, wHi - wLo - 0.02));
    const from = range(rng, wLo, wHi - len);
    const [dLo, dHi] = FEATURE_DEPTH[type];
    features.push({ type, span: { from, to: from + len }, depth: range(rng, dLo, dHi) });
  }
  return features;
}

/** Axial length of a feature's lead-in/out ramp (45°-ish, engineered look). */
function featureRamp(f: EdgeFeature): number {
  const len = f.span.to - f.span.from;
  const frac = f.type === "sponson" ? 0.3 : f.type === "shoulderStep" ? 0.18 : 0.12;
  const cap = f.type === "sponson" ? 0.06 : f.type === "shoulderStep" ? 0.035 : 0.02;
  return Math.max(1e-6, Math.min(len * frac, cap, len / 2 - 1e-6));
}

/** Envelope in [0,1] shaping the feature's deviation across its span. */
function featureEnvelope(f: EdgeFeature, t: number): number {
  const { from, to } = f.span;
  if (t <= from || t >= to) return 0;
  if (f.type === "chamfer") {
    // triangular inboard cut: deepest at the span midpoint
    const mid = (from + to) / 2;
    return t <= mid ? (t - from) / (mid - from) : (to - t) / (to - mid);
  }
  // trapezoid: short ramps in/out, flat plateau
  const ramp = featureRamp(f);
  return Math.min(1, (t - from) / ramp, (to - t) / ramp);
}

// --- join collars -----------------------------------------------------------

/** Seeded presence on ~half the joins; a proud lip at the fore boundary. */
function drawJoinCollar(rng: Prng, foreHalfWidth: number): JoinCollar | undefined {
  const present = rng() < 0.5;
  // Draw params unconditionally so presence never shifts later appends.
  const length = foreHalfWidth * range(rng, 0.22, 0.4);
  const widthFactor = range(rng, 1.02, 1.12);
  return present ? { length, widthFactor } : undefined;
}

// --- segment assembly ---------------------------------------------------------

function segment(
  seedS: number,
  id: string,
  type: SegmentType,
  prevFore: number,
  build: (rng: () => number, aft: number) => { length: number; fore: number; aft?: number },
): Segment {
  const rng = stream(derive(seedS, id));
  // 1) dims draws (frozen session-1 order)
  const spec = build(rng, prevFore);
  const aft = spec.aft ?? prevFore;
  const fore = spec.fore;
  // 2) profile draws
  const prof = drawProfile(rng, type, aft, fore);
  // 3) edge feature draws
  const edgeFeatures = drawEdgeFeatures(rng);
  // 4) collar draws (nose has no fore join)
  const join = type === "nose" ? undefined : drawJoinCollar(rng, fore);

  const halfWidth: Segment["halfWidth"] = { aft, fore };
  if (prof.peak !== undefined) halfWidth.peak = prof.peak;

  const seg: Segment = {
    id,
    type,
    length: spec.length,
    profile: prof.profile,
    halfWidth,
    edgeFeatures,
    sockets: [],
  };
  if (prof.profileT !== undefined) seg.profileT = prof.profileT;
  if (join) seg.join = join;
  return seg;
}

export function structure(seedS: number): StructureSpec {
  const rng = stream(seedS);
  const midCount = int(rng, FRIGATE.midRepeats[0], FRIGATE.midRepeats[1]);

  const segments: Segment[] = [];
  const p = FRIGATE;

  const engine = segment(seedS, "engine", "engine", 0, (r) => {
    const aft = range(r, p.engine.aftHalfWidth[0]!, p.engine.aftHalfWidth[1]!);
    return {
      length: range(r, p.engine.len[0]!, p.engine.len[1]!),
      aft,
      fore: aft * range(r, p.engine.foreShrink[0]!, p.engine.foreShrink[1]!),
    };
  });
  segments.push(engine);

  const trapezoid =
    (t: { len: number[]; step: number[]; taper: number[] }) =>
    (r: () => number, prevFore: number) => {
      const aft = prevFore * range(r, t.step[0]!, t.step[1]!);
      return {
        length: range(r, t.len[0]!, t.len[1]!),
        aft,
        fore: aft * range(r, t.taper[0]!, t.taper[1]!),
      };
    };

  const drive = segment(seedS, "drive", "drive", engine.halfWidth.fore, trapezoid(p.drive));
  segments.push(drive);

  let prevFore = drive.halfWidth.fore;
  for (let i = 0; i < midCount; i++) {
    const mid = segment(seedS, `mid-${i}`, "mid", prevFore, trapezoid(p.mid));
    segments.push(mid);
    prevFore = mid.halfWidth.fore;
  }

  const hull = segment(seedS, "hull", "hull", prevFore, trapezoid(p.hull));
  segments.push(hull);

  const nose = segment(seedS, "nose", "nose", hull.halfWidth.fore, (r, pf) => {
    const aft = pf * range(r, p.nose.step[0]!, p.nose.step[1]!);
    return {
      length: range(r, p.nose.len[0]!, p.nose.len[1]!),
      aft,
      fore: aft * range(r, p.nose.tipFraction[0]!, p.nose.tipFraction[1]!),
    };
  });
  segments.push(nose);

  // Sockets (session 1): two mirrored lateral pairs on the hull, one ring
  // band on the drive. Axial positions seeded from the socket layer of the
  // structure seed, per socket id.
  const socketAt = (id: string, lo: number, hi: number): number =>
    range(stream(derive(seedS, "socket", id)), lo, hi);

  const hullSockets: Socket[] = [
    { id: "hull-lat-0", kind: "lateralPair", at: socketAt("hull-lat-0", 0.2, 0.4), accepts: ["turret-large"] },
    { id: "hull-lat-1", kind: "lateralPair", at: socketAt("hull-lat-1", 0.6, 0.8), accepts: ["turret-large"] },
  ];
  hull.sockets = hullSockets;

  drive.sockets = [
    { id: "drive-ring-0", kind: "ringBand", at: socketAt("drive-ring-0", 0.35, 0.65), accepts: ["thruster-cluster"] },
  ];

  return {
    role: "frigate",
    axisLength: segments.reduce((sum, s) => sum + s.length, 0),
    segments,
  };
}

// --- geometry helpers shared by kit/emit (pure, derived from the spec) -------

export interface SegmentFrame {
  segment: Segment;
  /** World y of the aft edge (larger y = aftward; nose tip is y = 0). */
  yAft: number;
  /** World y of the fore edge. */
  yFore: number;
}

/** Lay segments out in world coords: nose tip at y=0, engine aft at y=axisLength. */
export function frames(spec: StructureSpec): SegmentFrame[] {
  const out: SegmentFrame[] = [];
  let sFromAft = 0;
  for (const seg of spec.segments) {
    const yAft = spec.axisLength - sFromAft;
    out.push({ segment: seg, yAft, yFore: yAft - seg.length });
    sFromAft += seg.length;
  }
  return out;
}

/**
 * Half-width of the VISIBLE edge at axial fraction t (0 = aft, 1 = fore):
 * profile curve plus edge-feature deviations. Single source of truth — kit
 * anchors and detail geometry must land on the real silhouette.
 */
export function halfWidthAt(seg: Segment, t: number): number {
  let dev = 0;
  for (const f of seg.edgeFeatures) dev += featureEnvelope(f, t) * f.depth;
  return profileHalfWidth(seg, t) * (1 + dev);
}

/** World y of a segment-relative axial fraction. */
export function yAt(frame: SegmentFrame, t: number): number {
  return frame.yAft - frame.segment.length * t;
}

/** Uniform interior sample count for curved profiles (flare/bulge). */
const CURVE_SAMPLES = 12;

/**
 * Closed silhouette polygon for a segment, in world coords, both sides.
 * Starboard (+x) aft->fore, then port (-x) fore->aft; consumers close the
 * ring (first/last points share the aft edge). Exact vertices at profile
 * steps and feature breakpoints; curved profiles oversampled.
 */
export function segmentOutline(frame: SegmentFrame): [number, number][] {
  const seg = frame.segment;
  const ts: number[] = [0, 1];
  if (seg.profile === "chamferStep") {
    const [tLo, tHi] = chamferWindow(seg);
    ts.push(tLo, tHi);
  } else if (seg.profile === "flare" || seg.profile === "bulge") {
    for (let i = 1; i < CURVE_SAMPLES; i++) ts.push(i / CURVE_SAMPLES);
    if (seg.profile === "bulge") ts.push(Math.min(0.95, Math.max(0.05, seg.profileT ?? 0.5)));
  }
  for (const f of seg.edgeFeatures) {
    const { from, to } = f.span;
    ts.push(from, to);
    if (f.type === "chamfer") {
      ts.push((from + to) / 2);
    } else {
      const ramp = featureRamp(f);
      ts.push(from + ramp, to - ramp);
    }
  }
  const sorted = ts
    .map((t) => Math.min(1, Math.max(0, t)))
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1]! > 1e-6);

  const starboard: [number, number][] = sorted.map((t) => [halfWidthAt(seg, t), yAt(frame, t)]);
  const port: [number, number][] = [...sorted].reverse().map((t) => [-halfWidthAt(seg, t), yAt(frame, t)]);
  return [...starboard, ...port];
}
