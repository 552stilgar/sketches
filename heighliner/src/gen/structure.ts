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
  PartType,
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

// --- socket generation (K2: budgeted layout, brief §4.3/§4.4/§6) ------------
// Sockets draw on stream namespaces separate from a segment's own frozen
// dims/profile/feature/collar stream: counts come from
// derive(seedS, "socket-count", segId, category), axial positions keep the
// existing derive(seedS, "socket", id) idiom so per-socket streams stay
// independent of everything else (including budget clamping, which only
// ever adjusts already-drawn counts — no new randomness).

const WEAPON_PARTS: PartType[] = ["turret-large", "turret-small", "pdc-mount"];
const HULL_CENTERLINE_PARTS: PartType[] = ["sensor-dish", "comm-mast"];
const MID_UTILITY_PARTS: PartType[] = ["radiator-fin", "cargo-hatch", "vent-strip", "docking-collar"];
const MID_CENTERLINE_PARTS: PartType[] = ["comm-mast", "sensor-dish"];
const DRIVE_UTILITY_PARTS: PartType[] = ["radiator-fin", "vent-strip"];
const NOSE_CENTERLINE_PARTS: PartType[] = ["sensor-dish", "docking-collar"];

/** Minimum axial separation enforced between any two sockets on one segment. */
export const MIN_SOCKET_SPACING = 0.18;

function socketAxial(seedS: number, id: string, lo: number, hi: number): number {
  return range(stream(derive(seedS, "socket", id)), lo, hi);
}

function socketCountDraw(seedS: number, segId: string, category: string, lo: number, hi: number): number {
  return int(stream(derive(seedS, "socket-count", segId, category)), lo, hi);
}

/**
 * Hull is the ship's only weapon-socket segment, so its raw 1-2 draw (item
 * variety) is floor-clamped into the frigate's "weapon fill MID" budget
 * (brief §4.3: total weapon sockets 2-3) — a pure post-process on the
 * already-drawn count, no extra randomness.
 */
function hullWeaponCount(seedS: number, segId: string): number {
  const raw = socketCountDraw(seedS, segId, "weapon", 1, 2);
  return Math.max(2, Math.min(3, raw));
}

/**
 * Deterministic post-process: push sockets on a segment apart so no two sit
 * closer than MIN_SOCKET_SPACING. Pure function of the already-drawn `at`
 * values — no new randomness, so per-socket streams stay untouched.
 *
 * Pass 1 cascades later sockets forward just enough to satisfy the minimum
 * gap (this alone can walk the run past the segment's fore edge if an early
 * gap was already wide). Pass 2 then shifts the *whole* run by a constant
 * offset if it overshot either safe edge — a uniform shift preserves every
 * pairwise gap exactly, so spacing stays correct after the correction too.
 */
function enforceSpacing(sockets: Socket[]): void {
  if (sockets.length < 2) return;
  const SAFE_LO = 0.03;
  const SAFE_HI = 0.97;
  const sorted = [...sockets].sort((a, b) => a.at - b.at);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.at - prev.at < MIN_SOCKET_SPACING) cur.at = prev.at + MIN_SOCKET_SPACING;
  }

  const last = sorted[sorted.length - 1]!;
  if (last.at > SAFE_HI) {
    const shift = last.at - SAFE_HI;
    for (const s of sorted) s.at -= shift;
  }
  const first = sorted[0]!;
  if (first.at < SAFE_LO) {
    const shift = SAFE_LO - first.at;
    for (const s of sorted) s.at += shift;
  }
}

/**
 * Round-robin count clamp across a shared budget pool (brief §4.3 utility
 * total 2-5): boosts under-budget slots from the front, trims over-budget
 * slots from the back. Pure function of the already-drawn raw counts.
 */
function clampCounts(raw: number[], caps: number[], lo: number, hi: number): number[] {
  const counts = [...raw];
  let total = counts.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (total < lo && guard < 100) {
    let progressed = false;
    for (let i = 0; i < counts.length && total < lo; i++) {
      if (counts[i]! < caps[i]!) {
        counts[i]!++;
        total++;
        progressed = true;
      }
    }
    guard++;
    if (!progressed) break;
  }
  for (let i = counts.length - 1; total > hi && i >= 0; i--) {
    while (counts[i]! > 0 && total > hi) {
      counts[i]!--;
      total--;
    }
  }
  return counts;
}

