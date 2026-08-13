// Source-equivalent flock solver ported from MANY NEKO's live school.js.
// Upstream: https://manyneko.puddingsan.chatgpt.site/aquarium/school.js?v=20260803c11
// Local changes in this file are limited to the Three.js import path.
import * as THREE from '../../three.module.js';

const TAU = Math.PI * 2;
const HASH_SIZE = 8192;
const HASH_MASK = HASH_SIZE - 1;
const BODY_HASH_SIZE = 16384;
const BODY_HASH_MASK = BODY_HASH_SIZE - 1;
const BODY_CELL_SIZE = 0.072;
const NEIGHBOR_OFFSETS = [];
for (let x = -1; x <= 1; x += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let z = -1; z <= 1; z += 1) NEIGHBOR_OFFSETS.push([x, y, z]);
  }
}
// Check the current cell, then faces, edges, and corners. The previous corner-
// first order could spend the whole neighbor budget before reaching close fish.
NEIGHBOR_OFFSETS.sort((a, b) => (
  a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
) - (
  b[0] * b[0] + b[1] * b[1] + b[2] * b[2]
));

const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

function hashCell(x, y, z) {
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & HASH_MASK;
}

function hashBodyCell(x, y, z) {
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & BODY_HASH_MASK;
}

function randomInEllipsoid(out, rx, ry, rz) {
  // Uniform volume distribution, with a slight center bias added during setup.
  const theta = Math.random() * TAU;
  const phi = Math.acos(2 * Math.random() - 1);
  const radius = Math.cbrt(Math.random());
  out.set(
    Math.sin(phi) * Math.cos(theta) * radius * rx,
    Math.cos(phi) * radius * ry,
    Math.sin(phi) * Math.sin(theta) * radius * rz,
  );
  return out;
}

function sampleMigrationPath(time, out, waterConfig) {
  // An ellipsoidal orbit around the observer. The polar motion passes directly
  // above and below the tank center, while azimuth carries the school behind it.
  const polar = time * 0.095 + 1.0 + Math.sin(time * 0.017) * 0.16;
  const azimuth = time * 0.12 + Math.sin(time * 0.019 + 0.4) * 0.35;
  const radius = waterConfig.orbitRadius + Math.sin(time * 0.047 + 1.3) * waterConfig.orbitVariation;
  const horizontal = Math.sin(polar) * radius;
  out.set(
    Math.cos(azimuth) * horizontal,
    Math.cos(polar) * waterConfig.orbitHeight,
    Math.sin(azimuth) * horizontal * (waterConfig.depth / waterConfig.width),
  );
  return out;
}

/**
 * CPU school simulation using a fixed-size spatial hash.
 * The school is not a set of modes: several slow fields continuously blend its
 * silhouette, flow, split tendency and turning signal.
 */
export class SchoolSimulation {
  constructor(count, config, fishConfig, waterConfig) {
    this.count = count;
    this.config = config;
    this.fishConfig = fishConfig;
    this.waterConfig = waterConfig;
    this.countScale = clamp(
      Math.cbrt(count / Math.max(1, config.referenceCount || count)),
      0.12,
      1.7,
    );
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.turn = new Float32Array(count);
    this.bend = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.scale = new Float32Array(count);
    this.shine = new Float32Array(count);
    this.speedBias = new Float32Array(count);
    this.agility = new Float32Array(count);
    this.reaction = new Float32Array(count);
    this.edgeBias = new Float32Array(count);
    this.splitSide = new Float32Array(count);
    this.radialTarget = new Float32Array(count);

    this.cellHeads = new Int32Array(HASH_SIZE);
    this.next = new Int32Array(count);
    this.bodyCellHeads = new Int32Array(BODY_HASH_SIZE);
    this.bodyNext = new Int32Array(count);
    this.cellX = new Int16Array(count);
    this.cellY = new Int16Array(count);
    this.cellZ = new Int16Array(count);
    this.center = sampleMigrationPath(0, new THREE.Vector3(), this.waterConfig);
    this.visualCenter = this.center.clone();
    this.meanVelocity = new THREE.Vector3(1, 0, 0);
    this.flowDirection = new THREE.Vector3(1, 0, 0);
    this.axes = new THREE.Vector3(2.55, 1.12, 1.72);
    this._migrationCenter = new THREE.Vector3();
    this._migrationAhead = new THREE.Vector3();
    this._migrationCandidate = new THREE.Vector3();
    this._migrationCandidateAhead = new THREE.Vector3();
    this._pathDirection = new THREE.Vector3();
    this._flowTarget = new THREE.Vector3();
    this._turnOffset = new THREE.Vector3();
    this._eventAhead = new THREE.Vector3();
    this._eventAnchor = new THREE.Vector3();
    this._eventUp = new THREE.Vector3(0, 1, 0);
    this._eventFallbackAxis = new THREE.Vector3(1, 0, 0);
    this._gatherCorrection = new THREE.Vector3();
    this.scatterActive = false;
    this.scatterTime = 0;
    this.scatterOrigin = new THREE.Vector3();
    this.scatterInfluence = new Float32Array(count);
    this.comeOnActive = false;
    this.comeOnPhase = 'idle';
    this.comeOnGatherTime = 0;
    this.comeOnGatherBlend = 0;
    this.comeOnTurnTime = 0;
    this.comeOnTurnBlend = 0;
    this.comeOnRushBlend = 0;
    this.comeOnDirectionLocked = false;
    this.comeOnTime = 0;
    this.comeOnBlend = 0;
    this.comeOnTravelSeconds = 0;
    this.comeOnTailTime = 0;
    this.comeOnRecoveryTime = 0;
    this.comeOnCooldownTime = 0;
    this.comeOnCooldownBlend = 0;
    this.comeOnPassedFraction = 0;
    this.comeOnPassed = new Uint8Array(count);
    this.comeOnEventSpeed = this.fishConfig.cruiseSpeed;
    this.comeOnStartCenter = this.center.clone();
    this.comeOnGatherTarget = this.center.clone();
    this.comeOnGatherScale = config.comeOnGatherScale;
    this.comeOnTarget = new THREE.Vector3();
    this.comeOnDirection = new THREE.Vector3(1, 0, 0);
    this.comeOnViewForward = new THREE.Vector3(1, 0, 0);
    this.comeOnViewTan = Math.tan(THREE.MathUtils.degToRad(22));
    this.comeOnRushDirection = new THREE.Vector3(1, 0, 0);
    this.comeOnSide = new THREE.Vector3(0, 0, 1);
    this.comeOnNearTarget = new THREE.Vector3();
    this.comeOnPassTarget = new THREE.Vector3();
    this.formationActive = false;
    this.formationType = null;
    this.formationPhase = 'idle';
    this.formationTime = 0;
    this.formationElapsed = 0;
    this.formationBlend = 0;
    this.formationEntryProgress = 0;
    this.formationEnterDuration = config.formationEnterSeconds;
    this.formationScale = 1;
    this.formationRoll = new Float32Array(count);
    this.formationAlong = new Float32Array(count);
    this.formationAcross = new Float32Array(count);
    this.formationAnchor = this.center.clone();
    this.formationRight = new THREE.Vector3(1, 0, 0);
    this.formationUp = new THREE.Vector3(0, 1, 0);
    this.formationNormal = new THREE.Vector3(0, 0, 1);
    this._formationTarget = new THREE.Vector3();
    this.migrationTimeOffset = 0;
    this.time = 0;

    this._initialize();
  }

  triggerScatter(origin) {
    if (this.comeOnActive || this.formationActive) return false;
    const cfg = this.config;
    const p = this.positions;
    const v = this.velocities;
    let affected = 0;

    this.scatterActive = true;
    this.scatterTime = 0;
    this.scatterOrigin.copy(origin);
    this.scatterInfluence.fill(0);

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      let dx = p[i3] - origin.x;
      let dy = p[i3 + 1] - origin.y;
      let dz = p[i3 + 2] - origin.z;
      let distance = Math.hypot(dx, dy, dz);
      if (distance >= cfg.scatterRadius) continue;
      if (distance < 0.0001) {
        const angle = this.phase[i] * 1.618;
        dx = Math.cos(angle);
        dy = Math.sin(angle * 0.73) * 0.55;
        dz = Math.sin(angle);
        distance = Math.hypot(dx, dy, dz);
      }

      const inverseDistance = 1 / distance;
      dx *= inverseDistance;
      dy *= inverseDistance;
      dz *= inverseDistance;
      const linearInfluence = 1 - distance / cfg.scatterRadius;
      const influence = linearInfluence * linearInfluence * (3 - 2 * linearInfluence);
      this.scatterInfluence[i] = influence;

      // A small immediate impulse makes the touch feel connected; the fading
      // steering field below opens the patch without teleporting any cat.
      const impulse = cfg.scatterImpulse * (0.35 + influence * 0.65);
      v[i3] += dx * impulse;
      v[i3 + 1] += dy * impulse;
      v[i3 + 2] += dz * impulse;
      affected += 1;
    }

