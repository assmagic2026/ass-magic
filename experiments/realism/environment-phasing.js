import * as THREE from "../../three.module.js";

const PHASE_CONFIG = Object.freeze({
  predictionMinSeconds: 0.15,
  predictionMaxSeconds: 0.5,
  predictionBodyMargin: 0.85,
  triggerPenetration: 0.8,
  triggerHardPenetration: 3.5,
  triggerCorrectionSpeed: 5.5,
  safeClearance: 2.8,
  predictedSafeClearance: 2.1,
  safeConfirmSeconds: 0.22,
  dematerializeSeconds: 0.13,
  exitSearchSeconds: 0.11,
  rematerializeSeconds: 0.2,
  recoverySeconds: 0.52,
  cooldownSeconds: 0.72,
  maximumSeconds: 3.4,
  fallbackResponse: 5.2,
  minimumThroughSpeed: 14,
  minimumPlanetClearance: 1.4,
  protectedPadding: 4,
});

const EXIT_CANDIDATES = Object.freeze([
  { yaw: 0, climb: 0, inputBias: 0 },
  { yaw: 0, climb: 5.5, inputBias: 0 },
  { yaw: -0.28, climb: 2.4, inputBias: -1 },
  { yaw: 0.28, climb: 2.4, inputBias: 1 },
  { yaw: -0.56, climb: 4.5, inputBias: -1 },
  { yaw: 0.56, climb: 4.5, inputBias: 1 },
  { yaw: 0, climb: 9, inputBias: 0 },
]);

