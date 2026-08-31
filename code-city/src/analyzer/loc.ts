// analyzer: the ONE definition of "how many lines is this source text".
//
// Extracted so the live-file path (src/analyzer/index.ts, counting the working-tree bytes of a
// file that exists at HEAD) and the ruins path (src/analyzer/ruins.ts, counting the blob bytes of
// a file at the commit that deleted it) cannot drift into two different notions of LOC. A ruin's
// `lastLoc` is only comparable to a live node's `loc` if both are measured the same way; two
// copies of this three-line expression would eventually stop being the same way.

/** Line count of `source`: 0 for empty text, and a single trailing newline does not add a line. */
export function countLines(source: string): number {
  if (source.length === 0) return 0;
  return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}
