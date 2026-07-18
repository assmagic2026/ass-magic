import * as THREE from "../../three.module.js";
import {
  AdaptivePixelRatio,
  configureLinks,
  getExperimentSettings,
} from "./quality.js";
import { PerformanceHud } from "./perf-hud.js";

const bootStartedAt = performance.now();
const settings = getExperimentSettings();
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
renderer.toneMappingExposure = settings.mode === "realism" ? 1.08 : 1;
renderer.shadowMap.enabled = settings.preset.shadowSize > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const adaptiveDpr = new AdaptivePixelRatio(renderer, settings.preset);
const scene = new THREE.Scene();
scene.background = new THREE.Color(settings.mode === "realism" ? 0x7ea5aa : 0x23689a);
scene.fog = settings.mode === "realism"
  ? new THREE.Fog(0x8ca8a7, 48, 132)
  : new THREE.Fog(0x23689a, 70, 145);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 260);
const cameraTarget = new THREE.Vector3(-1.2, 5.6, -0.6);
const orbit = {
  yaw: 0.68,
  pitch: 0.3,
  distance: 50,
  desiredYaw: 0.68,
  desiredPitch: 0.3,
  desiredDistance: 50,
  dragging: false,
  pointerId: null,
  x: 0,
  y: 0,
  idle: 0,
};

const textureDisposables = [];
const terrain = createTerrain();
scene.add(terrain);
scene.add(createBook());
scene.add(createSkyDome());
addLighting();
addAtmosphere();

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
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  orbit.idle += delta;
  if (!orbit.dragging && orbit.idle > 4) {
    orbit.desiredYaw += delta * 0.018;
  }

  const smoothing = 1 - Math.exp(-delta * 7);
  orbit.yaw = THREE.MathUtils.lerp(orbit.yaw, orbit.desiredYaw, smoothing);
  orbit.pitch = THREE.MathUtils.lerp(orbit.pitch, orbit.desiredPitch, smoothing);
  orbit.distance = THREE.MathUtils.lerp(orbit.distance, orbit.desiredDistance, smoothing);

  const planarDistance = Math.cos(orbit.pitch) * orbit.distance;
  camera.position.set(
    Math.sin(orbit.yaw) * planarDistance,
    Math.sin(orbit.pitch) * orbit.distance + 5,
    Math.cos(orbit.yaw) * planarDistance,
  );
  camera.lookAt(cameraTarget);

  if (adaptiveDpr.sample(delta)) resize();
  renderer.render(scene, camera);
  perfHud.update(delta, adaptiveDpr.ratio);
});

