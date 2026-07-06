// Role layer (brief §6 layer 5, structural half / §4.3): seeded role
// selection + per-role distribution tables. Role is a NEW LEADING draw off
// the top-level structure stream (see structure.ts header for the landmine
// note) — everything downstream shifts, which is expected and intentional.

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { ROLE_PROFILES, structure } from "../src/gen/structure";
import type { Role } from "../src/gen/types";

const ROLES: readonly Role[] = ["corvette", "frigate", "hauler"];
const N = 40;
const SEEDS = Array.from({ length: N }, (_, i) => derive(0x5eed, "roles-suite", i));

describe("role selection", () => {
  it("role is always a member of the enumerated Role type", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      expect(ROLES).toContain(spec.role);
    }
  });

  it("per-role segment/mid counts fall within that role's distribution table", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const midCount = spec.segments.filter((s) => s.type === "mid").length;
      const [midLo, midHi] = ROLE_PROFILES[spec.role].midRepeats;
      expect(midCount).toBeGreaterThanOrEqual(midLo);
      expect(midCount).toBeLessThanOrEqual(midHi);
      // fixed spine (engine, drive, hull, nose) + midCount mids
      expect(spec.segments.length).toBe(midCount + 4);
    }
  });

  it("all 3 roles appear across a seed sweep", () => {
    const seen = new Set<Role>();
    for (const seed of SEEDS) {
      seen.add(structure(derive(seed, "structure")).role);
    }
    expect(seen.size).toBe(3);
  });

  it("role ordering holds: corvette <= frigate <= hauler on mid-repeat bounds", () => {
    const { corvette, frigate, hauler } = ROLE_PROFILES;
    expect(corvette.midRepeats[0]).toBeLessThanOrEqual(frigate.midRepeats[0]);
    expect(frigate.midRepeats[1]).toBeLessThanOrEqual(hauler.midRepeats[1]);
  });

  it("weapon socket fill is high for corvette, low for hauler", () => {
    const countsByRole: Record<Role, number[]> = { corvette: [], frigate: [], hauler: [] };
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const hull = spec.segments.find((s) => s.type === "hull")!;
      const weaponSockets = hull.sockets.filter((s) => s.kind === "lateralPair");
      countsByRole[spec.role].push(weaponSockets.length);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(countsByRole.corvette)).toBeGreaterThanOrEqual(mean(countsByRole.frigate));
    expect(mean(countsByRole.frigate)).toBeGreaterThanOrEqual(mean(countsByRole.hauler));
  });

  it("same structure sub-seed -> same role + structure every time (determinism)", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const seedS = derive(seed, "structure");
      const a = structure(seedS);
      const b = structure(seedS);
      expect(a).toEqual(b);
      expect(a.role).toBe(b.role);
    }
  });
});
