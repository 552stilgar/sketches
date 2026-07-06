// emit(specs) -> SVG string. The ONLY module in the pipeline that produces
// SVG. Document shape (brief §4.8, session-1 subset):
//   defs (segment clip paths) + layer groups hull / detail / kit / paint.

import { seedToHex } from "../core/prng";
import { PALETTES } from "./paint";
import type { Placement, SegmentDetail, Shape, ShipSpecs, StrokeWeight } from "./types";
import { frames, halfWidthAt, yAt, type SegmentFrame } from "./structure";

// Global three-weight stroke system (brief §4.6). No other widths anywhere.
export const SILHOUETTE = 1.4;
export const MAJOR_SEAM = 0.7;
export const MINOR_DETAIL = 0.3;

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

function segmentPoints(frame: SegmentFrame): [number, number][] {
  const { segment: seg, yAft, yFore } = frame;
  return [
    [-seg.halfWidth.aft, yAft],
    [seg.halfWidth.aft, yAft],
    [seg.halfWidth.fore, yFore],
    [-seg.halfWidth.fore, yFore],
  ];
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

export function emit(specs: ShipSpecs, idPrefix?: string): string {
  const palette = PALETTES[specs.paint.paletteId];
  if (!palette) throw new Error(`unknown palette: ${specs.paint.paletteId}`);
  const ns = idPrefix ?? `s${seedToHex(specs.seed)}`;
  const segFrames = frames(specs.structure);

  // canvas: ship is drawn nose-up, centerline at x=0, nose tip at y=0
  const maxHalfWidth = Math.max(...specs.structure.segments.map((s) => Math.max(s.halfWidth.aft, s.halfWidth.fore)));
  const pad = maxHalfWidth * 0.9 + 6; // room for outboard kit parts
  const viewBox = `${fmt(-(maxHalfWidth + pad))} ${fmt(-4)} ${fmt(2 * (maxHalfWidth + pad))} ${fmt(specs.structure.axisLength + 8)}`;

  // defs: clip path per segment silhouette
  const defs = segFrames
    .map((f) => `<clipPath id="${ns}-clip-${f.segment.id}"><polygon points="${pointsAttr(segmentPoints(f))}"/></clipPath>`)
    .join("");

  // hull layer: segment trapezoids (base tone from paint) + join seams
  const hullShapes = segFrames.map((f) => {
    const tone = specs.paint.toneBySegment[f.segment.id] ?? "base";
    return `<polygon points="${pointsAttr(segmentPoints(f))}" fill="${palette[tone]}"${strokeAttrs("silhouette")}/>`;
  });
  const joinSeams = segFrames
    .slice(1)
    .map(
      (f) =>
        `<line x1="${fmt(-f.segment.halfWidth.aft)}" y1="${fmt(f.yAft)}" x2="${fmt(f.segment.halfWidth.aft)}" y2="${fmt(f.yAft)}"${strokeAttrs("majorSeam")}/>`,
    );

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

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<defs>${defs}</defs>`,
    `<g id="${ns}-hull">${hullShapes.join("")}${joinSeams.join("")}</g>`,
    `<g id="${ns}-detail">${detailGroups.join("")}</g>`,
    `<g id="${ns}-kit">${kitGroups.join("")}</g>`,
    `<g id="${ns}-paint"><!-- livery/decals land here (session 5); base tones applied on hull --></g>`,
    `</svg>`,
  ].join("");
}
