import * as THREE from "../../three.module.js";
import {
  AdaptivePixelRatio,
  configureLinks,
  getExperimentSettings,
} from "./quality.js";
import { PerformanceHud } from "./perf-hud.js?scope=whole-planet";
import {
  createFlightPlayer,
  updateFlightPlayer,
} from "./whole-planet-player.js?v=realism-41";
import { createSpecialLandmarks } from "./whole-planet-landmarks.js?v=realism-70";

const PLANET_RADIUS = 340;
const PLAYER_CLEARANCE = 0.9;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_DIRECTION = new THREE.Vector3(0.82, 0.33, 0.46).normalize();
const TERRAIN_DRY = new THREE.Color(0x827965);
const TERRAIN_WET = new THREE.Color(0x46564b);
const TERRAIN_ROCK = new THREE.Color(0x66635d);
const TERRAIN_HIGH = new THREE.Color(0xaaa59a);
const TERRAIN_TEXTURE_TINT = new THREE.Color(0xffffff);
const WATER_LEVEL = -9;
const WATER_RADIUS = PLANET_RADIUS + WATER_LEVEL;
const FEATURE_AXIS_A = new THREE.Vector3().crossVectors(WORLD_UP, SUN_DIRECTION).normalize();
const FEATURE_AXIS_B = new THREE.Vector3().crossVectors(SUN_DIRECTION, FEATURE_AXIS_A).normalize();
const MOUNTAIN_DIRECTION = FEATURE_AXIS_A.clone()
  .multiplyScalar(0.9)
  .addScaledVector(FEATURE_AXIS_B, 0.2)
  .addScaledVector(SUN_DIRECTION, 0.38)
  .normalize();
const MOUNTAIN_TANGENT = new THREE.Vector3().crossVectors(WORLD_UP, MOUNTAIN_DIRECTION).normalize();
const MOUNTAIN_PEAKS = [
  { direction: MOUNTAIN_DIRECTION, height: 58, radius: 0.18, phase: 1.2 },
  {
    direction: MOUNTAIN_DIRECTION.clone()
      .multiplyScalar(Math.cos(0.1))
      .addScaledVector(MOUNTAIN_TANGENT, Math.sin(0.1))
      .normalize(),
    height: 38,
    radius: 0.13,
    phase: 3.7,
  },
  {
    direction: MOUNTAIN_DIRECTION.clone()
      .multiplyScalar(Math.cos(0.12))
      .addScaledVector(MOUNTAIN_TANGENT, -Math.sin(0.12))
      .normalize(),
    height: 31,
    radius: 0.11,
    phase: 5.1,
  },
];
const CRATER_DIRECTION = FEATURE_AXIS_A.clone()
  .multiplyScalar(-0.75)
  .addScaledVector(FEATURE_AXIS_B, 0.55)
  .addScaledVector(SUN_DIRECTION, 0.36)
  .normalize();
const CRATER_APPROACH = SUN_DIRECTION.clone()
  .addScaledVector(CRATER_DIRECTION, -SUN_DIRECTION.dot(CRATER_DIRECTION))
  .normalize();
const WATER_DIRECTION = FEATURE_AXIS_A.clone()
  .multiplyScalar(-0.55)
  .addScaledVector(FEATURE_AXIS_B, -0.75)
  .addScaledVector(SUN_DIRECTION, 0.34)
  .normalize();
const VALLEY_DIRECTION = FEATURE_AXIS_A.clone()
  .multiplyScalar(0.4)
  .addScaledVector(FEATURE_AXIS_B, -0.85)
  .addScaledVector(SUN_DIRECTION, 0.3)
  .normalize();
const VALLEY_TANGENT = new THREE.Vector3().crossVectors(WORLD_UP, VALLEY_DIRECTION).normalize();
const VALLEY_NORMAL = new THREE.Vector3().crossVectors(VALLEY_DIRECTION, VALLEY_TANGENT).normalize();
const CAVE_DIRECTION = FEATURE_AXIS_A.clone()
  .multiplyScalar(0.895)
  .addScaledVector(FEATURE_AXIS_B, -0.428)
  .addScaledVector(SUN_DIRECTION, 0.126)
  .normalize();
const CAVE_FORWARD = FEATURE_AXIS_A.clone()
  .addScaledVector(CAVE_DIRECTION, -FEATURE_AXIS_A.dot(CAVE_DIRECTION))
  .normalize();
const CAVE_SIDE = new THREE.Vector3().crossVectors(CAVE_DIRECTION, CAVE_FORWARD).normalize();
const SCATTERED_HILLS = createScatteredTerrainFeatures(30, 24191, "hill");
const SCATTERED_CRATERS = createScatteredTerrainFeatures(16, 78901, "crater");
const PLANET_LOADS = Object.freeze({
  current: {
    planetDetail: 4,
    crackCount: 0,
    dustCount: 600,
    cloudCount: 16,
    atmosphereSegments: 24,
  },
  low: {
    planetWidthSegments: 192,
    planetHeightSegments: 96,
    crackCount: 360,
    dustCount: 250,
    cloudCount: 12,
    atmosphereSegments: 24,
  },
  standard: {
    planetWidthSegments: 256,
    planetHeightSegments: 128,
    crackCount: 800,
    dustCount: 500,
    cloudCount: 15,
    atmosphereSegments: 32,
  },
  high: {
    planetWidthSegments: 512,
    planetHeightSegments: 256,
    crackCount: 1400,
    dustCount: 900,
    cloudCount: 18,
    atmosphereSegments: 48,
  },
});

const bootStartedAt = performance.now();
const baseSettings = getExperimentSettings();
const loadKey = baseSettings.mode === "current" ? "current" : baseSettings.quality;
const planetLoad = PLANET_LOADS[loadKey];
const meshLabel = baseSettings.mode === "realism"
  ? `${planetLoad.planetWidthSegments}x${planetLoad.planetHeightSegments}`
  : `D${planetLoad.planetDetail}`;
const settings = {
  ...baseSettings,
  scopeLabel: "WHOLE PLANET",
  loadLabel: `R340 ${meshLabel} / LANDMARK 8 / CLOUD ${planetLoad.cloudCount.toLocaleString()}`,
};
configureLinks(settings);

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: settings.mode === "realism" && settings.quality === "high",
  alpha: false,
  powerPreference: "high-performance",
});
const realismShadowsEnabled = settings.mode === "realism"
  && settings.view === "flight"
  && settings.preset.shadowSize > 0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = settings.mode === "realism"
  ? THREE.ACESFilmicToneMapping
  : THREE.NoToneMapping;
renderer.toneMappingExposure = settings.mode === "realism" ? 1.04 : 1;
renderer.shadowMap.enabled = realismShadowsEnabled;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const adaptiveDpr = new AdaptivePixelRatio(renderer, settings.preset);
const scene = new THREE.Scene();
let hemisphereLight = null;
let twilightFillLight = null;
let nightFillLight = null;
let sunKeyLight = null;
let flightShadowLight = null;
scene.background = new THREE.Color(0x091317);
if (settings.mode === "realism" && settings.view === "flight") {
  scene.fog = new THREE.FogExp2(0xaacbd4, 0.0036);
}
const camera = new THREE.PerspectiveCamera(
  settings.view === "flight" ? 70 : 46,
  1,
  0.35,
  1500,
);

const textureDisposables = [];
const externalTextureLoads = [];
const movingSurfaceLayers = [];
const cloudVolumes = [];
let sharedCloudTexture = null;
const planet = createPlanet();
planet.receiveShadow = realismShadowsEnabled;
scene.add(planet);
const water = settings.mode === "realism" ? createWaterSurface() : null;
if (water) scene.add(water);
const cave = settings.mode === "realism" ? createFlyThroughCave() : null;
if (cave) scene.add(cave);
const sky = settings.view === "flight" ? createSky() : null;
if (sky) scene.add(sky);
const waterSpray = settings.mode === "realism" && settings.view === "flight"
  ? createWaterSpray()
  : null;
addLighting();
const atmosphere = settings.view === "orbit" ? createAtmosphere() : null;
if (atmosphere) scene.add(atmosphere);
addSurfaceDetails();
const useGlbAssets = settings.mode === "realism"
  && settings.quality === "high"
  && settings.view === "flight";
const specialLandmarks = createSpecialLandmarks({
  scene,
  sunDirection: SUN_DIRECTION,
  getSurfaceRadius,
  realism: settings.mode === "realism",
  bookModelUrl: useGlbAssets ? "./assets/models/old-bible-1825.glb" : null,
  castShadow: realismShadowsEnabled,
});
Object.assign(specialLandmarks.directions, {
  mountain: MOUNTAIN_DIRECTION,
  crater: CRATER_DIRECTION,
  water: WATER_DIRECTION,
  valley: VALLEY_DIRECTION,
  cave: CAVE_DIRECTION,
  cloud: cloudVolumes[0]?.position.clone().normalize(),
});
if (specialLandmarks.ready) externalTextureLoads.push(specialLandmarks.ready);
const flightPlayer = createFlightPlayer(scene, {
  modelUrl: useGlbAssets ? "./assets/models/cesium-man.glb" : null,
  castShadow: realismShadowsEnabled,
});
if (flightPlayer.ready) externalTextureLoads.push(flightPlayer.ready);
flightPlayer.player.visible = settings.view === "flight";
flightPlayer.shadow.visible = false;
if (realismShadowsEnabled) {
  flightPlayer.player.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });
  specialLandmarks.root.traverse((object) => {
    if (!object.isMesh || object.material?.transparent) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  cave?.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

const flightStick = document.querySelector("#flight-stick");
const flightStickKnob = flightStick.querySelector("span");
const flightSpeedSlider = document.querySelector("#flight-speed-slider");
const flightSpeedValue = document.querySelector("#flight-speed-value");
const flightReadout = document.querySelector("#flight-readout");
const flightHelp = document.querySelector(".help");
const flightStickTarget = new THREE.Vector2();
const flightKeyTarget = new THREE.Vector2();
const flightUp = new THREE.Vector3();
const flightRight = new THREE.Vector3();
const flightNextUp = new THREE.Vector3();
const flightLookTarget = new THREE.Vector3();
const flightPreviousForward = new THREE.Vector3();
const flightCross = new THREE.Vector3();
const flightVisualForward = new THREE.Vector3();
const flightCameraForward = new THREE.Vector3();
const flightCameraTarget = new THREE.Vector3();
const flightCameraDesired = new THREE.Vector3();
const flightTerrainAheadUp = new THREE.Vector3();
const flightFogColor = new THREE.Color();
const flightSunColor = new THREE.Color();
const flightHemisphereSkyColor = new THREE.Color();
const flightHemisphereGroundColor = new THREE.Color();
const lightDaySun = new THREE.Color(0xffe0b0);
const lightDuskSun = new THREE.Color(0xff6336);
const lightDaySky = new THREE.Color(0xbad9e7);
const lightDuskSky = new THREE.Color(0xffa260);
const lightNightSky = new THREE.Color(0x7398bf);
const lightDayGround = new THREE.Color(0x425369);
const lightDuskGround = new THREE.Color(0x8c3528);
const lightNightGround = new THREE.Color(0x1d2a42);
const flightFogDay = new THREE.Color(0xaacbd4);
const flightFogDusk = new THREE.Color(0xc58b73);
const flightFogNight = new THREE.Color(0x304b67);
const cloudMistColor = new THREE.Color(0xe8eef0);
let cloudPassageMix = 0;
const flight = {
  position: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  speed: 40,
  speedSelection: 40,
  holdAccel: 0,
  radialSpeed: 0,
  cruiseAltitude: 10,
  bodyPitch: -0.12,
  roll: 0,
  cameraLift: 0,
  onGround: false,
  stickId: null,
  stickOffset: new THREE.Vector2(),
  stickSmooth: new THREE.Vector2(),
  keySmooth: new THREE.Vector2(),
  directId: null,
  directLastX: 0,
  directLastY: 0,
  directTurnX: 0,
  directTurnY: 0,
  accelPointers: new Set(),
  keys: new Set(),
  readoutElapsed: 0,
};
const orbit = {
  yaw: -0.46,
  pitch: 0.2,
  distance: 960,
  desiredYaw: -0.46,
  desiredPitch: 0.2,
  desiredDistance: 960,
  dragging: false,
  pointerId: null,
  x: 0,
  y: 0,
  idle: 0,
};
const FLIGHT_STICK_LIMIT = 50;
const FLIGHT_STICK_DEADZONE = 0.12;
const FLIGHT_STICK_SCALE = 0.5;
const FLIGHT_STICK_RESPONSE = 5;
const FLIGHT_STICK_RETURN = 3.2;
const FLIGHT_VERTICAL_RELEASE = 12;
const FLIGHT_ARROW_SCALE_X = 0.5;
const FLIGHT_PHYSICS = Object.freeze({
  GROUND_SPEED: 7,
  MIN_FORWARD_SPEED: 9,
  GLIDE_DRAG: 0.03,
  HOLD_ACCEL_RATE: 7.5,
  LOCK_ACCEL_DECAY: 1.4,
  LOCK_SPEED_ACCEL: 3.2,
  LOCK_SPEED_SETTLE: 0.9,
  STICK_BOOST: 1.7,
  STICK_CLIMB: 11.5,
  STICK_DESCEND: 6.5,
  DESCEND_RESPONSE: 1.7,
  DESCEND_TARGET_RATIO: 0.3,
  DESCEND_TARGET_MIN: 1.9,
  SOFT_GROUND_RANGE: 2.4,
  SOFT_GROUND_FORCE: 28,
  SOFT_GROUND_DAMP: 7.5,
  SOFT_GROUND_MIN_ALT: 0.32,
  SOFT_GROUND_LAND_ALT: 0.08,
  NEUTRAL_ALTITUDE: 10,
  NEUTRAL_DESCEND_MIN: 0.55,
  NEUTRAL_DESCEND_MAX: 2.1,
  NEUTRAL_RETURN: 1.1,
  NEUTRAL_ASCENT_BRAKE: 3,
  NEUTRAL_ALTITUDE_DEADZONE: 0.3,
  TERRAIN_LOOK_AHEAD_SECONDS: 1.15,
  TERRAIN_FOLLOW_ASCENT_MAX: 6,
  TERRAIN_FOLLOW_DESCENT_MAX: 3.2,
  TERRAIN_FOLLOW_ALTITUDE_RETURN: 0.45,
  TERRAIN_FOLLOW_ALTITUDE_MAX: 2.1,
  MAX_ASCENT_ANGLE: Math.PI / 4,
  CRUISE_BODY_PITCH: -0.12,
  DESCEND_INPUT_PITCH: 0.18,
  MAX_BODY_PITCH: Math.PI / 9,
  BODY_PITCH_RESPONSE: 6,
  BODY_DESCEND_PITCH_RESPONSE: 1.5,
  MAX_BANK: 0.9,
  BANK_FROM_TURN: 3.4,
  ROLL_RESPONSE: 4.8,
  CAMERA_DISTANCE: 11,
  CAMERA_HEIGHT: 2.8,
  CAMERA_DISTANCE_SPEED: 0.08,
  CAMERA_SMOOTH: 0.12,
  CAMERA_PITCH_SMOOTH: 3.4,
  CAMERA_DESCEND_PITCH_SMOOTH: 0.85,
  BASE_FOV: 70,
  SPEED_FOV: 7,
});

if (settings.view === "flight") {
  document.body.classList.add("flight-mode");
  flightReadout.classList.add("is-visible");
  flightHelp.textContent = "右スティック・WASD・矢印で球面飛行 / 長押し・Spaceで加速";
  resetFlight();
}

const startupMs = performance.now() - bootStartedAt;
const perfHud = new PerformanceHud(
  document.querySelector("#perf-hud"),
  renderer,
  settings,
  startupMs,
);

setupInteraction();
resize();
window.addEventListener("resize", resize, { passive: true });
const loadingElement = document.querySelector("#loading");
if (externalTextureLoads.length) {
  Promise.allSettled(externalTextureLoads).then(() => loadingElement.classList.add("is-hidden"));
} else {
  loadingElement.classList.add("is-hidden");
}

const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  elapsed += delta;
  specialLandmarks.update(delta);
  if (settings.view === "flight") updateFlight(delta);
  else updateOrbit(delta);
  if (waterSpray) updateWaterSpray(waterSpray, delta);

  for (const layer of movingSurfaceLayers) {
    layer.object.rotation.y = elapsed * layer.speed;
  }
  if (water?.material.normalMap) {
    water.material.normalMap.offset.set(elapsed * 0.004, elapsed * -0.0025);
  }
  if (atmosphere) atmosphere.material.uniforms.cameraPos.value.copy(camera.position);
  if (sky) {
    sky.position.copy(camera.position);
    sky.material.uniforms.cameraPos.value.copy(camera.position);
  }
  if (adaptiveDpr.sample(delta)) resize();
  updateFlightShadow();
  renderer.render(scene, camera);
  perfHud.update(delta, adaptiveDpr.ratio);
});

