import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const basisMatrix = new THREE.Matrix4();
const basisRight = new THREE.Vector3();
const basisUp = new THREE.Vector3();
const placementUp = new THREE.Vector3();
const placementForward = new THREE.Vector3();
const dummy = new THREE.Object3D();
let surfaceTextures = null;

function textureNoise(x, y, seed) {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed * 3, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function createSurfaceTexture(kind, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const noise = textureNoise(x, y, kind === "wood" ? 709 : kind === "leather" ? 1879 : 3491);
      let red;
      let green;
      let blue;
      if (kind === "wood") {
        const grain = Math.sin(y * 0.17 + Math.sin(x * 0.035) * 2.4) * 0.5 + 0.5;
        const knot = Math.sin(Math.hypot(x - 72, y - 156) * 0.2) * 0.5 + 0.5;
        const tone = grain * 24 + knot * 9 + noise * 12;
        red = 116 + tone;
        green = 69 + tone * 0.58;
        blue = 38 + tone * 0.3;
      } else if (kind === "leather") {
        const pore = Math.sin(x * 0.43 + noise * 3) * Math.cos(y * 0.39 - noise * 2);
        const wear = Math.min(x, y, size - x, size - y) < 9 ? 26 : 0;
        red = 91 + noise * 28 + pore * 7 + wear;
        green = 53 + noise * 17 + pore * 4 + wear * 0.7;
        blue = 38 + noise * 13 + pore * 3 + wear * 0.45;
      } else {
        const fiber = Math.sin(y * 0.31 + noise * 2.2) * 5;
        const foxing = noise > 0.974 ? 24 : 0;
        red = 214 + noise * 22 + fiber - foxing * 0.25;
        green = 198 + noise * 20 + fiber - foxing * 0.52;
        blue = 164 + noise * 17 + fiber - foxing;
      }
      pixels.data[offset] = red;
      pixels.data[offset + 1] = green;
      pixels.data[offset + 2] = blue;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "wood" ? 2.8 : 1.4, kind === "wood" ? 2.8 : 1.4);
  return texture;
}

function getSurfaceTextures() {
  if (!surfaceTextures) {
    surfaceTextures = {
      wood: createSurfaceTexture("wood"),
      leather: createSurfaceTexture("leather"),
      paper: createSurfaceTexture("paper"),
    };
  }
  return surfaceTextures;
}

function createSurfaceQuaternion(forward, up, target = new THREE.Quaternion()) {
  basisRight.crossVectors(up, forward).normalize();
  if (basisRight.lengthSq() < 0.0001) basisRight.set(1, 0, 0);
  basisUp.crossVectors(forward, basisRight).normalize();
  basisMatrix.makeBasis(basisRight, basisUp, forward);
  return target.setFromRotationMatrix(basisMatrix);
}

function placeOnSphere(object, direction, forward, altitude, getSurfaceRadius, roll = 0) {
  placementUp.copy(direction).normalize();
  placementForward.copy(forward)
    .addScaledVector(placementUp, -forward.dot(placementUp))
    .normalize();
  object.position.copy(placementUp).multiplyScalar(getSurfaceRadius(placementUp) + altitude);
  object.quaternion.copy(createSurfaceQuaternion(placementForward, placementUp));
  object.rotateZ(roll);
}

function createMaterial(color, realism, options = {}) {
  if (!realism) {
    return new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      map: options.map ?? null,
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    map: options.map ?? null,
  });
}

function createContactShadow(radius, opacity) {
  const geometry = new THREE.CircleGeometry(radius, 28);
  geometry.rotateX(-Math.PI * 0.5);
  const shadow = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x080604,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  shadow.renderOrder = 1;
  return shadow;
}

