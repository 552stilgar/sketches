// renderer: click-to-inspect UI — raycast a building, show an HTML overlay with its id + metrics.
// ESC or a click that misses every building closes the overlay.
//
// Also owns the LENS CONTROL (docs/PROJECT_IDEA.md §5.3): the one on-screen switch between
// Architecture/Complexity/Activity/Quality, and the always-visible label naming whichever lens is
// currently active -- a viewer must never have to guess which lens they're looking at.

import * as THREE from "three";
import type { Building } from "../types.ts";
import { LENSES, type LensDef, type LensId } from "./lenses.ts";

export interface UIHandle {
  /** Opens the metrics overlay for a building id (no-op + no throw if the id is unknown). */
  openOverlay(buildingId: string): void;
  closeOverlay(): void;
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

  return { openOverlay, closeOverlay, overlayText, dispose };
}

// -------------------------------------------------------------------------------------------
// Lens control (Phase 5.3) — a fixed on-screen switch + legend. Deliberately its own small
// handle rather than folded into UIHandle above: the overlay is click-driven and building-scoped,
// the lens control is always-visible and city-scoped, and the two have no state in common.
// -------------------------------------------------------------------------------------------

export interface LensControlHandle {
  /** Currently displayed/selected lens. */
  activeLens(): LensId;
  /** Programmatically selects a lens (updates the visible legend + button state) without
   *  re-invoking onSelect -- for a caller that already applied the lens elsewhere (e.g. restoring
   *  from a saved state) and only needs the control to reflect it. */
  setActiveLens(lens: LensId): void;
  dispose(): void;
}

export interface SetupLensControlParams {
  container: HTMLElement;
  /** Called when the viewer picks a different lens (never called for the initial lens). */
  onSelect(lens: LensId): void;
  initialLens?: LensId;
}

function lensLegendText(lens: LensDef): string {
  return `Lens: ${lens.label} — ${lens.description}`;
}

/**
 * Builds a small fixed control (one button per lens) plus a persistent legend line naming the
 * active lens and what it means -- same "always disclose provenance" discipline main.ts's
 * showFlowLegend already applies to animated roads (PROJECT_IDEA.md §5.5). The Quality lens's
 * legend text always includes "UNMEASURED" verbatim (LENSES[].description) so a viewer can never
 * mistake its flat placeholder color for a real quality reading.
 */
export function setupLensControl(params: SetupLensControlParams): LensControlHandle {
  const { container, onSelect } = params;
  let active: LensId = params.initialLens ?? "architecture";

  const root = document.createElement("div");
  root.className = "cc-lens-control";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "City lens");

  const buttons = new Map<LensId, HTMLButtonElement>();
  const buttonRow = document.createElement("div");
  buttonRow.className = "cc-lens-buttons";

  for (const lens of LENSES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cc-lens-button";
    btn.textContent = lens.label;
    btn.setAttribute("aria-pressed", String(lens.id === active));
    btn.addEventListener("click", () => {
      if (lens.id === active) return;
      active = lens.id;
      render();
      onSelect(lens.id);
    });
    buttons.set(lens.id, btn);
    buttonRow.appendChild(btn);
  }

  const legend = document.createElement("div");
  legend.className = "cc-lens-legend";

  root.appendChild(buttonRow);
  root.appendChild(legend);
  container.appendChild(root);

  function render(): void {
    for (const [id, btn] of buttons) {
      const isActive = id === active;
      btn.setAttribute("aria-pressed", String(isActive));
      btn.classList.toggle("cc-lens-button--active", isActive);
    }
    const def = LENSES.find((l) => l.id === active);
    legend.textContent = def ? lensLegendText(def) : `Lens: ${active}`;
  }
  render();

  function activeLens(): LensId {
    return active;
  }

  function setActiveLens(lens: LensId): void {
    active = lens;
    render();
  }

  function dispose(): void {
    root.remove();
  }

  return { activeLens, setActiveLens, dispose };
}

// -------------------------------------------------------------------------------------------
// Layer control — per-layer visibility toggles (roads / tethers / landmarks). Its own handle for
// the same reason as the lens control: independent state, no overlap with lens or overlay. This
// is a VIEW filter only -- hiding a layer never changes the loaded CityModel or any count the
// test bridge reports, so a hidden layer can never be mistaken for absent data.
// -------------------------------------------------------------------------------------------

export interface LayerToggleDef {
  id: string;
  label: string;
  /** Visible on load. */
  initial: boolean;
}

export interface LayerControlHandle {
  /** Whether the named layer is currently toggled visible (unknown id -> false). */
  isVisible(id: string): boolean;
  /** Programmatically sets a toggle (updates the button) AND invokes onToggle, so the scene and
   *  the control can never disagree about what's on screen. */
  setVisible(id: string, visible: boolean): void;
  dispose(): void;
}

export interface SetupLayerControlParams {
  container: HTMLElement;
  layers: readonly LayerToggleDef[];
  /** Called whenever a layer's visibility changes (click or setVisible), never for initial state. */
  onToggle(id: string, visible: boolean): void;
}

