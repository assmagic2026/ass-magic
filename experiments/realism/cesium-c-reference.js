import * as THREE from "../../three.module.js";
import { createFlightPlayer } from "./whole-planet-player.js?v=realism-47";

// This is the exact Type C parameter set from player-body-preview commit 2b92925.
// It only exists in this direct-only reference page and is not imported by the game.
const MODEL_URL = "./assets/models/cesium-man.glb";
const BASE_VALUES = Object.freeze({ chestWidth: 1, chestDepth: 1, midWidth: 1, waistWidth: 1 });
const TYPE_C_VALUES = Object.freeze({ chestWidth: 1.16, chestDepth: 1.1, midWidth: 1.07, waistWidth: 1.02 });
const VIEW_ANGLES = Object.freeze({
  front: { yaw: 0, pitch: 0.025 },
  "front-quarter": { yaw: Math.PI * 0.25, pitch: 0.035 },
  side: { yaw: Math.PI * 0.5, pitch: 0.025 },
  "back-quarter": { yaw: Math.PI * 0.75, pitch: 0.035 },
  back: { yaw: Math.PI, pitch: 0.025 },
});

const canvas = document.querySelector("#preview-canvas");
const stageCard = document.querySelector(".stage-card");
const loadingPanel = document.querySelector("#loading-panel");
const compareHold = document.querySelector("#compare-hold");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(37, 1, 0.01, 120);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;

scene.add(new THREE.HemisphereLight(0xe7eef0, 0x262219, 2.15));
const keyLight = new THREE.DirectionalLight(0xfff4dc, 3.25);
keyLight.position.set(4.5, 6.5, 5.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xa8c8db, 1.5);
fillLight.position.set(-5, 2, 3);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xe8d9bc, 2);
rimLight.position.set(1, 3, -6);
scene.add(rimLight);

const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshBasicMaterial({ color: 0x090b09, transparent: true, opacity: 0.24, depthWrite: false }),
);
contactShadow.rotation.x = -Math.PI * 0.5;
scene.add(contactShadow);

const orbit = {
  yaw: VIEW_ANGLES.front.yaw,
  pitch: VIEW_ANGLES.front.pitch,
  radius: 4.5,
  targetYaw: VIEW_ANGLES.front.yaw,
  targetPitch: VIEW_ANGLES.front.pitch,
  targetRadius: 4.5,
};
const cameraTarget = new THREE.Vector3();
const pointers = new Map();
let previousPinchDistance = 0;
let rig = null;
let skinnedMesh = null;
let deformation = null;
let baseHeight = 2.6;
let comparing = false;
let needsRender = true;

canvas.dataset.modelReady = "false";
canvas.dataset.sourceModel = "cesium-man.glb";
canvas.dataset.preset = "type-c";
canvas.dataset.shape = JSON.stringify(TYPE_C_VALUES);
installControls();
installResizeHandling();
loadTypeC();
requestAnimationFrame(renderFrame);

async function loadTypeC() {
  try {
    rig = createFlightPlayer(scene, { modelUrl: MODEL_URL, castShadow: false });
    rig.player.visible = false;
    await rig.ready;

    skinnedMesh = findSkinnedMesh(rig.modelVisual);
    if (!skinnedMesh) throw new Error("Cesium Man did not provide a SkinnedMesh.");

    // Same orientation, helper, arm extension and torso deformation path as the
    // historical comparison page. The original GLB file stays unchanged.
    rig.player.rotation.x = -Math.PI * 0.5;
    rig.player.position.set(0, 0, 0);
    rig.player.updateMatrixWorld(true);
    deformation = createTorsoDeformation(skinnedMesh);
    applyGeometryShape(BASE_VALUES);
    centerPlayerFromSkinnedBounds();
    const bounds = sampleSkinnedBounds();
    baseHeight = bounds.getSize(new THREE.Vector3()).y;
    positionContactShadow(bounds);
    orbit.radius = baseHeight * 1.72;
    orbit.targetRadius = orbit.radius;
    applyGeometryShape(TYPE_C_VALUES);

    rig.player.visible = true;
    canvas.dataset.modelReady = "true";
    canvas.dataset.torsoVertices = String(deformation.activeVertexCount);
    canvas.dataset.armExtension = "1.44";
    loadingPanel.classList.add("is-hidden");
    needsRender = true;
  } catch (error) {
    console.error("Cesium Man Type C reference failed to initialize.", error);
    loadingPanel.querySelector("strong").textContent = "MODEL LOAD ERROR";
    loadingPanel.querySelector("small").textContent = "Cesium Manを読み込めませんでした";
    canvas.dataset.modelReady = "false";
  }
}

