// format.mjs — weapon-size formats derived from the frozen DNA (v7).
// Sibling of ornament.mjs: one shared plan, both media consume it, no new
// genes, no new PRNG draws. The length gene the table already rolls is the
// format driver — its band is the format, its in-band fraction is reused as
// the length variation, and the coupled genes rescale coherently so a dagger
// is small EVERYWHERE (grip, guard, blade width, pommel), not just short.
//
// Behavior spec lives as the comment block at the top of test-format.mjs.

const round3 = (v) => Math.round(v * 1000) / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Bands are fractions of the driver gene's rolled range (bandEnd = upper edge);
// len = the format's EFFECTIVE driver range — kept strictly disjoint and
// ascending across each table so size classes never overlap (F3).
export const SWORD_FORMATS = [
  { name: 'dagger',     bandEnd: 0.12, len: [0.22, 0.34],
    mul: { grip_len: 0.70, guard_span: 0.65, blade_w: 0.75, pommel_r: 0.75, guard_thick: 0.80 } },
  { name: 'shortsword', bandEnd: 0.30, len: [0.50, 0.66],
    mul: { grip_len: 0.85, guard_span: 0.85, blade_w: 0.90, pommel_r: 0.90, guard_thick: 0.90 } },
  { name: 'sword',      bandEnd: 0.62, len: [0.75, 1.00], mul: {} },
  { name: 'longsword',  bandEnd: 0.88, len: [1.05, 1.25],
    mul: { grip_len: 1.25, guard_span: 1.10, pommel_r: 1.05 } },
  { name: 'greatsword', bandEnd: 1.0,  len: [1.35, 1.60],
    mul: { grip_len: 1.55, guard_span: 1.25, blade_w: 1.10, pommel_r: 1.15, guard_thick: 1.15 } },
];

export const AXE_FORMATS = [
  { name: 'hatchet',   bandEnd: 0.18, len: [0.34, 0.48],
    mul: { head_w: 0.78, haft_r: 0.85, head_drop: 0.70 } },
  { name: 'axe',       bandEnd: 0.65, len: [0.62, 0.92], mul: {} },
  { name: 'battleaxe', bandEnd: 0.90, len: [0.98, 1.18],
    mul: { head_w: 1.15, haft_r: 1.08, head_drop: 1.10 } },
  { name: 'greataxe',  bandEnd: 1.0,  len: [1.42, 1.68],
    mul: { head_w: 1.30, haft_r: 1.15, head_drop: 1.20 } },
];

// driver gene rolled ranges — mirror the DNA table (params.mjs); the resolver
// normalizes against these rather than importing DNA to stay dependency-thin
const SWORD_DRIVER = { key: 'blade_len', min: 0.70, max: 1.30 };
const AXE_DRIVER = { key: 'haft_len', min: 0.60, max: 1.25 };

function tableFor(p) {
  return p.weapon_class === 'axe'
    ? { table: AXE_FORMATS, driver: AXE_DRIVER }
    : { table: SWORD_FORMATS, driver: SWORD_DRIVER };
}

export function resolveFormat(p) {
  const { table, driver } = tableFor(p);
  const t01 = clamp01((p[driver.key] - driver.min) / (driver.max - driver.min));
  let start = 0;
  for (const f of table) {
    if (t01 < f.bandEnd || f === table[table.length - 1]) {
      return { format: f.name, t: clamp01((t01 - start) / (f.bandEnd - start)) };
    }
    start = f.bandEnd;
  }
  // unreachable: the last row always catches — kept as a hard error, not a fallback
  throw new Error(`resolveFormat: no band matched t01=${t01}`);
}

/** Rescale the coupled genes into the resolved format. Returns a NEW params
 *  object carrying `_format`; the input is never touched. Applying to an
 *  already-formatted object throws — double-scaling is an authoring error. */
export function applyFormat(p) {
  if (Object.hasOwn(p, '_format')) {
    throw new Error(`applyFormat: params already carry format "${p._format}" — apply once, at the media entry point`);
  }
  const { format, t } = resolveFormat(p);
  const { table, driver } = tableFor(p);
  const spec = table.find(f => f.name === format);
  const out = { ...p, _format: format };
  out[driver.key] = round3(spec.len[0] + (spec.len[1] - spec.len[0]) * t);
  for (const [key, mul] of Object.entries(spec.mul)) {
    out[key] = round3(p[key] * mul);
  }
  return out;
}
