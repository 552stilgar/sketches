// renderer: click-to-inspect UI — raycast a building, show an HTML overlay with its id + metrics.
// ESC or a click that misses every building closes the overlay.

import * as THREE from "three";
import type { Building } from "../types.ts";

export interface UIHandle {
  /** Opens the metrics overlay for a building id (no-op + no throw if the id is unknown). */
  openOverlay(buildingId: string): void;
  closeOverlay(): void;
  isOpen(): boolean;
  /** Plain-text contents of the open overlay, or null when closed. Used by window.__test. */
  overlayText(): string | null;
  dispose(): void;
}

export interface SetupUIParams {
  container: HTMLElement;
  domElement: HTMLElement;
  camera: THREE.Camera;
  raycastTargets: THREE.Object3D[];
  resolveBuildingId: (mesh: THREE.Object3D, instanceId: number | undefined) => string | null;
  buildingById: Map<string, Building>;
}

function formatOverlay(id: string, b: Building): string {
  return [
    `Building: ${id}`,
    `Style: ${b.style}`,
    `LOC: ${b.metrics.loc}`,
    `Complexity: ${b.metrics.complexity}`,
    `Churn: ${b.metrics.churn.toFixed(2)}`,
  ].join("\n");
}

export function setupUI(params: SetupUIParams): UIHandle {
  const { container, domElement, camera, raycastTargets, resolveBuildingId, buildingById } = params;

  const overlay = document.createElement("div");
  overlay.className = "cc-overlay";
  overlay.style.display = "none";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-live", "polite");

  const closeBtn = document.createElement("button");
  closeBtn.className = "cc-overlay-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");

  const body = document.createElement("pre");
  body.className = "cc-overlay-body";

  overlay.appendChild(closeBtn);
  overlay.appendChild(body);
  container.appendChild(overlay);

  let openId: string | null = null;

  function openOverlay(buildingId: string): void {
    const b = buildingById.get(buildingId);
    if (!b) return;
    openId = buildingId;
    body.textContent = formatOverlay(buildingId, b);
    overlay.style.display = "flex";
  }

  function closeOverlay(): void {
    openId = null;
    overlay.style.display = "none";
  }

  function isOpen(): boolean {
    return openId !== null;
  }

  function overlayText(): string | null {
    return openId === null ? null : body.textContent;
  }

  // Click-vs-drag disambiguation: OrbitControls drags fire pointerdown/pointerup too, so only
  // treat a release as a "click" when it didn't move much from where it started.
  let downX = 0;
  let downY = 0;
  const DRAG_THRESHOLD_PX = 6;

  function onPointerDown(ev: PointerEvent): void {
    downX = ev.clientX;
    downY = ev.clientY;
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function onPointerUp(ev: PointerEvent): void {
    const dx = ev.clientX - downX;
    const dy = ev.clientY - downY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) return; // was a drag, not a click

    const rect = domElement.getBoundingClientRect();
    pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(raycastTargets, false);
    if (hits.length === 0) {
      closeOverlay();
      return;
    }

    const hit = hits[0];
    const id = resolveBuildingId(hit.object, hit.instanceId);
    if (id) {
      openOverlay(id);
    } else {
      closeOverlay();
    }
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") closeOverlay();
  }

  function onCloseClick(ev: MouseEvent): void {
    ev.stopPropagation();
    closeOverlay();
  }

  // Prevent clicks inside the overlay (e.g. selecting metric text) from being read as a
  // click-away by anything listening above it.
  function onOverlayClick(ev: MouseEvent): void {
    ev.stopPropagation();
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  closeBtn.addEventListener("click", onCloseClick);
  overlay.addEventListener("click", onOverlayClick);

  function dispose(): void {
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    closeBtn.removeEventListener("click", onCloseClick);
    overlay.removeEventListener("click", onOverlayClick);
    overlay.remove();
  }

  return { openOverlay, closeOverlay, isOpen, overlayText, dispose };
}
