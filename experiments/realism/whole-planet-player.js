import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

export function createFlightPlayer(scene, options = {}) {
  const player = new THREE.Group();
  const visual = new THREE.Group();
  player.add(visual);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f7f5,
    roughness: 0.72,
    metalness: 0,
  });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9efee,
    roughness: 0.78,
    metalness: 0,
  });
  const beakMaterial = new THREE.MeshStandardMaterial({
    color: 0xd89b42,
    roughness: 0.7,
    metalness: 0,
  });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x101318 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.08, 8, 14), bodyMaterial);
  body.rotation.x = Math.PI * 0.5;
  body.scale.set(0.67, 0.6, 1.06);
  body.position.z = -0.03;
  visual.add(body);

  const back = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), bodyMaterial);
  back.scale.set(0.8, 0.48, 1.78);
  back.position.set(0, 0.06, -0.08);
  visual.add(back);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bodyMaterial);
  belly.scale.set(0.58, 0.34, 1.28);
  belly.position.set(0, -0.085, 0.05);
  visual.add(belly);

  const headRoot = new THREE.Group();
  headRoot.position.set(0, 0.05, 0.9);
  visual.add(headRoot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), bodyMaterial);
  head.scale.set(0.82, 0.66, 1.06);
  head.position.set(0, 0.02, 0.05);
  headRoot.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.38, 4), beakMaterial);
  beak.rotation.x = Math.PI * 0.5;
  beak.position.set(0, -0.02, 0.27);
  headRoot.add(beak);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyeMaterial);
  const rightEye = leftEye.clone();
  leftEye.position.set(-0.085, 0.03, 0.07);
  rightEye.position.set(0.085, 0.03, 0.07);
  headRoot.add(leftEye, rightEye);

  const wingLeftRoot = new THREE.Group();
  const wingRightRoot = new THREE.Group();
  wingLeftRoot.position.set(-0.18, 0.08, 0);
  wingRightRoot.position.set(0.18, 0.08, 0);
  visual.add(wingLeftRoot, wingRightRoot);

  const wingMainGeometry = new THREE.CapsuleGeometry(0.17, 0.58, 3, 6);
  wingMainGeometry.rotateZ(Math.PI * 0.5);
  const wingTipGeometry = new THREE.CapsuleGeometry(0.13, 0.42, 3, 6);
  wingTipGeometry.rotateZ(Math.PI * 0.5);

  const leftWing = new THREE.Mesh(wingMainGeometry, wingMaterial);
  const leftTip = new THREE.Mesh(wingTipGeometry, wingMaterial);
  leftWing.position.x = -0.32;
  leftWing.scale.set(0.7, 0.3, 0.62);
  leftTip.scale.set(0.7, 0.28, 0.52);
  leftTip.position.set(-0.69, -0.005, -0.03);
  leftTip.rotation.y = 0.06;
  wingLeftRoot.add(leftWing, leftTip);

  const rightWing = leftWing.clone();
  const rightTip = leftTip.clone();
  rightWing.position.x = 0.32;
  rightTip.position.set(0.69, -0.005, -0.03);
  rightTip.rotation.y = -0.06;
  wingRightRoot.add(rightWing, rightTip);

  const tailGeometry = new THREE.CapsuleGeometry(0.08, 0.86, 5, 8);
  tailGeometry.rotateX(Math.PI * 0.5);
  const leftTail = new THREE.Mesh(tailGeometry, wingMaterial);
  const rightTail = leftTail.clone();
  leftTail.scale.set(0.78, 0.34, 1);
  rightTail.scale.copy(leftTail.scale);
  leftTail.position.set(-0.12, -0.04, -1.28);
  rightTail.position.set(0.12, -0.04, -1.28);
  leftTail.rotation.y = -0.06;
  rightTail.rotation.y = 0.06;
  visual.add(leftTail, rightTail);

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
    wingLeftRoot,
    wingRightRoot,
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
    const largestDimension = Math.max(size.x, size.y, size.z, 0.001);
    imported.scale.setScalar(2.9 / largestDimension);
    imported.updateMatrixWorld(true);
    bounds.setFromObject(imported);
    imported.position.sub(bounds.getCenter(new THREE.Vector3()));

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
    console.warn("Realism seagull GLB could not be loaded; using the lightweight player.", error);
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

  const wingTarget = THREE.MathUtils.clamp(climbInput * 0.22 - Math.abs(turnInput) * 0.08, -0.24, 0.2);
  rig.wingLeftRoot.rotation.z = THREE.MathUtils.damp(
    rig.wingLeftRoot.rotation.z,
    -wingTarget,
    4.4,
    delta,
  );
  rig.wingRightRoot.rotation.z = THREE.MathUtils.damp(
    rig.wingRightRoot.rotation.z,
    wingTarget,
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
