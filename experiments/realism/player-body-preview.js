import * as THREE from "../../three.module.js";
import { createFlightPlayer } from "./whole-planet-player.js?v=realism-47";

// Preview-only values. Nothing in this file is imported by the game.
export const BODY_PRESETS = Object.freeze({
  current: Object.freeze({
    id: "current",
    label: "CURRENT",
    shortLabel: "現状",
    description: "現在公開中のモデル。公式の読込・腕延長・飛行姿勢をそのまま表示します。",
    chestWidth: 1,
    chestDepth: 1,
    midWidth: 1,
    waistWidth: 1,
  }),
  a: Object.freeze({
    id: "a",
    label: "TYPE A",
    shortLabel: "控えめ",
    description: "上胸をわずかに広げた、現状との差が最も穏やかな候補です。",
    chestWidth: 1.08,
    chestDepth: 1.05,
    midWidth: 1.03,
    waistWidth: 1,
  }),
  b: Object.freeze({
    id: "b",
    label: "TYPE B",
    shortLabel: "標準",
    description: "肩先や腕の長さを保ったまま、胸郭と胴中央に安定感を足した候補です。",
    chestWidth: 1.12,
    chestDepth: 1.08,
    midWidth: 1.05,
    waistWidth: 1.01,
  }),
  c: Object.freeze({
    id: "c",
    label: "TYPE C",
    shortLabel: "強め",
    description: "上胸の横幅を最も強くした候補。遠景でも体幹の存在感が残ります。",
    chestWidth: 1.16,
    chestDepth: 1.1,
    midWidth: 1.07,
    waistWidth: 1.02,
  }),
  d: Object.freeze({
    id: "d",
    label: "TYPE D",
    shortLabel: "厚胸",
    description: "横幅はCより抑え、胸郭の奥行きを最も強くした立体的な候補です。",
    chestWidth: 1.13,
    chestDepth: 1.12,
    midWidth: 1.04,
    waistWidth: 1,
  }),
});

const MODEL_URL = "./assets/models/cesium-man.glb";
const SAVED_SELECTION_KEY = "assmagic.playerBodyPreview.selection.v1";
const VIEW_STATE_KEY = "assmagic.playerBodyPreview.view.v1";
const PRESET_IDS = Object.keys(BODY_PRESETS);
const SHAPE_KEYS = ["chestWidth", "chestDepth", "midWidth", "waistWidth"];
const SIZE_MULTIPLIERS = Object.freeze({
  close: 0.88,
  whole: 1.72,
  phone: 22,
});
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
const activeName = document.querySelector("#active-name");
const modelSource = document.querySelector("#model-source");
const candidateList = document.querySelector("#candidate-list");
const candidateDescription = document.querySelector("#candidate-description");
const savedCandidate = document.querySelector("#saved-candidate");
const compareHold = document.querySelector("#compare-hold");
const resetButton = document.querySelector("#reset-button");
const chooseButton = document.querySelector("#choose-button");
const copyButton = document.querySelector("#copy-button");
const saveStatus = document.querySelector("#save-status");
const copyFallback = document.querySelector("#copy-fallback");
const sliderInputs = [...document.querySelectorAll("[data-control]")];
const sliderOutputs = new Map(
  [...document.querySelectorAll("[data-output]")].map((element) => [element.dataset.output, element]),
);
const measurementOutputs = new Map(
  [...document.querySelectorAll("[data-measure]")].map((element) => [element.dataset.measure, element]),
);

const storedView = readJsonStorage(VIEW_STATE_KEY);
let selectedId = PRESET_IDS.includes(storedView?.candidate) ? storedView.candidate : "b";
let selectedValues = shapeFromPreset(BODY_PRESETS[selectedId]);
let selectedSize = SIZE_MULTIPLIERS[storedView?.size] ? storedView.size : "whole";
let selectedBackground = storedView?.background === "sky" ? "sky" : "neutral";
let savedSelection = readJsonStorage(SAVED_SELECTION_KEY);
let comparing = false;
let rig = null;
let skinnedMesh = null;
let deformation = null;
let baselineMeasurements = null;
let baseHeight = 2.6;
let modelReady = false;
let shapeFrame = 0;
let needsRender = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(37, 1, 0.01, 120);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 720 ? 1.45 : 1.8));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;

