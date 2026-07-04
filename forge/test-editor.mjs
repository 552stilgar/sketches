// FORGE DNA editor — DOM-free logic tests. Node's built-in test runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DNA, mulberry32 } from './params.mjs';
import {
  SECTION_ORDER, isSectionVisible, sectionsForClass, groupGenesBySection,
  rollGeneValue, rerollGeneByIndex, filterUnlocked, rerollUnlocked,
  isGeneOverridden, overriddenIndices,
} from './editor-logic.mjs';

// -- section visibility -------------------------------------------------------

test('E1: sword sections include Blade/Guard/Grip, exclude Haft/Head', () => {
  const sections = sectionsForClass('sword');
  assert.ok(sections.includes('Blade'));
  assert.ok(sections.includes('Guard'));
  assert.ok(sections.includes('Grip'));
  assert.ok(!sections.includes('Haft'));
  assert.ok(!sections.includes('Head'));
});

test('E2: axe sections include Haft/Head, exclude Blade/Guard/Grip', () => {
  const sections = sectionsForClass('axe');
  assert.ok(sections.includes('Haft'));
  assert.ok(sections.includes('Head'));
  assert.ok(!sections.includes('Blade'));
  assert.ok(!sections.includes('Guard'));
  assert.ok(!sections.includes('Grip'));
});

test('E3: Class/Material/Lighting/Detail are visible for both classes', () => {
  for (const cls of ['sword', 'axe']) {
    const sections = sectionsForClass(cls);
    for (const always of ['Class', 'Material', 'Lighting', 'Detail']) {
      assert.ok(sections.includes(always), `${always} missing for ${cls}`);
    }
  }
});

test('E4: isSectionVisible matches sectionsForClass for every known section', () => {
  for (const cls of ['sword', 'axe']) {
    const visible = new Set(sectionsForClass(cls));
    for (const section of SECTION_ORDER) {
      assert.equal(isSectionVisible(section, cls), visible.has(section));
    }
  }
});

// -- gene grouping -------------------------------------------------------------

test('E5: groupGenesBySection covers every DNA index exactly once per class-visible section, none from hidden sections', () => {
  for (const cls of ['sword', 'axe']) {
    const groups = groupGenesBySection(cls);
    const seen = new Set();
    const visibleSections = new Set(sectionsForClass(cls));
    for (const { section, indices } of groups) {
      assert.ok(visibleSections.has(section));
      for (const i of indices) {
        assert.equal(DNA[i].section, section);
        assert.ok(!seen.has(i), `index ${i} appeared twice`);
        seen.add(i);
      }
    }
    // every DNA entry whose section is visible for this class must appear
    DNA.forEach((spec, i) => {
      if (visibleSections.has(spec.section)) assert.ok(seen.has(i), `index ${i} (${spec.key}) missing`);
      else assert.ok(!seen.has(i), `index ${i} (${spec.key}) should be hidden for ${cls}`);
    });
  }
});

test('E6: groupGenesBySection preserves canonical section order', () => {
  const groups = groupGenesBySection('sword');
  const order = groups.map(g => g.section);
  const filteredCanonical = SECTION_ORDER.filter(s => order.includes(s));
  assert.deepEqual(order, filteredCanonical);
});

// -- rolling / reroll-one -------------------------------------------------------

test('E7: rollGeneValue on an options gene always returns one of the listed options', () => {
  const spec = DNA.find(s => s.key === 'quillon_tip');
  const rng = mulberry32(777);
  for (let i = 0; i < 200; i++) {
    const v = rollGeneValue(spec, rng);
    assert.ok(spec.options.includes(v));
  }
});

test('E8: rollGeneValue boundary rng values pick first/last option slot', () => {
  const spec = DNA.find(s => s.key === 'blade_section'); // ['diamond','diamond','diamond','lenticular','hollow_ground']
  assert.equal(rollGeneValue(spec, () => 0), 'diamond');
  assert.equal(rollGeneValue(spec, () => 0.999999), 'hollow_ground');
});

test('E9: rollGeneValue weighting — repeated options occupy proportional index space', () => {
  // 3/5 slots are 'diamond' for blade_section: rng values < 0.6 should land on diamond
  const spec = DNA.find(s => s.key === 'blade_section');
  assert.equal(rollGeneValue(spec, () => 0.599), 'diamond');
  assert.equal(rollGeneValue(spec, () => 0.601), 'lenticular');
});

