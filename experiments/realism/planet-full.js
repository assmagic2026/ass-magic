import * as THREE from "../../three.module.js";
import {
  AdaptivePixelRatio,
  configureLinks,
  getExperimentSettings,
} from "./quality.js";
import { PerformanceHud } from "./perf-hud.js?scope=whole-planet";

const PLANET_RADIUS = 340;
const PLAYER_CLEARANCE = 0.9;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_DIRECTION = new THREE.Vector3(0.82, 0.33, 0.46).normalize();
const TERRAIN_DRY = new THREE.Color(0x927d61);
const TERRAIN_WET = new THREE.Color(0x4c665b);
const TERRAIN_ROCK = new THREE.Color(0x76736d);
const TERRAIN_HIGH = new THREE.Color(0xa9a497);
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
  loadLabel: `R340 ${meshLabel} / ROCK ${planetLoad.rockCount.toLocaleString()} / PEBBLE ${planetLoad.pebbleCount.toLocaleString()}`,
};
configureLinks(settings);

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: settings.mode === "realism" && settings.quality === "high",
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = settings.mode === "realism"
  ? THREE.ACESFilmicToneMapping
  : THREE.NoToneMapping;
renderer.toneMappingExposure = settings.mode === "realism" ? 1.04 : 1;

const adaptiveDpr = new AdaptivePixelRatio(renderer, settings.preset);
const scene = new THREE.Scene();
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
const movingSurfaceLayers = [];
const planet = createPlanet();
scene.add(planet);
const sky = settings.view === "flight" ? createSky() : null;
if (sky) scene.add(sky);
addLighting();
const atmosphere = settings.view === "orbit" ? createAtmosphere() : null;
if (atmosphere) scene.add(atmosphere);
addSurfaceDetails();

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
const flight = {
  position: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  speed: 40,
  speedSelection: 40,
  boostSpeed: 0,
  radialSpeed: 0,
  cruiseAltitude: 10,
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
document.querySelector("#loading").classList.add("is-hidden");

const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  elapsed += delta;
  if (settings.view === "flight") updateFlight(delta);
  else updateOrbit(delta);

  for (const layer of movingSurfaceLayers) {
    layer.object.rotation.y = elapsed * layer.speed;
  }
  if (atmosphere) atmosphere.material.uniforms.cameraPos.value.copy(camera.position);
  if (sky) sky.material.uniforms.cameraPos.value.copy(camera.position);
  if (adaptiveDpr.sample(delta)) resize();
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
  if (settings.mode !== "realism") {
    const ridge = Math.sin(direction.x * 7 + direction.z * 3.4) * 1.5;
    const swell = Math.cos(direction.y * 8.6 - direction.x * 2.4) * 1.0;
    const twist = Math.sin((direction.x - direction.z) * 10 + direction.y * 4.2) * 0.55;
    return ridge + swell + twist;
  }

  const continental = terrainSignal(direction, 2.6, 0.35);
  const hill = terrainSignal(direction, 7.8, 1.7);
  const erosion = terrainSignal(direction, 15.5, 3.1);
  const ridge = Math.pow(1 - Math.abs(erosion), 3.2);
  const fine = terrainSignal(direction, 34, 4.7);
  return continental * 2.75 + hill * 1.35 + ridge * 3.4 - 0.72 + fine * 0.34;
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
  const maps = createPlanetTextures(settings.preset.textureSize);
  return new THREE.MeshStandardMaterial({
    map: maps.color,
    bumpMap: maps.height,
    bumpScale: 0.42,
    roughnessMap: maps.roughness,
    roughness: 0.93,
    metalness: 0,
    vertexColors: true,
  });
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
    const middle = tiledValueNoise(u, v, 48, 24, 911);
    const fine = tiledValueNoise(u, v, 160, 80, 3571);
    const grain = tiledValueNoise(u, v, 320, 160, 7187);
    heights[index] = middle * 0.52 + fine * 0.34 + grain * 0.14;
  }

  for (let index = 0; index < heights.length; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    const height = heights[index];
    const mineral = noiseHash(x, y, 11239);
    const offset = index * 4;
    let tone = 203 + height * 50;
    if (mineral > 0.965) tone += 14;
    if (mineral < 0.035) tone -= 17;
    colorData.data[offset] = tone;
    colorData.data[offset + 1] = tone - 5;
    colorData.data[offset + 2] = tone - 12;
    colorData.data[offset + 3] = 255;

    const relief = 68 + height * 174;
    heightData.data[offset] = relief;
    heightData.data[offset + 1] = relief;
    heightData.data[offset + 2] = relief;
    heightData.data[offset + 3] = 255;

    const roughness = 211 + height * 34;
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
    color: makeTexture(colorCanvas, true, anisotropy, 4, 2),
    height: makeTexture(heightCanvas, false, anisotropy, 10, 5),
    roughness: makeTexture(roughnessCanvas, false, anisotropy, 10, 5),
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
      dayZenith: { value: new THREE.Color(0x28678f) },
      dayHorizon: { value: new THREE.Color(0xb9d8e2) },
      dusk: { value: new THREE.Color(0xdd8f61) },
      nightZenith: { value: new THREE.Color(0x06111b) },
      nightHorizon: { value: new THREE.Color(0x152936) },
      sunColor: { value: new THREE.Color(0xffdda8) },
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
      uniform vec3 dusk;
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
        float dayMix = smoothstep(-0.12, 0.08, sunHeight);
        float horizon = exp(-abs(viewHeight) * 5.2);
        float zenith = pow(smoothstep(-0.14, 0.68, viewHeight), 0.9);
        vec3 day = mix(dayHorizon, dayZenith, zenith);
        vec3 night = mix(nightHorizon, nightZenith, pow(clamp(viewHeight, 0.0, 1.0), 0.7));
        float duskMix = 1.0 - smoothstep(0.015, 0.26, abs(sunHeight));
        vec3 color = mix(night, day, dayMix);
        color = mix(color, dusk, horizon * duskMix * 0.72);
        float sunAmount = max(dot(ray, sun), 0.0);
        color += sunColor * pow(sunAmount, 28.0) * 0.16 * dayMix;
        color += sunColor * pow(sunAmount, 720.0) * 1.1 * dayMix;
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
    scene.add(new THREE.HemisphereLight(0xaec9cf, 0x332822, 0.78));
  } else {
    scene.add(new THREE.AmbientLight(0x5c6e89, 0.55));
  }
  const sun = new THREE.DirectionalLight(0xffe0b0, settings.mode === "realism" ? 3.8 : 1.7);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(620);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
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
  flight.boostSpeed = THREE.MathUtils.damp(
    flight.boostSpeed,
    accelerating ? 22 : 0,
    accelerating ? 3.2 : 1.4,
    delta,
  );
  flight.speed = THREE.MathUtils.damp(
    flight.speed,
    flight.speedSelection + flight.boostSpeed,
    2.8,
    delta,
  );

  const currentRadius = flight.position.length();
  const currentSurface = getSurfaceRadius(flightUp) + PLAYER_CLEARANCE;
  const altitude = currentRadius - currentSurface;
  if (climbInput > 0) {
    flight.radialSpeed += climbInput * 11.5 * delta;
  } else if (climbInput < 0) {
    const target = climbInput * Math.max(1.9, flight.speed * 0.3);
    flight.radialSpeed += climbInput * 6.5 * delta;
    flight.radialSpeed = THREE.MathUtils.lerp(
      flight.radialSpeed,
      target,
      1 - Math.exp(-1.7 * delta),
    );
  } else {
    const excessAltitude = altitude - flight.cruiseAltitude;
    const neutralTarget = THREE.MathUtils.clamp(-excessAltitude * 0.18, -2.1, 1.5);
    flight.radialSpeed = THREE.MathUtils.damp(
      flight.radialSpeed,
      neutralTarget,
      flight.radialSpeed > neutralTarget ? 3 : 1.1,
      delta,
    );
  }
  flight.radialSpeed = THREE.MathUtils.clamp(flight.radialSpeed, -8, 12);

  flightRight.crossVectors(flightUp, flight.forward).normalize();
  const moveAngle = (flight.speed * delta) / currentRadius;
  flightNextUp.copy(flightUp).applyAxisAngle(flightRight, moveAngle).normalize();
  flight.forward.applyAxisAngle(flightRight, moveAngle).normalize();
  flight.forward.addScaledVector(flightNextUp, -flight.forward.dot(flightNextUp)).normalize();
  const nextSurface = getSurfaceRadius(flightNextUp) + PLAYER_CLEARANCE;
  const nextRadius = Math.max(
    currentRadius + flight.radialSpeed * delta,
    nextSurface + 0.32,
  );
  flight.position.copy(flightNextUp).multiplyScalar(nextRadius);

  camera.up.copy(flightNextUp);
  camera.position.copy(flight.position);
  flightLookTarget.copy(flight.position).addScaledVector(flight.forward, 36);
  flightLookTarget.addScaledVector(
    flightNextUp,
    THREE.MathUtils.clamp(flight.radialSpeed / Math.max(flight.speed, 1) * 18, -4, 5),
  );
  camera.lookAt(flightLookTarget);

  flight.readoutElapsed += delta;
  if (flight.readoutElapsed >= 0.12) {
    const nextAltitude = Math.max(0, nextRadius - nextSurface);
    flightReadout.innerHTML = `SPEED ${Math.round(flight.speedSelection)}<br>ALT ${nextAltitude.toFixed(1)}<br>RADIUS ${PLANET_RADIUS}`;
    flight.readoutElapsed = 0;
  }
}

function resetFlight() {
  const startDirection = new THREE.Vector3(0.62, 0.35, 0.7).normalize();
  const startRadius = getSurfaceRadius(startDirection) + PLAYER_CLEARANCE + flight.cruiseAltitude;
  flight.position.copy(startDirection).multiplyScalar(startRadius);
  flight.forward.set(-startDirection.z, 0.08, startDirection.x);
  flight.forward.addScaledVector(startDirection, -flight.forward.dot(startDirection)).normalize();
  flight.speedSelection = Number(flightSpeedSlider.value) || 40;
  flight.speed = flight.speedSelection;
  flight.boostSpeed = 0;
  flight.radialSpeed = 0;
  flight.stickOffset.set(0, 0);
  flight.stickSmooth.set(0, 0);
  flight.keySmooth.set(0, 0);
  flight.directTurnX = 0;
  flight.directTurnY = 0;
  flightStickKnob.style.transform = "translate(-50%, -50%)";
  flightSpeedValue.value = String(Math.round(flight.speedSelection));
  flight.readoutElapsed = 1;
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