function createBook(realism) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 2.45;
  pivot.rotation.set(-0.22, 0.08, -0.68);
  group.add(pivot);
  const textures = realism ? getSurfaceTextures() : {};
  const cover = createMaterial(0xd2c0b1, realism, {
    roughness: 0.94,
    map: textures.leather,
    emissive: 0x160b06,
    emissiveIntensity: 0.2,
  });
  const page = createMaterial(0xe3d4b5, realism, { roughness: 0.97, map: textures.paper });
  const edge = createMaterial(0xb8a180, realism, { roughness: 0.99, map: textures.paper });
  const wear = createMaterial(0xad855c, realism, { roughness: 0.9 });

  const addBox = (size, position, material, rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    pivot.add(mesh);
    return mesh;
  };
  addBox([9.6, 13.8, 3.12], [0.06, 0.08, 0], page);
  addBox([9, 6.4, 1.08], [0.62, 2.78, 0.7], page, [0, -0.16, 0.04]);
  addBox([8.8, 5.8, 1.02], [0.58, -2.48, -0.62], page, [0, 0.14, -0.03]);
  addBox([0.92, 14.5, 2.72], [-4.7, -0.04, 0], cover);
  addBox([9.82, 14.72, 0.7], [0.08, -0.02, -1.98], cover, [0, 0.12, 0.02]);
  addBox([9.76, 14.64, 0.7], [0.18, -0.08, 2.04], cover, [0, -0.18, -0.02]);
  addBox([0.32, 12.2, 2.86], [4.44, -0.02, 0], edge);
  addBox([8.6, 0.24, 2.92], [0.38, 6.82, 0], edge);
  addBox([8.4, 0.24, 2.9], [0.34, -6.72, 0], edge);
  for (const z of [-2.38, 2.44]) {
    addBox([7.9, 0.2, 0.09], [0.18, 5.72, z], wear);
    addBox([7.9, 0.2, 0.09], [0.18, -5.72, z], wear);
    addBox([0.2, 11.6, 0.09], [-3.78, 0, z], wear);
    addBox([0.2, 11.6, 0.09], [4.12, 0, z], wear);
  }
  for (const y of [-4.6, -1.55, 1.55, 4.6]) {
    addBox([0.42, 1.04, 3.08], [-5.05, y, 0], wear, [0, 0, -0.04]);
  }
  group.userData.proceduralVisual = pivot;
  return group;
}

function loadBookModel(book, modelUrl, castShadow) {
  const loader = new GLTFLoader();
  return loader.loadAsync(modelUrl).then((gltf) => {
    const imported = gltf.scene;
    const modelRoot = new THREE.Group();
    const axisMatrix = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    );
    modelRoot.quaternion.setFromRotationMatrix(axisMatrix);
    modelRoot.add(imported);
    modelRoot.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(modelRoot);
    const size = bounds.getSize(new THREE.Vector3());
    imported.scale.setScalar(13.8 / Math.max(size.y, 0.001));
    modelRoot.updateMatrixWorld(true);
    bounds.setFromObject(modelRoot);
    const center = bounds.getCenter(new THREE.Vector3());
    modelRoot.worldToLocal(center);
    imported.position.sub(center);
    modelRoot.scale.set(1.18, 1, 0.73);

    imported.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = castShadow;
      object.receiveShadow = true;
      if (object.material?.map) object.material.map.anisotropy = 8;
    });

    const mount = book.userData.proceduralVisual;
    for (const object of [...mount.children]) disposeVisual(object);
    mount.add(modelRoot);
    book.userData.glbVisual = modelRoot;
  }).catch((error) => {
    console.warn("Realism book GLB could not be loaded; using the procedural book.", error);
    throw error;
  });
}

function disposeVisual(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      for (const material of object.material) materials.add(material);
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

function createRecordPlayer(realism) {
  const group = new THREE.Group();
  const textures = realism ? getSurfaceTextures() : {};
  const wood = createMaterial(0xc2ae9c, realism, { roughness: 0.84, map: textures.wood });
  const metal = createMaterial(0xb7bec2, realism, { roughness: 0.35, metalness: 0.65 });
  const vinyl = createMaterial(0x111111, realism, { roughness: 0.48 });
  const label = createMaterial(0xe0c58d, realism, { roughness: 0.74 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(44, 4.2, 34), wood);
  plinth.position.y = 2.1;
  group.add(plinth);

  const platterBase = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.6, 1.8, 32), metal);
  platterBase.position.set(-6.2, 4.25, -1.2);
  group.add(platterBase);

  const recordDisc = new THREE.Group();
  recordDisc.position.set(-6.2, 5.82, -1.2);
  const record = new THREE.Mesh(new THREE.CylinderGeometry(11.16, 11.16, 0.34, 48), vinyl);
  const recordLabel = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.06, 0.22, 24), label);
  recordLabel.position.y = 0.22;
  recordDisc.add(record, recordLabel);
  for (let index = 0; index < 4; index += 1) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(5.2 + index * 1.55, 0.055, 4, 48), metal);
    groove.rotation.x = Math.PI * 0.5;
    groove.position.y = 0.2;
    recordDisc.add(groove);
  }
  group.add(recordDisc);

  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.5, 2.9, 16), metal);
  armBase.position.set(12.8, 5.35, 5.7);
  group.add(armBase);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(18, 0.34, 0.34), metal);
  arm.position.set(4.8, 7.1, 4.5);
  arm.rotation.y = -0.24;
  group.add(arm);
  const cartridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.86), label);
  cartridge.position.set(-4.2, 6.65, 2.3);
  group.add(cartridge);

  for (let index = 0; index < 3; index += 1) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.64, 14), metal);
    knob.position.set(8.4 + index * 2.5, 5.1, -9.8);
    group.add(knob);
  }
  group.userData.recordDisc = recordDisc;
  return group;
}

