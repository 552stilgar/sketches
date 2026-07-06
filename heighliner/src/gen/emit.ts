// emit(specs) -> SVG string. The ONLY module in the pipeline that produces
// SVG. Document shape (brief §4.8, session-1 subset):
//   defs (segment clip paths) + layer groups hull / detail / kit / paint.

import { seedToHex } from "../core/prng";
import { resolvePalette, shadingTones } from "./paint";
import type { LiveryScheme, Placement, Shape, ShipSpecs, StrokeWeight } from "./types";
import { frames, halfWidthAt, segmentOutline, yAt, type SegmentFrame } from "./structure";

// Global three-weight stroke system (brief §4.6). No other widths anywhere.
export const SILHOUETTE = 1.4;
export const MAJOR_SEAM = 0.7;
export const MINOR_DETAIL = 0.3;

// --- shading stack (brief §4.7, layer 2 / §6 lane H) ------------------------
// Named constants only — Usul tunes the shading stack here, no magic numbers
// inline in the builders below. Geometry is a pure function of the existing
// structure/kit/paint specs: zero new PRNG draws.
const LIT_INSET_FRAC = 0.22; // lit strip width, fraction of local half-width
const SHADE_INSET_FRAC = 0.28; // shade strip width, fraction of local half-width
const AO_SCALE = 0.7; // kit-module AO blob size, fraction of part footprint
const AO_JOIN_RX_FRAC = 1.0; // join AO ellipse half-width, fraction of join half-width
const AO_JOIN_RY = 1.1; // join AO ellipse vertical half-extent (world units)
const AO_OPACITY = 0.22; // AO blob fill-opacity
const AO_BLUR_STD_DEV = 1.1; // shared feGaussianBlur stdDeviation
const SPEC_WIDTH = 0.9; // specular strip width, world units
const SPEC_OFFSET_FRAC = 0.42; // specular strip offset from centerline, fraction of local half-width, toward the light (-x) side

// --- livery + decals + grime (brief §6 layer 5) -----------------------------
// All accent placement is symmetric about the centerline, so the livery layer
// needs no MIRROR — it paints centered/full-width shapes clipped to segments.
const STRIPE_H = 1.6; // drive-stripe thickness, world units
const DRIVE_STRIPE_TS = [0.3, 0.55, 0.8]; // axial positions of drive stripes
const HULL_BAND_H = 2.2; // hull-band thickness
const HULL_BAND_T = 0.5; // hull-band axial position
const CHEVRON_FRAC = 0.6; // chevron apex position along the nose (aft->fore)
const CHEVRON_BASE_T = 0.12; // chevron base position along the nose
const CHEVRON_H = 1.6; // chevron band thickness (world units, aft offset)
const SHROUD_FRAC = 0.45; // shroud block covers this fraction of the drive, from aft
const SPINE_W = 1.1; // centerline spine strip width
const SPINE_INSET_FRAC = 0.06; // spine stops short of the body ends — a stripe, not a bisecting seam
// hull-number stencil (painted-on decal, brief §6). Blocky 3×5 vector glyphs,
// no external font (export-safe), filled at reduced opacity so they read as
// sprayed stencil paint rather than crisp UI text. One consistent target
// height across the fleet, only shrunk to fit narrow hulls.
const NUMBER_TARGET_H = 6.5; // target glyph height, world units
const NUMBER_MAX_WFRAC = 0.78; // cap: number width <= this fraction of local ship width
const NUMBER_OPACITY = 0.72;
const NUMBER_GAP_FRAC = 0.55; // inter-glyph gap, fraction of one stencil pixel
const NUMBER_BLEED = 0.04; // per-cell overlap so adjacent pixels merge (no seams)
const HAZARD_STRIPE_W = 1.4; // hazard diagonal stripe width
const HAZARD_BAND_FRAC = 0.5; // hazard band spans this fraction of the engine, from aft
const GRIME_OPACITY = 0.13; // weathering overlay opacity
const GRIME_SOOT_FRAC = 0.45; // aft fraction of engine/drive carrying exhaust soot
const GRIME_STREAK_FRAC = 0.06; // far-edge grime streak inset

