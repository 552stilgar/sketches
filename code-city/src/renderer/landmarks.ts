// renderer: CityModel.landmarks -> Three.js landmark meshes (V4 contract, CONTRACTS.md § "V4:
// datastores + clone identity").
//
// V4 emits exactly one Landmark.kind: "datastore" (src/types.ts). A datastore's geometry reads
// from Landmark.weight (schema-derived TABLE COUNT -- never a live .db file's size, V4 contract
// D1) and its label from Landmark.label. Static only, same discipline as buildings.ts: every
// decision rule here is a pure function of city.json, no clocks, no randomness.
//
// Discoverability convention (gated by tests/landmarks-render.test.ts): the Object3D representing
// each Landmark must carry `userData.landmarkId === landmark.id` on itself or a descendant --
// mirrors buildDistricts's `name = district:${id}` convention (src/renderer/buildings.ts) so a
// headless check can find a specific landmark without knowing this module's internal geometry.
//
// A datastore is INFRASTRUCTURE, not an office: its silhouette must never be mistakable for a
// building profile from buildings.ts (all four of which are box-derived -- flat/stepped/pitched
// roofs on a rectangular footprint). A reservoir/tank -- a cylindrical body, a shallow domed cap,
// a reinforcement band -- is a shape none of those four profiles produce, so the read is instant
// regardless of style profile mix in the surrounding district.

import * as THREE from "three";
import type { CityModel, Landmark } from "../types.ts";

// -------------------------------------------------------------------------------------------
// Sizing (pure, deterministic) -- unit-tested indirectly via buildLandmarks' geometry output.
// -------------------------------------------------------------------------------------------

/** A missing Landmark.weight is UNMEASURED, never zero tables (PROJECT_IDEA.md 5.5 -- the same
 *  "absence != zero" idiom as Road.weight's UNWEIGHTED_DEFAULT in roads.ts). Landmark.weight
 *  lands ahead of detectDatastores actually filling it in (src/types.ts doc comment), so this
 *  fallback exists for that transitional window as much as for a genuinely-empty schema. */
const DATASTORE_WEIGHT_DEFAULT = 1;

function effectiveWeight(weight: number | undefined): number {
  return weight === undefined || !Number.isFinite(weight) || weight < 0 ? DATASTORE_WEIGHT_DEFAULT : weight;
}

const TANK_BASE_RADIUS = 6;
const TANK_RADIUS_SCALE = 4;
const TANK_BASE_HEIGHT = 10;
const TANK_HEIGHT_SCALE = 2.5;

/** Radius/height grow with sqrt(tableCount) -- the same sqrt-of-signal urban-grammar rule
 *  buildings.ts's footprint uses for sqrt(loc) (docs/CONTRACT-city-json.md, "Urban grammar"): a
 *  datastore with 4x the tables reads as visibly, but not absurdly, larger -- not 4x the volume. */
function tankDimensions(weight: number | undefined): { radius: number; height: number } {
  const w = Math.sqrt(effectiveWeight(weight));
  return {
    radius: TANK_BASE_RADIUS + TANK_RADIUS_SCALE * w,
    height: TANK_BASE_HEIGHT + TANK_HEIGHT_SCALE * w,
  };
}

// -------------------------------------------------------------------------------------------
// Geometry / materials -- unlit-free (MeshStandardMaterial, same lighting family as
// buildings.ts) because a datastore IS part of the physical city, unlike tethers.ts's overlay
// links which deliberately opt OUT of scene lighting to read as a diagram annotation.
// -------------------------------------------------------------------------------------------

// Steel-blue, high metalness/low roughness -- deliberately outside buildings.ts's STYLE_HUES
// language palette (warm ambers/greens/violets) so a datastore never gets mistaken for "just
// another building colored oddly"; it reads as industrial plant, not architecture.
const TANK_COLOR = new THREE.Color().setHSL(0.56, 0.28, 0.55);
const TANK_BAND_COLOR = new THREE.Color().setHSL(0.56, 0.12, 0.32);
const TANK_MATERIAL_PARAMS = { roughness: 0.32, metalness: 0.68 } as const;

/** Body cylinder + a shallow domed cap (a flatter, wider cousin of buildProfileGeometry's
 *  pyramid cap in buildings.ts) + a mid-height reinforcement ring -- three primitives that read
 *  as "tank" at a glance and could not be produced by any of the four box-derived style profiles. */
function buildTankMeshes(radius: number, height: number): THREE.Object3D[] {
  const bodyHeight = height * 0.82;
  const capHeight = height - bodyHeight;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, bodyHeight, 24),
    new THREE.MeshStandardMaterial({ color: TANK_COLOR, ...TANK_MATERIAL_PARAMS }),
  );
  body.position.y = bodyHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.94, radius, capHeight, 24),
    new THREE.MeshStandardMaterial({ color: TANK_COLOR, ...TANK_MATERIAL_PARAMS }),
  );
  cap.position.y = bodyHeight + capHeight / 2;
  cap.castShadow = true;

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.02, Math.max(0.3, radius * 0.05), 8, 24),
    new THREE.MeshStandardMaterial({ color: TANK_BAND_COLOR, ...TANK_MATERIAL_PARAMS }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = bodyHeight * 0.6;

  return [body, cap, band];
}

// Canvas 2D + document are DOM-only, unlike THREE's core data classes (Group, Mesh, BufferGeometry
// etc.), which construct fine under vitest's Node environment -- same "only the DOM/WebGL bits
// need a real browser" boundary tests/landmarks-render.test.ts's header comment documents for
// LineSegments/BufferGeometry. Guarding this lets buildLandmarks stay unit-testable headless
// while still drawing a real label in the actual (browser) runtime main.ts wires it into.
function hasDocument(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function makeLandmarkLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 60px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(20,30,40,0.72)";
  ctx.fillRect(0, 24, canvas.width, 80);
  ctx.fillStyle = "#dff2ff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(84, 21, 1);
  return sprite;
}

/**
 * Builds one tagged Object3D per Landmark this renderer knows how to draw. V4's analyzer/compiler
 * pipeline emits exactly one `kind`, `"datastore"` -- an unlisted kind is legal shape-wise
 * (src/types.ts doc comment) but has no defined renderer treatment yet, so it is skipped rather
 * than guessed at (never fabricate a visual for a signal this renderer doesn't understand).
 */
export function buildLandmarks(city: CityModel): THREE.Group {
  const group = new THREE.Group();
  group.name = "landmarks";

  for (const landmark of city.landmarks as Landmark[]) {
    if (landmark.kind !== "datastore") continue;

    const { radius, height } = tankDimensions(landmark.weight);
    const landmarkGroup = new THREE.Group();
    landmarkGroup.name = `landmark:${landmark.id}`;
    landmarkGroup.userData.landmarkId = landmark.id;
    landmarkGroup.position.set(landmark.x, 0, landmark.y);

    for (const mesh of buildTankMeshes(radius, height)) landmarkGroup.add(mesh);

    if (hasDocument()) {
      const label = makeLandmarkLabelSprite(landmark.label ?? landmark.id);
      label.position.set(0, height + 14, 0);
      landmarkGroup.add(label);
    }

    group.add(landmarkGroup);
  }

  return group;
}
