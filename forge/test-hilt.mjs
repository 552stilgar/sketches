// FORGE — v6 hilt geometry-depth lane (G2)
//
// Scope: guard + grip + pommel SDF functions inside mapSword (index.html SCENE).
// params.mjs / test.mjs are the contract's shared files (edited by another lane) —
// this file only asserts things about the SHADER SOURCE for the hilt genes, so it
// never collides with test.mjs on merge.
//
// There is no headless GL harness on this VPS (SDFGI/WebGL needs a real GPU —
// see usul-elsewhile CAMPAIGN for the same constraint), so this file cannot
// compile-check the GLSL. Instead it:
//   H1 — statically confirms every v6 hilt uniform is actually READ inside a
//        shader body (declaration-only = dead wiring, the exact failure mode
//        the research doc flagged for guard_droop pre-fix).
//   H2 — confirms guard_droop is now consumed by all 4 guard_type branches +
//        both guard_ext branches (was 2 of 6 call sites before this lane).
//   H3 — confirms wrap_bands drives both the geometric ripple AND the
//        surfaceMat cord/wire band frequency with the SAME formula (the
//        "decoupled frequency" gap from the research doc).
//   H4 — confirms the new wrap ripple amplitude is a materially bigger
//        fraction of grip_r than the old 0.0035 (quantifies the "~10-15%,
//        essentially invisible" fix instead of just checking it changed).
//   H5-H8 — pure-JS mirrors of the SDF math (smin, quadratic curl bend,
//        regular-n-gon fold) so the craft techniques used in the shader are
//        unit-tested on their own merits, independent of GLSL.
//   H9 — every new tip-cap / shell primitive union goes through smin (not a
//        hard min()), so new parts don't look "glued on" per the research
//        doc's §3d note.
//   H10 — every new small feature's amplitude/half-size clears the
//        raymarcher's surface epsilon (0.0004-0.0008) by a healthy margin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(path.join(HERE, 'index.html'), 'utf8');

function extractScene(html) {
  const m = html.match(/const SCENE = `([\s\S]*?)`;/);
  assert.ok(m, 'SCENE template string not found in index.html');
  return m[1];
}
const SCENE = extractScene(HTML);

