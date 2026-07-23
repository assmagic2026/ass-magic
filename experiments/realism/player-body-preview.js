import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const MANIFEST_URL = "./player-models/manifest.json";
const MODEL_DIRECTORY = "./player-models/";
const SAVED_SELECTION_KEY = "assmagic.originalPlayerModelPreview.selection.v1";
const VIEW_STATE_KEY = "assmagic.originalPlayerModelPreview.view.v1";
const SIZE_RADII = Object.freeze({
  close: 2.45,
  whole: 4.75,
  phone: 41,
});
const VIEW_ANGLES = Object.freeze({
  front: { yaw: 0, pitch: 0.02 },
  "front-quarter": { yaw: Math.PI * 0.25, pitch: 0.035 },
  side: { yaw: Math.PI * 0.5, pitch: 0.02 },
  "back-quarter": { yaw: Math.PI * 0.75, pitch: 0.035 },
  back: { yaw: Math.PI, pitch: 0.02 },
});

const canvas = document.querySelector("#preview-canvas");
const stageCard = document.querySelector(".stage-card");
const loadingPanel = document.querySelector("#loading-panel");
const activeName = document.querySelector("#active-name");
const modelSource = document.querySelector("#model-source");
const candidateList = document.querySelector("#candidate-list");
const candidateDescription = document.querySelector("#candidate-description");
const candidateNotes = document.querySelector("#candidate-notes");
const savedCandidate = document.querySelector("#saved-candidate");
const compareTarget = document.querySelector("#compare-target");
const compareHold = document.querySelector("#compare-hold");
const chooseButton = document.querySelector("#choose-button");
const copyButton = document.querySelector("#copy-button");
const saveStatus = document.querySelector("#save-status");
const copyFallback = document.querySelector("#copy-fallback");
const statOutputs = new Map(
  [...document.querySelectorAll("[data-stat]")].map((element) => [element.dataset.stat, element]),
);

const storedView = readJsonStorage(VIEW_STATE_KEY);
let manifest = null;
let selectedId = String(storedView?.candidate || "B").toUpperCase();
let selectedSize = SIZE_RADII[storedView?.size] ? storedView.size : "whole";
let selectedBackground = storedView?.background === "sky" ? "sky" : "neutral";
let comparisonId = String(storedView?.comparison || "C").toUpperCase();
let savedSelection = readJsonStorage(SAVED_SELECTION_KEY);
let activeId = null;
let comparing = false;
let needsRender = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(37, 1, 0.01, 140);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 720 ? 1.4 : 1.8));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;

scene.add(new THREE.HemisphereLight(0xdde9e8, 0x25201b, 2.3));
const keyLight = new THREE.DirectionalLight(0xfff1d5, 3.5);
keyLight.position.set(4.5, 6, 5.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x9bcfe0, 1.75);
fillLight.position.set(-5, 2.5, 3);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xe5d4ff, 2.25);
rimLight.position.set(2, 3, -6);
scene.add(rimLight);

const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.7, 48),
  new THREE.MeshBasicMaterial({
    color: 0x030505,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }),
);
contactShadow.position.y = -1.405;
contactShadow.rotation.x = -Math.PI * 0.5;
contactShadow.scale.set(1, 0.38, 1);
scene.add(contactShadow);

const orbit = {
  yaw: VIEW_ANGLES.front.yaw,
  pitch: VIEW_ANGLES.front.pitch,
  radius: SIZE_RADII[selectedSize],
  targetYaw: VIEW_ANGLES.front.yaw,
  targetPitch: VIEW_ANGLES.front.pitch,
  targetRadius: SIZE_RADII[selectedSize],
};
const cameraTarget = new THREE.Vector3(0, 0, 0);
const loader = new GLTFLoader();
const modelCache = new Map();
const pointers = new Map();
let previousPinchDistance = 0;

canvas.dataset.view = "front";
canvas.dataset.size = selectedSize;
canvas.dataset.background = selectedBackground;
canvas.dataset.modelReady = "false";
canvas.dataset.noSourceReuse = "true";

installOrbitControls();
installUiEvents();
installResizeHandling();
syncSizeUi();
syncBackgroundUi();
initialize();
requestAnimationFrame(renderFrame);