const STROKE_WIDTH: Record<StrokeWeight, number> = {
  silhouette: SILHOUETTE,
  majorSeam: MAJOR_SEAM,
  minorDetail: MINOR_DETAIL,
};

/** One ink for all line work in session 1. */
const INK = "#14161b";

// 3×5 stencil glyph matrix for hull-number decals. Only the characters a
// registry code uses (role letters C/F/H, digits, dash). "1" = painted cell.
const STENCIL: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  C: ["111", "100", "100", "100", "111"],
  F: ["111", "100", "111", "100", "100"],
  H: ["101", "101", "111", "101", "101"],
  "-": ["000", "000", "111", "000", "000"],
};
const STENCIL_COLS = 3;
const STENCIL_ROWS = 5;

const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

const strokeAttrs = (w: StrokeWeight | undefined): string =>
  w ? ` stroke="${INK}" stroke-width="${fmt(STROKE_WIDTH[w])}"` : "";

/**
 * THE shared mirror helper (brief §9: ad-hoc mirroring is how asymmetric
 * bugs creep in). Everything bilateral — kit placements, detail columns —
 * renders its +x half and reflects through this.
 */
const MIRROR = `scale(-1 1)`;

function placementTransforms(p: Placement): string[] {
  const t = [`translate(${fmt(p.anchor.x)} ${fmt(p.anchor.y)})`];
  if (p.mirrored) t.push(`translate(${fmt(-p.anchor.x)} ${fmt(p.anchor.y)}) ${MIRROR}`);
  return t;
}

const pointsAttr = (pts: [number, number][]): string =>
  pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

function shapeToSVG(shape: Shape, palette: Record<string, string>): string {
  if (shape.kind === "line") {
    return `<line x1="${fmt(shape.x1)}" y1="${fmt(shape.y1)}" x2="${fmt(shape.x2)}" y2="${fmt(shape.y2)}"${strokeAttrs(shape.stroke)}/>`;
  }
  const fill = shape.fill ? ` fill="${palette[shape.fill]}"` : ` fill="none"`;
  const stroke = strokeAttrs(shape.stroke);
  switch (shape.kind) {
    case "rect":
      return `<rect x="${fmt(shape.x)}" y="${fmt(shape.y)}" width="${fmt(shape.w)}" height="${fmt(shape.h)}"${fill}${stroke}/>`;
    case "poly":
      return `<polygon points="${pointsAttr(shape.points)}"${fill}${stroke}/>`;
    case "circle":
      return `<circle cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" r="${fmt(shape.r)}"${fill}${stroke}/>`;
  }
}

// --- detail lattice (brief §4.5 / §6 layer 3) --------------------------------
// Per-cell treatments on the +x half; emit maps each (band, col) to a
// taper-following quad and draws the enumerated treatment inside it. Rib/vent
// counts scale with the cell's focal density — no new PRNG draws (density is
// already baked into the spec). All lines obey the three-weight system.
const RIB_MIN = 2; // ribs at density 0
const RIB_SPAN = 3; // extra ribs at density 1
const VENT_MIN = 2;
const VENT_SPAN = 2;
const RECESS_INSET = 0.16; // recessed-strip inset, fraction of the cell
const VENT_INSET = 0.24; // vent slot margin from the cell edge

/** Parametric point inside a cell: u axial (0 aft->1 fore), v lateral
 *  (0 inboard->1 outboard), on the +x half, following the real taper. */
function cellPoint(
  frame: SegmentFrame,
  bands: number,
  cols: number,
  band: number,
  col: number,
  u: number,
  v: number,
): [number, number] {
  const t = (band + u) / bands;
  const f = (col + v) / cols;
  return [f * halfWidthAt(frame.segment, t), yAt(frame, t)];
}

