import * as THREE from "../../three.module.js";
import { playlist } from "../../playlist.js";
import { supabaseConfig } from "../../supabase-config.js";

const BOOK_CACHE_KEY = "ass-magic-book-messages-v1";
const BOOK_PLAYER_KEY = "ass-magic-book-player-v1";
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
  { id: "book", radius: 14 },
  { id: "compass", radius: 17 },
  { id: "sanctuary", radius: 34 },
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
const ENDING_ROLL_DURATION = 46;
const ENDING_WHITEOUT_DURATION = 1050;
const ENDING_BLACK_DELAY = 650;
const DEVIL_SPAWN_DELAY = 5;
const DEVIL_ENTRY_DURATION = 1.2;
const DEVIL_ENTRY_FORWARD = 20;
const DEVIL_ENTRY_SIDE = 34;
const DEVIL_SPAWN_DISTANCE = 50;
const DEVIL_SPAWN_SIDE = 8;
const DEVIL_SPAWN_HEIGHT = 3.1;
const DEVIL_NOTICE_RADIUS = 38;
// The full-planet experiment flies faster than the production globe, so cap fleeing
// relative to that speed instead of making the encounter effectively unwinnable.
const DEVIL_FLEE_FAST_GAP = -8;
const DEVIL_FLEE_SLOW_GAP = 14;
const DEVIL_FLEE_SPEED_PULSE = 1.15;
const DEVIL_FLEE_ACCEL_SHARPNESS = 6.5;
const DEVIL_FLEE_MIN_SPEED = 16;
const DEVIL_FLEE_MAX_SPEED = 72;
const DEVIL_FLEE_TURN_RESPONSE = 2.45;
const DEVIL_FLEE_WEAVE_SPEED = 1.35;
const DEVIL_FLEE_WEAVE_AMOUNT = 0.18;
const DEVIL_TERRAIN_RESPONSE = 4.2;
// Realistic terrain adds vertical variation, so use a more forgiving encounter radius.
const DEVIL_CONTACT_RADIUS = 15;
const MONOCHROME_CHALLENGE_DURATION = 30;
const DEVIL_ROUTE_SPEED = 95;
const DEVIL_ROUTE_MIN_DURATION = 2.8;
const DEVIL_ROUTE_MAX_DURATION = 13;
const DEVIL_ROUTE_CLEARANCE = 18;
const DEVIL_ROUTE_LEAD_DISTANCE = 12;
const DEVIL_BLACK_BOX_ARRIVAL_LEAD = 3.2;
const DEVIL_BLACK_BOX_WAIT_TIMEOUT = 16;
const DEVIL_DESTINATIONS = [
  { id: "recordPlayer", label: "レコードプレイヤー", stopDistance: 31, endAltitude: 5, focusHeight: 5 },
  { id: "book", label: "巨大な本", stopDistance: 18, endAltitude: 4, focusHeight: 3 },
  { id: "whiteSphere", label: "白い球体", stopDistance: 30, endAltitude: 40, focusHeight: 0 },
  { id: "blackSphere", label: "黒い球体", stopDistance: 30, endAltitude: 40, focusHeight: 0 },
  { id: "compass", label: "羅針盤", stopDistance: 15, endAltitude: 24, focusHeight: 0 },
  { id: "sanctuary", label: "太陽光式集光遠達装置", stopDistance: 72, endAltitude: 12, focusHeight: 18 },
  { id: "blackBox", label: "高速移動する黒い箱", stopDistance: 15, endAltitude: 2, focusHeight: 2, special: "blackBox" },
];
const DEVIL_ESCAPE_COPY = "昼のエリアに黒い球、夜のエリアに白い球がある。\n\nどちらかの球に触れた後、一度も他の物体に触れることなく、もう一方の球に触れることで昼夜が逆転する。\n\nその後、白い球の近くの巨大な装置を起動させれば脱出の道標が現れる。";