function findSkinnedMesh(root) {
  let found = null;
  root?.traverse((object) => {
    if (!found && object.isSkinnedMesh && object.geometry?.attributes?.position) found = object;
  });
  return found;
}

function createTorsoDeformation(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const basePositions = new Float32Array(position.array);
  const masks = new Float32Array(position.count);
  let centerDepthWeighted = 0;
  let centerWeight = 0;
  let activeVertexCount = 0;

  for (let index = 0; index < position.count; index += 1) {
    let torsoWeight = 0;
    let otherWeight = 0;
    const joints = [skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index)];
    const weights = [skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index)];
    for (let influence = 0; influence < 4; influence += 1) {
      if (joints[influence] <= 2) torsoWeight += weights[influence];
      else otherWeight += weights[influence];
    }
    const z = basePositions[index * 3 + 2];
    const anatomyWeight = smoothstep(0.025, 0.5, torsoWeight) * (1 - otherWeight * 0.18);
    const lowerFade = smoothstep(0.62, 0.75, z);
    const upperFade = 1 - smoothstep(1.1, 1.18, z);
    const mask = anatomyWeight * lowerFade * upperFade;
    masks[index] = mask;
    if (mask > 0.03) {
      activeVertexCount += 1;
      const centerSampleWeight = mask * smoothstep(0.69, 0.79, z) * (1 - smoothstep(1.17, 1.29, z));
      centerDepthWeighted += basePositions[index * 3] * centerSampleWeight;
      centerWeight += centerSampleWeight;
    }
  }
  return {
    geometry,
    position,
    basePositions,
    masks,
    depthCenter: centerWeight > 0 ? centerDepthWeighted / centerWeight : 0.02,
    activeVertexCount,
  };
}

function applyGeometryShape(values) {
  if (!deformation) return;
  const { position, basePositions, masks, depthCenter, geometry } = deformation;
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    const mask = masks[index];
    const compensatedMidWidth = 1 + (values.midWidth - 1) * 1.15;
    const targetWidth = z < 0.94
      ? THREE.MathUtils.lerp(values.waistWidth, compensatedMidWidth, smoothstep(0.78, 0.94, z))
      : THREE.MathUtils.lerp(
        compensatedMidWidth,
        1 + (values.chestWidth - 1) * 3.1,
        smoothstep(0.94, 1.05, z),
      );
    const lowerDepth = 1 + (values.waistWidth - 1) * 0.32;
    const targetDepth = THREE.MathUtils.lerp(
      lowerDepth,
      1 + (values.chestDepth - 1) * 1.02,
      smoothstep(0.78, 1.05, z),
    );
    const widthScale = 1 + (targetWidth - 1) * mask;
    const depthScale = 1 + (targetDepth - 1) * mask;
    position.setXYZ(index, depthCenter + (x - depthCenter) * depthScale, y * widthScale, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  skinnedMesh.updateMatrixWorld(true);
  canvas.dataset.shape = JSON.stringify(values);
  needsRender = true;
}

function centerPlayerFromSkinnedBounds() {
  const center = sampleSkinnedBounds().getCenter(new THREE.Vector3());
  rig.player.position.sub(center);
  rig.player.updateMatrixWorld(true);
}

function positionContactShadow(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  contactShadow.position.set(0, bounds.min.y + 0.008, 0);
  contactShadow.scale.set(size.x * 0.28, size.z * 0.23, 1);
}

function sampleSkinnedBounds() {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const position = skinnedMesh.geometry.attributes.position;
  rig.player.updateMatrixWorld(true);
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    skinnedMesh.applyBoneTransform(index, point);
    skinnedMesh.localToWorld(point);
    bounds.expandByPoint(point);
  }
  return bounds;
}

