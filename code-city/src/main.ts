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
import { setupUI } from "./renderer/ui.ts";

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
  /** The camera framing computed for this city on load (src/renderer/scene.ts) -- bounds, orbit
   * target, and camera world position -- so a headless check can assert the first frame is
   * actually looking at the city's content instead of a fixed offset (measured defect,
   * 2026-08-28: a fixed camera spawned either near-overhead-and-too-close or inside a block,
   * depending on the city's own building-height distribution). Not recomputed on resize -- this
   * is the load-time framing, matching SceneHandle.framing's own doc. */
  cameraFraming(): { bounds: CityBounds; target: CameraFraming["target"]; position: CameraFraming["position"] };
}

declare global {
  interface Window {
    __test?: TestBridge;
  }
}

async function loadCity(): Promise<{ city: CityModel; usedMock: boolean }> {
  const primary = await fetch("/city.json").catch(() => null);
  if (primary && primary.ok) {
    return { city: (await primary.json()) as CityModel, usedMock: false };
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
  try {
    ({ city, usedMock } = await loadCity());
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

  const sceneHandle = createScene(app, city);
  const { scene, camera, renderer, controls } = sceneHandle;

  const buildingsHandle = buildBuildings(city);
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
  scene.add(buildLandmarks(city));
  scene.add(buildTethers(city, buildingsHandle.buildingCenter));

  const ui = setupUI({
    container: app,
    domElement: renderer.domElement,
    camera,
    raycastTargets: buildingsHandle.meshes,
    resolveBuildingId: buildingsHandle.resolveBuildingId,
    buildingById: buildingsHandle.buildingById,
  });

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
    cameraFraming() {
      return {
        bounds: sceneHandle.bounds,
        target: sceneHandle.framing.target,
        position: sceneHandle.framing.position,
      };
    },
  };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
