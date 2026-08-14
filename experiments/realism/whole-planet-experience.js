import * as THREE from "../../three.module.js";
import { playlist } from "../../playlist.js?v=music-services-5";
import { supabaseConfig } from "../../supabase-config.js";
import {
  EXPERIENCE_MODE,
  EXPERIENCE_MODE_SELECTED_EVENT,
} from "./experience-mode.js?v=chill-mode-1";

const CHILL_AUDIO_URL = "./assets/audio/chill-mode.mp3";
const BOOK_CACHE_KEY = "ass-magic-book-messages-v1";
const BOOK_PLAYER_KEY = "ass-magic-book-player-v1";
const BOOK_FETCH_PAGE_SIZE = 200;
const BOOK_FETCH_MAX_ROWS = 5000;
const HIDDEN_BOOK_AUTHOR = "__return_history__";
const EXCLUDED_BOOK_NAMES = new Set([
  "サーモンユッケ伯爵",
  "揚げパン大王",
  "道夫",
  "トリケラトプさん",
]);
const CONTACTS = [
  { id: "blackSphere", radius: 24 },
  { id: "whiteSphere", radius: 24 },
  { id: "recordPlayer", radius: 31 },
  { id: "book", radius: 64 },
  { id: "compass", radius: 17 },
  // The sanctuary is a tall, radial structure: its upper rings and outer
  // towers extend well beyond the group's surface anchor. Use a sphere that
  // covers every physical part plus a small approach margin.
  { id: "sanctuary", radius: 88 },
  { id: "blackBox", radius: 8 },
];
const SPACE_RETURN_ALTITUDE = 150;
const SPACE_RETURN_AXIS_DISTANCE = 260;
const SPACE_RETURN_BEAM_RADIUS = 180;
const EARTH_REVEAL_AXIS_DISTANCE = 680;
const EARTH_CONTACT_DISTANCE = 135;
const EARTH_BASE_SIZE = 170;
const EARTH_GLOW_SIZE = 310;
const SPACE_TRANSITION_RATE = 1.45;
const LOCAL_Y_AXIS = new THREE.Vector3(0, 1, 0);
const RETURN_HISTORY_PREFIX = "__return_history__:";
const RETURN_HISTORY_STORAGE_KEY = "ass-magic-return-histories-v1";
const ENDING_ROLL_DURATION = 46;
const ENDING_WHITEOUT_DURATION = 1050;
const ENDING_BLACK_DELAY = 650;
const ENDING_TRUE_MESSAGE_DURATION = 2200;
const ENDING_ROLL_AUDIO_DELAY = 2000;
const CAT_ROUTE_JOIN_DURATION = 1.75;
const CAT_ROUTE_ROTATION_RESPONSE = 7.2;
const CAT_ROUTE_COMPANION_SCALE = 0.1512;
const CAT_ROUTE_MOUNT_SIDE = 0.46;
const CAT_ROUTE_MOUNT_HEIGHT = 0.13;
const CAT_ROUTE_MOUNT_FORWARD = 0.62;
const DEVIL_SPAWN_DELAY = 5;
const DEVIL_ENTRY_DURATION = 1.2;
const DEVIL_ENTRY_FORWARD = 20;
const DEVIL_ENTRY_SIDE = 34;
const DEVIL_SPAWN_DISTANCE = 50;
const DEVIL_SPAWN_SIDE = 8;
const DEVIL_SPAWN_HEIGHT = 3.1;
const DEVIL_NOTICE_RADIUS = 30;
// The full-planet experiment flies faster than the production globe, so cap fleeing
// relative to that speed instead of making the encounter effectively unwinnable.
const DEVIL_FLEE_FAST_GAP = -14;
const DEVIL_FLEE_SLOW_GAP = 6;
const DEVIL_FLEE_SPEED_PULSE = 1.15;
const DEVIL_FLEE_ACCEL_SHARPNESS = 4.4;
const DEVIL_FLEE_MIN_SPEED = 12;
const DEVIL_FLEE_MAX_SPEED = 56;
const DEVIL_FLEE_TURN_RESPONSE = 1.82;
const DEVIL_FLEE_WEAVE_SPEED = 1.35;
const DEVIL_FLEE_WEAVE_AMOUNT = 0.1;
const DEVIL_TERRAIN_RESPONSE = 4.2;
const CHILL_DEVIL_DELAY_MIN = 35;
const CHILL_DEVIL_DELAY_MAX = 75;
const CHILL_DEVIL_ROAM_SPEED = 9;
const CHILL_DEVIL_ROAM_SPEED_VARIATION = 2.4;
const CHILL_DEVIL_ROAM_TURN = 0.14;
// Realistic terrain adds vertical variation, so use a more forgiving encounter radius.
const DEVIL_CONTACT_RADIUS = 22;
const DEVIL_ASSIST_CONTACT_DELAY = 5;
const DEVIL_APPROACH_RESPONSE = 2.4;
const MONOCHROME_CHALLENGE_DURATION = 30;
const DEVIL_ROUTE_SPEED = 84;
const DEVIL_ROUTE_MIN_DURATION = 6.5;
const DEVIL_ROUTE_MAX_DURATION = 24;
const DEVIL_ROUTE_EASE_PEAK = 1.875;
const DEVIL_ROUTE_CLEARANCE = 18;
const DEVIL_ROUTE_LEAD_DISTANCE = 48;
const DEVIL_BLACK_BOX_ALTITUDE = 20;
const DEVIL_BLACK_BOX_ROUTE_CLEARANCE = 26;
const DEVIL_BLACK_BOX_ARRIVAL_LEAD = 3.2;
const DEVIL_BLACK_BOX_WAIT_TIMEOUT = 16;
const DEVIL_BLACK_BOX_CONTACT_RADIUS = 24;
const DEVIL_ROUTE_PLANNER = Object.freeze({
  low: { samples: 18, offsets: [0, -0.32, 0.32, -0.56, 0.56] },
  standard: { samples: 26, offsets: [0, -0.2, 0.2, -0.4, 0.4, -0.64, 0.64] },
  high: { samples: 36, offsets: [0, -0.16, 0.16, -0.32, 0.32, -0.52, 0.52, -0.74, 0.74] },
});
const DEVIL_DESTINATIONS = [
  { id: "recordPlayer", label: "レコードプレイヤー", stopDistance: 31, endAltitude: 5, focusHeight: 5 },
  { id: "book", label: "巨大な本", stopDistance: 48, endAltitude: 22, focusHeight: 34 },
  { id: "whiteSphere", label: "白い球体", stopDistance: 30, endAltitude: 40, focusHeight: 0 },
  { id: "blackSphere", label: "黒い球体", stopDistance: 30, endAltitude: 40, focusHeight: 0 },
  { id: "compass", label: "羅針盤", stopDistance: 15, endAltitude: 24, focusHeight: 0 },
  { id: "sanctuary", label: "太陽光式集光遠達装置", stopDistance: 72, endAltitude: 12, focusHeight: 18 },
  { id: "blackBox", label: "高速移動する黒い箱", stopDistance: 15, endAltitude: DEVIL_BLACK_BOX_ALTITUDE, focusHeight: 2, special: "blackBox" },
];
const DEVIL_ESCAPE_COPY = "昼のエリアに黒い球、夜のエリアに白い球がある。\n\nどちらかの球に触れた後、30秒以内にもう片方の球に触れることで昼夜が逆転する。\n\nその後、白い球の近くの巨大な装置を起動させれば脱出の道標が現れる。";
const DEVIL_DESTINATION_TRANSLATION_KEYS = Object.freeze({
  recordPlayer: "runtime.destination.recordPlayer",
  book: "runtime.destination.book",
  whiteSphere: "runtime.destination.whiteSphere",
  blackSphere: "runtime.destination.blackSphere",
  compass: "runtime.destination.compass",
  sanctuary: "runtime.destination.sanctuary",
  blackBox: "runtime.destination.blackBox",
});

function createDevilModel() {
  const devil = new THREE.Group();
  devil.name = "DevilGuide";
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0x17191b,
    emissive: 0xffffff,
    emissiveIntensity: 0.038,
    flatShading: true,
  });
  const hornMaterial = new THREE.MeshLambertMaterial({
    color: 0x101112,
    emissive: 0xffffff,
    emissiveIntensity: 0.034,
    flatShading: true,
  });
  const wingMaterial = new THREE.MeshLambertMaterial({
    color: 0x131517,
    emissive: 0xffffff,
    emissiveIntensity: 0.036,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const eyeMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.025,
  });
  const addSegment = (start, end, radius, material = bodyMaterial) => {
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(0.02, direction.length() - radius * 2), 3, 5),
      material,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(LOCAL_Y_AXIS, direction.normalize());
    devil.add(mesh);
    return mesh;
  };

  const spine = [
    new THREE.Vector3(0, -0.38, 0),
    new THREE.Vector3(0, 0, 0.04),
    new THREE.Vector3(0, 0.34, 0.24),
    new THREE.Vector3(0, 0.62, 0.62),
  ];
  addSegment(spine[0], spine[1], 0.19);
  addSegment(spine[1], spine[2], 0.205);
  addSegment(spine[2], spine[3], 0.22);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 5), bodyMaterial);
  shoulders.scale.set(1.38, 0.42, 0.62);
  shoulders.position.set(0, 0.62, 0.62);
  devil.add(shoulders);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), bodyMaterial);
  hips.scale.set(0.9, 0.56, 0.58);
  hips.position.y = -0.43;
  devil.add(hips);
  const tatteredWaist = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.86, 5, 1, true), bodyMaterial);
  tatteredWaist.position.y = -0.72;
  devil.add(tatteredWaist);
  addSegment(new THREE.Vector3(0, 0.64, 0.64), new THREE.Vector3(0, 0.78, 0.9), 0.105);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 7, 6), bodyMaterial);
  head.scale.set(0.78, 1.08, 0.82);
  head.position.set(0, 0.88, 1.05);
  head.rotation.x = 0.52;
  devil.add(head);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.08);
  wingShape.lineTo(0.72, 1.12);
  wingShape.lineTo(1.42, 1.54);
  wingShape.lineTo(2.25, 1.48);
  wingShape.lineTo(1.82, 0.92);
  wingShape.lineTo(2.5, 0.42);
  wingShape.lineTo(1.72, 0.2);
  wingShape.lineTo(2.18, -0.4);
  wingShape.lineTo(1.28, -0.18);
  wingShape.lineTo(1.02, -0.92);
  wingShape.lineTo(0.56, -0.34);
  wingShape.lineTo(0.14, -0.62);
  wingShape.closePath();
  const wingGeometry = new THREE.ShapeGeometry(wingShape, 1);
  const wingRoots = [];

  for (const side of [-1, 1]) {
    const hornBase = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.52, 5), hornMaterial);
    hornBase.position.set(side * 0.2, 1.07, 0.96);
    hornBase.rotation.x = 0.24;
    hornBase.rotation.z = side * -0.68;
    devil.add(hornBase);
    const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 5), hornMaterial);
    hornTip.position.set(side * 0.42, 1.19, 0.97);
    hornTip.rotation.x = 0.24;
    hornTip.rotation.z = side * -1.16;
    devil.add(hornTip);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), bodyMaterial);
    ear.position.set(side * 0.31, 0.9, 1.02);
    ear.rotation.x = 0.24;
    ear.rotation.z = side * -1.32;
    devil.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 3), eyeMaterial);
    eye.scale.set(1.7, 0.48, 0.48);
    eye.position.set(side * 0.095, 0.84, 1.3);
    devil.add(eye);
    const elbow = new THREE.Vector3(side * 0.7, 0.08, 0.72);
    addSegment(new THREE.Vector3(side * 0.4, 0.58, 0.62), elbow, 0.075);
    addSegment(elbow, new THREE.Vector3(side * 0.54, -0.4, 1), 0.058);
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 4), bodyMaterial);
    elbowJoint.position.copy(elbow);
    devil.add(elbowJoint);
    for (let clawIndex = -1; clawIndex <= 1; clawIndex += 1) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.27, 4), hornMaterial);
      claw.position.set(
        side * (0.54 + clawIndex * 0.035),
        -0.53,
        1.06 + clawIndex * 0.035,
      );
      claw.rotation.x = -0.45;
      claw.rotation.z = side * 0.1;
      devil.add(claw);
    }
    const knee = new THREE.Vector3(side * 0.34, -1.1, 0.34);
    addSegment(new THREE.Vector3(side * 0.18, -0.42, 0.02), knee, 0.1);
    addSegment(knee, new THREE.Vector3(side * 0.25, -1.68, -0.06), 0.072);
    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), bodyMaterial);
    kneeJoint.position.copy(knee);
    devil.add(kneeJoint);
    const talon = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 5), hornMaterial);
    talon.position.set(side * 0.27, -1.91, 0.13);
    talon.rotation.x = Math.PI * 0.5;
    devil.add(talon);
    const wingRoot = new THREE.Group();
    wingRoot.position.set(side * 0.28, 0.58, 0.48);
    wingRoot.rotation.x = 0.48;
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.scale.x = side;
    wingRoot.add(wing);
    wingRoots.push({ root: wingRoot, side });
    devil.add(wingRoot);
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, -0.52, -0.2),
    new THREE.Vector3(0.72, -0.82, -0.42),
    new THREE.Vector3(1.05, -0.28, -0.62),
    new THREE.Vector3(0.78, 0.22, -0.72),
  ]);
  devil.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.035, 4, false), bodyMaterial));
  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 3), hornMaterial);
  tailTip.position.set(0.79, 0.3, -0.73);
  tailTip.rotation.z = -0.42;
  devil.add(tailTip);
  const visibilityGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0.016,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
  }));
  visibilityGlow.position.set(0, 0.18, 0.28);
  visibilityGlow.scale.setScalar(7.4);
  visibilityGlow.renderOrder = 3;
  const visibilityLight = new THREE.PointLight(0xffffff, 26, 28, 1.9);
  visibilityLight.position.set(0, 0.24, 0.42);
  visibilityLight.castShadow = false;
  devil.add(visibilityGlow, visibilityLight);
  devil.userData.wingRoots = wingRoots;
  devil.userData.visibilityGlow = visibilityGlow;
  devil.userData.visibilityLight = visibilityLight;
  devil.userData.emissiveMaterials = [
    { material: bodyMaterial, nightIntensity: 0.038 },
    { material: hornMaterial, nightIntensity: 0.034 },
    { material: wingMaterial, nightIntensity: 0.036 },
    { material: eyeMaterial, nightIntensity: 0.025 },
  ];
  devil.scale.setScalar(0.62);
  devil.visible = false;
  return devil;
}

function resolveRootAsset(path) {
  if (!path) return "";
  return new URL(path, new URL("../../", import.meta.url)).href;
}

// Dynamic experience UI must resolve copy while it is created. The helper is
// deliberately display-only: it never changes routes, state, or event flow.
function t(key, fallback) {
  try {
    return window.assI18n?.text?.(key, fallback) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function setLocalizedText(element, key, fallback) {
  if (!element) return;
  element.dataset.assI18n = key;
  element.textContent = t(key, fallback);
}

function setLocalizedAriaLabel(element, key, fallback) {
  if (!element) return;
  element.dataset.assI18nAriaLabel = key;
  element.setAttribute("aria-label", t(key, fallback));
}

function getDevilDestinationLabel(destination, blackBoxOpened = false) {
  if (destination?.id === "blackBox" && blackBoxOpened) {
    return t("runtime.destination.blackBoxOpened", "黒い箱");
  }
  return t(DEVIL_DESTINATION_TRANSLATION_KEYS[destination?.id], destination?.label || "");
}

function createButton(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function normalizeBookEntry(entry) {
  if (!entry || typeof entry.message !== "string") return null;
  const name = typeof entry.name === "string" && entry.name.trim()
    ? entry.name.trim()
    : "anonymous";
  if (name === HIDDEN_BOOK_AUTHOR || EXCLUDED_BOOK_NAMES.has(name)) return null;
  return {
    id: String(entry.id ?? ""),
    name,
    message: entry.message,
    createdAt: String(entry.created_at ?? entry.createdAt ?? ""),
  };
}

function formatBookDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = window.assI18n?.getLanguage?.() === "en" ? "en-US" : "ja-JP";
  return date.toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createEarthTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const fallback = context.createRadialGradient(196, 174, 20, 256, 256, 248);
  fallback.addColorStop(0, "#a9ddff");
  fallback.addColorStop(0.46, "#287db4");
  fallback.addColorStop(0.86, "#0a2c61");
  fallback.addColorStop(1, "rgba(4,16,45,0)");
  context.fillStyle = fallback;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const crop = Math.min(image.width, image.height) * 0.92;
    const sourceX = (image.width - crop) * 0.5;
    const sourceY = (image.height - crop) * 0.49;
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(size * 0.5, size * 0.5, size * 0.492, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, sourceX, sourceY, crop, crop, 0, 0, size, size);
    context.restore();
    context.globalCompositeOperation = "destination-in";
    const mask = context.createRadialGradient(256, 256, 218, 256, 256, 256);
    mask.addColorStop(0, "rgba(255,255,255,1)");
    mask.addColorStop(0.94, "rgba(255,255,255,1)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = mask;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "source-over";
    texture.needsUpdate = true;
  };
  image.src = resolveRootAsset("./earth.jpg");
  return texture;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, "rgba(190,225,255,0.65)");
  gradient.addColorStop(0.42, "rgba(92,164,255,0.22)");
  gradient.addColorStop(1, "rgba(50,120,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function createEarthReturnVisual() {
  const earth = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createEarthTexture(),
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: 0xb9dcff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  earth.scale.setScalar(EARTH_BASE_SIZE);
  glow.scale.setScalar(EARTH_GLOW_SIZE);
  earth.visible = false;
  glow.visible = false;
  earth.frustumCulled = false;
  glow.frustumCulled = false;
  earth.renderOrder = 1;
  glow.renderOrder = 0;
  return { earth, glow };
}

function createSpaceStars() {
  const count = 72;
  const positions = new Float32Array(count * 3);
  let seed = 43891;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 90 + random() * 380;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 240 + random() * 3800;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf7fbff,
    size: 3.2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(geometry, material);
  stars.visible = false;
  stars.frustumCulled = false;
  return stars;
}

// This is the same rear-view companion silhouette used by the production flight.
// It stays lightweight because it is attached to the moving player every frame.
function createCatCompanionVisual() {
  const group = new THREE.Group();
  group.name = "CatRouteCompanion";
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f4ed, roughness: 0.96 });
  const shadeMaterial = new THREE.MeshStandardMaterial({ color: 0xded8cf, roughness: 1 });
  const brownMaterial = new THREE.MeshStandardMaterial({ color: 0x684432, roughness: 0.98 });
  const darkBrownMaterial = new THREE.MeshStandardMaterial({ color: 0x3a251e, roughness: 0.98 });
  const innerEarMaterial = new THREE.MeshStandardMaterial({ color: 0xe8bdb8, roughness: 0.92 });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c96c,
    emissive: 0x33451b,
    emissiveIntensity: 0.24,
    roughness: 0.4,
  });
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x090806, toneMapped: false });
  const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x5a302f, roughness: 0.72 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 22, 16), bodyMaterial);
  body.scale.set(0.92, 0.66, 1.78);
  body.position.set(0, 0.94, -0.08);
  group.add(body);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.86, 20, 14), shadeMaterial);
  shoulders.scale.set(0.86, 0.62, 0.96);
  shoulders.position.set(0, 1.05, 0.86);
  group.add(shoulders);

  for (const side of [-1, 1]) {
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), shadeMaterial);
    haunch.scale.set(0.78, 0.72, 1.08);
    haunch.position.set(side * 0.38, 0.88, -1.14);
    group.add(haunch);
  }

  const backPatch = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), brownMaterial);
  backPatch.scale.set(0.94, 0.28, 1.36);
  backPatch.position.set(0.12, 1.58, -0.52);
  backPatch.rotation.z = -0.08;
  group.add(backPatch);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.68, 22, 16), bodyMaterial);
  head.scale.set(0.86, 0.74, 0.8);
  head.position.set(0, 1.13, 1.72);
  group.add(head);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.48, 10), brownMaterial);
    ear.position.set(side * 0.29, 1.55, 1.86);
    ear.rotation.set(-0.1, 0, side * -0.2);
    group.add(ear);
    const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.29, 10), innerEarMaterial);
    earInner.position.set(side * 0.29, 1.51, 1.91);
    earInner.rotation.copy(ear.rotation);
    group.add(earInner);

    const hindLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.74, 5, 10), shadeMaterial);
    hindLeg.position.set(side * 0.34, 0.72, -1.62);
    hindLeg.rotation.x = Math.PI * 0.5;
    hindLeg.rotation.z = side * -0.16;
    group.add(hindLeg);

    const frontLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 5, 10), bodyMaterial);
    frontLeg.position.set(side * 0.28, 0.82, 2.04);
    frontLeg.rotation.x = Math.PI * 0.5;
    frontLeg.rotation.z = side * -0.08;
    group.add(frontLeg);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), eyeMaterial);
    eye.scale.set(1, 0.82, 0.42);
    eye.position.set(side * 0.21, 1.21, 2.23);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 7), pupilMaterial);
    pupil.scale.set(0.55, 1.15, 0.36);
    pupil.position.set(side * 0.21, 1.21, 2.275);
    group.add(pupil);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), bodyMaterial);
    muzzle.scale.set(1.08, 0.72, 0.68);
    muzzle.position.set(side * 0.11, 1.02, 2.27);
    group.add(muzzle);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), noseMaterial);
  nose.scale.set(1.15, 0.72, 0.62);
  nose.position.set(0, 1.04, 2.39);
  group.add(nose);

  const tailRoot = new THREE.Group();
  tailRoot.position.set(0.38, 1.05, -1.62);
  tailRoot.rotation.set(-1.02, 0.08, -0.38);
  group.add(tailRoot);
  const tailJoints = [];
  let tailParent = tailRoot;
  const tailLengths = [0.58, 0.58, 0.56, 0.52, 0.46, 0.4];
  for (let index = 0; index < tailLengths.length; index += 1) {
    const length = tailLengths[index];
    const radius = THREE.MathUtils.lerp(0.25, 0.14, index / (tailLengths.length - 1));
    const joint = new THREE.Group();
    tailParent.add(joint);
    const segment = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, length, 6, 12),
      index % 3 === 2 ? darkBrownMaterial : brownMaterial,
    );
    segment.position.y = length * 0.5;
    joint.add(segment);
    const fluff = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 12, 8), segment.material);
    fluff.scale.set(1.06, 1.28, 1.06);
    fluff.position.y = length;
    joint.add(fluff);
    tailJoints.push(joint);
    const next = new THREE.Group();
    next.position.y = length;
    joint.add(next);
    tailParent = next;
  }
  group.userData.tailRoot = tailRoot;
  group.userData.tailJoints = tailJoints;
  group.scale.setScalar(CAT_ROUTE_COMPANION_SCALE);
  group.visible = false;
  group.frustumCulled = false;
  return group;
}

