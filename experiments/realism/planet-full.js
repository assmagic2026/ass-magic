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
} from "./whole-planet-player.js";
import { createSpecialLandmarks } from "./whole-planet-landmarks.js";

const PLANET_RADIUS = 340;
const PLAYER_CLEARANCE = 0.9;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_DIRECTION = new THREE.Vector3(0.82, 0.33, 0.46).normalize();
const TERRAIN_DRY = new THREE.Color(0x827965);
const TERRAIN_WET = new THREE.Color(0x46564b);
const TERRAIN_ROCK = new THREE.Color(0x66635d);
const TERRAIN_HIGH = new THREE.Color(0xaaa59a);
const PLANET_LOADS = Object.freeze({
  current: {
    planetDetail: 4,
    rockCount: 210,
    pebbleCount: 0,
    crackCount: 0,
    dustCount: 600,
    cloudCount: 210,
    atmosphereSegments: 24,
  },
  low: {
    planetWidthSegments: 128,
    planetHeightSegments: 64,
    rockCount: 600,
    pebbleCount: 2500,
    crackCount: 360,
    dustCount: 250,
    cloudCount: 120,
    atmosphereSegments: 24,
  },
  standard: {
    planetWidthSegments: 192,
    planetHeightSegments: 96,
    rockCount: 1200,
    pebbleCount: 9000,
    crackCount: 800,
    dustCount: 500,
    cloudCount: 260,
    atmosphereSegments: 32,
  },
  high: {
    planetWidthSegments: 256,
    planetHeightSegments: 128,
    rockCount: 2200,
    pebbleCount: 30000,
    crackCount: 1400,
    dustCount: 900,
    cloudCount: 480,
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
  loadLabel: `R340 ${meshLabel} / LANDMARK 7 / ROCK ${planetLoad.rockCount.toLocaleString()}`,
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
let twilightFillLight = null;
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
const planet = createPlanet();
planet.receiveShadow = realismShadowsEnabled;
scene.add(planet);
const sky = settings.view === "flight" ? createSky() : null;
if (sky) scene.add(sky);
addLighting();
const atmosphere = settings.view === "orbit" ? createAtmosphere() : null;
if (atmosphere) scene.add(atmosphere);
addSurfaceDetails();
const specialLandmarks = createSpecialLandmarks({
  scene,
  sunDirection: SUN_DIRECTION,
  getSurfaceRadius,
  realism: settings.mode === "realism",
});
const flightPlayer = createFlightPlayer(scene);
flightPlayer.player.visible = settings.view === "flight";
flightPlayer.shadow.visible = settings.view === "flight";
if (realismShadowsEnabled) {
  flightPlayer.player.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });
  specialLandmarks.root.traverse((object) => {
    if (!object.isMesh || object.material?.transparent) return;
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
const flightFogColor = new THREE.Color();
const flightFogDay = new THREE.Color(0xaacbd4);
const flightFogDusk = new THREE.Color(0xc58b73);
const flightFogNight = new THREE.Color(0x111c2c);
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

  for (const layer of movingSurfaceLayers) {
    layer.object.rotation.y = elapsed * layer.speed;
  }
  if (atmosphere) atmosphere.material.uniforms.cameraPos.value.copy(camera.position);
  if (sky) sky.material.uniforms.cameraPos.value.copy(camera.position);
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
  const colors = new Float32Array(positions.count * 3);
  const normals = new Float32Array(positions.count * 3);
  const direction = new THREE.Vector3();
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    direction.fromBufferAttribute(positions, index).normalize();
    const height = terrainHeightFromDirection(direction);
    const radius = PLANET_RADIUS + height;
    positions.setXYZ(index, direction.x * radius, direction.y * radius, direction.z * radius);
    getTerrainColor(direction, height, color);
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
  // Keep the physical surface identical to production. Fine detail comes from
  // the bump map, so realism does not change flight altitude or ground response.
  const ridge = Math.sin(direction.x * 7 + direction.z * 3.4) * 1.5;
  const swell = Math.cos(direction.y * 8.6 - direction.x * 2.4) * 1.0;
  const twist = Math.sin((direction.x - direction.z) * 10 + direction.y * 4.2) * 0.55;
  return ridge + swell + twist;
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

function getSurfaceRadius(direction) {
  return PLANET_RADIUS + terrainHeightFromDirection(direction);
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
    const color = loadPbrTexture("./assets/rocks-ground-04-diff-1k.jpg", true);
    const normal = loadPbrTexture("./assets/rocks-ground-04-normal-gl-1k.jpg", false);
    const roughness = loadPbrTexture("./assets/rocks-ground-04-rough-1k.jpg", false);
    return new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.82, 0.82),
      roughnessMap: roughness,
      roughness: 0.9,
      metalness: 0,
    });
  }
  const maps = createPlanetTextures(settings.preset.textureSize);
  return new THREE.MeshStandardMaterial({
    map: maps.color,
    bumpMap: maps.height,
    bumpScale: settings.quality === "high" ? 0.78 : 0.52,
    roughnessMap: maps.roughness,
    roughness: 0.93,
    metalness: 0,
    vertexColors: true,
  });
}