const PREDICTION_SAMPLES = Object.freeze([0.42, 0.7, 1]);
const EXIT_SAMPLES = 7;
const PHASE_COLOR = new THREE.Color(0x8feaff);

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.16, "rgba(164,239,255,0.78)");
  gradient.addColorStop(0.48, "rgba(80,192,255,0.26)");
  gradient.addColorStop(1, "rgba(20,92,170,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smoothstep01(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function createEnvironmentPhasing({
  scene,
  canvas,
  flight,
  playerObject,
  camera,
  quality = "standard",
  getSurfaceRadius,
  playerClearance,
  minimumRadius,
  protectedZones = [],
}) {
  const state = {
    phase: "normal",
    phaseElapsed: 0,
    totalElapsed: 0,
    safeElapsed: 0,
    recoveryElapsed: 0,
    cooldown: 0,
    visualMix: 0,
    scanElapsed: Infinity,
    predictionSeconds: 0,
    minimumPredictedGap: Infinity,
    entrySpeed: 0,
    entryRadialSpeed: 0,
    exitRadialTarget: 0,
    startPosition: new THREE.Vector3(),
    lastSafePosition: new THREE.Vector3(),
    entryForward: new THREE.Vector3(),
    exitForward: new THREE.Vector3(),
    collisionNormal: new THREE.Vector3(),
    fallbackTarget: new THREE.Vector3(),
  };

  const materialStates = new Map();
  const protectedWorldPosition = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const predictedUp = new THREE.Vector3();
  const predictedPosition = new THREE.Vector3();
  const predictedForward = new THREE.Vector3();
  const desiredForward = new THREE.Vector3();
  const candidateForward = new THREE.Vector3();
  const candidateAxis = new THREE.Vector3();
  const candidateUp = new THREE.Vector3();
  const nextUp = new THREE.Vector3();
  const nextForward = new THREE.Vector3();
  const fallbackUp = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();

  const glowTexture = createGlowTexture();
  const visualRoot = new THREE.Group();
  visualRoot.name = "EnvironmentPhaseVisual";
  visualRoot.visible = false;
  const auraMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xa8efff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  auraMaterial.toneMapped = false;
  const aura = new THREE.Sprite(auraMaterial);
  visualRoot.add(aura);
  const trailCount = quality === "high" ? 4 : quality === "standard" ? 2 : 1;
  const trails = [];
  for (let index = 0; index < trailCount; index += 1) {
    const material = auraMaterial.clone();
    material.opacity = 0;
    const sprite = new THREE.Sprite(material);
    visualRoot.add(sprite);
    trails.push(sprite);
  }
  scene.add(visualRoot);

  function setPhase(nextPhase) {
    state.phase = nextPhase;
    state.phaseElapsed = 0;
    canvas.dataset.environmentPhase = nextPhase;
  }

  function isMovementControlled() {
    return state.phase === "dematerializing"
      || state.phase === "exit-search"
      || state.phase === "phasing"
      || state.phase === "safe-check"
      || state.phase === "fallback"
      || state.phase === "rematerializing";
  }

  function isNearProtected(position, padding = 0) {
    for (const zone of protectedZones) {
      const object = zone.object;
      if (!object || !object.parent || !object.visible) continue;
      object.getWorldPosition(protectedWorldPosition);
      if (position.distanceToSquared(protectedWorldPosition) <= (zone.radius + padding) ** 2) return true;
    }
    return false;
  }

  function getGap(direction, radius, margin = 0) {
    return radius - getSurfaceRadius(direction) - playerClearance - margin;
  }

  function rememberMaterial(material) {
    if (!material || materialStates.has(material)) return;
    materialStates.set(material, {
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
      depthTest: material.depthTest,
      emissive: material.emissive?.clone() || null,
      emissiveIntensity: material.emissiveIntensity,
    });
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = false;
    material.needsUpdate = true;
  }

  function collectPlayerMaterials() {
    playerObject.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      if (Array.isArray(object.material)) object.material.forEach(rememberMaterial);
      else rememberMaterial(object.material);
    });
  }

  function applyPlayerMaterials(mix) {
    if (mix > 0.001) collectPlayerMaterials();
    for (const [material, original] of materialStates) {
      material.opacity = THREE.MathUtils.lerp(original.opacity, Math.max(0.18, original.opacity * 0.28), mix);
      if (original.emissive && material.emissive) {
        material.emissive.copy(original.emissive).lerp(PHASE_COLOR, mix * 0.72);
        material.emissiveIntensity = THREE.MathUtils.lerp(
          Number.isFinite(original.emissiveIntensity) ? original.emissiveIntensity : 0,
          quality === "high" ? 2.4 : quality === "standard" ? 1.65 : 1.05,
          mix,
        );
      }
    }
  }

  function restorePlayerMaterials() {
    for (const [material, original] of materialStates) {
      material.opacity = original.opacity;
      material.transparent = original.transparent;
      material.depthWrite = original.depthWrite;
      material.depthTest = original.depthTest;
      if (original.emissive && material.emissive) material.emissive.copy(original.emissive);
      if (Number.isFinite(original.emissiveIntensity)) material.emissiveIntensity = original.emissiveIntensity;
      material.needsUpdate = true;
    }
    materialStates.clear();
  }

  function updateVisual() {
    const mix = THREE.MathUtils.clamp(state.visualMix, 0, 1);
    applyPlayerMaterials(mix);
    visualRoot.visible = mix > 0.01;
    document.body.classList.toggle("is-environment-phasing", mix > 0.01);
    if (!visualRoot.visible) return;
    const pulse = 0.92 + Math.sin(state.totalElapsed * 18) * 0.08;
    aura.position.copy(flight.position);
    aura.scale.setScalar((quality === "high" ? 6.8 : quality === "standard" ? 5.8 : 4.8) * pulse);
    aura.material.opacity = mix * (quality === "low" ? 0.34 : 0.48);
    for (let index = 0; index < trails.length; index += 1) {
      const trail = trails[index];
      const distance = (index + 1) * (0.7 + Math.min(1.6, flight.speed * 0.012));
      trail.position.copy(flight.position).addScaledVector(flight.forward, -distance);
      trail.scale.setScalar((4.2 - index * 0.54) * (quality === "low" ? 0.72 : 1));
      trail.material.opacity = mix * Math.max(0.07, 0.28 - index * 0.052);
    }
  }

  function restoreNormalState() {
    state.visualMix = 0;
    setPhase("normal");
    state.safeElapsed = 0;
    document.body.classList.remove("is-environment-phasing");
    visualRoot.visible = false;
    restorePlayerMaterials();
  }

  function evaluateExit(upDirection, forward, currentRadius, speed, turnInput) {
    const duration = THREE.MathUtils.clamp(
      Math.max(42, speed * 2.7) / Math.max(speed, PHASE_CONFIG.minimumThroughSpeed),
      1.35,
      PHASE_CONFIG.maximumSeconds - 0.2,
    );
    let bestScore = Infinity;
    let bestClimb = 0;
    state.exitForward.copy(forward);
    for (const candidate of EXIT_CANDIDATES) {
      candidateForward.copy(forward).applyAxisAngle(upDirection, candidate.yaw).normalize();
      candidateAxis.crossVectors(upDirection, candidateForward).normalize();
      let interiorCost = 0;
      let finalGap = -Infinity;
      for (let sample = 1; sample <= EXIT_SAMPLES; sample += 1) {
        const ratio = sample / EXIT_SAMPLES;
        const time = duration * ratio;
        const angle = (Math.max(speed, PHASE_CONFIG.minimumThroughSpeed) * time) / currentRadius;
        candidateUp.copy(upDirection).applyAxisAngle(candidateAxis, angle).normalize();
        const radius = currentRadius
          + (state.entryRadialSpeed * 0.32 + candidate.climb) * time;
        const gap = getGap(candidateUp, radius, PHASE_CONFIG.predictionBodyMargin);
        interiorCost += Math.max(0, -gap) * (0.72 + ratio * 0.55);
        if (sample === EXIT_SAMPLES) finalGap = gap;
      }
      const inputCost = Math.abs(candidate.inputBias - Math.sign(turnInput))
        * Math.min(1, Math.abs(turnInput)) * 1.6;
      const score = interiorCost * 2.2
        + Math.abs(candidate.yaw) * 8
        + candidate.climb * 0.38
        + inputCost
        + Math.max(0, PHASE_CONFIG.safeClearance - finalGap) * 3.2;
      if (score < bestScore) {
        bestScore = score;
        bestClimb = candidate.climb;
        state.exitForward.copy(candidateForward);
      }
    }
    state.exitRadialTarget = bestClimb;
  }

  function beginPhase({ up: upDirection, forward, currentRadius, turnInput, collisionDirection }) {
    state.startPosition.copy(flight.position);
    if (state.lastSafePosition.lengthSq() < 0.0001) state.lastSafePosition.copy(flight.position);
    state.entryForward.copy(forward);
    state.entrySpeed = flight.speed;
    state.entryRadialSpeed = flight.radialSpeed;
    flight.descendHeld = false;
    flight.descentElapsed = 0;
    flight.descentKick = 0;
    state.collisionNormal.copy(collisionDirection);
    state.totalElapsed = 0;
    state.safeElapsed = 0;
    state.recoveryElapsed = 0;
    state.visualMix = 0;
    evaluateExit(upDirection, forward, currentRadius, flight.speed, turnInput);
    collectPlayerMaterials();
    document.body.classList.add("is-environment-phasing");
    setPhase("dematerializing");
  }

  function predict({
    currentRadius,
    up: upDirection,
    forward,
    right: rightDirection,
    speed,
    radialSpeed,
    turnInput = 0,
    terrainAssistStrength = 0,
  }) {
    if (isMovementControlled() || state.phase === "recovering") return isMovementControlled();
    const scanInterval = quality === "high" ? 0.032 : quality === "standard" ? 0.04 : 0.055;
    if (state.scanElapsed < scanInterval) return false;
    state.scanElapsed = 0;
    state.phase = "predicting";
    canvas.dataset.environmentPhase = "predicting";
    const speedMix = THREE.MathUtils.smoothstep(speed, 12, 120);
    const horizon = THREE.MathUtils.lerp(
      PHASE_CONFIG.predictionMinSeconds,
      PHASE_CONFIG.predictionMaxSeconds,
      speedMix,
    );
    state.predictionSeconds = horizon;
    let minimumGap = Infinity;
    let requiredCorrection = 0;
    predictedUp.copy(upDirection);
    for (const ratio of PREDICTION_SAMPLES) {
      const time = horizon * ratio;
      const angle = (speed * time) / Math.max(currentRadius, 1);
      predictedUp.copy(upDirection).applyAxisAngle(rightDirection, angle).normalize();
      const projectedRadius = currentRadius + radialSpeed * time;
      const requiredRadius = getSurfaceRadius(predictedUp)
        + playerClearance
        + PHASE_CONFIG.predictionBodyMargin;
      const gap = projectedRadius - requiredRadius;
      if (gap < minimumGap) {
        minimumGap = gap;
        state.collisionNormal.copy(predictedUp);
      }
      requiredCorrection = Math.max(
        requiredCorrection,
        (requiredRadius - currentRadius) / Math.max(time, 0.001) - radialSpeed,
      );
    }
    state.minimumPredictedGap = minimumGap;
    const hardThreat = minimumGap < -PHASE_CONFIG.triggerHardPenetration;
    const correctionThreat = minimumGap < -PHASE_CONFIG.triggerPenetration
      && requiredCorrection > PHASE_CONFIG.triggerCorrectionSpeed;
    const assistThreat = terrainAssistStrength > 0.9 && minimumGap < 0.25 && speed > 24;
    const lowSpeedMinorContact = speed < 18 && minimumGap > -4.5 && requiredCorrection < 9;
    let protectedEventNearby = isNearProtected(flight.position, PHASE_CONFIG.protectedPadding);
    if (!protectedEventNearby) {
      predictedPosition.copy(state.collisionNormal).multiplyScalar(
        getSurfaceRadius(state.collisionNormal) + playerClearance,
      );
      protectedEventNearby = isNearProtected(predictedPosition, PHASE_CONFIG.protectedPadding);
    }
    const cooldownAllowsEmergency = state.cooldown <= 0 || minimumGap < -7;
    if (
      cooldownAllowsEmergency
      && !protectedEventNearby
      && !lowSpeedMinorContact
      && (hardThreat || correctionThreat || assistThreat)
    ) {
      beginPhase({
        up: upDirection,
        forward,
        currentRadius,
        turnInput,
        collisionDirection: state.collisionNormal,
      });
      return true;
    }
    setPhase("normal");
    return false;
  }

  function isSafeForRematerialization(upDirection, radius) {
    const gap = getGap(upDirection, radius);
    if (gap < PHASE_CONFIG.safeClearance) return false;
    right.crossVectors(upDirection, flight.forward).normalize();
    const checkTime = THREE.MathUtils.clamp(
      PHASE_CONFIG.predictionMinSeconds + flight.speed / 420,
      PHASE_CONFIG.predictionMinSeconds,
      0.36,
    );
    predictedUp.copy(upDirection)
      .applyAxisAngle(right, (flight.speed * checkTime) / Math.max(radius, 1))
      .normalize();
    const predictedRadius = radius + flight.radialSpeed * checkTime;
    if (getGap(predictedUp, predictedRadius) < PHASE_CONFIG.predictedSafeClearance) return false;
    if (camera.position.lengthSq() > 1) {
      cameraUp.copy(camera.position).normalize();
      if (camera.position.length() - getSurfaceRadius(cameraUp) < 0.45) return false;
    }
    predictedPosition.copy(upDirection).multiplyScalar(radius);
    return !isNearProtected(predictedPosition, PHASE_CONFIG.protectedPadding);
  }

  function startFallback(upDirection) {
    const safeRadius = getSurfaceRadius(upDirection)
      + playerClearance
      + PHASE_CONFIG.safeClearance
      + 7;
    state.fallbackTarget.copy(upDirection).multiplyScalar(safeRadius);
    state.exitRadialTarget = Math.max(7, state.exitRadialTarget);
    setPhase("fallback");
  }

  function updateControlled(delta, { turnInput = 0, verticalIntent = 0 } = {}) {
    if (!isMovementControlled()) return null;
    state.phaseElapsed += delta;
    state.totalElapsed += delta;

    if (state.phase === "dematerializing") {
      state.visualMix = smoothstep01(state.phaseElapsed / PHASE_CONFIG.dematerializeSeconds);
      if (state.phaseElapsed >= PHASE_CONFIG.dematerializeSeconds) setPhase("exit-search");
    } else if (state.phase === "exit-search") {
      state.visualMix = 1;
      if (state.phaseElapsed >= PHASE_CONFIG.exitSearchSeconds) setPhase("phasing");
    } else if (state.phase === "rematerializing") {
      state.visualMix = 1 - smoothstep01(state.phaseElapsed / PHASE_CONFIG.rematerializeSeconds);
    } else {
      state.visualMix = 1;
    }

    up.copy(flight.position).normalize();
    const currentRadius = flight.position.length();
    const currentGap = getGap(up, currentRadius);

    if (state.phase === "fallback") {
      if (state.phaseElapsed > 1.1 && state.lastSafePosition.lengthSq() > 0.0001) {
        state.fallbackTarget.copy(state.lastSafePosition);
      }
      fallbackUp.copy(flight.position).normalize();
      desiredForward.copy(state.fallbackTarget).sub(flight.position)
        .addScaledVector(fallbackUp, -desiredForward.dot(fallbackUp));
      if (desiredForward.lengthSq() < 0.0001) {
        desiredForward.copy(state.entryForward).multiplyScalar(-1)
          .addScaledVector(fallbackUp, state.entryForward.dot(fallbackUp));
      }
      if (desiredForward.lengthSq() > 0.0001) {
        desiredForward.normalize();
        flight.forward.lerp(desiredForward, 1 - Math.exp(-3.8 * delta)).normalize();
      }
      flight.position.lerp(
        state.fallbackTarget,
        1 - Math.exp(-PHASE_CONFIG.fallbackResponse * delta),
      );
      flight.speed = THREE.MathUtils.damp(
        flight.speed,
        Math.max(PHASE_CONFIG.minimumThroughSpeed, state.entrySpeed * 0.65),
        2.4,
        delta,
      );
      flight.radialSpeed = THREE.MathUtils.damp(flight.radialSpeed, 6, 3.2, delta);
    } else {
      state.exitForward.addScaledVector(up, -state.exitForward.dot(up));
      if (state.exitForward.lengthSq() < 0.0001) state.exitForward.copy(flight.forward);
      state.exitForward.normalize();
      desiredForward.copy(state.exitForward)
        .applyAxisAngle(up, turnInput * 0.2)
        .normalize();
      flight.forward.lerp(desiredForward, 1 - Math.exp(-2.8 * delta)).normalize();
      flight.forward.addScaledVector(up, -flight.forward.dot(up)).normalize();

      const speedTarget = Math.max(
        PHASE_CONFIG.minimumThroughSpeed,
        state.entrySpeed * 0.78,
        flight.speedSelection * 0.58,
      );
      flight.speed = THREE.MathUtils.damp(flight.speed, speedTarget, 2.1, delta);
      const descentRelease = THREE.MathUtils.smoothstep(currentGap, 1.2, 8);
      let radialTarget = state.exitRadialTarget;
      if (verticalIntent > 0.025) radialTarget += verticalIntent * 8.5;
      if (verticalIntent < -0.025) radialTarget += verticalIntent * 7.5 * descentRelease;
      if (currentGap < 0) radialTarget = Math.max(radialTarget, Math.min(8, 1.2 - currentGap * 0.38));
      flight.radialSpeed = THREE.MathUtils.damp(flight.radialSpeed, radialTarget, 2.65, delta);

      right.crossVectors(up, flight.forward).normalize();
      const moveAngle = (flight.speed * delta) / Math.max(currentRadius, 1);
      nextUp.copy(up).applyAxisAngle(right, moveAngle).normalize();
      nextForward.copy(flight.forward).applyAxisAngle(right, moveAngle).normalize();
      nextForward.addScaledVector(nextUp, -nextForward.dot(nextUp)).normalize();
      const nextRadius = Math.max(
        minimumRadius + PHASE_CONFIG.minimumPlanetClearance,
        currentRadius + flight.radialSpeed * delta,
      );
      flight.position.copy(nextUp).multiplyScalar(nextRadius);
      flight.forward.copy(nextForward);
    }

    flight.onGround = false;
    up.copy(flight.position).normalize();
    const radius = flight.position.length();
    const safe = isSafeForRematerialization(up, radius);

    if (state.phase !== "rematerializing") {
      if (safe && state.totalElapsed > PHASE_CONFIG.dematerializeSeconds + 0.12) {
        state.safeElapsed += delta;
        if (state.phase !== "safe-check" && state.phase !== "fallback") setPhase("safe-check");
        if (state.safeElapsed >= PHASE_CONFIG.safeConfirmSeconds) setPhase("rematerializing");
      } else {
        state.safeElapsed = 0;
        if (state.phase === "safe-check") setPhase("phasing");
      }
      if (
        state.totalElapsed >= PHASE_CONFIG.maximumSeconds
        && state.phase !== "fallback"
        && state.phase !== "rematerializing"
      ) {
        startFallback(up);
      }
    } else if (!safe) {
      state.safeElapsed = 0;
      setPhase("phasing");
      state.visualMix = 1;
    } else if (state.phaseElapsed >= PHASE_CONFIG.rematerializeSeconds) {
      state.recoveryElapsed = 0;
      state.cooldown = PHASE_CONFIG.cooldownSeconds;
      setPhase("recovering");
    }

    updateVisual();
    return true;
  }

  function observeSafePosition(position) {
    if (isMovementControlled() || state.phase === "recovering") return;
    up.copy(position).normalize();
    const radius = position.length();
    if (getGap(up, radius) >= PHASE_CONFIG.safeClearance + 1.2 && !isNearProtected(position, 1)) {
      state.lastSafePosition.copy(position);
    }
  }

  function beginFrame(delta, { paused = false } = {}) {
    state.cooldown = Math.max(0, state.cooldown - delta);
    state.scanElapsed += delta;
    if (paused && isMovementControlled()) {
      restoreNormalState();
      return;
    }
    if (state.phase === "recovering") {
      state.recoveryElapsed += delta;
      state.visualMix = 0;
      updateVisual();
      if (state.recoveryElapsed >= PHASE_CONFIG.recoverySeconds) restoreNormalState();
    } else if (!isMovementControlled()) {
      updateVisual();
    }
  }

  function reset() {
    state.cooldown = 0;
    state.scanElapsed = Infinity;
    state.totalElapsed = 0;
    state.recoveryElapsed = 0;
    restoreNormalState();
  }

  function dispose() {
    reset();
    visualRoot.removeFromParent();
    auraMaterial.dispose();
    for (const trail of trails) trail.material.dispose();
    glowTexture.dispose();
  }

  canvas.dataset.environmentPhase = "normal";
  return {
    state,
    predict,
    updateControlled,
    observeSafePosition,
    beginFrame,
    reset,
    dispose,
    isMovementControlled,
    isCollisionSuppressed: () => isMovementControlled() || state.phase === "recovering",
    getCameraDistanceScale: () => THREE.MathUtils.lerp(1, 0.68, state.visualMix),
    getCameraSafetyMix: () => state.visualMix,
  };
}
