// compiler: monthly repo.json snapshots -> a scrubbable TIMELINE MANIFEST (PROJECT_IDEA.md
// Phase 4/§5.2, "renderer half" — this module is the small piece of that lane that lives on the
// compiler side of the boundary: it never touches THREE.js or the DOM, and it never re-derives
// compileCity's own logic (bin/sequence.ts calls the real compileCity per snapshot; this module
// only orders/labels the results it gets back).
//
// Pure, tested, no I/O -- same discipline as src/compiler/index.ts (DESIGN.md's determinism
// section): given the same set of {month, date, cityFile} entries, buildTimelineManifest() always
// produces the same TimelineManifest, regardless of the order those entries were discovered on
// disk (readdirSync gives no ordering guarantee across platforms).
//
// Never-fabricate (constraint 2, extended to time): bin/snapshots.ts already SKIPS a month with no
// qualifying commit rather than emitting an empty/interpolated graph for it (src/analyzer/
// snapshots.ts). The result is a sequence with real gaps -- a repo that didn't exist yet, or had a
// silent month. This module's only job re: gaps is to make each one EXPLICIT (`gapBefore: true`)
// on the entry that follows it, so a renderer can show "no data here" instead of a scrubber that
// silently glides across a missing period as if it were continuous history.

import { compareCodepoints } from "../util/compare.ts";
import type { TimelineEntry, TimelineManifest } from "../types.ts";

const SNAPSHOT_FILENAME_RE = /^repo-(\d{4}-\d{2})\.json$/;

/** Extracts the "YYYY-MM" month key from a `repo-YYYY-MM.json` filename (bin/snapshots.ts's
 *  naming convention). Returns null for anything else -- callers filter a directory listing that
 *  may contain other files. */
export function parseSnapshotMonth(filename: string): string | null {
  const match = SNAPSHOT_FILENAME_RE.exec(filename);
  return match ? match[1] : null;
}

/** True if `b` is the calendar month immediately following `a` -- both "YYYY-MM". Pure string/int
 *  arithmetic, no Date object (avoids any timezone-dependent rollover at month boundaries). */
export function isCalendarConsecutive(a: string, b: string): boolean {
  const am = parseMonthKey(a);
  const bm = parseMonthKey(b);
  return bm.totalMonths - am.totalMonths === 1;
}

function parseMonthKey(monthKey: string): { totalMonths: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`invalid month key: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-indexed
  return { totalMonths: year * 12 + (month - 1) };
}

export interface TimelineManifestInput {
  month: string;
  date: string;
  cityFile: string;
  buildingCount: number;
  districtCount: number;
}

/**
 * Orders `entries` by month (ascending) and marks each entry that follows a calendar gap. Throws
 * on a duplicate month (a producer bug -- two snapshots claiming the same month is not a legal
 * sequence) rather than silently picking one, per Failure Discipline (never silently degrade).
 */
export function buildTimelineManifest(entries: readonly TimelineManifestInput[]): TimelineManifest {
  const sorted = [...entries].sort((a, b) => compareCodepoints(a.month, b.month));

  const seen = new Set<string>();
  for (const e of sorted) {
    if (seen.has(e.month)) {
      throw new Error(`duplicate month in timeline sequence: "${e.month}"`);
    }
    seen.add(e.month);
  }

  const result: TimelineEntry[] = sorted.map((e, i) => ({
    month: e.month,
    date: e.date,
    cityFile: e.cityFile,
    buildingCount: e.buildingCount,
    districtCount: e.districtCount,
    // The first entry has nothing before it to be a gap from -- it is simply where the timeline
    // starts, never itself "a gap".
    gapBefore: i === 0 ? false : !isCalendarConsecutive(sorted[i - 1].month, e.month),
  }));

  return { entries: result };
}
