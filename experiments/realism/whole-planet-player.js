import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const RIGHT_AXIS = new THREE.Vector3(1, 0, 0);
const poseBonePosition = new THREE.Vector3();
const poseChildPosition = new THREE.Vector3();
const poseDirection = new THREE.Vector3();
const poseTarget = new THREE.Vector3();
const poseDelta = new THREE.Quaternion();
const poseWorldQuaternion = new THREE.Quaternion();
const poseParentQuaternion = new THREE.Quaternion();
const poseFrameQuaternion = new THREE.Quaternion();
const waistMeasureA = new THREE.Vector3();
const waistMeasureB = new THREE.Vector3();
const headMeasure = new THREE.Vector3();
const CESIUM_MAN_TYPE_C = Object.freeze({
  // R comparison preset: relaxed chest with a fuller torso.
  chestWidth: 1.30,
  chestDepth: 1.12,
  midWidth: 1.21,
  waistWidth: 1.18,
});

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
    arm.position.y = -0.408;
    arm.rotation.z = side * -0.13;
    arm.scale.y = 1.44;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), skinMaterial);
    hand.position.set(side * 0.08, -1.037, 0);
    root.add(arm, hand);
  }

  const legRoots = [];
  for (const side of [-1, 1]) {
    const legRoot = new THREE.Group();
    legRoot.position.set(side * 0.17, -0.42, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.66, 4, 8), trousersMaterial);
    leg.position.y = -0.39;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.43), trousersMaterial);
    shoe.position.set(0, -0.82, 0.1);
    legRoot.add(leg, shoe);
    visual.add(legRoot);
    legRoots.push(legRoot);
  }

  // The fallback uses the same head-first horizontal silhouette as the GLB.
  visual.rotation.x = Math.PI * 0.5;
  armLeftRoot.rotation.z = -Math.PI * 0.5;
  armRightRoot.rotation.z = Math.PI * 0.5;

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
  shadow.visible = false;

  scene.add(player);
  const rig = {
    player,
    shadow,
    proceduralVisual: visual,
    modelVisual: null,
    mixer: null,
    ready: null,
    armLeftRoot,
    armRightRoot,
    legRoots,
    bobPhase: 1.7,
    basis: new THREE.Matrix4(),
    quaternion: new THREE.Quaternion(),
    rollQuaternion: new THREE.Quaternion(),
    right: new THREE.Vector3(),
    correctedUp: new THREE.Vector3(),
    visualForward: new THREE.Vector3(),
    shadowDirection: new THREE.Vector3(),
    // The procedural figure's pelvis sits slightly behind its local origin.
    waistLocal: new THREE.Vector3(0, 0, -0.22),
    headLocal: new THREE.Vector3(0, -0.015, 1.13),
    pivotLocal: new THREE.Vector3(),
    pivotOffset: new THREE.Vector3(),
  };

  if (options.modelUrl) {
    rig.ready = loadPlayerModel(
      rig,
      options.modelUrl,
      options.castShadow === true,
      options.bodyProfile,
    );
  }
  return rig;
}

function loadPlayerModel(rig, modelUrl, castShadow, bodyProfile) {
  const loader = new GLTFLoader();
  return loader.loadAsync(modelUrl).then((gltf) => {
    const imported = gltf.scene;
    const modelVisual = new THREE.Group();
    modelVisual.rotation.x = Math.PI * 0.5;
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

    extendImportedArms(imported, 1.44);
    poseSuperman(imported, rig.player);
    if (bodyProfile === "cesium-type-c") {
      const activeVertexCount = applyCesiumManTypeCBody(imported);
      modelVisual.userData.bodyProfile = "cesium-type-c";
      modelVisual.userData.bodyProfileVertices = activeVertexCount;
    }
    measureImportedAnchors(imported, rig);
    rig.modelVisual = modelVisual;
    disposeVisual(rig.proceduralVisual);
  }).catch((error) => {
    console.warn("Realism human GLB could not be loaded; using the lightweight human.", error);
    throw error;
  });
}

