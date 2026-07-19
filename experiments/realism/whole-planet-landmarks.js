import * as THREE from "../../three.module.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const basisMatrix = new THREE.Matrix4();
const basisRight = new THREE.Vector3();
const basisUp = new THREE.Vector3();
const placementUp = new THREE.Vector3();
const placementForward = new THREE.Vector3();
const dummy = new THREE.Object3D();

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
  if (!realism) return new THREE.MeshLambertMaterial({ color, flatShading: true, ...options });
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function createBook(realism) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 2.45;
  pivot.rotation.set(-0.22, 0.08, -0.68);
  group.add(pivot);
  const cover = createMaterial(0x442b37, realism, { roughness: 0.92 });
  const page = createMaterial(0xd8c7a5, realism, { roughness: 0.96 });
  const edge = createMaterial(0xb39d7a, realism, { roughness: 0.98 });

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
  return group;
}

function createRecordPlayer(realism) {
  const group = new THREE.Group();
  const wood = createMaterial(0x9a6c43, realism, { roughness: 0.8 });
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

export function createSpecialLandmarks({ scene, sunDirection, getSurfaceRadius, realism }) {
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

  const blackBox = createBlackBox(realism);
  root.add(blackBox);
  let blackBoxAngle = 2.15;
  const blackBoxDirection = new THREE.Vector3();
  const blackBoxForward = new THREE.Vector3();

  scene.add(root);
  return {
    root,
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