function createCompass() {
  const group = new THREE.Group();
  const rotor = new THREE.Group();
  const light = new THREE.MeshBasicMaterial({ color: 0xf3f7ff, toneMapped: false, fog: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x080b0f, toneMapped: false, fog: false });
  const north = new THREE.Mesh(new THREE.ConeGeometry(1.64, 16.8, 4), light);
  const south = new THREE.Mesh(new THREE.ConeGeometry(1.64, 16.8, 4), dark);
  north.position.z = 7.6;
  south.position.z = -7.6;
  north.rotation.x = Math.PI * 0.5;
  south.rotation.x = -Math.PI * 0.5;
  rotor.add(north, south);
  group.add(rotor);
  group.userData.rotor = rotor;
  return group;
}

function createSphere(radius, color, realism) {
  const material = realism
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 })
    : new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 18), material);
}

function createSanctuary(realism) {
  const group = new THREE.Group();
  const shell = createMaterial(0x111a26, realism, { roughness: 0.52, metalness: 0.25 });
  const cyan = createMaterial(0x5ddce6, realism, {
    roughness: 0.3,
    emissive: 0x174c55,
    emissiveIntensity: 1.2,
  });
  const warm = createMaterial(0xd8a35d, realism, {
    roughness: 0.45,
    emissive: 0x4a2b0e,
    emissiveIntensity: 0.5,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 8, 8), shell);
  base.position.y = 4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 1.2, 6, 32), cyan);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 7.2;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 5.6, 24, 8), shell);
  core.position.y = 18;
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(4.8, 1), warm);
  cap.position.y = 31;
  group.add(base, ring, core, cap);

  const halos = [];
  for (let index = 0; index < 8; index += 1) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(12 + index * 4.2, 0.24, 4, 28), index % 2 ? warm : cyan);
    halo.rotation.x = Math.PI * 0.5;
    halo.position.y = 16 + index * 7;
    halo.userData.spin = (index % 2 ? -1 : 1) * (0.12 + index * 0.025);
    halos.push(halo);
    group.add(halo);
  }

  const spokeCount = 28;
  const towerGeometry = new THREE.BoxGeometry(2.2, 10, 2.2);
  const glowGeometry = new THREE.BoxGeometry(2.5, 0.35, 2.5);
  const towers = new THREE.InstancedMesh(towerGeometry, shell, spokeCount);
  const glows = new THREE.InstancedMesh(glowGeometry, cyan, spokeCount);
  for (let index = 0; index < spokeCount; index += 1) {
    const angle = index / spokeCount * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 22, 5, Math.sin(angle) * 22);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.set(1, 0.72 + (index % 3) * 0.15, 1);
    dummy.updateMatrix();
    towers.setMatrixAt(index, dummy.matrix);
    dummy.position.y = 7 + (index % 3) * 1.5;
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    glows.setMatrixAt(index, dummy.matrix);
  }
  towers.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  group.add(towers, glows);
  group.userData.halos = halos;
  return group;
}

function createBlackBox(realism) {
  const group = new THREE.Group();
  const shell = createMaterial(0x050505, realism, { roughness: 0.4, metalness: 0.15 });
  const core = createMaterial(0x000000, realism, { roughness: 0.85 });
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.9), shell),
    new THREE.Mesh(new THREE.BoxGeometry(1.46, 1.46, 1.46), core),
  );
  return group;
}

