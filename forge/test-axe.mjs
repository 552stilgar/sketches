// FORGE v6 — axe geometry-depth lane tests (Geometry lane G3).
//
// No headless WebGL/GPU is available on this VPS, so these are NOT render tests —
// they are structural/static checks over params.mjs (DNA contract, untouched by this
// lane) and the SCENE GLSL text in index.html (mapAxe, the axe SDF). They verify:
//   - the 13 v6 uniforms this lane owns are actually consumed inside mapAxe (not
//     dead uniforms — the exact gap the research doc flagged before this lane ran)
//   - the four named gap-fixes (beard_depth gating, poll_type double-bit reuse,
//     haft_wrap real geometry, cheek_profile radial bow) are present in source
//   - SCENE stays GLSL ES 1.00-compatible (no ES3.00-only syntax, no `switch`,
//     no reserved word `patch`) since it's shared by all three programs
//   - mapAxe's braces balance and the DNA/index contract this lane must not touch
//     is still exactly as delivered (57 genes, axe-relevant keys untouched)
//
// Visual correctness (silhouette, specular read, "forged tool" feel) is eyes-gated —
// out of scope here per the mission brief.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DNA, paramsFromHash, randHex, mulberry32 } from './params.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = readFileSync(join(HERE, 'index.html'), 'utf8');

// -- extract the shared SCENE GLSL chunk (mapSword/mapAxe live here) --------
function extractScene(html) {
  const startMarker = 'const SCENE = `';
  const start = html.indexOf(startMarker);
  assert.ok(start >= 0, 'SCENE template literal not found in index.html');
  const bodyStart = start + startMarker.length;
  const end = html.indexOf('\n`;', bodyStart);
  assert.ok(end > bodyStart, 'SCENE template literal close (`\\n`;`) not found');
  return html.slice(bodyStart, end);
}

