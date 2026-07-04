// FORGE — seeded weapon DNA. Pure module: no DOM, no side effects.
// Pipeline mirrors prism (noahsprerogative.com/prism): hex hash -> seed -> PRNG
// rolls every param in fixed DNA order -> params drive an SDF raymarcher.

export function hashToSeed(hex) {
  let h = 0;
  for (let i = 0; i < hex.length; i++) h = (Math.imul(31, h) + hex.charCodeAt(i)) | 0;
  return h;
}

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randHex(n, rng = Math.random) {
  let s = '';
  for (let i = 0; i < n; i++) s += ((rng() * 16) | 0).toString(16);
  return s;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// DNA — ordered param table. Order is the contract: rolling consumes one PRNG
// draw per entry, so inserting mid-table changes every artifact. Append only.
// Continuous: {key, section, min, max, decimals}. Discrete: {key, section, options}.
// Every param is rolled for every weapon; the shader reads only its class's branch.
// ---------------------------------------------------------------------------

export const DNA = [
  // -- class ----------------------------------------------------------------
  { key: 'weapon_class', section: 'Class', options: ['sword', 'axe'] },

  // -- sword: blade ---------------------------------------------------------
  { key: 'blade_type', section: 'Blade', options: ['arming', 'longsword', 'falchion', 'scimitar', 'leaf', 'estoc'] },
  { key: 'blade_len', section: 'Blade', min: 0.70, max: 1.30, decimals: 3 },
  { key: 'blade_w', section: 'Blade', min: 0.045, max: 0.115, decimals: 3 },
  { key: 'blade_taper', section: 'Blade', min: 0.15, max: 0.90, decimals: 2 },
  { key: 'blade_curve', section: 'Blade', min: 0.0, max: 0.30, decimals: 3 },
  { key: 'fuller_n', section: 'Blade', options: [0, 1, 2] },
  { key: 'fuller_depth', section: 'Blade', min: 0.15, max: 0.60, decimals: 2 },
  { key: 'tip_style', section: 'Blade', options: ['point', 'clip', 'round'] },

  // -- sword: guard ---------------------------------------------------------
  { key: 'guard_type', section: 'Guard', options: ['bar', 'quillons', 'disc', 'crescent'] },
  { key: 'guard_span', section: 'Guard', min: 0.14, max: 0.34, decimals: 3 },
  { key: 'guard_thick', section: 'Guard', min: 0.018, max: 0.042, decimals: 3 },
  { key: 'guard_droop', section: 'Guard', min: -0.35, max: 0.55, decimals: 2 },

  // -- sword: grip + pommel -------------------------------------------------
  { key: 'grip_len', section: 'Grip', min: 0.14, max: 0.34, decimals: 3 },
  { key: 'grip_r', section: 'Grip', min: 0.022, max: 0.038, decimals: 3 },
  { key: 'wrap_bands', section: 'Grip', options: [0, 3, 4, 5, 6, 7, 8] },
  { key: 'pommel_type', section: 'Grip', options: ['disc', 'sphere', 'scent_stopper', 'faceted', 'ring'] },
  { key: 'pommel_r', section: 'Grip', min: 0.035, max: 0.065, decimals: 3 },

  // -- axe: haft ------------------------------------------------------------
  { key: 'haft_len', section: 'Haft', min: 0.60, max: 1.25, decimals: 3 },
  { key: 'haft_r', section: 'Haft', min: 0.020, max: 0.036, decimals: 3 },
  { key: 'haft_curve', section: 'Haft', min: 0.0, max: 0.14, decimals: 3 },
  { key: 'haft_wrap', section: 'Haft', options: [0, 1] },

  // -- axe: head ------------------------------------------------------------
  { key: 'head_type', section: 'Head', options: ['bearded', 'broad', 'double_bit', 'war'] },
  { key: 'head_w', section: 'Head', min: 0.16, max: 0.34, decimals: 3 },
  { key: 'edge_sweep', section: 'Head', min: 0.25, max: 0.95, decimals: 2 },
  { key: 'beard_depth', section: 'Head', min: 0.0, max: 0.55, decimals: 2 },
  { key: 'cheek_thick', section: 'Head', min: 0.028, max: 0.060, decimals: 3 },
  { key: 'poll_type', section: 'Head', options: ['flat', 'hammer', 'spike'] },
  { key: 'head_drop', section: 'Head', min: 0.02, max: 0.10, decimals: 3 },

  // -- material + light -----------------------------------------------------
  { key: 'steel_hue', section: 'Material', min: 185, max: 235, decimals: 0 },
  { key: 'steel_sat', section: 'Material', min: 2, max: 16, decimals: 0 },
  { key: 'accent_on', section: 'Material', options: [0, 1] },
  { key: 'accent_hue', section: 'Material', min: 22, max: 48, decimals: 0 },
  { key: 'light_az', section: 'Lighting', min: -80, max: 80, decimals: 0 },
  { key: 'light_el', section: 'Lighting', min: 15, max: 65, decimals: 0 },

  // -- v2 finish (2026-07-04) — APPENDED so every v1 hash keeps its 36 rolls --
  // brushed listed twice: weighted 2/4 so the v1 look stays the common case
  { key: 'steel_finish', section: 'Material', options: ['brushed', 'brushed', 'damascus', 'blued'] },
  { key: 'wear_amount', section: 'Material', min: 0.0, max: 1.0, decimals: 2 },
  { key: 'damascus_scale', section: 'Material', min: 18, max: 60, decimals: 0 },
  { key: 'damascus_warp', section: 'Material', min: 0.15, max: 0.85, decimals: 2 },

  // -- v4 variability (2026-07-04) — APPENDED so every v1/v2 hash keeps its 40 rolls --
  // steel listed 3×: weighted 3/5 so the established look stays the common case
  { key: 'metal_family', section: 'Material', options: ['steel', 'steel', 'steel', 'iron', 'bronze'] },
  { key: 'grip_material', section: 'Grip', options: ['leather', 'leather', 'cord', 'wire'] },
  // guard_type's option list can't grow (option count changes every existing roll);
  // new silhouettes ride a separate override param instead. inherit = keep guard_type.
  { key: 'guard_ext', section: 'Guard', options: ['inherit', 'inherit', 'swept', 'ring'] },
  { key: 'engrave_on', section: 'Detail', options: [0, 0, 0, 1] },
  { key: 'engrave_density', section: 'Detail', min: 0.30, max: 1.00, decimals: 2 },
];

function rollParam(spec, rng) {
  if (spec.options) return spec.options[(rng() * spec.options.length) | 0];
  const v = spec.min + rng() * (spec.max - spec.min);
  const f = 10 ** (spec.decimals ?? 3);
  return Math.round(v * f) / f;
}

export function paramsFromHash(hash) {
  const rng = mulberry32(hashToSeed(hash));
  const p = { hash };
  for (const spec of DNA) p[spec.key] = rollParam(spec, rng);
  return p;
}

// ---------------------------------------------------------------------------
// Share token: `hash` when untouched, `hash~base64url(v1;idx:val,...)` when the
// sandbox edited params. Discrete params encode their option index so string
// options survive the numeric wire format.
// ---------------------------------------------------------------------------

export const TOKEN_VERSION = 1;

const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

function wireValue(spec, v) {
  return spec.options ? spec.options.indexOf(v) : v;
}

export function encodeToken(hash, params, baseParams) {
  const diffs = [];
  DNA.forEach((spec, i) => {
    if (params[spec.key] !== baseParams[spec.key]) diffs.push(i + ':' + wireValue(spec, params[spec.key]));
  });
  if (!diffs.length) return hash;
  return hash + '~' + b64url(TOKEN_VERSION + ';' + diffs.join(','));
}

export function decodeToken(token) {
  const at = token.indexOf('~');
  if (at < 0) return { baseHash: token, overrides: [] };
  const baseHash = token.slice(0, at);
  let payload;
  try {
    payload = unb64url(token.slice(at + 1));
  } catch {
    return { baseHash, overrides: [] };
  }
  const body = payload.split(';')[1] || '';
  const overrides = body.split(',').filter(Boolean).map(pair => {
    const c = pair.indexOf(':');
    return [parseInt(pair.slice(0, c), 10), parseFloat(pair.slice(c + 1))];
  }).filter(([i, v]) => Number.isInteger(i) && i >= 0 && i < DNA.length && Number.isFinite(v));
  return { baseHash, overrides };
}

export function applyOverrides(params, overrides) {
  const p = { ...params };
  for (const [i, v] of overrides) {
    const spec = DNA[i];
    if (!spec) continue;
    p[spec.key] = spec.options
      ? spec.options[clamp(Math.round(v), 0, spec.options.length - 1)]
      : clamp(v, spec.min, spec.max);
  }
  return p;
}

// ---------------------------------------------------------------------------
// v2 material derivation — the shader-facing finish block, mirroring
// deriveLayout's role. All craft-tunable values are named constants here so
// the feel loop edits numbers, not logic.
// ---------------------------------------------------------------------------

const FINISH_INDEX = { brushed: 0, damascus: 1, blued: 2 };

// microsurface roughness per archetype: thrusters are polished, choppers rough
const SWORD_ROUGHNESS = { arming: 0.30, longsword: 0.25, falchion: 0.36, scimitar: 0.29, leaf: 0.32, estoc: 0.16 };
const AXE_ROUGHNESS = { bearded: 0.38, broad: 0.34, double_bit: 0.31, war: 0.44 };

// grind-line anisotropy: blades are drawn lengthwise on the stone, axe cheeks less so
const SWORD_ANISO = 0.65;
const AXE_ANISO = 0.42;

// blued steel is polished before oxidizing — tighter highlight than raw brushed
const BLUED_ROUGHNESS_MUL = 0.72;

// v4 metal families: iron is a rougher working metal, bronze casts slightly matte
const FAMILY_INDEX = { steel: 0, iron: 1, bronze: 2 };
const FAMILY_ROUGHNESS_ADD = { steel: 0.0, iron: 0.10, bronze: 0.05 };
const GRIP_INDEX = { leather: 0, cord: 1, wire: 2 };

export function deriveMaterial(p) {
  let baseRoughness = p.weapon_class === 'sword'
    ? SWORD_ROUGHNESS[p.blade_type]
    : AXE_ROUGHNESS[p.head_type];
  if (p.steel_finish === 'blued') baseRoughness *= BLUED_ROUGHNESS_MUL;
  baseRoughness = clamp(baseRoughness + FAMILY_ROUGHNESS_ADD[p.metal_family], 0.1, 0.6);
  return {
    finishIdx: FINISH_INDEX[p.steel_finish],
    wear: p.wear_amount,
    damascusScale: p.damascus_scale,
    damascusWarp: p.damascus_warp,
    anisoStrength: p.weapon_class === 'sword' ? SWORD_ANISO : AXE_ANISO,
    baseRoughness: Math.round(baseRoughness * 1000) / 1000,
    familyIdx: FAMILY_INDEX[p.metal_family],
    gripIdx: GRIP_INDEX[p.grip_material],
    engraveOn: p.engrave_on,
    engraveDensity: p.engrave_density,
  };
}

// Assembly geometry shared by the shader (uniforms) and the tests (invariants).
// Sword: origin at guard center, +y toward the tip. Axe: origin at haft base, +y up.
export function deriveLayout(p) {
  if (p.weapon_class === 'sword') {
    const bladeRoot = p.guard_thick / 2;
    const tipY = bladeRoot + p.blade_len;
    const gripBot = -p.grip_len;
    const pommelY = gripBot - p.pommel_r * 0.7;
    return {
      kind: 'sword',
      bladeRoot,
      tipY,
      gripBot,
      pommelY,
      totalLen: tipY - (pommelY - p.pommel_r),
    };
  }
  const headHalfH = p.head_w / 2;
  const headY = p.haft_len - p.head_drop - headHalfH;
  const edgeReach = p.haft_r + 0.10 + p.edge_sweep * 0.12 + p.beard_depth * 0.05;
  return {
    kind: 'axe',
    haftTop: p.haft_len,
    headY,
    headHalfH,
    edgeReach,
    totalLen: p.haft_len,
  };
}
