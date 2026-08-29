// Code City — timeline scrub entry point (PROJECT_IDEA.md Phase 4/§5.2, "git time travel").
//
// A second, additive renderer over the SAME city.json contract (DESIGN.md: "a second renderer...
// can consume the same city.json without knowing compileCity exists") -- this page never touches
// src/compiler, only src/renderer. It loads a `timeline.json` manifest (src/types.ts
// TimelineManifest, produced by bin/sequence.ts) plus every CityModel it names, falling back to
// the committed mock sequence with a disclosed "MOCK DATA" badge when timeline.json doesn't exist
// yet -- same discipline as src/main.ts's loadCity().

import type { CityModel, TimelineManifest } from "./types.ts";
import { validateCity, validateTimelineManifest } from "./types.ts";
import { createScene } from "./renderer/scene.ts";
import { buildTimeline, type TimelineSnapshot } from "./renderer/timeline.ts";
import { setupLensControl, setupTimelineControl } from "./renderer/ui.ts";
import { DEFAULT_LENS, type LensId } from "./renderer/lenses.ts";

interface TimelineTestBridge {
  ready: boolean;
  snapshotCount(): number;
  setPosition(globalT: number): void;
  currentDate(): string;
  isInGap(): boolean;
  setLens(lens: LensId): void;
  currentLens(): LensId;
}

declare global {
  interface Window {
    __timelineTest?: TimelineTestBridge;
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const res = await fetch(path).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as T;
}

async function loadSequence(): Promise<{ snapshots: TimelineSnapshot[]; usedMock: boolean }> {
  let manifest = await fetchJson<TimelineManifest>("/timeline.json");
  let usedMock = false;
  if (!manifest) {
    manifest = await fetchJson<TimelineManifest>("/mock-timeline.json");
    usedMock = true;
    if (!manifest) throw new Error("Failed to load both /timeline.json and /mock-timeline.json");
  }

  const manifestCheck = validateTimelineManifest(manifest);
  if (!manifestCheck.ok) {
    throw new Error(`invalid TimelineManifest:\n${manifestCheck.errors.join("\n")}`);
  }

  const snapshots: TimelineSnapshot[] = [];
  for (const entry of manifest.entries) {
    const city = await fetchJson<CityModel>(`/${entry.cityFile}`);
    if (!city) throw new Error(`Failed to load city snapshot ${entry.cityFile}`);
    const cityCheck = validateCity(city);
    if (!cityCheck.ok) {
      throw new Error(`invalid CityModel for ${entry.month} (${entry.cityFile}):\n${cityCheck.errors.join("\n")}`);
    }
    snapshots.push({ month: entry.month, date: entry.date, city, gapBefore: entry.gapBefore });
  }

  return { snapshots, usedMock };
}

function showMockBadge(container: HTMLElement): void {
  const badge = document.createElement("div");
  badge.className = "cc-mock-badge";
  badge.textContent = "MOCK DATA";
  container.appendChild(badge);
}

function showFatalError(container: HTMLElement, message: string): void {
  const el = document.createElement("div");
  el.className = "cc-fatal-error";
  el.textContent = `Code City timeline failed to load: ${message}`;
  container.appendChild(el);
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("missing #app container");

  let snapshots: TimelineSnapshot[];
  let usedMock: boolean;
  try {
    ({ snapshots, usedMock } = await loadSequence());
  } catch (err) {
    showFatalError(app, err instanceof Error ? err.message : String(err));
    throw err;
  }

  if (usedMock) showMockBadge(app);

  // Camera framing (scene.ts) is computed once from a single CityModel -- fit it to the FIRST
  // snapshot. Framing is not recomputed as the scrub moves (same discipline scene.ts already
  // documents for window resize: it must not fight wherever the viewer has already navigated to).
  const sceneHandle = createScene(app, snapshots[0].city);
  const { scene, controls } = sceneHandle;

  const timelineHandle = buildTimeline(snapshots, DEFAULT_LENS);
  scene.add(timelineHandle.group);

  const lensControl = setupLensControl({
    container: app,
    initialLens: DEFAULT_LENS,
    onSelect: (lens) => timelineHandle.setLens(lens),
  });

  const timelineControl = setupTimelineControl({
    container: app,
    entries: snapshots.map((s) => ({ month: s.month, date: s.date })),
    onScrub: (globalT) => {
      timelineHandle.setPosition(globalT);
      timelineControl.setReadout(timelineHandle.currentDate(), timelineHandle.isInGap());
    },
  });
  // Initial readout for position 0, matching the initial setPosition(0) buildTimeline() already
  // applied internally -- keeps the on-screen date in sync with what's rendered on first paint,
  // not just after the first drag.
  timelineHandle.setPosition(0);
  timelineControl.setReadout(timelineHandle.currentDate(), timelineHandle.isInGap());

  window.addEventListener("resize", () => sceneHandle.handleResize());

  function tick(): void {
    controls.update();
    sceneHandle.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.__timelineTest = {
    ready: true,
    snapshotCount(): number {
      return snapshots.length;
    },
    setPosition(globalT: number): void {
      timelineHandle.setPosition(globalT);
      timelineControl.setPosition(globalT);
      timelineControl.setReadout(timelineHandle.currentDate(), timelineHandle.isInGap());
    },
    currentDate(): string {
      return timelineHandle.currentDate();
    },
    isInGap(): boolean {
      return timelineHandle.isInGap();
    },
    setLens(lens: LensId): void {
      timelineHandle.setLens(lens);
      lensControl.setActiveLens(lens);
    },
    currentLens(): LensId {
      return timelineHandle.currentLens();
    },
  };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
