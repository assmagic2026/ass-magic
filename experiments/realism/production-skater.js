import * as THREE from "../../three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const poseEuler = new THREE.Euler();
const poseQuaternion = new THREE.Quaternion();
const poseDegrees = Object.freeze({
  Skeleton_torso_joint_1: [0, 1, 0], Skeleton_torso_joint_2: [0, 24, 0], torso_joint_3: [1, 1, 0], Skeleton_neck_joint_2: [94, 3, 21],
  leg_joint_R_1: [18, -34, -20], leg_joint_R_2: [16, 36, -14], leg_joint_R_3: [-6, 0, -26], leg_joint_R_5: [0, -7, 0],
  leg_joint_L_1: [-10, -44, 31], leg_joint_L_2: [31, 52, 5], leg_joint_L_3: [10, -14, 10], leg_joint_L_5: [0, 2, 0],
});
const crouchDegrees = Object.freeze({
  ...poseDegrees,
  Skeleton_torso_joint_1: [0, 16, 0], torso_joint_3: [1, -12, 0],
  leg_joint_R_1: [18, -65, -20], leg_joint_R_2: [16, 72, -14], leg_joint_R_5: [0, -21, 0],
  leg_joint_L_1: [-10, -72, 31], leg_joint_L_2: [31, 74, 5], leg_joint_L_5: [0, -9, 0],
});
const riseDegrees = Object.freeze({
  ...poseDegrees,
  Skeleton_torso_joint_1: [0, -2, 0], Skeleton_torso_joint_2: [0, 17, 0], torso_joint_3: [1, -9, 0],
  leg_joint_R_1: [49, -4, -9], leg_joint_R_2: [-2, -18, -4], leg_joint_R_3: [9, 57, -18],
  leg_joint_L_1: [-54, -139, 37], leg_joint_L_2: [64, 118, 16], leg_joint_L_3: [-4, 54, 53],
});
const fallDegrees = Object.freeze({
  ...poseDegrees,
  Skeleton_torso_joint_1: [0, 4, 0], Skeleton_torso_joint_2: [0, 36, 0], torso_joint_3: [0, -16, 0],
  leg_joint_R_1: [15, -81, -39], leg_joint_R_2: [-2, 99, -18], leg_joint_R_3: [-19, 34, -68], leg_joint_R_5: [0, -7, -23],
  leg_joint_L_1: [-86, -104, 27], leg_joint_L_2: [91, 15, 31], leg_joint_L_3: [-4, 54, 53],
});
const offsets = Object.freeze({ ride: [0.16, -0.13, -0.25], crouch: [0.14, -0.28, -0.29], rise: [0.05, 0.18, -0.37], fall: [0.05, 0.44, -0.23] });

export function createProductionSkater({ castShadow = false } = {}) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);
  const rig = { root, visual, model: null, bones: new Map(), ready: null };
  rig.ready = new GLTFLoader().loadAsync("./assets/models/cesium-man.glb").then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    scene.scale.setScalar(2.6 / Math.max(0.001, size.y));
    scene.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(scene);
    const center = scaled.getCenter(new THREE.Vector3());
    scene.position.set(-center.x, -scaled.min.y, -center.z);
    scene.traverse((object) => { if (object.isMesh) object.castShadow = castShadow; });
    for (const name of Object.keys(poseDegrees)) {
      const bone = scene.getObjectByName(name);
      if (bone) rig.bones.set(name, { bone, base: bone.quaternion.clone() });
    }
    visual.add(scene);
    rig.model = scene;
    return rig;
  }).catch(() => rig);
  return rig;
}

export function updateProductionSkaterPose(rig, state, delta) {
  if (!rig?.model) return;
  const phase = state.olliePhase || "grounded";
  const falling = phase === "air" && (state.ollieElapsed >= 0.2 || state.ollieVerticalSpeed <= 0);
  const key = phase === "crouch" ? "crouch" : phase === "nose" || (phase === "air" && !falling) ? "rise" : falling ? "fall" : "ride";
  const pose = key === "crouch" ? crouchDegrees : key === "rise" ? riseDegrees : key === "fall" ? fallDegrees : poseDegrees;
  const offset = offsets[key];
  for (const { bone, base } of rig.bones.values()) bone.quaternion.copy(base);
  for (const [name, [x, y, z]] of Object.entries(pose)) {
    const entry = rig.bones.get(name);
    if (!entry) continue;
    poseEuler.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z));
    poseQuaternion.setFromEuler(poseEuler);
    entry.bone.quaternion.copy(entry.base).multiply(poseQuaternion);
  }
  rig.visual.rotation.y = THREE.MathUtils.damp(rig.visual.rotation.y, -Math.PI * 0.5, 9, delta);
  rig.visual.position.set(
    THREE.MathUtils.damp(rig.visual.position.x, offset[0], 13, delta),
    THREE.MathUtils.damp(rig.visual.position.y, offset[1], 13, delta),
    THREE.MathUtils.damp(rig.visual.position.z, offset[2], 13, delta),
  );
}