function createTerrain() {
  const size = 125;
  const segments = settings.preset.terrainSegments;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const palette = [0xd9b26f, 0x73a6a0, 0xe4774e, 0x445f88, 0xdccaa0].map(
    (hex) => new THREE.Color(hex),
  );

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radialCurve = -(x * x + z * z) / 270;
    const broad = Math.sin(x * 0.105) * 1.45 + Math.cos(z * 0.13) * 1.05;
    const detail = settings.mode === "realism"
      ? Math.sin((x + z) * 0.48) * 0.18 + Math.sin(x * 0.91 - z * 0.37) * 0.12
      : Math.round((Math.sin(x * 0.16) + Math.cos(z * 0.12)) * 0.9) * 0.72;
    positions.setY(index, radialCurve + broad + detail - 1.1);

    if (settings.mode === "current") {
      const paletteIndex = Math.abs(Math.floor((x * 0.11 + z * 0.07 + broad) * 1.7)) % palette.length;
      const color = palette[paletteIndex];
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.computeVertexNormals();
  let material;

  if (settings.mode === "realism") {
    const maps = createTerrainTextures(settings.preset.textureSize);
    material = new THREE.MeshStandardMaterial({
      map: maps.color,
      bumpMap: maps.height,
      bumpScale: 0.42,
      roughnessMap: maps.roughness,
      roughness: 0.92,
      metalness: 0,
      color: 0xc6b18c,
    });
  } else {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = settings.preset.shadowSize > 0;
  return mesh;
}

function createTerrainTextures(size) {
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
  let seed = 918273;

  for (let index = 0; index < size * size; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const fine = seed / 4294967295;
    const x = index % size;
    const y = Math.floor(index / size);
    const macro = (Math.sin(x * 0.032) + Math.cos(y * 0.027) + 2) * 0.25;
    const grain = fine * 0.58 + macro * 0.42;
    const offset = index * 4;
    colorData.data[offset] = 112 + grain * 62;
    colorData.data[offset + 1] = 91 + grain * 55;
    colorData.data[offset + 2] = 65 + grain * 46;
    colorData.data[offset + 3] = 255;

    const height = 80 + grain * 120;
    heightData.data[offset] = height;
    heightData.data[offset + 1] = height;
    heightData.data[offset + 2] = height;
    heightData.data[offset + 3] = 255;

    const roughness = 205 + grain * 42;
    roughnessData.data[offset] = roughness;
    roughnessData.data[offset + 1] = roughness;
    roughnessData.data[offset + 2] = roughness;
    roughnessData.data[offset + 3] = 255;
  }

  colorContext.putImageData(colorData, 0, 0);
  heightContext.putImageData(heightData, 0, 0);
  roughnessContext.putImageData(roughnessData, 0, 0);
  drawTerrainMarks(colorContext, size);
  drawTerrainMarks(heightContext, size, true);

  const anisotropy = Math.min(
    settings.quality === "high" ? 8 : 4,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const color = makeTexture(colorCanvas, true, 7, anisotropy);
  const height = makeTexture(heightCanvas, false, 7, anisotropy);
  const roughness = makeTexture(roughnessCanvas, false, 7, anisotropy);
  return { color, height, roughness };
}

function drawTerrainMarks(context, size, monochrome = false) {
  context.save();
  context.globalAlpha = monochrome ? 0.35 : 0.24;
  context.strokeStyle = monochrome ? "#282828" : "#473624";
  context.lineWidth = Math.max(1, size / 320);

  for (let line = 0; line < 16; line += 1) {
    const startX = ((line * 73) % 101) / 101 * size;
    const startY = ((line * 47) % 97) / 97 * size;
    context.beginPath();
    context.moveTo(startX, startY);
    for (let step = 1; step <= 5; step += 1) {
      context.lineTo(
        startX + Math.sin(line * 2.3 + step) * size * 0.045 + step * size * 0.018,
        startY + step * size * 0.028,
      );
    }
    context.stroke();
  }
  context.restore();
}

function makeTexture(canvasElement, isColor, repeat, anisotropy) {
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = anisotropy;
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  textureDisposables.push(texture);
  return texture;
}

function createBook() {
  return settings.mode === "realism" ? createRealisticBook() : createCurrentLikeBook();
}

function createCurrentLikeBook() {
  const group = new THREE.Group();
  const coverMaterial = new THREE.MeshLambertMaterial({ color: 0x5a2d2e });
  const pageMaterial = new THREE.MeshLambertMaterial({ color: 0xe8d8ad });
  const coverGeometry = new THREE.BoxGeometry(21, 0.55, 14);
  const pageGeometry = new THREE.BoxGeometry(20, 1.8, 13.1);

  const pages = new THREE.Mesh(pageGeometry, pageMaterial);
  pages.position.y = 1.45;
  group.add(pages);

  for (const y of [0.35, 2.55]) {
    const cover = new THREE.Mesh(coverGeometry, coverMaterial);
    cover.position.y = y;
    group.add(cover);
  }

  return plantBook(group);
}

function createRealisticBook() {
  const group = new THREE.Group();
  const coverMaps = createCoverTextures(settings.preset.textureSize);
  const coverMaterial = new THREE.MeshStandardMaterial({
    map: coverMaps.color,
    bumpMap: coverMaps.bump,
    bumpScale: 0.22,
    roughnessMap: coverMaps.roughness,
    roughness: 0.84,
    metalness: 0.02,
  });
  const pageMaps = createAgedPageTextures(settings.preset.textureSize);
  const pageMaterial = new THREE.MeshStandardMaterial({
    map: pageMaps.color,
    bumpMap: pageMaps.bump,
    bumpScale: 0.08,
    color: 0xc9b58e,
    roughness: 0.96,
    metalness: 0,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f5a45,
    roughness: 0.96,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d6a30,
    roughness: 0.68,
    metalness: 0.18,
  });

  const coverGeometry = createRoundedSlabGeometry(21.5, 14.3, 0.52, 0.62);
  weatherBookGeometry(coverGeometry, 21.5, 14.3, 0.24);
  const pageSegments = settings.quality === "high" ? [10, 3, 7] : [6, 2, 4];
  const pageGeometry = new THREE.BoxGeometry(
    20.4,
    1.75,
    13.25,
    pageSegments[0],
    pageSegments[1],
    pageSegments[2],
  );
  weatherBookGeometry(pageGeometry, 20.4, 13.25, 0.16);
  const pages = new THREE.Mesh(pageGeometry, pageMaterial);
  pages.position.y = 1.38;
  pages.castShadow = true;
  pages.receiveShadow = true;
  group.add(pages);

  const lowerCover = new THREE.Mesh(coverGeometry, coverMaterial);
  lowerCover.position.y = 0.3;
  lowerCover.castShadow = true;
  lowerCover.receiveShadow = false;
  group.add(lowerCover);

  const upperCover = new THREE.Mesh(coverGeometry, coverMaterial);
  upperCover.position.y = 2.48;
  upperCover.rotation.z = -0.018;
  upperCover.castShadow = true;
  upperCover.receiveShadow = false;
  group.add(upperCover);

  const edgeGeometry = new THREE.BoxGeometry(20.45, 0.025, 13.29);
  const edgeLines = new THREE.InstancedMesh(
    edgeGeometry,
    edgeMaterial,
    settings.preset.pageLayers,
  );
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < settings.preset.pageLayers; index += 1) {
    const ratio = (index + 1) / (settings.preset.pageLayers + 1);
    const unevenX = Math.sin(index * 4.17) * 0.055;
    const unevenZ = Math.cos(index * 2.73) * 0.045;
    matrix.compose(
      new THREE.Vector3(unevenX, 0.57 + ratio * 1.63, unevenZ),
      new THREE.Quaternion(),
      new THREE.Vector3(1 - Math.abs(unevenX) * 0.012, 1, 1 - Math.abs(unevenZ) * 0.012),
    );
    edgeLines.setMatrixAt(index, matrix);
  }
  edgeLines.instanceMatrix.needsUpdate = true;
  group.add(edgeLines);

  const titlePanel = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 6.2),
    new THREE.MeshStandardMaterial({
      color: 0x271819,
      roughness: 0.86,
      metalness: 0.03,
    }),
  );
  titlePanel.rotation.x = -Math.PI / 2;
  titlePanel.position.set(0.6, 2.765, -0.15);
  titlePanel.receiveShadow = true;
  group.add(titlePanel);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(8.9, 5.05)),
    new THREE.LineBasicMaterial({ color: 0x81652f, transparent: true, opacity: 0.58 }),
  );
  frame.rotation.x = -Math.PI / 2;
  frame.position.set(0.6, 2.78, -0.15);
  group.add(frame);

  const sigil = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.1, 7, 28, Math.PI * 1.62),
    goldMaterial,
  );
  sigil.rotation.x = Math.PI / 2;
  sigil.position.set(0.6, 2.82, -0.2);
  group.add(sigil);
  addBookDamageDetails(group);

  const root = new THREE.Group();
  root.add(plantBook(group));

  if (settings.preset.shadowSize === 0) {
    root.add(createFakeBookShadow());
  }

  return root;
}

