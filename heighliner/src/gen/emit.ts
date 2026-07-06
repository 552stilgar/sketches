// emit(specs) -> SVG string. The ONLY module in the pipeline that produces
// SVG. Document shape (brief §4.8, session-1 subset):
//   defs (segment clip paths) + layer groups hull / detail / kit / paint.

import { seedToHex } from "../core/prng";
import { PALETTES, shadingTones } from "./paint";
import type { Placement, Shape, ShipSpecs, StrokeWeight } from "./types";
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

const STROKE_WIDTH: Record<StrokeWeight, number> = {
  silhouette: SILHOUETTE,
  majorSeam: MAJOR_SEAM,
  minorDetail: MINOR_DETAIL,
};

/** One ink for all line work in session 1. */
const INK = "#14161b";

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
  const palette = PALETTES[specs.paint.paletteId];
  if (!palette) throw new Error(`unknown palette: ${specs.paint.paletteId}`);
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
    `<g id="${ns}-paint"><!-- livery/decals land here (session 5); base tones applied on hull --></g>`,
    `</svg>`,
  ].join("");
}
