// Locale-independent string comparator.
//
// code-city's determinism contract requires identical repo input to produce
// byte-identical city.json output regardless of the machine's locale. Bare
// `.localeCompare()` violates that: its ordering depends on the ICU locale
// data available at runtime, which varies across machines, Node builds, and
// even Node versions on the same machine.
//
// This comparator orders strings by plain UTF-16 code unit value — the same
// ordering `<`/`>` already use on strings in JS. It never calls
// `localeCompare` or `Intl.Collator`, so its output is fixed across every
// environment.
//
// This also happens to fix a correctness bug most localeCompare-based sorts
// carry: locale collation treats accented/base letter pairs (e.g. "e" vs
// "é") as adjacent, so their relative order flips between locales (e.g.
// "e" < "é" under one locale's collation, "é" < "e" under another's).
// Codepoint order never does this — it's a fixed total order.
export function compareCodepoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