export function createWholePlanetExperience({
  canvas,
  scene,
  camera,
  flight,
  playerObject = null,
  landmarks,
  getAltitude,
  getSurfaceRadius,
  isEnvironmentPhasing = null,
  isSkating = () => false,
  getExperienceMode = () => EXPERIENCE_MODE.MAIN,
  quality = "standard",
  onGuideSpeedChange,
  onWorldInversion,
}) {
  const musicRoot = document.querySelector("#experience-music");
  const artLink = document.querySelector("#experience-art-link");
  const art = document.querySelector("#experience-art");
  const title = document.querySelector("#experience-track-title");
  const playButton = document.querySelector("#experience-play");
  const nextButton = document.querySelector("#experience-next");
  const lyricsButton = document.querySelector("#experience-lyrics-toggle");
  const lyricsPanel = document.querySelector("#experience-lyrics");
  const lyricsText = document.querySelector("#experience-lyrics-text");
  const lyricsClose = document.querySelector("#experience-lyrics-close");
  const overlay = document.querySelector("#experience-overlay");
  const overlayTitle = document.querySelector("#experience-modal-title");
  const overlayBody = document.querySelector("#experience-modal-body");
  const overlayClose = document.querySelector("#experience-modal-close");
  const toast = document.querySelector("#experience-toast");
  const audio = document.querySelector("#experience-audio");
  const phaseAudioEngine = window.__realismPhaseAudioEngine || null;
  const isMainExperience = () => getExperienceMode() === EXPERIENCE_MODE.MAIN;
  const isChillExperience = () => getExperienceMode() === EXPERIENCE_MODE.CHILL;
  const bookOverlay = document.querySelector("#book-overlay");
  const bookBackdrop = document.querySelector("#book-backdrop");
  const bookClose = document.querySelector("#book-close");
  const bookViews = [...document.querySelectorAll(".book-view")];
  const bookViewButtons = [...document.querySelectorAll(".book-mode-btn")];
  const bookMessagePage = document.querySelector("#book-message-page");
  const bookNextPage = document.querySelector("#book-next-page");
  const bookForm = document.querySelector("#book-form");
  const bookName = document.querySelector("#book-name");
  const bookMessageInput = document.querySelector("#book-message-input");
  const bookSubmit = document.querySelector("#book-submit");
  const bookStatus = document.querySelector("#book-status");
  const blackBoxOverlay = document.querySelector("#black-box-overlay");
  const blackBoxBackdrop = document.querySelector("#black-box-backdrop");
  const blackBoxClose = document.querySelector("#black-box-close");
  const blackBoxOpen = document.querySelector("#black-box-open");
  const blackBoxIgnore = document.querySelector("#black-box-ignore");
  const blackBoxTitle = document.querySelector("#black-box-title");
  const blackBoxViews = [...document.querySelectorAll(".black-box-view")];
  const musicSelectorOverlay = document.querySelector("#music-selector-overlay");
  const musicSelectorBackdrop = document.querySelector("#music-selector-backdrop");
  const musicSelectorClose = document.querySelector("#music-selector-close");
  const musicSelectorNowPlaying = document.querySelector("#music-selector-now-playing");
  const musicSelectorList = document.querySelector("#music-selector-list");
  const endingWhiteout = document.querySelector("#ending-whiteout");
  const endingOverlay = document.querySelector("#ending-overlay");
  const endingRollTrack = document.querySelector("#ending-roll-track");
  const endingRestart = document.querySelector("#ending-restart-trigger");
  const endingReturnees = document.querySelector("#ending-returnees-list");
  const endingTrueReturnees = document.querySelector("#ending-true-returnees-list");
  const endingAudio = new Audio(resolveRootAsset("./森の羊水　piano 1 2.m4a"));
  endingAudio.preload = "auto";
  endingAudio.volume = 0.72;
  endingAudio.playsInline = true;
  endingAudio.crossOrigin = "anonymous";
  const earthArrivalAudio = new Audio(resolveRootAsset("./過去を思い出す.mp3"));
  earthArrivalAudio.preload = "auto";
  earthArrivalAudio.volume = 0.9;
  earthArrivalAudio.playsInline = true;
  earthArrivalAudio.crossOrigin = "anonymous";
  const spaceReturnAudio = new Audio(resolveRootAsset("./死後の世界.mp3"));
  spaceReturnAudio.preload = "auto";
  spaceReturnAudio.loop = true;
  spaceReturnAudio.volume = 0.78;
  spaceReturnAudio.playsInline = true;
  spaceReturnAudio.crossOrigin = "anonymous";
  const clockAudio = new Audio(resolveRootAsset("./振り子時計（エコー入り）.mp3"));
  clockAudio.loop = true;
  clockAudio.preload = "auto";
  clockAudio.volume = 0.48;
  clockAudio.playsInline = true;
  clockAudio.crossOrigin = "anonymous";
  const chillAudio = new Audio(new URL(CHILL_AUDIO_URL, import.meta.url).href);
  chillAudio.loop = true;
  chillAudio.preload = "auto";
  chillAudio.volume = 0.82;
  chillAudio.playsInline = true;
  chillAudio.crossOrigin = "anonymous";
  canvas.dataset.chillAudioLoop = String(chillAudio.loop);
  chillAudio.addEventListener("loadedmetadata", () => {
    canvas.dataset.chillAudioDuration = Number.isFinite(chillAudio.duration)
      ? chillAudio.duration.toFixed(2)
      : "unknown";
  });
  const challengeFlash = document.querySelector("#experience-theme-flash");
  const challengeTimer = document.querySelector("#experience-challenge-timer");

  const tracks = playlist
    .filter((track) => !track.disabled)
    .map((track) => ({
      ...track,
      lyricsPath: track.lyricsPath ?? (typeof track.src === "string"
        ? track.src.replace(/\/[^/]+\.(?:mp3|wav|m4a)$/i, "/lyrics.txt")
        : null),
    }));
  let currentTrackIndex = Math.max(0, tracks.findIndex((track) => track.initial));
  let randomTrackQueue = [];
  let audioUnlocked = false;
  let musicGesturePending = false;
  let lyricsRequest = 0;
  let toastTimer = 0;
  let closeAction = null;
  let activeNativeOverlay = null;
  let bookPageIndex = 0;
  let bookPages = [];
  let endingRollStart = 0;
  let endingAudioTimer = 0;
  let endingWhiteoutTimer = 0;
  let endingBlackTimer = 0;
  let challengeMusicWasPlaying = false;
  let compassAssist = 0;
  let compassAssistTarget = null;
  const contactState = new Map();
  const worldPosition = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const targetDirection = new THREE.Vector3();
  const playerUp = new THREE.Vector3();
  const targetTangent = new THREE.Vector3();
  const beamOffset = new THREE.Vector3();
  const beamClosestPoint = new THREE.Vector3();
  const radialUp = new THREE.Vector3();
  const projectedUp = new THREE.Vector3();
  const projectedForward = new THREE.Vector3();
  const devilUp = new THREE.Vector3();
  const devilRight = new THREE.Vector3();
  const devilForward = new THREE.Vector3();
  const devilTarget = new THREE.Vector3();
  const devilNdc = new THREE.Vector3();
  const devilBasis = new THREE.Matrix4();
  const devilAway = new THREE.Vector3();
  const devilDesired = new THREE.Vector3();
  const devilTravelAxis = new THREE.Vector3();
  const devilEvadeRight = new THREE.Vector3();
  const devilEntryInward = new THREE.Vector3();
  const devilDayDirection = landmarks.directions.day.clone().normalize();
  const devilRouteDirection = new THREE.Vector3();
  const devilRouteForward = new THREE.Vector3();
  const devilRouteTowardStart = new THREE.Vector3();
  const devilBlackBoxPreviousPosition = new THREE.Vector3();
  const devilBlackBoxSegment = new THREE.Vector3();
  const devilBlackBoxOffset = new THREE.Vector3();
  const devilBlackBoxClosestPoint = new THREE.Vector3();
  const devilPreviousAnchor = new THREE.Vector3();
  const devilRelativeStart = new THREE.Vector3();
  const devilRelativeEnd = new THREE.Vector3();
  const devilRelativeDelta = new THREE.Vector3();
  const devilClosestApproach = new THREE.Vector3();
  const catSourceUp = new THREE.Vector3();
  const catMountUp = new THREE.Vector3();
  const catMountForward = new THREE.Vector3();
  const catMountRight = new THREE.Vector3();
  const catDesiredPosition = new THREE.Vector3();
  const catTargetQuaternion = new THREE.Quaternion();
  const catBasis = new THREE.Matrix4();
  const earthVisual = createEarthReturnVisual();
  const spaceStars = createSpaceStars();
  const devilModel = createDevilModel();
  const catCompanion = createCatCompanionVisual();
  scene.add(earthVisual.glow, earthVisual.earth, spaceStars, devilModel, catCompanion);
  const state = {
    phase: "idle",
    challengeStart: null,
    challengeTimeRemaining: 0,
    worldInverted: false,
    blackBoxOpened: false,
    catFound: false,
    catRouteAvailable: false,
    catJoinPhase: "idle",
    catJoinElapsed: 0,
    catFollowing: false,
    catPendingJoin: false,
    catTailTime: 0,
    catJoinStart: new THREE.Vector3(),
    catPosition: new THREE.Vector3(),
    reachedEarthWithCat: false,
    returnRecorded: false,
    modalOpen: false,
    beamOrigin: new THREE.Vector3(),
    beamDirection: new THREE.Vector3(),
    earthPosition: new THREE.Vector3(),
    spaceUp: new THREE.Vector3(),
    spaceFlightActive: false,
    spaceTransition: 0,
    sanctuaryStartAltitude: 0,
    earthApproachStartDistance: 0,
    ending: false,
    debugForceSpace: false,
    devil: {
      phase: "delay",
      timer: new URLSearchParams(window.location.search).get("devildebug") === "1" ? 0.4 : DEVIL_SPAWN_DELAY,
      fleeTime: 0,
      encounterTime: 0,
      outOfViewTime: 0,
      hasBeenVisible: false,
      lastSide: -1,
      route: null,
      entryTime: 0,
      noticeGrace: 0,
      flightRadius: 0,
      flightForward: new THREE.Vector3(),
      anchorPosition: new THREE.Vector3(),
      anchorUp: new THREE.Vector3(0, 1, 0),
      lastPlayerPosition: new THREE.Vector3(),
      skateSuppressed: false,
      bobTime: 0,
      evadeWave: 0,
      chillRoamInitialized: false,
      chillRoamDebug: false,
      chillRoamTime: 0,
      chillRoamSeed: 0,
      navigation: {
        destination: null,
        elapsed: 0,
        duration: 0,
        timeout: 0,
        startAltitude: 0,
        endAltitude: 0,
        arcAngle: 0,
        waitElapsed: 0,
        interceptSeconds: 0,
        savedSpeedSelection: 40,
        savedSpeed: 40,
        startDirection: new THREE.Vector3(),
        endDirection: new THREE.Vector3(),
        routeAxis: new THREE.Vector3(),
        focusPoint: new THREE.Vector3(),
        pathDirections: [],
        pathRadii: [],
        pathCumulative: [],
        pathLength: 0,
        previousPathDistance: 0,
        routeRisk: 0,
        plannedSpeed: DEVIL_ROUTE_SPEED,
      },
    },
  };

  const stopUiPropagation = (event) => event.stopPropagation();
  for (const element of [
    musicRoot,
    lyricsPanel,
    overlay,
    bookOverlay,
    blackBoxOverlay,
    musicSelectorOverlay,
    endingOverlay,
  ]) {
    element?.addEventListener("pointerdown", stopUiPropagation);
    element?.addEventListener("click", stopUiPropagation);
  }

  function getTrack() {
    return tracks[currentTrackIndex] || tracks[0];
  }

  const musicServices = [
    {
      id: "appleMusic",
      urlKey: "appleMusicUrl",
      label: "Apple Musicで聴く",
    },
    {
      id: "spotify",
      urlKey: "spotifyUrl",
      label: "Spotifyで聴く",
    },
  ];
  const MUSIC_ARTIST_NAME = "ASS MAGIC";

  function getAvailableMusicServices(track = getTrack()) {
    return musicServices.filter((service) => (
      typeof track?.[service.urlKey] === "string"
      && track[service.urlKey].trim().length > 0
    ));
  }

  function openMusicService(url, service) {
    if (!isMainExperience() || typeof url !== "string" || !url.trim()) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    canvas.dataset.musicServiceLastOpen = service;
    canvas.dataset.musicServiceLastUrl = url;
    return true;
  }

  function syncMusicServiceUi(track = getTrack()) {
    if (!track) return;
    const available = getAvailableMusicServices(track);
    const enabled = isMainExperience() && available.length > 0;
    if (artLink) {
      artLink.disabled = !enabled;
      artLink.setAttribute("aria-label", `${t("runtime.continueListening", "好きなサービスで続きを聴く")}: ${track.title}`);
      artLink.classList.toggle("is-service-enabled", enabled);
    }
    canvas.dataset.musicServiceTrack = track.title;
    canvas.dataset.musicServiceAvailable = available.map((service) => service.id).join(",") || "none";

    if (!overlay?.classList.contains("is-music-service")) return;
    if (!enabled) {
      closeModal();
      return;
    }
    const modalArt = overlayBody?.querySelector("[data-music-service-art]");
    const modalTrackTitle = overlayBody?.querySelector("[data-music-service-title]");
    const modalArtist = overlayBody?.querySelector("[data-music-service-artist]");
    if (overlayTitle) setLocalizedText(overlayTitle, "runtime.servicePicker", "配信先を選ぶ");
    if (modalArt instanceof HTMLImageElement) {
      modalArt.src = resolveRootAsset(track.art);
      modalArt.alt = t("music.artAlt", "再生中のジャケット");
    }
    if (modalTrackTitle) modalTrackTitle.textContent = track.title;
    if (modalArtist) modalArtist.textContent = MUSIC_ARTIST_NAME;
    for (const button of overlayBody?.querySelectorAll("[data-music-service]") || []) {
      const service = musicServices.find((entry) => entry.id === button.dataset.musicService);
      const visible = Boolean(service && track[service.urlKey]);
      button.hidden = !visible;
      button.disabled = !visible;
    }
  }

  function openMusicServiceModal() {
    const track = getTrack();
    if (!isMainExperience() || !track || !getAvailableMusicServices(track).length) return;
    overlay?.classList.add("is-music-service");
    openModal(t("runtime.servicePicker", "配信先を選ぶ"), (container) => {
      const release = document.createElement("div");
      release.className = "music-service-release";

      const artworkFrame = document.createElement("div");
      artworkFrame.className = "music-service-artwork-frame";
      const artwork = document.createElement("img");
      artwork.className = "music-service-artwork";
      artwork.dataset.musicServiceArt = "";
      artwork.src = resolveRootAsset(track.art);
      artwork.alt = t("music.artAlt", "再生中のジャケット");
      artwork.decoding = "async";
      artworkFrame.append(artwork);

      const releaseCopy = document.createElement("div");
      releaseCopy.className = "music-service-release-copy";
      const nowPlaying = document.createElement("div");
      nowPlaying.className = "music-service-kicker";
      nowPlaying.textContent = "NOW PLAYING";
      const trackTitle = document.createElement("div");
      trackTitle.className = "music-service-track-title";
      trackTitle.dataset.musicServiceTitle = "";
      trackTitle.textContent = track.title;
      const artist = document.createElement("div");
      artist.className = "music-service-artist";
      artist.dataset.musicServiceArtist = "";
      artist.textContent = MUSIC_ARTIST_NAME;
      const prompt = document.createElement("p");
      prompt.className = "music-service-prompt";
      setLocalizedText(prompt, "runtime.continueListening", "好きなサービスで続きを聴く");
      releaseCopy.append(nowPlaying, trackTitle, artist, prompt);

      const actions = document.createElement("div");
      actions.className = "music-service-actions";
      for (const service of musicServices) {
        const button = createButton("", `music-service-button is-${service.id}`);
        button.dataset.musicService = service.id;
        const serviceName = document.createElement("span");
        serviceName.className = "music-service-button-name";
        serviceName.textContent = service.label.replace("で聴く", "");
        const serviceAction = document.createElement("span");
        serviceAction.className = "music-service-button-action";
        setLocalizedText(serviceAction, "runtime.open", "開く ↗");
        button.append(serviceName, serviceAction);
        button.addEventListener("click", () => {
          const currentTrack = getTrack();
          const currentUrl = currentTrack?.[service.urlKey];
          if (!openMusicService(currentUrl, service.id)) return;
          closeModal();
        });
        actions.append(button);
      }
      releaseCopy.append(actions);
      release.append(artworkFrame, releaseCopy);
      container.append(release);
      syncMusicServiceUi(track);
      actions.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
    }, () => {
      overlay?.classList.remove("is-music-service");
      if (isMainExperience() && !artLink?.disabled) {
        artLink?.focus({ preventScroll: true });
      }
    });
  }

  function syncMusicUi() {
    const track = getTrack();
    if (!track) return;
    if (art) art.src = resolveRootAsset(track.art);
    if (title) title.textContent = track.title;
    syncMusicServiceUi(track);
    if (playButton) {
      playButton.classList.toggle("is-playing", !audio.paused);
      setLocalizedAriaLabel(playButton, audio.paused ? "music.play" : "music.pause", audio.paused ? "再生" : "停止");
    }
    musicRoot?.classList.toggle("is-playing", !audio.paused);
    if (landmarks.objects.recordPlayer) {
      landmarks.objects.recordPlayer.userData.playing = !audio.paused;
    }
    refreshMusicSelector();
  }

  async function loadLyrics(track) {
    const requestId = ++lyricsRequest;
    if (!lyricsText) return;
    setLocalizedText(lyricsText, "runtime.lyricsLoading", "歌詞を読み込んでいます。");
    if (Array.isArray(track?.lyrics)) {
      lyricsText.removeAttribute("data-ass-i18n");
      lyricsText.textContent = track.lyrics.map((line) => line.text).join("\n");
      return;
    }
    if (!track?.lyricsPath) {
      setLocalizedText(lyricsText, "runtime.lyricsMissing", "この曲の歌詞はまだありません。");
      return;
    }
    try {
      const response = await fetch(resolveRootAsset(track.lyricsPath), { cache: "force-cache" });
      if (!response.ok) throw new Error(`lyrics-${response.status}`);
      const text = await response.text();
      if (requestId === lyricsRequest) {
        lyricsText.removeAttribute("data-ass-i18n");
        lyricsText.textContent = text.trim();
      }
    } catch (error) {
      console.warn("Lyrics could not be loaded.", error);
      if (requestId === lyricsRequest) setLocalizedText(lyricsText, "runtime.lyricsUnavailable", "歌詞を読み込めませんでした。");
    }
  }

  function loadTrack(index, shouldPlay = false) {
    if (!tracks.length) return;
    currentTrackIndex = (index + tracks.length) % tracks.length;
    const track = getTrack();
    audio.src = resolveRootAsset(track.src);
    audio.load();
    void loadLyrics(track);
    syncMusicUi();
    if (shouldPlay) void playMusic();
  }

  function shuffleTrackIndices(indices) {
    for (let index = indices.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
    }
    return indices;
  }

  // Match the original site's playback: the initial track stays fixed, then
  // every following selection comes from a shuffled queue without immediately
  // repeating the song that just played.
  function getNextRandomTrackIndex() {
    if (tracks.length <= 1) return 0;
    if (!randomTrackQueue.length) {
      const candidates = tracks
        .map((_, index) => index)
        .filter((index) => index !== currentTrackIndex);
      randomTrackQueue = shuffleTrackIndices(candidates);
    }
    return randomTrackQueue.shift() ?? currentTrackIndex;
  }

  async function playMusic() {
    if (!isMainExperience()) return;
    if (!audio.src) loadTrack(currentTrackIndex, false);
    try {
      await audio.play();
      audioUnlocked = true;
      // Once HTML music owns the iOS audio session, retry the effects context.
      // This does not reroute or process the music, so its pitch is untouched.
      const effectsReady = phaseAudioEngine?.ensurePlayback?.();
      if (effectsReady) {
        void Promise.resolve(effectsReady).then((playable) => {
          canvas.dataset.phaseAudioMusicSync = playable ? "running" : "waiting-for-gesture";
        });
      }
    } catch (error) {
      console.warn("Music playback is waiting for a user gesture.", error);
    }
    syncMusicUi();
  }

  function pauseMusic() {
    audio.pause();
    syncMusicUi();
  }

  function playEffectAudio(effect, restart = false) {
    if (!effect || !isMainExperience()) return;
    if (restart) {
      try {
        effect.currentTime = 0;
      } catch (error) {
        console.warn("Effect audio rewind failed.", error);
      }
    }
    effect.muted = false;
    const result = effect.play();
    result?.catch((error) => {
      if (error?.name !== "AbortError") console.warn("Effect audio is waiting for a gesture.", error);
    });
  }

  function stopEffectAudio(effect, reset = false) {
    if (!effect) return;
    effect.pause();
    if (reset) {
      try {
        effect.currentTime = 0;
      } catch (error) {
        console.warn("Effect audio reset failed.", error);
      }
    }
  }

  function unlockMusic(event) {
    if (event?.defaultPrevented) return;
    if (
      event?.target instanceof Element
      && event.target.closest("#experience-art-link, .experience-overlay.is-music-service")
    ) return;
    if (isChillExperience()) {
      playChillAudio();
      return;
    }
    if (
      !isMainExperience()
      || audioUnlocked
      || musicGesturePending
      || state.phase === "challenge"
      || state.modalOpen
    ) return;
    for (const effect of [clockAudio, earthArrivalAudio, endingAudio, spaceReturnAudio]) {
      try {
        effect.load();
      } catch (error) {
        console.warn("Effect audio preload failed.", error);
      }
    }
    musicGesturePending = true;
    const musicAttempt = playMusic();
    // playMusic() invokes audio.play() synchronously before its first await.
    // Retry Web Audio immediately afterwards in the same trusted event so the
    // music and effects join the same active iOS audio session.
    void phaseAudioEngine?.unlock?.(`music-after-${event?.type || "gesture"}`);
    void musicAttempt.finally(() => {
      musicGesturePending = false;
    });
  }

  function stopStoryAudioForChill() {
    pauseMusic();
    for (const effect of [clockAudio, earthArrivalAudio, endingAudio, spaceReturnAudio]) {
      stopEffectAudio(effect, true);
    }
    // The main playlist may already have been preloaded while the choice screen
    // was open. Releasing it keeps CHILL from owning an unnecessary media
    // request or accidentally resuming main-mode music later.
    audio.removeAttribute("src");
    audio.load();
    audioUnlocked = false;
  }

  function playChillAudio() {
    if (!CHILL_AUDIO_URL) {
      canvas.dataset.chillAudio = "silent-no-source";
      return;
    }
    if (!chillAudio.paused) {
      canvas.dataset.chillAudio = "playing";
      return;
    }
    canvas.dataset.chillAudio = "starting";
    const result = chillAudio.play();
    result?.then(() => {
      canvas.dataset.chillAudio = "playing";
    }).catch((error) => {
      canvas.dataset.chillAudio = "waiting-for-gesture";
      if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") {
        console.warn("CHILL audio playback failed.", error);
      }
    });
  }

  function mountChillCat() {
    state.catFound = true;
    state.catRouteAvailable = false;
    state.catJoinPhase = "complete";
    state.catJoinElapsed = CAT_ROUTE_JOIN_DURATION;
    state.catFollowing = true;
    state.catPendingJoin = false;
    state.catTailTime = 0;
    if (playerObject) {
      playerObject.add(catCompanion);
      catCompanion.position.set(
        CAT_ROUTE_MOUNT_SIDE,
        CAT_ROUTE_MOUNT_HEIGHT,
        CAT_ROUTE_MOUNT_FORWARD,
      );
      catCompanion.quaternion.identity();
    }
    catCompanion.visible = true;
    refreshCatRouteAvailability();
  }

  function applyExperienceMode(mode, sourceEvent = null) {
    canvas.dataset.experienceMode = mode;
    canvas.dataset.storyEvents = mode === EXPERIENCE_MODE.MAIN ? "enabled" : "disabled";
    syncMusicUi();

    if (mode === EXPERIENCE_MODE.CHILL) {
      stopStoryAudioForChill();
      mountChillCat();
      scheduleChillDevil();
      void phaseAudioEngine?.unlock?.(`chill-selection-${sourceEvent?.type || "choice"}`);
      playChillAudio();
      return;
    }

    if (mode === EXPERIENCE_MODE.MAIN) {
      chillAudio.pause();
      canvas.dataset.chillAudio = "inactive";
      if (!audio.src) loadTrack(currentTrackIndex, false);
      const musicAttempt = playMusic();
      void phaseAudioEngine?.unlock?.(`main-selection-${sourceEvent?.type || "choice"}`);
      void musicAttempt;
    }
  }

  function showToast(message, duration = 3200) {
    if (!toast || !isMainExperience()) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), duration);
  }

  function openModal(nextTitle, render, onClose = null) {
    if (!isMainExperience() || !overlay || !overlayBody || !overlayTitle) return;
    closeAction = onClose;
    state.modalOpen = true;
    overlayTitle.textContent = nextTitle;
    overlayBody.textContent = "";
    render(overlayBody);
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    flight.stickOffset?.set(0, 0);
    flight.stickSmooth?.set(0, 0);
    flight.keySmooth?.set(0, 0);
    flight.accelPointers?.clear();
  }

  function closeModal() {
    if (!state.modalOpen) return;
    state.modalOpen = false;
    overlay?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const action = closeAction;
    closeAction = null;
    action?.();
  }

  function clearFlightInput() {
    flight.stickOffset?.set(0, 0);
    flight.stickSmooth?.set(0, 0);
    flight.keySmooth?.set(0, 0);
    flight.accelPointers?.clear();
    flight.keys?.clear();
    flight.holdAccel = 0;
    flight.directTurnX = 0;
    flight.directTurnY = 0;
  }

  function openNativeOverlay(element) {
    if (!isMainExperience() || !element) return;
    if (activeNativeOverlay && activeNativeOverlay !== element) closeNativeOverlay();
    activeNativeOverlay = element;
    state.modalOpen = true;
    clearFlightInput();
    element.classList.add("is-open");
    element.setAttribute("aria-hidden", "false");
  }

  function closeNativeOverlay() {
    if (!activeNativeOverlay) return;
    const shouldStartCatJoin = activeNativeOverlay === blackBoxOverlay
      && state.catPendingJoin
      && state.catJoinPhase === "dialogue";
    activeNativeOverlay.classList.remove("is-open");
    activeNativeOverlay.setAttribute("aria-hidden", "true");
    activeNativeOverlay = null;
    state.modalOpen = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (shouldStartCatJoin) startCatJoin();
  }

  function refreshCatRouteAvailability() {
    state.catRouteAvailable = state.blackBoxOpened
      && state.catFound
      && state.phase === "sanctuary"
      && state.catJoinPhase === "idle"
      && !state.catFollowing
      && !state.ending;
    canvas.dataset.catRoute = state.catFollowing
      ? "following"
      : state.catJoinPhase === "joining" ? "joining" : state.catRouteAvailable ? "ready" : "inactive";
  }

  function getCatMountTransform() {
    catMountUp.copy(flight.position).normalize();
    catMountForward.copy(flight.forward)
      .addScaledVector(catMountUp, -flight.forward.dot(catMountUp));
    if (catMountForward.lengthSq() < 0.0001) catMountForward.set(0, 0, 1);
    catMountForward.normalize();
    catMountRight.crossVectors(catMountUp, catMountForward).normalize();
    catDesiredPosition.copy(flight.position)
      .addScaledVector(catMountRight, CAT_ROUTE_MOUNT_SIDE)
      .addScaledVector(catMountUp, CAT_ROUTE_MOUNT_HEIGHT)
      .addScaledVector(catMountForward, CAT_ROUTE_MOUNT_FORWARD);
    catBasis.makeBasis(catMountRight, catMountUp, catMountForward);
    catTargetQuaternion.setFromRotationMatrix(catBasis);
  }

  function startCatJoin() {
    if (state.catJoinPhase !== "dialogue" || state.catFollowing || state.ending) return;
    const blackBox = landmarks.objects.blackBox;
    blackBox.getWorldPosition(state.catJoinStart);
    catSourceUp.copy(state.catJoinStart).normalize();
    state.catJoinStart.addScaledVector(catSourceUp, 1.3);
    state.catPosition.copy(state.catJoinStart);
    state.catJoinElapsed = 0;
    state.catJoinPhase = "joining";
    state.catPendingJoin = false;
    catCompanion.position.copy(state.catJoinStart);
    getCatMountTransform();
    catCompanion.quaternion.copy(catTargetQuaternion);
    catCompanion.visible = true;
    refreshCatRouteAvailability();
  }

  function updateCatCompanion(delta) {
    if (state.catJoinPhase !== "joining" && !state.catFollowing) return;
    state.catTailTime += delta;
    const tailRoot = catCompanion.userData.tailRoot;
    const tailJoints = catCompanion.userData.tailJoints || [];
    if (tailRoot) {
      tailRoot.rotation.x = -1.02 + Math.sin(state.catTailTime * 1.35) * 0.09;
      tailRoot.rotation.z = -0.38 + Math.sin(state.catTailTime * 2.15) * 0.2;
      tailJoints.forEach((joint, index) => {
        const wave = state.catTailTime * 2.5 - index * 0.72;
        joint.rotation.z = Math.sin(wave) * (0.1 + index * 0.018);
        joint.rotation.x = Math.cos(wave * 0.72) * (0.045 + index * 0.008);
      });
    }
    if (state.catFollowing && catCompanion.parent === playerObject) {
      // Once the jump has completed, make the cat part of the player rig. This
      // keeps it in the same pivot, bob, roll, and descent frame as the body.
      catCompanion.position.set(
        CAT_ROUTE_MOUNT_SIDE,
        CAT_ROUTE_MOUNT_HEIGHT,
        CAT_ROUTE_MOUNT_FORWARD,
      );
      catCompanion.quaternion.identity();
      return;
    }
    getCatMountTransform();
    if (state.catJoinPhase === "joining") {
      state.catJoinElapsed += delta;
      const progress = THREE.MathUtils.clamp(state.catJoinElapsed / CAT_ROUTE_JOIN_DURATION, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      state.catPosition.lerpVectors(state.catJoinStart, catDesiredPosition, eased);
      // A single broad arc makes the jump readable without a sudden snap.
      state.catPosition.addScaledVector(catMountUp, Math.sin(progress * Math.PI) * 1.15);
      catCompanion.position.copy(state.catPosition);
      catCompanion.quaternion.slerp(
        catTargetQuaternion,
        1 - Math.exp(-CAT_ROUTE_ROTATION_RESPONSE * delta),
      );
      if (progress >= 1) {
        state.catJoinPhase = "complete";
        state.catFollowing = true;
        state.catPosition.copy(catDesiredPosition);
        catCompanion.position.copy(catDesiredPosition);
        catCompanion.quaternion.copy(catTargetQuaternion);
        if (playerObject) {
          playerObject.add(catCompanion);
          catCompanion.position.set(
            CAT_ROUTE_MOUNT_SIDE,
            CAT_ROUTE_MOUNT_HEIGHT,
            CAT_ROUTE_MOUNT_FORWARD,
          );
          catCompanion.quaternion.identity();
        }
        refreshCatRouteAvailability();
        showToast(t("toast.catMounted", "猫が肩に飛び乗った。"), 3000);
      }
      return;
    }
    state.catPosition.copy(catDesiredPosition);
    catCompanion.position.copy(catDesiredPosition);
    catCompanion.quaternion.copy(catTargetQuaternion);
  }

  function refreshMusicSelector() {
    const track = getTrack();
    if (musicSelectorNowPlaying && track) {
      musicSelectorNowPlaying.replaceChildren();
      const artImage = document.createElement("img");
      artImage.className = "music-selector-now-playing-art";
      artImage.src = resolveRootAsset(track.art);
      artImage.alt = `${track.title} jacket`;
      const copy = document.createElement("div");
      copy.className = "music-selector-now-playing-copy";
      const label = document.createElement("div");
      label.className = "music-selector-now-playing-label";
      setLocalizedText(label, "music.nowPlaying", "再生中");
      const trackTitle = document.createElement("div");
      trackTitle.className = "music-selector-now-playing-title";
      trackTitle.textContent = track.title;
      const meta = document.createElement("div");
      meta.className = "music-selector-now-playing-meta";
      meta.textContent = `TRACK ${String(currentTrackIndex + 1).padStart(2, "0")}`;
      copy.append(label, trackTitle, meta);
      musicSelectorNowPlaying.append(artImage, copy);
    }
    for (const item of musicSelectorList?.querySelectorAll(".music-selector-item") || []) {
      const active = Number(item.dataset.trackIndex) === currentTrackIndex;
      item.classList.toggle("is-current", active);
      const itemState = item.querySelector(".music-selector-item-state");
      if (itemState) setLocalizedText(
        itemState,
        active ? (audio.paused ? "music.ready" : "music.nowPlaying") : "music.playTrack",
        active ? (audio.paused ? "READY" : "NOW PLAYING") : "PLAY",
      );
    }
  }

  function ensureMusicSelector() {
    if (!musicSelectorList || musicSelectorList.childElementCount) return;
    tracks.forEach((track, index) => {
      const button = createButton("", "music-selector-item ui-control");
      button.dataset.trackIndex = String(index);
      const itemArt = document.createElement("img");
      itemArt.className = "music-selector-item-art";
      itemArt.loading = "lazy";
      itemArt.src = resolveRootAsset(track.art);
      itemArt.alt = `${track.title} jacket`;
      const main = document.createElement("div");
      main.className = "music-selector-item-main";
      const itemTitle = document.createElement("div");
      itemTitle.className = "music-selector-item-title";
      itemTitle.textContent = track.title;
      const meta = document.createElement("div");
      meta.className = "music-selector-item-meta";
      meta.textContent = `TRACK ${String(index + 1).padStart(2, "0")}`;
      const itemState = document.createElement("div");
      itemState.className = "music-selector-item-state";
      setLocalizedText(itemState, "music.playTrack", "PLAY");
      main.append(itemTitle, meta);
      button.append(itemArt, main, itemState);
      button.addEventListener("click", () => {
        loadTrack(index, true);
        refreshMusicSelector();
      });
      musicSelectorList.append(button);
    });
  }

  function openMusicSelector() {
    ensureMusicSelector();
    refreshMusicSelector();
    openNativeOverlay(musicSelectorOverlay);
  }

  function createBookCard(entry) {
    const card = document.createElement("article");
    card.className = "book-message-card";
    const meta = document.createElement("div");
    meta.className = "book-message-meta";
    const author = document.createElement("div");
    author.className = "book-message-author";
    const name = document.createElement("div");
    name.className = "book-message-name";
    name.textContent = entry.name;
    const date = document.createElement("div");
    date.className = "book-message-date";
    date.textContent = formatBookDate(entry.createdAt);
    const message = document.createElement("div");
    message.className = "book-message-body";
    message.textContent = entry.message;
    author.append(name);
    meta.append(author, date);
    card.append(meta, message);
    return card;
  }

  function estimateBookMessageRows(entry) {
    const text = `${entry.name || ""}\n${entry.message || ""}`;
    const characterWidth = window.matchMedia("(max-width: 720px)").matches ? 24 : 42;
    const bodyRows = text.split("\n").reduce(
      (rows, line) => rows + Math.max(1, Math.ceil(Array.from(line).length / characterWidth)),
      0,
    );
    // Name/date, the meta spacing, card padding and the page counter account
    // for about four extra text rows in the actual book layout.
    return bodyRows + 4;
  }

  function paginateBookEntries(entries) {
    const rowBudget = window.matchMedia("(max-width: 720px)").matches ? 16 : 22;
    const pages = [];
    let page = [];
    let usedRows = 0;
    for (const entry of entries) {
      const rows = estimateBookMessageRows(entry);
      if (page.length && usedRows + rows > rowBudget) {
        pages.push(page);
        page = [];
        usedRows = 0;
      }
      page.push(entry);
      usedRows += rows;
    }
    if (page.length) pages.push(page);
    return pages;
  }

  function renderProductionBook(entries, stopped = false) {
    if (!bookMessagePage) return;
    bookMessagePage.textContent = "";
    bookPages = paginateBookEntries(entries);
    if (!bookPages.length) {
      const card = document.createElement("div");
      card.className = "book-message-card";
      setLocalizedText(
        card,
        stopped ? "book.stopped" : "book.empty",
        stopped ? "停止中" : "まだ何も書かれていません。最初のひとことを残せます。",
      );
      bookMessagePage.append(card);
      if (bookNextPage) bookNextPage.disabled = true;
      return;
    }
    bookPageIndex %= bookPages.length;
    for (const entry of bookPages[bookPageIndex]) bookMessagePage.append(createBookCard(entry));
    const page = document.createElement("div");
    page.className = "book-message-index";
    page.textContent = `${bookPageIndex + 1} / ${bookPages.length}`;
    bookMessagePage.append(page);
    if (bookNextPage) bookNextPage.disabled = bookPages.length <= 1;
  }

  function setBookView(view) {
    for (const button of bookViewButtons) {
      const active = button.dataset.bookView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const page of bookViews) page.classList.toggle("is-active", page.dataset.bookView === view);
  }

  async function openProductionBook() {
    bookPageIndex = 0;
    setBookView("write");
    if (bookStatus) setLocalizedText(bookStatus, "book.loading", "本の記録を読み込んでいます。");
    openNativeOverlay(bookOverlay);
    bookMessageInput?.focus({ preventScroll: true });
    try {
      const entries = await fetchBookMessages();
      if (bookStatus) setLocalizedText(bookStatus, "book.shared", "この本に書いたことばは、ほかの人にも共有されます。");
      renderProductionBook(entries);
    } catch (error) {
      console.warn("Supabase book is unavailable.", error);
      if (bookStatus) setLocalizedText(bookStatus, "book.stopped", "停止中");
      renderProductionBook(readBookCache(), true);
    }
  }

  function setBlackBoxView(view) {
    for (const item of blackBoxViews) item.classList.toggle("is-active", item.id === `black-box-view-${view}`);
  }

  function openProductionBlackBox() {
    const blackBox = landmarks.objects.blackBox;
    blackBox.userData.grounded = true;
    refreshCatRouteAvailability();
    if (state.catFollowing || state.catJoinPhase === "joining" || state.catJoinPhase === "complete") return;
    const view = state.catRouteAvailable ? "cat-route" : "intro";
    state.catPendingJoin = view === "cat-route";
    if (view === "cat-route") state.catJoinPhase = "dialogue";
    setBlackBoxView(view);
    if (blackBoxTitle) blackBoxTitle.style.visibility = state.blackBoxOpened || view === "cat-route" ? "hidden" : "visible";
    if (blackBoxOpen) setLocalizedText(
      blackBoxOpen,
      state.blackBoxOpened ? "blackBox.openAgain" : "blackBox.open",
      state.blackBoxOpened ? "また開けちゃう" : "開けてみる",
    );
    openNativeOverlay(blackBoxOverlay);
  }

  function getBookPlayerName() {
    try {
      const stored = JSON.parse(localStorage.getItem(BOOK_PLAYER_KEY) || "null");
      return stored?.hasWrittenNameInBook && typeof stored.bookPlayerName === "string"
        ? stored.bookPlayerName.trim()
        : "";
    } catch (error) {
      return "";
    }
  }

  async function recordReturnHistory(isTrueReturn) {
    if (state.returnRecorded) return;
    state.returnRecorded = true;
    const playerName = getBookPlayerName();
    if (!playerName) return;
    const createdAt = new Date().toISOString();
    const historyEntry = {
      playerName,
      isTrueReturn: Boolean(isTrueReturn),
      createdAt,
    };
    try {
      const response = await fetch(
        getReturnHistoryUrl("?select=id,player_name,is_true_return,created_at"),
        {
          method: "POST",
          headers: getBookHeaders("return=representation"),
          body: JSON.stringify([{
            player_name: playerName,
            is_true_return: Boolean(isTrueReturn),
          }]),
        },
      );
      if (!response.ok) throw new Error(`return-history-table-save-${response.status}`);
      return;
    } catch (tableError) {
      console.warn("Return history table is unavailable; using shared-book fallback.", tableError);
    }
    const message = `${RETURN_HISTORY_PREFIX}${JSON.stringify(historyEntry)}`;
    try {
      const response = await fetch(getBookUrl("?select=id"), {
        method: "POST",
        headers: getBookHeaders("return=minimal"),
        body: JSON.stringify([{ name: HIDDEN_BOOK_AUTHOR, message }]),
      });
      if (!response.ok) throw new Error(`return-history-save-${response.status}`);
    } catch (error) {
      console.warn("Return history could not be saved.", error);
      try {
        const stored = JSON.parse(localStorage.getItem(RETURN_HISTORY_STORAGE_KEY) || "[]");
        const entries = Array.isArray(stored) ? stored : [];
        entries.unshift(historyEntry);
        localStorage.setItem(RETURN_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 80)));
      } catch (storageError) {
        console.warn("Local return history could not be saved.", storageError);
      }
    }
  }

  function renderEndingHistories(histories) {
    const isAllowed = (name) => name && !EXCLUDED_BOOK_NAMES.has(name);
    const normal = histories.filter((entry) => !entry.isTrue && isAllowed(entry.name)).map((entry) => entry.name);
    const truth = histories.filter((entry) => entry.isTrue && isAllowed(entry.name)).map((entry) => entry.name);
    if (endingReturnees) {
      if (normal.length) {
        endingReturnees.removeAttribute("data-ass-i18n");
        endingReturnees.textContent = normal.join("\n");
      } else setLocalizedText(endingReturnees, "ending.unconfirmed", "未確認");
    }
    if (endingTrueReturnees) {
      if (truth.length) {
        endingTrueReturnees.removeAttribute("data-ass-i18n");
        endingTrueReturnees.textContent = truth.join("\n");
      } else setLocalizedText(endingTrueReturnees, "ending.unconfirmed", "未確認");
    }
  }

  function readLocalReturnHistories() {
    try {
      const stored = JSON.parse(localStorage.getItem(RETURN_HISTORY_STORAGE_KEY) || "[]");
      return (Array.isArray(stored) ? stored : []).map((entry) => ({
        name: typeof entry?.playerName === "string" ? entry.playerName.trim() : "",
        isTrue: Boolean(entry?.isTrueReturn),
      }));
    } catch (error) {
      return [];
    }
  }

  async function loadEndingNames() {
    try {
      const response = await fetch(
        getReturnHistoryUrl("?select=id,player_name,is_true_return,created_at&order=created_at.asc&limit=80"),
        { headers: getBookHeaders(), cache: "no-store" },
      );
      if (!response.ok) throw new Error(`return-history-table-${response.status}`);
      const rows = await response.json();
      const histories = (Array.isArray(rows) ? rows : []).map((row) => ({
        name: typeof row.player_name === "string" ? row.player_name.trim() : "",
        isTrue: row.is_true_return === true
          || row.is_true_return === "true"
          || row.is_true_return === 1
          || row.is_true_return === "1",
      }));
      renderEndingHistories(histories);
      return;
    } catch (tableError) {
      console.warn("Return history table could not be loaded; using shared-book fallback.", tableError);
    }
    try {
      const response = await fetch(
        getBookUrl(`?select=id,name,message,created_at&name=eq.${encodeURIComponent(HIDDEN_BOOK_AUTHOR)}&order=created_at.asc&limit=120`),
        { headers: getBookHeaders(), cache: "no-store" },
      );
      if (!response.ok) throw new Error(`return-history-${response.status}`);
      const rows = await response.json();
      const histories = (Array.isArray(rows) ? rows : []).map((row) => {
        if (typeof row.message !== "string" || !row.message.startsWith(RETURN_HISTORY_PREFIX)) return null;
        try {
          const parsed = JSON.parse(row.message.slice(RETURN_HISTORY_PREFIX.length));
          return {
            name: typeof parsed.playerName === "string" ? parsed.playerName.trim() : "",
            isTrue: Boolean(parsed.isTrueReturn),
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean);
      renderEndingHistories(histories);
    } catch (error) {
      console.warn("Return history could not be loaded for credits.", error);
      renderEndingHistories(readLocalReturnHistories());
    }
  }

  function openEndingRoll() {
    endingWhiteout?.classList.remove("is-active");
    endingOverlay?.classList.remove("is-transitioning");
    endingOverlay?.classList.add("is-open");
    endingOverlay?.setAttribute("aria-hidden", "false");
    if (endingRollTrack) {
      endingRollTrack.style.animation = "none";
      endingRollTrack.offsetHeight;
      endingRollTrack.style.animation = `ending-roll ${ENDING_ROLL_DURATION}s linear forwards`;
    }
    endingRollStart = performance.now();
    canvas.dataset.returnBgm = "ending-roll";
    window.clearTimeout(endingAudioTimer);
    endingAudio.currentTime = 0;
    endingAudioTimer = window.setTimeout(() => {
      playEffectAudio(endingAudio);
    }, ENDING_ROLL_AUDIO_DELAY);
  }

  function startProductionEnding(isTrueReturn) {
    window.clearTimeout(endingWhiteoutTimer);
    window.clearTimeout(endingBlackTimer);
    endingWhiteout?.classList.add("is-active");
    endingWhiteout?.classList.remove("is-true-message");
    endingWhiteout?.setAttribute("aria-hidden", "false");
    endingRestart?.classList.remove("is-visible");
    void loadEndingNames();
    endingWhiteoutTimer = window.setTimeout(() => {
      if (isTrueReturn) endingWhiteout?.classList.add("is-true-message");
      const beginBlackTransition = () => {
        endingWhiteout?.classList.remove("is-true-message");
        endingOverlay?.classList.add("is-transitioning");
        endingOverlay?.setAttribute("aria-hidden", "false");
        endingBlackTimer = window.setTimeout(openEndingRoll, ENDING_BLACK_DELAY);
      };
      if (isTrueReturn) endingBlackTimer = window.setTimeout(beginBlackTransition, ENDING_TRUE_MESSAGE_DURATION);
      else beginBlackTransition();
    }, ENDING_WHITEOUT_DURATION);
  }

  function createDevilUi() {
    const devilOverlay = document.createElement("div");
    devilOverlay.id = "devil-guide-overlay";
    devilOverlay.className = "ui-control";
    devilOverlay.setAttribute("aria-hidden", "true");
    const backdrop = document.createElement("div");
    backdrop.id = "devil-guide-backdrop";
    const panel = document.createElement("div");
    panel.id = "devil-guide-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    const kicker = document.createElement("div");
    kicker.className = "devil-guide-kicker";
    setLocalizedText(kicker, "runtime.devilEncounter", "悪魔に遭遇");
    const message = document.createElement("div");
    message.id = "devil-guide-message";
    const actions = document.createElement("div");
    actions.id = "devil-guide-actions";
    panel.append(kicker, message, actions);
    devilOverlay.append(backdrop, panel);
    const summon = createButton(t("runtime.summonDevil", "悪魔を呼ぶ"), "ui-control");
    summon.dataset.assI18n = "runtime.summonDevil";
    summon.id = "devil-guide-summon";
    summon.setAttribute("aria-hidden", "true");
    const navigation = document.createElement("div");
    navigation.id = "devil-guide-navigation";
    navigation.className = "ui-control";
    navigation.setAttribute("aria-hidden", "true");
    const navigationText = document.createElement("div");
    navigationText.className = "devil-guide-navigation-text";
    const navigationKicker = document.createElement("span");
    setLocalizedText(navigationKicker, "runtime.devilGuide", "悪魔の案内");
    const navigationDestination = document.createElement("strong");
    navigationText.append(navigationKicker, navigationDestination);
    const navigationCancel = createButton(t("runtime.cancel", "中止"));
    navigationCancel.dataset.assI18n = "runtime.cancel";
    navigation.append(navigationText, navigationCancel);
    document.body.append(devilOverlay, summon, navigation);
    for (const element of [devilOverlay, summon, navigation]) {
      element.addEventListener("pointerdown", (event) => event.stopPropagation());
      element.addEventListener("click", (event) => event.stopPropagation());
    }
    return {
      overlay: devilOverlay,
      kicker,
      message,
      actions,
      summon,
      navigation,
      navigationKicker,
      navigationDestination,
      navigationCancel,
    };
  }

  const devilUi = createDevilUi();

  function makeDevilButton(label, action, className = "") {
    const button = createButton(label, className ? `devil-guide-choice ${className}` : "devil-guide-choice");
    button.addEventListener("click", action);
    return button;
  }

  function closeDevilDialog() {
    devilUi.overlay.classList.remove("is-open");
    devilUi.overlay.setAttribute("aria-hidden", "true");
    state.modalOpen = false;
    state.devil.phase = "dormant";
    devilModel.visible = false;
    devilUi.summon.classList.add("is-visible");
    devilUi.summon.setAttribute("aria-hidden", "false");
  }

  function renderDevilQuestion(view = "question") {
    devilUi.view = view;
    devilUi.actions.replaceChildren();
    if (view === "hint") {
      setLocalizedText(devilUi.message, "runtime.escapeHint", DEVIL_ESCAPE_COPY);
      devilUi.actions.append(
        makeDevilButton(t("runtime.gotIt", "わかった"), closeDevilDialog),
        makeDevilButton(t("runtime.back", "戻る"), () => renderDevilQuestion(), "secondary"),
      );
      return;
    }
    if (view === "creator") {
      setLocalizedText(
        devilUi.message,
        "runtime.creatorCopy",
        "創造主は、ASS MAGICという謎の音楽ユニットだ。\nそれ以上のことはわからない。\n\n本人たちさえ、一体何を作っているのかよくわかっていない。",
      );
      devilUi.actions.append(
        makeDevilButton(t("runtime.oh", "へぇ"), closeDevilDialog),
        makeDevilButton(t("runtime.back", "戻る"), () => renderDevilQuestion(), "secondary"),
      );
      return;
    }
    if (view === "destinations") {
      setLocalizedText(devilUi.message, "runtime.whereTo", "どこへ行きたい？");
      for (const destination of DEVIL_DESTINATIONS) {
        const label = getDevilDestinationLabel(destination, state.blackBoxOpened);
        devilUi.actions.append(makeDevilButton(label, () => startDevilRoute(destination)));
      }
      devilUi.actions.append(makeDevilButton(t("runtime.back", "戻る"), () => renderDevilQuestion(), "secondary"));
      return;
    }
    setLocalizedText(devilUi.message, "runtime.whatDoYouWant", "何が望みだ？");
    const choices = [
      makeDevilButton(t("runtime.explore", "自由に探索したい"), closeDevilDialog),
      makeDevilButton(t("runtime.needHint", "ヒントがほしい"), () => renderDevilQuestion("hint")),
      makeDevilButton(t("runtime.needGuide", "案内してほしい"), () => renderDevilQuestion("destinations")),
    ];
    if (window.assSiteProfile?.showCreatorStory !== false) {
      choices.push(makeDevilButton(t("runtime.aboutCreator", "創造主について"), () => renderDevilQuestion("creator")));
    }
    devilUi.actions.append(...choices);
  }

  function refreshDevilLocalization() {
    setLocalizedText(devilUi.kicker, "runtime.devilEncounter", "悪魔に遭遇");
    setLocalizedText(devilUi.summon, "runtime.summonDevil", "悪魔を呼ぶ");
    setLocalizedText(devilUi.navigationKicker, "runtime.devilGuide", "悪魔の案内");
    setLocalizedText(devilUi.navigationCancel, "runtime.cancel", "中止");
    if (devilUi.overlay.classList.contains("is-open")) {
      renderDevilQuestion(devilUi.view || "question");
    }
    if (state.devil.route) {
      devilUi.navigationDestination.textContent = getDevilDestinationLabel(state.devil.route, state.blackBoxOpened);
    }
  }

  function openDevilDialog() {
    if (!isMainExperience()) return;
    state.devil.phase = "dialog";
    state.modalOpen = true;
    clearFlightInput();
    devilModel.visible = true;
    devilModel.position.copy(state.devil.anchorPosition);
    orientDevil(devilTarget.copy(flight.position).sub(devilModel.position));
    renderDevilQuestion();
    devilUi.overlay.classList.add("is-open");
    devilUi.overlay.setAttribute("aria-hidden", "false");
  }

  function stopDevilRoute(completed = false) {
    const navigation = state.devil.navigation;
    state.devil.route = null;
    state.devil.phase = "dormant";
    devilModel.visible = false;
    devilUi.navigation.classList.remove("is-visible");
    devilUi.navigation.setAttribute("aria-hidden", "true");
    devilUi.summon.classList.add("is-visible");
    devilUi.summon.setAttribute("aria-hidden", "false");
    document.body.classList.remove("devil-guide-navigating");
    navigation.destination = null;
    navigation.elapsed = 0;
    navigation.waitElapsed = 0;
    flight.radialSpeed = 0;
    if (completed) {
      onGuideSpeedChange?.(12);
      flight.speed = 12;
    } else {
      onGuideSpeedChange?.(navigation.savedSpeedSelection);
      flight.speed = navigation.savedSpeed;
    }
  }

  function alignFlightAtGuideDestination(navigation) {
    const endRadius = getSurfaceRadius(navigation.endDirection) + 0.9 + navigation.endAltitude;
    flight.position.copy(navigation.endDirection).multiplyScalar(endRadius);
    devilRouteForward.copy(navigation.focusPoint).sub(flight.position)
      .addScaledVector(
        navigation.endDirection,
        -devilRouteForward.dot(navigation.endDirection),
      );
    if (devilRouteForward.lengthSq() < 0.0001) {
      const lastIndex = navigation.pathDirections.length - 1;
      const previousIndex = Math.max(0, lastIndex - 1);
      devilRouteForward.copy(navigation.pathDirections[lastIndex])
        .sub(navigation.pathDirections[previousIndex])
        .addScaledVector(
          navigation.endDirection,
          -devilRouteForward.dot(navigation.endDirection),
        );
    }
    if (devilRouteForward.lengthSq() > 0.0001) flight.forward.copy(devilRouteForward).normalize();
    flight.radialSpeed = 0;
    flight.bodyPitch = 0;
    flight.roll = 0;
    flight.onGround = false;
  }

  function didBlackBoxCrossGuideTarget(start, end, radius) {
    devilBlackBoxSegment.subVectors(end, start);
    const lengthSq = devilBlackBoxSegment.lengthSq();
    if (lengthSq < 0.000001) return start.distanceToSquared(flight.position) <= radius * radius;
    devilBlackBoxOffset.subVectors(flight.position, start);
    const ratio = THREE.MathUtils.clamp(
      devilBlackBoxOffset.dot(devilBlackBoxSegment) / lengthSq,
      0,
      1,
    );
    devilBlackBoxClosestPoint.copy(start).addScaledVector(devilBlackBoxSegment, ratio);
    return devilBlackBoxClosestPoint.distanceToSquared(flight.position) <= radius * radius;
  }

  function buildDevilRoutePlan(navigation) {
    const planner = DEVIL_ROUTE_PLANNER[quality] || DEVIL_ROUTE_PLANNER.standard;
    const isBlackBoxRoute = navigation.destination?.special === "blackBox";
    const sampleCount = isBlackBoxRoute ? planner.samples * 2 : planner.samples;
    const start = navigation.startDirection;
    const end = navigation.endDirection;
    const routeAxis = new THREE.Vector3().crossVectors(start, end);
    if (routeAxis.lengthSq() < 0.000001) {
      routeAxis.crossVectors(
        start,
        Math.abs(start.y) < 0.92 ? LOCAL_Y_AXIS : new THREE.Vector3(1, 0, 0),
      );
    }
    routeAxis.normalize();
    const directMidpoint = start.clone().add(end);
    if (directMidpoint.lengthSq() < 0.000001) directMidpoint.copy(routeAxis).cross(start);
    directMidpoint.normalize();
    const baseSurface = Math.min(getSurfaceRadius(start), getSurfaceRadius(end));
    const startRadius = flight.position.length();
    let best = null;

    for (const sideOffset of planner.offsets) {
      const control = directMidpoint.clone().addScaledVector(routeAxis, sideOffset).normalize();
      const directions = [];
      const surfaces = [];
      let terrainCost = 0;
      let maximumRise = 0;
      let totalSlope = 0;
      let angularLength = 0;
      let previousSurface = getSurfaceRadius(start);
      let previousDirection = start;

      for (let index = 0; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const oneMinusT = 1 - t;
        const direction = start.clone().multiplyScalar(oneMinusT * oneMinusT)
          .addScaledVector(control, 2 * oneMinusT * t)
          .addScaledVector(end, t * t)
          .normalize();
        const surface = getSurfaceRadius(direction);
        const rise = Math.max(0, surface - baseSurface);
        const slope = index > 0 ? Math.abs(surface - previousSurface) : 0;
        if (index > 0) {
          angularLength += Math.acos(THREE.MathUtils.clamp(previousDirection.dot(direction), -1, 1));
        }
        maximumRise = Math.max(maximumRise, rise);
        totalSlope += slope;
        // Prefer a broad side-route before raising the guide high enough to
        // leave the player's view near steep terrain.
        terrainCost += rise * rise * 0.32 + slope * 12.5;
        directions.push(direction);
        surfaces.push(surface);
        previousSurface = surface;
        previousDirection = direction;
      }

      const routeDistance = angularLength * Math.max(baseSurface, 1);
      const cost = routeDistance + terrainCost + Math.abs(sideOffset) * routeDistance * 0.08;
      if (!best || cost < best.cost) {
        best = {
          cost,
          directions,
          surfaces,
          routeDistance,
          risk: maximumRise + totalSlope / Math.max(1, sampleCount) * 2.2,
          sideOffset,
        };
      }
    }

    const radii = [];
    const cumulative = [0];
    let pathLength = 0;
    const endRadius = best.surfaces[best.surfaces.length - 1] + 0.9 + navigation.endAltitude;
    const routeClearance = isBlackBoxRoute
      ? DEVIL_BLACK_BOX_ROUTE_CLEARANCE
      : DEVIL_ROUTE_CLEARANCE;
    if (isBlackBoxRoute) {
      // For the fast target, build a terrain envelope rather than one tall
      // global parabola. Future peaks propagate backward with a limited climb
      // grade, so avoidance begins far away without sending the player far
      // above the scene. The forward pass makes the descent even shallower.
      const lastIndex = best.directions.length - 1;
      for (let index = 0; index <= lastIndex; index += 1) {
        radii[index] = index === 0
          ? startRadius
          : best.surfaces[index] + 0.9 + routeClearance;
      }
      radii[lastIndex] = Math.max(endRadius, radii[lastIndex]);
      for (let index = lastIndex - 1; index >= 1; index -= 1) {
        const angle = Math.acos(THREE.MathUtils.clamp(
          best.directions[index].dot(best.directions[index + 1]),
          -1,
          1,
        ));
        const segmentDistance = angle * Math.max(
          1,
          (best.surfaces[index] + best.surfaces[index + 1]) * 0.5,
        );
        radii[index] = Math.max(radii[index], radii[index + 1] - segmentDistance * 0.18);
      }
      for (let index = 1; index <= lastIndex; index += 1) {
        const angle = Math.acos(THREE.MathUtils.clamp(
          best.directions[index - 1].dot(best.directions[index]),
          -1,
          1,
        ));
        const segmentDistance = angle * Math.max(
          1,
          (best.surfaces[index - 1] + best.surfaces[index]) * 0.5,
        );
        radii[index] = Math.max(radii[index], radii[index - 1] - segmentDistance * 0.1);
      }
      // The old route kept the generic 26-unit clearance at the final sample,
      // then lowered the player to the box only after waiting began. Ease onto
      // the predicted interception radius during the route itself instead.
      const arrivalStart = Math.max(1, lastIndex - Math.max(4, Math.round(lastIndex * 0.22)));
      const arrivalStartRadius = radii[arrivalStart];
      for (let index = arrivalStart + 1; index <= lastIndex; index += 1) {
        const rawMix = (index - arrivalStart) / Math.max(1, lastIndex - arrivalStart);
        const arrivalMix = rawMix * rawMix * (3 - 2 * rawMix);
        const arrivalRadius = THREE.MathUtils.lerp(arrivalStartRadius, endRadius, arrivalMix);
        const minimumRadius = best.surfaces[index] + 0.9 + DEVIL_BLACK_BOX_ALTITUDE;
        radii[index] = Math.max(minimumRadius, arrivalRadius);
      }
      radii[lastIndex] = endRadius;
    } else {
      let arcLift = 0;
      for (let index = 1; index < best.directions.length - 1; index += 1) {
        const t = index / Math.max(1, best.directions.length - 1);
        const baseline = THREE.MathUtils.lerp(startRadius, endRadius, t);
        const parabolaWeight = 4 * t * (1 - t);
        const requiredRadius = best.surfaces[index] + 0.9 + routeClearance;
        arcLift = Math.max(arcLift, (requiredRadius - baseline) / Math.max(0.0001, parabolaWeight));
      }
      // A single low parabola clears every sampled point on the already-detoured
      // route, keeping the devil framed instead of pinning the whole trip high.
      arcLift = Math.max(0, arcLift) + 2.5;
      for (let index = 0; index < best.directions.length; index += 1) {
        const t = index / Math.max(1, best.directions.length - 1);
        const baseline = THREE.MathUtils.lerp(startRadius, endRadius, t);
        const parabolicRadius = baseline + 4 * t * (1 - t) * arcLift;
        radii[index] = index === 0
          ? startRadius
          : index === best.directions.length - 1
            ? endRadius
            : parabolicRadius;
      }
    }
    for (let index = 0; index < best.directions.length; index += 1) {
      const radius = radii[index];
      if (index > 0) {
        const angle = Math.acos(THREE.MathUtils.clamp(
          best.directions[index - 1].dot(best.directions[index]),
          -1,
          1,
        ));
        const tangential = angle * (radii[index - 1] + radius) * 0.5;
        const radial = radius - radii[index - 1];
        pathLength += Math.hypot(tangential, radial);
        cumulative.push(pathLength);
      }
    }

    navigation.pathDirections = best.directions;
    navigation.pathRadii = radii;
    navigation.pathCumulative = cumulative;
    navigation.pathLength = pathLength;
    navigation.routeRisk = best.risk;
    navigation.plannedSpeed = DEVIL_ROUTE_SPEED;
    navigation.routeAxis.copy(routeAxis);
    navigation.arcAngle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1));
    canvas.dataset.guideRouteSide = best.sideOffset.toFixed(2);
    canvas.dataset.guideRouteRisk = best.risk.toFixed(1);
    canvas.dataset.guideRouteSamples = String(best.directions.length);
  }

  function startDevilRoute(destination) {
    if (!isMainExperience()) return;
    const target = landmarks.objects[destination.id];
    if (!target || !target.parent || !target.visible) return;
    const navigation = state.devil.navigation;
    target.getWorldPosition(targetPosition);
    navigation.destination = destination;
    navigation.startDirection.copy(flight.position).normalize();
    navigation.startAltitude = Math.max(0, getAltitude?.(flight.position) || 0);
    navigation.endAltitude = destination.endAltitude;
    navigation.savedSpeedSelection = flight.speedSelection;
    navigation.savedSpeed = flight.speed;

    if (destination.special === "blackBox" && landmarks.isBlackBoxMoving?.()) {
      let estimatedDuration = 5;
      let predictedSeconds = estimatedDuration + DEVIL_BLACK_BOX_ARRIVAL_LEAD;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        predictedSeconds = estimatedDuration + DEVIL_BLACK_BOX_ARRIVAL_LEAD;
        if (landmarks.predictBlackBoxDayIntercept) {
          predictedSeconds = landmarks.predictBlackBoxDayIntercept(
            predictedSeconds,
            targetPosition,
          );
          navigation.endDirection.copy(targetPosition).normalize();
        } else {
          landmarks.predictBlackBoxDirection(predictedSeconds, navigation.endDirection);
        }
        const routeAngle = Math.acos(THREE.MathUtils.clamp(
          navigation.startDirection.dot(navigation.endDirection),
          -1,
          1,
        ));
        estimatedDuration = THREE.MathUtils.clamp(
          routeAngle * flight.position.length() * DEVIL_ROUTE_EASE_PEAK / DEVIL_ROUTE_SPEED,
          DEVIL_ROUTE_MIN_DURATION,
          DEVIL_ROUTE_MAX_DURATION,
        );
      }
      if (landmarks.predictBlackBoxDayIntercept) {
        predictedSeconds = landmarks.predictBlackBoxDayIntercept(
          estimatedDuration + DEVIL_BLACK_BOX_ARRIVAL_LEAD,
          targetPosition,
        );
        navigation.endDirection.copy(targetPosition).normalize();
        navigation.endAltitude = Math.max(
          DEVIL_BLACK_BOX_ALTITUDE,
          targetPosition.length() - getSurfaceRadius(navigation.endDirection) - 0.9,
        );
        navigation.focusPoint.copy(targetPosition);
        canvas.dataset.guideBlackBoxDaylight = navigation.endDirection
          .dot(landmarks.directions.day)
          .toFixed(3);
        canvas.dataset.guideBlackBoxInterceptSeconds = predictedSeconds.toFixed(2);
        navigation.interceptSeconds = predictedSeconds;
      } else if (landmarks.predictBlackBoxPosition) {
        landmarks.predictBlackBoxPosition(predictedSeconds, targetPosition);
        navigation.endDirection.copy(targetPosition).normalize();
        navigation.endAltitude = Math.max(
          DEVIL_BLACK_BOX_ALTITUDE,
          targetPosition.length() - getSurfaceRadius(navigation.endDirection) - 0.9,
        );
        navigation.focusPoint.copy(targetPosition);
      } else {
        navigation.focusPoint.copy(navigation.endDirection)
          .multiplyScalar(getSurfaceRadius(navigation.endDirection) + DEVIL_BLACK_BOX_ALTITUDE);
      }
    } else if (destination.special === "blackBox") {
      // Once caught, the box stays at its exact last flight position. Arrive
      // at that position instead of applying the generic stand-off angle.
      navigation.endDirection.copy(targetPosition).normalize();
      navigation.endAltitude = Math.max(
        0,
        targetPosition.length() - getSurfaceRadius(navigation.endDirection) - 0.9,
      );
      navigation.focusPoint.copy(targetPosition);
      navigation.interceptSeconds = 0;
    } else {
      navigation.interceptSeconds = 0;
      targetDirection.copy(targetPosition).normalize();
      devilRouteTowardStart.copy(navigation.startDirection)
        .addScaledVector(targetDirection, -navigation.startDirection.dot(targetDirection));
      if (devilRouteTowardStart.lengthSq() < 0.0001) {
        devilRouteTowardStart.copy(flight.forward)
          .addScaledVector(targetDirection, -flight.forward.dot(targetDirection));
      }
      if (devilRouteTowardStart.lengthSq() < 0.0001) {
        devilRouteTowardStart.crossVectors(
          targetDirection,
          Math.abs(targetDirection.y) < 0.92 ? LOCAL_Y_AXIS : new THREE.Vector3(1, 0, 0),
        );
      }
      devilRouteTowardStart.normalize();
      const stopAngle = destination.stopDistance / Math.max(1, getSurfaceRadius(targetDirection));
      navigation.endDirection.copy(targetDirection)
        .multiplyScalar(Math.cos(stopAngle))
        .addScaledVector(devilRouteTowardStart, Math.sin(stopAngle))
        .normalize();
      navigation.focusPoint.copy(targetPosition)
        .addScaledVector(targetDirection, destination.focusHeight);
    }

    buildDevilRoutePlan(navigation);
    navigation.duration = THREE.MathUtils.clamp(
      navigation.pathLength * DEVIL_ROUTE_EASE_PEAK / navigation.plannedSpeed,
      DEVIL_ROUTE_MIN_DURATION,
      DEVIL_ROUTE_MAX_DURATION,
    );
    navigation.timeout = navigation.duration + 6;
    navigation.elapsed = 0;
    navigation.previousPathDistance = 0;
    navigation.waitElapsed = 0;
    clearFlightInput();
    devilUi.overlay.classList.remove("is-open");
    devilUi.overlay.setAttribute("aria-hidden", "true");
    state.modalOpen = false;
    state.devil.route = destination;
    state.devil.phase = "route";
    devilUi.navigationDestination.textContent = getDevilDestinationLabel(destination, state.blackBoxOpened);
    devilUi.navigation.classList.add("is-visible");
    devilUi.navigation.setAttribute("aria-hidden", "false");
    devilUi.summon.classList.remove("is-visible");
    devilUi.summon.setAttribute("aria-hidden", "true");
    devilModel.visible = true;
    flight.radialSpeed = 0;
    flight.bodyPitch = 0;
    flight.roll = 0;
    flight.onGround = false;
    document.body.classList.add("devil-guide-navigating");
  }

  function orientDevil(forward) {
    devilUp.copy(devilModel.position).normalize();
    devilForward.copy(forward).addScaledVector(devilUp, -forward.dot(devilUp));
    if (devilForward.lengthSq() < 0.0001) devilForward.copy(flight.forward);
    devilForward.normalize();
    devilRight.crossVectors(devilUp, devilForward).normalize();
    devilBasis.makeBasis(devilRight, devilUp, devilForward);
    devilModel.quaternion.setFromRotationMatrix(devilBasis);
  }

  function placeDevilNearPlayer(forwardDistance, sideDistance) {
    playerUp.copy(flight.position).normalize();
    devilRight.crossVectors(playerUp, flight.forward).normalize();
    const radius = flight.position.length() + DEVIL_SPAWN_HEIGHT;
    devilTarget.copy(playerUp).multiplyScalar(radius)
      .addScaledVector(flight.forward, forwardDistance)
      .addScaledVector(devilRight, sideDistance)
      .normalize();
    state.devil.anchorUp.copy(devilTarget);
    state.devil.flightRadius = radius;
    state.devil.anchorPosition.copy(devilTarget).multiplyScalar(radius);
    devilModel.position.copy(state.devil.anchorPosition);
  }

  function spawnDevil() {
    const side = state.devil.lastSide || -1;
    placeDevilNearPlayer(DEVIL_ENTRY_FORWARD, side * DEVIL_ENTRY_SIDE);
    state.devil.flightForward.copy(devilRight).multiplyScalar(-side).normalize();
    orientDevil(state.devil.flightForward);
    devilModel.visible = true;
    state.devil.phase = "entry";
    state.devil.entryTime = DEVIL_ENTRY_DURATION;
    state.devil.noticeGrace = 0;
    state.devil.outOfViewTime = 0;
    state.devil.hasBeenVisible = false;
    state.devil.encounterTime = 0;
    state.devil.lastPlayerPosition.copy(flight.position);
  }

  function scheduleChillDevil() {
    const devil = state.devil;
    const chillDebug = new URLSearchParams(window.location.search).get("chilldevildebug") === "1";
    devil.chillRoamInitialized = true;
    devil.chillRoamDebug = chillDebug;
    devil.chillRoamTime = 0;
    devil.chillRoamSeed = Math.random() * Math.PI * 2;
    devil.phase = "chill-delay";
    devil.timer = chillDebug
      ? 1.5
      : THREE.MathUtils.lerp(CHILL_DEVIL_DELAY_MIN, CHILL_DEVIL_DELAY_MAX, Math.random());
    devil.route = null;
    devil.navigation.destination = null;
    devilModel.visible = false;
    canvas.dataset.devilRoam = "waiting";
    canvas.dataset.devilRoamDelay = devil.timer.toFixed(1);
    canvas.dataset.devilRoamFollowing = "false";
  }

  function spawnChillDevil() {
    const devil = state.devil;
    const latitudeY = Math.random() * 2 - 1;
    const horizontal = Math.sqrt(Math.max(0, 1 - latitudeY * latitudeY));
    const longitude = Math.random() * Math.PI * 2;
    devilTarget.set(
      Math.cos(longitude) * horizontal,
      latitudeY,
      Math.sin(longitude) * horizontal,
    );
    // Start on a distant part of the globe. This is only an initial placement
    // check; roaming never steers toward, follows, or flees from the player.
    playerUp.copy(flight.position).normalize();
    if (devilTarget.dot(playerUp) > 0.24) devilTarget.multiplyScalar(-1);
    devil.anchorUp.copy(devilTarget).normalize();
    devilRight.set(0, 1, 0);
    if (Math.abs(devilRight.dot(devil.anchorUp)) > 0.92) devilRight.set(1, 0, 0);
    devil.flightForward.crossVectors(devilRight, devil.anchorUp).normalize();
    devil.flightForward.applyAxisAngle(devil.anchorUp, Math.random() * Math.PI * 2);
    devil.flightRadius = getSurfaceRadius(devil.anchorUp) + 0.9 + DEVIL_SPAWN_HEIGHT;
    devil.anchorPosition.copy(devil.anchorUp).multiplyScalar(devil.flightRadius);
    devilModel.position.copy(devil.anchorPosition);
    devilModel.visible = true;
    devil.phase = "chill-roam";
    devil.chillRoamTime = 0;
    devil.bobTime = 0;
    orientDevil(devil.flightForward);
    canvas.dataset.devilRoam = "wandering";
    canvas.dataset.devilRoamDelay = "0.0";
  }

  function updateChillDevil(delta) {
    const devil = state.devil;
    if (!devil.chillRoamInitialized) scheduleChillDevil();
    if (devil.phase === "chill-delay") {
      devil.timer = Math.max(0, devil.timer - delta);
      canvas.dataset.devilRoamDelay = devil.timer.toFixed(1);
      if (devil.timer <= 0) spawnChillDevil();
      return;
    }
    if (devil.phase !== "chill-roam") {
      scheduleChillDevil();
      return;
    }

    devil.chillRoamTime += delta;
    devil.bobTime += delta * 1.45;
    devilUp.copy(devil.anchorUp).normalize();
    const wanderTurn = (
      Math.sin(devil.chillRoamTime * 0.17 + devil.chillRoamSeed)
      + Math.sin(devil.chillRoamTime * 0.071 + devil.chillRoamSeed * 1.73) * 0.46
    ) * CHILL_DEVIL_ROAM_TURN;
    devil.flightForward.applyAxisAngle(devilUp, wanderTurn * delta)
      .addScaledVector(devilUp, -devil.flightForward.dot(devilUp))
      .normalize();
    const roamSpeed = CHILL_DEVIL_ROAM_SPEED
      + Math.sin(devil.chillRoamTime * 0.23 + devil.chillRoamSeed)
        * CHILL_DEVIL_ROAM_SPEED_VARIATION;
    devilTravelAxis.crossVectors(devilUp, devil.flightForward).normalize();
    const moveAngle = roamSpeed * delta / Math.max(devil.flightRadius, 1);
    devilUp.applyAxisAngle(devilTravelAxis, moveAngle).normalize();
    devil.flightForward.applyAxisAngle(devilTravelAxis, moveAngle)
      .addScaledVector(devilUp, -devil.flightForward.dot(devilUp))
      .normalize();
    devil.flightRadius = THREE.MathUtils.damp(
      devil.flightRadius,
      getSurfaceRadius(devilUp) + 0.9 + DEVIL_SPAWN_HEIGHT,
      DEVIL_TERRAIN_RESPONSE,
      delta,
    );
    devil.anchorUp.copy(devilUp);
    devil.anchorPosition.copy(devilUp).multiplyScalar(devil.flightRadius);
    devilModel.position.copy(devil.anchorPosition)
      .addScaledVector(devil.anchorUp, Math.sin(devil.bobTime) * 0.28);
    orientDevil(devil.flightForward);
    devilModel.rotateZ(Math.sin(devil.bobTime * 0.61) * 0.065);
    for (const wing of devilModel.userData.wingRoots || []) {
      wing.root.rotation.y = wing.side * (0.2 + Math.sin(devil.bobTime * 7.2) * 0.48);
    }
    if (devil.chillRoamDebug) {
      canvas.dataset.devilRoamDistance = devil.anchorPosition.distanceTo(flight.position).toFixed(1);
    }
  }

  function summonDevil(openDialog = false) {
    if (!isMainExperience()) return;
    devilUi.summon.classList.remove("is-visible");
    devilUi.summon.setAttribute("aria-hidden", "true");
    state.devil.outOfViewTime = 0;
    if (openDialog) {
      placeDevilNearPlayer(DEVIL_SPAWN_DISTANCE, -DEVIL_SPAWN_SIDE);
      state.devil.flightForward.copy(flight.forward);
      devilModel.visible = true;
      openDevilDialog();
      return;
    }
    spawnDevil();
  }

  function updateDevilRoute(delta) {
    const navigation = state.devil.navigation;
    const route = navigation.destination;
    if (!route) {
      stopDevilRoute();
      return;
    }

    // The route clock pauses while the shared flight controller is passing
    // through terrain, so the guide cannot pull the player back into it.
    if (isEnvironmentPhasing?.()) {
      navigation.phaseInterrupted = true;
      flight.speed = Math.max(flight.speed, DEVIL_ROUTE_SPEED * 0.58);
      return;
    }
    if (navigation.phaseInterrupted) {
      const savedSpeedSelection = navigation.savedSpeedSelection;
      const savedSpeed = navigation.savedSpeed;
      navigation.phaseInterrupted = false;
      startDevilRoute(route);
      navigation.savedSpeedSelection = savedSpeedSelection;
      navigation.savedSpeed = savedSpeed;
      return;
    }

    if (state.devil.phase === "route-wait") {
      navigation.waitElapsed += delta;
      const blackBox = landmarks.objects.blackBox;
      blackBox?.getWorldPosition(worldPosition);
      if (blackBox && landmarks.isBlackBoxMoving?.()) {
        const blackBoxRadius = worldPosition.length();
        const waitRadius = navigation.pathRadii.at(-1);
        flight.position.copy(navigation.endDirection).multiplyScalar(waitRadius);
        canvas.dataset.guideBlackBoxAltitudeGap = (blackBoxRadius - waitRadius).toFixed(2);
        canvas.dataset.guideBlackBoxWaitRadius = waitRadius.toFixed(2);
        devilRouteForward.copy(worldPosition).sub(flight.position)
          .addScaledVector(
            navigation.endDirection,
            -devilRouteForward.dot(navigation.endDirection),
          );
        if (devilRouteForward.lengthSq() > 0.0001) {
          flight.forward.lerp(devilRouteForward.normalize(), 1 - Math.exp(-2.8 * delta)).normalize();
        }
        if (didBlackBoxCrossGuideTarget(
          devilBlackBoxPreviousPosition,
          worldPosition,
          DEVIL_BLACK_BOX_CONTACT_RADIUS,
        )) {
          stopDevilRoute(true);
          openProductionBlackBox();
          return;
        }
        devilBlackBoxPreviousPosition.copy(worldPosition);
      } else {
        stopDevilRoute();
        return;
      }
      flight.speed = 0;
      flight.radialSpeed = 0;
      if (navigation.waitElapsed >= DEVIL_BLACK_BOX_WAIT_TIMEOUT) {
        const predictedWait = Math.max(
          DEVIL_BLACK_BOX_WAIT_TIMEOUT,
          navigation.interceptSeconds - navigation.duration + 6,
        );
        if (navigation.waitElapsed >= predictedWait) stopDevilRoute();
      }
      return;
    }

    navigation.elapsed += delta;
    if (navigation.elapsed >= navigation.timeout) {
      stopDevilRoute();
      return;
    }
    const progress = THREE.MathUtils.clamp(navigation.elapsed / navigation.duration, 0, 1);
    const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
    const pathDistance = navigation.pathLength * eased;
    const routeFrameSpeed = Math.abs(pathDistance - navigation.previousPathDistance)
      / Math.max(delta, 1 / 240);
    navigation.previousPathDistance = pathDistance;
    let pathIndex = 1;
    while (
      pathIndex < navigation.pathCumulative.length - 1
      && navigation.pathCumulative[pathIndex] < pathDistance
    ) pathIndex += 1;
    const segmentStart = Math.max(0, pathIndex - 1);
    const segmentLength = Math.max(
      0.0001,
      navigation.pathCumulative[pathIndex] - navigation.pathCumulative[segmentStart],
    );
    const segmentMix = THREE.MathUtils.clamp(
      (pathDistance - navigation.pathCumulative[segmentStart]) / segmentLength,
      0,
      1,
    );
    devilRouteDirection.copy(navigation.pathDirections[segmentStart])
      .lerp(navigation.pathDirections[pathIndex], segmentMix)
      .normalize();
    const routeRadius = THREE.MathUtils.lerp(
      navigation.pathRadii[segmentStart],
      navigation.pathRadii[pathIndex],
      segmentMix,
    );
    flight.position.copy(devilRouteDirection).multiplyScalar(routeRadius);
    const forwardIndex = Math.min(navigation.pathDirections.length - 1, pathIndex + 1);
    devilRouteForward.copy(navigation.pathDirections[forwardIndex])
      .addScaledVector(
        devilRouteDirection,
        -navigation.pathDirections[forwardIndex].dot(devilRouteDirection),
      )
      .normalize();
    if (devilRouteForward.lengthSq() < 0.0001) devilRouteForward.copy(flight.forward);
    flight.forward.lerp(devilRouteForward, 1 - Math.exp(-3.2 * delta)).normalize();
    flight.speed = THREE.MathUtils.damp(
      flight.speed,
      Math.min(DEVIL_ROUTE_SPEED, routeFrameSpeed),
      4.2,
      delta,
    );
    flight.radialSpeed = 0;
    flight.bodyPitch = THREE.MathUtils.damp(flight.bodyPitch, 0, 6, delta);
    flight.roll = THREE.MathUtils.damp(flight.roll, 0, 6, delta);

    const leadDistance = Math.min(
      navigation.pathLength,
      pathDistance + DEVIL_ROUTE_LEAD_DISTANCE,
    );
    let leadIndex = pathIndex;
    while (
      leadIndex < navigation.pathCumulative.length - 1
      && navigation.pathCumulative[leadIndex] < leadDistance
    ) leadIndex += 1;
    const leadStart = Math.max(0, leadIndex - 1);
    const leadSegmentLength = Math.max(
      0.0001,
      navigation.pathCumulative[leadIndex] - navigation.pathCumulative[leadStart],
    );
    const leadMix = THREE.MathUtils.clamp(
      (leadDistance - navigation.pathCumulative[leadStart]) / leadSegmentLength,
      0,
      1,
    );
    devilTarget.copy(navigation.pathDirections[leadStart])
      .lerp(navigation.pathDirections[leadIndex], leadMix)
      .normalize();
    const leadRadius = THREE.MathUtils.lerp(
      navigation.pathRadii[leadStart],
      navigation.pathRadii[leadIndex],
      leadMix,
    );
    devilDesired.copy(devilTarget).multiplyScalar(leadRadius + 2.8);
    const guideLeadResponse = THREE.MathUtils.lerp(
      1.45,
      4.2,
      THREE.MathUtils.smoothstep(progress, 0.04, 0.32),
    );
    state.devil.anchorPosition.lerp(
      devilDesired,
      1 - Math.exp(-guideLeadResponse * delta),
    );
    state.devil.anchorUp.copy(state.devil.anchorPosition).normalize();
    devilRelativeEnd.copy(state.devil.anchorUp).sub(devilRouteDirection);
    const devilLeadDistance = Math.acos(THREE.MathUtils.clamp(
      state.devil.anchorUp.dot(devilRouteDirection),
      -1,
      1,
    )) * routeRadius;
    canvas.dataset.guideDevilLead = (
      devilRelativeEnd.dot(devilRouteForward) >= 0 ? devilLeadDistance : -devilLeadDistance
    ).toFixed(2);
    state.devil.flightForward.copy(devilTarget)
      .addScaledVector(devilRouteDirection, -devilTarget.dot(devilRouteDirection))
      .normalize();
    if (state.devil.flightForward.lengthSq() < 0.0001) {
      state.devil.flightForward.copy(devilRouteForward);
    }
    devilModel.position.copy(state.devil.anchorPosition);
    orientDevil(state.devil.flightForward);

    if (progress < 1) return;
    if (route.special === "blackBox" && landmarks.isBlackBoxMoving?.()) {
      const blackBox = landmarks.objects.blackBox;
      blackBox?.getWorldPosition(devilBlackBoxPreviousPosition);
      state.devil.phase = "route-wait";
      navigation.waitElapsed = 0;
      flight.speed = 0;
      return;
    }
    if (route.special === "blackBox") {
      alignFlightAtGuideDestination(navigation);
      stopDevilRoute(true);
      openProductionBlackBox();
      return;
    }
    alignFlightAtGuideDestination(navigation);
    stopDevilRoute(true);
  }

  function updateDevil(delta) {
    const devil = state.devil;
    const interactionsEnabled = isMainExperience();
    if (!interactionsEnabled) {
      updateChillDevil(delta);
      return;
    }
    if (isSkating?.()) {
      // Skate is an intentionally separate play mode: no surprise encounter,
      // no active guide route, and no summon control while riding.
      if (!devil.skateSuppressed) {
        devil.skateSuppressed = true;
        if (devil.phase === "route" || devil.phase === "route-wait") stopDevilRoute(false);
        devil.phase = "dormant";
        devil.route = null;
        devil.navigation.destination = null;
        devilModel.visible = false;
        devilUi.overlay.classList.remove("is-open");
        devilUi.overlay.setAttribute("aria-hidden", "true");
        devilUi.navigation.classList.remove("is-visible");
        devilUi.navigation.setAttribute("aria-hidden", "true");
        document.body.classList.remove("devil-guide-navigating");
        state.modalOpen = false;
      }
      devilUi.summon.classList.remove("is-visible");
      devilUi.summon.setAttribute("aria-hidden", "true");
      return;
    }
    if (devil.skateSuppressed) {
      devil.skateSuppressed = false;
      devilUi.summon.classList.add("is-visible");
      devilUi.summon.setAttribute("aria-hidden", "false");
    }
    if (state.modalOpen && devil.phase !== "dialog") return;
    if (devil.phase === "route" || devil.phase === "route-wait") {
      updateDevilRoute(delta);
      return;
    }
    if (["dialog", "dormant"].includes(devil.phase) || state.ending) return;
    if (devil.phase === "delay") {
      devil.timer -= delta;
      if (devil.timer <= 0) spawnDevil();
      return;
    }
    devil.encounterTime += delta;
    devilPreviousAnchor.copy(devil.anchorPosition);
    if (devil.phase === "entry") {
      devil.entryTime = Math.max(0, devil.entryTime - delta);
      const progress = 1 - devil.entryTime / DEVIL_ENTRY_DURATION;
      const eased = progress * progress * (3 - 2 * progress);
      devilUp.copy(devil.anchorPosition).normalize();
      devilDesired.copy(flight.forward)
        .addScaledVector(devilUp, -flight.forward.dot(devilUp))
        .normalize();
      devilRight.crossVectors(devilUp, devilDesired).normalize();
      devilEntryInward.copy(devilRight).multiplyScalar(-devil.lastSide);
      const extraForward = (DEVIL_SPAWN_DISTANCE - DEVIL_ENTRY_FORWARD) / DEVIL_ENTRY_DURATION;
      const inward = (DEVIL_ENTRY_SIDE - DEVIL_SPAWN_SIDE) / DEVIL_ENTRY_DURATION;
      devilDesired.multiplyScalar(flight.speed + extraForward)
        .addScaledVector(devilEntryInward, inward);
      const entrySpeed = devilDesired.length();
      devilDesired.normalize();
      devilTravelAxis.crossVectors(devilUp, devilDesired).normalize();
      devilUp.applyAxisAngle(devilTravelAxis, entrySpeed * delta / Math.max(devil.flightRadius, 1)).normalize();
      devil.flightRadius = THREE.MathUtils.damp(
        devil.flightRadius,
        getSurfaceRadius(devilUp) + 0.9 + DEVIL_SPAWN_HEIGHT,
        DEVIL_TERRAIN_RESPONSE,
        delta,
      );
      devil.anchorUp.copy(devilUp);
      devil.anchorPosition.copy(devilUp).multiplyScalar(devil.flightRadius);
      devil.flightForward.copy(devilEntryInward).lerp(devilDesired, eased * 0.72).normalize();
      if (devil.entryTime <= 0) {
        devil.phase = "waiting";
      }
    }
    const distance = devil.anchorPosition.distanceTo(flight.position);
    if (devil.phase === "waiting") {
      if (distance < DEVIL_NOTICE_RADIUS) {
        devil.phase = "flee";
        devil.fleeTime = 0;
        devil.noticeGrace = 0.65;
      }
    }
    if (devil.phase === "flee") {
      devil.noticeGrace = Math.max(0, devil.noticeGrace - delta);
      devil.fleeTime += delta;
      devilUp.copy(devil.anchorPosition).normalize();
      devilAway.copy(devil.anchorPosition).sub(flight.position)
        .addScaledVector(devilUp, -devilUp.dot(devilAway));
      if (devilAway.lengthSq() < 0.0001) devilAway.copy(devil.flightForward);
      else devilAway.normalize();
      devilDesired.copy(flight.forward)
        .addScaledVector(devilUp, -flight.forward.dot(devilUp))
        .normalize();
      devilEvadeRight.crossVectors(devilUp, devilAway).normalize();
      const proximity = THREE.MathUtils.clamp(1 - distance / DEVIL_NOTICE_RADIUS, 0, 1);
      devil.evadeWave = Math.sin(devil.fleeTime * DEVIL_FLEE_WEAVE_SPEED);
      devilDesired.multiplyScalar(0.78)
        .addScaledVector(devilAway, 0.22)
        .addScaledVector(devilEvadeRight, devil.evadeWave * DEVIL_FLEE_WEAVE_AMOUNT * (0.7 + proximity * 0.3))
        .normalize();
      devil.flightForward.lerp(
        devilDesired,
        1 - Math.exp(-DEVIL_FLEE_TURN_RESPONSE * delta),
      ).addScaledVector(devilUp, -devil.flightForward.dot(devilUp)).normalize();
      const speedPulse = Math.pow(
        0.5 + Math.sin(devil.fleeTime * DEVIL_FLEE_SPEED_PULSE) * 0.5,
        DEVIL_FLEE_ACCEL_SHARPNESS,
      );
      const speedGap = THREE.MathUtils.lerp(DEVIL_FLEE_SLOW_GAP, DEVIL_FLEE_FAST_GAP, speedPulse);
      const fleeSpeed = THREE.MathUtils.clamp(
        flight.speed - speedGap,
        DEVIL_FLEE_MIN_SPEED,
        DEVIL_FLEE_MAX_SPEED,
      );
      devilTravelAxis.crossVectors(devilUp, devil.flightForward).normalize();
      const moveAngle = fleeSpeed * delta / Math.max(devil.flightRadius, 1);
      devilUp.applyAxisAngle(devilTravelAxis, moveAngle).normalize();
      devil.flightForward.applyAxisAngle(devilTravelAxis, moveAngle)
        .addScaledVector(devilUp, -devil.flightForward.dot(devilUp))
        .normalize();
      devil.flightRadius = THREE.MathUtils.damp(
        devil.flightRadius,
        getSurfaceRadius(devilUp) + 0.9 + DEVIL_SPAWN_HEIGHT,
        DEVIL_TERRAIN_RESPONSE,
        delta,
      );
      devil.anchorUp.copy(devilUp);
      devil.anchorPosition.copy(devilUp).multiplyScalar(devil.flightRadius);
      devilRelativeStart.copy(devil.lastPlayerPosition).sub(devilPreviousAnchor);
      devilRelativeEnd.copy(flight.position).sub(devil.anchorPosition);
      devilRelativeDelta.copy(devilRelativeEnd).sub(devilRelativeStart);
      const relativeLengthSquared = devilRelativeDelta.lengthSq();
      const closestTime = relativeLengthSquared > 0.000001
        ? THREE.MathUtils.clamp(
          -devilRelativeStart.dot(devilRelativeDelta) / relativeLengthSquared,
          0,
          1,
        )
        : 0;
      devilClosestApproach.copy(devilRelativeStart)
        .addScaledVector(devilRelativeDelta, closestTime);
      if (
        interactionsEnabled
        &&
        devil.noticeGrace <= 0
        && devilClosestApproach.lengthSq() <= DEVIL_CONTACT_RADIUS * DEVIL_CONTACT_RADIUS
      ) {
        openDevilDialog();
        return;
      }
    }
    if (
      interactionsEnabled
      &&
      devil.encounterTime >= DEVIL_ASSIST_CONTACT_DELAY
      && ["entry", "waiting", "flee"].includes(devil.phase)
    ) {
      devil.phase = "approach";
    }
    if (devil.phase === "approach") {
      playerUp.copy(flight.position).normalize();
      devilTarget.copy(flight.position)
        .addScaledVector(flight.forward, -3)
        .addScaledVector(playerUp, 1.6);
      devilDesired.copy(devilTarget).normalize();
      devil.anchorUp.lerp(
        devilDesired,
        1 - Math.exp(-DEVIL_APPROACH_RESPONSE * delta),
      ).normalize();
      const approachRadius = Math.max(
        devilTarget.length(),
        getSurfaceRadius(devil.anchorUp) + 0.9 + DEVIL_SPAWN_HEIGHT,
      );
      devil.flightRadius = THREE.MathUtils.damp(
        devil.flightRadius,
        approachRadius,
        DEVIL_APPROACH_RESPONSE,
        delta,
      );
      devil.anchorPosition.copy(devil.anchorUp).multiplyScalar(devil.flightRadius);
      devil.flightForward.copy(devilTarget).sub(devilPreviousAnchor)
        .addScaledVector(devil.anchorUp, -devil.flightForward.dot(devil.anchorUp));
      if (devil.flightForward.lengthSq() > 0.0001) devil.flightForward.normalize();
      if (
        interactionsEnabled
        && devil.anchorPosition.distanceTo(flight.position) <= DEVIL_CONTACT_RADIUS
      ) {
        openDevilDialog();
        return;
      }
    }
    devil.bobTime += delta * 1.7;
    devilModel.position.copy(devil.anchorPosition)
      .addScaledVector(devil.anchorUp, Math.sin(devil.bobTime) * 0.28);
    orientDevil(devil.phase === "dialog"
      ? devilTarget.copy(flight.position).sub(devilModel.position)
      : devil.flightForward);
    devilModel.rotateZ(
      Math.sin(devil.bobTime * 0.74) * 0.08
        + (devil.phase === "flee" ? devil.evadeWave * 0.2 : 0),
    );
    for (const wing of devilModel.userData.wingRoots || []) {
      wing.root.rotation.y = wing.side * (0.2 + Math.sin(devil.bobTime * 7.2) * 0.48);
    }
    devil.lastPlayerPosition.copy(flight.position);
    devilNdc.copy(devilModel.position).project(camera);
    const outOfView = devilNdc.z < -1 || devilNdc.z > 1 || Math.abs(devilNdc.x) > 1.18 || Math.abs(devilNdc.y) > 1.18;
    if (!outOfView) {
      devil.hasBeenVisible = true;
      devil.outOfViewTime = 0;
    } else if (devil.hasBeenVisible) {
      devil.outOfViewTime += delta;
    }
    if (devil.hasBeenVisible && devil.outOfViewTime > 1.25) {
      devil.lastSide = devilNdc.x < 0 ? -1 : 1;
      devilModel.visible = false;
      devil.phase = "delay";
      devil.timer = 5;
      devil.outOfViewTime = 0;
      devil.hasBeenVisible = false;
    }
  }

  function updateDevilLighting() {
    if (!devilModel.visible) return;
    devilUp.copy(devilModel.position).normalize();
    const daylight = devilUp.dot(devilDayDirection) * (state.worldInverted ? -1 : 1);
    // Fade the guide's visibility aid through dusk, but make it exactly zero
    // across the bright hemisphere so it reads as a naturally lit black body.
    const nightMix = 1 - THREE.MathUtils.smoothstep(daylight, -0.08, 0.24);
    for (const entry of devilModel.userData.emissiveMaterials || []) {
      entry.material.emissiveIntensity = entry.nightIntensity * nightMix;
    }
    if (devilModel.userData.visibilityGlow) {
      devilModel.userData.visibilityGlow.material.opacity = 0.016 * nightMix;
    }
    if (devilModel.userData.visibilityLight) {
      devilModel.userData.visibilityLight.intensity = 26 * nightMix;
    }
    canvas.dataset.devilGlow = nightMix <= 0.001 ? "off" : nightMix.toFixed(3);
  }

  function renderTrackSelector(container) {
    const intro = document.createElement("p");
    intro.className = "experience-modal-copy";
    setLocalizedText(intro, "music.chooseTrack", "この惑星で流す曲を選ぶ。");
    const list = document.createElement("div");
    list.className = "experience-track-list";
    tracks.forEach((track, index) => {
      const button = createButton(track.title, "experience-track-choice");
      if (index === currentTrackIndex) button.classList.add("is-current");
      button.addEventListener("click", () => {
        loadTrack(index, true);
        for (const item of list.children) item.classList.remove("is-current");
        button.classList.add("is-current");
      });
      list.append(button);
    });
    container.append(intro, list);
  }

  function cacheBookMessages(entries) {
    try {
      localStorage.setItem(BOOK_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.warn("Book cache could not be saved.", error);
    }
  }

  function readBookCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BOOK_CACHE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeBookEntry).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function getBookUrl(query = "") {
    const base = String(supabaseConfig?.url || "").replace(/\/+$/, "");
    const table = encodeURIComponent(supabaseConfig?.table || "book_messages");
    return `${base}/rest/v1/${table}${query}`;
  }

  function getReturnHistoryUrl(query = "") {
    const base = String(supabaseConfig?.url || "").replace(/\/+$/, "");
    const table = encodeURIComponent(supabaseConfig?.returnHistoryTable || "return_histories");
    return `${base}/rest/v1/${table}${query}`;
  }

  function getBookHeaders(prefer = "") {
    const key = String(supabaseConfig?.anonKey || "");
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  async function fetchBookMessages() {
    const entries = [];
    for (let offset = 0; offset < BOOK_FETCH_MAX_ROWS; offset += BOOK_FETCH_PAGE_SIZE) {
      const response = await fetch(
        getBookUrl(`?select=id,name,message,created_at&name=not.eq.${encodeURIComponent(HIDDEN_BOOK_AUTHOR)}&order=created_at.desc&limit=${BOOK_FETCH_PAGE_SIZE}&offset=${offset}`),
        { headers: getBookHeaders(), cache: "no-store" },
      );
      if (!response.ok) throw new Error(`book-load-${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : [];
      entries.push(...rows.map(normalizeBookEntry).filter(Boolean));
      if (rows.length < BOOK_FETCH_PAGE_SIZE) break;
    }
    cacheBookMessages(entries);
    return entries;
  }

  function renderBookEntries(container, entries, stopped = false) {
    container.textContent = "";
    if (stopped) {
      const stoppedMessage = document.createElement("p");
      stoppedMessage.className = "experience-book-status is-stopped";
      setLocalizedText(stoppedMessage, "book.stopped", "停止中");
      container.append(stoppedMessage);
    }
    if (!entries.length) {
      if (!stopped) {
        const empty = document.createElement("p");
        empty.className = "experience-book-status";
        setLocalizedText(empty, "book.empty", "まだ何も書かれていません。");
        container.append(empty);
      }
      return;
    }
    for (const entry of entries) {
      const card = document.createElement("article");
      card.className = "experience-book-entry";
      const meta = document.createElement("div");
      meta.className = "experience-book-meta";
      meta.textContent = `${entry.name}  ${formatBookDate(entry.createdAt)}`.trim();
      const message = document.createElement("p");
      message.textContent = entry.message;
      card.append(meta, message);
      container.append(card);
    }
  }

  function rememberBookName(name, entryId) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    try {
      localStorage.setItem(BOOK_PLAYER_KEY, JSON.stringify({
        hasWrittenNameInBook: true,
        bookPlayerName: trimmedName,
        latestBookMessageId: String(entryId || ""),
      }));
    } catch (error) {
      console.warn("Book player name could not be saved.", error);
    }
  }

  async function saveBookMessage(name, message) {
    const response = await fetch(getBookUrl("?select=id,name,message,created_at"), {
      method: "POST",
      headers: getBookHeaders("return=representation"),
      body: JSON.stringify([{ name: name.trim() || "anonymous", message: message.trim() }]),
    });
    if (!response.ok) throw new Error(`book-save-${response.status}`);
    const payload = await response.json();
    const entry = normalizeBookEntry(Array.isArray(payload) ? payload[0] : null);
    if (!entry) throw new Error("book-save-empty");
    rememberBookName(name, entry.id);
    return entry;
  }

  function renderBook(container) {
    const status = document.createElement("p");
    status.className = "experience-book-status";
    setLocalizedText(status, "book.loading", "本の記録を読み込んでいます。");
    const entries = document.createElement("div");
    entries.className = "experience-book-entries";
    const form = document.createElement("form");
    form.className = "experience-book-form";
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 24;
    name.placeholder = t("book.namePlaceholder", "名前（任意）");
    const message = document.createElement("textarea");
    message.rows = 4;
    message.maxLength = 280;
    message.placeholder = t("book.messagePlaceholder", "何を書く？");
    const submit = createButton(t("book.submit", "記す"));
    submit.dataset.assI18n = "book.submit";
    submit.type = "submit";
    form.append(name, message, submit);
    container.append(status, entries, form);

    fetchBookMessages().then((loaded) => {
      setLocalizedText(status, "book.sharedProduction", "この本のことばは、ほかの人にも共有されます。");
      renderBookEntries(entries, loaded);
    }).catch((error) => {
      console.warn("Supabase book is unavailable.", error);
      setLocalizedText(status, "book.stopped", "停止中");
      renderBookEntries(entries, readBookCache(), true);
      submit.disabled = true;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!message.value.trim()) return;
      submit.disabled = true;
      setLocalizedText(status, "book.writing", "記しています。");
      try {
        await saveBookMessage(name.value, message.value);
        message.value = "";
        const loaded = await fetchBookMessages();
        setLocalizedText(status, "book.saved", "記しました。");
        renderBookEntries(entries, loaded);
      } catch (error) {
        console.warn("Book message could not be saved.", error);
        setLocalizedText(status, "book.stopped", "停止中");
      } finally {
        submit.disabled = status.dataset.assI18n === "book.stopped";
      }
    });
  }

  function openBlackBox() {
    const blackBox = landmarks.objects.blackBox;
    blackBox.userData.grounded = true;
    const titleKey = state.blackBoxOpened ? "runtime.destination.blackBoxOpened" : "runtime.destination.blackBox";
    const titleFallback = state.blackBoxOpened ? "黒い箱" : "高速移動する黒い箱";
    const actionKey = state.blackBoxOpened ? "blackBox.openAgain" : "blackBox.open";
    const actionFallback = state.blackBoxOpened ? "また開けちゃう" : "開けてみる";
    openModal(
      t(titleKey, titleFallback),
      (container) => {
      setLocalizedText(overlayTitle, titleKey, titleFallback);
      const action = createButton(t(actionKey, actionFallback));
      action.dataset.assI18n = actionKey;
      const reveal = () => {
        container.textContent = "";
        const image = document.createElement("img");
        image.className = "experience-cat-image";
        image.src = resolveRootAsset("./blackbox-cat.jpg");
        image.alt = t("blackBox.catAlt", "箱の中にいた猫");
        const caption = document.createElement("p");
        caption.className = "experience-modal-copy";
        setLocalizedText(caption, "blackBox.caption", "かわいいのがいた。");
        container.append(image, caption);
        state.blackBoxOpened = true;
        blackBox.userData.opened = true;
      };
      action.addEventListener("click", reveal);
      container.append(action);
      },
    );
  }

  function endChallenge(success) {
    document.body.classList.remove("is-monochrome");
    clockAudio.pause();
    clockAudio.currentTime = 0;
    if (challengeMusicWasPlaying) void playMusic();
    challengeMusicWasPlaying = false;
    if (!success) {
      state.phase = "idle";
      state.challengeStart = null;
      state.challengeTimeRemaining = 0;
      landmarks.objects.compass.userData.targetWorld = null;
      triggerChallengeFlash("is-failure");
      return;
    }
    state.phase = "inverted";
    state.challengeStart = null;
    state.challengeTimeRemaining = 0;
    state.worldInverted = true;
    landmarks.objects.compass.userData.targetWorld = null;
    onWorldInversion?.(true);
    triggerChallengeFlash("is-success");
  }

  function startChallenge(id) {
    state.phase = "challenge";
    state.challengeStart = id;
    state.challengeTimeRemaining = MONOCHROME_CHALLENGE_DURATION;
    const targetId = id === "blackSphere" ? "whiteSphere" : "blackSphere";
    const target = landmarks.objects[targetId];
    target.getWorldPosition(targetPosition);
    landmarks.objects.compass.userData.targetWorld = targetPosition.clone();
    document.body.classList.add("is-monochrome");
    challengeMusicWasPlaying = !audio.paused;
    pauseMusic();
    clockAudio.currentTime = 0;
    void clockAudio.play().catch((error) => console.warn("Clock audio is waiting for a gesture.", error));
    triggerChallengeFlash("is-start");
  }

  function triggerChallengeFlash(kind) {
    if (!challengeFlash) return;
    challengeFlash.className = `experience-theme-flash ${kind}`;
    void challengeFlash.offsetWidth;
    challengeFlash.classList.add("is-active");
  }

  function updateChallenge(delta) {
    if (state.phase !== "challenge") return;
    state.challengeTimeRemaining = Math.max(0, state.challengeTimeRemaining - delta);
    if (challengeTimer) {
      challengeTimer.textContent = `${state.challengeTimeRemaining.toFixed(1)} SEC`;
    }
    if (state.challengeTimeRemaining <= 0) endChallenge(false);
  }

  function handleSphere(id) {
    if (state.phase === "challenge") {
      if (id !== state.challengeStart) endChallenge(true);
      return;
    }
    if (state.phase === "idle") startChallenge(id);
  }

  function activateSanctuary() {
    if (state.phase !== "inverted") {
      return;
    }
    state.phase = "sanctuary";
    state.sanctuaryStartAltitude = Math.max(0, getAltitude?.(flight.position) || 0);
    state.earthApproachStartDistance = 0;
    landmarks.objects.sanctuary.userData.activationTarget = 1;
    refreshCatRouteAvailability();
    if (state.blackBoxOpened && landmarks.objects.blackBox.userData.grounded) {
      landmarks.objects.blackBox.getWorldPosition(targetPosition);
      landmarks.objects.compass.userData.targetWorld = targetPosition.clone();
    }
  }

  function beginSpaceReturn() {
    if (state.spaceFlightActive || state.ending) return;
    radialUp.copy(flight.position).normalize();
    projectedUp.copy(radialUp)
      .addScaledVector(state.beamDirection, -radialUp.dot(state.beamDirection));
    if (projectedUp.lengthSq() < 0.0001) {
      projectedUp.crossVectors(
        Math.abs(state.beamDirection.y) < 0.92 ? LOCAL_Y_AXIS : new THREE.Vector3(1, 0, 0),
        state.beamDirection,
      );
    }
    state.spaceUp.copy(projectedUp).normalize();
    projectedForward.copy(state.earthPosition).sub(flight.position)
      .addScaledVector(state.spaceUp, -projectedForward.dot(state.spaceUp));
    if (projectedForward.lengthSq() < 0.0001) projectedForward.copy(state.beamDirection);
    flight.forward.lerp(projectedForward.normalize(), 0.92).normalize();
    flight.radialSpeed = 0;
    flight.bodyPitch = 0;
    state.spaceFlightActive = true;
    audio.pause();
    syncMusicUi();
    playEffectAudio(spaceReturnAudio, true);
    canvas.dataset.returnBgm = "space-return";
  }

  function triggerReturnEnding() {
    if (state.ending) return;
    state.ending = true;
    state.reachedEarthWithCat = state.catFollowing === true;
    earthVisual.earth.visible = false;
    earthVisual.glow.visible = false;
    spaceStars.visible = false;
    audio.pause();
    audio.volume = 0;
    syncMusicUi();
    stopEffectAudio(clockAudio, true);
    stopEffectAudio(spaceReturnAudio, true);
    playEffectAudio(earthArrivalAudio, true);
    canvas.dataset.returnBgm = "earth-arrival";
    void recordReturnHistory(state.reachedEarthWithCat).finally(() => loadEndingNames());
    startProductionEnding(state.reachedEarthWithCat);
    refreshCatRouteAvailability();
    canvas.dataset.returnPhase = "ending";
    canvas.dataset.returnEnding = state.reachedEarthWithCat ? "true" : "normal";
  }

  function updateReturnRoute(delta) {
    if (state.phase !== "sanctuary" || state.ending) {
      if (!state.ending) {
        state.spaceFlightActive = false;
        state.spaceTransition = THREE.MathUtils.damp(
          state.spaceTransition,
          0,
          4.4,
          delta,
        );
        earthVisual.earth.visible = false;
        earthVisual.glow.visible = false;
        spaceStars.visible = false;
      }
      return;
    }

    const beamLength = landmarks.getSanctuaryBeamRay(
      state.beamOrigin,
      state.beamDirection,
    );
    state.earthPosition.copy(state.beamOrigin)
      .addScaledVector(state.beamDirection, beamLength);
    earthVisual.earth.position.copy(state.earthPosition);
    earthVisual.glow.position.copy(state.earthPosition);
    spaceStars.position.copy(state.beamOrigin);
    spaceStars.quaternion.setFromUnitVectors(LOCAL_Y_AXIS, state.beamDirection);

    const axisDistance = beamOffset.copy(flight.position)
      .sub(state.beamOrigin)
      .dot(state.beamDirection);
    beamClosestPoint.copy(state.beamOrigin)
      .addScaledVector(state.beamDirection, Math.max(0, axisDistance));
    const beamDistance = beamOffset.copy(flight.position).sub(beamClosestPoint).length();
    const altitude = Math.max(0, getAltitude?.(flight.position) || 0);
    canvas.dataset.beamAxis = axisDistance.toFixed(1);
    canvas.dataset.beamDistance = beamDistance.toFixed(1);
    if (
      !state.spaceFlightActive
      && (
        state.debugForceSpace
        || (
          altitude >= SPACE_RETURN_ALTITUDE
          && axisDistance >= SPACE_RETURN_AXIS_DISTANCE
          && beamDistance <= SPACE_RETURN_BEAM_RADIUS
        )
      )
    ) {
      beginSpaceReturn();
      state.debugForceSpace = false;
    }

    state.spaceTransition = THREE.MathUtils.damp(
      state.spaceTransition,
      state.spaceFlightActive ? 1 : 0,
      state.spaceFlightActive ? SPACE_TRANSITION_RATE : 4.4,
      delta,
    );
    spaceStars.visible = state.spaceTransition > 0.02;
    spaceStars.material.opacity = THREE.MathUtils.smoothstep(state.spaceTransition, 0.06, 0.82) * 0.86;

    const approachDistance = flight.position.distanceTo(state.earthPosition);
    canvas.dataset.returnPhase = state.spaceFlightActive ? "space" : "beam";
    canvas.dataset.earthDistance = approachDistance.toFixed(1);
    if (state.earthApproachStartDistance <= 0 && state.spaceFlightActive) {
      state.earthApproachStartDistance = approachDistance;
    }
    const reveal = state.spaceFlightActive
      ? THREE.MathUtils.smoothstep(axisDistance, EARTH_REVEAL_AXIS_DISTANCE, EARTH_REVEAL_AXIS_DISTANCE + 420)
      : 0;
    const approachStart = Math.max(1200, state.earthApproachStartDistance || approachDistance);
    const approachProgress = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(1 - approachDistance / approachStart, 0, 1),
      0,
      1,
    );
    earthVisual.earth.visible = reveal > 0.001;
    earthVisual.glow.visible = reveal > 0.001;
    earthVisual.earth.material.opacity = reveal;
    earthVisual.glow.material.opacity = reveal * (0.12 + approachProgress * 0.16);
    earthVisual.earth.scale.setScalar(THREE.MathUtils.lerp(
      EARTH_BASE_SIZE * 0.72,
      EARTH_BASE_SIZE * 1.8,
      approachProgress,
    ));
    earthVisual.glow.scale.setScalar(THREE.MathUtils.lerp(
      EARTH_GLOW_SIZE * 0.68,
      EARTH_GLOW_SIZE * 1.48,
      approachProgress,
    ));
    audio.volume = THREE.MathUtils.clamp(
      1 - THREE.MathUtils.smoothstep(axisDistance, 420, 1450),
      0,
      1,
    );

    if (state.spaceFlightActive && approachDistance <= EARTH_CONTACT_DISTANCE) {
      triggerReturnEnding();
    }
  }

  function startCompassAssist() {
    const target = landmarks.objects.compass.userData.targetWorld;
    if (!target) return;
    compassAssistTarget = target.clone();
    compassAssist = 1.1;
    showToast(t("toast.compassAssist", "羅針盤が進行方向を整えている。"), 2200);
  }

  function handleContact(id) {
    if (!isMainExperience()) return;
    if (state.phase === "challenge" && id !== "blackSphere" && id !== "whiteSphere" && id !== "compass") {
      endChallenge(false);
    }
    switch (id) {
      case "blackSphere":
      case "whiteSphere":
        handleSphere(id);
        break;
      case "recordPlayer":
        openMusicSelector();
        break;
      case "book":
        void openProductionBook();
        break;
      case "compass":
        startCompassAssist();
        break;
      case "sanctuary":
        activateSanctuary();
        break;
      case "blackBox":
        if (state.devil.phase === "route-wait") stopDevilRoute(true);
        openProductionBlackBox();
        break;
      default:
        break;
    }
  }

  function updateContacts() {
    // Environment phasing must not collect, open, start, or complete event
    // objects while the body is intentionally non-solid.
    if (
      !isMainExperience()
      || state.modalOpen
      || state.ending
      || isEnvironmentPhasing?.()
    ) return;
    if (state.devil.phase === "route" || state.devil.phase === "route-wait") return;
    for (const contact of CONTACTS) {
      const object = landmarks.objects[contact.id];
      if (!object) continue;
      object.getWorldPosition(worldPosition);
      const distance = flight.position.distanceTo(worldPosition);
      if (contact.id === "book") canvas.dataset.bookDistance = distance.toFixed(1);
      const wasInside = contactState.get(contact.id) === true;
      if (!wasInside && distance <= contact.radius) {
        contactState.set(contact.id, true);
        handleContact(contact.id);
        if (state.modalOpen) break;
      } else if (wasInside && distance > contact.radius + 4) {
        contactState.set(contact.id, false);
      }
    }
  }

  function updateCompassAssist(delta) {
    if (compassAssist <= 0 || !compassAssistTarget) return;
    compassAssist = Math.max(0, compassAssist - delta);
    playerUp.copy(flight.position).normalize();
    targetDirection.copy(compassAssistTarget).normalize();
    targetTangent.copy(targetDirection)
      .addScaledVector(playerUp, -targetDirection.dot(playerUp));
    if (targetTangent.lengthSq() < 0.0001) return;
    targetTangent.normalize();
    flight.forward.lerp(targetTangent, 1 - Math.exp(-7.2 * delta));
    flight.forward.addScaledVector(playerUp, -flight.forward.dot(playerUp)).normalize();
  }

  function refreshLocalizedExperienceUi() {
    // The locale event only redraws already-open copy. It deliberately does
    // not close overlays, restart events, or alter any navigation state.
    refreshDevilLocalization();
    syncMusicUi();
    refreshMusicSelector();
    if (bookOverlay?.classList.contains("is-open") && bookPages.length) {
      renderProductionBook(bookPages.flat());
    }
    if (blackBoxOverlay?.classList.contains("is-open") && blackBoxOpen) {
      setLocalizedText(
        blackBoxOpen,
        state.blackBoxOpened ? "blackBox.openAgain" : "blackBox.open",
        state.blackBoxOpened ? "また開けちゃう" : "開けてみる",
      );
    }
  }

  window.addEventListener("assmagic:locale-changed", refreshLocalizedExperienceUi);

  playButton?.addEventListener("click", () => {
    if (audio.paused) void playMusic();
    else pauseMusic();
  });
  artLink?.addEventListener("click", openMusicServiceModal);
  artLink?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    event.stopPropagation();
    openMusicServiceModal();
  });
  nextButton?.addEventListener("click", () => loadTrack(getNextRandomTrackIndex(), true));
  lyricsButton?.addEventListener("click", () => {
    const isOpen = lyricsPanel?.classList.toggle("is-open") === true;
    lyricsButton.classList.toggle("is-active", isOpen);
    lyricsButton.setAttribute("aria-pressed", isOpen ? "true" : "false");
  });
  lyricsClose?.addEventListener("click", () => {
    lyricsPanel?.classList.remove("is-open");
    lyricsButton?.classList.remove("is-active");
    lyricsButton?.setAttribute("aria-pressed", "false");
  });
  overlayClose?.addEventListener("click", closeModal);
  overlay?.querySelector(".experience-overlay-backdrop")?.addEventListener("click", closeModal);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !overlay?.classList.contains("is-music-service")) return;
    event.preventDefault();
    event.stopPropagation();
    closeModal();
  });
  bookClose?.addEventListener("click", closeNativeOverlay);
  bookBackdrop?.addEventListener("click", closeNativeOverlay);
  for (const button of bookViewButtons) {
    button.addEventListener("click", () => setBookView(button.dataset.bookView));
  }
  bookNextPage?.addEventListener("click", () => {
    if (!bookPages.length) return;
    bookPageIndex = (bookPageIndex + 1) % bookPages.length;
    renderProductionBook(bookPages.flat());
  });
  bookForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!bookMessageInput?.value.trim()) return;
    if (bookSubmit) bookSubmit.disabled = true;
    if (bookStatus) setLocalizedText(bookStatus, "book.writing", "記しています。");
    try {
      await saveBookMessage(bookName?.value || "", bookMessageInput.value);
      bookMessageInput.value = "";
      const entries = await fetchBookMessages();
      renderProductionBook(entries);
      setBookView("read");
      if (bookStatus) setLocalizedText(bookStatus, "book.saved", "記しました。");
    } catch (error) {
      console.warn("Book message could not be saved.", error);
      if (bookStatus) setLocalizedText(bookStatus, "book.stopped", "停止中");
    } finally {
      if (bookSubmit) bookSubmit.disabled = bookStatus?.dataset.assI18n === "book.stopped";
    }
  });
  blackBoxClose?.addEventListener("click", closeNativeOverlay);
  blackBoxBackdrop?.addEventListener("click", closeNativeOverlay);
  blackBoxIgnore?.addEventListener("click", closeNativeOverlay);
  blackBoxOpen?.addEventListener("click", () => {
    state.blackBoxOpened = true;
    state.catFound = true;
    landmarks.objects.blackBox.userData.opened = true;
    setBlackBoxView("reveal");
    refreshCatRouteAvailability();
  });
  musicSelectorClose?.addEventListener("click", closeNativeOverlay);
  musicSelectorBackdrop?.addEventListener("click", closeNativeOverlay);
  devilUi.summon.addEventListener("click", () => {
    if (isSkating?.()) return;
    summonDevil(true);
  });
  devilUi.navigationCancel.addEventListener("click", () => stopDevilRoute(false));
  endingRollTrack?.addEventListener("animationend", () => endingRestart?.classList.add("is-visible"));
  endingRestart?.addEventListener("click", () => {
    stopEffectAudio(endingAudio, true);
    stopEffectAudio(earthArrivalAudio, true);
    stopEffectAudio(spaceReturnAudio, true);
    const url = new URL(window.location.href);
    url.searchParams.delete("route");
    url.searchParams.set("start", "day");
    window.location.assign(url);
  });
  audio.addEventListener("play", syncMusicUi);
  audio.addEventListener("pause", syncMusicUi);
  audio.addEventListener("ended", () => loadTrack(getNextRandomTrackIndex(), true));
  // Match the production page: start inside the first user gesture, before the
  // flight controls consume it. This is the path iOS Safari permits for audio.
  window.addEventListener("pointerdown", unlockMusic, { capture: true, passive: true });
  window.addEventListener("pointerup", unlockMusic, { capture: true, passive: true });
  window.addEventListener("touchstart", unlockMusic, { capture: true, passive: true });
  window.addEventListener("touchend", unlockMusic, { capture: true, passive: true });
  window.addEventListener("click", unlockMusic, { capture: true, passive: true });
  canvas.addEventListener("pointerdown", unlockMusic);
  window.addEventListener("keydown", unlockMusic);
  window.addEventListener(EXPERIENCE_MODE_SELECTED_EVENT, (event) => {
    applyExperienceMode(event.detail?.mode, event.detail?.sourceEvent);
  });

  loadTrack(currentTrackIndex, false);
  canvas.dataset.experienceMode = getExperienceMode();
  canvas.dataset.storyEvents = isMainExperience() ? "enabled" : "disabled";
  canvas.dataset.chillAudio = "inactive";
  // Begin the first track shortly after the flight appears.  Mobile browsers that
  // reject this attempt will use the existing first-touch retry path.
  window.setTimeout(() => {
    if (
      isMainExperience()
      && !audioUnlocked
      && !state.modalOpen
      && state.phase !== "challenge"
    ) void playMusic();
  }, 500);

  return {
    state,
    isPaused: () => isMainExperience()
      && (
        state.modalOpen
        || state.ending
        || state.devil.phase === "route"
        || state.devil.phase === "route-wait"
      ),
    isGuideNavigating: () => isMainExperience()
      && (
        state.devil.phase === "route"
        || state.devil.phase === "route-wait"
      ),
    getReturnState: () => state,
    update(delta) {
      const storyEnabled = isMainExperience();
      if (storyEnabled) updateChallenge(delta);
      updateDevil(delta);
      updateDevilLighting();
      canvas.dataset.devilPhase = state.devil.phase;
      canvas.dataset.devilEncounterTime = state.devil.encounterTime.toFixed(2);
      canvas.dataset.devilVisible = String(devilModel.visible);
      if (storyEnabled) {
        updateContacts();
        updateCompassAssist(delta);
        updateReturnRoute(delta);
      }
      if (storyEnabled || state.catFollowing) updateCatCompanion(delta);
      if (
        storyEnabled
        && state.ending
        && endingOverlay?.classList.contains("is-open")
        && endingRollStart > 0
        && performance.now() - endingRollStart >= ENDING_ROLL_DURATION * 1000
      ) {
        endingRestart?.classList.add("is-visible");
      }
    },
    reset() {
      closeModal();
      closeNativeOverlay();
      document.body.classList.remove("is-monochrome");
      document.body.classList.remove("devil-guide-navigating");
      clockAudio.pause();
      clockAudio.currentTime = 0;
      earthArrivalAudio.pause();
      earthArrivalAudio.currentTime = 0;
      endingAudio.pause();
      endingAudio.currentTime = 0;
      spaceReturnAudio.pause();
      spaceReturnAudio.currentTime = 0;
      window.clearTimeout(endingAudioTimer);
      window.clearTimeout(endingWhiteoutTimer);
      window.clearTimeout(endingBlackTimer);
      endingWhiteout?.classList.remove("is-active");
      endingWhiteout?.classList.remove("is-true-message");
      endingWhiteout?.setAttribute("aria-hidden", "true");
      endingOverlay?.classList.remove("is-open", "is-transitioning");
      endingOverlay?.setAttribute("aria-hidden", "true");
      endingRestart?.classList.remove("is-visible");
      devilUi.overlay.classList.remove("is-open");
      devilUi.summon.classList.remove("is-visible");
      devilUi.navigation.classList.remove("is-visible");
      devilModel.visible = false;
      state.devil.phase = "delay";
      state.devil.timer = new URLSearchParams(window.location.search).get("devildebug") === "1" ? 0.4 : DEVIL_SPAWN_DELAY;
      state.devil.route = null;
      state.devil.hasBeenVisible = false;
      state.devil.noticeGrace = 0;
      state.devil.encounterTime = 0;
      state.devil.navigation.destination = null;
      state.devil.navigation.elapsed = 0;
      state.devil.navigation.previousPathDistance = 0;
      state.devil.navigation.waitElapsed = 0;
      if (challengeMusicWasPlaying) void playMusic();
      challengeMusicWasPlaying = false;
      const resetParams = new URLSearchParams(window.location.search);
      const routeMode = resetParams.get("route");
      const catDebugFollowing = resetParams.get("catdebug") === "1";
      const catStartsFollowing = catDebugFollowing || isChillExperience();
      const routeReady = routeMode === "ready" || routeMode === "beam" || routeMode === "space";
      state.phase = routeMode === "beam" || routeMode === "space"
        ? "sanctuary"
        : routeReady ? "inverted" : "idle";
      state.worldInverted = routeReady;
      state.blackBoxOpened = false;
      state.catFound = false;
      state.catRouteAvailable = false;
      state.catJoinPhase = catStartsFollowing ? "complete" : "idle";
      state.catJoinElapsed = 0;
      state.catTailTime = 0;
      state.catFollowing = catStartsFollowing;
      state.catPendingJoin = false;
      state.reachedEarthWithCat = false;
      state.returnRecorded = false;
      if (catCompanion.parent !== scene) scene.add(catCompanion);
      catCompanion.visible = catStartsFollowing;
      if (catStartsFollowing && playerObject) {
        playerObject.add(catCompanion);
        catCompanion.position.set(
          CAT_ROUTE_MOUNT_SIDE,
          CAT_ROUTE_MOUNT_HEIGHT,
          CAT_ROUTE_MOUNT_FORWARD,
        );
        catCompanion.quaternion.identity();
      }
      state.challengeStart = null;
      state.challengeTimeRemaining = 0;
      state.spaceFlightActive = false;
      state.spaceTransition = 0;
      state.spaceUp.set(0, 0, 0);
      state.beamOrigin.set(0, 0, 0);
      state.beamDirection.set(0, 0, 0);
      state.earthPosition.set(0, 0, 0);
      state.earthApproachStartDistance = 0;
      state.ending = false;
      state.debugForceSpace = routeMode === "space";
      audio.volume = 1;
      canvas.dataset.returnBgm = "playlist";
      canvas.dataset.returnEnding = "none";
      earthVisual.earth.visible = false;
      earthVisual.glow.visible = false;
      spaceStars.visible = false;
      landmarks.objects.sanctuary.userData.activationTarget = routeMode === "beam" || routeMode === "space" ? 1 : 0;
      landmarks.objects.blackBox.userData.opened = false;
      landmarks.objects.compass.userData.targetWorld = null;
      onWorldInversion?.(routeReady);
      refreshCatRouteAvailability();
      contactState.clear();
      if (resetParams.get("blackboxguide") === "1") {
        window.setTimeout(() => {
          const destination = DEVIL_DESTINATIONS.find((item) => item.id === "blackBox");
          if (destination && state.devil.phase === "delay") startDevilRoute(destination);
        }, 0);
      }
    },
  };
}