function createDevilModel() {
  const devil = new THREE.Group();
  devil.name = "DevilGuide";
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0x09070a,
    emissive: 0x160004,
    emissiveIntensity: 0.3,
    flatShading: true,
  });
  const hornMaterial = new THREE.MeshLambertMaterial({
    color: 0x020203,
    emissive: 0x090001,
    emissiveIntensity: 0.24,
    flatShading: true,
  });
  const wingMaterial = new THREE.MeshLambertMaterial({
    color: 0x040305,
    emissive: 0x100002,
    emissiveIntensity: 0.3,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2b16, toneMapped: false });
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
  devil.userData.wingRoots = wingRoots;
  devil.scale.setScalar(0.5);
  devil.visible = false;
  return devil;
}

function resolveRootAsset(path) {
  if (!path) return "";
  return path.replace(/^\.\//, "../../");
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
  return date.toLocaleDateString("ja-JP", {
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

export function createWholePlanetExperience({
  canvas,
  scene,
  camera,
  flight,
  landmarks,
  getAltitude,
  getSurfaceRadius,
  onGuideSpeedChange,
  onWorldInversion,
}) {
  const musicRoot = document.querySelector("#experience-music");
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
  const earthArrivalAudio = new Audio(resolveRootAsset("./過去を思い出す.mp3"));
  earthArrivalAudio.preload = "auto";
  const clockAudio = new Audio(resolveRootAsset("./振り子時計（エコー入り）.mp3"));
  clockAudio.loop = true;
  clockAudio.preload = "auto";
  clockAudio.volume = 0.48;
  const challengeFlash = document.querySelector("#experience-theme-flash");
  const challengeTimer = document.querySelector("#experience-challenge-timer");

  const tracks = playlist.filter((track) => !track.disabled);
  let currentTrackIndex = Math.max(0, tracks.findIndex((track) => track.initial));
  let audioUnlocked = false;
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
  const devilRouteDirection = new THREE.Vector3();
  const devilRouteForward = new THREE.Vector3();
  const devilRouteTowardStart = new THREE.Vector3();
  const devilPreviousAnchor = new THREE.Vector3();
  const devilRelativeStart = new THREE.Vector3();
  const devilRelativeEnd = new THREE.Vector3();
  const devilRelativeDelta = new THREE.Vector3();
  const devilClosestApproach = new THREE.Vector3();
  const earthVisual = createEarthReturnVisual();
  const spaceStars = createSpaceStars();
  const devilModel = createDevilModel();
  scene.add(earthVisual.glow, earthVisual.earth, spaceStars, devilModel);
  const state = {
    phase: "idle",
    challengeStart: null,
    challengeTimeRemaining: 0,
    worldInverted: false,
    blackBoxOpened: false,
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
      bobTime: 0,
      evadeWave: 0,
      navigation: {
        destination: null,
        elapsed: 0,
        duration: 0,
        timeout: 0,
        startAltitude: 0,
        endAltitude: 0,
        arcAngle: 0,
        waitElapsed: 0,
        savedSpeedSelection: 40,
        savedSpeed: 40,
        startDirection: new THREE.Vector3(),
        endDirection: new THREE.Vector3(),
        routeAxis: new THREE.Vector3(),
        focusPoint: new THREE.Vector3(),
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

  function syncMusicUi() {
    const track = getTrack();
    if (!track) return;
    if (art) art.src = resolveRootAsset(track.art);
    if (title) title.textContent = track.title;
    if (playButton) {
      playButton.classList.toggle("is-playing", !audio.paused);
      playButton.setAttribute("aria-label", audio.paused ? "再生" : "停止");
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
    lyricsText.textContent = "歌詞を読み込んでいます。";
    if (Array.isArray(track?.lyrics)) {
      lyricsText.textContent = track.lyrics.map((line) => line.text).join("\n");
      return;
    }
    if (!track?.lyricsPath) {
      lyricsText.textContent = "この曲の歌詞はまだありません。";
      return;
    }
    try {
      const response = await fetch(resolveRootAsset(track.lyricsPath), { cache: "force-cache" });
      if (!response.ok) throw new Error(`lyrics-${response.status}`);
      const text = await response.text();
      if (requestId === lyricsRequest) lyricsText.textContent = text.trim();
    } catch (error) {
      console.warn("Lyrics could not be loaded.", error);
      if (requestId === lyricsRequest) lyricsText.textContent = "歌詞を読み込めませんでした。";
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

  async function playMusic() {
    if (!audio.src) loadTrack(currentTrackIndex, false);
    try {
      await audio.play();
      audioUnlocked = true;
    } catch (error) {
      console.warn("Music playback is waiting for a user gesture.", error);
    }
    syncMusicUi();
  }

  function pauseMusic() {
    audio.pause();
    syncMusicUi();
  }

  function unlockMusic() {
    if (audioUnlocked || state.phase === "challenge" || state.modalOpen) return;
    void playMusic();
  }

  function showToast(message, duration = 3200) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), duration);
  }

  function openModal(nextTitle, render, onClose = null) {
    if (!overlay || !overlayBody || !overlayTitle) return;
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
    if (!element) return;
    if (activeNativeOverlay && activeNativeOverlay !== element) closeNativeOverlay();
    activeNativeOverlay = element;
    state.modalOpen = true;
    clearFlightInput();
    element.classList.add("is-open");
    element.setAttribute("aria-hidden", "false");
  }

  function closeNativeOverlay() {
    if (!activeNativeOverlay) return;
    activeNativeOverlay.classList.remove("is-open");
    activeNativeOverlay.setAttribute("aria-hidden", "true");
    activeNativeOverlay = null;
    state.modalOpen = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
      label.textContent = "再生中";
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
      if (itemState) itemState.textContent = active ? (audio.paused ? "READY" : "NOW PLAYING") : "PLAY";
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
      itemState.textContent = "PLAY";
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

  function renderProductionBook(entries, stopped = false) {
    if (!bookMessagePage) return;
    bookMessagePage.textContent = "";
    bookPages = entries.map((entry) => [entry]);
    if (!bookPages.length) {
      const card = document.createElement("div");
      card.className = "book-message-card";
      card.textContent = stopped ? "停止中" : "まだ何も書かれていません。最初のひとことを残せます。";
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
    if (bookStatus) bookStatus.textContent = "本の記録を読み込んでいます。";
    openNativeOverlay(bookOverlay);
    bookMessageInput?.focus({ preventScroll: true });
    try {
      const entries = await fetchBookMessages();
      if (bookStatus) bookStatus.textContent = "この本に書いたことばは、ほかの人にも共有されます。";
      renderProductionBook(entries);
    } catch (error) {
      console.warn("Supabase book is unavailable.", error);
      if (bookStatus) bookStatus.textContent = "停止中";
      renderProductionBook(readBookCache(), true);
    }
  }

  function setBlackBoxView(view) {
    for (const item of blackBoxViews) item.classList.toggle("is-active", item.id === `black-box-view-${view}`);
  }

  function openProductionBlackBox() {
    const blackBox = landmarks.objects.blackBox;
    blackBox.userData.grounded = true;
    setBlackBoxView("intro");
    if (blackBoxTitle) blackBoxTitle.style.visibility = state.blackBoxOpened ? "hidden" : "visible";
    if (blackBoxOpen) blackBoxOpen.textContent = state.blackBoxOpened ? "また開けちゃう" : "開けてみる";
    openNativeOverlay(blackBoxOverlay);
  }

  async function loadEndingNames() {
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
      const isAllowed = (name) => name && !EXCLUDED_BOOK_NAMES.has(name);
      const normal = histories.filter((entry) => !entry.isTrue && isAllowed(entry.name)).map((entry) => entry.name);
      const truth = histories.filter((entry) => entry.isTrue && isAllowed(entry.name)).map((entry) => entry.name);
      if (endingReturnees) endingReturnees.textContent = normal.length ? normal.join("\n") : "未確認";
      if (endingTrueReturnees) endingTrueReturnees.textContent = truth.length ? truth.join("\n") : "未確認";
    } catch (error) {
      console.warn("Return history could not be loaded for credits.", error);
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
    window.clearTimeout(endingAudioTimer);
    endingAudio.currentTime = 0;
    endingAudioTimer = window.setTimeout(() => {
      void endingAudio.play().catch((error) => console.warn("Ending music is waiting for a gesture.", error));
    }, 2000);
  }

  function startProductionEnding() {
    window.clearTimeout(endingWhiteoutTimer);
    window.clearTimeout(endingBlackTimer);
    endingWhiteout?.classList.add("is-active");
    endingWhiteout?.setAttribute("aria-hidden", "false");
    endingRestart?.classList.remove("is-visible");
    void loadEndingNames();
    endingWhiteoutTimer = window.setTimeout(() => {
      endingOverlay?.classList.add("is-transitioning");
      endingOverlay?.setAttribute("aria-hidden", "false");
      endingBlackTimer = window.setTimeout(openEndingRoll, ENDING_BLACK_DELAY);
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
    kicker.textContent = "悪魔に遭遇";
    const message = document.createElement("div");
    message.id = "devil-guide-message";
    const actions = document.createElement("div");
    actions.id = "devil-guide-actions";
    panel.append(kicker, message, actions);
    devilOverlay.append(backdrop, panel);
    const summon = createButton("悪魔を呼ぶ", "ui-control");
    summon.id = "devil-guide-summon";
    summon.setAttribute("aria-hidden", "true");
    const navigation = document.createElement("div");
    navigation.id = "devil-guide-navigation";
    navigation.className = "ui-control";
    navigation.setAttribute("aria-hidden", "true");
    const navigationText = document.createElement("div");
    navigationText.className = "devil-guide-navigation-text";
    const navigationKicker = document.createElement("span");
    navigationKicker.textContent = "悪魔の案内";
    const navigationDestination = document.createElement("strong");
    navigationText.append(navigationKicker, navigationDestination);
    const navigationCancel = createButton("中止");
    navigation.append(navigationText, navigationCancel);
    document.body.append(devilOverlay, summon, navigation);
    for (const element of [devilOverlay, summon, navigation]) {
      element.addEventListener("pointerdown", (event) => event.stopPropagation());
      element.addEventListener("click", (event) => event.stopPropagation());
    }
    return {
      overlay: devilOverlay,
      message,
      actions,
      summon,
      navigation,
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
    devilUi.actions.replaceChildren();
    if (view === "escape") {
      devilUi.message.textContent = DEVIL_ESCAPE_COPY;
      devilUi.actions.append(
        makeDevilButton("わかった", closeDevilDialog),
        makeDevilButton("戻る", () => renderDevilQuestion(), "secondary"),
      );
      return;
    }
    if (view === "destinations") {
      devilUi.message.textContent = "どこへ行きたい？";
      for (const destination of DEVIL_DESTINATIONS) {
        const label = destination.id === "blackBox" && state.blackBoxOpened
          ? "黒い箱"
          : destination.label;
        devilUi.actions.append(makeDevilButton(label, () => startDevilRoute(destination)));
      }
      devilUi.actions.append(makeDevilButton("戻る", () => renderDevilQuestion(), "secondary"));
      return;
    }
    devilUi.message.textContent = "何が望みだ？";
    devilUi.actions.append(
      makeDevilButton("自由に空を飛んで探索したい", closeDevilDialog),
      makeDevilButton("惑星を脱出したい", () => renderDevilQuestion("escape")),
      makeDevilButton("案内してほしい", () => renderDevilQuestion("destinations")),
    );
  }

  function openDevilDialog() {
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

  function startDevilRoute(destination) {
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
      for (let attempt = 0; attempt < 3; attempt += 1) {
        landmarks.predictBlackBoxDirection(
          estimatedDuration + DEVIL_BLACK_BOX_ARRIVAL_LEAD,
          navigation.endDirection,
        );
        const routeAngle = Math.acos(THREE.MathUtils.clamp(
          navigation.startDirection.dot(navigation.endDirection),
          -1,
          1,
        ));
        estimatedDuration = THREE.MathUtils.clamp(
          routeAngle * flight.position.length() / DEVIL_ROUTE_SPEED,
          DEVIL_ROUTE_MIN_DURATION,
          DEVIL_ROUTE_MAX_DURATION,
        );
      }
      navigation.focusPoint.copy(navigation.endDirection)
        .multiplyScalar(getSurfaceRadius(navigation.endDirection) + 2.4);
    } else {
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

    navigation.routeAxis.crossVectors(navigation.startDirection, navigation.endDirection);
    if (navigation.routeAxis.lengthSq() < 0.000001) {
      navigation.routeAxis.crossVectors(
        navigation.startDirection,
        Math.abs(navigation.startDirection.y) < 0.92 ? LOCAL_Y_AXIS : new THREE.Vector3(1, 0, 0),
      );
    }
    navigation.routeAxis.normalize();
    navigation.arcAngle = Math.acos(THREE.MathUtils.clamp(
      navigation.startDirection.dot(navigation.endDirection),
      -1,
      1,
    ));
    navigation.duration = THREE.MathUtils.clamp(
      navigation.arcAngle * flight.position.length() / DEVIL_ROUTE_SPEED,
      DEVIL_ROUTE_MIN_DURATION,
      DEVIL_ROUTE_MAX_DURATION,
    );
    navigation.timeout = navigation.duration + 6;
    navigation.elapsed = 0;
    navigation.waitElapsed = 0;
    clearFlightInput();
    devilUi.overlay.classList.remove("is-open");
    devilUi.overlay.setAttribute("aria-hidden", "true");
    state.modalOpen = false;
    state.devil.route = destination;
    state.devil.phase = "route";
    devilUi.navigationDestination.textContent = destination.id === "blackBox" && state.blackBoxOpened
      ? "黒い箱"
      : destination.label;
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
    state.devil.lastPlayerPosition.copy(flight.position);
  }

  function summonDevil(openDialog = false) {
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

    if (state.devil.phase === "route-wait") {
      navigation.waitElapsed += delta;
      flight.speed = 0;
      flight.radialSpeed = 0;
      if (!landmarks.isBlackBoxMoving?.() || navigation.waitElapsed >= DEVIL_BLACK_BOX_WAIT_TIMEOUT) {
        stopDevilRoute();
      }
      return;
    }

    navigation.elapsed += delta;
    if (navigation.elapsed >= navigation.timeout) {
      stopDevilRoute();
      return;
    }
    const progress = THREE.MathUtils.clamp(navigation.elapsed / navigation.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    devilRouteDirection.copy(navigation.startDirection)
      .applyAxisAngle(navigation.routeAxis, navigation.arcAngle * eased)
      .normalize();
    const routeAltitude = THREE.MathUtils.lerp(
      navigation.startAltitude,
      navigation.endAltitude,
      eased,
    ) + Math.sin(progress * Math.PI) * DEVIL_ROUTE_CLEARANCE;
    flight.position.copy(devilRouteDirection)
      .multiplyScalar(getSurfaceRadius(devilRouteDirection) + 0.9 + routeAltitude);
    devilRouteForward.crossVectors(navigation.routeAxis, devilRouteDirection).normalize();
    if (devilRouteForward.lengthSq() < 0.0001) devilRouteForward.copy(flight.forward);
    flight.forward.copy(devilRouteForward);
    flight.speed = navigation.arcAngle * flight.position.length() / Math.max(navigation.duration, 0.1);
    flight.radialSpeed = 0;
    flight.bodyPitch = THREE.MathUtils.damp(flight.bodyPitch, 0, 6, delta);
    flight.roll = THREE.MathUtils.damp(flight.roll, 0, 6, delta);

    const remainingAngle = navigation.arcAngle * (1 - eased);
    const leadAngle = Math.min(
      remainingAngle,
      DEVIL_ROUTE_LEAD_DISTANCE / Math.max(flight.position.length(), 1),
    );
    devilTarget.copy(devilRouteDirection)
      .applyAxisAngle(navigation.routeAxis, leadAngle)
      .normalize();
    state.devil.anchorUp.copy(devilTarget);
    state.devil.anchorPosition.copy(devilTarget)
      .multiplyScalar(getSurfaceRadius(devilTarget) + 0.9 + routeAltitude + 2.8);
    state.devil.flightForward.crossVectors(navigation.routeAxis, devilTarget).normalize();
    devilModel.position.copy(state.devil.anchorPosition);
    orientDevil(state.devil.flightForward);

    if (progress < 1) return;
    if (route.special === "blackBox" && landmarks.isBlackBoxMoving?.()) {
      state.devil.phase = "route-wait";
      navigation.waitElapsed = 0;
      flight.speed = 0;
      return;
    }
    showToast(`${devilUi.navigationDestination.textContent}に到着した。`, 2600);
    stopDevilRoute(true);
  }

  function updateDevil(delta) {
    const devil = state.devil;
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
        devil.noticeGrace <= 0
        && devilClosestApproach.lengthSq() <= DEVIL_CONTACT_RADIUS * DEVIL_CONTACT_RADIUS
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

  function renderTrackSelector(container) {
    const intro = document.createElement("p");
    intro.className = "experience-modal-copy";
    intro.textContent = "この惑星で流す曲を選ぶ。";
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
    const response = await fetch(
      getBookUrl(`?select=id,name,message,created_at&name=not.eq.${encodeURIComponent(HIDDEN_BOOK_AUTHOR)}&order=created_at.desc&limit=24`),
      { headers: getBookHeaders(), cache: "no-store" },
    );
    if (!response.ok) throw new Error(`book-load-${response.status}`);
    const payload = await response.json();
    const entries = (Array.isArray(payload) ? payload : [])
      .map(normalizeBookEntry)
      .filter(Boolean)
      .slice(0, 12);
    cacheBookMessages(entries);
    return entries;
  }

  function renderBookEntries(container, entries, stopped = false) {
    container.textContent = "";
    if (stopped) {
      const stoppedMessage = document.createElement("p");
      stoppedMessage.className = "experience-book-status is-stopped";
      stoppedMessage.textContent = "停止中";
      container.append(stoppedMessage);
    }
    if (!entries.length) {
      if (!stopped) {
        const empty = document.createElement("p");
        empty.className = "experience-book-status";
        empty.textContent = "まだ何も書かれていません。";
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
    status.textContent = "本の記録を読み込んでいます。";
    const entries = document.createElement("div");
    entries.className = "experience-book-entries";
    const form = document.createElement("form");
    form.className = "experience-book-form";
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 24;
    name.placeholder = "名前（任意）";
    const message = document.createElement("textarea");
    message.rows = 4;
    message.maxLength = 280;
    message.placeholder = "何を書く？";
    const submit = createButton("記す");
    submit.type = "submit";
    form.append(name, message, submit);
    container.append(status, entries, form);

    fetchBookMessages().then((loaded) => {
      status.textContent = "この本のことばは、ほかの人にも共有されます。";
      renderBookEntries(entries, loaded);
    }).catch((error) => {
      console.warn("Supabase book is unavailable.", error);
      status.textContent = "停止中";
      renderBookEntries(entries, readBookCache(), true);
      submit.disabled = true;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!message.value.trim()) return;
      submit.disabled = true;
      status.textContent = "記しています。";
      try {
        await saveBookMessage(name.value, message.value);
        message.value = "";
        const loaded = await fetchBookMessages();
        status.textContent = "記しました。";
        renderBookEntries(entries, loaded);
      } catch (error) {
        console.warn("Book message could not be saved.", error);
        status.textContent = "停止中";
      } finally {
        submit.disabled = status.textContent === "停止中";
      }
    });
  }

  function openBlackBox() {
    const blackBox = landmarks.objects.blackBox;
    blackBox.userData.grounded = true;
    openModal(state.blackBoxOpened ? "黒い箱" : "高速移動する黒い箱", (container) => {
      const action = createButton(state.blackBoxOpened ? "また開けちゃう" : "開けてみる");
      const reveal = () => {
        container.textContent = "";
        const image = document.createElement("img");
        image.className = "experience-cat-image";
        image.src = resolveRootAsset("./blackbox-cat.jpg");
        image.alt = "箱の中にいた猫";
        const caption = document.createElement("p");
        caption.className = "experience-modal-copy";
        caption.textContent = "かわいいのがいた。";
        container.append(image, caption);
        state.blackBoxOpened = true;
        blackBox.userData.opened = true;
      };
      action.addEventListener("click", reveal);
      container.append(action);
    });
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
      showToast("モノクロチャレンジ終了。もう一度、どちらかの球から始める。", 4200);
      return;
    }
    state.phase = "inverted";
    state.challengeStart = null;
    state.challengeTimeRemaining = 0;
    state.worldInverted = true;
    landmarks.objects.compass.userData.targetWorld = null;
    onWorldInversion?.(true);
    triggerChallengeFlash("is-success");
    showToast("昼と夜が逆転した。白い球の近くの巨大な装置へ。", 4600);
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
    showToast("モノクロ開始。30秒以内に、もう一方の球へ。", 4200);
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
      showToast("装置はまだ眠っている。先に黒い球と白い球を結ぶ。", 3800);
      return;
    }
    state.phase = "sanctuary";
    state.sanctuaryStartAltitude = Math.max(0, getAltitude?.(flight.position) || 0);
    state.earthApproachStartDistance = 0;
    landmarks.objects.sanctuary.userData.activationTarget = 1;
    if (state.blackBoxOpened && landmarks.objects.blackBox.userData.grounded) {
      landmarks.objects.blackBox.getWorldPosition(targetPosition);
      landmarks.objects.compass.userData.targetWorld = targetPosition.clone();
    }
    showToast("巨大な装置が起動した。光の道標が宇宙へ伸びていく。", 4800);
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
    showToast("宇宙帰還モード。光の先の地球へ。", 4200);
  }

  function triggerReturnEnding() {
    if (state.ending) return;
    state.ending = true;
    earthVisual.earth.visible = false;
    earthVisual.glow.visible = false;
    spaceStars.visible = false;
    audio.pause();
    audio.volume = 0;
    syncMusicUi();
    clockAudio.pause();
    earthArrivalAudio.currentTime = 0;
    void earthArrivalAudio.play().catch((error) => console.warn("Earth arrival audio is waiting for a gesture.", error));
    startProductionEnding();
    canvas.dataset.returnPhase = "ending";
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
    showToast("羅針盤が進行方向を整えている。", 2200);
  }

  function handleContact(id) {
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
    if (state.modalOpen || state.ending) return;
    if (state.devil.phase === "route") return;
    if (state.devil.phase === "route-wait") {
      const blackBox = landmarks.objects.blackBox;
      blackBox?.getWorldPosition(worldPosition);
      if (blackBox && flight.position.distanceTo(worldPosition) <= 9.2) {
        stopDevilRoute(true);
        openProductionBlackBox();
      }
      return;
    }
    for (const contact of CONTACTS) {
      const object = landmarks.objects[contact.id];
      if (!object) continue;
      object.getWorldPosition(worldPosition);
      const distance = flight.position.distanceTo(worldPosition);
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

  playButton?.addEventListener("click", () => {
    if (audio.paused) void playMusic();
    else pauseMusic();
  });
  nextButton?.addEventListener("click", () => loadTrack(currentTrackIndex + 1, true));
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
    if (bookStatus) bookStatus.textContent = "記しています。";
    try {
      await saveBookMessage(bookName?.value || "", bookMessageInput.value);
      bookMessageInput.value = "";
      const entries = await fetchBookMessages();
      renderProductionBook(entries);
      setBookView("read");
      if (bookStatus) bookStatus.textContent = "記しました。";
    } catch (error) {
      console.warn("Book message could not be saved.", error);
      if (bookStatus) bookStatus.textContent = "停止中";
    } finally {
      if (bookSubmit) bookSubmit.disabled = bookStatus?.textContent === "停止中";
    }
  });
  blackBoxClose?.addEventListener("click", closeNativeOverlay);
  blackBoxBackdrop?.addEventListener("click", closeNativeOverlay);
  blackBoxIgnore?.addEventListener("click", closeNativeOverlay);
  blackBoxOpen?.addEventListener("click", () => {
    state.blackBoxOpened = true;
    landmarks.objects.blackBox.userData.opened = true;
    setBlackBoxView("reveal");
  });
  musicSelectorClose?.addEventListener("click", closeNativeOverlay);
  musicSelectorBackdrop?.addEventListener("click", closeNativeOverlay);
  devilUi.summon.addEventListener("click", () => {
    summonDevil(true);
  });
  devilUi.navigationCancel.addEventListener("click", () => stopDevilRoute(false));
  endingRollTrack?.addEventListener("animationend", () => endingRestart?.classList.add("is-visible"));
  endingRestart?.addEventListener("click", () => {
    endingAudio.pause();
    earthArrivalAudio.pause();
    const url = new URL(window.location.href);
    url.searchParams.delete("route");
    url.searchParams.set("start", "day");
    window.location.assign(url);
  });
  audio.addEventListener("play", syncMusicUi);
  audio.addEventListener("pause", syncMusicUi);
  audio.addEventListener("ended", () => loadTrack(currentTrackIndex + 1, true));
  canvas.addEventListener("pointerdown", unlockMusic);
  window.addEventListener("keydown", unlockMusic, { once: true });

  loadTrack(currentTrackIndex, false);
  // Begin the first track shortly after the flight appears.  Mobile browsers that
  // reject this attempt will use the existing first-touch retry path.
  window.setTimeout(() => {
    if (!audioUnlocked && !state.modalOpen && state.phase !== "challenge") void playMusic();
  }, 500);

  return {
    state,
    isPaused: () => state.modalOpen
      || state.ending
      || state.devil.phase === "route"
      || state.devil.phase === "route-wait",
    isGuideNavigating: () => state.devil.phase === "route"
      || state.devil.phase === "route-wait",
    getReturnState: () => state,
    update(delta) {
      updateChallenge(delta);
      updateDevil(delta);
      updateContacts();
      updateCompassAssist(delta);
      updateReturnRoute(delta);
      if (
        state.ending
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
      window.clearTimeout(endingAudioTimer);
      window.clearTimeout(endingWhiteoutTimer);
      window.clearTimeout(endingBlackTimer);
      endingWhiteout?.classList.remove("is-active");
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
      state.devil.navigation.destination = null;
      state.devil.navigation.elapsed = 0;
      state.devil.navigation.waitElapsed = 0;
      if (challengeMusicWasPlaying) void playMusic();
      challengeMusicWasPlaying = false;
      const routeMode = new URLSearchParams(window.location.search).get("route");
      const routeReady = routeMode === "ready" || routeMode === "beam" || routeMode === "space";
      state.phase = routeMode === "beam" || routeMode === "space"
        ? "sanctuary"
        : routeReady ? "inverted" : "idle";
      state.worldInverted = routeReady;
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
      earthVisual.earth.visible = false;
      earthVisual.glow.visible = false;
      spaceStars.visible = false;
      landmarks.objects.sanctuary.userData.activationTarget = routeMode === "beam" || routeMode === "space" ? 1 : 0;
      landmarks.objects.compass.userData.targetWorld = null;
      onWorldInversion?.(routeReady);
      contactState.clear();
    },
  };
}
