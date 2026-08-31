// Code City — renderer entry point.
//
// Loads city.json (falling back to the committed mock with a disclosed "MOCK DATA" badge when
// city.json doesn't exist yet — the real compiler output, per docs/CONTRACT-city-json.md),
// validates it, and wires the Three.js explorer. Never renders unvalidated data.

import type { CityModel } from "./types.ts";
import { validateCity } from "./types.ts";
import { createScene, type CameraFraming, type CityBounds } from "./renderer/scene.ts";
import { buildBuildings, updateDistrictLabelFade } from "./renderer/buildings.ts";
import { buildRoads } from "./renderer/roads.ts";
import { buildLandmarks } from "./renderer/landmarks.ts";
import { buildTethers } from "./renderer/tethers.ts";
import { selectCraneSites, selectScaffoldSites, buildProps } from "./renderer/props.ts";
import { setupUI, setupLensControl, setupLayerControl } from "./renderer/ui.ts";
import { DEFAULT_LENS, computeCityLensRanks, type LensId } from "./renderer/lenses.ts";
import { resolveMassingScale } from "./massing-resolution.ts";

interface TestBridge {
  ready: boolean;
  buildingCount(): number;
  clickBuilding(id: string): void;
  overlayText(): string | null;
  /** Roads currently receiving animated flow (resolvable-endpoint roads; V3 §5.5). */
  animatedRoadCount(): number;
  /** FLOW_PROVENANCE_LABEL text for this wave's traffic -- always "structural" today. */
  flowProvenanceLabel(): string;
  /** Current dash offset of the road at flat index `index` (see RoadsHandle.dashOffsetOf), or
   * null if out of range. Lets a headless check assert the offset actually advances over time. */
  roadDashOffset(index: number): number | null;
  /** city.landmarks.length -- V4 (CONTRACTS.md § "V4: datastores + clone identity"). Reads the
   * loaded CityModel directly, same discipline as buildingCount() above: a data-level count, not
   * "how many rendered successfully" (buildLandmarks failing under the temporary scaffolding
   * try/catch does not change this number). */
  landmarkCount(): number;
  /** city.identityLinks.length -- V4. `identityLinks` is legal-absent on a pre-V4 city.json
   * (src/types.ts doc comment on CityModel), so this defaults a missing array to 0 rather than
   * throwing. */
  identityLinkCount(): number;
  /** Number of crane props actually built this frame (props.ts selectCraneSites output length) --
   *  a rendering-derived count, deliberately distinct from a city.json field, since props are not
   *  part of CityModel at all (they're a pure view-layer overlay computed from
   *  city.buildings + churn ranks, see src/renderer/props.ts). */
  craneCount(): number;
  /** Number of scaffold props actually built this frame (props.ts selectScaffoldSites output
   *  length) -- same posture as craneCount() above, a rendering-derived count keyed off
   *  city.buildings + metrics.age, never part of CityModel itself. */
  scaffoldCount(): number;
  /** The camera framing computed for this city on load (src/renderer/scene.ts) -- bounds, orbit
   * target, and camera world position -- so a headless check can assert the first frame is
   * actually looking at the city's content instead of a fixed offset (measured defect,
   * 2026-08-28: a fixed camera spawned either near-overhead-and-too-close or inside a block,
   * depending on the city's own building-height distribution). Not recomputed on resize -- this
   * is the load-time framing, matching SceneHandle.framing's own doc. */
  cameraFraming(): { bounds: CityBounds; target: CameraFraming["target"]; position: CameraFraming["position"] };
  /** City lenses (Phase 5.3) -- lets a headless check drive the same switch the on-screen lens
   * control does, and read back which lens is currently active. */
  setLens(lens: LensId): void;
  currentLens(): LensId;
  /** Layer visibility (V5.1 layer control) -- drives the same toggles the on-screen buttons do.
   * `layerVisible` reads the SCENE object's flag, not the control's, so a headless check can
   * catch the control and the scene disagreeing. */
  setLayerVisible(id: string, visible: boolean): void;
  layerVisible(id: string): boolean;
  /** The city document this frame loaded (default "/city.json", or the ?city= override). */
  cityUrl(): string;
}

declare global {
  interface Window {
    __test?: TestBridge;
  }
}

/**
 * Resolves which city document to load. Defaults to "/city.json"; `?city=<path>` overrides it so
 * one build can be pointed at alternate compiler outputs (e.g. an A/B of two LOD settings) without
 * shuffling files on disk. Restricted to same-origin root-relative paths -- an absolute URL or a
 * traversal is rejected loudly rather than fetched.
 */