function installControls() {
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }
  compareHold.addEventListener("pointerdown", startComparison);
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
    compareHold.addEventListener(eventName, stopComparison);
  }
  compareHold.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) startComparison(event);
  });
  compareHold.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stopComparison(event);
  });

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPinchDistance = currentPinchDistance();
  });
  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const oldPinchDistance = currentPinchDistance();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      orbit.targetYaw -= (event.clientX - previous.x) * 0.007;
      orbit.targetPitch = THREE.MathUtils.clamp(orbit.targetPitch + (event.clientY - previous.y) * 0.0045, -0.56, 0.58);
      document.querySelectorAll("[data-view]").forEach((button) => button.classList.remove("is-active"));
    } else if (pointers.size === 2) {
      const distance = currentPinchDistance();
      const referenceDistance = oldPinchDistance || previousPinchDistance;
      if (referenceDistance > 0 && distance > 0) orbit.targetRadius = clampRadius(orbit.targetRadius * (referenceDistance / distance));
      previousPinchDistance = distance;
    }
    needsRender = true;
  });
  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    previousPinchDistance = currentPinchDistance();
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.targetRadius = clampRadius(orbit.targetRadius * Math.exp(event.deltaY * 0.0011));
    needsRender = true;
  }, { passive: false });
}

function startComparison(event) {
  event?.preventDefault();
  if (!deformation || comparing) return;
  comparing = true;
  compareHold.classList.add("is-comparing");
  compareHold.textContent = "未変形のCesium Manを表示中";
  applyGeometryShape(BASE_VALUES);
  canvas.dataset.compare = "base";
}

function stopComparison(event) {
  event?.preventDefault();
  if (!comparing) return;
  comparing = false;
  compareHold.classList.remove("is-comparing");
  compareHold.textContent = "押している間だけ未変形のCesium Man";
  applyGeometryShape(TYPE_C_VALUES);
  canvas.dataset.compare = "type-c";
}

function setView(view) {
  const angle = VIEW_ANGLES[view];
  if (!angle) return;
  orbit.targetYaw = nearestEquivalentAngle(angle.yaw, orbit.yaw);
  orbit.targetPitch = angle.pitch;
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  canvas.dataset.view = view;
  needsRender = true;
}

function currentPinchDistance() {
  if (pointers.size !== 2) return 0;
  const [first, second] = [...pointers.values()];
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function clampRadius(value) {
  return THREE.MathUtils.clamp(value, baseHeight * 0.58, baseHeight * 28);
}

function installResizeHandling() {
  const resize = () => {
    const width = Math.max(1, stageCard.clientWidth);
    const height = Math.max(1, stageCard.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 720 ? 1.45 : 1.8));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  new ResizeObserver(resize).observe(stageCard);
  resize();
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  if (document.hidden) return;
  const moving = Math.abs(orbit.targetYaw - orbit.yaw) > 0.0001
    || Math.abs(orbit.targetPitch - orbit.pitch) > 0.0001
    || Math.abs(orbit.targetRadius - orbit.radius) > 0.0001;
  if (moving) {
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * 0.13;
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * 0.13;
    orbit.radius += (orbit.targetRadius - orbit.radius) * 0.14;
    needsRender = true;
  }
  if (!needsRender) return;
  const horizontalRadius = Math.cos(orbit.pitch) * orbit.radius;
  camera.position.set(
    Math.sin(orbit.yaw) * horizontalRadius,
    Math.sin(orbit.pitch) * orbit.radius,
    Math.cos(orbit.yaw) * horizontalRadius,
  );
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
  needsRender = moving;
}

function smoothstep(min, max, value) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function nearestEquivalentAngle(target, current) {
  return target + Math.round((current - target) / (Math.PI * 2)) * Math.PI * 2;
}