// This is the approved Type C body profile from the comparison page.  It is
// applied only to a cloned runtime geometry: cesium-man.glb itself remains
// intact for attribution, future comparison, and fallback use.
function applyCesiumManTypeCBody(imported) {
  let skinnedMesh = null;
  imported.traverse((object) => {
    if (!skinnedMesh && object.isSkinnedMesh && object.geometry?.attributes?.position) {
      skinnedMesh = object;
    }
  });
  if (!skinnedMesh) return 0;

  skinnedMesh.geometry = skinnedMesh.geometry.clone();
  const geometry = skinnedMesh.geometry;
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  if (!skinIndex || !skinWeight) return 0;

  const basePositions = new Float32Array(position.array);
  const masks = new Float32Array(position.count);
  let centerDepthWeighted = 0;
  let centerWeight = 0;
  let activeVertexCount = 0;

  for (let index = 0; index < position.count; index += 1) {
    let torsoWeight = 0;
    let otherWeight = 0;
    const joints = [skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index)];
    const weights = [skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index)];
    for (let influence = 0; influence < 4; influence += 1) {
      if (joints[influence] <= 2) torsoWeight += weights[influence];
      else otherWeight += weights[influence];
    }
    const z = basePositions[index * 3 + 2];
    const anatomyWeight = smoothstep(0.025, 0.5, torsoWeight) * (1 - otherWeight * 0.18);
    const lowerFade = smoothstep(0.62, 0.75, z);
    const upperFade = 1 - smoothstep(1.1, 1.18, z);
    const mask = anatomyWeight * lowerFade * upperFade;
    masks[index] = mask;
    if (mask > 0.03) {
      activeVertexCount += 1;
      const centerSampleWeight = mask * smoothstep(0.69, 0.79, z) * (1 - smoothstep(1.17, 1.29, z));
      centerDepthWeighted += basePositions[index * 3] * centerSampleWeight;
      centerWeight += centerSampleWeight;
    }
  }

  const depthCenter = centerWeight > 0 ? centerDepthWeighted / centerWeight : 0.02;
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3;
    const x = basePositions[offset];
    const y = basePositions[offset + 1];
    const z = basePositions[offset + 2];
    const mask = masks[index];
    const compensatedMidWidth = 1 + (CESIUM_MAN_TYPE_C.midWidth - 1) * 1.15;
    const targetWidth = z < 0.94
      ? THREE.MathUtils.lerp(CESIUM_MAN_TYPE_C.waistWidth, compensatedMidWidth, smoothstep(0.78, 0.94, z))
      : THREE.MathUtils.lerp(
        compensatedMidWidth,
        1 + (CESIUM_MAN_TYPE_C.chestWidth - 1) * 3.1,
        smoothstep(0.94, 1.05, z),
      );
    const lowerDepth = 1 + (CESIUM_MAN_TYPE_C.waistWidth - 1) * 0.32;
    const targetDepth = THREE.MathUtils.lerp(
      lowerDepth,
      1 + (CESIUM_MAN_TYPE_C.chestDepth - 1) * 1.02,
      smoothstep(0.78, 1.05, z),
    );
    const widthScale = 1 + (targetWidth - 1) * mask;
    const depthScale = 1 + (targetDepth - 1) * mask;
    position.setXYZ(index, depthCenter + (x - depthCenter) * depthScale, y * widthScale, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  skinnedMesh.updateMatrixWorld(true);
  return activeVertexCount;
}

function smoothstep(minimum, maximum, value) {
  const t = THREE.MathUtils.clamp((value - minimum) / Math.max(maximum - minimum, 0.00001), 0, 1);
  return t * t * (3 - 2 * t);
}

function measureImportedAnchors(imported, rig) {
  const rightHip = imported.getObjectByName("leg_joint_R_1");
  const leftHip = imported.getObjectByName("leg_joint_L_1");
  rig.player.updateWorldMatrix(true, false);
  if (rightHip && leftHip) {
    rightHip.getWorldPosition(waistMeasureA);
    leftHip.getWorldPosition(waistMeasureB);
    waistMeasureA.add(waistMeasureB).multiplyScalar(0.5);
    rig.waistLocal.copy(rig.player.worldToLocal(waistMeasureA));
  }
  const headAnchor = imported.getObjectByName("Skeleton_neck_joint_2");
  if (headAnchor) {
    headAnchor.getWorldPosition(headMeasure);
    rig.headLocal.copy(rig.player.worldToLocal(headMeasure))
      .addScaledVector(FORWARD_AXIS, 0.14);
  }
}

function extendImportedArms(imported, factor) {
  const movableArmBones = [
    "Skeleton_arm_joint_R__2_",
    "Skeleton_arm_joint_R__3_",
    "Skeleton_arm_joint_L__3_",
    "Skeleton_arm_joint_L__2_",
  ];
  for (const boneName of movableArmBones) {
    const bone = imported.getObjectByName(boneName);
    if (bone) bone.position.multiplyScalar(factor);
  }
  imported.updateWorldMatrix(true, true);
}