async function initialize() {
  try {
    manifest = await fetch(MANIFEST_URL, { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
      return response.json();
    });
    const candidateIds = manifest.candidates.map((candidate) => candidate.id);
    if (!candidateIds.includes(selectedId)) selectedId = "B";
    if (!candidateIds.includes(comparisonId) || comparisonId === selectedId) {
      comparisonId = candidateIds.find((id) => id !== selectedId) || selectedId;
    }
    canvas.dataset.rights = JSON.stringify(manifest.rights);
    buildCandidateButtons();
    buildCompareOptions();
    syncSavedCandidateLabel();
    await setSelectedCandidate(selectedId, false);
    loadCandidate(comparisonId).catch(() => {});
    loadingPanel.classList.add("is-hidden");
  } catch (error) {
    console.error("Original player model preview failed to initialize.", error);
    loadingPanel.querySelector("strong").textContent = "MODEL LOAD ERROR";
    loadingPanel.querySelector("small").textContent = "ローカルサーバーまたは公開URLから開いてください";
    modelSource.textContent = "LOAD ERROR";
    canvas.dataset.modelReady = "false";
  }
}

function candidateById(id) {
  return manifest?.candidates.find((candidate) => candidate.id === id) || null;
}

function buildCandidateButtons() {
  candidateList.replaceChildren();
  for (const candidate of manifest.candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate-button";
    button.dataset.candidate = candidate.id;
    button.setAttribute("aria-label", `候補${candidate.id}を表示`);
    button.innerHTML = `<strong>${candidate.id}</strong><small>${candidateLabel(candidate.id)}</small>`;
    button.addEventListener("click", () => setSelectedCandidate(candidate.id));
    candidateList.append(button);
  }
}

function buildCompareOptions() {
  compareTarget.replaceChildren();
  for (const candidate of manifest.candidates) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `候補 ${candidate.id}`;
    compareTarget.append(option);
  }
  ensureComparisonDiffers();
  compareTarget.value = comparisonId;
}

function candidateLabel(id) {
  return {
    A: "PURE",
    B: "NATURAL",
    C: "LAYER",
    D: "FLOW",
    E: "POETIC",
  }[id] || id;
}

async function loadCandidate(id) {
  if (modelCache.has(id)) return modelCache.get(id);
  const candidate = candidateById(id);
  if (!candidate) throw new Error(`Unknown candidate: ${id}`);

  const promise = loader.loadAsync(`${MODEL_DIRECTORY}${candidate.file}?v=${manifest.version}`).then((gltf) => {
    const root = gltf.scene;
    root.name = `OriginalPlayerCandidate_${id}`;
    root.visible = false;
    root.userData.candidateId = id;
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = true;
      object.castShadow = false;
      object.receiveShadow = false;
    });

    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -center.y, -center.z);
    root.updateMatrixWorld(true);
    scene.add(root);

    const runtime = inspectRuntimeModel(root);
    root.userData.runtime = runtime;
    canvas.dataset.loadedCandidateCount = String(modelCache.size);
    needsRender = true;
    return root;
  });
  modelCache.set(id, promise);
  canvas.dataset.loadedCandidateCount = String(modelCache.size);
  return promise;
}

function inspectRuntimeModel(root) {
  let triangleCount = 0;
  let nodeCount = 0;
  const materials = new Set();
  root.traverse((object) => {
    nodeCount += 1;
    if (!object.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    triangleCount += geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) materials.add(material.uuid);
  });
  return {
    triangleCount: Math.round(triangleCount),
    nodeCount,
    materialCount: materials.size,
  };
}

async function setSelectedCandidate(id, persist = true) {
  if (!candidateById(id)) return;
  selectedId = id;
  ensureComparisonDiffers();
  syncCandidateUi();
  const requestedId = id;
  canvas.dataset.modelReady = "loading";
  const root = await loadCandidate(id);
  if (selectedId !== requestedId || comparing) return;
  showOnlyModel(root, id);
  canvas.dataset.modelReady = "true";
  if (persist) persistViewState();
  loadCandidate(comparisonId).catch(() => {});
}

function showOnlyModel(root, id) {
  for (const modelPromise of modelCache.values()) {
    modelPromise.then((model) => {
      model.visible = model === root;
      needsRender = true;
    });
  }
  root.visible = true;
  activeId = id;
  syncActiveModelUi(id, root.userData.runtime);
  needsRender = true;
}