function detailCellSVG(
  frame: SegmentFrame,
  bands: number,
  cols: number,
  cell: { band: number; col: number; treatment: string; density: number },
  palette: Record<string, string>,
): string {
  const { band, col, treatment, density } = cell;
  if (treatment === "blank") return "";
  const p = (u: number, v: number) => cellPoint(frame, bands, cols, band, col, u, v);
  const quad = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [
    p(u0, v0),
    p(u0, v1),
    p(u1, v1),
    p(u1, v0),
  ];

  switch (treatment) {
    case "panel-grid":
      // cell outline as a thin panel seam
      return `<polygon points="${pointsAttr(quad(0, 0, 1, 1))}" fill="none"${strokeAttrs("minorDetail")}/>`;
    case "rib-lines": {
      const n = RIB_MIN + Math.round(density * RIB_SPAN);
      const lines: string[] = [];
      for (let i = 1; i <= n; i++) {
        const u = i / (n + 1);
        const [ax, ay] = p(u, 0.08);
        const [bx, by] = p(u, 0.92);
        lines.push(`<line x1="${fmt(ax)}" y1="${fmt(ay)}" x2="${fmt(bx)}" y2="${fmt(by)}"${strokeAttrs("minorDetail")}/>`);
      }
      return lines.join("");
    }
    case "recessed-strip":
      // dark inset panel with a proud border — reads recessed
      return `<polygon points="${pointsAttr(quad(RECESS_INSET, RECESS_INSET, 1 - RECESS_INSET, 1 - RECESS_INSET))}" fill="${palette.dark}"${strokeAttrs("majorSeam")}/>`;
    case "vent-row": {
      const n = VENT_MIN + Math.round(density * VENT_SPAN);
      const slots: string[] = [];
      const m = VENT_INSET;
      for (let i = 0; i < n; i++) {
        const u0 = m + (i / n) * (1 - 2 * m);
        const u1 = m + ((i + 0.55) / n) * (1 - 2 * m);
        slots.push(`<polygon points="${pointsAttr(quad(u0, m, u1, 1 - m))}" fill="${palette.dark}"${strokeAttrs("minorDetail")}/>`);
      }
      return slots.join("");
    }
    case "stripe-band":
      // painted band filling the cell — neutral trim (livery accents are §5)
      return `<polygon points="${pointsAttr(quad(0, 0, 1, 1))}" fill="${palette.trim}"/>`;
    default:
      return "";
  }
}

/**
 * Inset band hugging one side of a segment's real outline (brief §6: "an
 * inset polygon built by shrinking x-samples works; do not re-derive
 * geometry ad hoc"). `half` is the starboard (+x) half of segmentOutline's
 * points, aft->fore; `side` picks -x (light, port) or +x (far, starboard).
 * Inner edge is a fraction of the outer edge's x, so it can never cross the
 * centerline or exceed the real silhouette.
 */
function insetBand(half: [number, number][], frac: number, side: 1 | -1): [number, number][] {
  const outer = half.map(([x, y]): [number, number] => [side * x, y]);
  const inner = half.map(([x, y]): [number, number] => [side * x * (1 - frac), y]);
  return [...outer, ...inner.reverse()];
}

/** Local bounding half-extent of a part's shapes, in the part's own frame
 *  (origin at socket anchor). Used to size AO blobs proportionally to the
 *  module rather than a single flat radius for every part type. */
function shapeFootprint(shapes: Shape[]): { rx: number; ry: number } {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const s of shapes) {
    if (s.kind === "rect") {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x + s.w);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y + s.h);
    } else if (s.kind === "poly") {
      for (const [x, y] of s.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    } else if (s.kind === "circle") {
      minX = Math.min(minX, s.cx - s.r);
      maxX = Math.max(maxX, s.cx + s.r);
      minY = Math.min(minY, s.cy - s.r);
      maxY = Math.max(maxY, s.cy + s.r);
    }
  }
  return { rx: Math.max(1, (maxX - minX) / 2), ry: Math.max(1, (maxY - minY) / 2) };
}