function poseSuperman(imported, targetFrame) {
  imported.updateWorldMatrix(true, true);
  poseBoneToward(imported, "Skeleton_torso_joint_1", "Skeleton_torso_joint_2", [0, 0, 1], targetFrame);
  poseBoneToward(imported, "Skeleton_torso_joint_2", "torso_joint_3", [0, 0, 1], targetFrame);
  poseBoneToward(imported, "torso_joint_3", "Skeleton_neck_joint_1", [0, 0, 1], targetFrame);
  poseBoneToward(imported, "Skeleton_neck_joint_1", "Skeleton_neck_joint_2", [0, 0, 1], targetFrame);
  poseBoneToward(imported, "Skeleton_arm_joint_R", "Skeleton_arm_joint_R__2_", [1, 0, 0], targetFrame);
  poseBoneToward(imported, "Skeleton_arm_joint_R__2_", "Skeleton_arm_joint_R__3_", [1, 0, 0], targetFrame);
  poseBoneToward(imported, "Skeleton_arm_joint_L__4_", "Skeleton_arm_joint_L__3_", [-1, 0, 0], targetFrame);
  poseBoneToward(imported, "Skeleton_arm_joint_L__3_", "Skeleton_arm_joint_L__2_", [-1, 0, 0], targetFrame);
  poseBoneToward(imported, "leg_joint_R_1", "leg_joint_R_2", [0, 0, -1], targetFrame);
  poseBoneToward(imported, "leg_joint_R_2", "leg_joint_R_3", [0, 0, -1], targetFrame);
  poseBoneToward(imported, "leg_joint_R_3", "leg_joint_R_5", [0, 0, -1], targetFrame);
  poseBoneToward(imported, "leg_joint_L_1", "leg_joint_L_2", [0, 0, -1], targetFrame);
  poseBoneToward(imported, "leg_joint_L_2", "leg_joint_L_3", [0, 0, -1], targetFrame);
  poseBoneToward(imported, "leg_joint_L_3", "leg_joint_L_5", [0, 0, -1], targetFrame);
}

function poseBoneToward(root, boneName, childName, target, targetFrame) {
  const bone = root.getObjectByName(boneName);
  const child = root.getObjectByName(childName);
  if (!bone || !child || !bone.parent) return;

  root.updateWorldMatrix(true, true);
  bone.getWorldPosition(poseBonePosition);
  child.getWorldPosition(poseChildPosition);
  poseDirection.copy(poseChildPosition).sub(poseBonePosition).normalize();
  targetFrame.getWorldQuaternion(poseFrameQuaternion);
  poseTarget.set(...target).normalize().applyQuaternion(poseFrameQuaternion);
  poseDelta.setFromUnitVectors(poseDirection, poseTarget);
  bone.getWorldQuaternion(poseWorldQuaternion);
  poseWorldQuaternion.premultiply(poseDelta);
  bone.parent.getWorldQuaternion(poseParentQuaternion).invert();
  bone.quaternion.copy(poseParentQuaternion.multiply(poseWorldQuaternion));
  root.updateWorldMatrix(true, true);
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
    descentPivot = 0,
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
  rig.player.quaternion.copy(rig.quaternion)
    .multiply(rig.rollQuaternion);

  rig.bobPhase += delta * 0.7;
  const bob = Math.sin(rig.bobPhase) * 0.16 + Math.sin(rig.bobPhase * 0.37 + 1.1) * 0.05;
  // On descent, keep the head at the flight point so the torso and legs float upward around it.
  const descentPivotMix = Math.max(
    THREE.MathUtils.clamp(descentPivot, 0, 1),
    THREE.MathUtils.smoothstep(-bodyPitch, 0.015, 0.28),
  );
  rig.pivotLocal.copy(rig.waistLocal).lerp(rig.headLocal, descentPivotMix);
  rig.pivotOffset.copy(rig.pivotLocal).applyQuaternion(rig.player.quaternion);
  rig.player.position.copy(position).addScaledVector(up, bob).sub(rig.pivotOffset);
  if (rig.mixer) rig.mixer.update(delta);

  rig.shadowDirection.copy(position).normalize();
  rig.shadow.position.copy(rig.shadowDirection).multiplyScalar(surfaceRadius + 0.06);
  rig.shadow.quaternion.setFromUnitVectors(FORWARD_AXIS, rig.shadowDirection);
  const shadowScale = THREE.MathUtils.clamp(1.1 - altitude * 0.16, 0.34, 1.08);
  rig.shadow.scale.set(shadowScale * 1.15, shadowScale * 0.8, 1);
  rig.shadow.material.opacity = THREE.MathUtils.clamp(0.24 - altitude * 0.055, 0.04, 0.2);
}