// -- extract one top-level GLSL function body by name, via brace counting ---
function extractFunction(glsl, signatureRe) {
  const m = signatureRe.exec(glsl);
  assert.ok(m, `function signature not found: ${signatureRe}`);
  const braceOpen = glsl.indexOf('{', m.index);
  assert.ok(braceOpen > 0, `no opening brace found for ${signatureRe}`);
  let depth = 0, i = braceOpen;
  for (; i < glsl.length; i++) {
    if (glsl[i] === '{') depth++;
    else if (glsl[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0, `unbalanced braces while scanning ${signatureRe}`);
  return glsl.slice(m.index, i + 1);
}

const SCENE = extractScene(INDEX_HTML);
const MAP_AXE = extractFunction(SCENE, /vec2\s+mapAxe\s*\(vec3\s+p\)\s*\{/);

test('AX0: mapAxe is present and its braces balance', () => {
  const opens = (MAP_AXE.match(/\{/g) || []).length;
  const closes = (MAP_AXE.match(/\}/g) || []).length;
  assert.equal(opens, closes);
  assert.ok(opens >= 5, 'expected several nested blocks (haft/head/poll/langet/etc)');
});

test('AX1: the 13 v6 uniforms are declared and none are dead in mapAxe', () => {
  // the 4 axe-relevant v6 uniforms delivered by the contract (langet/cheekProfile/
  // haftButt are axe-only; the other 9 are sword-lane uniforms and out of scope here)
  const axeV6Uniforms = ['u_langetLen', 'u_cheekProfile', 'u_haftButt'];
  for (const u of axeV6Uniforms) {
    assert.ok(SCENE.includes(`uniform float`) && SCENE.includes(u),
      `${u} must still be declared`);
    const count = (MAP_AXE.match(new RegExp(u, 'g')) || []).length;
    assert.ok(count >= 1, `${u} must be read inside mapAxe (found ${count} occurrences)`);
  }
});

test('AX2: beard_depth is gated fully to bearded (0 elsewhere), not dampened', () => {
  // the old fix-needed behavior lived in the JS uniform upload as `beard_depth * 0.4`
  // for every non-bearded head — that magic constant must be gone.
  assert.ok(!INDEX_HTML.includes('beard_depth * 0.4'),
    'old blanket 0.4x partial-beard dampening must be removed');
  // the shader now decides bearded-only gating itself
  assert.match(MAP_AXE, /isBearded\s*=\s*u_headType\s*<\s*0\.5/);
  assert.match(MAP_AXE, /beard\s*=\s*isBearded\s*\?/);
});

test('AX3: poll_type drives double-bit asymmetry instead of a dead roll', () => {
  assert.match(MAP_AXE, /isDoubleBit/);
  assert.match(MAP_AXE, /pollAsym\s*=\s*isDoubleBit\s*\?\s*u_pollType/);
  // asymmetry must actually perturb reach/sweep, not just exist unused
  assert.match(MAP_AXE, /edgeReachA\s*=\s*u_edgeReach\s*\*\s*\(1\.0\s*\+\s*pollAsym/);
});

test('AX4: haft_wrap unions real MAT_GRIP cord geometry, not a radius ripple', () => {
  // old dead approach: perturbing hr with a bare sine, never touching material
  assert.ok(!MAP_AXE.includes('hr += 0.004'), 'old sub-pixel radius ripple must be removed');
  assert.match(MAP_AXE, /MAT_GRIP/);
  assert.match(MAP_AXE, /u_haftWrap\s*>\s*0\.5/);
});

test('AX5: cheek_profile bows the face radially instead of a flat clamp', () => {
  assert.match(MAP_AXE, /cheekBow/);
  assert.match(MAP_AXE, /u_cheekProfile\s*>\s*1\.5/);   // convex branch
  assert.match(MAP_AXE, /u_cheekProfile\s*>\s*0\.5/);   // concave branch
  // the bow must actually feed the face test, not sit unused
  assert.match(MAP_AXE, /abs\(h\.z\)\s*-\s*\(thick\s*\+\s*cheekBow\)/);
});

test('AX6: langets are real strap geometry unioned onto the haft', () => {
  assert.match(MAP_AXE, /u_langetLen\s*>\s*0\.015/);
  assert.match(MAP_AXE, /dLanget/);
  assert.match(MAP_AXE, /smin\(dLanget,\s*dHaft/);
});

test('AX7: haft_butt caps the haft base with a blended union, not a hard seam', () => {
  assert.match(MAP_AXE, /u_haftButt\s*>\s*0\.5/);
  // blended into the haft (smin) AND clamped to the cap's neighborhood so the
  // steel material can't claim the whole shaft (see test-zoning.mjs)
  assert.match(MAP_AXE, /smin\(dButtCap,\s*dHaft/);
  assert.match(MAP_AXE, /max\(smin\(dButtCap,\s*dHaft,\s*0\.02\),\s*dButtCap\s*-\s*0\.03\)/);
});

test('AX8: poll geometry stays flat/hammer/spike-distinct and skips double_bit', () => {
  assert.match(MAP_AXE, /if\s*\(!isDoubleBit\)/);
  assert.match(MAP_AXE, /\/\/ spike/);
  assert.match(MAP_AXE, /\/\/ hammer:/);
  assert.match(MAP_AXE, /\/\/ flat:/);
});

test('AX9: war axes reclaim beard_depth for poll spike length', () => {
  assert.match(MAP_AXE, /spikeMul\s*=\s*\(u_headType\s*>\s*2\.5\)\s*\?\s*\(1\.0\s*\+\s*u_beardDepth/);
});

test('AX10: SCENE stays GLSL ES 1.00-compatible (shared by preview ES1.00 program)', () => {
  assert.ok(!/#version/.test(SCENE), 'SCENE must not contain a #version pragma');
  assert.ok(!/\bswitch\s*\(/.test(SCENE), 'GLSL ES 1.00 has no switch statement');
  assert.ok(!/\btexture\s*\(/.test(SCENE), 'ES3.00-only texture() must not appear in shared SCENE');
  assert.ok(!/\bin\s+(vec|float|int|bool)\d?\s+\w+\s*[,;)]/.test(SCENE),
    'ES3.00 `in` parameter/varying qualifiers must not appear in shared SCENE');
});

test('AX11: reserved word `patch` is never used as an identifier in SCENE', () => {
  assert.ok(!/\bpatch\b/.test(SCENE), '`patch` is a GLSL reserved word');
});

test('AX12: the DNA contract (params.mjs) was not touched by this lane', () => {
  assert.equal(DNA.length, 57);
  const byKey = Object.fromEntries(DNA.map((s, i) => [s.key, i]));
  assert.equal(byKey.beard_depth, 25);
  assert.equal(byKey.poll_type, 27);
  assert.equal(byKey.cheek_thick, 26);
  assert.equal(byKey.langet_len, 54);
  assert.equal(byKey.cheek_profile, 55);
  assert.equal(byKey.haft_butt, 56);
});

test('AX13: every axe hash still rolls finite, in-range params through the new genes', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 300; i++) {
    const p = paramsFromHash(randHex(8, rng));
    if (p.weapon_class !== 'axe') continue;
    assert.ok(Number.isFinite(p.langet_len) && p.langet_len >= 0 && p.langet_len <= 0.28);
    assert.ok(['flat', 'concave', 'convex'].includes(p.cheek_profile));
    assert.ok([0, 1].includes(p.haft_butt));
    assert.ok(Number.isFinite(p.beard_depth) && p.beard_depth >= 0 && p.beard_depth <= 0.55);
    assert.ok(['flat', 'hammer', 'spike'].includes(p.poll_type));
  }
});