    if (affected > 0) return true;
    this.scatterActive = false;
    return false;
  }

  triggerComeOn(cameraPosition, cameraForward = null, cameraFov = 56, cameraAspect = 16 / 9) {
    if (this.comeOnActive || this.formationActive) return false;
    const cfg = this.config;
    this.comeOnActive = true;
    this.comeOnPhase = 'gather';
    this.comeOnGatherTime = 0;
    this.comeOnGatherBlend = 0;
    this.comeOnTurnTime = 0;
    this.comeOnTurnBlend = 0;
    this.comeOnRushBlend = 0;
    this.comeOnDirectionLocked = false;
    this.comeOnTime = 0;
    this.comeOnBlend = 0;
    this.comeOnTailTime = 0;
    this.comeOnRecoveryTime = 0;
    this.comeOnCooldownTime = 0;
    this.comeOnCooldownBlend = 0;
    this.comeOnPassedFraction = 0;
    this.comeOnPassed.fill(0);
    this.comeOnStartCenter.copy(this.visualCenter);
    this.comeOnTarget.copy(cameraPosition);
    if (cameraForward && cameraForward.lengthSq() > 0.001) {
      this.comeOnDirection.copy(cameraForward).normalize();
    } else {
      this.comeOnDirection.subVectors(this.visualCenter, this.comeOnTarget).normalize();
    }

    // Only re-center when the bulk of the school is genuinely out of frame.
    // A school already visible keeps its current depth and immediately begins
    // the slow one-second turn, avoiding the old unnecessary move away.
    const verticalHalfFov = THREE.MathUtils.degToRad(cameraFov * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(0.32, cameraAspect));
    const fittingHalfFov = Math.max(
      THREE.MathUtils.degToRad(11),
      Math.min(verticalHalfFov, horizontalHalfFov) * cfg.comeOnStageViewMargin,
    );
    this.comeOnViewForward.copy(this.comeOnDirection);
    this.comeOnViewTan = Math.tan(fittingHalfFov);
    const currentRadius = Math.max(this.axes.x, this.axes.y, this.axes.z) * 1.14;
    const currentOffset = this._gatherCorrection.subVectors(this.visualCenter, this.comeOnTarget);
    const currentDistance = Math.max(0.001, currentOffset.length());
    const viewAlignment = currentOffset.dot(this.comeOnDirection) / currentDistance;
    const visibleRadius = currentDistance * Math.tan(fittingHalfFov);
    const centerVisible = viewAlignment > Math.cos(fittingHalfFov * 0.9);
    const maxStageDistance = Math.min(
      cfg.comeOnStageMaxDistance,
      Math.min(this.waterConfig.width, this.waterConfig.depth) * 0.43,
    );
    if (centerVisible) {
      this.comeOnGatherScale = 1;
      this.comeOnGatherTarget.copy(this.visualCenter);
    } else {
      this.comeOnGatherScale = clamp(
        visibleRadius / Math.max(currentRadius, 0.2),
        0.82,
        1,
      );
      const stageDistance = clamp(currentDistance, 1.8, maxStageDistance);
      this.comeOnGatherTarget.copy(this.comeOnTarget)
        .addScaledVector(this.comeOnDirection, stageDistance);
    }

    // The eventual rush direction points back from the staging point to the
    // camera. It is recalculated again after the school has actually settled.
    this.comeOnDirection.subVectors(this.comeOnTarget, this.comeOnGatherTarget);
    const approachDistance = this.comeOnDirection.length();
    if (approachDistance < 0.35) {
      this.comeOnDirection.copy(this.flowDirection).normalize();
    } else {
      this.comeOnDirection.multiplyScalar(1 / approachDistance);
    }
    // Choose the side now, but postpone the rush path until the gather-and-turn
    // phase has completed.
    this.comeOnSide.crossVectors(this.comeOnDirection, this._eventUp);
    if (this.comeOnSide.lengthSq() < 0.001) {
      this.comeOnSide.crossVectors(this.comeOnDirection, this._eventFallbackAxis);
    }
    this.comeOnSide.normalize();
    if (Math.sin(this.time * 0.73 + 0.8) < 0) this.comeOnSide.multiplyScalar(-1);

    return true;
  }

  triggerFormation(type, cameraPosition, cameraFov = 56, cameraAspect = 16 / 9) {
    if (this.comeOnActive || this.formationActive) return false;
    if (type !== 'cube' && type !== 'mobius' && type !== 'bigcat') return false;
    this.comeOnCooldownTime = 0;
    this.comeOnCooldownBlend = 0;
    this.formationActive = true;
    this.formationType = type;
    this.formationPhase = 'enter';
    this.formationTime = 0;
    this.formationElapsed = 0;
    this.formationBlend = 0;
    this.formationEntryProgress = 0;
    this.formationEnterDuration = type === 'mobius'
      ? this.config.formationMobiusEnterSeconds
      : type === 'bigcat'
        ? this.config.formationBigCatEnterSeconds
        : this.config.formationEnterSeconds;
    const viewDirection = this._gatherCorrection.subVectors(this.visualCenter, cameraPosition);
    if (viewDirection.lengthSq() < 0.01) viewDirection.copy(this.flowDirection);
    else viewDirection.normalize();
    const stageDistance = type === 'bigcat'
      ? this.config.formationBigCatStageDistance
      : this.config.formationStageDistance;
    this.formationAnchor.copy(cameraPosition).addScaledVector(viewDirection, stageDistance);

    const verticalHalfFov = THREE.MathUtils.degToRad(cameraFov * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(0.32, cameraAspect));
    // Reserve a generous edge margin for the cats' own geometry, especially
    // on narrow portrait screens where point positions alone can still fit.
    const fittingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov) * 0.88;
    const availableHalfSize = stageDistance * Math.tan(fittingHalfFov);
    const baseHalfSize = type === 'cube'
      ? this.config.formationCubeHalfExtent * 1.58
      : type === 'mobius'
        ? this.config.formationMobiusRadius + this.config.formationMobiusHalfWidth
        : this.config.formationBigCatScreenHalf;
    this.formationScale = type === 'bigcat'
      ? clamp(availableHalfSize / Math.max(baseHalfSize, 0.1), 1.35, 3.2)
      : clamp(
        availableHalfSize / Math.max(baseHalfSize, 0.1),
        0.54,
        Math.min(this.countScale, 1.2),
      );

    this.formationNormal.subVectors(cameraPosition, this.formationAnchor);
    if (this.formationNormal.lengthSq() < 0.01) this.formationNormal.set(0, 0, 1);
    else this.formationNormal.normalize();
    this.formationRight.crossVectors(this._eventUp, this.formationNormal);
    if (this.formationRight.lengthSq() < 0.01) {
      this.formationRight.crossVectors(this._eventFallbackAxis, this.formationNormal);
    }
    this.formationRight.normalize();
    this.formationUp.crossVectors(this.formationNormal, this.formationRight).normalize();

    if (type === 'mobius') {
      // Preserve the school's current angular order. Assigning slots by raw
      // index made neighbours cross the entire frame before finding the band.
      const angularOrder = new Array(this.count);
      const p = this.positions;
      for (let i = 0; i < this.count; i += 1) {
        const i3 = i * 3;
        const rx = p[i3] - this.visualCenter.x;
        const ry = p[i3 + 1] - this.visualCenter.y;
        const rz = p[i3 + 2] - this.visualCenter.z;
        const screenX = rx * this.formationRight.x
          + ry * this.formationRight.y
          + rz * this.formationRight.z;
        const screenY = rx * this.formationUp.x
          + ry * this.formationUp.y
          + rz * this.formationUp.z;
        angularOrder[i] = { index: i, angle: Math.atan2(screenY, screenX) };
      }
      angularOrder.sort((a, b) => a.angle - b.angle);
      for (let rank = 0; rank < this.count; rank += 1) {
        const index = angularOrder[rank].index;
        this.formationAlong[index] = (rank + 0.5) / this.count + (rank % 2);
        this.formationAcross[index] = (
          (Math.floor(rank * 0.5) * 0.618033989) % 1
        ) * 2 - 1;
      }
    }
    return true;
  }

  _beginComeOnTurn() {
    this.comeOnPhase = 'turn';
    this.comeOnTurnTime = 0;
    this.comeOnTurnBlend = 0;
    this.comeOnBlend = 0;
    this.comeOnStartCenter.copy(this.visualCenter);
    this.comeOnDirection.subVectors(this.comeOnTarget, this.comeOnStartCenter);
    if (this.comeOnDirection.lengthSq() < 0.12) {
      this.comeOnDirection.copy(this.flowDirection).normalize();
    } else {
      this.comeOnDirection.normalize();
    }
  }

  _beginComeOnRush() {
    const cfg = this.config;
    this.comeOnPhase = 'rush';
    this.comeOnTime = 0;
    this.comeOnTailTime = 0;
    this.comeOnRecoveryTime = 0;
    this.comeOnRushBlend = 0;
    this.comeOnDirectionLocked = false;
    this.comeOnPassedFraction = 0;
    this.comeOnPassed.fill(0);
    this.comeOnStartCenter.copy(this.visualCenter);
    this.comeOnDirection.subVectors(this.comeOnTarget, this.comeOnStartCenter);
    if (this.comeOnDirection.lengthSq() < 0.12) {
      this.comeOnDirection.copy(this.flowDirection).normalize();
    } else {
      this.comeOnDirection.normalize();
    }
    this.flowDirection.lerp(this.comeOnDirection, 0.86).normalize();
    this.comeOnSide.crossVectors(this.comeOnDirection, this._eventUp);
    if (this.comeOnSide.lengthSq() < 0.001) {
      this.comeOnSide.crossVectors(this.comeOnDirection, this._eventFallbackAxis);
    }
    this.comeOnSide.normalize();
    if (Math.sin(this.time * 0.73 + 0.8) < 0) this.comeOnSide.multiplyScalar(-1);
    this.comeOnNearTarget.copy(this.comeOnTarget)
      .addScaledVector(this.comeOnSide, cfg.comeOnLateralClearance)
      .addScaledVector(this.comeOnDirection, -cfg.comeOnApproachLead);
    this.comeOnPassTarget.copy(this.comeOnTarget)
      .addScaledVector(this.comeOnSide, cfg.comeOnLateralClearance)
      .addScaledVector(this.comeOnDirection, cfg.comeOnPassDistance);
    this.comeOnRushDirection.subVectors(this.comeOnPassTarget, this.comeOnStartCenter).normalize();
    this.comeOnEventSpeed = clamp(
      this.fishConfig.cruiseSpeed * cfg.comeOnSpeedBoost,
      cfg.comeOnSpeedMin,
      cfg.comeOnSpeedMax,
    );
    const travelDistance = this.comeOnStartCenter.distanceTo(this.comeOnPassTarget);
    this.comeOnTravelSeconds = clamp(
      travelDistance / this.comeOnEventSpeed,
      cfg.comeOnMinTravelSeconds,
      cfg.comeOnMaxTravelSeconds,
    );
  }

  _sampleComeOnPath(progress, out) {
    const u = clamp(progress, 0, 1);
    out.copy(this.comeOnStartCenter).lerp(this.comeOnPassTarget, u);
    return out;
  }

  _sampleFormationTarget(index, out) {
    const cfg = this.config;
    const drift = this.formationElapsed;
    let localX;
    let localY;
    let localZ;

    if (this.formationType === 'cube') {
      this.formationRoll[index] = 0;
      const fractX = (index * 0.754877666 + drift * 0.021) % 1;
      const fractY = (index * 0.569840296 + drift * 0.016) % 1;
      const fractZ = (index * 0.438447187 + drift * 0.019) % 1;
      const half = cfg.formationCubeHalfExtent * this.formationScale;
      localX = (fractX * 2 - 1) * half;
      localY = (fractY * 2 - 1) * half;
      localZ = (fractZ * 2 - 1) * half;

      // A subset traces the six faces, keeping the silhouette visibly cubic
      // while the rest continually exchange positions through the volume.
      if (index % 4 === 0) {
        const face = Math.floor(index / 4) % 6;
        if (face < 2) localX = (face === 0 ? -1 : 1) * half;
        else if (face < 4) localY = (face === 2 ? -1 : 1) * half;
        else localZ = (face === 4 ? -1 : 1) * half;
      }

      // A slight, fixed three-quarter turn reveals all three dimensions.
      const yaw = 0.62;
      const pitch = -0.44;
      const yawX = localX * Math.cos(yaw) - localZ * Math.sin(yaw);
      const yawZ = localX * Math.sin(yaw) + localZ * Math.cos(yaw);
      const pitchY = localY * Math.cos(pitch) - yawZ * Math.sin(pitch);
      localZ = localY * Math.sin(pitch) + yawZ * Math.cos(pitch);
      localX = yawX;
      localY = pitchY;
    } else if (this.formationType === 'mobius') {
      // A Möbius traveller needs two geometric laps to return to the same
      // side. Keeping an unwrapped 0..2 phase makes lap one arrive on the back
      // and lap two return to the front without a seam or target jump.
      const reveal = this.formationPhase === 'enter'
        ? smoothstep(this.formationEntryProgress, 0.1, 1)
        : 1;
      const circulationSpeed = THREE.MathUtils.lerp(0.018, 0.066, reveal);
      const along = (this.formationAlong[index] + drift * circulationSpeed) % 2;
      const across = this.formationAcross[index];
      const angle = along * TAU;
      const width = across
        * cfg.formationMobiusHalfWidth
        * this.formationScale
        * THREE.MathUtils.lerp(1.55, 1, reveal);
      const radius = cfg.formationMobiusRadius * this.formationScale;
      const centerX = radius * Math.cos(angle);
      const verticalFactor = THREE.MathUtils.lerp(0.24, 0.52, reveal);
      const centerY = radius * verticalFactor * Math.sin(angle * 2);
      const tangentX = -radius * Math.sin(angle);
      const tangentY = radius * verticalFactor * 2 * Math.cos(angle * 2);
      const inverseTangent = 1 / (Math.hypot(tangentX, tangentY) || 1);
      const crossX = -tangentY * inverseTangent;
      const crossY = tangentX * inverseTangent;
      const halfTwist = angle * 0.5;
      const formingTwist = halfTwist * reveal;
      this.formationRoll[index] = formingTwist;
      const routeDepth = cfg.formationMobiusDepthGap
        * this.formationScale
        * Math.sin(angle)
        * reveal;
      localX = centerX + crossX * width * Math.cos(formingTwist);
      localY = centerY + crossY * width * Math.cos(formingTwist);
      localZ = routeDepth + width * Math.sin(formingTwist);
    } else {
      // Rebuild one of the existing 3D cats at school scale. The same centres
      // and dimensions used by CatRenderer are projected side-on so its long
      // body, head, ears, four paws and tapered tail remain recognisable.
      this.formationRoll[index] = 0;
      const slot = index / this.count;
      const u = (index * 0.754877666) % 1;
      const v = (index * 0.569840296) % 1;
      const w = (index * 0.438447187) % 1;
      let anatomyX = 0;
      let anatomyY = 0;
      let anatomyZ = 0;

      if (slot < 0.42) {
        const radius = index % 3 === 0 ? Math.cbrt(w) : 0.72 + Math.sqrt(w) * 0.28;
        const longitude = u * TAU;
        const latitude = Math.acos(1 - 2 * v);
        const ring = Math.sin(latitude) * radius;
        anatomyX = -0.08 + Math.cos(latitude) * radius * 0.72;
        anatomyY = Math.sin(longitude) * ring * 0.29;
        anatomyZ = Math.cos(longitude) * ring * 0.32;
      } else if (slot < 0.66) {
        const radius = index % 3 === 0 ? Math.cbrt(w) : 0.72 + Math.sqrt(w) * 0.28;
        const longitude = u * TAU;
        const latitude = Math.acos(1 - 2 * v);
        const ring = Math.sin(latitude) * radius;
        anatomyX = 0.64 + Math.cos(latitude) * radius * 0.34;
        anatomyY = 0.08 + Math.sin(longitude) * ring * 0.34;
        anatomyZ = Math.cos(longitude) * ring * 0.35;
      } else if (slot < 0.74) {
        const leftEar = index % 2 === 0 ? -1 : 1;
        const height = 1 - Math.cbrt(1 - v);
        const earRadius = (1 - height) * Math.sqrt(w);
        anatomyX = 0.55 + Math.cos(u * TAU) * earRadius * 0.13;
        anatomyY = 0.29 + height * 0.28;
        anatomyZ = leftEar * 0.2 + Math.sin(u * TAU) * earRadius * 0.13;
      } else if (slot < 0.9) {
        const pawSlot = Math.min(3, Math.floor((slot - 0.74) / 0.04));
        const radius = index % 3 === 0 ? Math.cbrt(w) : 0.72 + Math.sqrt(w) * 0.28;
        const longitude = u * TAU;
        const latitude = Math.acos(1 - 2 * v);
        const ring = Math.sin(latitude) * radius;
        const frontPaw = pawSlot < 2;
        anatomyX = (frontPaw ? 0.36 : -0.48)
          + Math.cos(latitude) * radius * (frontPaw ? 0.2 : 0.22);
        anatomyY = (frontPaw ? -0.25 : -0.22)
          + Math.sin(longitude) * ring * (frontPaw ? 0.11 : 0.12);
        anatomyZ = (pawSlot % 2 === 0 ? -1 : 1) * (frontPaw ? 0.23 : 0.22)
          + Math.cos(longitude) * ring * (frontPaw ? 0.12 : 0.13);
      } else {
        const inverseDirectionLength = 1 / Math.hypot(-1, 0.08, 0.28);
        const directionX = -inverseDirectionLength;
        const directionY = 0.08 * inverseDirectionLength;
        const directionZ = 0.28 * inverseDirectionLength;
        const inverseSideLength = 1 / Math.hypot(directionZ, directionX);
        const sideX = directionZ * inverseSideLength;
        const sideZ = -directionX * inverseSideLength;
        const binormalX = directionY * sideZ;
        const binormalY = directionZ * sideX - directionX * sideZ;
        const binormalZ = -directionY * sideX;
        const alongTail = (v - 0.5) * 0.9;
        const tailRadius = THREE.MathUtils.lerp(0.08, 0.13, v) * Math.sqrt(w);
        const tailAngle = u * TAU;
        const radialSide = Math.cos(tailAngle) * tailRadius;
        const radialBinormal = Math.sin(tailAngle) * tailRadius;
        anatomyX = -0.83 + directionX * alongTail
          + sideX * radialSide + binormalX * radialBinormal;
        anatomyY = 0.08 + directionY * alongTail + binormalY * radialBinormal;
        anatomyZ = 0.0476 + directionZ * alongTail
          + sideZ * radialSide + binormalZ * radialBinormal;
      }

      // X is horizontal on screen and Z keeps its true depth: this is the same
      // sideways three-dimensional silhouette as a single swimming cat.
      localX = (anatomyX + 0.15) * this.formationScale;
      localY = anatomyY * this.formationScale;
      localZ = anatomyZ * this.formationScale;
    }

    out.copy(this.formationAnchor)
      .addScaledVector(this.formationRight, localX)
      .addScaledVector(this.formationUp, localY)
      .addScaledVector(this.formationNormal, localZ);
    return out;
  }

  _realignMigrationAfterFormation() {
    const currentMigrationTime = this.time + this.migrationTimeOffset;
    let bestDelta = 0;
    let bestDistance = Infinity;
    for (let delta = 0; delta <= 48; delta += 0.25) {
      sampleMigrationPath(currentMigrationTime + delta, this._migrationCandidate, this.waterConfig);
      const distance = this._migrationCandidate.distanceToSquared(this.visualCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDelta = delta;
      }
    }
    this.migrationTimeOffset += bestDelta;
  }

  _realignMigrationAfterComeOn() {
    // Resume the normal orbit on the far side of the observer. Without this,
    // high slider speeds could immediately pull the school back across the
    // camera and make one call look like two separate charges.
    const currentMigrationTime = this.time + this.migrationTimeOffset;
    let bestDelta = 0;
    let bestScore = Infinity;
    for (let delta = 0; delta <= 48; delta += 0.25) {
      sampleMigrationPath(currentMigrationTime + delta, this._migrationCandidate, this.waterConfig);
      sampleMigrationPath(currentMigrationTime + delta + 0.45, this._migrationCandidateAhead, this.waterConfig);
      const projection = this._migrationCandidate.clone()
        .sub(this.comeOnTarget)
        .dot(this.comeOnDirection);
      const candidateDirection = this._migrationCandidateAhead.clone()
        .sub(this._migrationCandidate)
        .normalize();
      const alignment = candidateDirection.dot(this.comeOnDirection);
      const sidePenalty = Math.max(0, 1.2 - projection) * 8;
      const score = this._migrationCandidate.distanceTo(this.visualCenter)
        + sidePenalty
        + (1 - alignment) * 1.4;
      if (score < bestScore) {
        bestScore = score;
        bestDelta = delta;
      }
    }
    this.migrationTimeOffset += bestDelta;
  }

  _initialize() {
    const p = new THREE.Vector3();
    // A small temporary Poisson grid prevents two bodies from being born at
    // effectively the same coordinate. It is only used during construction.
    const minimumSpawnSpacing = 0.072;
    const minimumSpawnSpacing2 = minimumSpawnSpacing * minimumSpawnSpacing;
    const inverseSpawnCell = 1 / minimumSpawnSpacing;
    const spawnGrid = new Map();
    const initialForward = sampleMigrationPath(0.35, new THREE.Vector3(), this.waterConfig)
      .sub(sampleMigrationPath(0, new THREE.Vector3(), this.waterConfig))
      .normalize();
    for (let i = 0; i < this.count; i += 1) {
      // The original pre-gallery school occupied a broad, layered volume.
      // These radii retain that feel while still fitting the 10 m tank.
      let cellX = 0;
      let cellY = 0;
      let cellZ = 0;
      for (let attempt = 0; attempt < 32; attempt += 1) {
        randomInEllipsoid(
          p,
          2.62 * this.countScale,
          1.18 * this.countScale,
          1.82 * this.countScale,
        );
        p.add(this.center);
        cellX = Math.floor(p.x * inverseSpawnCell);
        cellY = Math.floor(p.y * inverseSpawnCell);
        cellZ = Math.floor(p.z * inverseSpawnCell);
        let clear = true;
        for (let ox = -1; ox <= 1 && clear; ox += 1) {
          for (let oy = -1; oy <= 1 && clear; oy += 1) {
            for (let oz = -1; oz <= 1 && clear; oz += 1) {
              const bucket = spawnGrid.get(`${cellX + ox},${cellY + oy},${cellZ + oz}`);
              if (!bucket) continue;
              for (const placedIndex of bucket) {
                const placed3 = placedIndex * 3;
                const dx = this.positions[placed3] - p.x;
                const dy = this.positions[placed3 + 1] - p.y;
                const dz = this.positions[placed3 + 2] - p.z;
                if (dx * dx + dy * dy + dz * dz < minimumSpawnSpacing2) {
                  clear = false;
                  break;
                }
              }
            }
          }
        }
        if (clear) break;
        // randomInEllipsoid expects to overwrite a local-space vector.
        // Preserve the final world-space fallback if all attempts are used.
        if (attempt < 31) p.sub(this.center);
      }
      const i3 = i * 3;
      this.positions[i3] = p.x;
      this.positions[i3 + 1] = p.y;
      this.positions[i3 + 2] = p.z;
      const spawnKey = `${cellX},${cellY},${cellZ}`;
      const spawnBucket = spawnGrid.get(spawnKey);
      if (spawnBucket) spawnBucket.push(i);
      else spawnGrid.set(spawnKey, [i]);

      const speed = this.fishConfig.cruiseSpeed * (0.86 + Math.random() * 0.27);
      this.velocities[i3] = initialForward.x * speed + (Math.random() - 0.5) * 0.035;
      this.velocities[i3 + 1] = initialForward.y * speed + (Math.random() - 0.5) * 0.035;
      this.velocities[i3 + 2] = initialForward.z * speed + (Math.random() - 0.5) * 0.035;

      this.phase[i] = Math.random() * TAU;
      this.scale[i] = THREE.MathUtils.lerp(this.fishConfig.sizeMin, this.fishConfig.sizeMax, Math.random());
      this.shine[i] = 0.78 + Math.random() * 0.22;
      this.speedBias[i] = 0.86 + Math.random() * 0.3;
      this.agility[i] = 0.72 + Math.random() * 0.55;
      this.reaction[i] = 0.56 + Math.random() * 0.78;
      this.edgeBias[i] = Math.pow(Math.random(), 3) < 0.12 ? 1.35 + Math.random() * 1.2 : 0;
      this.splitSide[i] = Math.random() < 0.5 ? -1 : 1;
      this.radialTarget[i] = 0.42 + Math.pow(Math.random(), 1.08) * 0.74;
    }
  }

  _updateGlobalFields(dt) {
    const t = this.time;
    const cfg = this.config;

    const migrationTime = t + this.migrationTimeOffset;
    const targetCenter = sampleMigrationPath(migrationTime, this._migrationCenter, this.waterConfig);
    const pathAhead = sampleMigrationPath(migrationTime + 0.45, this._migrationAhead, this.waterConfig);
    const pathDirection = this._pathDirection.copy(pathAhead).sub(targetCenter).normalize();

    if (this.comeOnActive) {
      if (this.comeOnPhase === 'gather') {
        this.comeOnGatherTime += dt;
        const gatherProgress = clamp(
          this.comeOnGatherTime / cfg.comeOnGatherSeconds,
          0,
          1,
        );
        this.comeOnGatherBlend = gatherProgress * gatherProgress * (3 - 2 * gatherProgress);
        this.comeOnBlend = gatherProgress;
        this.comeOnRushBlend = 0;
        targetCenter.copy(this.comeOnStartCenter)
          .lerp(this.comeOnGatherTarget, this.comeOnGatherBlend);
        this._gatherCorrection.copy(this.comeOnGatherTarget).sub(this.visualCenter);
        if (this._gatherCorrection.lengthSq() > 0.025) {
          pathDirection.copy(this._gatherCorrection).normalize();
        }
        pathDirection.lerp(this.comeOnDirection, gatherProgress).normalize();
        if (gatherProgress >= 1) this._beginComeOnRush();
      } else if (this.comeOnPhase === 'turn') {
        this.comeOnTurnTime += dt;
        const turnProgress = clamp(this.comeOnTurnTime / cfg.comeOnTurnSeconds, 0, 1);
        this.comeOnTurnBlend = turnProgress * turnProgress * (3 - 2 * turnProgress);
        this.comeOnBlend = this.comeOnTurnBlend;
        this.comeOnRushBlend = 0;
        targetCenter.copy(this.comeOnStartCenter);
        pathDirection.lerp(this.comeOnDirection, this.comeOnTurnBlend).normalize();
        if (turnProgress >= 1) this._beginComeOnRush();
      } else {
        this.comeOnTime += dt;
        this.comeOnBlend = 1;
        this.comeOnRushBlend = smoothstep(
          this.comeOnTime,
          0,
          cfg.comeOnAccelerationSeconds,
        );
        const meanHeadingLength = this.meanVelocity.length();
        const rushHeadingDot = meanHeadingLength > 0.0001
          ? this.meanVelocity.dot(this.comeOnRushDirection) / meanHeadingLength
          : 1;
        if (!this.comeOnDirectionLocked
          && this.comeOnRushBlend > 0.98
          && rushHeadingDot > 0.97) {
          this.comeOnDirectionLocked = true;
        } else if (this.comeOnDirectionLocked
          && rushHeadingDot < cfg.comeOnCancelTurnDot) {
          this.comeOnTime = this.comeOnTravelSeconds;
          this.comeOnTailTime = cfg.comeOnMaxTailSeconds;
        }
        const progress = clamp(this.comeOnTime / this.comeOnTravelSeconds, 0, 1);
        if (progress < 1) {
        const eased = progress * progress * (3 - 2 * progress);
        this._sampleComeOnPath(eased, targetCenter);
        this._sampleComeOnPath(Math.min(1, eased + 0.018), this._eventAhead);
        pathDirection.copy(this._eventAhead).sub(targetCenter).normalize();
        } else if (
          this.comeOnPassedFraction < cfg.comeOnPassCompletion
          && this.comeOnTailTime < cfg.comeOnMaxTailSeconds
        ) {
          this.comeOnTailTime += dt;
          this._eventAnchor.copy(this.comeOnPassTarget)
            .addScaledVector(this.comeOnRushDirection, this.comeOnTailTime * this.comeOnEventSpeed * 0.72);
          targetCenter.copy(this._eventAnchor);
          pathDirection.copy(this.comeOnRushDirection);
        } else {
          this.comeOnRecoveryTime += dt;
          this.comeOnBlend = 1 - smoothstep(
            this.comeOnRecoveryTime,
            0,
            cfg.comeOnRecoverySeconds,
          );
          this.comeOnRushBlend = this.comeOnBlend;
          this._eventAnchor.copy(this.comeOnPassTarget)
            .addScaledVector(
              this.comeOnRushDirection,
              this.comeOnTailTime * this.comeOnEventSpeed * 0.72
                + this.comeOnRecoveryTime * this.comeOnEventSpeed * 0.2,
            );
          targetCenter.lerp(this._eventAnchor, this.comeOnBlend);
          pathDirection.lerp(this.comeOnRushDirection, this.comeOnBlend).normalize();
          if (this.comeOnRecoveryTime >= cfg.comeOnRecoverySeconds) {
            this._realignMigrationAfterComeOn();
            this.comeOnActive = false;
            this.comeOnPhase = 'idle';
            this.comeOnBlend = 0;
            this.comeOnRushBlend = 0;
            this.comeOnCooldownTime = cfg.comeOnCooldownSeconds;
            this.comeOnCooldownBlend = 1;
          }
        }
      }
    } else if (this.comeOnCooldownTime > 0) {
      this.comeOnCooldownTime = Math.max(0, this.comeOnCooldownTime - dt);
      this.comeOnCooldownBlend = smoothstep(
        this.comeOnCooldownTime,
        0,
        cfg.comeOnCooldownSeconds,
      );
      this._eventAnchor.copy(this.comeOnPassTarget)
        .addScaledVector(this.comeOnRushDirection, 0.45);
      targetCenter.lerp(this._eventAnchor, this.comeOnCooldownBlend * 0.86);
      pathDirection.lerp(this.comeOnRushDirection, this.comeOnCooldownBlend * 0.92).normalize();
    } else {
      this.comeOnCooldownBlend = 0;
    }

    if (this.formationActive) {
      this.formationTime += dt;
      this.formationElapsed += dt;
      if (this.formationPhase === 'enter') {
        const progress = clamp(this.formationTime / this.formationEnterDuration, 0, 1);
        this.formationEntryProgress = progress;
        this.formationBlend = progress * progress * (3 - 2 * progress);
        if (progress >= 1) {
          this.formationPhase = 'hold';
          this.formationTime = 0;
          this.formationEntryProgress = 1;
          this.formationBlend = 1;
        }
      } else if (this.formationPhase === 'hold') {
        this.formationBlend = 1;
        if (this.formationTime >= cfg.formationHoldSeconds) {
          this.formationPhase = 'exit';
          this.formationTime = 0;
        }
      } else {
        const progress = clamp(this.formationTime / cfg.formationExitSeconds, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        this.formationBlend = 1 - eased;
        if (progress >= 1) {
          this._realignMigrationAfterFormation();
          this.formationActive = false;
          this.formationType = null;
          this.formationPhase = 'idle';
          this.formationBlend = 0;
          this.formationEntryProgress = 0;
        }
      }
      targetCenter.lerp(this.formationAnchor, this.formationBlend);
    }

    const centerResponse = 0.72 + this.comeOnBlend * 2.05 + this.formationBlend * 1.5;
    this.center.lerp(targetCenter, 1 - Math.exp(-dt * centerResponse));

    const elongated = 0.5 + 0.5 * Math.sin(t * 0.07 + 0.4);
    const compact = 0.5 + 0.5 * Math.sin(t * 0.053 + 2.1);
    const vertical = 0.5 + 0.5 * Math.sin(t * 0.061 + 4.5);
    const densityScale = 1 / Math.cbrt(Math.max(0.5, cfg.density));
    this.axes.set(
      THREE.MathUtils.lerp(2.05, 3.15, elongated) * THREE.MathUtils.lerp(1, 0.8, compact),
      THREE.MathUtils.lerp(0.88, 1.42, vertical) * THREE.MathUtils.lerp(1, 0.88, compact),
      THREE.MathUtils.lerp(1.42, 2.2, 1 - elongated) * THREE.MathUtils.lerp(1, 0.86, compact),
    ).multiplyScalar(densityScale * this.countScale);
    if (this.comeOnPhase === 'gather' || this.comeOnPhase === 'turn') {
      const stagingBlend = this.comeOnPhase === 'gather' ? this.comeOnGatherBlend : 1;
      this.axes.multiplyScalar(
        THREE.MathUtils.lerp(1, this.comeOnGatherScale, stagingBlend),
      );
    }

    // Harmonics create calm travel punctuated by smooth, decisive turns.
    const turnPulse = Math.pow(0.5 + 0.5 * Math.sin(t * 0.16 + Math.sin(t * 0.031) * 2.2), 5);
    this._turnOffset.set(
      Math.cos(t * 0.083 + 1.1) * turnPulse * 0.44,
      Math.sin(t * 0.12) * turnPulse * 0.3,
      Math.sin(t * 0.091 + 0.7) * turnPulse * 0.44,
    );
    const targetFlow = this._flowTarget.copy(pathDirection).add(this._turnOffset).normalize();
    if (this.comeOnBlend > 0) {
      targetFlow.lerp(pathDirection, this.comeOnBlend).normalize();
    }
    this.flowDirection.lerp(
      targetFlow,
      1 - Math.exp(-dt * (0.7 + turnPulse * 1.25 + this.comeOnBlend * 4.6)),
    ).normalize();

    this.morphology = {
      vortex: smoothstep(0.42, 0.9, 0.5 + 0.5 * Math.sin(t * 0.055 + 3.7)),
      split: smoothstep(0.7, 0.97, 0.5 + 0.5 * Math.sin(t * 0.043 + 0.25)),
      wave: 0.5 + 0.5 * Math.sin(t * 0.068 + 5.1),
      turnPulse,
    };
  }

  _buildSpatialHash() {
    this.cellHeads.fill(-1);
    this.bodyCellHeads.fill(-1);
    const inv = 1 / this.config.cellSize;
    const bodyInv = 1 / BODY_CELL_SIZE;
    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      const x = Math.floor(this.positions[i3] * inv);
      const y = Math.floor(this.positions[i3 + 1] * inv);
      const z = Math.floor(this.positions[i3 + 2] * inv);
      this.cellX[i] = x;
      this.cellY[i] = y;
      this.cellZ[i] = z;
      const hash = hashCell(x, y, z);
      this.next[i] = this.cellHeads[hash];
      this.cellHeads[hash] = i;

      const bodyHash = hashBodyCell(
        Math.floor(this.positions[i3] * bodyInv),
        Math.floor(this.positions[i3 + 1] * bodyInv),
        Math.floor(this.positions[i3 + 2] * bodyInv),
      );
      this.bodyNext[i] = this.bodyCellHeads[bodyHash];
      this.bodyCellHeads[bodyHash] = i;
    }
  }

  _resolveBodyOverlaps(passes = 2) {
    const spacing = 0.062;
    const bodyInv = 1 / BODY_CELL_SIZE;
    const p = this.positions;

    for (let pass = 0; pass < passes; pass += 1) {
      this.bodyCellHeads.fill(-1);
      for (let i = 0; i < this.count; i += 1) {
        const i3 = i * 3;
        const hash = hashBodyCell(
          Math.floor(p[i3] * bodyInv),
          Math.floor(p[i3 + 1] * bodyInv),
          Math.floor(p[i3 + 2] * bodyInv),
        );
        this.bodyNext[i] = this.bodyCellHeads[hash];
        this.bodyCellHeads[hash] = i;
      }

      for (let i = 0; i < this.count; i += 1) {
        const i3 = i * 3;
        const cellX = Math.floor(p[i3] * bodyInv);
        const cellY = Math.floor(p[i3 + 1] * bodyInv);
        const cellZ = Math.floor(p[i3 + 2] * bodyInv);
        for (let offsetIndex = 0; offsetIndex < NEIGHBOR_OFFSETS.length; offsetIndex += 1) {
          const [ox, oy, oz] = NEIGHBOR_OFFSETS[offsetIndex];
          let j = this.bodyCellHeads[hashBodyCell(cellX + ox, cellY + oy, cellZ + oz)];
          while (j !== -1) {
            if (j < i) {
              const j3 = j * 3;
              let dx = p[i3] - p[j3];
              let dy = p[i3 + 1] - p[j3 + 1];
              let dz = p[i3 + 2] - p[j3 + 2];
              let distance = Math.hypot(dx, dy, dz);
              if (distance < spacing) {
                if (distance < 0.0001) {
                  const angle = this.phase[i] + j * 1.618;
                  dx = Math.cos(angle);
                  dy = Math.sin(angle * 0.71) * 0.45;
                  dz = Math.sin(angle);
                  distance = Math.hypot(dx, dy, dz);
                }
                const correction = (spacing - distance) * 0.505 / distance;
                dx *= correction;
                dy *= correction;
                dz *= correction;
                p[i3] += dx;
                p[i3 + 1] += dy;
                p[i3 + 2] += dz;
                p[j3] -= dx;
                p[j3 + 1] -= dy;
                p[j3 + 2] -= dz;
              }
            }
            j = this.bodyNext[j];
          }
        }
      }
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.034);
    this.time += dt;
    if (this.scatterActive) {
      this.scatterTime += dt;
      if (this.scatterTime >= this.config.scatterDuration) {
        this.scatterActive = false;
        this.scatterInfluence.fill(0);
      }
    }
    this._updateGlobalFields(dt);
    this._buildSpatialHash();

    const p = this.positions;
    const v = this.velocities;
    const cfg = this.config;
    const schoolingStrength = cfg.schoolingStrength;
    const invCell = 1 / cfg.cellSize;
    const near2 = cfg.neighborRadius * cfg.neighborRadius;
    const separate2 = cfg.separationRadius * cfg.separationRadius;
    const center = this.center;
    const axes = this.axes;
    const flow = this.flowDirection;
    const morph = this.morphology;
    const comeOnBlend = this.comeOnBlend;
    const formationBlend = this.formationBlend;
    const rushBlend = this.comeOnRushBlend;
    const exitBlend = this.comeOnCooldownBlend;
    const scatterDecay = this.scatterActive
      ? 1 - smoothstep(this.scatterTime, 0, cfg.scatterDuration)
      : 0;
    const eventObserverActive = this.comeOnActive || exitBlend > 0;
    const freeSwimBlend = 1 - Math.max(comeOnBlend, formationBlend) * 0.94;
    const t = this.time;

    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    let meanVX = 0;
    let meanVY = 0;
    let meanVZ = 0;

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      const px = p[i3];
      const py = p[i3 + 1];
      const pz = p[i3 + 2];
      const vx = v[i3];
      const vy = v[i3 + 1];
      const vz = v[i3 + 2];
      const speed = Math.hypot(vx, vy, vz) || 1;
      const fx = vx / speed;
      const fy = vy / speed;
      const fz = vz / speed;

      let separationX = 0;
      let separationY = 0;
      let separationZ = 0;
      let alignX = 0;
      let alignY = 0;
      let alignZ = 0;
      let cohesionX = 0;
      let cohesionY = 0;
      let cohesionZ = 0;
      let neighborTurn = 0;
      let weightSum = 0;
      let closeCount = 0;
      let neighborChecks = 0;

      const cx = Math.floor(px * invCell);
      const cy = Math.floor(py * invCell);
      const cz = Math.floor(pz * invCell);

      for (let offsetIndex = 0;
        offsetIndex < NEIGHBOR_OFFSETS.length && neighborChecks < cfg.maxNeighborChecks;
        offsetIndex += 1) {
        const [ox, oy, oz] = NEIGHBOR_OFFSETS[offsetIndex];
        const targetCellX = cx + ox;
        const targetCellY = cy + oy;
        const targetCellZ = cz + oz;
        let j = this.cellHeads[hashCell(targetCellX, targetCellY, targetCellZ)];
        while (j !== -1 && neighborChecks < cfg.maxNeighborChecks) {
          // Hash collisions stay in the same linked bucket. Filter them before
          // they consume the deliberately small neighbor budget.
          if (j !== i && this.cellX[j] === targetCellX &&
            this.cellY[j] === targetCellY && this.cellZ[j] === targetCellZ) {
            neighborChecks += 1;
            const j3 = j * 3;
            const dx = p[j3] - px;
            const dy = p[j3 + 1] - py;
            const dz = p[j3 + 2] - pz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > 0.0001 && d2 < near2) {
              const dist = Math.sqrt(d2);
              const facing = (dx * fx + dy * fy + dz * fz) / dist;
              // Fish attend strongly ahead and sideways; the blind rear cone is weaker.
              const awareness = facing < -0.55 ? 0.18 : 0.62 + 0.38 * (facing + 1) * 0.5;
              const proximity = 1 - dist / cfg.neighborRadius;
              const w = awareness * (0.35 + proximity * 0.65);
              alignX += v[j3] * w;
              alignY += v[j3 + 1] * w;
              alignZ += v[j3 + 2] * w;
              cohesionX += p[j3] * w;
              cohesionY += p[j3 + 1] * w;
              cohesionZ += p[j3 + 2] * w;
              neighborTurn += this.turn[j] * w;
              weightSum += w;

              // The avoidance envelope is longer nose-to-tail than side-to-side.
              // This prevents visual body overlap without making the whole school sparse.
              const longitudinal = dx * fx + dy * fy + dz * fz;
              const lateral2 = Math.max(0, d2 - longitudinal * longitudinal);
              const collisionMetric = lateral2 / separate2 +
                (longitudinal * longitudinal) / (separate2 * 2.89);
              if (collisionMetric < 1) {
                // Normalize by actual distance. The old 0.08 m² floor made
                // the force weakest exactly when two fish overlapped.
                const penetration = 1 - Math.sqrt(collisionMetric);
                const force = penetration * penetration / Math.max(dist, 0.018);
                separationX -= dx * force;
                separationY -= dy * force;
                separationZ -= dz * force;
                closeCount += 1;
              }
            }
          }
          j = this.next[j];
        }
      }

      let steerX = separationX * cfg.separationWeight;
      let steerY = separationY * cfg.separationWeight;
      let steerZ = separationZ * cfg.separationWeight;

      if (this.comeOnPhase === 'gather') {
        const gatherGuide = this.comeOnGatherBlend
          * (1.15 + Math.min(3, this._gatherCorrection.length()) * 0.48);
        steerX += this._gatherCorrection.x * gatherGuide;
        steerY += this._gatherCorrection.y * gatherGuide;
        steerZ += this._gatherCorrection.z * gatherGuide;

        // Cats already in view only turn. Only fringe cats outside the camera
        // cone receive this slow inward correction during the one-second wait.
        const viewX = px - this.comeOnTarget.x;
        const viewY = py - this.comeOnTarget.y;
        const viewZ = pz - this.comeOnTarget.z;
        const viewDepth = viewX * this.comeOnViewForward.x
          + viewY * this.comeOnViewForward.y
          + viewZ * this.comeOnViewForward.z;
        if (viewDepth > 0.05) {
          const lateralX = viewX - this.comeOnViewForward.x * viewDepth;
          const lateralY = viewY - this.comeOnViewForward.y * viewDepth;
          const lateralZ = viewZ - this.comeOnViewForward.z * viewDepth;
          const lateralDistance = Math.hypot(lateralX, lateralY, lateralZ) || 0.0001;
          const allowedRadius = Math.max(0.42, viewDepth * this.comeOnViewTan * 0.96);
          if (lateralDistance > allowedRadius) {
            const fringePressure = (lateralDistance - allowedRadius) / lateralDistance
              * cfg.comeOnFringeGuide * this.comeOnGatherBlend;
            steerX -= lateralX * fringePressure;
            steerY -= lateralY * fringePressure;
            steerZ -= lateralZ * fringePressure;
          }
        }
      }

      if (weightSum > 0) {
        const invWeight = 1 / weightSum;
        const avgVX = alignX * invWeight;
        const avgVY = alignY * invWeight;
        const avgVZ = alignZ * invWeight;
        steerX += (avgVX - vx) * cfg.alignmentWeight * schoolingStrength;
        steerY += (avgVY - vy) * cfg.alignmentWeight * schoolingStrength;
        steerZ += (avgVZ - vz) * cfg.alignmentWeight * schoolingStrength;

        const formationCohesion = 1 - formationBlend * 0.84;
        steerX += (cohesionX * invWeight - px) * cfg.cohesionWeight * schoolingStrength * formationCohesion;
        steerY += (cohesionY * invWeight - py) * cfg.cohesionWeight * schoolingStrength * formationCohesion;
        steerZ += (cohesionZ * invWeight - pz) * cfg.cohesionWeight * schoolingStrength * formationCohesion;
      }

      // Dynamic ellipsoid: center is dense, while selected edge fish breathe outward.
      const rx = px - center.x;
      const ry = py - center.y;
      const rz = pz - center.z;
      const normalizedRadius = Math.sqrt(
        (rx * rx) / (axes.x * axes.x) +
        (ry * ry) / (axes.y * axes.y) +
        (rz * rz) / (axes.z * axes.z)
      );
      const edgeFlutter = this.edgeBias[i] * Math.max(0, Math.sin(t * (0.19 + this.reaction[i] * 0.025) + this.phase[i]));
      const targetRadius = this.radialTarget[i] + edgeFlutter * 0.12;
      const radialError = normalizedRadius - targetRadius;
      // Restore each individual's shell softly in both directions. Without the
      // outward half, cohesion steadily collapsed every population into the
      // same small volume, hiding the count-dependent scale change.
      const shellResponse = radialError >= 0 ? radialError : radialError * 0.42;
      const shapeForce = shellResponse * 2.6 * cfg.shapeWeight * schoolingStrength
        * (1 - formationBlend * 0.96);
      steerX -= (rx / axes.x) * shapeForce;
      steerY -= (ry / axes.y) * shapeForce;
      steerZ -= (rz / axes.z) * shapeForce;

      if (formationBlend > 0) {
        this._sampleFormationTarget(i, this._formationTarget);
        const targetX = this._formationTarget.x - px;
        const targetY = this._formationTarget.y - py;
        const targetZ = this._formationTarget.z - pz;
        const targetDistance = Math.hypot(targetX, targetY, targetZ) || 0.0001;
        const targetSpeed = clamp(
          targetDistance * 1.4,
          this.fishConfig.minSpeed * 0.12,
          this.fishConfig.cruiseSpeed * cfg.formationCruiseFactor,
        );
        const formationGuide = formationBlend
          * cfg.formationGuideStrength
          * (0.82 + this.reaction[i] * 0.18);
        steerX += (targetX / targetDistance * targetSpeed - vx) * formationGuide;
        steerY += (targetY / targetDistance * targetSpeed - vy) * formationGuide;
        steerZ += (targetZ / targetDistance * targetSpeed - vz) * formationGuide;
      }

      const scatterWeight = this.scatterInfluence[i] * scatterDecay;
      if (scatterWeight > 0) {
        let scatterX = px - this.scatterOrigin.x;
        let scatterY = py - this.scatterOrigin.y;
        let scatterZ = pz - this.scatterOrigin.z;
        let scatterDistance = Math.hypot(scatterX, scatterY, scatterZ);
        if (scatterDistance < 0.0001) {
          const scatterAngle = this.phase[i] * 1.618;
          scatterX = Math.cos(scatterAngle);
          scatterY = Math.sin(scatterAngle * 0.73) * 0.55;
          scatterZ = Math.sin(scatterAngle);
          scatterDistance = Math.hypot(scatterX, scatterY, scatterZ);
        }
        const scatterForce = cfg.scatterForce * scatterWeight / scatterDistance;
        steerX += scatterX * scatterForce;
        steerY += scatterY * scatterForce;
        steerZ += scatterZ * scatterForce;
      }

      // Independent X/Z limits describe a rectangular tank, not a cylinder.
      const horizontalMargin = Math.min(
        1.2,
        Math.min(this.waterConfig.width, this.waterConfig.depth) * 0.1,
      );
      const formationBoundary = formationBlend * 4;
      const xLimit = this.waterConfig.width * 0.5 - horizontalMargin + formationBoundary;
      const zLimit = this.waterConfig.depth * 0.5 - horizontalMargin + formationBoundary;
      if (Math.abs(px) > xLimit) {
        steerX -= Math.sign(px) * (Math.abs(px) - xLimit) * 6;
      }
      if (Math.abs(pz) > zLimit) {
        steerZ -= Math.sign(pz) * (Math.abs(pz) - zLimit) * 6;
      }
      const tankHeight = this.waterConfig.surfaceHeight - this.waterConfig.floorHeight;
      const verticalMargin = Math.min(1.2, tankHeight * 0.1);
      const topLimit = this.waterConfig.surfaceHeight - verticalMargin + formationBoundary;
      const bottomLimit = this.waterConfig.floorHeight + verticalMargin - formationBoundary;
      if (py > topLimit) steerY -= (py - topLimit) * 6;
      if (py < bottomLimit) steerY += (bottomLimit - py) * 6;

      // Sardines part around the stationary observer at close range, as a
      // living school would around an unfamiliar body in the water.
      const observerX = px - (eventObserverActive ? this.comeOnTarget.x : 0);
      const observerY = py - (eventObserverActive ? this.comeOnTarget.y : 0);
      const observerZ = pz - (eventObserverActive ? this.comeOnTarget.z : 0);
      const observerDistance = Math.hypot(observerX, observerY, observerZ) || 0.0001;
      const stragglerBlend = exitBlend * (1 - this.comeOnPassed[i]);
      const observerAvoidRadius = THREE.MathUtils.lerp(
        cfg.observerAvoidRadius,
        cfg.comeOnStragglerRadius,
        stragglerBlend,
      );
      if (observerDistance < observerAvoidRadius) {
        const observerPressure = 1 - observerDistance / observerAvoidRadius;
        const avoidForce = observerPressure * observerPressure
          * (2.6 + comeOnBlend * 4.2 + stragglerBlend * 16);
        steerX += (observerX / observerDistance) * avoidForce;
        steerY += (observerY / observerDistance) * avoidForce;
        steerZ += (observerZ / observerDistance) * avoidForce;
      }

      // Once a cat has crossed the camera plane, keep it on the departure side
      // while the school rejoins its orbit. This makes one button press exactly
      // one fly-by even when the normal speed slider is at its maximum.
      const departureProjection = observerX * this.comeOnDirection.x
        + observerY * this.comeOnDirection.y
        + observerZ * this.comeOnDirection.z;
      if (this.comeOnPassed[i] && (this.comeOnActive || exitBlend > 0)) {
        const exitPressure = Math.max(0, cfg.comeOnExitClearance - departureProjection);
        const exitForce = exitPressure * cfg.comeOnExitSteer * Math.max(comeOnBlend, exitBlend);
        steerX += this.comeOnDirection.x * exitForce;
        steerY += this.comeOnDirection.y * exitForce;
        steerZ += this.comeOnDirection.z * exitForce;
      }

      // Split tendency opens gently along a perpendicular before cohesion closes it again.
      const sideX = -flow.z;
      const sideZ = flow.x;
      steerX += sideX * this.splitSide[i] * morph.split * 0.095 * freeSwimBlend;
      steerZ += sideZ * this.splitSide[i] * morph.split * 0.095 * freeSwimBlend;

      // A loose vortex and travelling wave reshape the group without hard state changes.
      steerX += -rz * morph.vortex * 0.022 * freeSwimBlend;
      steerZ += rx * morph.vortex * 0.022 * freeSwimBlend;
      steerY += Math.sin(rx * 0.28 - t * 0.72 + this.phase[i] * 0.13)
        * morph.wave * 0.075 * freeSwimBlend;

      // Front/edge leaders receive a turn first. Alignment carries it through the school.
      const frontness = clamp((rx * flow.x + ry * flow.y + rz * flow.z) / Math.max(axes.x, axes.z), -1, 1);
      const leader = smoothstep(0.28, 0.9, frontness) * (0.35 + this.agility[i] * 0.65);
      const receivedTurn = weightSum > 0 ? neighborTurn / weightSum : 0;
      const targetTurn = clamp(morph.turnPulse * leader + receivedTurn * 0.86, 0, 1);
      this.turn[i] += (targetTurn - this.turn[i]) * (1 - Math.exp(-dt * (0.75 + this.reaction[i] * 1.4)));

      const guideWeight = cfg.flowWeight
        * (0.24 + leader * 0.78 + this.turn[i] * cfg.turnIntensity)
        * (0.12 + schoolingStrength * 0.88)
        * (1 + comeOnBlend * cfg.comeOnGuideBoost)
        * (1 - formationBlend * 0.92);
      const baseCruiseSpeed = this.fishConfig.cruiseSpeed + morph.turnPulse * 0.3
        - closeCount * 0.006;
      const staging = this.comeOnPhase === 'gather' || this.comeOnPhase === 'turn';
      const controlledSpeed = staging
        ? cfg.comeOnGatherSpeed
        : this.comeOnEventSpeed;
      const speedControlBlend = staging
        ? (this.comeOnPhase === 'gather' ? this.comeOnGatherBlend : 1)
        : rushBlend;
      const desiredSpeed = clamp(
        THREE.MathUtils.lerp(baseCruiseSpeed, controlledSpeed, speedControlBlend) * this.speedBias[i],
        this.fishConfig.minSpeed,
        Math.max(this.fishConfig.maxSpeed, controlledSpeed * 1.12 * speedControlBlend),
      );
      steerX += (flow.x * desiredSpeed - vx) * guideWeight;
      steerY += (flow.y * desiredSpeed - vy) * guideWeight;
      steerZ += (flow.z * desiredSpeed - vz) * guideWeight;

      // The call is deliberately more decisive than normal flock guidance.
      // It corrects stale individual headings before the lateral fly-by begins.
      const callGuide = comeOnBlend * (2.8 + this.reaction[i] * 0.8);
      steerX += (flow.x * controlledSpeed - vx) * callGuide;
      steerY += (flow.y * controlledSpeed - vy) * callGuide;
      steerZ += (flow.z * controlledSpeed - vz) * callGuide;

      // Individual micro-currents keep trajectories from becoming mathematically clean.
      steerX += Math.sin(t * 0.73 + this.phase[i]) * cfg.wander * freeSwimBlend;
      steerY += Math.cos(t * 0.61 + this.phase[i] * 1.7) * cfg.wander * 0.55 * freeSwimBlend;
      steerZ += Math.sin(t * 0.57 + this.phase[i] * 2.3) * cfg.wander * freeSwimBlend;

      const steerLength = Math.hypot(steerX, steerY, steerZ);
      const maxSteer = Math.max(
        cfg.maxSteer * (1 + comeOnBlend * 1.8),
        cfg.comeOnMinimumSteer * comeOnBlend,
        cfg.formationGuideStrength * formationBlend,
        cfg.scatterForce * scatterWeight,
      ) * this.agility[i];
      if (steerLength > maxSteer) {
        const s = maxSteer / steerLength;
        steerX *= s;
        steerY *= s;
        steerZ *= s;
      }

      const responseDt = dt * this.reaction[i];
      let nvx = vx + steerX * responseDt;
      let nvy = vy + steerY * responseDt;
      let nvz = vz + steerZ * responseDt;
      const newSpeed = Math.hypot(nvx, nvy, nvz) || 1;
      const normalMinSpeed = this.fishConfig.minSpeed * this.speedBias[i];
      const normalMaxSpeed = this.fishConfig.maxSpeed * this.speedBias[i];
      const eventMinSpeed = controlledSpeed * this.speedBias[i] * 0.86;
      const eventMaxSpeed = controlledSpeed * this.speedBias[i] * 1.12;
      const formationMinSpeed = this.fishConfig.minSpeed * this.speedBias[i] * 0.1;
      const formationMaxSpeed = Math.max(
        this.fishConfig.cruiseSpeed * cfg.formationCruiseFactor * 1.4,
        formationMinSpeed * 1.2,
      );
      const minimumSpeed = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(normalMinSpeed, eventMinSpeed, speedControlBlend),
        formationMinSpeed,
        formationBlend,
      );
      const guidedMaximumSpeed = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(normalMaxSpeed, eventMaxSpeed, speedControlBlend),
        formationMaxSpeed,
        formationBlend,
      );
      const scatterMaximumSpeed = normalMaxSpeed
        * THREE.MathUtils.lerp(1, cfg.scatterSpeedFactor, scatterWeight);
      const maximumSpeed = Math.max(guidedMaximumSpeed, scatterMaximumSpeed);
      const boundedSpeed = clamp(
        newSpeed,
        minimumSpeed,
        maximumSpeed,
      );
      const speedScale = boundedSpeed / newSpeed;
      nvx *= speedScale;
      nvy *= speedScale;
      nvz *= speedScale;

      let nextX = px + nvx * dt;
      let nextY = py + nvy * dt;
      let nextZ = pz + nvz * dt;

      // Steering supplies the living motion; this soft positional response
      // removes the thick fuzzy shell that made the Möbius read as a cloud.
      if (formationBlend > 0) {
        this._sampleFormationTarget(i, this._formationTarget);
        const precisionBlend = this.formationType === 'mobius'
          ? smoothstep(this.formationEntryProgress, 0.28, 1)
          : 1;
        const formationPositionAlpha = (1 - Math.exp(-dt * cfg.formationPositionResponse))
          * formationBlend
          * precisionBlend;
        nextX += (this._formationTarget.x - nextX) * formationPositionAlpha;
        nextY += (this._formationTarget.y - nextY) * formationPositionAlpha;
        nextZ += (this._formationTarget.z - nextZ) * formationPositionAlpha;
      }

      if (exitBlend > 0) {
        let stragglerX = nextX - this.comeOnTarget.x;
        let stragglerY = nextY - this.comeOnTarget.y;
        let stragglerZ = nextZ - this.comeOnTarget.z;
        const stragglerDistance = Math.hypot(stragglerX, stragglerY, stragglerZ) || 0.0001;
        const stragglerHardRadius = cfg.comeOnStragglerHardRadius;
        if (stragglerDistance < stragglerHardRadius) {
          const inverseDistance = 1 / stragglerDistance;
          stragglerX *= inverseDistance;
          stragglerY *= inverseDistance;
          stragglerZ *= inverseDistance;
          nextX = this.comeOnTarget.x + stragglerX * stragglerHardRadius;
          nextY = this.comeOnTarget.y + stragglerY * stragglerHardRadius;
          nextZ = this.comeOnTarget.z + stragglerZ * stragglerHardRadius;
          const inwardSpeed = nvx * stragglerX + nvy * stragglerY + nvz * stragglerZ;
          if (inwardSpeed < 0) {
            nvx -= stragglerX * inwardSpeed;
            nvy -= stragglerY * inwardSpeed;
            nvz -= stragglerZ * inwardSpeed;
          }
        }
      }

      if (this.comeOnPassed[i] && (this.comeOnActive || exitBlend > 0)) {
        const nextProjection = (nextX - this.comeOnTarget.x) * this.comeOnDirection.x
          + (nextY - this.comeOnTarget.y) * this.comeOnDirection.y
          + (nextZ - this.comeOnTarget.z) * this.comeOnDirection.z;
        const minimumProjection = 0.42 + exitBlend * 0.58;
        if (nextProjection < minimumProjection) {
          const correction = minimumProjection - nextProjection;
          nextX += this.comeOnDirection.x * correction;
          nextY += this.comeOnDirection.y * correction;
          nextZ += this.comeOnDirection.z * correction;
          const returnSpeed = nvx * this.comeOnDirection.x
            + nvy * this.comeOnDirection.y
            + nvz * this.comeOnDirection.z;
          if (returnSpeed < 0) {
            nvx -= this.comeOnDirection.x * returnSpeed;
            nvy -= this.comeOnDirection.y * returnSpeed;
            nvz -= this.comeOnDirection.z * returnSpeed;
          }
        }
      }

      // Stop delayed individuals before proximity alone makes them look huge.
      const nextObserverX = nextX - (eventObserverActive ? this.comeOnTarget.x : 0);
      const nextObserverY = nextY - (eventObserverActive ? this.comeOnTarget.y : 0);
      const nextObserverZ = nextZ - (eventObserverActive ? this.comeOnTarget.z : 0);
      const nextObserverDistance = Math.hypot(nextObserverX, nextObserverY, nextObserverZ) || 0.0001;
      if (nextObserverDistance < cfg.observerHardRadius) {
        const nx = nextObserverX / nextObserverDistance;
        const ny = nextObserverY / nextObserverDistance;
        const nz = nextObserverZ / nextObserverDistance;
        nextX = (eventObserverActive ? this.comeOnTarget.x : 0) + nx * cfg.observerHardRadius;
        nextY = (eventObserverActive ? this.comeOnTarget.y : 0) + ny * cfg.observerHardRadius;
        nextZ = (eventObserverActive ? this.comeOnTarget.z : 0) + nz * cfg.observerHardRadius;
        const inwardSpeed = nvx * nx + nvy * ny + nvz * nz;
        if (inwardSpeed < 0) {
          // Cancel only the inward component. Reversing it made close fish
          // look as if they bounced off an invisible oversized camera.
          nvx -= nx * inwardSpeed;
          nvy -= ny * inwardSpeed;
          nvz -= nz * inwardSpeed;
        }
      }

      // Final safety skin at the glass. The soft field above handles almost all
      // turns; this only prevents a delayed edge fish from crossing the tank.
      const hardFormationBoundary = formationBlend * 4;
      const hardTop = this.waterConfig.surfaceHeight - 0.3 + hardFormationBoundary;
      const hardBottom = this.waterConfig.floorHeight + 0.3 - hardFormationBoundary;
      if (nextY > hardTop) {
        nextY = hardTop;
        nvy = -Math.abs(nvy) * 0.65;
      } else if (nextY < hardBottom) {
        nextY = hardBottom;
        nvy = Math.abs(nvy) * 0.65;
      }
      const hardX = this.waterConfig.width * 0.5 - 0.35 + hardFormationBoundary;
      const hardZ = this.waterConfig.depth * 0.5 - 0.35 + hardFormationBoundary;
      if (Math.abs(nextX) > hardX) {
        nextX = Math.sign(nextX) * hardX;
        nvx = -Math.sign(nextX) * Math.abs(nvx) * 0.65;
      }
      if (Math.abs(nextZ) > hardZ) {
        nextZ = Math.sign(nextZ) * hardZ;
        nvz = -Math.sign(nextZ) * Math.abs(nvz) * 0.65;
      }

      // Last-resort body envelope. Steering remains the visible avoidance
      // mechanism; this tiny projection only catches discrete-time crossings
      // that would otherwise put multiple instance centers on top of each other.
      const bodySpacing = 0.062;
      const bodySpacing2 = bodySpacing * bodySpacing;
      const bodyCellX = Math.floor(nextX / BODY_CELL_SIZE);
      const bodyCellY = Math.floor(nextY / BODY_CELL_SIZE);
      const bodyCellZ = Math.floor(nextZ / BODY_CELL_SIZE);
      for (let offsetIndex = 0; offsetIndex < NEIGHBOR_OFFSETS.length; offsetIndex += 1) {
        const [ox, oy, oz] = NEIGHBOR_OFFSETS[offsetIndex];
        let j = this.bodyCellHeads[hashBodyCell(
          bodyCellX + ox,
          bodyCellY + oy,
          bodyCellZ + oz,
        )];
        while (j !== -1) {
          if (j !== i) {
            const j3 = j * 3;
            let dx = nextX - p[j3];
            let dy = nextY - p[j3 + 1];
            let dz = nextZ - p[j3 + 2];
            let distance2 = dx * dx + dy * dy + dz * dz;
            if (distance2 < bodySpacing2) {
              let distance = Math.sqrt(distance2);
              if (distance < 0.0001) {
                const fallbackAngle = this.phase[i] + j * 1.618;
                dx = Math.cos(fallbackAngle);
                dy = Math.sin(fallbackAngle * 0.71) * 0.45;
                dz = Math.sin(fallbackAngle);
                distance = Math.hypot(dx, dy, dz);
                distance2 = distance * distance;
              }
              const inverseDistance = 1 / Math.sqrt(distance2);
              const nx = dx * inverseDistance;
              const ny = dy * inverseDistance;
              const nz = dz * inverseDistance;
              const correction = bodySpacing - Math.sqrt(distance2);
              nextX += nx * correction;
              nextY += ny * correction;
              nextZ += nz * correction;
              const closingSpeed = nvx * nx + nvy * ny + nvz * nz;
              if (closingSpeed < 0) {
                nvx -= nx * closingSpeed;
                nvy -= ny * closingSpeed;
                nvz -= nz * closingSpeed;
              }
            }
          }
          j = this.bodyNext[j];
        }
      }

      // Signed heading curvature drives the rendered body bend. It follows
      // actual motion rather than the global turn pulse, so left and right
      // turns flex in opposite directions and settle smoothly afterward.
      const finalSpeed = Math.hypot(nvx, nvy, nvz) || 1;
      const ndx = nvx / finalSpeed;
      const ndz = nvz / finalSpeed;
      const targetBend = clamp((fx * ndz - fz * ndx) * 14, -1, 1);
      this.bend[i] += (targetBend - this.bend[i]) * (1 - Math.exp(-dt * 7.5));

      v[i3] = nvx;
      v[i3 + 1] = nvy;
      v[i3 + 2] = nvz;
      p[i3] = nextX;
      p[i3 + 1] = nextY;
      p[i3 + 2] = nextZ;

      centerX += p[i3];
      centerY += p[i3 + 1];
      centerZ += p[i3 + 2];
      meanVX += nvx;
      meanVY += nvy;
      meanVZ += nvz;
    }

    // Rebuild from the final frame positions and resolve the rare case where
    // two fast fish cross between discrete simulation steps.
    this._resolveBodyOverlaps();

    if ((this.comeOnActive && this.comeOnPhase === 'rush')
      || this.comeOnCooldownTime > 0) {
      let passedCount = 0;
      for (let i = 0; i < this.count; i += 1) {
        const i3 = i * 3;
        let passX = p[i3] - this.comeOnTarget.x;
        let passY = p[i3 + 1] - this.comeOnTarget.y;
        let passZ = p[i3 + 2] - this.comeOnTarget.z;
        const headDistance = Math.hypot(passX, passY, passZ);
        if (headDistance < cfg.observerHardRadius) {
          if (headDistance < 0.0001) {
            passX = this.comeOnSide.x * cfg.observerHardRadius;
            passY = this.comeOnSide.y * cfg.observerHardRadius;
            passZ = this.comeOnSide.z * cfg.observerHardRadius;
          } else {
            const headScale = cfg.observerHardRadius / headDistance;
            passX *= headScale;
            passY *= headScale;
            passZ *= headScale;
          }
          p[i3] = this.comeOnTarget.x + passX;
          p[i3 + 1] = this.comeOnTarget.y + passY;
          p[i3 + 2] = this.comeOnTarget.z + passZ;
        }
        if (passX * this.comeOnDirection.x
          + passY * this.comeOnDirection.y
          + passZ * this.comeOnDirection.z > 0) {
          this.comeOnPassed[i] = 1;
        }
        passedCount += this.comeOnPassed[i];
      }
      this.comeOnPassedFraction = passedCount / this.count;
    }

    const invCount = 1 / this.count;
    this.visualCenter.set(centerX * invCount, centerY * invCount, centerZ * invCount);
    this.meanVelocity.set(meanVX * invCount, meanVY * invCount, meanVZ * invCount);
  }
}