test('E10: rollGeneValue on a range gene stays within [min,max] and respects decimals', () => {
  const spec = DNA.find(s => s.key === 'edge_bevel_w'); // 0.05-0.40, 2dp
  const rng = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const v = rollGeneValue(spec, rng);
    assert.ok(v >= spec.min && v <= spec.max, `${v} out of range`);
    assert.equal(Math.round(v * 100) / 100, v, `${v} not rounded to 2dp`);
  }
});

test('E11: rerollGeneByIndex matches rollGeneValue for the same spec + rng draw', () => {
  const index = DNA.findIndex(s => s.key === 'ricasso_len');
  const a = rerollGeneByIndex(index, () => 0.5);
  const b = rollGeneValue(DNA[index], () => 0.5);
  assert.equal(a, b);
});

test('E12: rerollGeneByIndex returns undefined for an out-of-range index', () => {
  assert.equal(rerollGeneByIndex(9999), undefined);
  assert.equal(rerollGeneByIndex(-1), undefined);
});

// -- lock filtering --------------------------------------------------------------

test('E13: filterUnlocked drops indices whose gene key is locked', () => {
  const groups = groupGenesBySection('sword');
  const bladeIndices = groups.find(g => g.section === 'Blade').indices;
  const lockedKeys = new Set(['blade_type', 'blade_len']);
  const result = filterUnlocked(bladeIndices, lockedKeys);
  assert.ok(!result.some(i => lockedKeys.has(DNA[i].key)));
  assert.equal(result.length, bladeIndices.length - 2);
});

test('E14: filterUnlocked with an empty lock set returns every index unchanged', () => {
  const indices = [0, 1, 2, 3];
  assert.deepEqual(filterUnlocked(indices, new Set()), indices);
});

test('E15: rerollUnlocked leaves locked gene values byte-identical, changes unlocked ones deterministically', () => {
  const base = { weapon_class: 'sword', blade_type: 'arming', blade_len: 1.0, grip_r: 0.03 };
  const lockedKeys = new Set(['weapon_class', 'blade_type']);
  const rng = mulberry32(123);
  const next = rerollUnlocked(base, lockedKeys, rng);
  assert.equal(next.weapon_class, base.weapon_class);
  assert.equal(next.blade_type, base.blade_type);
  // unlocked keys got a fresh roll from the DNA table (every DNA entry is rolled)
  DNA.forEach(spec => {
    if (lockedKeys.has(spec.key)) return;
    assert.ok(Object.prototype.hasOwnProperty.call(next, spec.key));
  });
});

test('E16: rerollUnlocked with everything locked returns params with no DNA-tracked values changed', () => {
  const base = {};
  DNA.forEach(spec => { base[spec.key] = spec.options ? spec.options[0] : spec.min; });
  const allKeys = new Set(DNA.map(s => s.key));
  const next = rerollUnlocked(base, allKeys, () => 0.9999);
  DNA.forEach(spec => assert.equal(next[spec.key], base[spec.key]));
});

// -- override tracking -----------------------------------------------------------

test('E17: isGeneOverridden is false when params matches baseParams, true after a diff', () => {
  const index = DNA.findIndex(s => s.key === 'grip_r');
  const base = { grip_r: 0.03 };
  const same = { grip_r: 0.03 };
  const changed = { grip_r: 0.035 };
  assert.equal(isGeneOverridden(index, same, base), false);
  assert.equal(isGeneOverridden(index, changed, base), true);
});

test('E18: overriddenIndices lists exactly the changed DNA-tracked keys', () => {
  const base = { weapon_class: 'sword', blade_type: 'arming', blade_len: 1.0 };
  const params = { weapon_class: 'sword', blade_type: 'longsword', blade_len: 1.0 };
  const idx = overriddenIndices(params, base);
  const changedKeys = idx.map(i => DNA[i].key);
  assert.deepEqual(changedKeys, ['blade_type']);
});

test('E19: overriddenIndices ignores non-DNA keys like "hash"', () => {
  const base = { hash: 'abc', weapon_class: 'sword' };
  const params = { hash: 'def', weapon_class: 'sword' };
  assert.deepEqual(overriddenIndices(params, base), []);
});
