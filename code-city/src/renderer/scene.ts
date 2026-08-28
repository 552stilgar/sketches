// renderer: base Three.js scene setup — camera, lights, ground plane, OrbitControls, render loop.
//
// Deliberately dumb: knows nothing about CityModel. buildings.ts / roads.ts / ui.ts populate the
// scene this module hands back.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Call once per frame from an external loop. */
  render(): void;
  /** Keeps camera aspect / renderer size in sync with the container element. */
  handleResize(): void;
}

const CANVAS_SIZE = 1000; // matches the CityModel canvas convention (docs/CONTRACT-city-json.md)

export function createScene(container: HTMLElement): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.Fog(0x0b1020, 900, 2600);

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    5000,
  );
  camera.position.set(CANVAS_SIZE * 0.65, CANVAS_SIZE * 0.55, CANVAS_SIZE * 0.65);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Ground plane — sized generously beyond the 1000x1000 canvas so the city doesn't float on a
  // visible edge.
  const groundGeo = new THREE.PlaneGeometry(CANVAS_SIZE * 3, CANVAS_SIZE * 3);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CANVAS_SIZE / 2, 0, CANVAS_SIZE / 2);
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  const hemi = new THREE.HemisphereLight(0x8fb0ff, 0x1a1420, 0.65);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2e0, 1.1);
  sun.position.set(CANVAS_SIZE * 0.4, CANVAS_SIZE * 0.9, CANVAS_SIZE * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -CANVAS_SIZE;
  sun.shadow.camera.right = CANVAS_SIZE * 2;
  sun.shadow.camera.top = CANVAS_SIZE * 2;
  sun.shadow.camera.bottom = -CANVAS_SIZE;
  sun.shadow.camera.far = CANVAS_SIZE * 4;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambient);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CANVAS_SIZE / 2, 0, CANVAS_SIZE / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = 2200;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  function render(): void {
    renderer.render(scene, camera);
  }

  function handleResize(): void {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return { scene, camera, renderer, controls, render, handleResize };
}
