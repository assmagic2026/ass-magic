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

const BLACK_BOX_FLIGHT_ALTITUDE = 20;
const BLACK_BOX_TERRAIN_LOOKAHEAD_SECONDS = 1.45;
const BLACK_BOX_TERRAIN_LOOKAHEAD_SAMPLES = 16;
const BLACK_BOX_ORBIT_ANGULAR_SPEED = 0.54;
const BLACK_BOX_ASCENT_RESPONSE = 2.8;
const BLACK_BOX_DESCENT_RESPONSE = 0.58;
const BLACK_BOX_DAY_AMBUSH_ANGLE = -0.58;

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

function createBook(realism) {
  const group = new THREE.Group();
  // Scale uniformly after fixing the model proportions, so the diagonal pose
  // cannot stretch one page axis more than another.
  group.scale.setScalar(8);
  const pivot = new THREE.Group();
  pivot.position.y = 2.45;
  pivot.scale.z = 0.25;
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
    // The source's X/Y/Z axes map to visible length/thickness/width after the
    // orientation transform. These factors yield exactly 10 x 15 x 1.2 in
    // visible width, length and thickness before uniform enlargement.
    modelRoot.scale.set(1.087, 0.273, 1.175);
    modelRoot.updateMatrixWorld(true);
    bounds.setFromObject(modelRoot);
    book.userData.modelDimensions = bounds.getSize(new THREE.Vector3());

    imported.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = castShadow;
      object.receiveShadow = true;
      if (object.material?.map) object.material.map.anisotropy = 8;
    });

    const mount = book.userData.proceduralVisual;
    for (const object of [...mount.children]) disposeVisual(object);
    mount.scale.set(1, 1, 1);
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
  if (textures.wood) textures.wood.anisotropy = 8;
  const wood = realism
    ? new THREE.MeshPhysicalMaterial({
      color: 0xb97a4f,
      map: textures.wood,
      roughness: 0.52,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.46,
    })
    : createMaterial(0x9a6848, false);
  const darkWood = realism
    ? new THREE.MeshPhysicalMaterial({
      color: 0x6f3d27,
      map: textures.wood,
      roughness: 0.62,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
    })
    : createMaterial(0x5b3829, false);
  const topPanel = realism
    ? new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.56, metalness: 0.18 })
    : createMaterial(0x24272a, false);
  const metal = realism
    ? new THREE.MeshStandardMaterial({ color: 0xa9afb2, roughness: 0.2, metalness: 0.92 })
    : createMaterial(0xb7bec2, false);
  const darkMetal = realism
    ? new THREE.MeshStandardMaterial({ color: 0x35393d, roughness: 0.27, metalness: 0.82 })
    : createMaterial(0x34383a, false);
  const vinyl = realism
    ? new THREE.MeshPhysicalMaterial({
      color: 0x070809,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.62,
      clearcoatRoughness: 0.22,
    })
    : createMaterial(0x111111, false);
  const grooveMaterial = realism
    ? new THREE.MeshStandardMaterial({ color: 0x34373a, roughness: 0.3, metalness: 0.36 })
    : createMaterial(0x292b2d, false);
  const label = createMaterial(0xd8b76f, realism, { roughness: 0.78 });
  const rubber = createMaterial(0x090a0b, realism, { roughness: 0.92 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(44, 4.2, 34), wood);
  plinth.position.y = 2.1;
  group.add(plinth);
  const insetTop = new THREE.Mesh(new THREE.BoxGeometry(42.8, 0.34, 32.8), topPanel);
  insetTop.position.y = 4.33;
  group.add(insetTop);
  const frontFascia = new THREE.Mesh(new THREE.BoxGeometry(42.4, 2.2, 0.68), darkWood);
  frontFascia.position.set(0, 2.15, 17.08);
  group.add(frontFascia);
  for (const side of [-1, 1]) {
    const sideFascia = new THREE.Mesh(new THREE.BoxGeometry(0.68, 2.2, 32.4), darkWood);
    sideFascia.position.set(side * 22.08, 2.15, 0);
    group.add(sideFascia);
  }

  const platterBase = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.6, 1.8, 32), metal);
  platterBase.position.set(-6.2, 4.25, -1.2);
  group.add(platterBase);
  const platterMat = new THREE.Mesh(new THREE.CylinderGeometry(12.25, 12.25, 0.32, 48), rubber);
  platterMat.position.set(-6.2, 5.28, -1.2);
  group.add(platterMat);

  const recordDisc = new THREE.Group();
  recordDisc.position.set(-6.2, 5.82, -1.2);
  const record = new THREE.Mesh(new THREE.CylinderGeometry(11.16, 11.16, 0.34, 48), vinyl);
  const recordLabel = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.06, 0.22, 24), label);
  recordLabel.position.y = 0.22;
  recordDisc.add(record, recordLabel);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.72, 12), metal);
  spindle.position.y = 0.48;
  recordDisc.add(spindle);
  for (let index = 0; index < 8; index += 1) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(4.1 + index * 0.9, 0.032, 4, 72), grooveMaterial);
    groove.rotation.x = Math.PI * 0.5;
    groove.position.y = 0.205;
    recordDisc.add(groove);
  }
  group.add(recordDisc);

  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.5, 2.9, 16), metal);
  armBase.position.set(12.8, 5.35, 5.7);
  group.add(armBase);
  const armPivot = new THREE.Mesh(new THREE.SphereGeometry(1.12, 18, 12), darkMetal);
  armPivot.position.set(12.8, 7, 5.7);
  group.add(armPivot);
  const addTonearmSegment = (start, end, radius) => {
    const direction = end.clone().sub(start);
    const segment = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(0.05, direction.length() - radius * 2), 5, 12),
      metal,
    );
    segment.position.copy(start).add(end).multiplyScalar(0.5);
    segment.quaternion.setFromUnitVectors(WORLD_UP, direction.normalize());
    group.add(segment);
  };
  const armStart = new THREE.Vector3(12.5, 7.3, 5.45);
  const armBend = new THREE.Vector3(5.2, 7.55, 4.3);
  const armEnd = new THREE.Vector3(-3.8, 6.85, 2.15);
  addTonearmSegment(armStart, armBend, 0.22);
  addTonearmSegment(armBend, armEnd, 0.18);
  const counterweight = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.3, 18), darkMetal);
  counterweight.position.set(14.25, 7.2, 5.92);
  counterweight.rotation.z = Math.PI * 0.5;
  group.add(counterweight);
  const cartridge = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.52, 0.86), darkMetal);
  cartridge.position.copy(armEnd).add(new THREE.Vector3(-0.42, -0.3, -0.08));
  cartridge.rotation.y = -0.24;
  group.add(cartridge);
  const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 0.72, 8), metal);
  stylus.position.copy(cartridge.position).add(new THREE.Vector3(-0.2, -0.55, 0));
  group.add(stylus);

  for (let index = 0; index < 3; index += 1) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.64, 24), darkMetal);
    knob.position.set(8.4 + index * 2.5, 5.1, -9.8);
    group.add(knob);
  }
  for (const x of [-18, 18]) {
    for (const z of [-13, 13]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.8, 16), rubber);
      foot.position.set(x, -0.35, z);
      group.add(foot);
    }
  }
  group.userData.recordDisc = recordDisc;
  group.userData.playing = true;
  return group;
}