function createRoundedSlabGeometry(width, depth, thickness, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius * 1.45);
  shape.lineTo(x + width - radius * 0.42, y + depth - radius * 0.84);
  shape.lineTo(x + width - radius * 0.1, y + depth - radius * 0.28);
  shape.lineTo(x + width - radius * 1.25, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius * 1.2);
  shape.lineTo(x + radius * 0.3, y + radius * 0.66);
  shape.lineTo(x + radius * 0.14, y + radius * 0.24);
  shape.lineTo(x + radius, y);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: settings.quality === "high" ? 3 : 2,
    bevelSize: 0.12,
    bevelThickness: 0.1,
    curveSegments: settings.quality === "high" ? 6 : 4,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let index = 0; index < positions.count; index += 1) {
    uvs.setXY(
      index,
      THREE.MathUtils.clamp(positions.getX(index) / width + 0.5, 0, 1),
      THREE.MathUtils.clamp(positions.getZ(index) / depth + 0.5, 0, 1),
    );
  }
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function weatherBookGeometry(geometry, width, depth, strength) {
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const edgeX = THREE.MathUtils.smoothstep(Math.abs(x), width * 0.39, width * 0.51);
    const edgeZ = THREE.MathUtils.smoothstep(Math.abs(z), depth * 0.37, depth * 0.51);
    const edge = Math.max(edgeX, edgeZ);
    if (edge <= 0) continue;

    const warp = Math.sin(x * 1.37 + z * 0.83) * 0.58
      + Math.sin(z * 2.21 - x * 0.31) * 0.42;
    positions.setY(index, y + warp * strength * edge);
    positions.setX(index, x + Math.sin(z * 1.71) * strength * edge * 0.16);
    positions.setZ(index, z + Math.cos(x * 1.49) * strength * edge * 0.16);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function plantBook(group) {
  const planted = new THREE.Group();
  planted.position.set(-2.35, 8.65, -1.35);
  planted.rotation.y = -0.72;
  group.rotation.order = "XYZ";
  group.rotation.set(0.07, 0, -Math.PI / 2 + 0.13);
  planted.add(group);
  return planted;
}

function createCoverTextures(size) {
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  for (const canvasElement of [colorCanvas, bumpCanvas, roughnessCanvas]) {
    canvasElement.width = size;
    canvasElement.height = size;
  }

  const color = colorCanvas.getContext("2d");
  const bump = bumpCanvas.getContext("2d");
  const roughness = roughnessCanvas.getContext("2d");
  color.fillStyle = "#563528";
  color.fillRect(0, 0, size, size);
  bump.fillStyle = "#777";
  bump.fillRect(0, 0, size, size);
  roughness.fillStyle = "#dddddd";
  roughness.fillRect(0, 0, size, size);

  let seed = 14053;
  const fibers = Math.floor(size * 0.7);
  for (let index = 0; index < fibers; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (seed / 0x7fffffff) * size;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const y = (seed / 0x7fffffff) * size;
    const length = size * (0.01 + (seed % 13) / 600);
    color.strokeStyle = index % 3 === 0 ? "rgba(225,170,130,.1)" : "rgba(15,4,7,.18)";
    color.lineWidth = Math.max(1, size / 900);
    color.beginPath();
    color.moveTo(x, y);
    color.lineTo(x + length, y + Math.sin(index) * length * 0.2);
    color.stroke();
    bump.strokeStyle = index % 2 ? "#858585" : "#686868";
    bump.lineWidth = Math.max(1, size / 900);
    bump.beginPath();
    bump.moveTo(x, y);
    bump.lineTo(x + length, y + Math.sin(index) * length * 0.2);
    bump.stroke();
  }

  for (let stain = 0; stain < 13; stain += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (seed / 0x7fffffff) * size;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const y = (seed / 0x7fffffff) * size;
    const radius = size * (0.035 + (seed % 19) / 230);
    const stainGradient = color.createRadialGradient(x, y, 0, x, y, radius);
    stainGradient.addColorStop(0, stain % 2 ? "rgba(8,4,2,.38)" : "rgba(174,119,62,.3)");
    stainGradient.addColorStop(1, "rgba(20,8,4,0)");
    color.fillStyle = stainGradient;
    color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  color.strokeStyle = "rgba(218,168,101,.46)";
  color.lineWidth = Math.max(5, size * 0.028);
  color.strokeRect(size * 0.018, size * 0.018, size * 0.964, size * 0.964);
  bump.strokeStyle = "#9a9a9a";
  bump.lineWidth = Math.max(4, size * 0.02);
  bump.strokeRect(size * 0.02, size * 0.02, size * 0.96, size * 0.96);

  for (let scratch = 0; scratch < 34; scratch += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (seed / 0x7fffffff) * size;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const y = (seed / 0x7fffffff) * size;
    const length = size * (0.018 + (seed % 31) / 240);
    const angle = (seed % 628) / 100;
    color.strokeStyle = scratch % 4 === 0 ? "rgba(221,174,111,.38)" : "rgba(9,4,3,.32)";
    color.lineWidth = Math.max(1, size / 700);
    color.beginPath();
    color.moveTo(x, y);
    color.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    color.stroke();
    roughness.strokeStyle = scratch % 3 === 0 ? "#fafafa" : "#b8b8b8";
    roughness.lineWidth = Math.max(1, size / 600);
    roughness.beginPath();
    roughness.moveTo(x, y);
    roughness.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    roughness.stroke();
  }

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return {
    color: makeTexture(colorCanvas, true, 1, anisotropy),
    bump: makeTexture(bumpCanvas, false, 1, anisotropy),
    roughness: makeTexture(roughnessCanvas, false, 1, anisotropy),
  };
}

function createAgedPageTextures(size) {
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const color = colorCanvas.getContext("2d");
  const bump = bumpCanvas.getContext("2d");
  color.fillStyle = "#c5ad82";
  color.fillRect(0, 0, size, size);
  bump.fillStyle = "#7f7f7f";
  bump.fillRect(0, 0, size, size);

  for (let line = 0; line < 92; line += 1) {
    const y = ((line + 0.4) / 92) * size;
    const drift = Math.sin(line * 2.13) * size * 0.0025;
    color.strokeStyle = line % 7 === 0 ? "rgba(73,48,29,.28)" : "rgba(88,61,36,.12)";
    color.lineWidth = Math.max(1, size / 960);
    color.beginPath();
    color.moveTo(0, y);
    color.lineTo(size, y + drift);
    color.stroke();
    bump.strokeStyle = line % 5 === 0 ? "#696969" : "#898989";
    bump.lineWidth = Math.max(1, size / 1100);
    bump.beginPath();
    bump.moveTo(0, y);
    bump.lineTo(size, y + drift);
    bump.stroke();
  }

  const edgeShade = color.createLinearGradient(0, 0, size, 0);
  edgeShade.addColorStop(0, "rgba(72,45,25,.48)");
  edgeShade.addColorStop(0.12, "rgba(72,45,25,0)");
  edgeShade.addColorStop(0.86, "rgba(72,45,25,0)");
  edgeShade.addColorStop(1, "rgba(72,45,25,.42)");
  color.fillStyle = edgeShade;
  color.fillRect(0, 0, size, size);

  const anisotropy = Math.min(6, renderer.capabilities.getMaxAnisotropy());
  return {
    color: makeTexture(colorCanvas, true, 1, anisotropy),
    bump: makeTexture(bumpCanvas, false, 1, anisotropy),
  };
}

function addBookDamageDetails(group) {
  const wearMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b6540,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const darkWearMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2d22,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const tears = [
    { points: [[-10.72, -7.04], [-8.62, -7.04], [-10.72, -5.28]], material: wearMaterial },
    { points: [[10.72, 7.04], [8.88, 7.04], [10.72, 5.62]], material: darkWearMaterial },
    { points: [[-10.72, 6.98], [-9.26, 6.98], [-10.72, 5.92]], material: darkWearMaterial },
  ];

  for (const tear of tears) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(tear.points.flatMap(([x, z]) => [x, 0, z]));
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const patch = new THREE.Mesh(geometry, tear.material);
    patch.position.y = 2.805;
    patch.renderOrder = 1;
    group.add(patch);
  }

  const loosePageGeometry = new THREE.BoxGeometry(2.6, 0.035, 0.72);
  const loosePageMaterial = new THREE.MeshStandardMaterial({
    color: 0xa88d65,
    roughness: 1,
  });
  const loosePages = new THREE.InstancedMesh(loosePageGeometry, loosePageMaterial, 4);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const placements = [
    [-7.1, 1.02, -6.83, -0.08],
    [4.8, 1.7, 6.9, 0.06],
    [8.0, 0.88, -6.84, 0.11],
    [-2.4, 1.88, 6.88, -0.04],
  ];
  placements.forEach(([x, y, z, angle], index) => {
    quaternion.setFromEuler(new THREE.Euler(0, angle, 0));
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
    loosePages.setMatrixAt(index, matrix);
  });
  loosePages.instanceMatrix.needsUpdate = true;
  group.add(loosePages);
}

function createFakeBookShadow() {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 256;
  canvasElement.height = 160;
  const context = canvasElement.getContext("2d");
  const gradient = context.createRadialGradient(128, 80, 12, 128, 80, 116);
  gradient.addColorStop(0, "rgba(0,0,0,.52)");
  gradient.addColorStop(0.55, "rgba(0,0,0,.24)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 160);
  const texture = new THREE.CanvasTexture(canvasElement);
  textureDisposables.push(texture);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.62,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 6.5), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.rotation.z = -0.72;
  shadow.position.set(-2.35, -0.16, -0.75);
  return shadow;
}

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(190, 24, 14);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(settings.mode === "realism" ? 0x365e67 : 0x1b5e8d) },
      horizonColor: { value: new THREE.Color(settings.mode === "realism" ? 0xc1c7b6 : 0x58a7cb) },
      lowerColor: { value: new THREE.Color(settings.mode === "realism" ? 0x8f8170 : 0x2e718e) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color = h >= 0.0
          ? mix(horizonColor, topColor, smoothstep(0.0, 0.72, h))
          : mix(horizonColor, lowerColor, smoothstep(0.0, 0.45, -h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function addLighting() {
  if (settings.mode === "realism") {
    scene.add(new THREE.HemisphereLight(0xc7dae0, 0x5f4638, 1.55));
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  }

  const sun = new THREE.DirectionalLight(
    settings.mode === "realism" ? 0xffe1b3 : 0xffffff,
    settings.mode === "realism" ? 3.2 : 1.85,
  );
  sun.position.set(
    settings.mode === "realism" ? 28 : -31,
    42,
    settings.mode === "realism" ? 30 : 24,
  );
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  if (settings.preset.shadowSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(settings.preset.shadowSize, settings.preset.shadowSize);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 12;
    sun.shadow.camera.far = 95;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
  }
}

function addAtmosphere() {
  const count = settings.preset.atmosphereParticles;
  if (!count) return;
  const positions = new Float32Array(count * 3);
  let seed = 7761;
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 48271) % 2147483647;
    positions[index * 3] = (seed / 2147483647 - 0.5) * 92;
    seed = (seed * 48271) % 2147483647;
    positions[index * 3 + 1] = 1.5 + (seed / 2147483647) * 18;
    seed = (seed * 48271) % 2147483647;
    positions[index * 3 + 2] = (seed / 2147483647 - 0.5) * 92;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf2d7a4,
    size: settings.quality === "high" ? 0.15 : 0.11,
    transparent: true,
    opacity: 0.34,
    sizeAttenuation: true,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geometry, material));
}

function setupInteraction() {
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
    const dx = event.clientX - orbit.x;
    const dy = event.clientY - orbit.y;
    orbit.desiredYaw -= dx * 0.006;
    orbit.desiredPitch = THREE.MathUtils.clamp(orbit.desiredPitch + dy * 0.004, 0.08, 0.78);
    orbit.x = event.clientX;
    orbit.y = event.clientY;
    orbit.idle = 0;
  });

  const release = (event) => {
    if (event.pointerId !== orbit.pointerId) return;
    orbit.dragging = false;
    orbit.pointerId = null;
    orbit.idle = 0;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.desiredDistance = THREE.MathUtils.clamp(
      orbit.desiredDistance + event.deltaY * 0.025,
      25,
      72,
    );
    orbit.idle = 0;
  }, { passive: false });
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
