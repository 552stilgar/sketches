// ornament.mjs — the single resolver for how ornate a hash renders.
// Endgame reference: Usul's 2026-07-04 dark-fantasy axe (ceiling target).
//
// Pure ESM, no DOM, no deps, no PRNG: the DNA table is frozen at 57 genes, so
// every ornament decision is DERIVED from existing rolls — discrete genes gate
// the tier, continuous genes are reused as free entropy for feature shaping.
// Both media consume the same plan: card-geo.mjs builds geometry from it, and
// index.html packs it into u_* uniforms — lockstep by construction.
//
// Behavior spec lives as the comment block at the top of test-ornament.mjs.

// Tier gates (existing-roll probabilities: damascus finish 1/4, accent 1/2,
// engrave 1/4 → ornate ≈ 12.5%, worked ≈ 22%, plain the rest):
//   ornate — damascus finish AND accent fittings: the full ceiling treatment
//   worked — damascus without accent, or engraved accent pieces
//   plain  — everything else (the common drop stays quiet)
const EDGE_LIGHT_BASE = 0.35;
const EDGE_LIGHT_BY_TIER = { plain: 0.0, worked: 0.25, ornate: 0.5 };

const norm = (v, lo, hi) => (v - lo) / (hi - lo);

export function resolveOrnament(p) {
  const isDamascus = p.steel_finish === 'damascus';
  const hasAccent = p.accent_on === 1;
  const tier = isDamascus && hasAccent ? 'ornate'
    : isDamascus || (hasAccent && p.engrave_on === 1) ? 'worked'
    : 'plain';

  // damascus_warp (0.15..0.85) shades etch intensity within its tier band
  const warp = norm(p.damascus_warp, 0.15, 0.85);
  const damascus = !isDamascus ? 0
    : tier === 'ornate' ? 0.6 + 0.4 * warp
    : 0.35 + 0.35 * warp;

  // gold filigree only on the ceiling; accent_hue (22..48) sets density
  const veins = tier === 'ornate' ? 0.3 + 0.7 * norm(p.accent_hue, 22, 48) : 0;

  // pierced cutout only on the ceiling; damascus_scale (18..60) places it
  const scale = norm(p.damascus_scale, 18, 60);
  const pierce = tier === 'ornate'
    ? { t: 0.35 + 0.3 * scale, r: 0.1 + 0.08 * (1 - scale) }
    : null;

  // rear fluke: every ornate head; worked heads only when the roll already
  // committed to a spike poll (the fluke reads as its dressed-up form)
  const backFluke = tier === 'ornate' || (tier === 'worked' && p.poll_type === 'spike')
    ? { reach: 0.25 + 0.5 * p.wear_amount, droop: norm(p.engrave_density, 0.3, 1.0) }
    : null;

  const plateCollars = tier === 'plain' ? 0
    : tier === 'worked' ? 1 + (p.haft_butt === 1 ? 1 : 0)
    : Math.min(3, 2 + (p.langet_len > 0.14 ? 1 : 0));

  const edgeLight = EDGE_LIGHT_BASE + EDGE_LIGHT_BY_TIER[tier]
    + 0.05 * norm(p.edge_bevel_w, 0.05, 0.40);

  return {
    tier,
    pierce,
    backFluke,
    plateCollars,
    damascus: Math.min(1, damascus),
    veins: Math.min(1, veins),
    edgeLight: Math.min(1, edgeLight),
  };
}

/** Place the pierced cutout in the axe head's local frame (mapAxe convention:
 *  eye collar at x=0 radius eyeR, edge arc at x=edgeReach, cheek half-height
 *  halfH). Shared by card-geo and the uniform packer so both media cut the
 *  same hole. The circle always leaves a structural web: clear of the eye
 *  collar, out of the edge-bevel zone (beyond 82% of reach), inside 75% of
 *  the cheek height. Returns null when the plan has no pierce OR the head is
 *  too small to hold a sound hole — refusal over degenerate geometry. */
export function piercePlacement(plan, geo) {
  if (!plan.pierce) return null;
  const { eyeR, halfH, edgeReach } = geo;
  const CLEAR = 0.008;                       // structural web width
  const xMax = edgeReach * 0.82;             // stay out of the bevel zone
  const r = Math.min(plan.pierce.r * halfH * 2, halfH * 0.75);
  const lo = eyeR + CLEAR + r;
  const hi = xMax - r;
  if (!(r > 0.004) || lo > hi) return null;  // no room for a hole worth cutting
  return { cx: lo + (hi - lo) * plan.pierce.t, cy: 0, r };
}

// -- uniform bridge: the 3D half of lockstep ---------------------------------
// One float slot per plan field, u_orn* namespace. unpack is the exact inverse
// (used by tests and as the reference for the GLSL-side reader) — nothing may
// ride along in a slot or the media drift apart.

const TIER_INDEX = { plain: 0, worked: 1, ornate: 2 };
const TIER_NAME = ['plain', 'worked', 'ornate'];

export function packOrnamentUniforms(plan) {
  return {
    u_ornTier: TIER_INDEX[plan.tier],
    u_ornPierceOn: plan.pierce ? 1 : 0,
    u_ornPierceT: plan.pierce ? plan.pierce.t : 0,
    u_ornPierceR: plan.pierce ? plan.pierce.r : 0,
    u_ornFlukeOn: plan.backFluke ? 1 : 0,
    u_ornFlukeReach: plan.backFluke ? plan.backFluke.reach : 0,
    u_ornFlukeDroop: plan.backFluke ? plan.backFluke.droop : 0,
    u_ornPlateCollars: plan.plateCollars,
    u_ornDamascus: plan.damascus,
    u_ornVeins: plan.veins,
    u_ornEdgeLight: plan.edgeLight,
  };
}

export function unpackOrnamentUniforms(u) {
  return {
    tier: TIER_NAME[u.u_ornTier],
    pierce: u.u_ornPierceOn ? { t: u.u_ornPierceT, r: u.u_ornPierceR } : null,
    backFluke: u.u_ornFlukeOn ? { reach: u.u_ornFlukeReach, droop: u.u_ornFlukeDroop } : null,
    plateCollars: u.u_ornPlateCollars,
    damascus: u.u_ornDamascus,
    veins: u.u_ornVeins,
    edgeLight: u.u_ornEdgeLight,
  };
}