function syncCandidateUi() {
  const candidate = candidateById(selectedId);
  if (!candidate) return;
  for (const button of candidateList.querySelectorAll("[data-candidate]")) {
    const active = button.dataset.candidate === selectedId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  candidateDescription.textContent = candidate.direction;
  candidateNotes.textContent = candidate.notes;
  ensureComparisonDiffers();
  if (compareTarget.options.length) compareTarget.value = comparisonId;
}

function syncActiveModelUi(id, runtime = null) {
  const candidate = candidateById(id);
  if (!candidate) return;
  activeName.textContent = `${comparing ? "COMPARE" : "CANDIDATE"} ${id}`;
  modelSource.textContent = candidate.file;
  statOutputs.get("height").textContent = `${candidate.dimensions.height.toFixed(2)} m`;
  statOutputs.get("fingertipSpan").textContent = `${candidate.dimensions.fingertipSpan.toFixed(2)} m`;
  statOutputs.get("shoulderSpan").textContent = `${candidate.dimensions.shoulderSpan.toFixed(2)} m`;
  statOutputs.get("triangleCount").textContent = (runtime?.triangleCount ?? candidate.triangleCount).toLocaleString();
  statOutputs.get("nodeCount").textContent = String(runtime?.nodeCount ?? candidate.nodeCount);
  statOutputs.get("materialCount").textContent = String(runtime?.materialCount ?? candidate.materialCount);
  statOutputs.get("byteLength").textContent = formatBytes(candidate.byteLength);
  canvas.dataset.activeCandidate = id;
  canvas.dataset.modelFile = candidate.file;
  canvas.dataset.dimensions = JSON.stringify(candidate.dimensions);
  canvas.dataset.triangleCount = String(runtime?.triangleCount ?? candidate.triangleCount);
  canvas.dataset.nodeCount = String(runtime?.nodeCount ?? candidate.nodeCount);
  canvas.dataset.materialCount = String(runtime?.materialCount ?? candidate.materialCount);
}

function ensureComparisonDiffers() {
  if (comparisonId === selectedId || !candidateById(comparisonId)) {
    comparisonId = manifest.candidates.find((candidate) => candidate.id !== selectedId)?.id || selectedId;
  }
  for (const option of compareTarget.options) {
    option.disabled = option.value === selectedId;
  }
  compareTarget.value = comparisonId;
}

async function startComparison() {
  if (comparing || comparisonId === selectedId) return;
  comparing = true;
  compareHold.classList.add("is-comparing");
  compareHold.setAttribute("aria-pressed", "true");
  const requestedComparison = comparisonId;
  try {
    const root = await loadCandidate(requestedComparison);
    if (!comparing || comparisonId !== requestedComparison) return;
    showOnlyModel(root, requestedComparison);
  } catch (error) {
    console.error("Comparison model could not be loaded.", error);
    endComparison();
  }
}

async function endComparison() {
  if (!comparing) return;
  comparing = false;
  compareHold.classList.remove("is-comparing");
  compareHold.setAttribute("aria-pressed", "false");
  const root = await loadCandidate(selectedId);
  if (!comparing) showOnlyModel(root, selectedId);
}

function installUiEvents() {
  compareTarget.addEventListener("change", () => {
    comparisonId = compareTarget.value;
    persistViewState();
    loadCandidate(comparisonId).catch(() => {});
  });

  compareHold.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    compareHold.setPointerCapture?.(event.pointerId);
    startComparison();
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
    compareHold.addEventListener(eventName, endComparison);
  }
  compareHold.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      startComparison();
    }
  });
  compareHold.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      endComparison();
    }
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.addEventListener("click", () => setSize(button.dataset.size));
  });
  document.querySelectorAll("[data-background]").forEach((button) => {
    button.addEventListener("click", () => setBackground(button.dataset.background));
  });

  chooseButton.addEventListener("click", saveSelection);
  copyButton.addEventListener("click", copySelection);
}

function setView(view) {
  const angle = VIEW_ANGLES[view];
  if (!angle) return;
  orbit.targetYaw = angle.yaw;
  orbit.targetPitch = angle.pitch;
  canvas.dataset.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  needsRender = true;
}

function setSize(size) {
  if (!SIZE_RADII[size]) return;
  selectedSize = size;
  orbit.targetRadius = SIZE_RADII[size];
  canvas.dataset.size = size;
  syncSizeUi();
  persistViewState();
  needsRender = true;
}

function syncSizeUi() {
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.size === selectedSize);
  });
}

function setBackground(background) {
  selectedBackground = background === "sky" ? "sky" : "neutral";
  syncBackgroundUi();
  persistViewState();
  needsRender = true;
}

function syncBackgroundUi() {
  stageCard.dataset.background = selectedBackground;
  canvas.dataset.background = selectedBackground;
  document.querySelectorAll("[data-background]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.background === selectedBackground);
  });
}

function installOrbitControls() {
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
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      orbit.targetYaw -= dx * 0.009;
      orbit.targetPitch = THREE.MathUtils.clamp(orbit.targetPitch + dy * 0.006, -0.68, 0.72);
      clearActiveViewPreset();
    } else if (pointers.size === 2) {
      const newPinchDistance = currentPinchDistance();
      const referenceDistance = oldPinchDistance || previousPinchDistance;
      if (referenceDistance > 0 && newPinchDistance > 0) {
        orbit.targetRadius = clampRadius(orbit.targetRadius * (referenceDistance / newPinchDistance));
      }
      previousPinchDistance = newPinchDistance;
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
    orbit.targetRadius = clampRadius(orbit.targetRadius * Math.exp(event.deltaY * 0.0012));
    needsRender = true;
  }, { passive: false });
}

