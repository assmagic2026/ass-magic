import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const MODEL_URL = "./assets/models/cesium-man.glb";
const poseQuaternion = new THREE.Quaternion();
const poseEuler = new THREE.Euler();

const BONE_NAMES = [
  "Skeleton_torso_joint_1", "Skeleton_torso_joint_2", "torso_joint_3",
  "Skeleton_neck_joint_1", "Skeleton_neck_joint_2", "Skeleton_arm_joint_R",
  "Skeleton_arm_joint_R__2_", "Skeleton_arm_joint_L__4_", "Skeleton_arm_joint_L__3_",
  "leg_joint_R_1", "leg_joint_R_2", "leg_joint_R_3", "leg_joint_R_5",
  "leg_joint_L_1", "leg_joint_L_2", "leg_joint_L_3", "leg_joint_L_5",
];

const RIDE_POSE = Object.freeze({
  Skeleton_torso_joint_1: [0, 1, 0], Skeleton_torso_joint_2: [0, 24, 0], torso_joint_3: [1, 1, 0], Skeleton_neck_joint_2: [94, 3, 21],
  leg_joint_R_1: [18, -34, -20], leg_joint_R_2: [16, 36, -14], leg_joint_R_3: [-6, 0, -26], leg_joint_R_5: [0, -7, 0],
  leg_joint_L_1: [-10, -44, 31], leg_joint_L_2: [31, 52, 5], leg_joint_L_3: [10, -14, 10], leg_joint_L_5: [0, 2, 0],
});
const CROUCH_POSE = Object.freeze({
  Skeleton_torso_joint_1: [0, 16, 0], Skeleton_torso_joint_2: [0, 24, 0], torso_joint_3: [1, -12, 0], Skeleton_neck_joint_2: [94, 3, 21],
  leg_joint_R_1: [18, -65, -20], leg_joint_R_2: [16, 72, -14], leg_joint_R_3: [-6, 0, -26], leg_joint_R_5: [0, -21, 0],
  leg_joint_L_1: [-10, -72, 31], leg_joint_L_2: [31, 74, 5], leg_joint_L_3: [10, -14, 10], leg_joint_L_5: [0, -9, 0],
});
const RISE_POSE = Object.freeze({
  Skeleton_torso_joint_1: [0, -2, 0], Skeleton_torso_joint_2: [0, 17, 0], torso_joint_3: [1, -9, 0], Skeleton_neck_joint_2: [94, 3, 21],
  leg_joint_R_1: [49, -4, -9], leg_joint_R_2: [-2, -18, -4], leg_joint_R_3: [9, 57, -18], leg_joint_R_5: [0, -7, 0],
  leg_joint_L_1: [-54, -139, 37], leg_joint_L_2: [64, 118, 16], leg_joint_L_3: [-4, 54, 53], leg_joint_L_5: [0, 2, 0],
});
const FALL_POSE = Object.freeze({
  Skeleton_torso_joint_1: [0, 4, 0], Skeleton_torso_joint_2: [0, 36, 0], torso_joint_3: [0, -16, 0], Skeleton_neck_joint_2: [94, 3, 21],
  leg_joint_R_1: [15, -81, -39], leg_joint_R_2: [-2, 99, -18], leg_joint_R_3: [-19, 34, -68], leg_joint_R_5: [0, -7, -23],
  leg_joint_L_1: [-86, -104, 27], leg_joint_L_2: [91, 15, 31], leg_joint_L_3: [-4, 54, 53], leg_joint_L_5: [0, 2, 0],
});
const OFFSETS = Object.freeze({
  ride: { x: 0.16, y: -0.13, z: -0.25 },
  crouch: { x: 0.14, y: -0.28, z: -0.29 },
  rise: { x: 0.05, y: 0.18, z: -0.37 },
  fall: { x: 0.05, y: 0.44, z: -0.23 },
});

function disposeFallback(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
  root.removeFromParent();
}

function extendImportedArms(imported, factor) {
  for (const boneName of [
    "Skeleton_arm_joint_R__2_", "Skeleton_arm_joint_R__3_",
    "Skeleton_arm_joint_L__3_", "Skeleton_arm_joint_L__2_",
  ]) {
    const bone = imported.getObjectByName(boneName);
    if (bone) bone.position.multiplyScalar(factor);
  }
  imported.updateWorldMatrix(true, true);
}

export function createProductionSkater(options = {}) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);
  const fallback = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26, 1.1, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x26313b, roughness: 0.86 }),
  );
  fallback.position.y = 1.35;
  fallback.castShadow = options.castShadow === true;
  visual.add(fallback);
  const rig = { root, visual, model: null, bones: new Map(), ready: null, loaded: false, failed: false, bodyHeight: 2.6 };
  rig.ready = new GLTFLoader().loadAsync(options.modelUrl || MODEL_URL).then((gltf) => {
    const imported = gltf.scene;
    imported.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(imported).getSize(new THREE.Vector3());
    imported.scale.setScalar(rig.bodyHeight / Math.max(size.y, 0.001));
    imported.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(imported);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    imported.position.x -= center.x;
    imported.position.z -= center.z;
    imported.position.y -= scaledBounds.min.y;
    imported.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = options.castShadow === true;
      object.receiveShadow = false;
      if (object.material?.map) object.material.map.anisotropy = 8;
    });
    extendImportedArms(imported, 1.44);
    for (const name of BONE_NAMES) {
      const bone = imported.getObjectByName(name);
      if (bone) rig.bones.set(name, { bone, base: bone.quaternion.clone() });
    }
    visual.add(imported);
    rig.model = imported;
    rig.loaded = true;
    disposeFallback(fallback);
    return rig;
  }).catch((error) => {
    rig.failed = true;
    console.warn("Real planet skateboard player could not load.", error);
    return rig;
  });
  return rig;
}

export function updateProductionSkaterPose(rig, state, delta) {
  if (!rig?.model) return;
  for (const { bone, base } of rig.bones.values()) bone.quaternion.copy(base);
  const phase = state.olliePhase || "grounded";
  const falling = phase === "air" && (Number(state.ollieElapsed) >= 0.2 || Number(state.ollieVerticalSpeed) <= 0);
  const key = phase === "crouch" ? "crouch" : phase === "nose" || (phase === "air" && !falling) ? "rise" : falling ? "fall" : "ride";
  const pose = key === "crouch" ? CROUCH_POSE : key === "rise" ? RISE_POSE : key === "fall" ? FALL_POSE : RIDE_POSE;
  const offset = OFFSETS[key];
  rig.visual.rotation.y = THREE.MathUtils.damp(rig.visual.rotation.y, -Math.PI * 0.5, 9, delta);
  rig.visual.position.x = THREE.MathUtils.damp(rig.visual.position.x, offset.x, 13, delta);
  rig.visual.position.y = THREE.MathUtils.damp(rig.visual.position.y, offset.y, 13, delta);
  rig.visual.position.z = THREE.MathUtils.damp(rig.visual.position.z, offset.z, 13, delta);
  rig.visual.scale.y = THREE.MathUtils.damp(rig.visual.scale.y, 1, 10, delta);
  for (const [name, [x, y, z]] of Object.entries(pose)) {
    const entry = rig.bones.get(name);
    if (!entry) continue;
    poseEuler.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), "XYZ");
    poseQuaternion.setFromEuler(poseEuler);
    entry.bone.quaternion.copy(entry.base).multiply(poseQuaternion);
  }
}
