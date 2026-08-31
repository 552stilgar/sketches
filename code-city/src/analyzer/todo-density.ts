// analyzer: TODO/FIXME marker density for RepoNode.todoCount (V5 — CONTRACTS.md §
// "V5: TODO density" / docs/CONTRACT-repo-json.md § "TODO density").
//
// This is a plain text scan, not an AST walk -- TODO/FIXME are conventionally comment markers,
// but they carry the same signal whether they sit in a `//` line, a block comment, or (rarely) a
// string literal, and distinguishing those cases would add parser dependence for no contract
// benefit. `countTodoMarkers` is the sole producer of this signal; the caller (src/analyzer/
// index.ts) is the one that decides WHETHER to call it at all -- only for languages the analyzer
// actually parses (PARSEABLE_LANGUAGES), so an unsupported-language file gets `undefined`
// (never fabricate a 0 for a file nobody scanned).

// Whole-word match only, so an identifier like `TODOItem` or `FIXMEHandler` doesn't inflate the
// count -- these are marker CONVENTIONS (typically uppercase, often followed by ":" or "("), not
// substrings.
const TODO_MARKER_RE = /\b(?:TODO|FIXME)\b/g;

/** Count of TODO/FIXME marker occurrences in `source`. A real measurement -- 0 is a legitimate
 *  answer for a file with no markers, distinct from the caller never invoking this at all. */
export function countTodoMarkers(source: string): number {
  const matches = source.match(TODO_MARKER_RE);
  return matches ? matches.length : 0;
}