function currentPinchDistance() {
  if (pointers.size !== 2) return 0;
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampRadius(radius) {
  return THREE.MathUtils.clamp(radius, 1.85, 65);
}

function clearActiveViewPreset() {
  canvas.dataset.view = "custom";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.remove("is-active"));
}

function installResizeHandling() {
  const resize = () => {
    const width = Math.max(1, stageCard.clientWidth);
    const height = Math.max(1, stageCard.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 720 ? 1.4 : 1.8));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    canvas.dataset.viewport = `${width}x${height}`;
    needsRender = true;
  };
  new ResizeObserver(resize).observe(stageCard);
  window.addEventListener("orientationchange", resize);
  resize();
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  const damping = 0.13;
  const previousYaw = orbit.yaw;
  const previousPitch = orbit.pitch;
  const previousRadius = orbit.radius;
  orbit.yaw += shortestAngleDelta(orbit.yaw, orbit.targetYaw) * damping;
  orbit.pitch += (orbit.targetPitch - orbit.pitch) * damping;
  orbit.radius += (orbit.targetRadius - orbit.radius) * damping;

  const moved = Math.abs(orbit.yaw - previousYaw)
    + Math.abs(orbit.pitch - previousPitch)
    + Math.abs(orbit.radius - previousRadius) > 0.00005;
  if (!moved && !needsRender) return;

  const horizontalRadius = Math.cos(orbit.pitch) * orbit.radius;
  camera.position.set(
    Math.sin(orbit.yaw) * horizontalRadius,
    Math.sin(orbit.pitch) * orbit.radius,
    Math.cos(orbit.yaw) * horizontalRadius,
  );
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
  needsRender = moved;
}

function shortestAngleDelta(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function saveSelection() {
  const payload = selectionPayload();
  try {
    localStorage.setItem(SAVED_SELECTION_KEY, JSON.stringify(payload));
    savedSelection = payload;
    syncSavedCandidateLabel();
    saveStatus.textContent = `選択案 ${selectedId} / type: ${payload.type} / bodyProfile: ${payload.bodyProfile}。正式版には反映していません。`;
  } catch {
    saveStatus.textContent = "ブラウザ内への保存が許可されていません。JSONコピーをご利用ください。";
  }
}

async function copySelection() {
  const text = JSON.stringify(selectionPayload(), null, 2);
  copyFallback.value = text;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Clipboard timeout")), 900)),
    ]);
    saveStatus.textContent = `候補${selectedId}の選定JSONをコピーしました。`;
    copyFallback.hidden = true;
  } catch {
    copyFallback.hidden = false;
    copyFallback.focus();
    copyFallback.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    saveStatus.textContent = copied
      ? `候補${selectedId}の選定JSONをコピーしました。`
      : "自動コピーできませんでした。下のJSONを長押ししてコピーしてください。";
  }
}

function selectionPayload() {
  const candidate = candidateById(selectedId);
  return {
    schema: "assmagic-original-player-model-selection-v1",
    candidate: selectedId,
    file: `${MODEL_DIRECTORY}${candidate.file}`,
    type: candidate.type,
    bodyProfile: candidate.bodyProfile,
    notes: candidate.notes,
    direction: candidate.direction,
    clothingStyle: candidate.clothingStyle,
    mechanicalEquipment: candidate.mechanicalEquipment,
    spaceSuitElements: candidate.spaceSuitElements,
    toesExtended: candidate.toesExtended,
    dimensions: candidate.dimensions,
    triangleCount: candidate.triangleCount,
    byteLength: candidate.byteLength,
    rights: manifest.rights,
    productionStatus: "preview-only-unskinned-articulated-parts",
    savedAt: new Date().toISOString(),
  };
}

function syncSavedCandidateLabel() {
  if (!savedSelection?.candidate) {
    savedCandidate.textContent = "未保存";
    savedCandidate.classList.remove("has-selection");
    return;
  }
  savedCandidate.textContent = `保存済 ${savedSelection.candidate}`;
  savedCandidate.classList.add("has-selection");
}

function persistViewState() {
  try {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      candidate: selectedId,
      comparison: comparisonId,
      size: selectedSize,
      background: selectedBackground,
    }));
  } catch {
    // Preview state persistence is optional.
  }
}

function readJsonStorage(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
