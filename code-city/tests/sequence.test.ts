// src/compiler/sequence.ts -- the pure sequence-loader half of Lane F (timeline scrub,
// PROJECT_IDEA.md Phase 4). Load-bearing properties: month ordering is a pure function of the
// input (no reliance on directory-listing order), gaps are detected correctly and ONLY where a
// real calendar month is skipped, and validateTimelineManifest gates the same invariants a
// renderer will rely on (ascending order, no duplicate months, first entry never a gap).

import { describe, expect, it } from "vitest";
import {
  buildTimelineManifest,
  isCalendarConsecutive,
  parseSnapshotMonth,
  type TimelineManifestInput,
} from "../src/compiler/sequence.ts";
import { validateTimelineManifest } from "../src/types.ts";

describe("parseSnapshotMonth", () => {
  it("extracts the month key from bin/snapshots.ts's repo-YYYY-MM.json naming", () => {
    expect(parseSnapshotMonth("repo-2026-01.json")).toBe("2026-01");
    expect(parseSnapshotMonth("repo-2019-12.json")).toBe("2019-12");
  });

  it("returns null for anything that isn't that exact shape", () => {
    expect(parseSnapshotMonth("timeline.json")).toBeNull();
    expect(parseSnapshotMonth("city-2026-01.json")).toBeNull();
    expect(parseSnapshotMonth("repo-2026-1.json")).toBeNull();
    expect(parseSnapshotMonth("repo-2026-01.json.bak")).toBeNull();
  });
});

describe("isCalendarConsecutive", () => {
  it("is true for adjacent months within a year", () => {
    expect(isCalendarConsecutive("2026-01", "2026-02")).toBe(true);
  });

  it("is true across a year boundary", () => {
    expect(isCalendarConsecutive("2025-12", "2026-01")).toBe(true);
  });

  it("is false when a month is skipped", () => {
    expect(isCalendarConsecutive("2026-01", "2026-03")).toBe(false);
  });

  it("is false (not true) when reversed -- direction matters", () => {
    expect(isCalendarConsecutive("2026-02", "2026-01")).toBe(false);
  });
});

function entry(month: string, overrides: Partial<TimelineManifestInput> = {}): TimelineManifestInput {
  return {
    month,
    date: `${month}-15T00:00:00.000Z`,
    cityFile: `city-${month}.json`,
    buildingCount: 10,
    districtCount: 2,
    ...overrides,
  };
}

describe("buildTimelineManifest", () => {
  it("sorts entries by month regardless of input order", () => {
    const manifest = buildTimelineManifest([entry("2026-03"), entry("2026-01"), entry("2026-02")]);
    expect(manifest.entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("is deterministic -- the same (unordered) input always produces the same output", () => {
    const inputA = [entry("2026-05"), entry("2026-01"), entry("2026-03")];
    const inputB = [entry("2026-01"), entry("2026-03"), entry("2026-05")];
    expect(buildTimelineManifest(inputA)).toEqual(buildTimelineManifest(inputB));
  });

  it("marks the first entry gapBefore: false unconditionally", () => {
    const manifest = buildTimelineManifest([entry("2026-05")]);
    expect(manifest.entries[0].gapBefore).toBe(false);
  });

  it("marks gapBefore true only where a calendar month was actually skipped", () => {
    const manifest = buildTimelineManifest([entry("2026-01"), entry("2026-02"), entry("2026-05")]);
    expect(manifest.entries.map((e) => e.gapBefore)).toEqual([false, false, true]);
  });

  it("never marks a gap between two genuinely consecutive months", () => {
    const manifest = buildTimelineManifest([entry("2025-11"), entry("2025-12"), entry("2026-01")]);
    expect(manifest.entries.every((e) => !e.gapBefore)).toBe(true);
  });

  it("throws on a duplicate month rather than silently dropping one", () => {
    expect(() => buildTimelineManifest([entry("2026-01"), entry("2026-01")])).toThrow(/duplicate/i);
  });

  it("carries buildingCount/districtCount/cityFile/date through unchanged", () => {
    const manifest = buildTimelineManifest([entry("2026-01", { buildingCount: 42, districtCount: 5 })]);
    expect(manifest.entries[0]).toMatchObject({
      cityFile: "city-2026-01.json",
      buildingCount: 42,
      districtCount: 5,
    });
  });
});

describe("validateTimelineManifest", () => {
  it("accepts a manifest built by buildTimelineManifest", () => {
    const manifest = buildTimelineManifest([entry("2026-01"), entry("2026-02"), entry("2026-05")]);
    expect(validateTimelineManifest(manifest)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a non-object", () => {
    expect(validateTimelineManifest(null).ok).toBe(false);
    expect(validateTimelineManifest("nope").ok).toBe(false);
  });

  it("rejects entries out of ascending order", () => {
    const manifest = {
      entries: [
        { month: "2026-02", date: "2026-02-01T00:00:00.000Z", cityFile: "a.json", buildingCount: 1, districtCount: 1, gapBefore: false },
        { month: "2026-01", date: "2026-01-01T00:00:00.000Z", cityFile: "b.json", buildingCount: 1, districtCount: 1, gapBefore: false },
      ],
    };
    const result = validateTimelineManifest(manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /ascending/.test(e))).toBe(true);
  });

  it("rejects a duplicate month", () => {
    const manifest = {
      entries: [
        { month: "2026-01", date: "2026-01-01T00:00:00.000Z", cityFile: "a.json", buildingCount: 1, districtCount: 1, gapBefore: false },
        { month: "2026-01", date: "2026-01-15T00:00:00.000Z", cityFile: "b.json", buildingCount: 1, districtCount: 1, gapBefore: false },
      ],
    };
    expect(validateTimelineManifest(manifest).ok).toBe(false);
  });

  it("rejects a first entry with gapBefore: true", () => {
    const manifest = {
      entries: [{ month: "2026-01", date: "2026-01-01T00:00:00.000Z", cityFile: "a.json", buildingCount: 1, districtCount: 1, gapBefore: true }],
    };
    expect(validateTimelineManifest(manifest).ok).toBe(false);
  });

  it("rejects a malformed month key", () => {
    const manifest = {
      entries: [{ month: "2026-1", date: "2026-01-01T00:00:00.000Z", cityFile: "a.json", buildingCount: 1, districtCount: 1, gapBefore: false }],
    };
    expect(validateTimelineManifest(manifest).ok).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    const manifest = {
      entries: [{ month: "2026-01", date: "not-a-date", cityFile: "a.json", buildingCount: 1, districtCount: 1, gapBefore: false }],
    };
    expect(validateTimelineManifest(manifest).ok).toBe(false);
  });
});
