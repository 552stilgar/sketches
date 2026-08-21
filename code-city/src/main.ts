// Code City — renderer entry point.
//
// Loads city.json (falling back to the committed mock with a disclosed "MOCK DATA" badge when
// city.json doesn't exist yet — the real compiler output, per docs/CONTRACT-city-json.md),
// validates it, and wires the Three.js explorer. Never renders unvalidated data.

import type { CityModel } from "./types.ts";
import { validateCity } from "./types.ts";
import { createScene } from "./renderer/scene.ts";
import { buildBuildings, updateDistrictLabelFade } from "./renderer/buildings.ts";
import { buildRoads } from "./renderer/roads.ts";
import { setupUI } from "./renderer/ui.ts";

interface TestBridge {
  ready: boolean;
  buildingCount(): number;
  clickBuilding(id: string): void;
  overlayText(): string | null;
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

  const sceneHandle = createScene(app);
  const { scene, camera, renderer, controls } = sceneHandle;

  const buildingsHandle = buildBuildings(city);
  for (const mesh of buildingsHandle.meshes) scene.add(mesh);
  scene.add(buildingsHandle.districtGroup);

  const roads = buildRoads(city, buildingsHandle.buildingCenter);
  scene.add(roads);

  const ui = setupUI({
    container: app,
    domElement: renderer.domElement,
    camera,
    raycastTargets: buildingsHandle.meshes,
    resolveBuildingId: buildingsHandle.resolveBuildingId,
    buildingById: buildingsHandle.buildingById,
  });

  window.addEventListener("resize", () => sceneHandle.handleResize());

  function tick(): void {
    controls.update();
    updateDistrictLabelFade(buildingsHandle.districtGroup, camera);
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
  };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
