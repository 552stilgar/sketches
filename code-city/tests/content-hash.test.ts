// RED — hashFileContent (src/analyzer/content-hash.ts) throws NotImplemented today. Turns GREEN
// once the V4 analyzer lane implements it (CONTRACTS.md § "V4: datastores + clone identity", D3:
// EXACT CONTENT HASH ONLY).
//
// These assertions are derived directly from D3, not placeholders:
//   - the digest is sha256 over raw bytes, verified against node:crypto's own sha256 (no
//     project-invented hash algorithm, no truncation)
//   - identical bytes -> identical hash (determinism, required for identityLink grouping to be
//     meaningful at all)
//   - a single differing byte -> a different hash (no accidental collision-prone shortcut, e.g.
//     hashing only a length+prefix)
//   - a string and the identical bytes as a Uint8Array hash the same -- the two accepted input
//     forms must not diverge
//   - NO NORMALIZATION: trailing-whitespace/newline differences must still hash differently.
//     Near-duplicate detection is explicitly out of scope (CRYSKNIFE's job, not this project's) --
//     D3 in CONTRACTS.md forbids fuzzing here.
//   - output shape is lowercase hex, exactly 64 characters (sha256 digest length)

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashFileContent } from "../src/analyzer/content-hash.ts";

function nodeSha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

describe("hashFileContent (RED until the V4 analyzer lane lands)", () => {
  it("matches node:crypto's own sha256 hex digest for a string input", () => {
    const content = "export function add(a: number, b: number): number {\n  return a + b;\n}\n";
    expect(hashFileContent(content)).toBe(nodeSha256Hex(content));
  });

  it("is deterministic: hashing the same content twice yields the same digest", () => {
    const content = "same content, hashed twice";
    expect(hashFileContent(content)).toBe(hashFileContent(content));
  });

  it("a single differing byte produces a different digest (no collision shortcut)", () => {
    const a = hashFileContent("const x = 1;\n");
    const b = hashFileContent("const x = 2;\n");
    expect(a).not.toBe(b);
  });

  it("a string and its identical UTF-8 bytes as a Uint8Array hash the same", () => {
    const content = "vendor/kernel/logger.ts byte-identical clone fixture\n";
    const bytes = new TextEncoder().encode(content);
    expect(hashFileContent(bytes)).toBe(hashFileContent(content));
  });

  it("never normalizes -- a trailing-newline difference changes the hash (D3: no fuzzing)", () => {
    const withNewline = hashFileContent("line one\nline two\n");
    const withoutNewline = hashFileContent("line one\nline two");
    expect(withNewline).not.toBe(withoutNewline);
  });

  it("returns a lowercase 64-character hex string", () => {
    const digest = hashFileContent("anything");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