function createPlanet() {
  const geometry = settings.mode === "realism"
    ? new THREE.SphereGeometry(
      PLANET_RADIUS,
      planetLoad.planetWidthSegments,
      planetLoad.planetHeightSegments,
    )
    : new THREE.IcosahedronGeometry(PLANET_RADIUS, planetLoad.planetDetail);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  const colors = new Float32Array(positions.count * 3);
  const normals = new Float32Array(positions.count * 3);
  const direction = new THREE.Vector3();
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    direction.fromBufferAttribute(positions, index).normalize();
    const height = terrainHeightFromDirection(direction);
    const radius = PLANET_RADIUS + height;
    positions.setXYZ(index, direction.x * radius, direction.y * radius, direction.z * radius);
    if (settings.mode === "realism" && uvs) {
      const warpedU = uvs.getX(index)
        + terrainSignal(direction, 3.2, 8.4) * 0.018
        + terrainSignal(direction, 8.7, 1.9) * 0.006;
      const warpedV = uvs.getY(index)
        + terrainSignal(direction, 3.8, 5.7) * 0.016
        + terrainSignal(direction, 9.4, 3.1) * 0.005;
      uvs.setXY(index, warpedU, warpedV);
    }
    getTerrainColor(direction, height, color);
    if (settings.mode === "realism" && settings.quality === "high") {
      color.lerp(TERRAIN_TEXTURE_TINT, 0.66);
    }
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    normals[index * 3] = direction.x;
    normals[index * 3 + 1] = direction.y;
    normals[index * 3 + 2] = direction.z;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (settings.mode === "realism") {
    geometry.computeVertexNormals();
  } else {
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  }
  const material = settings.mode === "realism"
    ? createRealisticPlanetMaterial()
    : new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
  return new THREE.Mesh(geometry, material);
}

function terrainHeightFromDirection(direction) {
  const ridge = Math.sin(direction.x * 7 + direction.z * 3.4) * 1.5;
  const swell = Math.cos(direction.y * 8.6 - direction.x * 2.4) * 1.0;
  const twist = Math.sin((direction.x - direction.z) * 10 + direction.y * 4.2) * 0.55;
  const productionSurface = ridge + swell + twist;
  if (settings.mode !== "realism") return productionSurface;

  const continentalRise = terrainSignal(direction, 2.15, 0.72) * 18;
  const rollingHighland = terrainSignal(direction, 4.1, 2.38) * 10;
  const ruggedGround = terrainSignal(direction, 10.5, 4.7) * 4.8;
  return productionSurface
    + continentalRise
    + rollingHighland
    + ruggedGround
    + terrainFeatureHeight(direction);
}

function terrainFeatureHeight(direction) {
  let height = 0;
  for (const peak of MOUNTAIN_PEAKS) {
    const distance = chordDistance(direction, peak.direction);
    const profile = Math.exp(-Math.pow(distance / peak.radius, 1.7));
    const erosion = 0.72 + Math.abs(terrainSignal(direction, 18, peak.phase)) * 0.38;
    height += peak.height * profile * erosion;
  }

  const craterDistance = chordDistance(direction, CRATER_DIRECTION);
  height -= 32 * Math.exp(-Math.pow(craterDistance / 0.115, 3.2));
  height += 16 * Math.exp(-Math.pow((craterDistance - 0.15) / 0.048, 2));

  const basinDistance = chordDistance(direction, WATER_DIRECTION);
  height -= 29 * Math.exp(-Math.pow(basinDistance / 0.24, 2));

  const valleyCrossTrack = Math.abs(direction.dot(VALLEY_NORMAL));
  const valleyAlongTrack = chordDistance(direction, VALLEY_DIRECTION);
  const valleyLength = 1 - THREE.MathUtils.smoothstep(valleyAlongTrack, 0.28, 0.5);
  height -= 31 * Math.exp(-Math.pow(valleyCrossTrack / 0.045, 2)) * valleyLength;
  height += 11 * Math.exp(-Math.pow((valleyCrossTrack - 0.09) / 0.03, 2)) * valleyLength;

  for (const hill of SCATTERED_HILLS) {
    const distance = chordDistance(direction, hill.direction);
    if (distance > hill.radius * 2.35) continue;
    const profile = Math.exp(-Math.pow(distance / hill.radius, 1.9));
    const erosion = 0.9 + Math.abs(terrainSignal(direction, 7.5, hill.phase)) * 0.18;
    height += hill.height * profile * erosion;
  }

  for (const crater of SCATTERED_CRATERS) {
    const distance = chordDistance(direction, crater.direction);
    if (distance > crater.radius * 2.35) continue;
    height -= crater.depth * Math.exp(-Math.pow(distance / crater.radius, 3.2));
    height += crater.rimHeight
      * Math.exp(-Math.pow((distance - crater.radius * 1.36) / (crater.radius * 0.38), 2));
  }
  return height;
}

function createScatteredTerrainFeatures(count, seed, type) {
  const random = createSeededRandom(seed);
  const direction = new THREE.Vector3();
  const features = [];
  for (let index = 0; index < count; index += 1) {
    randomSphereDirection(random, direction);
    if (type === "hill") {
      features.push({
        direction: direction.clone(),
        height: 9 + Math.pow(random(), 0.72) * 23,
        radius: 0.07 + random() * 0.11,
        phase: random() * Math.PI * 2,
      });
    } else {
      features.push({
        direction: direction.clone(),
        depth: 8 + random() * 18,
        radius: 0.06 + random() * 0.075,
        rimHeight: 3.5 + random() * 7.5,
      });
    }
  }
  return features;
}

function chordDistance(first, second) {
  return Math.sqrt(Math.max(0, 2 - 2 * THREE.MathUtils.clamp(first.dot(second), -1, 1)));
}

function terrainSignal(direction, frequency, phase) {
  const first = Math.sin(
    (direction.x * 0.73 + direction.y * 0.41 + direction.z * 0.57) * frequency + phase,
  );
  const second = Math.sin(
    (direction.x * 0.31 - direction.y * 0.82 + direction.z * 0.47)
      * frequency * 1.37
      - phase * 0.71,
  );
  const third = Math.cos(
    (-direction.x * 0.61 + direction.y * 0.36 + direction.z * 0.69)
      * frequency * 0.83
      + phase * 1.31,
  );
  return (first + second + third) / 3;
}

function getTerrainRadius(direction) {
  return PLANET_RADIUS + terrainHeightFromDirection(direction);
}

function getSurfaceRadius(direction) {
  const terrainRadius = getTerrainRadius(direction);
  return settings.mode === "realism" ? Math.max(terrainRadius, WATER_RADIUS) : terrainRadius;
}

function getTerrainColor(direction, height, target) {
  if (settings.mode !== "realism") {
    const bands = [0x00d9ff, 0x7a4dff, 0xff3f94, 0xff9822, 0xb8ff1f];
    const patch = Math.abs(Math.floor(
      direction.x * 9 + direction.y * 13 + direction.z * 17 + height * 0.8,
    )) % bands.length;
    return target.setHex(bands[patch]);
  }

  const moisture = terrainSignal(direction, 4.6, 2.2) - Math.abs(direction.y) * 0.18;
  const exposedRock = THREE.MathUtils.smoothstep(height, 1.0, 4.4);
  const highland = THREE.MathUtils.smoothstep(height, 3.5, 6.2);
  target.copy(TERRAIN_DRY).lerp(TERRAIN_WET, THREE.MathUtils.smoothstep(moisture, -0.18, 0.36));
  target.lerp(TERRAIN_ROCK, exposedRock * 0.72);
  return target.lerp(TERRAIN_HIGH, highland * 0.68);
}

