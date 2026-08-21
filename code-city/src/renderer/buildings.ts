// renderer: CityModel -> Three.js building meshes + district ground rects + labels.
//
// Buildings are grouped by `style` into one InstancedMesh per group (cheap for hundreds of
// buildings, and gives raycasting a fast path via instanceId). Per-instance color is derived
// deterministically from the building id so re-renders never flicker between colors.

import * as THREE from "three";
import type { Building, CityModel, District } from "../types.ts";

export interface BuildingsHandle {
  /** One InstancedMesh per distinct building `style`. Add these to the scene. */
  meshes: THREE.InstancedMesh[];
  /** Add these group(s) to the scene: district ground rects + (optional) label sprites. */
  districtGroup: THREE.Group;
  /** Raycast target list = meshes. Resolve an intersection back to a building id. */
  resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null;
  /** All buildings keyed by id, for the UI overlay to read metrics from. */
  buildingById: Map<string, Building>;
  /** World-space center (x, y=height/2 top, z) of a building, for camera framing / road endpoints. */
  buildingCenter(id: string): THREE.Vector3 | null;
}

// Base hue per style tag. Unknown styles fall back to a neutral hash-derived hue.
const STYLE_HUES: Record<string, number> = {
  typescript: 0.55, // cyan-blue
  javascript: 0.13, // amber
  python: 0.33, // soft green
  rust: 0.02, // rust orange/red
  java: 0.62, // corporate blue-violet
  c: 0.08,
  cpp: 0.05,
  sql: 0.75, // violet warehouse
  html: 0.9, // magenta storefront
  css: 0.9,
};

function hashUnit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function styleHue(style: string): number {
  if (style in STYLE_HUES) return STYLE_HUES[style];
  return hashUnit(style);
}

function buildingColor(b: Building): THREE.Color {
  const baseHue = styleHue(b.style);
  const jitter = (hashUnit(b.id) - 0.5) * 0.06;
  const hue = (baseHue + jitter + 1) % 1;
  const sat = 0.45 + hashUnit(b.id + "s") * 0.25;
  const light = 0.42 + hashUnit(b.id + "l") * 0.16;
  return new THREE.Color().setHSL(hue, sat, light);
}

function districtColor(style: string): THREE.Color {
  const hue = styleHue(style);
  return new THREE.Color().setHSL(hue, 0.35, 0.16);
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 20, canvas.width, 88);
  ctx.fillStyle = "#e8ecff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(90, 22.5, 1);
  return sprite;
}

/** Builds district ground rects + fade-by-distance name labels. */
export function buildDistricts(city: CityModel): THREE.Group {
  const group = new THREE.Group();
  group.name = "districts";

  for (const d of city.districts as District[]) {
    const geo = new THREE.PlaneGeometry(d.width, d.depth);
    const mat = new THREE.MeshStandardMaterial({
      color: districtColor(d.style),
      roughness: 1,
      transparent: true,
      opacity: 0.9,
    });
    const rect = new THREE.Mesh(geo, mat);
    rect.rotation.x = -Math.PI / 2;
    rect.position.set(d.x + d.width / 2, 0.15, d.y + d.depth / 2);
    rect.receiveShadow = true;
    rect.name = `district:${d.id}`;
    group.add(rect);

    const label = makeLabelSprite(d.name);
    label.position.set(d.x + d.width / 2, 40, d.y + d.depth / 2);
    label.userData.isDistrictLabel = true;
    group.add(label);
  }

  return group;
}

/** Fades district labels out with camera distance so close-up building exploration isn't cluttered. */
export function updateDistrictLabelFade(group: THREE.Group, camera: THREE.Camera): void {
  const camPos = camera.position;
  for (const child of group.children) {
    if (!(child instanceof THREE.Sprite) || !child.userData.isDistrictLabel) continue;
    const dist = camPos.distanceTo(child.position);
    const mat = child.material as THREE.SpriteMaterial;
    // Fully visible far away (orientation), fades out as the camera gets close to street level.
    mat.opacity = THREE.MathUtils.clamp((dist - 120) / 260, 0.05, 1);
  }
}

export function buildBuildings(city: CityModel): BuildingsHandle {
  const buildingById = new Map<string, Building>();
  const byStyle = new Map<string, Building[]>();

  for (const b of city.buildings as Building[]) {
    buildingById.set(b.id, b);
    const list = byStyle.get(b.style) ?? [];
    list.push(b);
    byStyle.set(b.style, list);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const meshOrder = new Map<THREE.InstancedMesh, Building[]>();
  const centers = new Map<string, THREE.Vector3>();

  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  for (const [style, list] of byStyle) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `buildings:${style}`;

    const dummy = new THREE.Object3D();
    list.forEach((b, i) => {
      const cx = b.x + b.width / 2;
      const cz = b.y + b.depth / 2;
      const cy = b.height / 2;
      dummy.position.set(cx, cy, cz);
      dummy.scale.set(Math.max(0.1, b.width), Math.max(0.1, b.height), Math.max(0.1, b.depth));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, buildingColor(b));
      centers.set(b.id, new THREE.Vector3(cx, b.height, cz));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    meshes.push(mesh);
    meshOrder.set(mesh, list);
  }

  function resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null {
    if (instanceId === undefined) return null;
    const list = meshOrder.get(mesh as THREE.InstancedMesh);
    if (!list) return null;
    return list[instanceId]?.id ?? null;
  }

  function buildingCenter(id: string): THREE.Vector3 | null {
    return centers.get(id) ?? null;
  }

  return {
    meshes,
    districtGroup: buildDistricts(city),
    resolveBuildingId,
    buildingById,
    buildingCenter,
  };
}