function createCompass(realism) {
  const group = new THREE.Group();
  const rotor = new THREE.Group();
  const brass = createMaterial(0x8a6336, realism, {
    roughness: 0.28,
    metalness: 0.78,
  });
  const brassEdge = createMaterial(0xc59b5d, realism, {
    roughness: 0.2,
    metalness: 0.88,
  });
  const dial = createMaterial(0xe8dfc5, realism, { roughness: 0.82 });
  const redNeedle = createMaterial(0xb63b32, realism, {
    roughness: 0.36,
    metalness: 0.35,
  });
  const whiteNeedle = createMaterial(0xf2f0e8, realism, { roughness: 0.45 });
  const darkMetal = createMaterial(0x1d252b, realism, {
    roughness: 0.3,
    metalness: 0.7,
  });

  // A real field compass: heavy case, bezel, printed dial and a balanced
  // two-colour needle under a slightly tinted glass cover.
  const caseBottom = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.55, 1.25, 64), brass);
  caseBottom.position.y = 0.1;
  group.add(caseBottom);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.34, 14, 64), brassEdge);
  bezel.position.y = 0.78;
  group.add(bezel);
  const dialFace = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 0.16, 64), dial);
  dialFace.position.y = 0.73;
  group.add(dialFace);

  const tickGroup = new THREE.Group();
  for (let index = 0; index < 16; index += 1) {
    const major = index % 4 === 0;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(major ? 0.18 : 0.1, 0.08, major ? 0.78 : 0.45),
      darkMetal,
    );
    const angle = (index / 16) * Math.PI * 2;
    tick.position.set(Math.sin(angle) * 3.65, 0.88, Math.cos(angle) * 3.65);
    tick.rotation.y = angle;
    tickGroup.add(tick);
  }
  group.add(tickGroup);

  const north = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 3.95), redNeedle);
  north.position.z = 1.82;
  const south = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 3.95), whiteNeedle);
  south.position.z = -1.82;
  rotor.position.y = 0.99;
  rotor.add(north, south);
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), brassEdge);
  pivot.position.y = 1.08;
  group.add(rotor, pivot);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(4.62, 4.62, 0.08, 64), new THREE.MeshPhysicalMaterial({
    color: 0xb7d8dc,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.35,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }));
  glass.position.y = 1.25;
  glass.renderOrder = 2;
  group.add(glass);
  group.userData.rotor = rotor;
  group.userData.targetWorld = null;
  return group;
}