function createRealisticPlanetMaterial() {
  if (settings.quality === "high") {
    const repeatX = 18;
    const repeatY = 9;
    const offsetX = 0.13;
    const offsetY = 0.08;
    const color = loadPbrTexture(
      "./assets/rocks-ground-04-diff-1k.jpg",
      true,
      repeatX,
      repeatY,
      offsetX,
      offsetY,
    );
    const normal = loadPbrTexture(
      "./assets/rocks-ground-04-normal-gl-1k.jpg",
      false,
      repeatX,
      repeatY,
      offsetX,
      offsetY,
    );
    return new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.78, 0.78),
      roughness: 1,
      metalness: 0,
      vertexColors: true,
    });
  }
  const maps = createPlanetTextures(settings.preset.textureSize);
  return new THREE.MeshStandardMaterial({
    map: maps.color,
    bumpMap: maps.height,
    bumpScale: settings.quality === "high" ? 0.78 : 0.52,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
}

function createWaterSurface() {
  const widthSegments = Math.max(96, Math.round(planetLoad.planetWidthSegments * 0.75));
  const heightSegments = Math.max(48, Math.round(planetLoad.planetHeightSegments * 0.75));
  const normalMap = createWaterNormalTexture(settings.quality === "high" ? 256 : 128);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x73bac4,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    reflectivity: 0.7,
    ior: 1.333,
    specularIntensity: 1,
    specularColor: 0xd9f4f5,
    envMap: createWaterEnvironmentMap(),
    envMapIntensity: 0.9,
    normalMap,
    normalScale: new THREE.Vector2(0.16, 0.16),
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const waterSurface = new THREE.Mesh(
    new THREE.SphereGeometry(WATER_RADIUS, widthSegments, heightSegments),
    material,
  );
  waterSurface.renderOrder = 1;
  return waterSurface;
}

function createWaterNormalTexture(size) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const dx = Math.cos((u * 11 + v * 3.3) * Math.PI * 2) * 0.13
        + Math.cos((u * 23.7 - v * 7.1) * Math.PI * 2) * 0.075
        + Math.sin((u * 46.3 + v * 12.7) * Math.PI * 2) * 0.036
        + Math.cos((u * 6.1 - v * 17.9) * Math.PI * 2) * 0.052;
      const dy = Math.sin((v * 12.7 + u * 2.6) * Math.PI * 2) * 0.12
        + Math.sin((v * 27.1 - u * 8.4) * Math.PI * 2) * 0.068
        + Math.cos((v * 43.9 + u * 14.3) * Math.PI * 2) * 0.034
        + Math.sin((v * 7.3 - u * 19.1) * Math.PI * 2) * 0.048;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * size + x) * 4;
      pixels.data[offset] = 128 + (-dx / length) * 127;
      pixels.data[offset + 1] = 128 + (-dy / length) * 127;
      pixels.data[offset + 2] = 128 + (1 / length) * 127;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 9);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textureDisposables.push(texture);
  return texture;
}