// Weapon-lateral axial windows keyed by hull's final (post-clamp) count —
// spread wide first, subdivide as more sockets join the run.
const HULL_WEAPON_WINDOWS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0.35, 0.65]],
  2: [[0.12, 0.42], [0.58, 0.88]],
  3: [[0.08, 0.28], [0.36, 0.56], [0.64, 0.88]],
};

function buildHullSockets(seedS: number, segId: string): Socket[] {
  const n = hullWeaponCount(seedS, segId);
  const weaponWindows = HULL_WEAPON_WINDOWS[n] ?? HULL_WEAPON_WINDOWS[3]!;
  const sockets: Socket[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${segId}-lat-${i}`;
    const [lo, hi] = weaponWindows[i]!;
    sockets.push({ id, kind: "lateralPair", at: socketAxial(seedS, id, lo, hi), accepts: WEAPON_PARTS });
  }
  const ctrCount = socketCountDraw(seedS, segId, "centerline", 0, 1);
  if (ctrCount === 1) {
    const id = `${segId}-ctr-0`;
    sockets.push({ id, kind: "centerline", at: socketAxial(seedS, id, 0.15, 0.85), accepts: HULL_CENTERLINE_PARTS });
  }
  enforceSpacing(sockets);
  return sockets;
}

// Utility-lateral axial windows keyed by the mid's final utility count (brief
// §4.3 budget clamp decides the count; this only decides where they sit).
const MID_UTILITY_WINDOWS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0.3, 0.7]],
  2: [[0.08, 0.38], [0.62, 0.92]],
};

function buildMidSockets(seedS: number, segId: string, utilCount: number): Socket[] {
  const utilWindows = MID_UTILITY_WINDOWS[utilCount] ?? MID_UTILITY_WINDOWS[2]!;
  const sockets: Socket[] = [];
  for (let i = 0; i < utilCount; i++) {
    const id = `${segId}-lat-${i}`;
    const [lo, hi] = utilWindows[i]!;
    sockets.push({ id, kind: "lateralPair", at: socketAxial(seedS, id, lo, hi), accepts: MID_UTILITY_PARTS });
  }
  const ctrCount = socketCountDraw(seedS, segId, "centerline", 0, 1);
  if (ctrCount === 1) {
    const id = `${segId}-ctr-0`;
    sockets.push({ id, kind: "centerline", at: socketAxial(seedS, id, 0.15, 0.85), accepts: MID_CENTERLINE_PARTS });
  }
  enforceSpacing(sockets);
  return sockets;
}

function buildDriveSockets(seedS: number, segId: string, utilCount: number): Socket[] {
  const ringId = `${segId}-ring-0`;
  const sockets: Socket[] = [
    { id: ringId, kind: "ringBand", at: socketAxial(seedS, ringId, 0.35, 0.65), accepts: ["thruster-cluster"] },
  ];
  if (utilCount >= 1) {
    const id = `${segId}-lat-0`;
    sockets.push({ id, kind: "lateralPair", at: socketAxial(seedS, id, 0.05, 0.2), accepts: DRIVE_UTILITY_PARTS });
  }
  enforceSpacing(sockets);
  return sockets;
}

function buildNoseSockets(seedS: number, segId: string): Socket[] {
  const ctrCount = socketCountDraw(seedS, segId, "centerline", 0, 1);
  if (ctrCount === 0) return [];
  const id = `${segId}-ctr-0`;
  return [{ id, kind: "centerline", at: socketAxial(seedS, id, 0.15, 0.75), accepts: NOSE_CENTERLINE_PARTS }];
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

  // Sockets (K2: budgeted layout, brief §4.3/§4.4/§6). Weapon fill lives on
  // the hull only, floor-clamped into the frigate budget. Utility fill is
  // shared across mids + drive, drawn independently per segment then
  // round-robin clamped into the shared 2-5 budget pool (brief §4.3).
  hull.sockets = buildHullSockets(seedS, hull.id);

  const midSegs = segments.filter((s) => s.type === "mid");
  const rawUtil = [
    ...midSegs.map((s) => socketCountDraw(seedS, s.id, "utility", 0, 2)),
    socketCountDraw(seedS, drive.id, "utility", 0, 1),
  ];
  const caps = [...midSegs.map(() => 2), 1];
  const utilCounts = clampCounts(rawUtil, caps, 2, 5);

  midSegs.forEach((seg, i) => {
    seg.sockets = buildMidSockets(seedS, seg.id, utilCounts[i]!);
  });
  drive.sockets = buildDriveSockets(seedS, drive.id, utilCounts[utilCounts.length - 1]!);

  nose.sockets = buildNoseSockets(seedS, nose.id);

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
