// FORGE DNA editor — pure, DOM-free logic. Consumes the DNA metadata table
// from params.mjs (key/section/options|min+max+decimals) so every gene the
// contract appends is automatically groupable, rollable, and lockable — no
// per-gene editor code to write when the table grows.
import { DNA } from './params.mjs';

// ---------------------------------------------------------------------------
// Section grouping — weapon_class-aware visibility. Class/Material/Lighting/
// Detail are always shown; Blade/Guard/Grip are sword-only; Haft/Head axe-only.
// ---------------------------------------------------------------------------

export const SECTION_ORDER = [
  'Class', 'Blade', 'Guard', 'Grip', 'Haft', 'Head', 'Material', 'Lighting', 'Detail',
];

const SWORD_ONLY_SECTIONS = new Set(['Blade', 'Guard', 'Grip']);
const AXE_ONLY_SECTIONS = new Set(['Haft', 'Head']);

export function isSectionVisible(section, weaponClass) {
  if (SWORD_ONLY_SECTIONS.has(section)) return weaponClass === 'sword';
  if (AXE_ONLY_SECTIONS.has(section)) return weaponClass === 'axe';
  return true;
}

export function sectionsForClass(weaponClass) {
  return SECTION_ORDER.filter(s => isSectionVisible(s, weaponClass));
}

// Returns [{ section, indices: [DNA index, ...] }, ...] in canonical order,
// filtered to the sections visible for weaponClass. Genes keep DNA order
// within their section so future appends slot in naturally.
export function groupGenesBySection(weaponClass) {
  return sectionsForClass(weaponClass).map(section => ({
    section,
    indices: DNA.reduce((acc, spec, i) => {
      if (spec.section === section) acc.push(i);
      return acc;
    }, []),
  }));
}

// ---------------------------------------------------------------------------
// Rolling — mirrors params.mjs's private rollParam exactly (not exported
// there, so duplicated here rather than reaching into the contract's
// internals). Options weighting falls out naturally: a repeated option
// (e.g. ['ball','ball','ball','flare','spatulate']) occupies more index
// slots, so a uniform draw over indices reproduces the intended weighting.
// ---------------------------------------------------------------------------

export function rollGeneValue(spec, rng = Math.random) {
  if (spec.options) return spec.options[(rng() * spec.options.length) | 0];
  const v = spec.min + rng() * (spec.max - spec.min);
  const f = 10 ** (spec.decimals ?? 3);
  return Math.round(v * f) / f;
}

// Reroll a single gene by its DNA index — used by the per-gene 🎲 button.
export function rerollGeneByIndex(index, rng = Math.random) {
  const spec = DNA[index];
  if (!spec) return undefined;
  return rollGeneValue(spec, rng);
}

// ---------------------------------------------------------------------------
// Lock filtering — locked genes are tracked by key (Set<string>) so the set
// survives array-index shuffles and is trivially serializable if ever needed.
// ---------------------------------------------------------------------------

export function filterUnlocked(indices, lockedKeys) {
  return indices.filter(i => !lockedKeys.has(DNA[i].key));
}

// Rerolls every unlocked gene in params, leaving locked genes untouched.
// Used by the "reroll unlocked" toolbar action.
export function rerollUnlocked(params, lockedKeys, rng = Math.random) {
  const next = { ...params };
  for (const spec of DNA) {
    if (lockedKeys.has(spec.key)) continue;
    next[spec.key] = rollGeneValue(spec, rng);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Override tracking — diffs params against the base (un-edited) roll so the
// panel can highlight touched genes and offer a per-gene reset.
// ---------------------------------------------------------------------------

export function isGeneOverridden(index, params, baseParams) {
  const spec = DNA[index];
  return !!spec && params[spec.key] !== baseParams[spec.key];
}

export function overriddenIndices(params, baseParams) {
  const out = [];
  DNA.forEach((spec, i) => {
    if (params[spec.key] !== baseParams[spec.key]) out.push(i);
  });
  return out;
}
