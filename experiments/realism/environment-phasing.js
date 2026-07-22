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
  dematerializeSeconds: 0.24,
  exitSearchSeconds: 0.11,
  rematerializeSeconds: 0.34,
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

function createBurstRingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const ring = context.createRadialGradient(128, 128, 76, 128, 128, 126);
  ring.addColorStop(0, "rgba(114,142,157,0)");
  ring.addColorStop(0.54, "rgba(135,169,185,0.025)");
  ring.addColorStop(0.71, "rgba(211,228,233,0.42)");
  ring.addColorStop(0.75, "rgba(126,162,180,0.62)");
  ring.addColorStop(0.8, "rgba(86,111,130,0.14)");
  ring.addColorStop(1, "rgba(29,39,55,0)");
  context.fillStyle = ring;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEventHorizonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const horizon = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  horizon.addColorStop(0, "rgba(0,2,7,0.96)");
  horizon.addColorStop(0.34, "rgba(1,5,12,0.92)");
  horizon.addColorStop(0.52, "rgba(6,13,23,0.82)");
  horizon.addColorStop(0.62, "rgba(172,204,216,0.38)");
  horizon.addColorStop(0.68, "rgba(78,106,124,0.16)");
  horizon.addColorStop(0.82, "rgba(29,46,64,0.045)");
  horizon.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = horizon;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpacetimeVortexTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.translate(256, 256);
  context.scale(1, 0.76);
  const arms = [
    [0, 4.8, "rgba(210,224,228,0.56)"],
    [Math.PI * 0.34, 3.4, "rgba(111,139,154,0.46)"],
    [Math.PI * 0.68, 4.1, "rgba(171,183,197,0.44)"],
    [Math.PI, 3.1, "rgba(86,109,126,0.42)"],
    [Math.PI * 1.34, 3.8, "rgba(198,211,214,0.4)"],
    [Math.PI * 1.68, 2.8, "rgba(105,119,143,0.38)"],
  ];
  for (const [phase, width, color] of arms) {
    for (let trail = 0; trail < 3; trail += 1) {
      context.globalAlpha = 1 - trail * 0.26;
      context.strokeStyle = color;
      context.lineWidth = width * (1 - trail * 0.18);
      context.lineCap = "round";
      context.beginPath();
      for (let step = 0; step <= 150; step += 1) {
        const ratio = step / 150;
        const angle = phase + trail * 0.042 + ratio * Math.PI * 3.65;
        const radius = 12 + trail * 3.6 + Math.pow(ratio, 0.82) * 218;
        const turbulence = Math.sin(ratio * Math.PI * 9 + phase * 1.7) * (2 + ratio * 5.5);
        const x = Math.cos(angle) * (radius + turbulence);
        const y = Math.sin(angle) * (radius - turbulence * 0.42);
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 7; index += 1) {
    const radius = 44 + index * 24;
    const start = index * 0.77;
    context.strokeStyle = `rgba(171,194,203,${0.14 - index * 0.012})`;
    context.lineWidth = Math.max(0.55, 1.3 - index * 0.1);
    context.beginPath();
    context.arc(0, 0, radius, start, start + Math.PI * (0.72 + index * 0.035));
    context.stroke();
  }
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
  renderer,
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
    phaseStarts: 0,
    entrySpeed: 0,
    entryRadialSpeed: 0,
    exitRadialTarget: 0,
    startPosition: new THREE.Vector3(),
    lastSafePosition: new THREE.Vector3(),
    entryForward: new THREE.Vector3(),
    exitForward: new THREE.Vector3(),
    collisionNormal: new THREE.Vector3(),
    fallbackTarget: new THREE.Vector3(),
    playerVisibleBeforePhase: playerObject.visible,
    guardRemaining: 0,
  };
  const phaseAudioUrl = new URL("./assets/audio/phase-punch.mp3", import.meta.url).href;
  const phaseAudioEngine = window.__realismPhaseAudioEngine || null;
  // Use two fixed elements in the document so Safari keeps their media
  // authorisation across dematerialisation/rematerialisation. They are only a
  // same-moment fallback; a rejected cue is never replayed later.
  const phaseMediaPool = [
    document.querySelector("#environment-dematerialize-audio"),
    document.querySelector("#environment-rematerialize-audio"),
  ].map((element) => element || new Audio(phaseAudioUrl));
  for (const audio of phaseMediaPool) {
    audio.preload = "auto";
    audio.volume = 0.82;
    audio.playsInline = true;
    if (!audio.src) audio.src = phaseAudioUrl;
    audio.load();
  }
  let phaseMediaIndex = 0;

  function unlockPhaseAudio() {
    phaseAudioEngine?.unlock?.();
    for (const audio of phaseMediaPool) {
      // Never restart an already prepared/playing cue on a second touch event.
      if (audio.readyState === 0) audio.load();
    }
  }

  window.addEventListener("pointerdown", unlockPhaseAudio, { capture: true, passive: true });
  window.addEventListener("touchstart", unlockPhaseAudio, { capture: true, passive: true });
  window.addEventListener("keydown", unlockPhaseAudio);
  const recoverPhaseAudio = () => {
    if (!document.hidden && phaseAudioEngine?.hasGesture) unlockPhaseAudio();
  };
  document.addEventListener("visibilitychange", recoverPhaseAudio);
  window.addEventListener("pageshow", recoverPhaseAudio);
  void phaseAudioEngine?.ready?.then((buffer) => {
    canvas.dataset.environmentPhaseAudioReady = buffer ? "buffer" : "media";
  });

  const materialStates = new Map();
  const meshStates = new Map();
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
  const warpRenderSize = new THREE.Vector2();
  const warpScreenPosition = new THREE.Vector3();
  const warpPlayerEdge = new THREE.Vector3();
  const warpTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
  warpTarget.texture.name = "EnvironmentSpacetimeSource";
  warpTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const warpBackgroundTarget = warpTarget.clone();
  warpBackgroundTarget.texture.name = "EnvironmentSpacetimeBackground";
  const warpUniforms = {
    sourceTexture: { value: warpTarget.texture },
    backgroundTexture: { value: warpBackgroundTarget.texture },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    resolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: 0 },
    pinch: { value: 0 },
    direction: { value: 1 },
    time: { value: 0 },
    radius: { value: 0.32 },
  };
  const warpMaterial = new THREE.ShaderMaterial({
    uniforms: warpUniforms,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D sourceTexture;
      uniform sampler2D backgroundTexture;
      uniform vec2 center;
      uniform vec2 resolution;
      uniform float strength;
      uniform float pinch;
      uniform float direction;
      uniform float time;
      uniform float radius;
      varying vec2 vUv;

      mat2 rotate2d(float angle) {
        float sine = sin(angle);
        float cosine = cos(angle);
        return mat2(cosine, -sine, sine, cosine);
      }

      void main() {
        float aspect = resolution.x / max(resolution.y, 1.0);
        vec2 delta = vUv - center;
        vec2 metric = vec2(delta.x * aspect * 1.16, delta.y);
        float distanceFromCenter = length(metric);
        float influence = 1.0 - smoothstep(radius * 0.12, radius, distanceFromCenter);
        float coreInfluence = influence * influence;
        float wave = sin(distanceFromCenter * 118.0 - time * 72.0) * 0.018;
        float twist = direction
          * (strength * (1.2 + coreInfluence * 6.75) + time * 9.0 * strength)
          * coreInfluence;
        float radialScale = 1.0 + pinch * coreInfluence + wave * strength * influence;
        vec2 warpedMetric = rotate2d(twist) * metric * radialScale;
        vec2 warpedDelta = vec2(warpedMetric.x / (aspect * 1.16), warpedMetric.y);
        vec2 warpedUv = clamp(center + warpedDelta, vec2(0.001), vec2(0.999));
        vec2 radialDirection = normalize(delta + vec2(0.000001));
        vec2 blurOffset = radialDirection * strength * influence * 0.007;
        vec4 originalBackground = texture2D(backgroundTexture, vUv);
        vec4 warpedColor = texture2D(sourceTexture, warpedUv) * 0.46;
        warpedColor += texture2D(sourceTexture, clamp(warpedUv + blurOffset, vec2(0.001), vec2(0.999))) * 0.27;
        warpedColor += texture2D(sourceTexture, clamp(warpedUv - blurOffset, vec2(0.001), vec2(0.999))) * 0.27;
        vec4 warpedBackground = texture2D(backgroundTexture, warpedUv) * 0.46;
        warpedBackground += texture2D(backgroundTexture, clamp(warpedUv + blurOffset, vec2(0.001), vec2(0.999))) * 0.27;
        warpedBackground += texture2D(backgroundTexture, clamp(warpedUv - blurOffset, vec2(0.001), vec2(0.999))) * 0.27;
        float bodyDifference = length(warpedColor.rgb - warpedBackground.rgb)
          + abs(warpedColor.a - warpedBackground.a) * 0.4;
        float bodyMask = smoothstep(0.0025, 0.032, bodyDifference) * influence;
        float haloMask = smoothstep(0.00035, 0.014, bodyDifference) * influence;
        float whiteGlow = pow(bodyMask, 0.62) * strength;
        warpedColor.rgb = mix(warpedColor.rgb, vec3(1.0), whiteGlow * 0.88);
        warpedColor.rgb += vec3(whiteGlow * whiteGlow * 0.34);
        vec4 composited = mix(originalBackground, warpedColor, bodyMask);
        float halo = max(0.0, haloMask - bodyMask * 0.42) * strength;
        composited.rgb += vec3(halo * 0.82);
        gl_FragColor = composited;
      }
    `,
  });
  warpMaterial.toneMapped = false;
  const warpScene = new THREE.Scene();
  const warpCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const warpGeometry = new THREE.PlaneGeometry(2, 2);
  const warpQuad = new THREE.Mesh(warpGeometry, warpMaterial);
  warpQuad.frustumCulled = false;
  warpScene.add(warpQuad);

  function getPhaseFallback(label) {
    if (label === "dematerialize") return phaseMediaPool[0];
    if (label === "rematerialize") return phaseMediaPool[1];
    return phaseMediaPool[phaseMediaIndex++ % phaseMediaPool.length];
  }

  function playPhaseMedia(label) {
    const fallback = getPhaseFallback(label);
    fallback.pause();
    try {
      fallback.currentTime = 0;
    } catch {
      // A not-yet-loaded iOS media element will start at zero by default.
    }
    fallback.playbackRate = 1;
    fallback.muted = false;
    fallback.volume = 0.82;
    canvas.dataset.environmentPhaseSound = `${label}-media-pending`;
    void fallback.play().then(() => {
      canvas.dataset.environmentPhaseSound = `${label}-media`;
    }).catch(() => {
      // Never make a missed effect appear at a later, incorrect moment.
      canvas.dataset.environmentPhaseSound = `${label}-missed`;
    });
  }

  function playPhaseAudio(label, ignoreGuard = false) {
    if (!ignoreGuard && state.guardRemaining > 0) {
      canvas.dataset.environmentPhaseSound = `${label}-guarded`;
      return;
    }
    if (phaseAudioEngine?.play?.(label)) {
      canvas.dataset.environmentPhaseSound = `${label}-buffer`;
      return;
    }
    playPhaseMedia(label);
  }

  function setPhase(nextPhase) {
    const previousPhase = state.phase;
    state.phase = nextPhase;
    state.phaseElapsed = 0;
    canvas.dataset.environmentPhase = nextPhase;
    if (nextPhase === "dematerializing" && previousPhase !== nextPhase) {
      playPhaseAudio("dematerialize");
    } else if (nextPhase === "rematerializing" && previousPhase !== nextPhase) {
      playPhaseAudio("rematerialize");
    }
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
      if (!meshStates.has(object)) meshStates.set(object, { castShadow: object.castShadow });
      if (Array.isArray(object.material)) object.material.forEach(rememberMaterial);
      else rememberMaterial(object.material);
    });
  }

  function applyPlayerMaterials(mix) {
    if (mix > 0.001) collectPlayerMaterials();
    const fade = 1 - smoothstep01((mix - 0.52) / 0.48);
    for (const [material, original] of materialStates) {
      material.opacity = original.opacity * fade;
    }
    for (const [mesh, original] of meshStates) {
      mesh.castShadow = mix < 0.38 ? original.castShadow : false;
    }
    playerObject.visible = state.playerVisibleBeforePhase && mix < 0.999;
    canvas.dataset.environmentPlayerVisible = playerObject.visible ? "visible" : "hidden";
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
    for (const [mesh, original] of meshStates) mesh.castShadow = original.castShadow;
    meshStates.clear();
    playerObject.visible = state.playerVisibleBeforePhase;
    canvas.dataset.environmentPlayerVisible = playerObject.visible ? "visible" : "hidden";
    materialStates.clear();
  }

  function updateVisual() {
    const mix = THREE.MathUtils.clamp(state.visualMix, 0, 1);
    applyPlayerMaterials(mix);
    document.body.classList.toggle("is-environment-phasing", mix > 0.01);
    const isVanish = state.phase === "dematerializing";
    const isMaterialize = state.phase === "rematerializing";
    const isBurst = isVanish || isMaterialize;
    const duration = isVanish
      ? PHASE_CONFIG.dematerializeSeconds
      : PHASE_CONFIG.rematerializeSeconds;
    const progress = isBurst
      ? THREE.MathUtils.clamp(state.phaseElapsed / duration, 0, 1)
      : 0;
    canvas.dataset.environmentPhaseVisual = isVanish
      ? "vanish"
      : isMaterialize
        ? "materialize"
        : mix > 0.999
          ? "invisible"
          : "normal";
    canvas.dataset.environmentPhaseVisualProgress = isBurst ? progress.toFixed(3) : "0";
  }

  function renderWarpedFrame() {
    const isVanish = state.phase === "dematerializing";
    const isMaterialize = state.phase === "rematerializing";
    if (!isVanish && !isMaterialize) return false;
    const duration = isVanish
      ? PHASE_CONFIG.dematerializeSeconds
      : PHASE_CONFIG.rematerializeSeconds;
    const progress = THREE.MathUtils.clamp(state.phaseElapsed / duration, 0, 1);
    const boundary = Math.max(0, Math.sin(Math.PI * progress));
    const strength = Math.pow(boundary, 0.54);
    if (strength < 0.002) return false;
    const collapseProgress = isVanish
      ? smoothstep01(progress)
      : smoothstep01(1 - progress);
    const renderScale = quality === "high" ? 1 : quality === "standard" ? 0.8 : 0.62;
    renderer.getDrawingBufferSize(warpRenderSize);
    const targetWidth = Math.max(1, Math.round(warpRenderSize.x * renderScale));
    const targetHeight = Math.max(1, Math.round(warpRenderSize.y * renderScale));
    if (warpTarget.width !== targetWidth || warpTarget.height !== targetHeight) {
      warpTarget.setSize(targetWidth, targetHeight);
      warpBackgroundTarget.setSize(targetWidth, targetHeight);
    }
    warpScreenPosition.copy(flight.position).project(camera);
    const centerY = THREE.MathUtils.clamp(warpScreenPosition.y * 0.5 + 0.5, 0.06, 0.94);
    warpUniforms.center.value.set(
      THREE.MathUtils.clamp(warpScreenPosition.x * 0.5 + 0.5, 0.06, 0.94),
      centerY,
    );
    warpPlayerEdge.copy(camera.up).normalize().multiplyScalar(2.45).add(flight.position).project(camera);
    const playerScreenRadius = Math.abs(warpPlayerEdge.y * 0.5 + 0.5 - centerY);
    warpUniforms.resolution.value.set(targetWidth, targetHeight);
    warpUniforms.strength.value = strength;
    warpUniforms.pinch.value = collapseProgress * strength * (quality === "low" ? 2.2 : 3.35);
    warpUniforms.direction.value = isVanish ? 1 : -1;
    warpUniforms.time.value = state.phaseElapsed;
    warpUniforms.radius.value = THREE.MathUtils.clamp(playerScreenRadius * 1.28, 0.035, 0.115);

    const previousTarget = renderer.getRenderTarget();
    const playerWasVisible = playerObject.visible;
    try {
      renderer.setRenderTarget(warpTarget);
      renderer.render(scene, camera);
      playerObject.visible = false;
      renderer.setRenderTarget(warpBackgroundTarget);
      renderer.render(scene, camera);
    } finally {
      playerObject.visible = playerWasVisible;
      renderer.setRenderTarget(previousTarget);
    }
    renderer.render(warpScene, warpCamera);
    return true;
  }

  function restoreNormalState() {
    state.visualMix = 0;
    setPhase("normal");
    state.safeElapsed = 0;
    document.body.classList.remove("is-environment-phasing");
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
    state.phaseStarts += 1;
    canvas.dataset.environmentPhaseStarts = String(state.phaseStarts);
    state.playerVisibleBeforePhase = playerObject.visible;
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
    if (state.guardRemaining > 0) {
      canvas.dataset.environmentPhase = "normal";
      return false;
    }
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
    const firstCueArmed = !phaseAudioEngine
      || phaseAudioEngine.hasGesture
      || phaseAudioEngine.contextState === "running";
    if (!firstCueArmed && state.phaseStarts === 0) {
      // The flight begins automatically, but audible media cannot legally
      // start on some phones until the first touch. Keep terrain assistance in
      // control instead of showing a silent first phase and replaying its cue
      // later at the wrong moment.
      canvas.dataset.environmentPhaseAudioGate = "waiting-for-input";
      setPhase("normal");
      return false;
    }
    canvas.dataset.environmentPhaseAudioGate = "armed";
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
    state.guardRemaining = Math.max(0, state.guardRemaining - delta);
    canvas.dataset.environmentPhaseGuard = state.guardRemaining.toFixed(2);
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

  function reset({ guardSeconds = 0 } = {}) {
    for (const audio of phaseMediaPool) {
      audio.pause();
      audio.currentTime = 0;
    }
    state.cooldown = 0;
    state.scanElapsed = Infinity;
    state.totalElapsed = 0;
    state.phaseStarts = 0;
    canvas.dataset.environmentPhaseStarts = "0";
    state.recoveryElapsed = 0;
    state.guardRemaining = Math.max(0, guardSeconds);
    canvas.dataset.environmentPhaseGuard = state.guardRemaining.toFixed(2);
    restoreNormalState();
  }

  function dispose() {
    reset();
    window.removeEventListener("pointerdown", unlockPhaseAudio, { capture: true });
    window.removeEventListener("touchstart", unlockPhaseAudio, { capture: true });
    window.removeEventListener("keydown", unlockPhaseAudio);
    document.removeEventListener("visibilitychange", recoverPhaseAudio);
    window.removeEventListener("pageshow", recoverPhaseAudio);
    warpTarget.dispose();
    warpBackgroundTarget.dispose();
    warpMaterial.dispose();
    warpGeometry.dispose();
  }

  canvas.dataset.environmentPhase = "normal";
  canvas.dataset.environmentPhaseStarts = "0";
  canvas.dataset.environmentPhaseVisual = "normal";
  canvas.dataset.environmentPhaseVisualProgress = "0";
  canvas.dataset.environmentPlayerVisible = playerObject.visible ? "visible" : "hidden";
  canvas.dataset.environmentPhaseSound = "ready";
  canvas.dataset.environmentPhaseAudioReady = "loading";
  canvas.dataset.environmentPhaseAudioGate = phaseAudioEngine ? "waiting-for-input" : "armed";
  canvas.dataset.environmentPhaseGuard = "0.00";
  return {
    state,
    debugPlayAudio(label = "dematerialize") {
      playPhaseAudio(label === "rematerialize" ? "rematerialize" : "dematerialize", true);
    },
    predict,
    updateControlled,
    observeSafePosition,
    beginFrame,
    renderWarpedFrame,
    reset,
    dispose,
    isMovementControlled,
    isCollisionSuppressed: () => isMovementControlled() || state.phase === "recovering",
    getCameraDistanceScale: () => THREE.MathUtils.lerp(1, 0.68, state.visualMix),
    getCameraSafetyMix: () => state.visualMix,
  };
}