export function emit(specs: ShipSpecs, idPrefix?: string): string {
  // Resolved palette = authored bank + seeded jitter (resolvePalette throws on
  // an unknown id). Shading and every fill below derive from this record.
  const palette = resolvePalette(specs.paint.paletteId, specs.paint.jitter);
  const ns = idPrefix ?? `s${seedToHex(specs.seed)}`;
  const segFrames = frames(specs.structure);
  const outlines = segFrames.map((f) => segmentOutline(f));

  // canvas: ship is drawn nose-up, centerline at x=0, nose tip at y=0.
  // Width from the real outlines — bulges and sponsons push past aft/fore.
  const maxHalfWidth = Math.max(...outlines.flatMap((pts) => pts.map(([x]) => Math.abs(x))));
  const pad = maxHalfWidth * 0.9 + 6; // room for outboard kit parts
  const viewBox = `${fmt(-(maxHalfWidth + pad))} ${fmt(-4)} ${fmt(2 * (maxHalfWidth + pad))} ${fmt(specs.structure.axisLength + 8)}`;

  // defs: clip path per segment silhouette
  const defs = segFrames
    .map((f, i) => `<clipPath id="${ns}-clip-${f.segment.id}"><polygon points="${pointsAttr(outlines[i]!)}"/></clipPath>`)
    .join("");

  // hull layer: segment silhouettes (base tone from paint) + join seams + collars
  const hullShapes = segFrames.map((f, i) => {
    const tone = specs.paint.toneBySegment[f.segment.id] ?? "base";
    return `<polygon points="${pointsAttr(outlines[i]!)}" fill="${palette[tone]}"${strokeAttrs("silhouette")}/>`;
  });
  const joinSeams = segFrames.slice(1).map((f) => {
    const hw = fmt(halfWidthAt(f.segment, 0));
    return `<line x1="-${hw}" y1="${fmt(f.yAft)}" x2="${hw}" y2="${fmt(f.yAft)}"${strokeAttrs("majorSeam")}/>`;
  });
  // join collars: proud lip band straddling the fore boundary of the segment
  // that owns the join; rendered after the segment polygons so the lip reads
  // as sitting on top of both hulls.
  const collars = segFrames.slice(0, -1).flatMap((f, i) => {
    const j = f.segment.join;
    if (!j) return [];
    const next = segFrames[i + 1]!.segment;
    const hw = j.widthFactor * Math.max(halfWidthAt(f.segment, 1), halfWidthAt(next, 0));
    return [
      `<rect x="${fmt(-hw)}" y="${fmt(f.yFore - j.length / 2)}" width="${fmt(2 * hw)}" height="${fmt(j.length)}" fill="${palette.trim}"${strokeAttrs("majorSeam")}/>`,
    ];
  });

  // detail layer: per-cell treatments on the +x half, mirrored through the
  // shared helper, clipped to the segment silhouette
  const detailGroups = specs.detail.perSegment.map((d) => {
    const frame = segFrames.find((f) => f.segment.id === d.segmentId);
    if (!frame) throw new Error(`detail references unknown segment: ${d.segmentId}`);
    const { bands, cols } = d.lattice;
    const half = d.cells.map((c) => detailCellSVG(frame, bands, cols, c, palette)).join("");
    return `<g clip-path="url(#${ns}-clip-${d.segmentId})"><g>${half}</g><g transform="${MIRROR}">${half}</g></g>`;
  });

  // kit layer: part instances, lateral pairs mirrored via transform
  const kitGroups = specs.kit.placements.flatMap((p) =>
    placementTransforms(p).map(
      (transform) => `<g transform="${transform}">${p.part.shapes.map((s) => shapeToSVG(s, palette)).join("")}</g>`,
    ),
  );

  // shading layer (brief §4.7 / §6 lane H): base fill already lives in the
  // hull layer above; this group carries the remaining four passes in fixed
  // order — lit strip, shade strip, AO, axial specular. Pure function of the
  // already-computed specs; no new PRNG draws anywhere below.
  const tones = shadingTones(palette);
  const aoBlurFilterId = `${ns}-ao-blur`;

  // 2-3: lit (light side, -x) / shade (far side, +x) strips, built from the
  // segment's real outline samples shrunk toward centerline — never a
  // re-derived curve.
  const shadingStrips = segFrames.flatMap((f, i) => {
    const outline = outlines[i]!;
    const starboardHalf = outline.slice(0, outline.length / 2); // aft->fore, +x
    const lit = insetBand(starboardHalf, LIT_INSET_FRAC, -1);
    const shade = insetBand(starboardHalf, SHADE_INSET_FRAC, 1);
    const clip = `clip-path="url(#${ns}-clip-${f.segment.id})"`;
    return [
      `<g ${clip}><polygon points="${pointsAttr(lit)}" fill="${tones.lit}"/></g>`,
      `<g ${clip}><polygon points="${pointsAttr(shade)}" fill="${tones.shade}"/></g>`,
    ];
  });

  // 4a: AO under kit modules, both mirror sides, sized off each part's own
  // footprint (specs.kit.placements — no new draws, reuses the same
  // placementTransforms as the kit layer).
  const kitAO = specs.kit.placements.flatMap((p) => {
    const { rx, ry } = shapeFootprint(p.part.shapes);
    const blob = `<ellipse cx="0" cy="0" rx="${fmt(rx * AO_SCALE)}" ry="${fmt(ry * AO_SCALE)}" fill="${tones.ao}" fill-opacity="${AO_OPACITY}" filter="url(#${aoBlurFilterId})"/>`;
    return placementTransforms(p).map((transform) => `<g transform="${transform}">${blob}</g>`);
  });
  // 4b: AO at every internal join line — symmetric about the centerline by
  // construction (full-width ellipse), no MIRROR needed.
  const joinAO = segFrames.slice(1).map((f) => {
    const hw = halfWidthAt(f.segment, 0);
    return `<ellipse cx="0" cy="${fmt(f.yAft)}" rx="${fmt(hw * AO_JOIN_RX_FRAC)}" ry="${fmt(AO_JOIN_RY)}" fill="${tones.ao}" fill-opacity="${AO_OPACITY}" filter="url(#${aoBlurFilterId})"/>`;
  });

  // 5: one axial specular strip per major segment (drive, hull, longest
  // mid), offset toward the light side, clipped to its own silhouette.
  const majorSegs = segFrames.filter((f) => f.segment.type === "drive" || f.segment.type === "hull");
  const midFrames = segFrames.filter((f) => f.segment.type === "mid");
  if (midFrames.length > 0) {
    majorSegs.push(midFrames.reduce((longest, f) => (f.segment.length > longest.segment.length ? f : longest)));
  }
  const specStrips = majorSegs.map((f) => {
    const xAft = -SPEC_OFFSET_FRAC * f.segment.halfWidth.aft;
    const xFore = -SPEC_OFFSET_FRAC * f.segment.halfWidth.fore;
    const hw = SPEC_WIDTH / 2;
    const pts: [number, number][] = [
      [xAft - hw, f.yAft],
      [xAft + hw, f.yAft],
      [xFore + hw, f.yFore],
      [xFore - hw, f.yFore],
    ];
    return `<g clip-path="url(#${ns}-clip-${f.segment.id})"><polygon points="${pointsAttr(pts)}" fill="${tones.spec}"/></g>`;
  });

  const shadingGroup = `<g id="${ns}-shading">${shadingStrips.join("")}${kitAO.join("")}${joinAO.join("")}${specStrips.join("")}</g>`;
  const aoBlurFilter = `<filter id="${aoBlurFilterId}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${AO_BLUR_STD_DEV}"/></filter>`;

  // paint layer (brief §6 layer 5): accent livery scheme + decals + grime.
  // Pure function of the paint spec; painted over the kit so accents read on
  // the finished hull. No PRNG here — every choice is baked into paint().
  const byType = (t: string): SegmentFrame | undefined => segFrames.find((f) => f.segment.type === t);
  const clip = (id: string, inner: string): string => `<g clip-path="url(#${ns}-clip-${id})">${inner}</g>`;

  /** Full-width accent band across a segment at axial position t, clipped to
   *  the real silhouette. Symmetric — no mirror needed. */
  function lateralBand(f: SegmentFrame, t: number, h: number, fill: string): string {
    const y = yAt(f, t);
    const hw = halfWidthAt(f.segment, t);
    return clip(f.segment.id, `<rect x="${fmt(-hw)}" y="${fmt(y - h / 2)}" width="${fmt(2 * hw)}" height="${fmt(h)}" fill="${fill}"/>`);
  }

  function liveryShapes(scheme: LiveryScheme): string {
    const accent = palette.accent;
    switch (scheme) {
      case "bareMetal":
        return "";
      case "driveStripes": {
        const drive = byType("drive");
        if (!drive) return "";
        return DRIVE_STRIPE_TS.map((t) => lateralBand(drive, t, STRIPE_H, accent)).join("");
      }
      case "hullBand": {
        const hull = byType("hull");
        return hull ? lateralBand(hull, HULL_BAND_T, HULL_BAND_H, accent) : "";
      }
      case "shroudBlock": {
        const drive = byType("drive");
        if (!drive) return "";
        const yA = yAt(drive, 0);
        const yB = yAt(drive, SHROUD_FRAC);
        const y = Math.min(yA, yB);
        const w = maxHalfWidth;
        return clip(
          drive.segment.id,
          `<rect x="${fmt(-w)}" y="${fmt(y)}" width="${fmt(2 * w)}" height="${fmt(Math.abs(yA - yB))}" fill="${accent}"/>`,
        );
      }
      case "noseChevron": {
        const nose = byType("nose");
        if (!nose) return "";
        const yBase = yAt(nose, CHEVRON_BASE_T);
        const yApex = yAt(nose, CHEVRON_FRAC);
        const hwB = halfWidthAt(nose.segment, CHEVRON_BASE_T);
        // aft is +y; the chevron points fore (toward smaller y). Thick band via
        // an outer V and an inner V offset aftward by CHEVRON_H.
        const pts: [number, number][] = [
          [-hwB, yBase],
          [0, yApex],
          [hwB, yBase],
          [hwB - CHEVRON_H, yBase + CHEVRON_H],
          [0, yApex + CHEVRON_H],
          [-hwB + CHEVRON_H, yBase + CHEVRON_H],
        ];
        return clip(nose.segment.id, `<polygon points="${pointsAttr(pts)}" fill="${accent}"/>`);
      }
      case "spineRun": {
        // A body stripe, not a full-length seam: span the hull+mid body only
        // (skip the nose cone and the drive/engine), inset from both ends so it
        // never touches a segment boundary and reads as painted-on rather than
        // a slot bisecting the ship.
        const hull = byType("hull");
        const drive = byType("drive");
        if (!hull || !drive) return "";
        const yTop = yAt(hull, 1); // hull/nose boundary
        const yBot = drive.yFore; // drive/body boundary (aft end of the body)
        const span = Math.abs(yBot - yTop);
        const inset = span * SPINE_INSET_FRAC;
        return `<rect x="${fmt(-SPINE_W / 2)}" y="${fmt(Math.min(yTop, yBot) + inset)}" width="${fmt(SPINE_W)}" height="${fmt(span - 2 * inset)}" fill="${accent}"/>`;
      }
    }
  }

  // hazard decal: diagonal accent/dark caution stripes in an aft band on the
  // engine, clipped to its silhouette.
  function hazardShapes(): string {
    const eng = byType("engine");
    if (!eng) return "";
    const yA = yAt(eng, 0);
    const yB = yAt(eng, HAZARD_BAND_FRAC);
    const yLo = Math.min(yA, yB);
    const yHi = Math.max(yA, yB);
    const bandH = yHi - yLo;
    const w = maxHalfWidth;
    const sw = HAZARD_STRIPE_W;
    const stripes: string[] = [];
    let i = 0;
    for (let x0 = -w - bandH; x0 < w; x0 += sw) {
      const fill = i % 2 === 0 ? palette.accent : palette.dark;
      const pts: [number, number][] = [
        [x0, yHi],
        [x0 + sw, yHi],
        [x0 + sw + bandH, yLo],
        [x0 + bandH, yLo],
      ];
      stripes.push(`<polygon points="${pointsAttr(pts)}" fill="${fill}"/>`);
      i++;
    }
    return clip(eng.segment.id, stripes.join(""));
  }

  // grime overlay: low-opacity exhaust soot over the aft engine/drive + a faint
  // dark streak down the far (+x, unlit) edge of the hull.
  function grimeShapes(): string {
    const out: string[] = [];
    for (const t of ["engine", "drive"] as const) {
      const f = byType(t);
      if (!f) continue;
      const yA = yAt(f, 0);
      const yB = yAt(f, GRIME_SOOT_FRAC);
      const y = Math.min(yA, yB);
      out.push(
        clip(
          f.segment.id,
          `<rect x="${fmt(-maxHalfWidth)}" y="${fmt(y)}" width="${fmt(2 * maxHalfWidth)}" height="${fmt(Math.abs(yA - yB))}" fill="${palette.dark}" fill-opacity="${GRIME_OPACITY}"/>`,
        ),
      );
    }
    const hull = byType("hull");
    if (hull) {
      const i = segFrames.indexOf(hull);
      const outline = outlines[i]!;
      const starboardHalf = outline.slice(0, outline.length / 2);
      const streak = insetBand(starboardHalf, GRIME_STREAK_FRAC, 1);
      out.push(
        clip(hull.segment.id, `<polygon points="${pointsAttr(streak)}" fill="${palette.dark}" fill-opacity="${GRIME_OPACITY}"/>`),
      );
    }
    return out.join("");
  }

  // hull-number decal: registry code painted on the hull as blocky stencil
  // glyphs (no font dependency). Consistent target height across the fleet,
  // shrunk only to fit narrow hulls; reduced opacity reads as sprayed paint.
  function hullNumberDecal(): string {
    const hull = byType("hull");
    if (!hull) return "";
    const chars = [...specs.paint.hullNumber].filter((ch) => STENCIL[ch]);
    if (chars.length === 0) return "";

    // fit: pixel from target height, capped so the whole number stays within
    // NUMBER_MAX_WFRAC of the local hull width.
    const advance = STENCIL_COLS + NUMBER_GAP_FRAC; // per-glyph pixel advance incl. gap
    const unitsWide = chars.length * advance - NUMBER_GAP_FRAC;
    const maxW = 2 * halfWidthAt(hull.segment, HULL_BAND_T) * NUMBER_MAX_WFRAC;
    const px = Math.min(NUMBER_TARGET_H / STENCIL_ROWS, maxW / unitsWide);

    const totalW = unitsWide * px;
    const x0 = -totalW / 2;
    const y0 = yAt(hull, HULL_BAND_T) - (STENCIL_ROWS * px) / 2;
    const cell = px * (1 + NUMBER_BLEED);

    const rects: string[] = [];
    chars.forEach((ch, ci) => {
      const rows = STENCIL[ch]!;
      const gx = x0 + ci * advance * px;
      for (let r = 0; r < STENCIL_ROWS; r++) {
        for (let c = 0; c < STENCIL_COLS; c++) {
          if (rows[r]![c] === "1") {
            rects.push(`<rect x="${fmt(gx + c * px)}" y="${fmt(y0 + r * px)}" width="${fmt(cell)}" height="${fmt(cell)}"/>`);
          }
        }
      }
    });
    return `<g data-hull-number="${specs.paint.hullNumber}" fill="${palette.trim}" fill-opacity="${NUMBER_OPACITY}">${rects.join("")}</g>`;
  }

  const paintGroup = [
    liveryShapes(specs.paint.livery),
    specs.paint.hazard ? hazardShapes() : "",
    specs.paint.grime ? grimeShapes() : "",
    hullNumberDecal(),
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${defs}${aoBlurFilter}</defs>`,
    `<g id="${ns}-hull">${hullShapes.join("")}${joinSeams.join("")}${collars.join("")}</g>`,
    `<g id="${ns}-detail">${detailGroups.join("")}</g>`,
    // Shading paints BEFORE kit (brief §4.7 intent: AO sits *under* modules,
    // and the opaque lit/shade strips must not cut across edge-mounted parts).
    // This overrides §4.8's literal group order, which put shading after kit.
    shadingGroup,
    `<g id="${ns}-kit">${kitGroups.join("")}</g>`,
    `<g id="${ns}-paint">${paintGroup}</g>`,
    `</svg>`,
  ].join("");
}