function createSphere(radius, color, realism, type) {
  const geometry = new THREE.SphereGeometry(radius, 32, 22);
  if (type === "black") {
    const blackSphere = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false,
      fog: false,
    }));
    blackSphere.castShadow = false;
    blackSphere.receiveShadow = false;
    blackSphere.userData.noShadow = true;
    return blackSphere;
  }
  if (type === "white") {
    const group = new THREE.Group();
    const core = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      fog: false,
    }));
    core.castShadow = false;
    core.receiveShadow = false;
    core.userData.noShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createRadialGlowTexture(),
      color: 0xe5faff,
      transparent: true,
      opacity: realism ? 0.72 : 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      fog: false,
    }));
    glow.scale.setScalar(radius * 4.2);
    glow.renderOrder = 3;
    const light = new THREE.PointLight(
      0xd9f7ff,
      realism ? 3900 : 35,
      radius * 7.5,
      1.65,
    );
    light.castShadow = false;
    group.add(core, glow, light);
    group.userData.light = light;
    group.userData.glow = glow;
    group.userData.noShadow = true;
    return group;
  }
  const material = realism
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 })
    : new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  return new THREE.Mesh(geometry, material);
}

function createRadialGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,0.96)");
  gradient.addColorStop(0.22, "rgba(225,248,255,0.54)");
  gradient.addColorStop(0.58, "rgba(160,224,255,0.16)");
  gradient.addColorStop(1, "rgba(120,200,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSanctuary(realism) {
  const beamLength = 4200;
  const group = new THREE.Group();
  const launcher = new THREE.Group();
  launcher.rotation.x = Math.PI * 0.41;
  group.add(launcher);
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
  launcher.add(base, ring, core, cap);

  const halos = [];
  for (let index = 0; index < 8; index += 1) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(12 + index * 4.2, 0.24, 4, 28), index % 2 ? warm : cyan);
    halo.rotation.x = Math.PI * 0.5;
    halo.position.y = 16 + index * 7;
    halo.userData.spin = (index % 2 ? -1 : 1) * (0.12 + index * 0.025);
    halos.push(halo);
    launcher.add(halo);
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
  launcher.add(towers, glows);

  const beamGroup = new THREE.Group();
  beamGroup.position.y = 0.6;
  beamGroup.scale.y = 0.0001;
  beamGroup.visible = false;
  const beamCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xd9ffff,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const beamGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x54e6f4,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.82, beamLength, 12), beamCoreMaterial);
  const beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.15, beamLength, 12), beamGlowMaterial);
  beamCore.position.y = beamLength * 0.5;
  beamGlow.position.y = beamLength * 0.5;
  beamCore.renderOrder = 4;
  beamGlow.renderOrder = 3;
  beamGroup.add(beamGlow, beamCore);
  launcher.add(beamGroup);
  group.userData.halos = halos;
  group.userData.beamGroup = beamGroup;
  group.userData.activationTarget = 0;
  group.userData.activation = 0;
  group.userData.beamLength = beamLength;
  return group;
}