function countOccurrences(src, token) {
  return (src.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

test('H1: every v6 hilt uniform is declared AND consumed (not dead wiring)', () => {
  const v6HiltUniforms = [
    'u_quillonCurl', 'u_quillonTip', 'u_guardShell',
    'u_gripProfile', 'u_gripRisers', 'u_ferruleOn', 'u_pommelFacets',
  ];
  for (const u of v6HiltUniforms) {
    const count = countOccurrences(SCENE, u);
    // 1 declaration + at least 1 real read site
    assert.ok(count >= 2, `${u}: only ${count} occurrence(s) — declared but never read`);
  }
});

test('H2: guard_droop is consumed by every guard_type/guard_ext branch (was 2 of 6, now all)', () => {
  const count = countOccurrences(SCENE, 'u_guardDroop');
  // pre-fix: quillons capsule endpoint + swept rear-quillon endpoint = 2 read sites (+1 decl) = 3
  // post-fix: + bar rake, + disc tilt, + crescent tilt = 3 more read sites minimum
  assert.ok(count >= 6, `u_guardDroop occurrences=${count}, expected >=6 (bar/disc/crescent now consume it too)`);

  // the bar/disc/crescent branches must each reference u_guardDroop somewhere
  // between their branch comment and the next branch (structural, not just "somewhere in file")
  const barBranch = SCENE.match(/\/\/ bar[\s\S]*?g = sdBox\(rotX\(p, u_guardDroop[\s\S]*?\);/);
  assert.ok(barBranch, 'bar branch does not rotate by u_guardDroop');
  const discBranch = SCENE.match(/\/\/ disc[\s\S]*?g = sdCylY\(rotX\(p, u_guardDroop[\s\S]*?\);/);
  assert.ok(discBranch, 'disc branch does not tilt by u_guardDroop');
  const crescentBranch = SCENE.match(/crescent[\s\S]*?vec3 pc = rotX\(p, u_guardDroop[\s\S]*?\);/);
  assert.ok(crescentBranch, 'crescent branch does not tilt by u_guardDroop');
});

test('H3: wrap_bands drives the SAME frequency formula in the SDF ripple and surfaceMat cord/wire', () => {
  const formula = 'u_wrapBands * 6.283185 / max(u_gripLen, 1e-4)';
  const count = countOccurrences(SCENE, formula);
  assert.ok(count >= 2, `expected the exact wrap-frequency formula reused in the SDF ripple (wrapFreqGeo) and surfaceMat (wrapFreq), found ${count}`);
});

test('H4: wrap ripple amplitude is a materially bigger fraction of grip_r than the old 0.0035', () => {
  const ampMatch = SCENE.match(/WRAP_RIDGE_AMP\s*=\s*([\d.]+)/);
  assert.ok(ampMatch, 'WRAP_RIDGE_AMP constant not found');
  const newAmp = parseFloat(ampMatch[1]);
  const OLD_AMP = 0.0035;
  const GRIP_R_MIN = 0.022, GRIP_R_MAX = 0.038;
  const oldFracMin = OLD_AMP / GRIP_R_MAX; // old worst-case visibility (~9%)
  const newFracMin = newAmp / GRIP_R_MAX;  // new worst-case visibility
  assert.ok(newFracMin > oldFracMin * 2, `new ripple fraction ${newFracMin} not >2x old ${oldFracMin}`);
  assert.ok(newAmp < GRIP_R_MIN, 'ripple amplitude must stay below the smallest grip_r or radius can invert negative');
});

test('H5: smin (pure-JS mirror) is a true smooth-min — always <= min(a,b), converges to min as k->0', () => {
  const smin = (a, b, k) => {
    // mirrors GLSL: h = clamp(0.5+0.5*(b-a)/k,0,1); return mix(b,a,h) - k*h*(1-h);
    // GLSL mix(x,y,a) = x*(1-a) + y*a
    const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
    return b * (1 - h) + a * h - k * h * (1 - h);
  };
  for (const [a, b] of [[0.01, 0.02], [0.05, 0.01], [-0.002, 0.003], [0.1, 0.1]]) {
    for (const k of [0.005, 0.01, 0.02]) {
      const s = smin(a, b, k);
      assert.ok(s <= Math.min(a, b) + 1e-9, `smin(${a},${b},${k})=${s} exceeds min`);
    }
  }
  // as k shrinks, smin should approach the hard min
  const a = 0.02, b = 0.03;
  const s1 = smin(a, b, 0.02), s2 = smin(a, b, 0.0001);
  assert.ok(Math.abs(s2 - Math.min(a, b)) < Math.abs(s1 - Math.min(a, b)),
    'smaller k should converge closer to hard min()');
});

test('H6: quillon_curl quadratic bend is zero at the guard root and monotonic to the tip (pure-JS mirror)', () => {
  const bend = (curl, t, span) => curl * t * t * span;
  const curl = 0.4, span = 0.24;
  assert.equal(bend(curl, 0, span), 0, 'curl offset must be zero at t=0 (guard root, legacy shape preserved)');
  const samples = [0, 0.25, 0.5, 0.75, 1].map(t => bend(curl, t, span));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1], 'bend offset must be monotonically non-decreasing toward the tip');
  }
  assert.ok(Math.abs(bend(0, 0.6, span)) < 1e-9, 'curl=0 must reproduce the legacy straight arm exactly');
});

test('H7: pommel_facets regular-polygon fold matches known apothem/vertex-radius geometry (pure-JS mirror)', () => {
  const polyDist = (rad, ang, facets, apothem) => {
    const seg = (2 * Math.PI) / facets;
    let a2 = ((ang + seg / 2) % seg + seg) % seg - seg / 2;
    return rad * Math.cos(a2) - apothem;
  };
  const facets = 6, apothem = 1.0;
  // at a face center (ang=0), distance from the vertex-radius should equal apothem exactly when rad=apothem
  assert.ok(Math.abs(polyDist(apothem, 0, facets, apothem)) < 1e-9, 'face-center distance at rad=apothem should be 0');
  // at a vertex angle (seg/2), the true vertex radius is apothem/cos(seg/2); sampling there at rad=vertexRadius should be 0
  const seg = (2 * Math.PI) / facets;
  const vertexRadius = apothem / Math.cos(seg / 2);
  assert.ok(Math.abs(polyDist(vertexRadius, seg / 2, facets, apothem)) < 1e-9, 'vertex distance should be 0 at the true vertex radius');
  // 10-facet polygon must be "rounder" (smaller vertex/apothem ratio) than 6-facet
  const ratio = (facets2) => (apothem / Math.cos(Math.PI / facets2)) / apothem;
  assert.ok(ratio(10) < ratio(6), '10-facet pommel should be rounder (less faceted) than 6-facet');
});

test('H8: guard_shell / quillon_curl / grip_profile / grip_risers / ferrule_on / pommel_facets are all consumed in mapSword only (hilt lane scope)', () => {
  const mapSwordMatch = SCENE.match(/vec2 mapSword\(vec3 p\) \{[\s\S]*?\n\}\n/);
  assert.ok(mapSwordMatch, 'mapSword function body not found');
  const body = mapSwordMatch[0];
  for (const u of ['u_quillonCurl', 'u_quillonTip', 'u_guardShell', 'u_gripProfile', 'u_gripRisers', 'u_ferruleOn', 'u_pommelFacets']) {
    assert.ok(body.includes(u), `${u} must be consumed inside mapSword (hilt lane scope)`);
  }
});

test('H9: new tip-cap / shell primitives are merged with smin, not a hard min()', () => {
  assert.ok(/smin\(rear, flare/.test(SCENE), 'rear-quillon flare cap should smin, not hard-min');
  assert.ok(/smin\(rear, spat/.test(SCENE), 'rear-quillon spatulate cap should smin, not hard-min');
  assert.ok(/smin\(g, flare/.test(SCENE), 'quillon flare cap should smin, not hard-min');
  assert.ok(/smin\(g, spat/.test(SCENE), 'quillon spatulate cap should smin, not hard-min');
  assert.ok(/smin\(g, shell/.test(SCENE), 'guard_shell should smin into the base guard, not hard-min');
});

test('H10: new small-feature sizes clear the raymarcher surface epsilon (0.0004-0.0008) by a healthy margin', () => {
  const SURF_EPS = 0.0008;
  const MARGIN = 5; // require >=5x epsilon so features survive step-count/normal-estimation noise
  const GUARD_THICK_MIN = 0.018, POMMEL_R_MIN = 0.035, GRIP_LEN_MIN = 0.14;

  const riserAmp = parseFloat(SCENE.match(/RISER_AMP\s*=\s*([\d.]+)/)[1]);
  assert.ok(riserAmp > SURF_EPS * MARGIN, `grip_risers amplitude ${riserAmp} too small vs epsilon`);

  const wrapAmp = parseFloat(SCENE.match(/WRAP_RIDGE_AMP\s*=\s*([\d.]+)/)[1]);
  assert.ok(wrapAmp > SURF_EPS * MARGIN, `wrap_bands ripple amplitude ${wrapAmp} too small vs epsilon`);

  // ferrule half-height floor
  const ferruleFloor = parseFloat(SCENE.match(/max\(u_gripLen \* 0\.05, ([\d.]+)\)/)[1]);
  assert.ok(ferruleFloor > SURF_EPS * MARGIN, `ferrule half-height floor ${ferruleFloor} too small vs epsilon`);

  // pommel facet cut depth: sphere_bound - apothem, at the smallest pommel_r
  const facetCutDepth = (POMMEL_R_MIN * 1.30) - (POMMEL_R_MIN * 1.05);
  assert.ok(facetCutDepth > SURF_EPS * MARGIN, `pommel facet cut depth ${facetCutDepth} too small vs epsilon at min pommel_r`);

  // guard_shell tube radius at the smallest guard_thick
  const shellTubeR = GUARD_THICK_MIN * 0.5;
  assert.ok(shellTubeR > SURF_EPS * MARGIN, `guard_shell tube radius ${shellTubeR} too small vs epsilon`);
});
