import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

export function createFlightPlayer(scene, options = {}) {
  const player = new THREE.Group();
  const visual = new THREE.Group();
  player.add(visual);

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xb98265,
    roughness: 0.88,
    metalness: 0,
  });
  const coatMaterial = new THREE.MeshStandardMaterial({
    color: 0x26313b,
    roughness: 0.82,
    metalness: 0,
  });
  const trousersMaterial = new THREE.MeshStandardMaterial({
    color: 0x151a20,
    roughness: 0.86,
    metalness: 0,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 10), coatMaterial);
  torso.position.y = 0.34;
  torso.scale.set(0.92, 1, 0.58);
  visual.add(torso);

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), trousersMaterial);
  pelvis.position.y = -0.25;
  pelvis.scale.set(0.92, 0.62, 0.62);
  visual.add(pelvis);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.12, 4, 8), skinMaterial);
  neck.position.y = 0.86;
  visual.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skinMaterial);
  head.position.set(0, 1.13, 0.015);
  head.scale.set(0.82, 1.04, 0.9);
  visual.add(head);

  const armLeftRoot = new THREE.Group();
  const armRightRoot = new THREE.Group();
  armLeftRoot.position.set(-0.36, 0.63, 0);
  armRightRoot.position.set(0.36, 0.63, 0);
  visual.add(armLeftRoot, armRightRoot);
  for (const [root, side] of [[armLeftRoot, -1], [armRightRoot, 1]]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.58, 4, 8), coatMaterial);
    arm.position.y = -0.34;
    arm.rotation.z = side * -0.13;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), skinMaterial);
    hand.position.set(side * 0.08, -0.72, 0);
    root.add(arm, hand);
  }

  for (const side of [-1, 1]) {
    const legRoot = new THREE.Group();
    legRoot.position.set(side * 0.17, -0.42, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.66, 4, 8), trousersMaterial);
    leg.position.y = -0.39;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.43), trousersMaterial);
    shoe.position.set(0, -0.82, 0.1);
    legRoot.add(leg, shoe);
    visual.add(legRoot);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 18),
    new THREE.MeshBasicMaterial({
      color: 0x02050a,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  shadow.renderOrder = 2;

  scene.add(player, shadow);
  const rig = {
    player,
    shadow,
    proceduralVisual: visual,
    modelVisual: null,
    mixer: null,
    ready: null,
    armLeftRoot,
    armRightRoot,
    bobPhase: 1.7,
    basis: new THREE.Matrix4(),
    quaternion: new THREE.Quaternion(),
    rollQuaternion: new THREE.Quaternion(),
    right: new THREE.Vector3(),
    correctedUp: new THREE.Vector3(),
    visualForward: new THREE.Vector3(),
    shadowDirection: new THREE.Vector3(),
  };

  if (options.modelUrl) {
    rig.ready = loadPlayerModel(rig, options.modelUrl, options.castShadow === true);
  }
  return rig;
}

function loadPlayerModel(rig, modelUrl, castShadow) {
  const loader = new GLTFLoader();
  return loader.loadAsync(modelUrl).then((gltf) => {
    const imported = gltf.scene;
    const modelVisual = new THREE.Group();
    modelVisual.add(imported);
    rig.player.add(modelVisual);

    imported.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(imported);
    const size = bounds.getSize(new THREE.Vector3());
    imported.scale.setScalar(2.6 / Math.max(size.y, 0.001));
    imported.updateMatrixWorld(true);
    bounds.setFromObject(imported);
    const center = bounds.getCenter(new THREE.Vector3());
    imported.position.x -= center.x;
    imported.position.z -= center.z;
    imported.position.y -= bounds.min.y + 0.82;

    imported.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = castShadow;
      object.receiveShadow = false;
      if (object.material?.map) object.material.map.anisotropy = 8;
    });

    if (gltf.animations.length > 0) {
      rig.mixer = new THREE.AnimationMixer(imported);
      rig.mixer.clipAction(gltf.animations[0]).play();
    }
    rig.modelVisual = modelVisual;
    disposeVisual(rig.proceduralVisual);
  }).catch((error) => {
    console.warn("Realism human GLB could not be loaded; using the lightweight human.", error);
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

export function updateFlightPlayer(rig, state) {
  const {
    position,
    forward,
    up,
    bodyPitch,
    roll,
    turnInput,
    climbInput,
    altitude,
    surfaceRadius,
    delta,
  } = state;

  rig.right.crossVectors(up, forward).normalize();
  rig.visualForward.copy(forward).applyAxisAngle(rig.right, -bodyPitch).normalize();
  rig.correctedUp.crossVectors(rig.visualForward, rig.right).normalize();
  rig.basis.makeBasis(rig.right, rig.correctedUp, rig.visualForward);
  rig.quaternion.setFromRotationMatrix(rig.basis);
  rig.rollQuaternion.setFromAxisAngle(FORWARD_AXIS, roll);
  rig.player.quaternion.copy(rig.quaternion).multiply(rig.rollQuaternion);

  rig.bobPhase += delta * 0.7;
  const bob = Math.sin(rig.bobPhase) * 0.16 + Math.sin(rig.bobPhase * 0.37 + 1.1) * 0.05;
  rig.player.position.copy(position).addScaledVector(up, bob);
  if (rig.mixer) rig.mixer.update(delta);

  const armSwing = THREE.MathUtils.clamp(climbInput * 0.18 + turnInput * 0.08, -0.22, 0.22);
  rig.armLeftRoot.rotation.x = THREE.MathUtils.damp(
    rig.armLeftRoot.rotation.x,
    armSwing,
    4.4,
    delta,
  );
  rig.armRightRoot.rotation.x = THREE.MathUtils.damp(
    rig.armRightRoot.rotation.x,
    -armSwing,
    4.4,
    delta,
  );

  rig.shadowDirection.copy(position).normalize();
  rig.shadow.position.copy(rig.shadowDirection).multiplyScalar(surfaceRadius + 0.06);
  rig.shadow.quaternion.setFromUnitVectors(FORWARD_AXIS, rig.shadowDirection);
  const shadowScale = THREE.MathUtils.clamp(1.1 - altitude * 0.16, 0.34, 1.08);
  rig.shadow.scale.set(shadowScale * 1.15, shadowScale * 0.8, 1);
  rig.shadow.material.opacity = THREE.MathUtils.clamp(0.24 - altitude * 0.055, 0.04, 0.2);
}
