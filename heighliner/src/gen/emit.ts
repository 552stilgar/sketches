// emit(specs) -> SVG string. The ONLY module in the pipeline that produces
// SVG. Document shape (brief §4.8, session-1 subset):
//   defs (segment clip paths) + layer groups hull / detail / kit / paint.

import { seedToHex } from "../core/prng";
import { PALETTES, shadingTones } from "./paint";
import type { Placement, SegmentDetail, Shape, ShipSpecs, StrokeWeight } from "./types";
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

function panelGridLines(frame: SegmentFrame, d: SegmentDetail): { half: string[]; full: string[] } {
  const { bands, cols } = d.lattice;
  const full: string[] = [];
  const half: string[] = [];

  // bands: full-width horizontal seams at even axial fractions
  for (let i = 1; i < bands; i++) {
    const t = i / bands;
    const y = fmt(yAt(frame, t));
    const hw = fmt(halfWidthAt(frame.segment, t));
    full.push(`<line x1="-${hw}" y1="${y}" x2="${hw}" y2="${y}"${strokeAttrs("minorDetail")}/>`);
  }
  // columns: taper-following axial lines on the +x half, mirrored via MIRROR
  for (let j = 1; j <= cols; j++) {
    const f = j / (cols + 1);
    half.push(
      `<line x1="${fmt(f * frame.segment.halfWidth.aft)}" y1="${fmt(frame.yAft)}" x2="${fmt(f * frame.segment.halfWidth.fore)}" y2="${fmt(frame.yFore)}"${strokeAttrs("minorDetail")}/>`,
    );
  }
  return { half, full };
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

  // detail layer: panel grid per segment, clipped to the segment silhouette,
  // columns mirrored through the shared helper
  const detailGroups = specs.detail.perSegment.map((d) => {
    const frame = segFrames.find((f) => f.segment.id === d.segmentId);
    if (!frame) throw new Error(`detail references unknown segment: ${d.segmentId}`);
    const { half, full } = panelGridLines(frame, d);
    return `<g clip-path="url(#${ns}-clip-${d.segmentId})">${full.join("")}<g>${half.join("")}</g><g transform="${MIRROR}">${half.join("")}</g></g>`;
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
