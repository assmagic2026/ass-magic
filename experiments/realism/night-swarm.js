import { CONFIG as MANY_NEKO_CONFIG } from "./many-neko-config.js?v=20260803c12";
import { SchoolSimulation } from "./many-neko-school.js?v=20260803c11";

// MANY NEKO live defaults (main.js?v=20260803c14, lines 895-909):
// 1,000 reference creatures, 3x fish speed, and maxSteer scaled by 3^2.
const MANY_NEKO_REFERENCE_COUNT = 1000;
const MANY_NEKO_SPEED_MULTIPLIER = 3;
const BASE_HORIZONTAL_SCALE = 6;
const BASE_VERTICAL_SCALE = 4;
const BASE_HABITAT_ALTITUDE = 24;
const HABITAT_WIDTH_MULTIPLIER = 2.5;
const HABITAT_DEPTH_MULTIPLIER = 3;
const HABITAT_HEIGHT_MULTIPLIER = 4;
const HABITAT_ALTITUDE_LIFT = 15;
const POINT_SIZE_MULTIPLIER = 1.8;
const PLAYER_AVOIDANCE_MULTIPLIER = 1.75;
const PLAYER_MID_RADIUS = 34 * PLAYER_AVOIDANCE_MULTIPLIER;
const PLAYER_NEAR_RADIUS = 17 * PLAYER_AVOIDANCE_MULTIPLIER;
const PLAYER_PANIC_RADIUS = 7 * PLAYER_AVOIDANCE_MULTIPLIER;
const PLAYER_SCATTER_COOLDOWN = 0.7;
const EPSILON = 0.000001;

function interpolateProfile(count, entries) {
  if (count <= entries[0][0]) return entries[0][1];
  for (let index = 1; index < entries.length; index += 1) {
    const [upperCount, upperValue] = entries[index];
    const [lowerCount, lowerValue] = entries[index - 1];
    if (count <= upperCount) {
      const mix = (count - lowerCount) / (upperCount - lowerCount);
      return lowerValue + (upperValue - lowerValue) * mix;
    }
  }
  return entries[entries.length - 1][1];
}

function createGlowMaterial(THREE, count) {
  const pointSize = (count <= 250 ? 7.1
    : count <= 2500 ? 5.9
      : count <= 5000 ? 5.3
        : count <= 10000 ? 4.8
          : 4.2) * POINT_SIZE_MULTIPLIER;
  const haloPower = count <= 2500 ? 2.35
    : count <= 5000 ? 2.65
      : count <= 10000 ? 2.95
        : 3.3;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
    uniforms: {
      pointSize: { value: pointSize },
      swarmTime: { value: 0 },
      haloPower: { value: haloPower },
    },
    vertexShader: `
      uniform float pointSize;
      uniform float swarmTime;
      attribute float glowPhase;
      attribute float sizeScale;
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vColor = color;
        vPulse = 0.94 + sin(swarmTime * 0.72 + glowPhase) * 0.06;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = pointSize * sizeScale * vPulse
          * clamp(250.0 / max(1.0, -viewPosition.z), 0.72, 3.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPulse;
      uniform float haloPower;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius >= 1.0) discard;
        float halo = pow(1.0 - radius, haloPower);
        float core = 1.0 - smoothstep(0.0, 0.24, radius);
        vec3 coreColor = mix(vColor, vec3(0.46, 1.0, 0.50), 0.62);
        gl_FragColor = vec4(
          (vColor * (0.78 + halo * 0.34) + coreColor * core * 1.48) * vPulse,
          (halo * 0.54 + core * 0.22) * vPulse
        );
      }
    `,
  });
}

function createDebugHud(count, adapterEnabled) {
  const element = document.createElement("aside");
  element.className = "swarm-debug";
  element.setAttribute("aria-label", "Night swarm diagnostics");
  element.innerHTML = [
    "<strong>SWARM</strong>",
    "engine: MANY NEKO 20260803c11",
    `adapter: ${adapterEnabled ? "ASS night + player" : "source reference"}`,
    `particles: ${count}`,
    "moving: --",
    "avg speed: --",
    "min speed: --",
    "max speed: --",
    "distance from home: --",
    "player distance: --",
    "swarm update: -- ms",
  ].join("<br>");
  document.body.append(element);
  return element;
}

