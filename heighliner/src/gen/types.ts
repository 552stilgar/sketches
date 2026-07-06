// Plain-data IR shared between pipeline layers. No SVG anywhere in here —
// emit.ts is the only module that touches SVG.

export type Role = "corvette" | "frigate" | "hauler";

export type SegmentType = "engine" | "drive" | "mid" | "hull" | "nose";

// Enumerated profile curves (brief §3 row 8). "taper" is the linear profile
// (session-1's trapezoid); the rest bow or step the edge between aft and fore.
export type ProfileType = "taper" | "flare" | "bulge" | "chamferStep";

// Enumerated edge features, 0-2 per segment, always mirrored (brief §3 row 8).
export type EdgeFeatureType = "shoulderStep" | "notch" | "sponson" | "chamfer";

export interface EdgeFeature {
  type: EdgeFeatureType;
  /** Axial span along the segment (0 = aft, 1 = fore), from < to. */
  span: { from: number; to: number };
  /**
   * Outboard depth as a fraction of the local half-width. Positive pushes
   * the edge outboard (sponson, shoulderStep lip), negative cuts inboard
   * (notch, chamfer).
   */
  depth: number;
}

/** Explicit collar band straddling the segment's fore boundary. */
export interface JoinCollar {
  /** Axial length of the band, centered on the boundary. */
  length: number;
  /** Half-width relative to the wider joined edge; > 1 reads as a proud lip. */
  widthFactor: number;
}

// Full kit part list (brief §4.4). engine-bell is special-cased into the
// engine segment rather than socket-placed.
export type PartType =
  | "turret-large"
  | "turret-small"
  | "pdc-mount"
  | "sensor-dish"
  | "comm-mast"
  | "thruster-cluster"
  | "radiator-fin"
  | "cargo-hatch"
  | "docking-collar"
  | "vent-strip"
  | "engine-bell";

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
  /** peak: max half-width for bulge / flare apex; unused by taper. */
  halfWidth: { aft: number; fore: number; peak?: number };
  /** Axial fraction of the profile's peak (bulge) or step (chamferStep). */
  profileT?: number;
  /** 0-2 enumerated features; emit mirrors them with the shared helper. */
  edgeFeatures: EdgeFeature[];
  /** Collar at the fore boundary (toward the next segment), if any. */
  join?: JoinCollar;
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
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: PaletteRole; stroke?: StrokeWeight }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: StrokeWeight };

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

// Enumerated cell treatments (brief §4.5). "blank" is the calm-panel default.
export type Treatment =
  | "panel-grid"
  | "rib-lines"
  | "recessed-strip"
  | "vent-row"
  | "stripe-band"
  | "blank";

/**
 * One lattice cell on the +x half (emit mirrors across the centerline).
 * A cell occupies grid slot (band, col); its taper-following quad is derived
 * in emit from the segment outline. `density` is the focal-hierarchy weight
 * (0 = calm mid-panel, 1 = busy join/module zone) — emit scales rib/vent
 * counts by it so busy zones read denser without new spec fields.
 */
export interface DetailCell {
  band: number;
  col: number;
  treatment: Treatment;
  density: number;
}

export interface SegmentDetail {
  segmentId: string;
  /** Lattice counts; emit maps (band, col) to taper-following cell quads. */
  lattice: { bands: number; cols: number };
  /** Per-cell treatments on the +x half, band-major order. */
  cells: DetailCell[];
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