export function createSpecialLandmarks({
  scene,
  sunDirection,
  getSurfaceRadius,
  realism,
  bookModelUrl = null,
  castShadow = false,
}) {
  const root = new THREE.Group();
  const sun = sunDirection.clone().normalize();
  const night = sun.clone().multiplyScalar(-1);
  const nightAxisA = new THREE.Vector3()
    .crossVectors(Math.abs(night.y) > 0.96 ? new THREE.Vector3(1, 0, 0) : WORLD_UP, night)
    .normalize();
  const nightAxisB = new THREE.Vector3().crossVectors(night, nightAxisA).normalize();
  const dayObjectDirection = sun.clone()
    .addScaledVector(nightAxisA, 0.42)
    .addScaledVector(nightAxisB, -0.16)
    .normalize();
  const bookDirection = sun.clone()
    .addScaledVector(nightAxisA, -1.4)
    .addScaledVector(nightAxisB, -0.8)
    .normalize();
  const sanctuaryDirection = night.clone()
    .addScaledVector(nightAxisA, 1.08)
    .addScaledVector(nightAxisB, 0.48)
    .normalize();
  const duskDirection = nightAxisA.clone()
    .multiplyScalar(-1)
    .addScaledVector(nightAxisB, 0.14)
    .addScaledVector(sun, 0.12)
    .normalize();
  const compassDirection = duskDirection.clone()
    .addScaledVector(sun, -duskDirection.dot(sun))
    .normalize();

  const recordPlayer = createRecordPlayer(realism);
  placeOnSphere(recordPlayer, dayObjectDirection, nightAxisB, 0.45, getSurfaceRadius);
  root.add(recordPlayer);
  const recordShadow = createContactShadow(28, 0.22);
  placeOnSphere(recordShadow, dayObjectDirection, nightAxisB, 0.08, getSurfaceRadius);
  root.add(recordShadow);

  const book = createBook(realism);
  const bookForward = sun.clone().addScaledVector(bookDirection, -sun.dot(bookDirection)).normalize();
  placeOnSphere(book, bookDirection, bookForward, 0.04, getSurfaceRadius, 0.06);
  root.add(book);
  const bookShadow = createContactShadow(8.8, 0.24);
  placeOnSphere(bookShadow, bookDirection, bookForward, 0.075, getSurfaceRadius, 0.06);
  root.add(bookShadow);
  const bookReady = bookModelUrl ? loadBookModel(book, bookModelUrl, castShadow) : null;

  const blackSphere = createSphere(18, 0x090909, realism);
  const blackForward = compassDirection.clone().addScaledVector(sun, -compassDirection.dot(sun)).normalize();
  placeOnSphere(blackSphere, sun, blackForward, 40, getSurfaceRadius);
  root.add(blackSphere);

  const whiteSphere = createSphere(18, 0xf7f7f2, realism);
  placeOnSphere(whiteSphere, night, nightAxisA, 40, getSurfaceRadius);
  root.add(whiteSphere);

  const compass = createCompass();
  compass.scale.setScalar(2.8);
  const compassForward = sun.clone().addScaledVector(compassDirection, -sun.dot(compassDirection)).normalize();
  placeOnSphere(compass, compassDirection, compassForward, 24, getSurfaceRadius);
  root.add(compass);

  const sanctuary = createSanctuary(realism);
  placeOnSphere(sanctuary, sanctuaryDirection, nightAxisA, 0.9, getSurfaceRadius, 0.24);
  root.add(sanctuary);
  const sanctuaryShadow = createContactShadow(29, 0.27);
  placeOnSphere(sanctuaryShadow, sanctuaryDirection, nightAxisA, 0.09, getSurfaceRadius, 0.24);
  root.add(sanctuaryShadow);

  const blackBox = createBlackBox(realism);
  root.add(blackBox);
  let blackBoxAngle = 2.15;
  const blackBoxDirection = new THREE.Vector3();
  const blackBoxForward = new THREE.Vector3();

  scene.add(root);
  return {
    root,
    ready: bookReady,
    compassDirection,
    directions: {
      day: sun,
      night,
      dusk: compassDirection,
      recordPlayer: dayObjectDirection,
      book: bookDirection,
      sanctuary: sanctuaryDirection,
    },
    update(delta) {
      recordPlayer.userData.recordDisc.rotation.y += delta * 1.55;
      compass.userData.rotor.rotation.y += delta * 0.42;
      for (const halo of sanctuary.userData.halos) halo.rotation.z += delta * halo.userData.spin;

      blackBoxAngle += delta * 0.54;
      blackBoxDirection.copy(sun).multiplyScalar(Math.cos(blackBoxAngle))
        .addScaledVector(nightAxisA, Math.sin(blackBoxAngle))
        .normalize();
      blackBoxForward.copy(sun).multiplyScalar(-Math.sin(blackBoxAngle))
        .addScaledVector(nightAxisA, Math.cos(blackBoxAngle))
        .normalize();
      placeOnSphere(
        blackBox,
        blackBoxDirection,
        blackBoxForward,
        0.4,
        getSurfaceRadius,
        Math.PI * 0.2,
      );
    },
  };
}