const hemisphere = new THREE.HemisphereLight(0xe7eef0, 0x262219, 2.15);
scene.add(hemisphere);
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
  new THREE.MeshBasicMaterial({
    color: 0x090b09,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }),
);
contactShadow.rotation.x = -Math.PI * 0.5;
contactShadow.scale.set(0.8, 0.35, 1);
scene.add(contactShadow);

const orbit = {
  yaw: VIEW_ANGLES.front.yaw,
  pitch: VIEW_ANGLES.front.pitch,
  radius: 4.5,
  targetYaw: VIEW_ANGLES.front.yaw,
  targetPitch: VIEW_ANGLES.front.pitch,
  targetRadius: 4.5,
  targetY: 0,
  desiredTargetY: 0,
};
const cameraTarget = new THREE.Vector3();
const shoulderLeftPosition = new THREE.Vector3();
const shoulderRightPosition = new THREE.Vector3();
const pointers = new Map();
let previousPinchDistance = 0;

canvas.dataset.view = "front";
buildCandidateButtons();
syncSavedCandidateLabel();
syncCandidateUi();
syncSizeUi();
syncBackgroundUi();
installUiEvents();
installOrbitControls();
installResizeHandling();
loadOfficialPlayer();
requestAnimationFrame(renderFrame);

async function loadOfficialPlayer() {
  try {
    rig = createFlightPlayer(scene, {
      modelUrl: MODEL_URL,
      castShadow: false,
    });
    rig.player.visible = false;
    await rig.ready;

    skinnedMesh = findSkinnedMesh(rig.modelVisual);
    if (!skinnedMesh) throw new Error("The official player did not contain a SkinnedMesh.");

    // The helper has already applied the official 1.44 arm extension and flight pose.
    // This root-only rotation stands that finished pose upright for inspection.
    rig.player.rotation.x = -Math.PI * 0.5;
    rig.player.position.set(0, 0, 0);
    rig.player.updateMatrixWorld(true);

    deformation = createTorsoDeformation(skinnedMesh);
    canvas.dataset.torsoProfile = JSON.stringify(deformation.profile);
    applyGeometryShape(shapeFromPreset(BODY_PRESETS.current), false);
    centerPlayerFromSkinnedBounds();
    baselineMeasurements = measurePlayer();
    canvas.dataset.baselineMeasurements = JSON.stringify(
      Object.fromEntries(
        Object.entries(baselineMeasurements).map(([key, value]) => [key, Number(value.toFixed(6))]),
      ),
    );
    baseHeight = baselineMeasurements.height;
    positionContactShadow();

    modelReady = true;
    canvas.dataset.modelReady = "true";
    canvas.dataset.sourceModel = "cesium-man.glb";
    canvas.dataset.officialLoader = "whole-planet-player.js";
    canvas.dataset.armExtension = "1.44";
    canvas.dataset.torsoVertices = String(deformation.activeVertexCount);
    rig.player.visible = true;
    setSize(selectedSize, false);
    applyGeometryShape(selectedValues);
    loadingPanel.classList.add("is-hidden");
    needsRender = true;
  } catch (error) {
    console.error("Player body preview failed to initialize.", error);
    modelSource.textContent = "MODEL LOAD ERROR";
    loadingPanel.querySelector("strong").textContent = "MODEL LOAD ERROR";
    loadingPanel.querySelector("small").textContent = "現行プレイヤーモデルを読み込めませんでした";
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
    const joints = [
      skinIndex.getX(index),
      skinIndex.getY(index),
      skinIndex.getZ(index),
      skinIndex.getW(index),
    ];
    const weights = [
      skinWeight.getX(index),
      skinWeight.getY(index),
      skinWeight.getZ(index),
      skinWeight.getW(index),
    ];
    for (let influence = 0; influence < 4; influence += 1) {
      if (joints[influence] <= 2) torsoWeight += weights[influence];
      else otherWeight += weights[influence];
    }

    const z = basePositions[index * 3 + 2];
    // Keep distal arm vertices untouched while allowing the chest/shoulder seam
    // (which naturally shares torso and arm weights) to follow the rib cage.
    const anatomyWeight = smoothstep(0.025, 0.5, torsoWeight)
      * (1 - otherWeight * 0.18);
    const lowerFade = smoothstep(0.62, 0.75, z);
    const upperFade = 1 - smoothstep(1.1, 1.18, z);
    const mask = anatomyWeight * lowerFade * upperFade;
    masks[index] = mask;
    if (mask > 0.03) {
      activeVertexCount += 1;
      const centerSampleWeight = mask * smoothstep(0.69, 0.79, z)
        * (1 - smoothstep(1.17, 1.29, z));
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
    profile: buildTorsoProfile(basePositions, masks),
  };
}

function buildTorsoProfile(basePositions, masks) {
  const profile = [];
  for (let center = 0.68; center <= 1.28; center += 0.04) {
    const section = createSectionAccumulator();
    for (let index = 0; index < masks.length; index += 1) {
      const offset = index * 3;
      if (masks[index] < 0.24 || Math.abs(basePositions[offset + 2] - center) > 0.022) continue;
      includeSectionPoint(section, basePositions[offset + 1], basePositions[offset]);
    }
    profile.push({
      z: Number(center.toFixed(2)),
      width: Number(sectionWidth(section, "width").toFixed(4)),
      depth: Number(sectionWidth(section, "depth").toFixed(4)),
      count: section.widths.length,
    });
  }
  return profile;
}

function applyGeometryShape(values, updateInterface = true) {
  if (!deformation) return;
  const { position, basePositions, masks, depthCenter, geometry } = deformation;

  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    const mask = masks[index];
    const compensatedMidWidth = 1 + (values.midWidth - 1) * 1.15;

    let targetWidth;
    if (z < 0.94) {
      targetWidth = THREE.MathUtils.lerp(
        values.waistWidth,
        compensatedMidWidth,
        smoothstep(0.78, 0.94, z),
      );
    } else {
      // Skinning blends upper-chest vertices into the fixed shoulder/arm bones.
      // Compensate only inside the preview so the visible section reaches the
      // requested ratio without moving those bones or changing fingertip span.
      const compensatedChestWidth = 1 + (values.chestWidth - 1) * 3.1;
      targetWidth = THREE.MathUtils.lerp(
        compensatedMidWidth,
        compensatedChestWidth,
        smoothstep(0.94, 1.05, z),
      );
    }
    const lowerDepth = 1 + (values.waistWidth - 1) * 0.32;
    const compensatedChestDepth = 1 + (values.chestDepth - 1) * 1.02;
    const targetDepth = THREE.MathUtils.lerp(
      lowerDepth,
      compensatedChestDepth,
      smoothstep(0.78, 1.05, z),
    );
    const widthScale = 1 + (targetWidth - 1) * mask;
    const depthScale = 1 + (targetDepth - 1) * mask;

    position.setXYZ(
      index,
      depthCenter + (x - depthCenter) * depthScale,
      y * widthScale,
      z,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  skinnedMesh.updateMatrixWorld(true);

  if (updateInterface && baselineMeasurements) {
    const measured = measurePlayer();
    showMeasurementRatios(measured);
  }
  canvas.dataset.activeCandidate = comparing ? "current-compare" : selectedId;
  canvas.dataset.shape = JSON.stringify(values);
  needsRender = true;
}

function centerPlayerFromSkinnedBounds() {
  const bounds = sampleSkinnedBounds();
  const center = bounds.getCenter(new THREE.Vector3());
  rig.player.position.sub(center);
  rig.player.updateMatrixWorld(true);
}

function positionContactShadow() {
  const bounds = sampleSkinnedBounds();
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

function measurePlayer() {
  const worldBounds = sampleSkinnedBounds();
  const currentPositions = deformation.position;
  const basePositions = deformation.basePositions;
  const masks = deformation.masks;
  const sections = {
    chest: createSectionAccumulator(),
    mid: createSectionAccumulator(),
    waist: createSectionAccumulator(),
  };

  for (let index = 0; index < currentPositions.count; index += 1) {
    if (masks[index] < 0.24) continue;
    const baseZ = basePositions[index * 3 + 2];
    let section = null;
    if (baseZ >= 1.02 && baseZ <= 1.1) section = sections.chest;
    else if (baseZ >= 0.87 && baseZ <= 0.96) section = sections.mid;
    else if (baseZ >= 0.74 && baseZ <= 0.82) section = sections.waist;
    if (!section) continue;
    includeSectionPoint(
      section,
      currentPositions.getY(index),
      currentPositions.getX(index),
    );
  }

  const size = worldBounds.getSize(new THREE.Vector3());
  const leftShoulder = rig.modelVisual.getObjectByName("Skeleton_arm_joint_L__4_");
  const rightShoulder = rig.modelVisual.getObjectByName("Skeleton_arm_joint_R");
  let shoulderWidth = 0;
  if (leftShoulder && rightShoulder) {
    leftShoulder.getWorldPosition(shoulderLeftPosition);
    rightShoulder.getWorldPosition(shoulderRightPosition);
    shoulderWidth = shoulderLeftPosition.distanceTo(shoulderRightPosition);
  }
  return {
    height: size.y,
    // Arms are in the official Superman pose, so the complete X span is the fingertip span.
    armSpan: size.x,
    shoulderWidth: shoulderWidth || sectionWidth(sections.chest, "width"),
    chestWidth: sectionWidth(sections.chest, "width"),
    chestDepth: sectionWidth(sections.chest, "depth"),
    midWidth: sectionWidth(sections.mid, "width"),
    waistWidth: sectionWidth(sections.waist, "width"),
  };
}

function createSectionAccumulator() {
  return {
    widths: [],
    depths: [],
  };
}

function includeSectionPoint(section, width, depth) {
  section.widths.push(width);
  section.depths.push(depth);
}

function sectionWidth(section, axis) {
  const values = axis === "width" ? section.widths : section.depths;
  if (values.length < 2) return 0;
  values.sort((a, b) => a - b);
  const low = quantile(values, 0.04);
  const high = quantile(values, 0.96);
  return high - low;
}

function showMeasurementRatios(measured) {
  for (const [key, element] of measurementOutputs) {
    const baseline = baselineMeasurements[key];
    const ratio = baseline > 0 ? measured[key] / baseline : 1;
    element.textContent = ratio.toFixed(3);
    element.dataset.ratio = ratio.toFixed(6);
    canvas.dataset[`ratio${key[0].toUpperCase()}${key.slice(1)}`] = ratio.toFixed(6);
  }
}

function buildCandidateButtons() {
  for (const preset of Object.values(BODY_PRESETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate-button";
    button.dataset.candidate = preset.id;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<strong>${preset.id === "current" ? "0" : preset.id.toUpperCase()}</strong>`
      + `<small>${preset.shortLabel}</small>`;
    button.addEventListener("click", () => selectCandidate(preset.id));
    candidateList.append(button);
  }
}

function selectCandidate(id) {
  if (!BODY_PRESETS[id]) return;
  stopComparing();
  selectedId = id;
  selectedValues = shapeFromPreset(BODY_PRESETS[id]);
  syncCandidateUi();
  if (modelReady) applyGeometryShape(selectedValues);
  persistViewState();
}

function syncCandidateUi() {
  const preset = BODY_PRESETS[selectedId];
  for (const button of candidateList.querySelectorAll("[data-candidate]")) {
    const active = button.dataset.candidate === selectedId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  candidateDescription.textContent = preset.description;
  activeName.textContent = preset.label;
  for (const input of sliderInputs) {
    input.value = selectedValues[input.dataset.control];
  }
  syncSliderOutputs();
}

function syncSliderOutputs() {
  for (const input of sliderInputs) {
    sliderOutputs.get(input.dataset.control).textContent = Number(input.value).toFixed(3);
  }
}

function installUiEvents() {
  for (const input of sliderInputs) {
    input.addEventListener("input", () => {
      stopComparing();
      selectedValues[input.dataset.control] = Number(input.value);
      syncSliderOutputs();
      activeName.textContent = `${BODY_PRESETS[selectedId].label} / CUSTOM`;
      if (shapeFrame) cancelAnimationFrame(shapeFrame);
      shapeFrame = requestAnimationFrame(() => {
        shapeFrame = 0;
        applyGeometryShape(selectedValues);
      });
    });
    input.addEventListener("change", persistViewState);
  }

  resetButton.addEventListener("click", () => {
    stopComparing();
    selectedValues = shapeFromPreset(BODY_PRESETS[selectedId]);
    syncCandidateUi();
    if (modelReady) applyGeometryShape(selectedValues);
    persistViewState();
  });

  compareHold.addEventListener("pointerdown", startComparing);
  compareHold.addEventListener("pointerup", stopComparing);
  compareHold.addEventListener("pointercancel", stopComparing);
  compareHold.addEventListener("pointerleave", (event) => {
    if (event.buttons) stopComparing();
  });
  compareHold.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) startComparing(event);
  });
  compareHold.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stopComparing(event);
  });
  compareHold.addEventListener("contextmenu", (event) => event.preventDefault());

  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }
  for (const button of document.querySelectorAll("[data-size]")) {
    button.addEventListener("click", () => setSize(button.dataset.size));
  }
  for (const button of document.querySelectorAll("[data-background]")) {
    button.addEventListener("click", () => setBackground(button.dataset.background));
  }

  chooseButton.addEventListener("click", chooseCurrentSelection);
  copyButton.addEventListener("click", copyCurrentSettings);
}

function startComparing(event) {
  event?.preventDefault();
  if (!modelReady || comparing || selectedId === "current") return;
  comparing = true;
  compareHold.classList.add("is-comparing");
  compareHold.setAttribute("aria-pressed", "true");
  activeName.textContent = "CURRENT / HOLD";
  applyGeometryShape(shapeFromPreset(BODY_PRESETS.current));
  canvas.dataset.compare = "current";
}

function stopComparing(event) {
  event?.preventDefault();
  if (!comparing) return;
  comparing = false;
  compareHold.classList.remove("is-comparing");
  compareHold.setAttribute("aria-pressed", "false");
  activeName.textContent = BODY_PRESETS[selectedId].label;
  applyGeometryShape(selectedValues);
  canvas.dataset.compare = "candidate";
}

function setView(viewName) {
  const view = VIEW_ANGLES[viewName];
  if (!view) return;
  orbit.targetYaw = nearestEquivalentAngle(view.yaw, orbit.yaw);
  orbit.targetPitch = view.pitch;
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  }
  canvas.dataset.view = viewName;
  needsRender = true;
}

function setSize(sizeName, persist = true) {
  if (!SIZE_MULTIPLIERS[sizeName]) return;
  selectedSize = sizeName;
  orbit.targetRadius = THREE.MathUtils.clamp(
    baseHeight * SIZE_MULTIPLIERS[sizeName],
    baseHeight * 0.58,
    baseHeight * 28,
  );
  orbit.desiredTargetY = sizeName === "close" ? baseHeight * 0.08 : 0;
  canvas.dataset.size = sizeName;
  syncSizeUi();
  if (persist) persistViewState();
  needsRender = true;
}

function syncSizeUi() {
  for (const button of document.querySelectorAll("[data-size]")) {
    button.classList.toggle("is-active", button.dataset.size === selectedSize);
  }
}

function setBackground(backgroundName) {
  selectedBackground = backgroundName === "sky" ? "sky" : "neutral";
  syncBackgroundUi();
  persistViewState();
  needsRender = true;
}

function syncBackgroundUi() {
  stageCard.classList.toggle("is-sky", selectedBackground === "sky");
  contactShadow.material.opacity = selectedBackground === "sky" ? 0.16 : 0.24;
  canvas.dataset.background = selectedBackground;
  for (const button of document.querySelectorAll("[data-background]")) {
    button.classList.toggle("is-active", button.dataset.background === selectedBackground);
  }
}

function makeSelectionPayload() {
  if (!modelReady) return;
  const measured = measurePlayer();
  const ratios = {};
  for (const key of Object.keys(measured)) {
    ratios[key] = baselineMeasurements[key] > 0
      ? Number((measured[key] / baselineMeasurements[key]).toFixed(6))
      : 1;
  }
  return {
    version: 1,
    candidate: selectedId,
    label: BODY_PRESETS[selectedId].label,
    values: { ...selectedValues },
    measuredRatios: ratios,
    sourceModel: MODEL_URL,
    officialLoader: "./whole-planet-player.js",
    officialArmExtension: 1.44,
    officialFilesModified: false,
    savedAt: new Date().toISOString(),
  };
}

function makeCopyPayload() {
  return {
    preset: selectedId === "current" ? "CURRENT" : selectedId.toUpperCase(),
    upperChestWidth: Number(selectedValues.chestWidth.toFixed(3)),
    chestDepth: Number(selectedValues.chestDepth.toFixed(3)),
    midTorsoWidth: Number(selectedValues.midWidth.toFixed(3)),
    waistWidth: Number(selectedValues.waistWidth.toFixed(3)),
  };
}

function chooseCurrentSelection() {
  const payload = makeSelectionPayload();
  if (!payload) return;
  localStorage.setItem(SAVED_SELECTION_KEY, JSON.stringify(payload));
  savedSelection = payload;
  syncSavedCandidateLabel();
  saveStatus.textContent = selectionSummary("選択案");
  chooseButton.textContent = "選択を保存しました";
  window.setTimeout(() => {
    chooseButton.textContent = "この案を選ぶ";
  }, 1600);
}

async function copyCurrentSettings() {
  const text = JSON.stringify(makeCopyPayload(), null, 2);
  let copied = false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable.");
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error("Clipboard permission timed out.")),
        900,
      )),
    ]);
    copied = true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      copied = typeof document.execCommand === "function" && document.execCommand("copy");
      textarea.remove();
    } catch {
      copied = false;
    }
  }
  saveStatus.textContent = copied
    ? `${selectionSummary("設定をコピー")} / 公式版は未変更です。`
    : `${selectionSummary("コピー対象")} / 下のJSONを長押ししてコピーできます。`;
  copyFallback.hidden = copied;
  copyFallback.value = text;
  if (!copied) {
    copyFallback.focus();
    copyFallback.select();
  }
  copyButton.textContent = copied ? "コピーしました" : "コピーできませんでした";
  window.setTimeout(() => {
    copyButton.textContent = "設定値をコピー";
  }, 1600);
}

function selectionSummary(prefix) {
  const preset = selectedId === "current" ? "CURRENT" : selectedId.toUpperCase();
  return `${prefix}：${preset}`
    + ` / chestWidth ${selectedValues.chestWidth.toFixed(3)}`
    + ` / chestDepth ${selectedValues.chestDepth.toFixed(3)}`
    + ` / midWidth ${selectedValues.midWidth.toFixed(3)}`
    + ` / waistWidth ${selectedValues.waistWidth.toFixed(3)}`;
}

function syncSavedCandidateLabel() {
  if (!savedSelection?.candidate || !BODY_PRESETS[savedSelection.candidate]) {
    savedCandidate.textContent = "未保存";
    return;
  }
  savedCandidate.textContent = `保存済み：${BODY_PRESETS[savedSelection.candidate].label}`;
}

function installOrbitControls() {
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousPinchDistance = currentPinchDistance();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const previous = pointers.get(event.pointerId);
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);

    if (pointers.size === 1) {
      orbit.targetYaw -= (next.x - previous.x) * 0.007;
      orbit.targetPitch = THREE.MathUtils.clamp(
        orbit.targetPitch + (next.y - previous.y) * 0.0045,
        -0.56,
        0.58,
      );
      clearActiveViewPreset();
    } else if (pointers.size === 2) {
      const distance = currentPinchDistance();
      if (previousPinchDistance > 0 && distance > 0) {
        orbit.targetRadius = THREE.MathUtils.clamp(
          orbit.targetRadius * (previousPinchDistance / distance),
          baseHeight * 0.58,
          baseHeight * 28,
        );
      }
      previousPinchDistance = distance;
    }
    needsRender = true;
  }, { passive: false });

  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    previousPinchDistance = currentPinchDistance();
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.targetRadius = THREE.MathUtils.clamp(
      orbit.targetRadius * Math.exp(event.deltaY * 0.0011),
      baseHeight * 0.58,
      baseHeight * 28,
    );
    needsRender = true;
  }, { passive: false });

  canvas.addEventListener("dblclick", () => setView("front"));
}

function currentPinchDistance() {
  if (pointers.size !== 2) return 0;
  const [first, second] = [...pointers.values()];
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function clearActiveViewPreset() {
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.remove("is-active");
  }
}

function installResizeHandling() {
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, width < 720 ? 1.45 : 1.8);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    canvas.dataset.pixelRatio = pixelRatio.toFixed(2);
    needsRender = true;
  };
  new ResizeObserver(resize).observe(stageCard);
  resize();
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  if (document.hidden) return;
  const yawDifference = orbit.targetYaw - orbit.yaw;
  const pitchDifference = orbit.targetPitch - orbit.pitch;
  const radiusDifference = orbit.targetRadius - orbit.radius;
  const targetYDifference = orbit.desiredTargetY - orbit.targetY;
  const moving = Math.abs(yawDifference) > 0.0001
    || Math.abs(pitchDifference) > 0.0001
    || Math.abs(radiusDifference) > 0.0001
    || Math.abs(targetYDifference) > 0.0001;
  if (moving) {
    orbit.yaw += yawDifference * 0.13;
    orbit.pitch += pitchDifference * 0.13;
    orbit.radius += radiusDifference * 0.14;
    orbit.targetY += targetYDifference * 0.12;
    needsRender = true;
  }
  if (!needsRender) return;

  cameraTarget.set(0, orbit.targetY, 0);
  const horizontalRadius = Math.cos(orbit.pitch) * orbit.radius;
  camera.position.set(
    Math.sin(orbit.yaw) * horizontalRadius,
    orbit.targetY + Math.sin(orbit.pitch) * orbit.radius,
    Math.cos(orbit.yaw) * horizontalRadius,
  );
  camera.lookAt(cameraTarget);
  renderer.render(scene, camera);
  needsRender = moving;
}

function persistViewState() {
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
    candidate: selectedId,
    values: { ...selectedValues },
    size: selectedSize,
    background: selectedBackground,
  }));
}

function shapeFromPreset(preset) {
  return Object.fromEntries(SHAPE_KEYS.map((key) => [key, preset[key]]));
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function smoothstep(min, max, value) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function quantile(sortedValues, amount) {
  const position = (sortedValues.length - 1) * amount;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return THREE.MathUtils.lerp(sortedValues[lower], sortedValues[upper], mix);
}

function nearestEquivalentAngle(target, current) {
  const turns = Math.round((current - target) / (Math.PI * 2));
  return target + turns * Math.PI * 2;
}