function makeSourceConfigs(count) {
  const fish = { ...MANY_NEKO_CONFIG.fish };
  const school = {
    ...MANY_NEKO_CONFIG.school,
    referenceCount: MANY_NEKO_REFERENCE_COUNT,
  };
  const water = { ...MANY_NEKO_CONFIG.water };
  fish.minSpeed *= MANY_NEKO_SPEED_MULTIPLIER;
  fish.cruiseSpeed *= MANY_NEKO_SPEED_MULTIPLIER;
  fish.maxSpeed *= MANY_NEKO_SPEED_MULTIPLIER;
  school.maxSteer *= MANY_NEKO_SPEED_MULTIPLIER * MANY_NEKO_SPEED_MULTIPLIER;
  // The source supports arbitrary live slider counts while retaining 1,000 as
  // referenceCount. Keep that behavior for points100/250/500/1000 comparisons.
  school.referenceCount = MANY_NEKO_REFERENCE_COUNT;
  return { fish, school, water, count };
}

function resolvePopulation(requestedCount, quality) {
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches === true;
  const normalizedQuality = quality === "high" || quality === "standard" || quality === "low"
    ? quality
    : "standard";
  const cap = coarsePointer
    ? { high: 10000, standard: 5000, low: 2500 }[normalizedQuality]
    : { high: 25000, standard: 15000, low: 10000 }[normalizedQuality];
  const count = Math.min(requestedCount, cap);
  // Above 2,500, extra points are visual LOD followers attached to a source
  // boid. This preserves the live MANY NEKO solver while keeping its CPU cost
  // bounded for 10k/25k rendering experiments.
  const simulatedCount = Math.min(count, 2500);
  return { requestedCount, count, simulatedCount, cap, coarsePointer };
}

