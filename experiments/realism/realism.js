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
const cameraTarget = new THREE.Vector3(0, 2.4, 0);
const orbit = {
  yaw: 0.68,
  pitch: 0.3,
  distance: 46,
  desiredYaw: 0.68,
  desiredPitch: 0.3,
  desiredDistance: 46,
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

  group.position.set(-1.2, 0.1, -0.5);
  group.rotation.y = -0.32;
  return group;
}

function createRealisticBook() {
  const group = new THREE.Group();
  const coverMaps = createCoverTextures(settings.preset.textureSize);
  const coverMaterial = new THREE.MeshStandardMaterial({
    map: coverMaps.color,
    bumpMap: coverMaps.bump,
    bumpScale: 0.14,
    roughnessMap: coverMaps.roughness,
    roughness: 0.72,
    metalness: 0.02,
  });
  const pageMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8c8a7,
    roughness: 0.96,
    metalness: 0,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c765e,
    roughness: 0.88,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xb48b42,
    roughness: 0.42,
    metalness: 0.36,
  });

  const coverGeometry = createRoundedSlabGeometry(21.5, 14.3, 0.52, 0.62);
  const pageGeometry = new THREE.BoxGeometry(20.4, 1.75, 13.25, 1, 2, 1);
  const pages = new THREE.Mesh(pageGeometry, pageMaterial);
  pages.position.y = 1.38;
  pages.castShadow = true;
  pages.receiveShadow = true;
  group.add(pages);

  const lowerCover = new THREE.Mesh(coverGeometry, coverMaterial);
  lowerCover.position.y = 0.3;
  lowerCover.castShadow = true;
  lowerCover.receiveShadow = true;
  group.add(lowerCover);

  const upperCover = new THREE.Mesh(coverGeometry, coverMaterial);
  upperCover.position.y = 2.48;
  upperCover.rotation.z = -0.018;
  upperCover.castShadow = true;
  upperCover.receiveShadow = true;
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
    matrix.makeTranslation(0, 0.57 + ratio * 1.63, 0);
    edgeLines.setMatrixAt(index, matrix);
  }
  edgeLines.instanceMatrix.needsUpdate = true;
  group.add(edgeLines);

  const titlePanel = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 6.2),
    new THREE.MeshStandardMaterial({
      color: 0x361f21,
      roughness: 0.58,
      metalness: 0.03,
    }),
  );
  titlePanel.rotation.x = -Math.PI / 2;
  titlePanel.position.set(0.6, 2.765, -0.15);
  titlePanel.receiveShadow = true;
  group.add(titlePanel);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(8.9, 5.05)),
    new THREE.LineBasicMaterial({ color: 0xb48b42 }),
  );
  frame.rotation.x = -Math.PI / 2;
  frame.position.set(0.6, 2.78, -0.15);
  group.add(frame);

  const sigil = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.11, 8, 32), goldMaterial);
  sigil.rotation.x = Math.PI / 2;
  sigil.position.set(0.6, 2.82, -0.2);
  group.add(sigil);

  group.position.set(-1.2, 0.05, -0.5);
  group.rotation.y = -0.32;

  if (settings.preset.shadowSize === 0) {
    group.add(createFakeBookShadow());
  }

  return group;
}

function createRoundedSlabGeometry(width, depth, thickness, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

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
  geometry.computeVertexNormals();
  return geometry;
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
  color.fillStyle = "#402326";
  color.fillRect(0, 0, size, size);
  bump.fillStyle = "#777";
  bump.fillRect(0, 0, size, size);
  roughness.fillStyle = "#c8c8c8";
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

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return {
    color: makeTexture(colorCanvas, true, 1, anisotropy),
    bump: makeTexture(bumpCanvas, false, 1, anisotropy),
    roughness: makeTexture(roughnessCanvas, false, 1, anisotropy),
  };
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
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(27, 18), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(1.1, 0.02, 0.6);
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
  sun.position.set(-31, 42, 24);
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