export function resolveCityUrl(search: string): string {
  const raw = new URLSearchParams(search).get("city");
  if (raw === null || raw === "") return "/city.json";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) {
    throw new Error(`invalid ?city= parameter: ${raw} (expected a root-relative path like /city-a.json)`);
  }
  return raw;
}

/**
 * Resolves the renderer-side massing knob (`buildings.ts` BASE_HEIGHT_SCALE_DEFAULT) from
 * `?heightScale=<number>`. Exists because that knob is what actually controls the pin-vs-block
 * silhouette -- measured on the merged mgmt trio, the median building has an aspect ratio
 * (height / footprint side) of 7.4, so no footprint change can un-needle it while height stands.
 * Omitted => the module default, unchanged. A present-but-unusable value is a loud error rather
 * than a silent fall back to 1: a viewer who typed a number must never be shown a scene that
 * quietly ignored it.
 */
export function resolveHeightScale(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("heightScale");
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 10) {
    throw new Error(`invalid ?heightScale= parameter: ${raw} (expected a number in (0, 10])`);
  }
  return value;
}

async function loadCity(cityUrl: string): Promise<{ city: CityModel; usedMock: boolean }> {
  const primary = await fetch(cityUrl).catch(() => null);
  if (primary && primary.ok) {
    return { city: (await primary.json()) as CityModel, usedMock: false };
  }

  // An explicitly requested city that doesn't load is a hard error -- silently substituting the
  // mock for a city the viewer NAMED would misattribute one repo's shape to another.
  if (cityUrl !== "/city.json") {
    throw new Error(`Failed to load requested city ${cityUrl} (status ${primary ? primary.status : "network error"})`);
  }

  // Disclosed fallback: city.json doesn't exist yet (real compiler output not built). Fall back
  // to the committed mock and surface it visibly — never a silent substitution.
  const mockRes = await fetch("/mock-city.json");
  if (!mockRes.ok) {
    throw new Error(`Failed to load both /city.json and /mock-city.json (status ${mockRes.status})`);
  }
  return { city: (await mockRes.json()) as CityModel, usedMock: true };
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
  el.textContent = `Code City failed to load: ${message}`;
  container.appendChild(el);
}

// Persistent badge naming the loaded city document and its headline counts. With `?city=` able to
// repoint the same build at different compiler outputs, "which city am I looking at" must be
// readable off the screen, not inferred from the URL bar.
function showSourceBadge(
  container: HTMLElement,
  cityUrl: string,
  city: CityModel,
  massing: { scale: number; source: "explicit" | "normalized" },
): void {
  const el = document.createElement("div");
  el.className = "cc-source-badge";
  const parts = [
    `${cityUrl} — ${city.buildings.length} buildings · ${city.roads.length} roads · ${city.identityLinks?.length ?? 0} identity links`,
  ];
  // Always shown, and always names WHICH path produced the scale -- ?heightScale= override vs.
  // normalizedHeightScale() solve (src/renderer/massing.ts). A viewer must never be unable to
  // tell whether the number on screen is what they typed or what the module computed for them.
  parts.push(`heightScale ${massing.scale} (${massing.source})`);
  el.textContent = parts.join(" · ");
  container.appendChild(el);
}

