// Gallery page: pinned judgment row (8 fixed seeds — the aesthetic
// regression suite) + 4×3 fleet grid of sequential seeds. Click a card to
// copy its seed. No framework, no rendering library.

import "./style.css";
import { hexToSeed, seedToHex } from "../core/prng";
import { shipSVG } from "../gen/ship";

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

function card(seedHex: string, instanceId: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "card";
  el.title = "click to copy seed";
  el.innerHTML = `${shipSVG(hexToSeed(seedHex), {}, instanceId)}<div class="seed">${seedHex}</div>`;
  el.addEventListener("click", () => {
    void navigator.clipboard.writeText(seedHex).then(() => {
      el.classList.add("copied");
      setTimeout(() => el.classList.remove("copied"), 600);
    });
  });
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
<div class="subtitle">frigates — silhouette · shading · detail · kit · livery. click a ship to copy its seed.</div>`;
app.appendChild(header);

app.appendChild(section("Judgment row — pinned seeds", "row-judgment", [...JUDGMENT_SEEDS], "j"));

const fleetSeeds = Array.from({ length: FLEET_COUNT }, (_, i) => seedToHex(FLEET_BASE + i));
app.appendChild(section("Fleet — sequential seeds", "grid-fleet", fleetSeeds, "f"));
