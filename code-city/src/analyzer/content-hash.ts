// analyzer: exact content hash for CLONE IDENTITY detection (V4 contract D3 — CONTRACTS.md §
// "V4: datastores + clone identity").
//
// EXACT CONTENT HASH ONLY. Clone detection is sha256 over a file's raw bytes -- byte-identical
// or nothing. Near-duplicate detection is a judgment call and would smuggle fabrication back in
// through the side door (PROJECT_IDEA.md 5.5, constraint 2, "never fabricate"): CRYSKNIFE, a
// separate VPS tool, already does near-duplicate detection as an audit -- code-city RENDERS
// certainty (an IdentityLink, src/types.ts), it does not estimate similarity. This function must
// never normalize whitespace, strip comments, or otherwise transform the input before hashing.
//
// This is the sole source of RepoNode.contentHash (src/types.ts).
//
// Implementation lane fills this in (V4 lane, analyzer side).

import { createHash } from "node:crypto";

/** Lowercase hex sha256 digest of `bytes`, exactly as given -- no normalization. */
export function hashFileContent(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
