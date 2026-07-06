// Plain-data IR shared between pipeline layers. No SVG anywhere in here —
// emit.ts is the only module that touches SVG.

export type Role = "corvette" | "frigate" | "hauler";

export type SegmentType = "engine" | "drive" | "mid" | "hull" | "nose";

// Session 1: plain trapezoids only. Enum kept so later sessions add curves
// without reshaping the IR.
export type ProfileType = "trapezoid";

export type PartType = "turret" | "thruster-cluster";

export type SocketKind = "lateralPair" | "centerline" | "ringBand" | "area";

export interface Socket {
  id: string;
  kind: SocketKind;
  /** Axial fraction along the segment, 0 = aft edge, 1 = fore edge. */
  at: number;
  accepts: PartType[];
}

export interface Segment {
  id: string;
  type: SegmentType;
  length: number;
  profile: ProfileType;
  halfWidth: { aft: number; fore: number };
  sockets: Socket[];
}

export interface StructureSpec {
  role: Role;
  axisLength: number;
  /** Ordered aft -> fore. */
  segments: Segment[];
}

// --- kit ---------------------------------------------------------------------

/** Palette roles — paint maps these to colors; parts never name colors. */
export type PaletteRole = "base" | "baseAlt" | "accent" | "trim" | "dark";

export type StrokeWeight = "silhouette" | "majorSeam" | "minorDetail";

/** Part-local shape primitive. Local frame: origin at socket anchor,
 *  +x outboard (away from centerline), +y aftward. */
export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: PaletteRole; stroke?: StrokeWeight }
  | { kind: "poly"; points: [number, number][]; fill?: PaletteRole; stroke?: StrokeWeight }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: PaletteRole; stroke?: StrokeWeight };

export interface PartInstance {
  type: PartType;
  shapes: Shape[];
}

export interface Placement {
  socketId: string;
  part: PartInstance;
  /** Anchor in ship coords, positive-x side; emit mirrors when `mirrored`. */
  anchor: { x: number; y: number };
  /** lateralPair / ringBand placements render twice via the shared mirror helper. */
  mirrored: boolean;
}

export interface KitSpec {
  placements: Placement[];
}

// --- detail ------------------------------------------------------------------

export type Treatment = "panel-grid";

export interface SegmentDetail {
  segmentId: string;
  treatment: Treatment;
  /** Lattice counts; emit derives mirrored line geometry from these. */
  lattice: { bands: number; cols: number };
}

export interface DetailSpec {
  perSegment: SegmentDetail[];
}

// --- paint -------------------------------------------------------------------

export interface PaintSpec {
  paletteId: string;
  /** Base tone per segment id (base tones only in session 1). */
  toneBySegment: Record<string, "base" | "baseAlt">;
}

export interface ShipSpecs {
  seed: number;
  structure: StructureSpec;
  kit: KitSpec;
  detail: DetailSpec;
  paint: PaintSpec;
}
