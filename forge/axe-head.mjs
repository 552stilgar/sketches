// axe-head.mjs — the head-silhouette plan (endgame slice 1).
// Reference: docs/reference-endgame-axe.md — horns w/ recurve, real beard hook,
// gothic eye cusps, bevel-band geometry, ornate top spike, composed ring fluke.
//
// Same discipline as ornament.mjs: pure, derived from EXISTING genes + the
// ornament plan (tier gates), no new rolls. Card (card-geo) builds curves from
// these numbers; the 3D SDF (index.html mapAxe) mirrors them via u_hd* uniforms.
//
// Behavior spec: comment block atop test-head.mjs.

const norm = (v, lo, hi) => (v - lo) / (hi - lo);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const RECURVE_BY_TIER = { plain: 0.10, worked: 0.35, ornate: 0.60 };
const CUSPS_BY_TIER = { plain: 0, worked: 2, ornate: 3 };

// -- composition (slice 6: honest-pass fix #1) --------------------------------
// The reference head OWNS the weapon (head span : haft length ~ 1:2.2). The
// plan derives a headScale multiplier (applied to halfH + edgeReach by both
// media) that grows the head toward the tier's presence target; hatchet-class
// rolls that are already head-heavy clamp to 1 (never shrink a head).
const HEAD_PRESENCE_BY_TIER = { plain: 0.34, worked: 0.40, ornate: 0.46 }; // head span / haft length
const HEAD_SCALE_MAX = 1.9;

// Reference hafts are near-straight; the curve gene survives as a whisper.
// Consumed by card-geo (haftSpine) AND index.html (u_haftCurve upload).
export const HAFT_CURVE_TAME = 0.45;

export function resolveHeadPlan(p, ornPlan) {
  const sweepN = clamp01(norm(p.edge_sweep, 0.25, 0.95));
  const beardN = clamp01(norm(p.beard_depth, 0, 0.55));
  const warpN = clamp01(norm(p.damascus_warp, 0.15, 0.85));
  const densN = clamp01(norm(p.engrave_density, 0.3, 1.0));
  const scaleN = clamp01(norm(p.damascus_scale, 18, 60));
  const tier = ornPlan.tier;

  const isWarTop = p.head_type === 'war';
  const hornTop = {
    // war heads stay compact on BOTH horns — the whole head reads tighter
    reach: Math.round(((isWarTop ? 0.75 + 0.30 * sweepN : 0.95 + 0.45 * sweepN)) * 1000) / 1000,
    recurve: clamp01(RECURVE_BY_TIER[tier] + 0.3 * warpN),
  };

  const isBearded = p.head_type === 'bearded';
  const isWar = p.head_type === 'war';
  const hornBottom = {
    reach: Math.round((isBearded ? 0.80 + 0.30 * sweepN
      : isWar ? 0.70 + 0.20 * sweepN
      : 0.90 + 0.35 * sweepN) * 1000) / 1000,
    drop: isBearded ? Math.round((0.30 + 0.70 * beardN) * 1000) / 1000
      : isWar || p.head_type === 'double_bit' ? 0
      : Math.round(0.15 * beardN * 1000) / 1000,
  };

  const edgeBelly = clamp01((0.25 + 0.60 * sweepN) * (p.head_type === 'broad' ? 1 : 0.7));
  const bevelBand = Math.round((0.06 + 0.28 * p.edge_bevel_w) * 1000) / 1000;

  const topSpike = tier === 'ornate'
    ? { h: 0.8 + 0.8 * densN, lean: (scaleN - 0.5) * 0.5 }
    : tier === 'worked' && p.poll_type === 'spike'
    ? { h: 0.5 + 0.4 * densN, lean: (scaleN - 0.5) * 0.5 }
    : null;

  const backForm = tier === 'ornate' ? 'ringFluke'
    : tier === 'worked' && p.poll_type === 'spike' ? 'fluke'
    : 'poll';

  const headScale = Math.round(Math.min(HEAD_SCALE_MAX,
    Math.max(1, (HEAD_PRESENCE_BY_TIER[tier] * p.haft_len) / Math.max(p.head_w, 1e-6))) * 1000) / 1000;

  return {
    hornTop,
    hornBottom,
    edgeBelly: Math.round(edgeBelly * 1000) / 1000,
    eyeCusps: CUSPS_BY_TIER[tier],
    bevelBand,
    topSpike,
    backForm,
    headScale,
  };
}

// -- uniform bridge (the 3D half of lockstep) --------------------------------

const BACK_FORM_INDEX = { poll: 0, fluke: 1, ringFluke: 2 };
const BACK_FORM_NAME = ['poll', 'fluke', 'ringFluke'];

export function packHeadUniforms(plan) {
  return {
    u_hdHornTopR: plan.hornTop.reach,
    u_hdHornTopRec: plan.hornTop.recurve,
    u_hdHornBotR: plan.hornBottom.reach,
    u_hdHornBotDrop: plan.hornBottom.drop,
    u_hdBelly: plan.edgeBelly,
    u_hdCusps: plan.eyeCusps,
    u_hdBevel: plan.bevelBand,
    u_hdSpikeOn: plan.topSpike ? 1 : 0,
    u_hdSpikeH: plan.topSpike ? plan.topSpike.h : 0,
    u_hdSpikeLean: plan.topSpike ? plan.topSpike.lean : 0,
    u_hdBackForm: BACK_FORM_INDEX[plan.backForm],
    u_hdScale: plan.headScale,
  };
}

export function unpackHeadUniforms(u) {
  return {
    hornTop: { reach: u.u_hdHornTopR, recurve: u.u_hdHornTopRec },
    hornBottom: { reach: u.u_hdHornBotR, drop: u.u_hdHornBotDrop },
    edgeBelly: u.u_hdBelly,
    eyeCusps: u.u_hdCusps,
    bevelBand: u.u_hdBevel,
    topSpike: u.u_hdSpikeOn ? { h: u.u_hdSpikeH, lean: u.u_hdSpikeLean } : null,
    backForm: BACK_FORM_NAME[u.u_hdBackForm],
    headScale: u.u_hdScale,
  };
}