export function setupLayerControl(params: SetupLayerControlParams): LayerControlHandle {
  const { container, layers, onToggle } = params;

  const state = new Map<string, boolean>();
  const buttons = new Map<string, HTMLButtonElement>();

  const root = document.createElement("div");
  root.className = "cc-layer-control";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "City layers");

  for (const layer of layers) {
    state.set(layer.id, layer.initial);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cc-layer-button";
    btn.textContent = layer.label;
    btn.addEventListener("click", () => setVisible(layer.id, !state.get(layer.id)));
    buttons.set(layer.id, btn);
    root.appendChild(btn);
  }
  container.appendChild(root);

  function render(): void {
    for (const [id, btn] of buttons) {
      const on = state.get(id) === true;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("cc-layer-button--active", on);
    }
  }
  render();

  function isVisible(id: string): boolean {
    return state.get(id) === true;
  }

  function setVisible(id: string, visible: boolean): void {
    if (!state.has(id)) return;
    if (state.get(id) === visible) return;
    state.set(id, visible);
    render();
    onToggle(id, visible);
  }

  function dispose(): void {
    root.remove();
  }

  return { isVisible, setVisible, dispose };
}

// -------------------------------------------------------------------------------------------
// Timeline scrub control (Phase 4, PROJECT_IDEA.md §5.2) -- a slider over the snapshot sequence
// plus the always-visible date readout acceptance criterion 3 requires ("a user must never be
// unsure which moment they are looking at") and a gap badge for criterion 6. Deliberately its own
// handle, same reasoning as the lens control above: independent state (scrub position) from
// independent concerns (the overlay, the lens), sharing nothing but the container element.
// -------------------------------------------------------------------------------------------

export interface TimelineControlEntry {
  month: string;
  date: string;
}

export interface TimelineControlHandle {
  /** Programmatically sets the slider's displayed value (e.g. to reflect a position set some
   *  other way) without re-invoking onScrub. */
  setPosition(globalT: number): void;
  /** Updates the date/gap readout -- called after every setPosition on the underlying
   *  TimelineHandle so the HUD always reflects what's actually rendered, never a value computed
   *  independently of it. */
  setReadout(dateISO: string, isGap: boolean): void;
  dispose(): void;
}

export interface SetupTimelineControlParams {
  container: HTMLElement;
  /** One entry per resolved snapshot, in the same order as the TimelineHandle's own sequence --
   *  the slider's min/max/step are derived from this length, never a second source of truth. */
  entries: readonly TimelineControlEntry[];
  /** Called with the slider's raw index-space value on every drag/keyboard move. */
  onScrub(globalT: number): void;
  initialPosition?: number;
}

function formatMonthLabel(entry: TimelineControlEntry): string {
  return entry.month;
}

/**
 * Builds the timeline slider + date/gap HUD. The slider itself only ever emits a position
 * (`onScrub`) -- it does not compute or display the date on its own; the caller is expected to
 * read back the TimelineHandle's own currentDate()/isInGap() (the thing actually rendered) and
 * feed it to setReadout(), so the on-screen date can never drift from what the scene shows.
 */
export function setupTimelineControl(params: SetupTimelineControlParams): TimelineControlHandle {
  const { container, entries, onScrub } = params;
  if (entries.length === 0) throw new Error("setupTimelineControl requires at least one entry");

  const root = document.createElement("div");
  root.className = "cc-timeline-control";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Timeline scrub");

  const dateRow = document.createElement("div");
  dateRow.className = "cc-timeline-date";

  const gapBadge = document.createElement("span");
  gapBadge.className = "cc-timeline-gap";
  gapBadge.textContent = "GAP -- no commits in this span";
  gapBadge.style.display = "none";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "cc-timeline-slider";
  slider.min = "0";
  slider.max = String(Math.max(0, entries.length - 1));
  slider.step = "0.01";
  slider.value = String(params.initialPosition ?? 0);
  slider.setAttribute("aria-label", "Timeline position");

  const monthRow = document.createElement("div");
  monthRow.className = "cc-timeline-months";
  const firstLabel = document.createElement("span");
  firstLabel.textContent = formatMonthLabel(entries[0]);
  const lastLabel = document.createElement("span");
  lastLabel.textContent = formatMonthLabel(entries[entries.length - 1]);
  monthRow.appendChild(firstLabel);
  monthRow.appendChild(lastLabel);

  root.appendChild(dateRow);
  root.appendChild(gapBadge);
  root.appendChild(slider);
  root.appendChild(monthRow);
  container.appendChild(root);

  function onInput(): void {
    onScrub(Number(slider.value));
  }
  slider.addEventListener("input", onInput);

  function setPosition(globalT: number): void {
    slider.value = String(globalT);
  }

  function setReadout(dateISO: string, isGap: boolean): void {
    const date = new Date(dateISO);
    dateRow.textContent = Number.isNaN(date.getTime()) ? dateISO : date.toISOString().slice(0, 10);
    gapBadge.style.display = isGap ? "block" : "none";
  }

  function dispose(): void {
    slider.removeEventListener("input", onInput);
    root.remove();
  }

  return { setPosition, setReadout, dispose };
}
