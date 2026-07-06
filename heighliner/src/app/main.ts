// Gallery page: pinned judgment row (8 fixed seeds — the aesthetic
// regression suite) + 4×3 fleet grid of sequential seeds. Click a card to
// open the inspector: large render, per-layer re-roll, copy seed, export
// SVG/PNG. No framework, no rendering library.

import "./style.css";
import { derive, hexToSeed, seedToHex } from "../core/prng";
import { shipSVG } from "../gen/ship";
import type { SubSeedOverrides } from "../gen/ship";
import { parseViewBox, pngCanvasSize } from "./svg-utils";

// Never change these — they are the before/after eyeball baseline for every
// grammar tweak (brief §5).
const JUDGMENT_SEEDS = [
  "7a3f09c1",
  "d44e2b10",
  "01c9a5e7",
  "9b6d3f02",
  "5e0812aa",
  "c377fd54",
  "2f91b86d",
  "84a6c0e3",
] as const;

// Fleet grid: 12 sequential seeds.
const FLEET_BASE = 0x1f2a0001;
const FLEET_COUNT = 12;

// The four re-rollable layers, in the fixed pipeline order (brief §4.1).
const LAYERS = ["structure", "kit", "detail", "paint"] as const;
type Layer = (typeof LAYERS)[number];

function card(seedHex: string, instanceId: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "card";
  el.title = "click to inspect";
  el.innerHTML = `${shipSVG(hexToSeed(seedHex), {}, instanceId)}<div class="seed">${seedHex}</div>`;
  el.addEventListener("click", () => openInspector(seedHex));
  return el;
}

function section(title: string, className: string, seeds: string[], idTag: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const h = document.createElement("h2");
  h.textContent = title;
  frag.appendChild(h);
  const wrap = document.createElement("div");
  wrap.className = className;
  seeds.forEach((s, i) => wrap.appendChild(card(s, `${idTag}${i}`)));
  frag.appendChild(wrap);
  return frag;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

const header = document.createElement("div");
header.innerHTML = `<h1>heighliner <span class="accent">//</span> seeded torch-ship generator</h1>
<div class="subtitle">frigates, corvettes &amp; haulers — silhouette · shading · detail · kit · livery. click a ship to inspect it.</div>`;
app.appendChild(header);

app.appendChild(section("Judgment row — pinned seeds", "row-judgment", [...JUDGMENT_SEEDS], "j"));

const fleetSeeds = Array.from({ length: FLEET_COUNT }, (_, i) => seedToHex(FLEET_BASE + i));
app.appendChild(section("Fleet — sequential seeds", "grid-fleet", fleetSeeds, "f"));

// ---------------------------------------------------------------------------
// Inspector: large render + per-layer re-roll + copy seed + export SVG/PNG.
// ---------------------------------------------------------------------------

interface InspectorState {
  seed: number;
  overrides: SubSeedOverrides;
  rerollCounts: Record<Layer, number>;
}

let state: InspectorState | null = null;

const overlay = document.createElement("div");
overlay.className = "inspector-overlay hidden";
overlay.innerHTML = `
  <div class="inspector-panel">
    <div class="inspector-head">
      <span class="inspector-seed"></span>
      <button type="button" class="inspector-close" title="close (Esc)">×</button>
    </div>
    <div class="inspector-render"></div>
    <div class="inspector-controls"></div>
    <div class="inspector-actions">
      <button type="button" data-action="copy-seed">Copy seed</button>
      <button type="button" data-action="export-svg">Export SVG</button>
      <button type="button" data-action="export-png">Export PNG</button>
    </div>
    <div class="inspector-status"></div>
  </div>
`;
document.body.appendChild(overlay);

function required<T>(el: T | null, selector: string): T {
  if (!el) throw new Error(`inspector template missing ${selector}`);
  return el;
}

const renderEl = required(overlay.querySelector<HTMLDivElement>(".inspector-render"), ".inspector-render");
const seedLabelEl = required(overlay.querySelector<HTMLSpanElement>(".inspector-seed"), ".inspector-seed");
const controlsEl = required(overlay.querySelector<HTMLDivElement>(".inspector-controls"), ".inspector-controls");
const statusEl = required(overlay.querySelector<HTMLDivElement>(".inspector-status"), ".inspector-status");
const closeBtn = required(overlay.querySelector<HTMLButtonElement>(".inspector-close"), ".inspector-close");

LAYERS.forEach((layer) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = `Re-roll ${layer}`;
  btn.dataset.layer = layer;
  btn.addEventListener("click", () => rerollLayer(layer));
  controlsEl.appendChild(btn);
});

function currentSVG(): string {
  if (!state) throw new Error("inspector not open");
  return shipSVG(state.seed, state.overrides, "inspector");
}

function renderInspectorShip(): void {
  if (!state) return;
  renderEl.innerHTML = currentSVG();
  seedLabelEl.textContent = seedToHex(state.seed);
}

function flashStatus(message: string): void {
  statusEl.textContent = message;
  setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 1600);
}

function openInspector(seedHex: string): void {
  state = {
    seed: hexToSeed(seedHex),
    overrides: {},
    rerollCounts: { structure: 0, kit: 0, detail: 0, paint: 0 },
  };
  overlay.classList.remove("hidden");
  statusEl.textContent = "";
  renderInspectorShip();
}

function closeInspector(): void {
  overlay.classList.add("hidden");
  renderEl.innerHTML = "";
  state = null;
}

function rerollLayer(layer: Layer): void {
  if (!state) return;
  state.rerollCounts[layer] += 1;
  state.overrides[layer] = derive(state.seed, layer, "reroll", state.rerollCounts[layer]);
  renderInspectorShip();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSVG(): void {
  if (!state) return;
  const svg = currentSVG();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `heighliner-${seedToHex(state.seed)}.svg`);
  flashStatus("SVG exported");
}

function exportPNG(): void {
  if (!state) return;
  const seedHex = seedToHex(state.seed);
  const svg = currentSVG();
  const size = pngCanvasSize(parseViewBox(svg));
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    URL.revokeObjectURL(url);
    if (!ctx) {
      flashStatus("PNG export failed: no 2d context");
      return;
    }
    ctx.drawImage(img, 0, 0, size.width, size.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        flashStatus("PNG export failed: encode error");
        return;
      }
      downloadBlob(blob, `heighliner-${seedHex}.png`);
      flashStatus("PNG exported");
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    flashStatus("PNG export failed: image load error");
  };
  img.src = url;
}

overlay.querySelectorAll<HTMLButtonElement>(".inspector-actions button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    if (action === "copy-seed") {
      if (!state) return;
      void navigator.clipboard.writeText(seedToHex(state.seed)).then(() => flashStatus("seed copied"));
    } else if (action === "export-svg") {
      exportSVG();
    } else if (action === "export-png") {
      exportPNG();
    }
  });
});

closeBtn.addEventListener("click", closeInspector);
overlay.addEventListener("click", (ev) => {
  if (ev.target === overlay) closeInspector();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && state) closeInspector();
});