// Persistent legend disclosing flow provenance (PROJECT_IDEA.md 5.5, "never fabricate flow"): a
// viewer must never be able to read the animated roads as measured runtime traffic. Styled
// inline rather than via index.html's stylesheet -- roads.ts/main.ts/ui.ts are this lane's only
// owned paths, and index.html is not among them.
function showFlowLegend(container: HTMLElement, label: string): void {
  const el = document.createElement("div");
  el.textContent = `Flow: ${label}`;
  el.style.cssText = [
    "position:absolute",
    "left:12px",
    "bottom:12px",
    "z-index:10",
    "padding:5px 10px",
    "background:rgba(12,16,32,0.78)",
    "border:1px solid rgba(140,170,255,0.3)",
    "border-radius:4px",
    "color:#9fb0e0",
    "font-family:ui-monospace,'SFMono-Regular',monospace",
    "font-size:11px",
    "letter-spacing:0.02em",
    "pointer-events:none",
  ].join(";");
  container.appendChild(el);
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("missing #app container");

  let city: CityModel;
  let usedMock: boolean;
  let cityUrl: string;
  let heightScaleOverride: number | undefined;
  try {
    cityUrl = resolveCityUrl(window.location.search);
    heightScaleOverride = resolveHeightScale(window.location.search);
    ({ city, usedMock } = await loadCity(cityUrl));
  } catch (err) {
    showFatalError(app, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const validation = validateCity(city);
  if (!validation.ok) {
    const message = `invalid CityModel:\n${validation.errors.join("\n")}`;
    showFatalError(app, message);
    // Never render garbage — throw visibly rather than swallow the validation failure.
    throw new Error(message);
  }

  if (usedMock) showMockBadge(app);

  // Resolved AFTER validation -- normalizedHeightScale (src/renderer/massing.ts) reads
  // city.buildings and fails loudly on degenerate input, so it needs a CityModel already known
  // to be well-formed. resolveMassingScale itself decides override-vs-normalized.
  let massing: { scale: number; source: "explicit" | "normalized" };
  try {
    massing = resolveMassingScale(city, heightScaleOverride);
  } catch (err) {
    showFatalError(app, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const sceneHandle = createScene(app, city);
  const { scene, camera, renderer, controls } = sceneHandle;

  const buildingsHandle = buildBuildings(city, { heightScale: massing.scale });
  for (const mesh of buildingsHandle.meshes) scene.add(mesh);
  scene.add(buildingsHandle.districtGroup);

  const roadsHandle = buildRoads(city, buildingsHandle.buildingCenter);
  scene.add(roadsHandle.group);
  showFlowLegend(app, roadsHandle.provenanceLabel);

  // V4 (CONTRACTS.md § "V4: datastores + clone identity"): datastore landmarks + clone-identity
  // tethers. These were stubs behind a temporary try/catch while their implementation lanes were
  // in flight; both landed, so the guard is gone -- a landmark or tether build failure now fails
  // loudly like every other stage in this pipeline (Failure Discipline law) instead of being
  // swallowed into a console line.
  const landmarksGroup = buildLandmarks(city);
  const tethersHandle = buildTethers(city, buildingsHandle.buildingCenter);
  scene.add(landmarksGroup);
  scene.add(tethersHandle.group);

  // V5.2 (PROJECT_IDEA.md §5.2, first temporal overlay): churn -> crane props. Ranks are
  // recomputed here rather than threaded out of buildingsHandle -- buildBuildings already builds
  // the identical CityLensRanks internally for lens coloring (src/renderer/buildings.ts), and
  // computeCityLensRanks is a cheap, pure, one-pass function of city.buildings, so recomputing it
  // is simpler than widening BuildingsHandle's surface to leak an internal it doesn't otherwise
  // expose. selectCraneSites/buildProps are both static (props.ts header) -- built once here,
  // never touched by the render loop below.
  // heightScale must be the SAME resolved scale buildBuildings() got above -- a crane sized from
  // the raw height floats free of the skyline it belongs to (props.ts CRANE_ROOFTOP_CLEARANCE_FRACTION).
  const craneSites = selectCraneSites(city.buildings, computeCityLensRanks(city.buildings), {
    heightScale: massing.scale,
  });
  const propsHandle = buildProps(craneSites);
  scene.add(propsHandle.group);

  // V5.4 (new-file -> scaffolding props, sibling of the V5.2 crane overlay above): selected by
  // `metrics.age` directly rather than a churn-style percentile rank (see selectScaffoldSites'
  // header) -- built as its own group, separate from propsHandle, so it gets its own layer toggle
  // below rather than sharing the crane layer's on/off state. Ships OFF by default (Usul's ruling:
  // no new overlay's aesthetic gets defaulted on before it's been seen rendered) -- the "cranes"
  // layer above predates that ruling and is unaffected by it.
  const scaffoldSites = selectScaffoldSites(city.buildings, { heightScale: massing.scale });
  const scaffoldingHandle = buildProps(scaffoldSites);
  scene.add(scaffoldingHandle.group);
  scaffoldingHandle.group.visible = false;

  // Which document this frame is actually drawing. Always shown, not only under ?city= -- the
  // whole point is that a viewer comparing two cities can never mis-attribute what's on screen.
  showSourceBadge(app, cityUrl, city, massing);

  const layerGroups = new Map<string, { visible: boolean }>([
    ["roads", roadsHandle.group],
    // Read path only for tethers: setLayerVisible below is what WRITES this group's visibility,
    // so window.__test.layerVisible("tethers") still reports the real on-screen state.
    ["tethers", tethersHandle.group],
    ["landmarks", landmarksGroup],
    ["cranes", propsHandle.group],
    ["scaffolding", scaffoldingHandle.group],
  ]);
  const layerControl = setupLayerControl({
    container: app,
    layers: [
      { id: "roads", label: "Roads", initial: true },
      { id: "tethers", label: "Tethers", initial: true },
      { id: "landmarks", label: "Landmarks", initial: true },
      { id: "cranes", label: "Cranes", initial: true },
      // OFF by default (Usul's ruling, V5.4) -- see scaffoldingHandle's own comment above.
      { id: "scaffolding", label: "Scaffolding", initial: false },
    ],
    onToggle: (id, visible) => {
      // Tethers own their visibility through the V5.1 Lane D handle rather than a raw
      // Group.visible flip, so the layer toggle and the selection-scoped emphasis stay in
      // agreement about what is on screen instead of fighting over the same property.
      if (id === "tethers") {
        tethersHandle.setLayerVisible(visible);
        return;
      }
      const group = layerGroups.get(id);
      if (group) group.visible = visible;
    },
  });

  const ui = setupUI({
    container: app,
    domElement: renderer.domElement,
    camera,
    raycastTargets: buildingsHandle.meshes,
    resolveBuildingId: buildingsHandle.resolveBuildingId,
    buildingById: buildingsHandle.buildingById,
    // V5.1 Lane D: the click-to-inspect selection IS the tether selection scope -- no separate
    // raycast, no separate notion of "selected building". Deselecting (null) restores the
    // pre-Lane-D all-emphasized default; selecting a building with no clone group is a no-op
    // inside setSelectedBuilding itself (tethers.ts), not handled here.
    onSelectionChange: (buildingId) => tethersHandle.setSelectedBuilding(buildingId),
  });

  const lensControl = setupLensControl({
    container: app,
    initialLens: DEFAULT_LENS,
    onSelect: (lens) => buildingsHandle.setLens(lens),
  });

  // V5.1 Lane D's "Tethers" layer toggle is NOT a second panel: lane D branched from bc21543,
  // before 53ad971 shipped the roads/tethers/landmarks layer control, so it built its own. The
  // shipped panel above is the surviving one and already carries the Tethers row -- it routes
  // that row through tethersHandle.setLayerVisible, keeping the toggle independent of the
  // selection-scoped emphasis exactly as lane D specified (hiding the layer never resets which
  // building is selected).

  window.addEventListener("resize", () => sceneHandle.handleResize());

  // The renderer's own clock (PROJECT_IDEA.md 3.2/5.5): elapsed seconds since first frame, never
  // read by anything upstream of this file. roadsHandle.updateFlow() is the only consumer.
  const clockStart = performance.now();

  function tick(): void {
    const elapsedSeconds = (performance.now() - clockStart) / 1000;
    controls.update();
    updateDistrictLabelFade(buildingsHandle.districtGroup, camera);
    roadsHandle.updateFlow(elapsedSeconds);
    sceneHandle.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.__test = {
    ready: true,
    buildingCount(): number {
      return city.buildings.length;
    },
    clickBuilding(id: string): void {
      ui.openOverlay(id);
    },
    overlayText(): string | null {
      return ui.overlayText();
    },
    animatedRoadCount(): number {
      return roadsHandle.animatedRoadCount;
    },
    flowProvenanceLabel(): string {
      return roadsHandle.provenanceLabel;
    },
    roadDashOffset(index: number): number | null {
      return roadsHandle.dashOffsetOf(index);
    },
    landmarkCount(): number {
      return city.landmarks.length;
    },
    identityLinkCount(): number {
      return city.identityLinks?.length ?? 0;
    },
    craneCount(): number {
      return propsHandle.count;
    },
    scaffoldCount(): number {
      return scaffoldingHandle.count;
    },
    cameraFraming() {
      return {
        bounds: sceneHandle.bounds,
        target: sceneHandle.framing.target,
        position: sceneHandle.framing.position,
      };
    },
    setLens(lens: LensId): void {
      buildingsHandle.setLens(lens);
      lensControl.setActiveLens(lens);
    },
    currentLens(): LensId {
      return buildingsHandle.currentLens();
    },
    setLayerVisible(id: string, visible: boolean): void {
      layerControl.setVisible(id, visible);
    },
    layerVisible(id: string): boolean {
      const group = layerGroups.get(id);
      return group ? group.visible : false;
    },
    cityUrl(): string {
      return cityUrl;
    },
  };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