function createNightBeacons(night, axisA, axisB, getSurfaceRadius) {
  const group = new THREE.Group();
  const count = 12;
  const litCount = 6;
  const bodyGeometry = new THREE.BoxGeometry(1.15, 1.15, 2.8);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c0e12,
    emissive: 0x3d2415,
    emissiveIntensity: 0.22,
    roughness: 0.58,
    metalness: 0.38,
  });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdfaa,
    emissive: 0xffa64d,
    emissiveIntensity: 3.2,
    roughness: 0.18,
    metalness: 0.05,
  });
  const lenses = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.58, 12, 8),
    lensMaterial,
    count,
  );
  const direction = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const crossTangent = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const beamDirection = new THREE.Vector3();
  const bodyQuaternion = new THREE.Quaternion();
  const bodyAxis = new THREE.Vector3(0, 0, 1);
  const spotlights = [];
  const baseIntensities = [];
  let previewDirection = null;
  let seed = 82731;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  const palette = [0xffd29a, 0xff986e, 0xa7d6ff, 0xffe8c2];

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const spread = 0.08 + random() * 0.34;
    tangent.copy(axisA).multiplyScalar(Math.cos(angle)).addScaledVector(axisB, Math.sin(angle));
    direction.copy(night).multiplyScalar(Math.cos(spread))
      .addScaledVector(tangent, Math.sin(spread))
      .normalize();
    crossTangent.crossVectors(direction, tangent).normalize();
    const illuminated = index % 2 === 0;
    const airborne = illuminated || index % 5 === 0;
    const altitude = airborne ? 9 + random() * 17 : 1.2 + random() * 3.2;
    origin.copy(direction).multiplyScalar(getSurfaceRadius(direction) + altitude);
    if (illuminated && !previewDirection) previewDirection = direction.clone();
    const radialBias = illuminated
      ? -(0.52 + random() * 0.28)
      : -(0.08 + random() * 0.5);
    beamDirection.copy(tangent).multiplyScalar((random() - 0.5) * 1.5)
      .addScaledVector(crossTangent, (random() - 0.5) * 1.25)
      .addScaledVector(direction, radialBias)
      .normalize();

    bodyQuaternion.setFromUnitVectors(bodyAxis, beamDirection);
    dummy.position.copy(origin);
    dummy.quaternion.copy(bodyQuaternion);
    dummy.scale.setScalar(0.72 + random() * 0.52);
    dummy.updateMatrix();
    bodies.setMatrixAt(index, dummy.matrix);

    dummy.position.copy(origin).addScaledVector(beamDirection, 1.48);
    dummy.quaternion.copy(bodyQuaternion);
    dummy.scale.setScalar(0.82 + random() * 0.28);
    dummy.updateMatrix();
    lenses.setMatrixAt(index, dummy.matrix);

    if (illuminated && spotlights.length < litCount) {
      const color = palette[index % palette.length];
      const intensity = 2200 + random() * 2100;
      const spotlight = new THREE.SpotLight(
        color,
        intensity,
        76,
        0.29 + random() * 0.12,
        0.86,
        2,
      );
      spotlight.position.copy(origin).addScaledVector(beamDirection, 1.45);
      spotlight.castShadow = false;
      spotlight.target.position.copy(origin).addScaledVector(beamDirection, 38);
      group.add(spotlight, spotlight.target);
      spotlights.push(spotlight);
      baseIntensities.push(intensity);
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  lenses.instanceMatrix.needsUpdate = true;
  group.add(bodies, lenses);
  group.userData.spotlights = spotlights;
  group.userData.baseIntensities = baseIntensities;
  group.userData.previewDirection = previewDirection;
  return group;
}