function createWaterEnvironmentMap() {
  const faceColors = [
    [0x9fc9db, 0x396f88],
    [0x85b8cf, 0x315e76],
    [0xd5e6e7, 0x6f9faf],
    [0x284f65, 0x122f43],
    [0xa8cfdd, 0x41768d],
    [0x8bbccf, 0x315f78],
  ];
  const faces = faceColors.map(([top, bottom]) => {
    const face = document.createElement("canvas");
    face.width = 32;
    face.height = 32;
    const context = face.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, `#${top.toString(16).padStart(6, "0")}`);
    gradient.addColorStop(1, `#${bottom.toString(16).padStart(6, "0")}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    return face;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textureDisposables.push(texture);
  return texture;
}

function createFlyThroughCave() {
  const group = new THREE.Group();
  const length = 64;
  const lengthSegments = 36;
  const radialSegments = 40;
  const baseRadius = 8.4;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const stride = radialSegments + 1;
  const layerStride = (lengthSegments + 1) * stride;
  for (let layer = 0; layer < 2; layer += 1) {
    const outer = layer === 1;
    for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex += 1) {
      const progress = lengthIndex / lengthSegments;
      const baseZ = (progress - 0.5) * length;
      let z = baseZ;
      const mound = 0.38 + Math.pow(Math.sin(progress * Math.PI), 0.72) * 0.62;
      const curveY = -(z * z) / (PLANET_RADIUS * 2);
      for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
        const radialProgress = radialIndex / radialSegments;
        const angle = radialProgress * Math.PI * 2;
        const entranceSign = lengthIndex === 0 ? -1 : lengthIndex === lengthSegments ? 1 : 0;
        if (entranceSign) {
          const edgeDepth = Math.sin(angle * 5 + 0.7) * 0.86
            + Math.sin(angle * 9 - 1.1) * 0.38;
          z = baseZ + entranceSign * edgeDepth * (outer ? 1.35 : 0.48);
        }
        const irregularity = Math.sin(angle * 3 + z * 0.16) * 0.78
          + Math.sin(angle * 7 - z * 0.09) * 0.34
          + Math.sin(z * 0.31) * 0.32;
        const upper = Math.max(0, Math.cos(angle));
        const side = Math.abs(Math.sin(angle));
        const shell = outer
          ? 2.6 + mound * (4.2 + upper * 7.8 + side * 2.2)
          : 0;
        const ridge = outer
          ? mound * (
            Math.sin(z * 0.12 + angle * 2.15) * 1.25
            + Math.sin(z * 0.27 - angle * 3.4) * 0.52
          )
          : 0;
        const radius = baseRadius + irregularity + shell + ridge;
        const x = Math.sin(angle) * radius * (outer ? 1.08 : 1);
        const y = curveY + Math.cos(angle) * radius * (outer ? 0.94 : 0.88);
        positions.push(x, y, z);
        uvs.push(radialProgress * 2.2, progress * 4.8);
        const shade = outer
          ? 0.74 + upper * 0.1 + Math.sin(angle * 2.4 + z * 0.13) * 0.045
          : 0.38 + upper * 0.12 + Math.sin(z * 0.27) * 0.035;
        colors.push(shade, shade * 0.9, shade * 0.78);
      }
    }
  }

  for (let layer = 0; layer < 2; layer += 1) {
    const layerOffset = layer * layerStride;
    for (let lengthIndex = 0; lengthIndex < lengthSegments; lengthIndex += 1) {
      for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
        const a = layerOffset + lengthIndex * stride + radialIndex;
        const b = a + stride;
        if (layer === 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  for (const lengthIndex of [0, lengthSegments]) {
    const innerOffset = lengthIndex * stride;
    const outerOffset = layerStride + lengthIndex * stride;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const innerA = innerOffset + radialIndex;
      const innerB = innerA + 1;
      const outerA = outerOffset + radialIndex;
      const outerB = outerA + 1;
      if (lengthIndex === 0) {
        indices.push(innerA, outerA, innerB, innerB, outerA, outerB);
      } else {
        indices.push(innerA, innerB, outerA, innerB, outerB, outerA);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const surfaceIndexCount = lengthSegments * radialSegments * 6;
  geometry.addGroup(0, surfaceIndexCount, 0);
  geometry.addGroup(surfaceIndexCount, surfaceIndexCount, 1);
  geometry.addGroup(surfaceIndexCount * 2, radialSegments * 12, 2);
  geometry.computeVertexNormals();

  const caveMap = createCaveTexture();
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x73695d,
    map: caveMap,
    bumpMap: caveMap,
    bumpScale: 0.42,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const outerColorMap = loadPbrTexture(
    "./assets/rocks-ground-04-diff-1k.jpg",
    true,
    1.25,
    1.4,
    0.11,
    0.07,
  );
  const outerNormalMap = loadPbrTexture(
    "./assets/rocks-ground-04-normal-gl-1k.jpg",
    false,
    1.25,
    1.4,
    0.11,
    0.07,
  );
  const outerMaterial = new THREE.MeshStandardMaterial({
    color: 0xb5ab9d,
    map: outerColorMap,
    normalMap: outerNormalMap,
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x827568,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(geometry, [innerMaterial, outerMaterial, rimMaterial]));

  const surfaceRadius = getTerrainRadius(CAVE_DIRECTION);
  group.position.copy(CAVE_DIRECTION).multiplyScalar(surfaceRadius + 7.9);
  const orientation = new THREE.Matrix4().makeBasis(CAVE_SIDE, CAVE_DIRECTION, CAVE_FORWARD);
  group.quaternion.setFromRotationMatrix(orientation);
  group.userData.direction = CAVE_DIRECTION;
  group.userData.forward = CAVE_FORWARD;
  return group;
}

function createCaveTexture() {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const broad = Math.sin(x * 0.071 + Math.sin(y * 0.043) * 2.1) * 0.5 + 0.5;
      const grain = Math.sin(x * 0.39 + y * 0.31) * Math.cos(y * 0.27 - x * 0.18) * 0.5 + 0.5;
      const fissure = Math.abs(Math.sin(x * 0.028 + Math.sin(y * 0.052) * 3.4));
      const crack = fissure < 0.055 ? -26 : 0;
      pixels.data[offset] = 82 + broad * 42 + grain * 22 + crack;
      pixels.data[offset + 1] = 72 + broad * 34 + grain * 18 + crack;
      pixels.data[offset + 2] = 61 + broad * 28 + grain * 14 + crack;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.05, 1.2);
  texture.offset.set(0.17, 0.09);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textureDisposables.push(texture);
  return texture;
}

function loadPbrTexture(path, isColor, repeatX = 31, repeatY = 15.5, offsetX = 0, offsetY = 0) {
  let resolveLoad;
  const loadComplete = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const texture = new THREE.TextureLoader().load(
    path,
    () => resolveLoad(),
    undefined,
    (error) => {
      console.warn(`PBR texture failed to load: ${path}`, error);
      resolveLoad();
    },
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(offsetX, offsetY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  externalTextureLoads.push(loadComplete);
  return texture;
}

function createGlobalTerrainTextures(size) {
  const width = Math.max(1024, Math.round(size * 1.5));
  const height = Math.max(256, Math.round(width * 0.5));
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorContext = colorCanvas.getContext("2d");
  const colorPixels = colorContext.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      const broad = tiledValueNoise(u, v, 7, 4, 1207);
      const middle = tiledValueNoise(u, v, 23, 12, 911);
      const detail = tiledValueNoise(u, v, 89, 45, 3571);
      const grain = tiledValueNoise(u, v, 421, 211, 7187);
      const mineral = tiledValueNoise(u, v, 43, 22, 17021);
      const variation = (broad - 0.5) * 42
        + (middle - 0.5) * 34
        + (detail - 0.5) * 21
        + (grain - 0.5) * 11;
      const damp = THREE.MathUtils.smoothstep(middle + broad * 0.3, 0.69, 1.04);
      const pale = THREE.MathUtils.smoothstep(mineral, 0.73, 0.92);
      const offset = (y * width + x) * 4;
      colorPixels.data[offset] = 128 + variation - damp * 22 + pale * 28;
      colorPixels.data[offset + 1] = 120 + variation - damp * 9 + pale * 22;
      colorPixels.data[offset + 2] = 104 + variation + damp * 2 + pale * 16;
      colorPixels.data[offset + 3] = 255;
    }
  }

  colorContext.putImageData(colorPixels, 0, 0);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return {
    color: makeGlobalTexture(colorCanvas, true, anisotropy),
  };
}

function makeGlobalTexture(canvasElement, isColor, anisotropy) {
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = anisotropy;
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  return texture;
}

function enhanceGlobalTerrainColorTexture(texture, path) {
  let resolveLoad;
  const loadComplete = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const image = new Image();
  image.onload = () => {
    const canvasElement = texture.image;
    const context = canvasElement.getContext("2d");
    const mosaic = document.createElement("canvas");
    mosaic.width = canvasElement.width;
    mosaic.height = canvasElement.height;
    const mosaicContext = mosaic.getContext("2d");
    const random = createSeededRandom(64217);
    const tileSize = Math.max(192, Math.round(mosaic.width / 6));
    const step = Math.round(tileSize * 0.78);
    const cropSize = Math.min(image.width, image.height) * 0.42;

    mosaicContext.drawImage(image, 0, 0, mosaic.width, mosaic.height);
    mosaicContext.globalAlpha = 0.72;
    for (let y = -tileSize; y < mosaic.height + tileSize; y += step) {
      for (let x = -tileSize; x < mosaic.width + tileSize; x += step) {
        const sourceX = random() * Math.max(1, image.width - cropSize);
        const sourceY = random() * Math.max(1, image.height - cropSize);
        const rotation = Math.floor(random() * 4) * Math.PI * 0.5;
        const flipX = random() > 0.5 ? -1 : 1;
        const flipY = random() > 0.5 ? -1 : 1;
        mosaicContext.save();
        mosaicContext.translate(x + tileSize * 0.5, y + tileSize * 0.5);
        mosaicContext.rotate(rotation);
        mosaicContext.scale(flipX, flipY);
        mosaicContext.drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          -tileSize * 0.62,
          -tileSize * 0.62,
          tileSize * 1.24,
          tileSize * 1.24,
        );
        mosaicContext.restore();
      }
    }

    context.save();
    context.globalAlpha = 0.82;
    context.globalCompositeOperation = "multiply";
    context.drawImage(mosaic, 0, 0);
    context.restore();
    texture.needsUpdate = true;
    resolveLoad();
  };
  image.onerror = (error) => {
    console.warn(`Terrain source failed to load: ${path}`, error);
    resolveLoad();
  };
  image.src = path;
  externalTextureLoads.push(loadComplete);
}

function createPlanetTextures(size) {
  const colorCanvas = document.createElement("canvas");
  const heightCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  for (const item of [colorCanvas, heightCanvas, roughnessCanvas]) {
    item.width = size;
    item.height = size;
  }

  const colorContext = colorCanvas.getContext("2d");
  const heightContext = heightCanvas.getContext("2d");
  const roughnessContext = roughnessCanvas.getContext("2d");
  const colorData = colorContext.createImageData(size, size);
  const heightData = heightContext.createImageData(size, size);
  const roughnessData = roughnessContext.createImageData(size, size);
  const heights = new Float32Array(size * size);

  for (let index = 0; index < heights.length; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    const u = x / size;
    const v = y / size;
    const broad = tiledValueNoise(u, v, 18, 9, 1207);
    const middle = tiledValueNoise(u, v, 52, 26, 911);
    const fine = tiledValueNoise(u, v, 176, 88, 3571);
    const grain = tiledValueNoise(u, v, 352, 176, 7187);
    heights[index] = broad * 0.24 + middle * 0.38 + fine * 0.26 + grain * 0.12;
  }

  for (let index = 0; index < heights.length; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    const height = heights[index];
    const mineral = noiseHash(x, y, 11239);
    const vein = tiledValueNoise(x / size, y / size, 30, 15, 17021);
    const offset = index * 4;
    const tone = 174 + height * 62;
    const damp = THREE.MathUtils.smoothstep(vein, 0.58, 0.84);
    const rust = mineral > 0.972 ? (mineral - 0.972) * 680 : 0;
    const pale = mineral < 0.026 ? (0.026 - mineral) * 540 : 0;
    colorData.data[offset] = tone + 10 - damp * 13 + rust + pale;
    colorData.data[offset + 1] = tone + 3 - damp * 5 + rust * 0.28 + pale;
    colorData.data[offset + 2] = tone - 9 + damp * 3 - rust * 0.2 + pale * 0.82;
    colorData.data[offset + 3] = 255;

    const relief = 38 + height * 208;
    heightData.data[offset] = relief;
    heightData.data[offset + 1] = relief;
    heightData.data[offset + 2] = relief;
    heightData.data[offset + 3] = 255;

    const roughness = 188 + height * 54 + Math.abs(vein - 0.5) * 20;
    roughnessData.data[offset] = roughness;
    roughnessData.data[offset + 1] = roughness;
    roughnessData.data[offset + 2] = roughness;
    roughnessData.data[offset + 3] = 255;
  }

  colorContext.putImageData(colorData, 0, 0);
  heightContext.putImageData(heightData, 0, 0);
  roughnessContext.putImageData(roughnessData, 0, 0);
  const anisotropy = Math.min(
    settings.quality === "high" ? 8 : 4,
    renderer.capabilities.getMaxAnisotropy(),
  );
  return {
    color: makeTexture(colorCanvas, true, anisotropy, 7, 3.5),
    height: makeTexture(heightCanvas, false, anisotropy, 14, 7),
    roughness: makeTexture(roughnessCanvas, false, anisotropy, 14, 7),
  };
}

function tiledValueNoise(u, v, cellsX, cellsY, seed) {
  const x = u * cellsX;
  const y = v * cellsY;
  const xFloor = Math.floor(x);
  const yFloor = Math.floor(y);
  const x0 = xFloor % cellsX;
  const y0 = yFloor % cellsY;
  const x1 = (x0 + 1) % cellsX;
  const y1 = (y0 + 1) % cellsY;
  const tx = smoothNoiseStep(x - xFloor);
  const ty = smoothNoiseStep(y - yFloor);
  const top = THREE.MathUtils.lerp(noiseHash(x0, y0, seed), noiseHash(x1, y0, seed), tx);
  const bottom = THREE.MathUtils.lerp(noiseHash(x0, y1, seed), noiseHash(x1, y1, seed), tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

function noiseHash(x, y, seed) {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed * 3, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothNoiseStep(value) {
  return value * value * (3 - 2 * value);
}

function makeTexture(canvasElement, isColor, anisotropy, repeatX, repeatY) {
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  return texture;
}

function addSurfaceDetails() {
  const random = createSeededRandom(89173);
  if (settings.mode !== "realism" && planetLoad.crackCount) addCracks(random);
  addDust(random);
  addClouds(random);
}

function addFloatingArtifacts(random) {
  const group = new THREE.Group();
  const relicBump = createRelicBumpTexture();
  const geometries = [
    new THREE.TorusGeometry(0.98, 0.19, 8, 36, Math.PI * 1.54),
    new THREE.TorusKnotGeometry(0.78, 0.17, 42, 7, 2, 3),
    createSpindleRelicGeometry(),
  ];
  const coreGeometries = [
    new THREE.SphereGeometry(0.19, 12, 8),
    new THREE.DodecahedronGeometry(0.21, 0),
    new THREE.TorusGeometry(0.23, 0.055, 6, 18),
  ];
  const dayPalette = [0x4c514d, 0x52665f, 0x806a4f];
  const nightPalette = [0x243f44, 0x24414b, 0x304b53];
  const nightEmission = [0x48c2cd, 0x4e9ed1, 0x79dbe5];
  const glowPositions = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const tumble = new THREE.Quaternion();
  const tumbleEuler = new THREE.Euler();
  const jitter = new THREE.Vector3();
  const clusters = createDirectionClusters(random, 32);

  geometries.forEach((geometry, typeIndex) => {
    const count = Math.floor(planetLoad.floatingCount / geometries.length)
      + (typeIndex < planetLoad.floatingCount % geometries.length ? 1 : 0);
    const sideCounts = [Math.ceil(count * 0.5), Math.floor(count * 0.5)];

    sideCounts.forEach((sideCount, sideIndex) => {
      const nightSide = sideIndex === 1;
      const material = new THREE.MeshStandardMaterial({
        color: nightSide ? nightPalette[typeIndex] : dayPalette[typeIndex],
        emissive: nightSide ? nightEmission[typeIndex] : 0x000000,
        emissiveIntensity: nightSide ? 0.24 : 0,
        roughness: nightSide ? 0.48 : 0.82,
        metalness: nightSide ? 0.22 : 0.08,
        bumpMap: relicBump,
        bumpScale: nightSide ? 0.11 : 0.19,
        flatShading: false,
      });
      const artifacts = new THREE.InstancedMesh(geometry, material, sideCount);
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: nightSide ? 0x8edee5 : 0xb79558,
        emissive: nightSide ? 0x55d5e4 : 0x1e0d02,
        emissiveIntensity: nightSide ? 1.65 : 0.12,
        roughness: nightSide ? 0.24 : 0.42,
        metalness: nightSide ? 0.28 : 0.46,
      });
      const cores = new THREE.InstancedMesh(coreGeometries[typeIndex], coreMaterial, sideCount);

      for (let index = 0; index < sideCount; index += 1) {
        do {
          sampleClusteredDirection(random, clusters, direction, jitter, 0.82);
        } while ((direction.dot(SUN_DIRECTION) < -0.08) !== nightSide);
        const altitude = 10 + Math.pow(random(), 0.78) * 40;
        const size = 0.8 + Math.pow(random(), 1.35) * 2.3;
        position.copy(direction).multiplyScalar(getSurfaceRadius(direction) + altitude);
        orientation.setFromUnitVectors(WORLD_UP, direction);
        spin.setFromAxisAngle(direction, random() * Math.PI * 2);
        orientation.premultiply(spin);
        tumbleEuler.set(
          (random() - 0.5) * 1.1,
          (random() - 0.5) * 1.1,
          (random() - 0.5) * 0.7,
        );
        tumble.setFromEuler(tumbleEuler);
        orientation.multiply(tumble);
        scale.set(
          size * (0.82 + random() * 0.36),
          size * (0.82 + random() * 0.52),
          size * (0.82 + random() * 0.36),
        );
        matrix.compose(position, orientation, scale);
        artifacts.setMatrixAt(index, matrix);
        cores.setMatrixAt(index, matrix);
        if (nightSide && random() < 0.58) {
          glowPositions.push(position.x, position.y, position.z);
        }
      }

      artifacts.instanceMatrix.needsUpdate = true;
      cores.instanceMatrix.needsUpdate = true;
      artifacts.computeBoundingSphere();
      cores.computeBoundingSphere();
      group.add(artifacts, cores);
    });
  });

  if (glowPositions.length) {
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(glowPositions, 3),
    );
    const glows = new THREE.Points(
      glowGeometry,
      new THREE.PointsMaterial({
        map: createSoftParticleTexture(),
        color: 0x8defff,
        size: 9.5,
        transparent: true,
        opacity: 0.34,
        alphaTest: 0.012,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    group.add(glows);
  }

  scene.add(group);
  movingSurfaceLayers.push({ object: group, speed: 0.0015 });
}

function createRelicBumpTexture() {
  const size = 192;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = tiledValueNoise(x / size, y / size, 9, 9, 8711);
      const grain = noiseHash(x, y, 19447);
      const value = 78 + broad * 126 + grain * 46;
      const offset = (y * size + x) * 4;
      pixels.data[offset] = value;
      pixels.data[offset + 1] = value;
      pixels.data[offset + 2] = value;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  context.strokeStyle = "rgba(24, 24, 24, 0.7)";
  context.lineWidth = 2;
  for (let index = 0; index < 22; index += 1) {
    const startX = noiseHash(index, 3, 1171) * size;
    const startY = noiseHash(index, 7, 1889) * size;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(
      startX + (noiseHash(index, 11, 2251) - 0.5) * 58,
      startY + (noiseHash(index, 17, 3371) - 0.5) * 58,
    );
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 3.5);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  textureDisposables.push(texture);
  return texture;
}

function createSpindleRelicGeometry() {
  const profile = [
    new THREE.Vector2(0.05, -1.55),
    new THREE.Vector2(0.42, -1.24),
    new THREE.Vector2(0.18, -0.72),
    new THREE.Vector2(0.5, -0.18),
    new THREE.Vector2(0.46, 0.24),
    new THREE.Vector2(0.16, 0.76),
    new THREE.Vector2(0.38, 1.24),
    new THREE.Vector2(0.04, 1.56),
  ];
  const geometry = new THREE.LatheGeometry(profile, 18);
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index);
    const angle = vertex.y * 0.2;
    const x = vertex.x * Math.cos(angle) - vertex.z * Math.sin(angle);
    const z = vertex.x * Math.sin(angle) + vertex.z * Math.cos(angle);
    const weathering = 0.96 + Math.sin(index * 1.83) * 0.025;
    vertex.set(x * weathering, vertex.y, z * weathering);
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addRocks(random) {
  const geometry = settings.mode === "realism"
    ? createRockGeometry()
    : new THREE.DodecahedronGeometry(0.8, 0);
  geometry.scale(1, 0.72, 0.86);
  const material = settings.mode === "realism"
    ? new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      metalness: 0,
      flatShading: false,
    })
    : new THREE.MeshLambertMaterial({ color: 0xdde8ff, flatShading: true });
  const rocks = new THREE.InstancedMesh(geometry, material, planetLoad.rockCount);
  const matrix = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const jitter = new THREE.Vector3();
  const rockColor = new THREE.Color();
  const rockPalette = [0x5c554b, 0x746956, 0x4e514c, 0x85755d, 0x665b50];
  const clusters = createDirectionClusters(random, 18);

  for (let index = 0; index < planetLoad.rockCount; index += 1) {
    sampleClusteredDirection(random, clusters, direction, jitter, 0.78);
    const size = 0.42 + Math.pow(random(), 1.82) * 3.2;
    const terrainRadius = getTerrainRadius(direction);
    if (settings.mode === "realism" && terrainRadius <= WATER_RADIUS + 0.2) {
      rocks.setMatrixAt(index, matrix.makeScale(0, 0, 0));
      continue;
    }
    position.copy(direction).multiplyScalar(terrainRadius + size * 0.4);
    orientation.setFromUnitVectors(WORLD_UP, direction);
    spin.setFromAxisAngle(direction, random() * Math.PI * 2);
    orientation.premultiply(spin);
    scale.set(
      size * (0.7 + random() * 0.65),
      size * (0.58 + random() * 0.5),
      size * (0.72 + random() * 0.62),
    );
    matrix.compose(position, orientation, scale);
    rocks.setMatrixAt(index, matrix);
    if (settings.mode === "realism") {
      rockColor.setHex(rockPalette[Math.floor(random() * rockPalette.length)]);
      rockColor.offsetHSL((random() - 0.5) * 0.025, (random() - 0.5) * 0.06, (random() - 0.5) * 0.08);
      rocks.setColorAt(index, rockColor);
    }
  }

  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  scene.add(rocks);
}

function createRockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.82, 1);
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index);
    const direction = vertex.clone().normalize();
    const deformation = 0.88
      + Math.sin(direction.x * 8.7 + direction.y * 4.1 - direction.z * 6.3) * 0.08
      + Math.sin(direction.x * 17.2 - direction.y * 9.4 + direction.z * 11.1) * 0.035;
    vertex.multiplyScalar(deformation);
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addPebbles(random) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    flatShading: false,
  });
  const pebbles = new THREE.InstancedMesh(geometry, material, planetLoad.pebbleCount);
  const matrix = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const pebbleColor = new THREE.Color();
  const pebblePalette = [0x514b43, 0x696054, 0x80725e, 0x454945];

  for (let index = 0; index < planetLoad.pebbleCount; index += 1) {
    randomSphereDirection(random, direction);
    const size = 0.12 + Math.pow(random(), 2.2) * 0.72;
    const terrainRadius = getTerrainRadius(direction);
    if (terrainRadius <= WATER_RADIUS + 0.12) {
      pebbles.setMatrixAt(index, matrix.makeScale(0, 0, 0));
      continue;
    }
    position.copy(direction).multiplyScalar(terrainRadius + size * 0.2);
    orientation.setFromUnitVectors(WORLD_UP, direction);
    spin.setFromAxisAngle(direction, random() * Math.PI * 2);
    orientation.premultiply(spin);
    scale.set(
      size * (0.75 + random() * 0.55),
      size * (0.42 + random() * 0.38),
      size * (0.72 + random() * 0.58),
    );
    matrix.compose(position, orientation, scale);
    pebbles.setMatrixAt(index, matrix);
    pebbleColor.setHex(pebblePalette[Math.floor(random() * pebblePalette.length)]);
    pebbles.setColorAt(index, pebbleColor);
  }

  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  scene.add(pebbles);
}

function addCracks(random) {
  const texture = createCrackTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0x2c211b,
    transparent: true,
    opacity: 0.16,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const cracks = new THREE.InstancedMesh(geometry, material, planetLoad.crackCount);
  const matrix = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const planeNormal = new THREE.Vector3(0, 0, 1);
  const jitter = new THREE.Vector3();
  const clusters = createDirectionClusters(random, 14);

  for (let index = 0; index < planetLoad.crackCount; index += 1) {
    sampleClusteredDirection(random, clusters, direction, jitter, 0.88);
    const length = 2.8 + random() * 7.5;
    const terrainRadius = getTerrainRadius(direction);
    if (terrainRadius <= WATER_RADIUS + 0.08) {
      cracks.setMatrixAt(index, matrix.makeScale(0, 0, 0));
      continue;
    }
    position.copy(direction).multiplyScalar(terrainRadius + 0.08);
    orientation.setFromUnitVectors(planeNormal, direction);
    spin.setFromAxisAngle(direction, random() * Math.PI * 2);
    orientation.premultiply(spin);
    scale.set(length, length * (0.3 + random() * 0.22), 1);
    matrix.compose(position, orientation, scale);
    cracks.setMatrixAt(index, matrix);
  }

  cracks.instanceMatrix.needsUpdate = true;
  cracks.renderOrder = 1;
  scene.add(cracks);
}

function addDust(random) {
  const geometry = createSurfacePointGeometry(planetLoad.dustCount, random, 0.8, 5.5);
  const material = new THREE.PointsMaterial({
    map: createSoftParticleTexture(),
    color: settings.mode === "realism" ? 0xd6ba8c : 0x8fdfff,
    size: settings.mode === "realism" ? 1.8 : 2.1,
    transparent: true,
    opacity: settings.mode === "realism" ? 0.16 : 0.22,
    alphaTest: 0.015,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(geometry, material);
  scene.add(dust);
  movingSurfaceLayers.push({ object: dust, speed: 0.0012 });
}

function addClouds(random) {
  const layers = settings.mode === "realism"
    ? [
      { ratio: 0.5, altitude: [24, 42], size: 82, opacity: 0.62, color: 0xf4eee4 },
      { ratio: 0.31, altitude: [40, 66], size: 110, opacity: 0.52, color: 0xdce7e8 },
      { ratio: 0.19, altitude: [62, 94], size: 138, opacity: 0.44, color: 0xc8d8dd },
    ]
    : [{ ratio: 1, altitude: [20, 72], size: 34, opacity: 0.3, color: 0xe3eef0 }];
  const clusters = createDirectionClusters(random, settings.mode === "realism" ? 15 : 12);

  layers.forEach((layer, layerIndex) => {
    const count = layerIndex === layers.length - 1
      ? planetLoad.cloudCount - layers.slice(0, -1).reduce(
        (sum, item) => sum + Math.round(planetLoad.cloudCount * item.ratio),
        0,
      )
      : Math.round(planetLoad.cloudCount * layer.ratio);
    const geometry = createCloudPointGeometry(
      count,
      random,
      clusters,
      layer.altitude[0],
      layer.altitude[1],
    );
    const material = createCloudMaterial(layer);
    const clouds = new THREE.Points(geometry, material);
    clouds.frustumCulled = false;
    clouds.renderOrder = 2;
    scene.add(clouds);
  });
}

function createCloudMaterial(layer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: getCloudTexture() },
      cloudColor: { value: new THREE.Color(layer.color) },
      cloudOpacity: { value: layer.opacity },
      cloudSize: { value: layer.size },
    },
    vertexShader: `
      uniform float cloudSize;
      attribute float cloudScale;
      attribute float cloudAlpha;
      varying float vCloudFade;
      varying float vCloudAlpha;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float distanceToCamera = length(viewPosition.xyz);
        float nearFade = smoothstep(38.0, 70.0, distanceToCamera);
        float farFade = 1.0 - smoothstep(760.0, 1120.0, distanceToCamera);
        vCloudFade = nearFade * farFade;
        vCloudAlpha = cloudAlpha;
        gl_PointSize = min(cloudSize * cloudScale * (250.0 / max(distanceToCamera, 1.0)), 190.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform vec3 cloudColor;
      uniform float cloudOpacity;
      varying float vCloudFade;
      varying float vCloudAlpha;

      void main() {
        vec4 cloudSample = texture2D(cloudMap, gl_PointCoord);
        float alpha = cloudSample.a * cloudOpacity * vCloudFade * vCloudAlpha;
        if (alpha < 0.018) discard;
        vec3 shadedColor = cloudColor * mix(0.72, 1.0, cloudSample.a);
        gl_FragColor = vec4(shadedColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

function getCloudTexture() {
  if (!sharedCloudTexture) {
    sharedCloudTexture = loadPbrTexture("./assets/cloud-alpha-cc0.png", true, 1, 1);
    sharedCloudTexture.wrapS = THREE.ClampToEdgeWrapping;
    sharedCloudTexture.wrapT = THREE.ClampToEdgeWrapping;
  }
  return sharedCloudTexture;
}

function createCloudPointGeometry(count, random, clusters, minimumAltitude, maximumAltitude) {
  const puffsPerBank = 1;
  const positions = new Float32Array(count * puffsPerBank * 3);
  const cloudScales = new Float32Array(count * puffsPerBank);
  const cloudAlphas = new Float32Array(count * puffsPerBank);
  const direction = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const center = new THREE.Vector3();
  const side = new THREE.Vector3();
  const across = new THREE.Vector3();
  const puffPosition = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    sampleClusteredDirection(random, clusters, direction, jitter, 0.82);
    const altitude = minimumAltitude
      + Math.pow(random(), 0.82) * (maximumAltitude - minimumAltitude);
    const radius = getSurfaceRadius(direction) + altitude;
    center.copy(direction).multiplyScalar(radius);
    side.crossVectors(direction, WORLD_UP);
    if (side.lengthSq() < 0.001) side.crossVectors(direction, FEATURE_AXIS_A);
    side.normalize();
    across.crossVectors(direction, side).normalize();
    const bankRadius = 13 + altitude * 0.16;
    cloudVolumes.push({ position: center.clone(), radius: bankRadius * 1.15 });
    for (let puff = 0; puff < puffsPerBank; puff += 1) {
      const puffIndex = index * puffsPerBank + puff;
      const puffAngle = random() * Math.PI * 2;
      const puffRadius = puff === 0 ? 0 : Math.sqrt(random()) * bankRadius;
      puffPosition.copy(center)
        .addScaledVector(side, Math.cos(puffAngle) * puffRadius)
        .addScaledVector(across, Math.sin(puffAngle) * puffRadius * 0.48)
        .addScaledVector(direction, (random() - 0.5) * 4.5);
      positions[puffIndex * 3] = puffPosition.x;
      positions[puffIndex * 3 + 1] = puffPosition.y;
      positions[puffIndex * 3 + 2] = puffPosition.z;
      cloudScales[puffIndex] = 0.6 + random() * 0.62;
      cloudAlphas[puffIndex] = 0.58 + random() * 0.42;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cloudScale", new THREE.BufferAttribute(cloudScales, 1));
  geometry.setAttribute("cloudAlpha", new THREE.BufferAttribute(cloudAlphas, 1));
  return geometry;
}

function createWaterSpray() {
  const count = 600;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: createWaterSprayTexture(),
    color: 0xd8f7ff,
    size: 0.22,
    transparent: true,
    opacity: 0.88,
    alphaTest: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return {
    points,
    positions,
    velocities,
    life,
    cursor: 0,
    emissionCarry: 0,
    random: createSeededRandom(92821),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    particlePosition: new THREE.Vector3(),
    particleVelocity: new THREE.Vector3(),
  };
}

function createWaterSprayTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.96)");
  gradient.addColorStop(0.46, "rgba(220,248,255,0.48)");
  gradient.addColorStop(0.74, "rgba(190,235,250,0.12)");
  gradient.addColorStop(1, "rgba(180,230,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return registerCanvasTexture(textureCanvas, true);
}

function updateWaterSpray(spray, delta) {
  const { positions, velocities, life } = spray;
  let hasLiveParticles = false;
  for (let index = 0; index < life.length; index += 1) {
    if (life[index] <= 0) continue;
    const offset = index * 3;
    spray.particlePosition.fromArray(positions, offset);
    spray.particleVelocity.fromArray(velocities, offset);
    spray.up.copy(spray.particlePosition).normalize();
    spray.particleVelocity.addScaledVector(spray.up, -5.8 * delta);
    spray.particleVelocity.multiplyScalar(Math.exp(-1.35 * delta));
    spray.particlePosition.addScaledVector(spray.particleVelocity, delta);
    spray.particlePosition.toArray(positions, offset);
    spray.particleVelocity.toArray(velocities, offset);
    life[index] -= delta;
    if (life[index] > 0) {
      hasLiveParticles = true;
    } else {
      positions[offset] = 0;
      positions[offset + 1] = 0;
      positions[offset + 2] = 0;
    }
  }

  spray.up.copy(flight.position).normalize();
  const terrainRadius = getTerrainRadius(spray.up);
  const waterAltitude = flight.position.length() - WATER_RADIUS - PLAYER_CLEARANCE;
  const overWater = terrainRadius < WATER_RADIUS - 0.25;
  const proximity = 1 - THREE.MathUtils.clamp(waterAltitude / 3.4, 0, 1);
  const emitting = overWater && waterAltitude >= 0 && proximity > 0 && flight.speed > 18;
  canvas.dataset.waterSpray = emitting ? "active" : "idle";

  if (emitting) {
    const emissionRate = (255 + flight.speed * 3.4) * proximity;
    spray.emissionCarry += emissionRate * delta;
    const emitCount = Math.min(48, Math.floor(spray.emissionCarry));
    spray.emissionCarry -= emitCount;
    spray.right.crossVectors(spray.up, flight.forward).normalize();
    for (let emitted = 0; emitted < emitCount; emitted += 1) {
      const index = spray.cursor;
      spray.cursor = (spray.cursor + 1) % life.length;
      const offset = index * 3;
      const sideSign = emitted % 2 === 0 ? -1 : 1;
      const side = sideSign * (0.2 + spray.random() * 1.15)
        + (spray.random() - 0.5) * 0.48;
      const trail = 0.22 + spray.random() * 2.25;
      spray.particlePosition.copy(flight.position)
        .addScaledVector(flight.forward, -trail)
        .addScaledVector(spray.right, side)
        .addScaledVector(spray.up, -0.45 + spray.random() * 0.5);
      spray.particleVelocity.copy(flight.forward)
        .multiplyScalar(flight.speed * (0.015 + spray.random() * 0.035))
        .addScaledVector(spray.right, sideSign * (4.2 + spray.random() * 8.5))
        .addScaledVector(spray.up, 1.2 + spray.random() * 5.2);
      spray.particlePosition.toArray(positions, offset);
      spray.particleVelocity.toArray(velocities, offset);
      life[index] = 0.2 + spray.random() * 0.42;
      hasLiveParticles = true;
    }
  } else {
    spray.emissionCarry = 0;
  }

  spray.points.visible = hasLiveParticles;
  spray.points.geometry.attributes.position.needsUpdate = true;
}

function resetWaterSpray(spray) {
  spray.positions.fill(0);
  spray.velocities.fill(0);
  spray.life.fill(0);
  spray.cursor = 0;
  spray.emissionCarry = 0;
  spray.points.visible = false;
  spray.points.geometry.attributes.position.needsUpdate = true;
  canvas.dataset.waterSpray = "idle";
}

function createSurfacePointGeometry(count, random, minimumAltitude, maximumAltitude) {
  const positions = new Float32Array(count * 3);
  const direction = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    let terrainRadius;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      randomSphereDirection(random, direction);
      terrainRadius = getTerrainRadius(direction);
      if (settings.mode !== "realism" || terrainRadius > WATER_RADIUS + 0.2) break;
    }
    const radius = terrainRadius
      + minimumAltitude
      + random() * (maximumAltitude - minimumAltitude);
    positions[index * 3] = direction.x * radius;
    positions[index * 3 + 1] = direction.y * radius;
    positions[index * 3 + 2] = direction.z * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function createDirectionClusters(random, count) {
  const clusters = [];
  for (let index = 0; index < count; index += 1) {
    clusters.push(randomSphereDirection(random, new THREE.Vector3()).clone());
  }
  return clusters;
}

function sampleClusteredDirection(random, clusters, target, jitter, clusterChance) {
  if (random() > clusterChance) return randomSphereDirection(random, target);
  const center = clusters[Math.floor(random() * clusters.length)];
  const spread = 0.035 + Math.pow(random(), 1.5) * 0.18;
  jitter.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(spread);
  return target.copy(center).add(jitter).normalize();
}

function randomSphereDirection(random, target) {
  const y = random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = random() * Math.PI * 2;
  return target.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function createCrackTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineCap = "round";
  context.lineJoin = "round";
  const branches = [
    [[6, 69], [48, 58], [91, 66], [132, 42], [186, 50], [250, 25]],
    [[91, 66], [74, 94], [51, 112]],
    [[132, 42], [145, 19], [173, 6]],
    [[186, 50], [211, 77], [241, 89]],
  ];
  branches.forEach((branch, index) => {
    context.lineWidth = index === 0 ? 4 : 2.3;
    context.beginPath();
    branch.forEach(([x, y], pointIndex) => {
      if (pointIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  });
  return registerCanvasTexture(textureCanvas, true);
}

function createSoftParticleTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.75)");
  gradient.addColorStop(0.36, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return registerCanvasTexture(textureCanvas, true);
}

function createCloudTexture(seed) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  const pixels = context.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const u = x / 255;
      const v = y / 255;
      const horizontal = (u - 0.5) / 0.48;
      const vertical = (v - 0.52) / 0.25;
      const silhouette = 1 - horizontal * horizontal - vertical * vertical;
      const broad = tiledValueNoise(u, v, 4, 4, seed);
      const medium = tiledValueNoise(u, v, 9, 8, seed + 31);
      const fine = tiledValueNoise(u, v, 21, 17, seed + 79);
      const wisps = tiledValueNoise(u + v * 0.19, v, 37, 29, seed + 131);
      const density = silhouette * 0.68
        + broad * 0.42
        + medium * 0.25
        + fine * 0.12
        + wisps * 0.055
        - 0.5;
      const alpha = THREE.MathUtils.smoothstep(density, 0.16, 0.5);
      const light = THREE.MathUtils.clamp(
        0.72 + broad * 0.2 + medium * 0.13 - Math.max(0, vertical) * 0.08,
        0,
        1,
      );
      const offset = (y * 256 + x) * 4;
      pixels.data[offset] = 224 * light;
      pixels.data[offset + 1] = 234 * light;
      pixels.data[offset + 2] = 237 * light;
      pixels.data[offset + 3] = alpha * 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return registerCanvasTexture(textureCanvas, true);
}

function registerCanvasTexture(canvasElement, isColor) {
  const texture = new THREE.CanvasTexture(canvasElement);
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  return texture;
}

function createSky() {
  const geometry = new THREE.SphereGeometry(1050, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      cameraPos: { value: new THREE.Vector3() },
      sunDirection: { value: SUN_DIRECTION.clone() },
      planetRadius: { value: PLANET_RADIUS },
      dayZenith: { value: new THREE.Color(0x65b7ff) },
      dayHorizon: { value: new THREE.Color(0xcbe8ff) },
      duskZenith: { value: new THREE.Color(0x382d50) },
      duskMid: { value: new THREE.Color(0xb96670) },
      duskHorizon: { value: new THREE.Color(0xf0a06f) },
      nightZenith: { value: new THREE.Color(0x132e50) },
      nightHorizon: { value: new THREE.Color(0x3d6684) },
      sunColor: { value: new THREE.Color(0xffbd78) },
      cloudMist: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 cameraPos;
      uniform vec3 sunDirection;
      uniform float planetRadius;
      uniform vec3 dayZenith;
      uniform vec3 dayHorizon;
      uniform vec3 duskZenith;
      uniform vec3 duskMid;
      uniform vec3 duskHorizon;
      uniform vec3 nightZenith;
      uniform vec3 nightHorizon;
      uniform vec3 sunColor;
      uniform float cloudMist;
      varying vec3 vWorldPosition;
      void main() {
        vec3 ray = normalize(vWorldPosition - cameraPos);
        vec3 localUp = normalize(cameraPos);
        vec3 sun = normalize(sunDirection);
        float viewHeight = dot(ray, localUp);
        float sunHeight = dot(localUp, sun);
        float horizonDip = acos(clamp(planetRadius / length(cameraPos), 0.0, 1.0));
        float visibleHorizonHeight = -sin(horizonDip);
        float skyHeight = viewHeight - visibleHorizonHeight;
        float horizon = exp(-abs(skyHeight) * 7.2);
        float zenith = pow(smoothstep(-0.14, 0.68, skyHeight), 0.9);
        vec3 day = mix(dayHorizon, dayZenith, zenith);
        float duskMiddleBlend = smoothstep(-0.08, 0.2, skyHeight);
        float duskZenithBlend = smoothstep(0.12, 0.74, skyHeight);
        vec3 dusk = mix(duskHorizon, duskMid, duskMiddleBlend);
        dusk = mix(dusk, duskZenith, duskZenithBlend);
        dusk = mix(dusk * 0.5, dusk, smoothstep(-0.3, -0.01, skyHeight));
        vec3 night = mix(nightHorizon, nightZenith, pow(smoothstep(-0.12, 0.62, skyHeight), 0.86));
        float dayMix = smoothstep(-0.16, 0.18, sunHeight);
        float duskMix = 1.0 - smoothstep(0.055, 0.5, abs(sunHeight));
        vec3 color = mix(night, day, dayMix);
        color = mix(color, dusk, duskMix * 0.94);
        vec3 sunOnHorizon = normalize(sun - localUp * sunHeight + vec3(0.0001));
        float visualSunElevation = asin(clamp(sunHeight, -1.0, 1.0)) - horizonDip;
        vec3 visualSun = normalize(
          sunOnHorizon * cos(visualSunElevation) + localUp * sin(visualSunElevation)
        );
        vec3 rayOnHorizon = normalize(ray - localUp * viewHeight + vec3(0.0001));
        float sunsetDirection = pow(max(dot(rayOnHorizon, sunOnHorizon), 0.0), 1.18);
        color = mix(color, sunColor, duskMix * horizon * sunsetDirection * 0.7);
        float sunAmount = max(dot(ray, visualSun), 0.0);
        float sunVisibility = smoothstep(-0.055, 0.018, sunHeight);
        color += sunColor * pow(sunAmount, 34.0) * 0.13 * sunVisibility;
        color += sunColor * pow(sunAmount, 920.0) * 1.08 * sunVisibility;
        color = mix(color, vec3(0.91, 0.94, 0.95), cloudMist * 0.82);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function createAtmosphere() {
  const geometry = new THREE.SphereGeometry(
    PLANET_RADIUS + 2,
    planetLoad.atmosphereSegments,
    Math.max(16, Math.round(planetLoad.atmosphereSegments * 0.66)),
  );
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      cameraPos: { value: new THREE.Vector3() },
      sunDirection: { value: SUN_DIRECTION.clone() },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 cameraPos;
      uniform vec3 sunDirection;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 viewDirection = normalize(cameraPos - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 2.4);
        float sunlight = max(dot(normalize(vWorldNormal), normalize(sunDirection)), 0.0);
        vec3 color = mix(vec3(0.08, 0.18, 0.28), vec3(0.36, 0.72, 0.86), sunlight);
        gl_FragColor = vec4(color, rim * 0.13 + sunlight * 0.004);
      }
    `,
  });
  material.forceSinglePass = true;
  return new THREE.Mesh(geometry, material);
}

function addLighting() {
  if (settings.mode === "realism") {
    hemisphereLight = new THREE.HemisphereLight(0xbad9e7, 0x425369, 0.78);
    scene.add(hemisphereLight);
    twilightFillLight = new THREE.AmbientLight(0xff7047, 0.08);
    nightFillLight = new THREE.AmbientLight(0x82acd2, 0.48);
    scene.add(twilightFillLight, nightFillLight);
  } else {
    scene.add(new THREE.AmbientLight(0x5c6e89, 0.55));
  }
  const sun = new THREE.DirectionalLight(0xffe0b0, settings.mode === "realism" ? 3.8 : 1.7);
  sunKeyLight = sun;
  sun.position.copy(SUN_DIRECTION).multiplyScalar(620);
  sun.target.position.set(0, 0, 0);
  if (realismShadowsEnabled) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(settings.preset.shadowSize, settings.preset.shadowSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 72;
    sun.shadow.camera.bottom = -72;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.22;
    sun.shadow.radius = 2.2;
    flightShadowLight = sun;
  }
  scene.add(sun, sun.target);
  if (settings.mode === "realism") {
    const moon = new THREE.DirectionalLight(0x91bde4, 1.35);
    moon.position.copy(SUN_DIRECTION).multiplyScalar(-540);
    moon.target.position.set(0, 0, 0);
    scene.add(moon, moon.target);
  }
}

function updateFlightShadow() {
  if (!flightShadowLight || settings.view !== "flight") return;
  flightShadowLight.position.copy(flight.position).addScaledVector(SUN_DIRECTION, 180);
  flightShadowLight.target.position.copy(flight.position);
  flightShadowLight.target.updateMatrixWorld();
}

function updateOrbit(delta) {
  orbit.idle += delta;
  if (!orbit.dragging && orbit.idle > 4) orbit.desiredYaw += delta * 0.014;
  const smoothing = 1 - Math.exp(-delta * 7);
  orbit.yaw = THREE.MathUtils.lerp(orbit.yaw, orbit.desiredYaw, smoothing);
  orbit.pitch = THREE.MathUtils.lerp(orbit.pitch, orbit.desiredPitch, smoothing);
  orbit.distance = THREE.MathUtils.lerp(orbit.distance, orbit.desiredDistance, smoothing);
  const planarDistance = Math.cos(orbit.pitch) * orbit.distance;
  camera.up.copy(WORLD_UP);
  camera.position.set(
    Math.sin(orbit.yaw) * planarDistance,
    Math.sin(orbit.pitch) * orbit.distance,
    Math.cos(orbit.yaw) * planarDistance,
  );
  camera.lookAt(0, 0, 0);
}

function updateFlight(delta) {
  flightPreviousForward.copy(flight.forward);
  flightStickTarget.set(
    -applyDeadzone(flight.stickOffset.x / FLIGHT_STICK_LIMIT) * FLIGHT_STICK_SCALE,
    -applyDeadzone(flight.stickOffset.y / FLIGHT_STICK_LIMIT) * FLIGHT_STICK_SCALE,
  );
  flightKeyTarget.set(
    Number(flight.keys.has("KeyA"))
      - Number(flight.keys.has("KeyD"))
      + (Number(flight.keys.has("ArrowLeft")) - Number(flight.keys.has("ArrowRight")))
        * FLIGHT_ARROW_SCALE_X,
    Number(flight.keys.has("KeyW"))
      - Number(flight.keys.has("KeyS"))
      + Number(flight.keys.has("ArrowUp"))
      - Number(flight.keys.has("ArrowDown")),
  ).clampScalar(-1, 1);

  const keyboardActive = flightKeyTarget.lengthSq() > 0.0001;
  const stickBlend = 1 - Math.exp(
    -(flight.stickId !== null ? FLIGHT_STICK_RESPONSE : FLIGHT_STICK_RETURN) * delta,
  );
  const keyBlend = 1 - Math.exp(
    -((keyboardActive ? FLIGHT_STICK_RESPONSE : FLIGHT_STICK_RETURN) * 0.8) * delta,
  );
  flight.stickSmooth.lerp(flightStickTarget, stickBlend);
  flight.keySmooth.lerp(flightKeyTarget, keyBlend);
  if (flight.stickId === null) {
    flight.stickSmooth.y = THREE.MathUtils.damp(
      flight.stickSmooth.y,
      0,
      FLIGHT_VERTICAL_RELEASE,
      delta,
    );
  }
  if (!keyboardActive) {
    flight.keySmooth.x = THREE.MathUtils.damp(
      flight.keySmooth.x,
      0,
      FLIGHT_STICK_RETURN,
      delta,
    );
    flight.keySmooth.y = THREE.MathUtils.damp(
      flight.keySmooth.y,
      0,
      FLIGHT_VERTICAL_RELEASE,
      delta,
    );
  }

  const dragYaw = -flight.directTurnX * 0.0021;
  const dragLift = flight.directTurnY * 0.003;
  const turnInput = THREE.MathUtils.clamp(
    flight.stickSmooth.x + flight.keySmooth.x,
    -1,
    1,
  );
  const climbInput = THREE.MathUtils.clamp(
    flight.stickSmooth.y + flight.keySmooth.y + dragLift,
    -1,
    1,
  );
  flight.directTurnX = 0;
  flight.directTurnY = 0;

  flightUp.copy(flight.position).normalize();
  flight.forward.applyAxisAngle(
    flightUp,
    dragYaw + turnInput * 0.0252 * delta * 60,
  ).normalize();
  flight.forward.addScaledVector(flightUp, -flight.forward.dot(flightUp)).normalize();

  const accelerating = flight.keys.has("Space") || flight.accelPointers.size > 0;
  if (accelerating) {
    flight.holdAccel += FLIGHT_PHYSICS.HOLD_ACCEL_RATE * delta;
  } else {
    flight.holdAccel = Math.max(
      0,
      flight.holdAccel - FLIGHT_PHYSICS.LOCK_ACCEL_DECAY * delta,
    );
  }
  const speedTarget = Math.max(
    FLIGHT_PHYSICS.MIN_FORWARD_SPEED,
    flight.speedSelection
      + Math.max(0, climbInput) * FLIGHT_PHYSICS.STICK_BOOST
      + flight.holdAccel,
  );
  const speedResponse = speedTarget > flight.speed
    ? FLIGHT_PHYSICS.LOCK_SPEED_ACCEL
    : FLIGHT_PHYSICS.LOCK_SPEED_SETTLE;
  flight.speed = THREE.MathUtils.damp(
    flight.speed,
    speedTarget,
    speedResponse,
    delta,
  );

  const currentRadius = flight.position.length();
  const currentSurface = getSurfaceRadius(flightUp) + PLAYER_CLEARANCE;
  const altitude = currentRadius - currentSurface;
  const descendInput = Math.max(0, -climbInput);
  if (!flight.onGround && climbInput > 0) {
    flight.radialSpeed += climbInput * FLIGHT_PHYSICS.STICK_CLIMB * delta;
  } else if (!flight.onGround && climbInput < 0) {
    const descendTarget = -descendInput * Math.max(
      FLIGHT_PHYSICS.DESCEND_TARGET_MIN,
      flight.speed * FLIGHT_PHYSICS.DESCEND_TARGET_RATIO,
    );
    flight.radialSpeed += climbInput * FLIGHT_PHYSICS.STICK_DESCEND * delta;
    flight.radialSpeed = THREE.MathUtils.lerp(
      flight.radialSpeed,
      descendTarget,
      1 - Math.exp(-FLIGHT_PHYSICS.DESCEND_RESPONSE * delta),
    );
  } else if (!flight.onGround) {
    flightRight.crossVectors(flightUp, flight.forward).normalize();
    const lookAheadSeconds = FLIGHT_PHYSICS.TERRAIN_LOOK_AHEAD_SECONDS;
    const lookAheadAngle = flight.speed * lookAheadSeconds / currentRadius;
    flightTerrainAheadUp.copy(flightUp).applyAxisAngle(flightRight, lookAheadAngle).normalize();
    const aheadSurface = getSurfaceRadius(flightTerrainAheadUp) + PLAYER_CLEARANCE;
    const terrainFollowSpeed = THREE.MathUtils.clamp(
      (aheadSurface - currentSurface) / lookAheadSeconds,
      -FLIGHT_PHYSICS.TERRAIN_FOLLOW_DESCENT_MAX,
      FLIGHT_PHYSICS.TERRAIN_FOLLOW_ASCENT_MAX,
    );
    const altitudeError = Math.abs(altitude - flight.cruiseAltitude)
      <= FLIGHT_PHYSICS.NEUTRAL_ALTITUDE_DEADZONE
      ? 0
      : altitude - flight.cruiseAltitude;
    const altitudeReturnSpeed = THREE.MathUtils.clamp(
      -altitudeError * FLIGHT_PHYSICS.TERRAIN_FOLLOW_ALTITUDE_RETURN,
      -FLIGHT_PHYSICS.TERRAIN_FOLLOW_ALTITUDE_MAX,
      FLIGHT_PHYSICS.TERRAIN_FOLLOW_ALTITUDE_MAX,
    );
    const neutralTarget = THREE.MathUtils.clamp(
      terrainFollowSpeed + altitudeReturnSpeed,
      -FLIGHT_PHYSICS.TERRAIN_FOLLOW_DESCENT_MAX,
      FLIGHT_PHYSICS.TERRAIN_FOLLOW_ASCENT_MAX,
    );
    const neutralResponse = flight.radialSpeed > neutralTarget
      ? FLIGHT_PHYSICS.NEUTRAL_ASCENT_BRAKE
      : FLIGHT_PHYSICS.NEUTRAL_RETURN;
    flight.radialSpeed = THREE.MathUtils.lerp(
      flight.radialSpeed,
      neutralTarget,
      1 - Math.exp(-neutralResponse * delta),
    );
  } else {
    flight.radialSpeed = 0;
  }
  flight.radialSpeed *= 1 - FLIGHT_PHYSICS.GLIDE_DRAG * delta;
  const maxAscentSpeed = flight.speed * Math.tan(FLIGHT_PHYSICS.MAX_ASCENT_ANGLE);
  flight.radialSpeed = Math.min(flight.radialSpeed, maxAscentSpeed);

  flightRight.crossVectors(flightUp, flight.forward).normalize();
  const moveAngle = (flight.speed * delta) / currentRadius;
  flightNextUp.copy(flightUp).applyAxisAngle(flightRight, moveAngle).normalize();
  flight.forward.applyAxisAngle(flightRight, moveAngle).normalize();
  flight.forward.addScaledVector(flightNextUp, -flight.forward.dot(flightNextUp)).normalize();
  const nextSurface = getSurfaceRadius(flightNextUp) + PLAYER_CLEARANCE;
  let nextRadius = currentRadius + flight.radialSpeed * delta;
  let surfaceGap = nextRadius - nextSurface;
  if (!flight.onGround && surfaceGap < FLIGHT_PHYSICS.SOFT_GROUND_RANGE) {
    const repel = THREE.MathUtils.clamp(
      1 - surfaceGap / FLIGHT_PHYSICS.SOFT_GROUND_RANGE,
      0,
      1,
    );
    const repelSquared = repel * repel;
    flight.radialSpeed += repelSquared * FLIGHT_PHYSICS.SOFT_GROUND_FORCE * delta;
    if (flight.radialSpeed < 0) {
      flight.radialSpeed = THREE.MathUtils.lerp(
        flight.radialSpeed,
        0,
        repelSquared * FLIGHT_PHYSICS.SOFT_GROUND_DAMP * delta,
      );
    }
    nextRadius = Math.max(
      nextRadius,
      nextSurface + FLIGHT_PHYSICS.SOFT_GROUND_MIN_ALT,
    );
    surfaceGap = nextRadius - nextSurface;
  }

  const canLand = !accelerating
    && Math.abs(climbInput) < 0.08
    && flight.speed < FLIGHT_PHYSICS.GROUND_SPEED + 0.45
    && surfaceGap <= FLIGHT_PHYSICS.SOFT_GROUND_LAND_ALT;
  if (canLand) {
    nextRadius = nextSurface;
    flight.radialSpeed = 0;
    flight.onGround = true;
  } else {
    flight.onGround = false;
  }
  flight.position.copy(flightNextUp).multiplyScalar(nextRadius);

  const signedTurn = Math.atan2(
    flightCross.crossVectors(flightPreviousForward, flight.forward).dot(flightNextUp),
    THREE.MathUtils.clamp(flightPreviousForward.dot(flight.forward), -1, 1),
  );
  const bankTarget = THREE.MathUtils.clamp(
    -(signedTurn / Math.max(delta, 0.001)) * FLIGHT_PHYSICS.BANK_FROM_TURN,
    -FLIGHT_PHYSICS.MAX_BANK,
    FLIGHT_PHYSICS.MAX_BANK,
  );
  flight.roll = THREE.MathUtils.damp(
    flight.roll,
    bankTarget,
    FLIGHT_PHYSICS.ROLL_RESPONSE,
    delta,
  );

  const bodyPitchTarget = THREE.MathUtils.clamp(
    Math.atan2(flight.radialSpeed, Math.max(flight.speed, 1))
      - descendInput * FLIGHT_PHYSICS.DESCEND_INPUT_PITCH
      + FLIGHT_PHYSICS.CRUISE_BODY_PITCH,
    -Math.PI * 0.5,
    FLIGHT_PHYSICS.MAX_BODY_PITCH,
  );
  const bodyPitchResponse = bodyPitchTarget < flight.bodyPitch
    ? FLIGHT_PHYSICS.BODY_DESCEND_PITCH_RESPONSE
    : FLIGHT_PHYSICS.BODY_PITCH_RESPONSE;
  flight.bodyPitch = THREE.MathUtils.damp(
    flight.bodyPitch,
    bodyPitchTarget,
    bodyPitchResponse,
    delta,
  );

  flightRight.crossVectors(flightNextUp, flight.forward).normalize();
  updateFlightPlayer(flightPlayer, {
    position: flight.position,
    forward: flight.forward,
    up: flightNextUp,
    bodyPitch: flight.bodyPitch,
    roll: flight.roll,
    turnInput,
    climbInput,
    altitude: Math.max(0, nextRadius - nextSurface),
    surfaceRadius: nextSurface - PLAYER_CLEARANCE,
    delta,
  });
  updateFlightCamera(delta);
  updateFlightEnvironment(flightNextUp, delta);

  flight.readoutElapsed += delta;
  if (flight.readoutElapsed >= 0.12) {
    const nextAltitude = Math.max(0, nextRadius - nextSurface);
    flightReadout.innerHTML = `SPEED ${Math.round(flight.speedSelection)}<br>ALT ${nextAltitude.toFixed(1)}<br>RADIUS ${PLANET_RADIUS}`;
    flight.readoutElapsed = 0;
  }
}

function updateFlightCamera(delta, snap = false) {
  flightUp.copy(flight.position).normalize();
  flightRight.crossVectors(flightUp, flight.forward).normalize();
  flightVisualForward.copy(flight.forward)
    .applyAxisAngle(flightRight, -flight.bodyPitch)
    .normalize();
  const targetLift = THREE.MathUtils.clamp(flightVisualForward.dot(flightUp), -0.5, 0.5);
  const pitchResponse = targetLift < flight.cameraLift
    ? FLIGHT_PHYSICS.CAMERA_DESCEND_PITCH_SMOOTH
    : FLIGHT_PHYSICS.CAMERA_PITCH_SMOOTH;
  flight.cameraLift = THREE.MathUtils.lerp(
    flight.cameraLift,
    targetLift,
    1 - Math.exp(-pitchResponse * delta),
  );

  flightCameraForward.copy(flight.forward)
    .addScaledVector(flightUp, flight.cameraLift)
    .normalize();
  const distance = FLIGHT_PHYSICS.CAMERA_DISTANCE
    + flight.speed * FLIGHT_PHYSICS.CAMERA_DISTANCE_SPEED;
  flightCameraTarget.copy(flight.position)
    .addScaledVector(flightUp, FLIGHT_PHYSICS.CAMERA_HEIGHT);
  flightCameraDesired.copy(flightCameraTarget)
    .addScaledVector(flightCameraForward, -distance)
    .addScaledVector(flightUp, 1.6);

  const smooth = snap
    ? 1
    : 1 - Math.pow(1 - FLIGHT_PHYSICS.CAMERA_SMOOTH, delta * 60);
  camera.position.lerp(flightCameraDesired, smooth);
  camera.up.lerp(flightUp, smooth).normalize();
  const speedFactor = THREE.MathUtils.clamp(
    (flight.speed - FLIGHT_PHYSICS.MIN_FORWARD_SPEED) / 5.75,
    0,
    1,
  );
  const targetFov = FLIGHT_PHYSICS.BASE_FOV + speedFactor * FLIGHT_PHYSICS.SPEED_FOV;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, smooth);
  camera.updateProjectionMatrix();
  camera.lookAt(flightCameraTarget);
}

function updateFlightEnvironment(up, delta = 1 / 60) {
  if (!scene.fog) return;
  const sunHeight = up.dot(SUN_DIRECTION);
  const dayMix = THREE.MathUtils.smoothstep(sunHeight, -0.16, 0.18);
  const duskMix = 1 - THREE.MathUtils.smoothstep(Math.abs(sunHeight), 0.055, 0.5);
  flightFogColor.copy(flightFogNight).lerp(flightFogDay, dayMix);
  flightFogColor.lerp(flightFogDusk, duskMix * 0.9);
  let cloudTarget = 0;
  for (const volume of cloudVolumes) {
    const proximity = 1 - flight.position.distanceTo(volume.position) / volume.radius;
    if (proximity > cloudTarget) cloudTarget = proximity;
  }
  cloudTarget = THREE.MathUtils.smoothstep(cloudTarget, 0, 1);
  cloudPassageMix = THREE.MathUtils.damp(
    cloudPassageMix,
    cloudTarget,
    cloudTarget > cloudPassageMix ? 4.2 : 1.55,
    delta,
  );
  flightFogColor.lerp(cloudMistColor, cloudPassageMix * 0.94);
  scene.fog.color.lerp(flightFogColor, 1 - Math.exp(-5 * delta));
  scene.fog.density = THREE.MathUtils.damp(
    scene.fog.density,
    0.0036 + cloudPassageMix * 0.028,
    3.6,
    delta,
  );
  canvas.dataset.cloudMist = cloudPassageMix > 0.08 ? "active" : "clear";
  if (sky) sky.material.uniforms.cloudMist.value = cloudPassageMix;
  if (twilightFillLight) {
    twilightFillLight.intensity = THREE.MathUtils.lerp(
      twilightFillLight.intensity,
      0.035 + dayMix * 0.055 + duskMix * 0.72,
      0.08,
    );
  }
  if (nightFillLight) {
    nightFillLight.intensity = THREE.MathUtils.lerp(
      nightFillLight.intensity,
      0.1 + (1 - dayMix) * 0.58 + duskMix * 0.08,
      0.08,
    );
  }
  if (sunKeyLight) {
    flightSunColor.copy(lightDaySun).lerp(lightDuskSun, duskMix * 0.94);
    sunKeyLight.color.lerp(flightSunColor, 0.08);
    sunKeyLight.intensity = THREE.MathUtils.lerp(
      sunKeyLight.intensity,
      3.7 + duskMix * 1.9,
      0.08,
    );
  }
  if (hemisphereLight) {
    flightHemisphereSkyColor.copy(lightNightSky).lerp(lightDaySky, dayMix);
    flightHemisphereSkyColor.lerp(lightDuskSky, duskMix * 0.92);
    flightHemisphereGroundColor.copy(lightNightGround).lerp(lightDayGround, dayMix);
    flightHemisphereGroundColor.lerp(lightDuskGround, duskMix * 0.9);
    hemisphereLight.color.lerp(flightHemisphereSkyColor, 0.08);
    hemisphereLight.groundColor.lerp(flightHemisphereGroundColor, 0.08);
    hemisphereLight.intensity = THREE.MathUtils.lerp(
      hemisphereLight.intensity,
      0.72 + duskMix * 0.34 + (1 - dayMix) * 0.1,
      0.08,
    );
  }
}

function resetFlight() {
  const params = new URLSearchParams(window.location.search);
  const startPreset = params.get("start") || "dusk";
  const sprayPreview = startPreset === "water" && params.get("spray") === "1";
  const cloudPreview = startPreset === "cloud" ? cloudVolumes[0] : null;
  const cloudAltitude = cloudPreview
    ? cloudPreview.position.length() - getSurfaceRadius(cloudPreview.position.clone().normalize())
    : FLIGHT_PHYSICS.NEUTRAL_ALTITUDE;
  flight.cruiseAltitude = sprayPreview ? 1.35 : cloudAltitude;
  const isSunsetStart = startPreset === "sunset";
  const targetDirection = (isSunsetStart ? specialLandmarks.directions.dusk : null)
    || specialLandmarks.directions[startPreset]
    || specialLandmarks.directions.dusk;
  const isDuskStart = startPreset === "dusk";
  const approach = isDuskStart
    ? new THREE.Vector3().crossVectors(SUN_DIRECTION, targetDirection).normalize()
    : SUN_DIRECTION.clone().addScaledVector(
      targetDirection,
      -SUN_DIRECTION.dot(targetDirection),
    );
  if (startPreset === "valley") approach.copy(VALLEY_TANGENT);
  if (startPreset === "cave") approach.copy(CAVE_FORWARD);
  if (approach.lengthSq() < 0.0001) approach.crossVectors(WORLD_UP, targetDirection);
  approach.normalize();
  const featureApproachAngles = {
    mountain: 0.48,
    crater: 0.5,
    water: 0.4,
    valley: 0.4,
    cave: 0.32,
  };
  const approachAngle = featureApproachAngles[startPreset] || (isDuskStart ? 0.42 : 0.18);
  let startDirection = isSunsetStart
    ? targetDirection.clone()
    : targetDirection.clone()
      .multiplyScalar(Math.cos(approachAngle))
      .addScaledVector(approach, -Math.sin(approachAngle))
      .normalize();
  if (sprayPreview) startDirection = WATER_DIRECTION.clone();
  const startRadius = getSurfaceRadius(startDirection) + PLAYER_CLEARANCE + flight.cruiseAltitude;
  flight.position.copy(startDirection).multiplyScalar(startRadius);
  if (sprayPreview) {
    flight.forward.copy(FEATURE_AXIS_A)
      .addScaledVector(startDirection, -FEATURE_AXIS_A.dot(startDirection))
      .normalize();
  } else if (isSunsetStart) {
    flight.forward.copy(SUN_DIRECTION)
      .addScaledVector(startDirection, -SUN_DIRECTION.dot(startDirection))
      .normalize();
  } else {
    flight.forward.copy(targetDirection)
      .addScaledVector(startDirection, -targetDirection.dot(startDirection))
      .normalize();
  }
  flight.speedSelection = Number(flightSpeedSlider.value) || 40;
  flight.speed = flight.speedSelection;
  flight.holdAccel = 0;
  flight.radialSpeed = 0;
  flight.bodyPitch = FLIGHT_PHYSICS.CRUISE_BODY_PITCH;
  flight.roll = 0;
  flight.cameraLift = 0;
  flight.onGround = false;
  flight.stickOffset.set(0, 0);
  flight.stickSmooth.set(0, 0);
  flight.keySmooth.set(0, 0);
  flight.directTurnX = 0;
  flight.directTurnY = 0;
  flightStickKnob.style.transform = "translate(-50%, -50%)";
  flightSpeedValue.value = String(Math.round(flight.speedSelection));
  flight.readoutElapsed = 1;
  if (waterSpray) resetWaterSpray(waterSpray);
  flightUp.copy(startDirection);
  flightNextUp.copy(startDirection);
  updateFlightPlayer(flightPlayer, {
    position: flight.position,
    forward: flight.forward,
    up: startDirection,
    bodyPitch: flight.bodyPitch,
    roll: 0,
    turnInput: 0,
    climbInput: 0,
    altitude: flight.cruiseAltitude,
    surfaceRadius: startRadius - PLAYER_CLEARANCE - flight.cruiseAltitude,
    delta: 0,
  });
  updateFlightCamera(1 / 60, true);
  updateFlightEnvironment(startDirection);
}

function applyDeadzone(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= FLIGHT_STICK_DEADZONE) return 0;
  const scaled = (magnitude - FLIGHT_STICK_DEADZONE) / (1 - FLIGHT_STICK_DEADZONE);
  return Math.sign(value) * THREE.MathUtils.clamp(scaled, 0, 1);
}

function setupInteraction() {
  if (settings.view === "flight") setupFlightInteraction();
  else setupOrbitInteraction();
}

function setupOrbitInteraction() {
  canvas.addEventListener("pointerdown", (event) => {
    orbit.dragging = true;
    orbit.pointerId = event.pointerId;
    orbit.x = event.clientX;
    orbit.y = event.clientY;
    orbit.idle = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!orbit.dragging || event.pointerId !== orbit.pointerId) return;
    orbit.desiredYaw -= (event.clientX - orbit.x) * 0.006;
    orbit.desiredPitch = THREE.MathUtils.clamp(
      orbit.desiredPitch + (event.clientY - orbit.y) * 0.004,
      -1.15,
      1.15,
    );
    orbit.x = event.clientX;
    orbit.y = event.clientY;
    orbit.idle = 0;
  });
  const release = (event) => {
    if (event.pointerId !== orbit.pointerId) return;
    orbit.dragging = false;
    orbit.pointerId = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.desiredDistance = THREE.MathUtils.clamp(
      orbit.desiredDistance + event.deltaY * 0.28,
      500,
      1120,
    );
    orbit.idle = 0;
  }, { passive: false });
}

function setupFlightInteraction() {
  flightStick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (flight.stickId !== null) return;
    flight.stickId = event.pointerId;
    flight.stickOffset.set(0, 0);
    flightStick.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    flight.accelPointers.add(event.pointerId);
    if (
      event.clientY >= window.innerHeight * 0.5
      && event.clientX < window.innerWidth * 0.5
      && flight.directId === null
    ) {
      flight.directId = event.pointerId;
      flight.directLastX = event.clientX;
      flight.directLastY = event.clientY;
    }
    canvas.setPointerCapture(event.pointerId);
  });
  window.addEventListener("pointermove", (event) => {
    if (event.pointerId === flight.stickId) {
      event.preventDefault();
      const rect = flightStick.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy);
      const limit = Math.min(length, FLIGHT_STICK_LIMIT);
      const nx = length > 0 ? dx / length : 0;
      const ny = length > 0 ? dy / length : 0;
      flight.stickOffset.set(nx * limit, ny * limit);
      flightStickKnob.style.transform = `translate(calc(-50% + ${nx * limit}px), calc(-50% + ${ny * limit}px))`;
    }
    if (event.pointerId === flight.directId) {
      event.preventDefault();
      flight.directTurnX += event.clientX - flight.directLastX;
      flight.directTurnY += event.clientY - flight.directLastY;
      flight.directLastX = event.clientX;
      flight.directLastY = event.clientY;
    }
  }, { passive: false });
  const releasePointer = (event) => {
    flight.accelPointers.delete(event.pointerId);
    if (event.pointerId === flight.directId) flight.directId = null;
    if (event.pointerId === flight.stickId) {
      flight.stickId = null;
      flight.stickOffset.set(0, 0);
      flightStickKnob.style.transform = "translate(-50%, -50%)";
    }
  };
  window.addEventListener("pointerup", releasePointer);
  window.addEventListener("pointercancel", releasePointer);
  window.addEventListener("keydown", (event) => {
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
      event.preventDefault();
      flight.keys.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => flight.keys.delete(event.code));
  window.addEventListener("blur", () => {
    flight.keys.clear();
    flight.accelPointers.clear();
  });
  flightSpeedSlider.addEventListener("input", () => {
    flight.speedSelection = Number(flightSpeedSlider.value);
    flightSpeedValue.value = String(Math.round(flight.speedSelection));
  });
  flightSpeedSlider.addEventListener("keydown", (event) => event.stopPropagation());
  flightSpeedSlider.addEventListener("keyup", (event) => event.stopPropagation());
  document.querySelector("#flight-reset").addEventListener("click", resetFlight);
}

function createSeededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("pagehide", () => {
  renderer.setAnimationLoop(null);
  textureDisposables.forEach((texture) => texture.dispose());
  renderer.dispose();
}, { once: true });
