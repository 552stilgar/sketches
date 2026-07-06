// Pure helpers for the inspector's export path. Kept DOM-free and
// side-effect-free so they're unit-testable without a browser/canvas.

export interface ViewBoxSize {
  w: number;
  h: number;
}

/** Extract width/height from an emitted ship SVG's viewBox attribute. */
export function parseViewBox(svg: string): ViewBoxSize {
  const match = svg.match(/viewBox="[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)"/);
  if (!match) throw new Error("svg missing viewBox");
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`invalid viewBox dimensions: ${match[0]}`);
  }
  return { w, h };
}

/**
 * Canvas pixel size for PNG export: the longer edge lands on `target` px,
 * aspect ratio preserved. Ship SVGs are portrait, so height is normally the
 * longer edge, but the calc stays generic.
 */
export function pngCanvasSize(size: ViewBoxSize, target = 2048): { width: number; height: number } {
  const scale = target / Math.max(size.w, size.h);
  return {
    width: Math.max(1, Math.round(size.w * scale)),
    height: Math.max(1, Math.round(size.h * scale)),
  };
}