function createBlackBox(realism) {
  const group = new THREE.Group();
  const shell = createMaterial(0x050505, realism, {
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x183448,
    emissiveIntensity: 0,
  });
  const core = createMaterial(0x000000, realism, {
    roughness: 0.85,
    emissive: 0x07131d,
    emissiveIntensity: 0,
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialGlowTexture(),
    color: 0xc7f7ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  }));
  glow.scale.setScalar(12);
  glow.renderOrder = 4;
  const beaconLight = new THREE.PointLight(
    0xbdefff,
    0,
    34,
    1.8,
  );
  beaconLight.castShadow = false;
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.9), shell),
    new THREE.Mesh(new THREE.BoxGeometry(1.46, 1.46, 1.46), core),
    glow,
    beaconLight,
  );
  group.userData.grounded = false;
  group.userData.opened = false;
  group.userData.beacon = 0;
  group.userData.shellMaterial = shell;
  group.userData.coreMaterial = core;
  group.userData.glow = glow;
  group.userData.beaconLight = beaconLight;
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

  const book = createBook(realism);
  const bookForward = sun.clone().addScaledVector(bookDirection, -sun.dot(bookDirection)).normalize();
  placeOnSphere(book, bookDirection, bookForward, 0.04, getSurfaceRadius, 0.06);
  root.add(book);
  const bookReady = bookModelUrl ? loadBookModel(book, bookModelUrl, castShadow) : null;

  const blackSphere = createSphere(18, 0x000000, realism, "black");
  const blackForward = compassDirection.clone().addScaledVector(sun, -compassDirection.dot(sun)).normalize();
  placeOnSphere(blackSphere, sun, blackForward, 40, getSurfaceRadius);
  root.add(blackSphere);

  const whiteSphere = createSphere(18, 0xffffff, realism, "white");
  placeOnSphere(whiteSphere, night, nightAxisA, 40, getSurfaceRadius);
  root.add(whiteSphere);

  const compass = createCompass(realism);
  compass.scale.setScalar(2.8);
  const compassForward = sun.clone().addScaledVector(compassDirection, -sun.dot(compassDirection)).normalize();
  placeOnSphere(compass, compassDirection, compassForward, 24, getSurfaceRadius);
  root.add(compass);

  const sanctuary = createSanctuary(realism);
  placeOnSphere(sanctuary, sanctuaryDirection, nightAxisA, 0.9, getSurfaceRadius, 0.24);
  root.add(sanctuary);

  const blackBox = createBlackBox(realism);
  root.add(blackBox);
  let blackBoxAngle = 2.15;
  let blackBoxFlightRadius = 0;
  const blackBoxDirection = new THREE.Vector3();
  const blackBoxForward = new THREE.Vector3();
  const blackBoxLookaheadDirection = new THREE.Vector3();
  const blackBoxRadiusDirection = new THREE.Vector3();
  const blackBoxSimulationDirection = new THREE.Vector3();
  const compassLocalTarget = new THREE.Vector3();
  const beamWorldQuaternion = new THREE.Quaternion();
  const beamLocalAxis = new THREE.Vector3(0, 1, 0);

  function getBlackBoxDirectionAtAngle(angle, target) {
    return target.copy(sun).multiplyScalar(Math.cos(angle))
      .addScaledVector(nightAxisA, Math.sin(angle))
      .normalize();
  }

  function getBlackBoxSafeFlightRadius(angle) {
    getBlackBoxDirectionAtAngle(angle, blackBoxRadiusDirection);
    let safeFlightRadius = getSurfaceRadius(blackBoxRadiusDirection) + BLACK_BOX_FLIGHT_ALTITUDE;
    for (let index = 1; index <= BLACK_BOX_TERRAIN_LOOKAHEAD_SAMPLES; index += 1) {
      const lookaheadRatio = index / BLACK_BOX_TERRAIN_LOOKAHEAD_SAMPLES;
      const lookaheadAngle = angle
        + BLACK_BOX_ORBIT_ANGULAR_SPEED
          * BLACK_BOX_TERRAIN_LOOKAHEAD_SECONDS
          * lookaheadRatio;
      getBlackBoxDirectionAtAngle(lookaheadAngle, blackBoxLookaheadDirection);
      safeFlightRadius = Math.max(
        safeFlightRadius,
        getSurfaceRadius(blackBoxLookaheadDirection) + BLACK_BOX_FLIGHT_ALTITUDE,
      );
    }
    return safeFlightRadius;
  }

  function predictBlackBoxFlightRadius(seconds) {
    let simulationAngle = blackBoxAngle;
    let simulationRadius = blackBoxFlightRadius > 0
      ? blackBoxFlightRadius
      : getBlackBoxSafeFlightRadius(simulationAngle);
    let remaining = Math.max(0, seconds);
    while (remaining > 0.0001) {
      const step = Math.min(1 / 30, remaining);
      simulationAngle += step * BLACK_BOX_ORBIT_ANGULAR_SPEED;
      const safeRadius = getBlackBoxSafeFlightRadius(simulationAngle);
      simulationRadius = THREE.MathUtils.damp(
        simulationRadius,
        safeRadius,
        safeRadius > simulationRadius
          ? BLACK_BOX_ASCENT_RESPONSE
          : BLACK_BOX_DESCENT_RESPONSE,
        step,
      );
      getBlackBoxDirectionAtAngle(simulationAngle, blackBoxSimulationDirection);
      simulationRadius = Math.max(
        simulationRadius,
        getSurfaceRadius(blackBoxSimulationDirection) + BLACK_BOX_FLIGHT_ALTITUDE,
      );
      remaining -= step;
    }
    return simulationRadius;
  }

  scene.add(root);
  return {
    root,
    ready: bookReady,
    compassDirection,
    objects: {
      recordPlayer,
      book,
      blackSphere,
      whiteSphere,
      compass,
      sanctuary,
      blackBox,
    },
    directions: {
      day: sun,
      night,
      dusk: compassDirection,
      recordPlayer: dayObjectDirection,
      book: bookDirection,
      sanctuary: sanctuaryDirection,
    },
    getSanctuaryBeamRay(origin, direction) {
      sanctuary.userData.beamGroup.updateWorldMatrix(true, false);
      sanctuary.userData.beamGroup.getWorldPosition(origin);
      sanctuary.userData.beamGroup.getWorldQuaternion(beamWorldQuaternion);
      direction.copy(beamLocalAxis).applyQuaternion(beamWorldQuaternion).normalize();
      return sanctuary.userData.beamLength;
    },
    isBlackBoxMoving() {
      return !blackBox.userData.grounded;
    },
    predictBlackBoxDirection(seconds, target = new THREE.Vector3()) {
      const angle = blackBoxAngle + Math.max(0, seconds) * BLACK_BOX_ORBIT_ANGULAR_SPEED;
      return getBlackBoxDirectionAtAngle(angle, target);
    },
    predictBlackBoxPosition(seconds, target = new THREE.Vector3()) {
      const angle = blackBoxAngle + Math.max(0, seconds) * BLACK_BOX_ORBIT_ANGULAR_SPEED;
      return getBlackBoxDirectionAtAngle(angle, target)
        .multiplyScalar(predictBlackBoxFlightRadius(seconds));
    },
    predictBlackBoxDayIntercept(minimumSeconds, target = new THREE.Vector3()) {
      const minimumAngle = blackBoxAngle
        + Math.max(0, minimumSeconds) * BLACK_BOX_ORBIT_ANGULAR_SPEED;
      const turns = Math.max(
        0,
        Math.ceil((minimumAngle - BLACK_BOX_DAY_AMBUSH_ANGLE) / (Math.PI * 2)),
      );
      const interceptAngle = BLACK_BOX_DAY_AMBUSH_ANGLE + turns * Math.PI * 2;
      const seconds = Math.max(
        0,
        (interceptAngle - blackBoxAngle) / BLACK_BOX_ORBIT_ANGULAR_SPEED,
      );
      getBlackBoxDirectionAtAngle(interceptAngle, target)
        .multiplyScalar(predictBlackBoxFlightRadius(seconds));
      return seconds;
    },
    update(delta) {
      if (recordPlayer.userData.playing) {
        recordPlayer.userData.recordDisc.rotation.y += delta * 1.55;
      }

      const compassTarget = compass.userData.targetWorld;
      if (compassTarget) {
        compassLocalTarget.copy(compassTarget);
        compass.worldToLocal(compassLocalTarget);
        compassLocalTarget.y = 0;
        if (compassLocalTarget.lengthSq() > 0.0001) {
          const targetAngle = Math.atan2(compassLocalTarget.x, compassLocalTarget.z);
          const currentAngle = compass.userData.rotor.rotation.y;
          const angleDelta = Math.atan2(
            Math.sin(targetAngle - currentAngle),
            Math.cos(targetAngle - currentAngle),
          );
          compass.userData.rotor.rotation.y += angleDelta * (1 - Math.exp(-6.8 * delta));
        }
      } else {
        compass.userData.rotor.rotation.y += delta * 0.42;
      }

      sanctuary.userData.activation = THREE.MathUtils.damp(
        sanctuary.userData.activation,
        sanctuary.userData.activationTarget,
        sanctuary.userData.activationTarget > sanctuary.userData.activation ? 1.9 : 5,
        delta,
      );
      const activation = sanctuary.userData.activation;
      sanctuary.userData.beamGroup.visible = activation > 0.003;
      sanctuary.userData.beamGroup.scale.y = Math.max(0.0001, activation);
      for (const halo of sanctuary.userData.halos) {
        halo.rotation.z += delta * halo.userData.spin * (1 + activation * 7);
      }
      const whitePulse = 0.92 + Math.sin(performance.now() * 0.0018) * 0.08;
      whiteSphere.userData.light.intensity = (realism ? 3900 : 35) * whitePulse;
      whiteSphere.userData.glow.material.opacity = (realism ? 0.72 : 0.5) * whitePulse;
      blackBoxAngle += delta * BLACK_BOX_ORBIT_ANGULAR_SPEED;

      blackBox.userData.beacon = THREE.MathUtils.damp(
        blackBox.userData.beacon,
        activation > 0.03 ? 1 : 0,
        activation > blackBox.userData.beacon ? 2.8 : 5.5,
        delta,
      );
      const beaconPulse = 0.86 + Math.sin(performance.now() * 0.0042) * 0.14;
      const beacon = blackBox.userData.beacon;
      blackBox.userData.glow.visible = beacon > 0.002;
      blackBox.userData.glow.material.opacity = beacon * beaconPulse * 0.76;
      blackBox.userData.beaconLight.intensity = beacon * beaconPulse * (realism ? 1450 : 26);
      blackBox.userData.shellMaterial.emissiveIntensity = beacon * beaconPulse * 4.8;
      blackBox.userData.coreMaterial.emissiveIntensity = beacon * beaconPulse * 1.65;

      if (!blackBox.userData.grounded) {
        getBlackBoxDirectionAtAngle(blackBoxAngle, blackBoxDirection);
        blackBoxForward.copy(sun).multiplyScalar(-Math.sin(blackBoxAngle))
          .addScaledVector(nightAxisA, Math.cos(blackBoxAngle))
          .normalize();

        // Look well ahead along the orbit and begin gaining height before a
        // mountain reaches the box.  The slower descent response prevents the
        // opposite edge of a peak from producing a matching downward snap.
        const currentSurfaceRadius = getSurfaceRadius(blackBoxDirection);
        const safeFlightRadius = getBlackBoxSafeFlightRadius(blackBoxAngle);
        if (blackBoxFlightRadius <= 0) blackBoxFlightRadius = safeFlightRadius;
        blackBoxFlightRadius = THREE.MathUtils.damp(
          blackBoxFlightRadius,
          safeFlightRadius,
          safeFlightRadius > blackBoxFlightRadius
            ? BLACK_BOX_ASCENT_RESPONSE
            : BLACK_BOX_DESCENT_RESPONSE,
          delta,
        );
        blackBoxFlightRadius = Math.max(
          blackBoxFlightRadius,
          currentSurfaceRadius + BLACK_BOX_FLIGHT_ALTITUDE,
        );
        placeOnSphere(
          blackBox,
          blackBoxDirection,
          blackBoxForward,
          BLACK_BOX_FLIGHT_ALTITUDE,
          getSurfaceRadius,
          Math.PI * 0.2,
        );
        blackBox.position.copy(blackBoxDirection).multiplyScalar(blackBoxFlightRadius);
        blackBox.userData.flightAltitude = blackBoxFlightRadius - currentSurfaceRadius;
        blackBox.userData.flightTargetAltitude = safeFlightRadius - currentSurfaceRadius;
      }
    },
  };
}