function loadPbrTexture(path, isColor) {
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
  texture.repeat.set(72, 36);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  externalTextureLoads.push(loadComplete);
  return texture;
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
  addRocks(random);
  if (planetLoad.pebbleCount) addPebbles(random);
  if (planetLoad.crackCount) addCracks(random);
  addDust(random);
  if (settings.mode !== "realism") addClouds(random);
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
    position.copy(direction).multiplyScalar(getSurfaceRadius(direction) + size * 0.4);
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
    position.copy(direction).multiplyScalar(getSurfaceRadius(direction) + size * 0.2);
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
    position.copy(direction).multiplyScalar(getSurfaceRadius(direction) + 0.08);
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
  const geometry = createSurfacePointGeometry(planetLoad.cloudCount, random, 20, 72);
  const material = new THREE.PointsMaterial({
    map: createCloudTexture(),
    color: 0xe3eef0,
    size: settings.mode === "realism" ? 14 : 10,
    transparent: true,
    opacity: settings.mode === "realism" ? 0.23 : 0.32,
    alphaTest: 0.012,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const clouds = new THREE.Points(geometry, material);
  scene.add(clouds);
  movingSurfaceLayers.push({ object: clouds, speed: -0.00045 });
}

function createSurfacePointGeometry(count, random, minimumAltitude, maximumAltitude) {
  const positions = new Float32Array(count * 3);
  const direction = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    randomSphereDirection(random, direction);
    const radius = getSurfaceRadius(direction)
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

function createCloudTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  context.filter = "blur(5px)";
  context.fillStyle = "rgba(255,255,255,0.78)";
  for (const [x, y, radius] of [[34, 39, 18], [55, 29, 24], [79, 36, 20], [99, 39, 15]]) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
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
      dayZenith: { value: new THREE.Color(0x65b7ff) },
      dayHorizon: { value: new THREE.Color(0xcbe8ff) },
      duskZenith: { value: new THREE.Color(0x382d50) },
      duskHorizon: { value: new THREE.Color(0x9b5d60) },
      nightZenith: { value: new THREE.Color(0x06111f) },
      nightHorizon: { value: new THREE.Color(0x10233f) },
      sunColor: { value: new THREE.Color(0xffbd78) },
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
      uniform vec3 dayZenith;
      uniform vec3 dayHorizon;
      uniform vec3 duskZenith;
      uniform vec3 duskHorizon;
      uniform vec3 nightZenith;
      uniform vec3 nightHorizon;
      uniform vec3 sunColor;
      varying vec3 vWorldPosition;
      void main() {
        vec3 ray = normalize(vWorldPosition - cameraPos);
        vec3 localUp = normalize(cameraPos);
        vec3 sun = normalize(sunDirection);
        float viewHeight = dot(ray, localUp);
        float sunHeight = dot(localUp, sun);
        float horizon = exp(-abs(viewHeight) * 5.2);
        float zenith = pow(smoothstep(-0.14, 0.68, viewHeight), 0.9);
        vec3 day = mix(dayHorizon, dayZenith, zenith);
        vec3 dusk = mix(duskHorizon, duskZenith, zenith);
        vec3 night = mix(nightHorizon, nightZenith, pow(smoothstep(-0.12, 0.62, viewHeight), 0.86));
        float dayMix = smoothstep(-0.16, 0.18, sunHeight);
        float duskMix = 1.0 - smoothstep(0.035, 0.3, abs(sunHeight));
        vec3 color = mix(night, day, dayMix);
        color = mix(color, dusk, duskMix * 0.94);
        vec3 sunOnHorizon = normalize(sun - localUp * sunHeight + vec3(0.0001));
        vec3 rayOnHorizon = normalize(ray - localUp * viewHeight + vec3(0.0001));
        float sunsetDirection = pow(max(dot(rayOnHorizon, sunOnHorizon), 0.0), 0.72);
        color = mix(color, sunColor, duskMix * horizon * sunsetDirection * 0.78);
        float sunAmount = max(dot(ray, sun), 0.0);
        float sunVisibility = smoothstep(-0.08, 0.025, sunHeight);
        color += sunColor * pow(sunAmount, 28.0) * 0.16 * sunVisibility;
        color += sunColor * pow(sunAmount, 720.0) * 1.1 * sunVisibility;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
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
    scene.add(new THREE.HemisphereLight(0xaec9cf, 0x2b2521, 0.46));
    twilightFillLight = new THREE.AmbientLight(0xf2a479, 0.08);
    scene.add(twilightFillLight);
  } else {
    scene.add(new THREE.AmbientLight(0x5c6e89, 0.55));
  }
  const sun = new THREE.DirectionalLight(0xffe0b0, settings.mode === "realism" ? 3.8 : 1.7);
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
    const excessAltitude = Math.max(0, altitude - FLIGHT_PHYSICS.NEUTRAL_ALTITUDE);
    const neutralTarget = excessAltitude > 0
      ? -THREE.MathUtils.clamp(
        FLIGHT_PHYSICS.NEUTRAL_DESCEND_MIN + excessAltitude * 0.12,
        FLIGHT_PHYSICS.NEUTRAL_DESCEND_MIN,
        FLIGHT_PHYSICS.NEUTRAL_DESCEND_MAX,
      )
      : 0;
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
  updateFlightEnvironment(flightNextUp);

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

function updateFlightEnvironment(up) {
  if (!scene.fog) return;
  const sunHeight = up.dot(SUN_DIRECTION);
  const dayMix = THREE.MathUtils.smoothstep(sunHeight, -0.16, 0.18);
  const duskMix = 1 - THREE.MathUtils.smoothstep(Math.abs(sunHeight), 0.035, 0.3);
  flightFogColor.copy(flightFogNight).lerp(flightFogDay, dayMix);
  flightFogColor.lerp(flightFogDusk, duskMix * 0.9);
  scene.fog.color.lerp(flightFogColor, 0.08);
  if (twilightFillLight) {
    twilightFillLight.intensity = THREE.MathUtils.lerp(
      twilightFillLight.intensity,
      0.04 + dayMix * 0.08 + duskMix * 0.34,
      0.08,
    );
  }
}

function resetFlight() {
  const startPreset = new URLSearchParams(window.location.search).get("start") || "dusk";
  const targetDirection = specialLandmarks.directions[startPreset]
    || specialLandmarks.directions.dusk;
  const isDuskStart = startPreset === "dusk";
  const approach = isDuskStart
    ? new THREE.Vector3().crossVectors(SUN_DIRECTION, targetDirection).normalize()
    : SUN_DIRECTION.clone().addScaledVector(
      targetDirection,
      -SUN_DIRECTION.dot(targetDirection),
    );
  if (approach.lengthSq() < 0.0001) approach.crossVectors(WORLD_UP, targetDirection);
  approach.normalize();
  const approachAngle = isDuskStart ? 0.42 : 0.18;
  const startDirection = targetDirection.clone()
    .multiplyScalar(Math.cos(approachAngle))
    .addScaledVector(approach, -Math.sin(approachAngle))
    .normalize();
  const startRadius = getSurfaceRadius(startDirection) + PLAYER_CLEARANCE + flight.cruiseAltitude;
  flight.position.copy(startDirection).multiplyScalar(startRadius);
  flight.forward.copy(targetDirection)
    .addScaledVector(startDirection, -targetDirection.dot(startDirection))
    .normalize();
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