export function createNightSwarm({
  THREE,
  scene,
  config,
  centerDirection,
  getSurfaceRadius,
  playerPosition,
  quality = "standard",
  debugEnabled = false,
  onDiagnostics = null,
}) {
  if (!config?.enabled) return null;
  if (!THREE || !scene || !centerDirection || typeof getSurfaceRadius !== "function") {
    throw new TypeError("Night swarm requires a scene, a habitat direction, and a surface sampler.");
  }

  const population = resolvePopulation(config.count, quality);
  const count = population.count;
  const simulatedCount = population.simulatedCount;
  const sourceConfig = makeSourceConfigs(simulatedCount);
  const spatialFactor = interpolateProfile(count, [
    [250, 1],
    [2500, 1.15],
    [5000, 1.35],
    [10000, 1.8],
    [25000, 2.65],
  ]);
  const baseHorizontalScale = BASE_HORIZONTAL_SCALE * spatialFactor;
  const baseVerticalScale = BASE_VERTICAL_SCALE * (1 + (spatialFactor - 1) * 0.72);
  const widthScale = baseHorizontalScale * HABITAT_WIDTH_MULTIPLIER;
  const depthScale = baseHorizontalScale * HABITAT_DEPTH_MULTIPLIER;
  const verticalScale = baseVerticalScale * HABITAT_HEIGHT_MULTIPLIER;
  const habitatAltitude = BASE_HABITAT_ALTITUDE
    + Math.max(0, baseVerticalScale - BASE_VERTICAL_SCALE) * 5.2
    + (count > 2500 ? 18 : 0)
    + HABITAT_ALTITUDE_LIFT;
  const school = new SchoolSimulation(
    simulatedCount,
    sourceConfig.school,
    sourceConfig.fish,
    sourceConfig.water,
  );
  const sourceReferenceOnly = config.avoid !== true;
  const assAdapterEnabled = !sourceReferenceOnly;
  const habitatUp = centerDirection.clone().normalize();
  const referenceAxis = Math.abs(habitatUp.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(referenceAxis, habitatUp).normalize();
  const tangentB = new THREE.Vector3().crossVectors(habitatUp, tangentA).normalize();
  const homeSurfaceRadius = getSurfaceRadius(habitatUp);
  const homeCenter = habitatUp.clone().multiplyScalar(homeSurfaceRadius + habitatAltitude);

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const glowPhases = new Float32Array(count);
  const sizeScales = new Float32Array(count);
  const sourceIndices = new Uint16Array(count);
  const followerRadius = new Float32Array(count);
  const followerPhase = new Float32Array(count);
  const followerVertical = new Float32Array(count);
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const sourceIndex = index % simulatedCount;
    const sourcePhase = school.phase[sourceIndex];
    sourceIndices[index] = sourceIndex;
    glowPhases[index] = sourcePhase + index * 0.754877666;
    const sizeRoll = (index * 0.61803398875 + sourcePhase * 0.031) % 1;
    sizeScales[index] = sizeRoll < 0.7 ? 1
      : sizeRoll < 0.9 ? 1.25
        : sizeRoll < 0.98 ? 1.6
          : 2;
    const layer = Math.floor(index / simulatedCount);
    const followerRoll = (index * 0.569840296 + sourcePhase * 0.071) % 1;
    followerRadius[index] = layer === 0 ? 0 : (0.055 + followerRoll * 0.19);
    followerPhase[index] = glowPhases[index] * 1.618033989;
    followerVertical[index] = ((index * 0.438447187) % 1) * 2 - 1;
    const colorRoll = (index * 0.754877666 + sourcePhase * 0.043) % 1;
    color.setHex(colorRoll < 0.6 ? 0x63e878
      : colorRoll < 0.85 ? 0x38d96b
        : colorRoll < 0.95 ? 0x28c986
          : 0xa8ff91);
    color.offsetHSL(
      ((school.shine[sourceIndex] || 0.5) - 0.5) * 0.012,
      0,
      ((school.shine[sourceIndex] || 0.5) - 0.5) * 0.035,
    );
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("glowPhase", new THREE.BufferAttribute(glowPhases, 1));
  geometry.setAttribute("sizeScale", new THREE.BufferAttribute(sizeScales, 1));
  const material = createGlowMaterial(THREE, count);
  const points = new THREE.Points(geometry, material);
  points.name = `NightSwarm_ManyNeko_${config.label}`;
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);

  const mappedDirection = new THREE.Vector3();
  const mappedPosition = new THREE.Vector3();
  const localPlayer = new THREE.Vector3();
  const mappedCenter = new THREE.Vector3();
  const playerDirection = new THREE.Vector3();
  const playerWorld = new THREE.Vector3();
  const debugHud = debugEnabled ? createDebugHud(count, assAdapterEnabled) : null;
  const diagnosticsCallback = typeof onDiagnostics === "function" ? onDiagnostics : null;
  let elapsed = 0;
  let debugElapsed = 0;
  let scatterCooldown = 0;
  let wasInsidePanicRadius = false;
  let disposed = false;
  let latestDiagnostics = null;
  let updateMsAverage = 0;
  let simulationMsAverage = 0;
  let mappingMsAverage = 0;
  let timingSamples = 0;

  const localToWorld = (x, y, z, out) => {
    mappedDirection.copy(habitatUp)
      .addScaledVector(tangentA, x * widthScale / homeSurfaceRadius)
      .addScaledVector(tangentB, z * depthScale / homeSurfaceRadius)
      .normalize();
    // Terrain sampling every point is retained through 2,500. High-count LOD
    // uses the habitat's sampled radius plus added clearance, avoiding tens of
    // thousands of terrain-noise evaluations per frame.
    const surfaceRadius = count <= 2500
      ? getSurfaceRadius(mappedDirection)
      : homeSurfaceRadius;
    const altitude = habitatAltitude + y * verticalScale;
    return out.copy(mappedDirection).multiplyScalar(surfaceRadius + altitude);
  };

  const worldToLocal = (world, out) => {
    const radius = world.length();
    if (radius < EPSILON) return out.set(1e6, 1e6, 1e6);
    playerDirection.copy(world).multiplyScalar(1 / radius);
    const forward = playerDirection.dot(habitatUp);
    if (forward <= 0.15) return out.set(1e6, 1e6, 1e6);
    const surfaceRadius = getSurfaceRadius(playerDirection);
    out.set(
      playerDirection.dot(tangentA) / forward * homeSurfaceRadius / widthScale,
      (radius - surfaceRadius - habitatAltitude) / verticalScale,
      playerDirection.dot(tangentB) / forward * homeSurfaceRadius / depthScale,
    );
    return out;
  };

  const applyPlayerAvoidance = (delta) => {
    if (!assAdapterEnabled || !playerPosition) return;
    playerWorld.copy(playerPosition);
    worldToLocal(playerWorld, localPlayer);
    if (Math.abs(localPlayer.x) > 1000) return;

    localToWorld(
      school.visualCenter.x,
      school.visualCenter.y,
      school.visualCenter.z,
      mappedCenter,
    );
    const centerDistance = mappedCenter.distanceTo(playerWorld);
    const insidePanic = centerDistance < PLAYER_PANIC_RADIUS * 1.55;
    scatterCooldown = Math.max(0, scatterCooldown - delta);
    if (insidePanic && !wasInsidePanicRadius && scatterCooldown <= 0) {
      // Reuse MANY NEKO's own patch-scatter implementation. Only the origin is
      // supplied by the ASS player mapping; no replacement flock rule is added.
      if (school.triggerScatter(localPlayer)) scatterCooldown = PLAYER_SCATTER_COOLDOWN;
    }
    wasInsidePanicRadius = insidePanic;

    const p = school.positions;
    const v = school.velocities;
    for (let index = 0; index < school.count; index += 1) {
      const offset = index * 3;
      const dx = (p[offset] - localPlayer.x) * widthScale;
      const dy = (p[offset + 1] - localPlayer.y) * verticalScale;
      const dz = (p[offset + 2] - localPlayer.z) * depthScale;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < PLAYER_MID_RADIUS && distance >= EPSILON) {
        const midPressure = 1 - distance / PLAYER_MID_RADIUS;
        const nearPressure = distance < PLAYER_NEAR_RADIUS
          ? 1 - distance / PLAYER_NEAR_RADIUS
          : 0;
        const panicPressure = distance < PLAYER_PANIC_RADIUS
          ? 1 - distance / PLAYER_PANIC_RADIUS
          : 0;
        const force = midPressure * midPressure * 1.1
          + nearPressure * nearPressure * 4.6
          + panicPressure * panicPressure * 9.5;
        const inverseDistance = 1 / distance;
        v[offset] += dx * inverseDistance * force * delta / widthScale;
        v[offset + 1] += dy * inverseDistance * force * delta / verticalScale;
        v[offset + 2] += dz * inverseDistance * force * delta / depthScale;

        if (panicPressure > 0) {
          // A per-individual sideways/upward component opens a hole around the
          // player instead of translating the school as one rigid block.
          const phase = school.phase[index] + elapsed * (1.1 + school.reaction[index] * 0.25);
          const sideForce = panicPressure * 2.2 * delta;
          v[offset] += Math.cos(phase) * sideForce / widthScale;
          v[offset + 1] += Math.sin(phase * 0.73) * sideForce * 0.75 / verticalScale;
          v[offset + 2] += Math.sin(phase) * sideForce / depthScale;
        }
      }

      // The source solver clamps every individual to its configured minimum.
      // Preserve that same invariant after the optional ASS-only avoidance
      // impulse so the adapter can never cancel a particle into a near-stop.
      const localSpeed = Math.hypot(v[offset], v[offset + 1], v[offset + 2]);
      const localMinimum = sourceConfig.fish.minSpeed * school.speedBias[index];
      if (localSpeed < localMinimum) {
        const speedScale = localMinimum / Math.max(localSpeed, EPSILON);
        v[offset] *= speedScale;
        v[offset + 1] *= speedScale;
        v[offset + 2] *= speedScale;
      }
    }
  };

  const writeWorldPositions = () => {
    const p = school.positions;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const sourceOffset = sourceIndices[index] * 3;
      const radius = followerRadius[index];
      const angle = followerPhase[index] + elapsed * (0.31 + (index % 7) * 0.017);
      const localX = p[sourceOffset]
        + Math.cos(angle) * radius
        + Math.sin(angle * 0.47) * radius * 0.24;
      const localY = p[sourceOffset + 1]
        + followerVertical[index] * radius * 0.58
        + Math.sin(angle * 0.73) * radius * 0.2;
      const localZ = p[sourceOffset + 2]
        + Math.sin(angle) * radius
        + Math.cos(angle * 0.53) * radius * 0.24;
      localToWorld(localX, localY, localZ, mappedPosition);
      positions[offset] = mappedPosition.x;
      positions[offset + 1] = mappedPosition.y;
      positions[offset + 2] = mappedPosition.z;
    }
    positionAttribute.needsUpdate = true;
  };

  const updateDiagnostics = () => {
    const v = school.velocities;
    let simulatedMoving = 0;
    let speedTotal = 0;
    let minSpeed = Infinity;
    let maxSpeed = 0;
    // "moving" detects a practical stop, not a temporary slowdown caused by
    // MANY NEKO's close-body/observer collision handling.
    const movingThreshold = 0.5;
    for (let index = 0; index < school.count; index += 1) {
      const offset = index * 3;
      const worldSpeed = Math.hypot(
        v[offset] * widthScale,
        v[offset + 1] * verticalScale,
        v[offset + 2] * depthScale,
      );
      if (worldSpeed >= movingThreshold) simulatedMoving += 1;
      speedTotal += worldSpeed;
      minSpeed = Math.min(minSpeed, worldSpeed);
      maxSpeed = Math.max(maxSpeed, worldSpeed);
    }
    localToWorld(
      school.visualCenter.x,
      school.visualCenter.y,
      school.visualCenter.z,
      mappedCenter,
    );
    const playerDistance = playerPosition
      ? mappedCenter.distanceTo(playerPosition)
      : Infinity;
    const moving = Math.round(simulatedMoving / school.count * count);
    latestDiagnostics = Object.freeze({
      engine: "MANY NEKO school.js?v=20260803c11",
      adapter: assAdapterEnabled ? "ass-night-player" : "source-reference",
      particles: count,
      simulatedParticles: school.count,
      requestedParticles: population.requestedCount,
      populationCap: population.cap,
      moving,
      avgSpeed: speedTotal / school.count,
      minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0,
      maxSpeed,
      distanceFromHome: mappedCenter.distanceTo(homeCenter),
      playerDistance,
      swarmUpdateMs: updateMsAverage,
      swarmSimulationMs: simulationMsAverage,
      swarmMappingMs: mappingMsAverage,
      spatialFactor,
      widthScale,
      depthScale,
      heightScale: verticalScale,
      habitatAltitude,
      pointSizeMultiplier: POINT_SIZE_MULTIPLIER,
      avoidanceMultiplier: PLAYER_AVOIDANCE_MULTIPLIER,
    });
    if (debugHud) {
      const playerText = Number.isFinite(playerDistance) ? playerDistance.toFixed(1) : "--";
      debugHud.innerHTML = [
        "<strong>SWARM</strong>",
        "engine: MANY NEKO 20260803c11",
        `adapter: ${assAdapterEnabled ? "ASS night + player" : "source reference"}`,
        `particles: ${count}`,
        `simulated: ${school.count}`,
        `moving: ${moving}`,
        `avg speed: ${latestDiagnostics.avgSpeed.toFixed(1)}`,
        `min speed: ${latestDiagnostics.minSpeed.toFixed(1)}`,
        `max speed: ${latestDiagnostics.maxSpeed.toFixed(1)}`,
        `distance from home: ${latestDiagnostics.distanceFromHome.toFixed(1)}`,
        `player distance: ${playerText}`,
        `swarm update: ${latestDiagnostics.swarmUpdateMs.toFixed(2)} ms`,
      ].join("<br>");
    }
    diagnosticsCallback?.(latestDiagnostics);
  };

  writeWorldPositions();
  updateDiagnostics();

  return {
    count,
    simulatedCount,
    population,
    dimensions: Object.freeze({
      widthScale,
      depthScale,
      heightScale: verticalScale,
      habitatAltitude,
      pointSizeMultiplier: POINT_SIZE_MULTIPLIER,
      avoidanceMultiplier: PLAYER_AVOIDANCE_MULTIPLIER,
    }),
    points,
    school,
    sourceReferenceOnly,
    update(delta) {
      if (disposed) return;
      const safeDelta = Math.min(0.034, Math.max(0, Number(delta) || 0));
      if (safeDelta <= 0) return;
      const updateStartedAt = performance.now();
      elapsed += safeDelta;
      const simulationStartedAt = performance.now();
      school.update(safeDelta);
      applyPlayerAvoidance(safeDelta);
      const mappingStartedAt = performance.now();
      writeWorldPositions();
      const updateFinishedAt = performance.now();
      const sampleAlpha = timingSamples < 30 ? 1 / (timingSamples + 1) : 0.06;
      simulationMsAverage += (
        mappingStartedAt - simulationStartedAt - simulationMsAverage
      ) * sampleAlpha;
      mappingMsAverage += (updateFinishedAt - mappingStartedAt - mappingMsAverage) * sampleAlpha;
      updateMsAverage += (updateFinishedAt - updateStartedAt - updateMsAverage) * sampleAlpha;
      timingSamples += 1;
      material.uniforms.swarmTime.value = elapsed;
      debugElapsed += safeDelta;
      if (debugElapsed >= 0.2) {
        debugElapsed = 0;
        updateDiagnostics();
      }
    },
    getDiagnostics() {
      return latestDiagnostics;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      debugHud?.remove();
    },
  };
}
