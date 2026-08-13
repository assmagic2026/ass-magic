import { CONFIG as MANY_NEKO_CONFIG } from "./many-neko-config.js?v=20260803c12";
import { SchoolSimulation } from "./many-neko-school.js?v=20260803c11";

// MANY NEKO live defaults (main.js?v=20260803c14, lines 895-909):
// 1,000 reference creatures, 3x fish speed, and maxSteer scaled by 3^2.
const MANY_NEKO_REFERENCE_COUNT = 1000;
const MANY_NEKO_SPEED_MULTIPLIER = 3;
const LOCAL_HORIZONTAL_SCALE = 6;
const LOCAL_VERTICAL_SCALE = 4;
const HABITAT_ALTITUDE = 24;
const PLAYER_MID_RADIUS = 34;
const PLAYER_NEAR_RADIUS = 17;
const PLAYER_PANIC_RADIUS = 7;
const PLAYER_SCATTER_COOLDOWN = 0.7;
const EPSILON = 0.000001;

function createGlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
    uniforms: {
      pointSize: { value: 4.7 },
      swarmTime: { value: 0 },
    },
    vertexShader: `
      uniform float pointSize;
      uniform float swarmTime;
      attribute float glowPhase;
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vColor = color;
        vPulse = 0.94 + sin(swarmTime * 0.72 + glowPhase) * 0.06;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = pointSize * vPulse
          * clamp(250.0 / max(1.0, -viewPosition.z), 0.72, 3.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius >= 1.0) discard;
        float halo = pow(1.0 - radius, 2.35);
        float core = 1.0 - smoothstep(0.0, 0.24, radius);
        gl_FragColor = vec4(
          vColor * (1.08 + core * 1.92) * vPulse,
          (halo * 0.74 + core * 0.26) * vPulse
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

export function createNightSwarm({
  THREE,
  scene,
  config,
  centerDirection,
  getSurfaceRadius,
  playerPosition,
  debugEnabled = false,
  onDiagnostics = null,
}) {
  if (!config?.enabled) return null;
  if (!THREE || !scene || !centerDirection || typeof getSurfaceRadius !== "function") {
    throw new TypeError("Night swarm requires a scene, a habitat direction, and a surface sampler.");
  }

  const sourceConfig = makeSourceConfigs(config.count);
  const school = new SchoolSimulation(
    config.count,
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
  const homeCenter = habitatUp.clone().multiplyScalar(homeSurfaceRadius + HABITAT_ALTITUDE);

  const positions = new Float32Array(config.count * 3);
  const colors = new Float32Array(config.count * 3);
  const glowPhases = new Float32Array(config.count);
  const color = new THREE.Color();
  for (let index = 0; index < config.count; index += 1) {
    const offset = index * 3;
    glowPhases[index] = school.phase[index];
    color.setHSL(0.155 + (school.shine[index] || 0.5) * 0.055, 0.78, 0.72);
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
  const material = createGlowMaterial(THREE);
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
  const debugHud = debugEnabled ? createDebugHud(config.count, assAdapterEnabled) : null;
  const diagnosticsCallback = typeof onDiagnostics === "function" ? onDiagnostics : null;
  let elapsed = 0;
  let debugElapsed = 0;
  let scatterCooldown = 0;
  let wasInsidePanicRadius = false;
  let disposed = false;
  let latestDiagnostics = null;

  const localToWorld = (x, y, z, out) => {
    mappedDirection.copy(habitatUp)
      .addScaledVector(tangentA, x * LOCAL_HORIZONTAL_SCALE / homeSurfaceRadius)
      .addScaledVector(tangentB, z * LOCAL_HORIZONTAL_SCALE / homeSurfaceRadius)
      .normalize();
    const surfaceRadius = getSurfaceRadius(mappedDirection);
    const altitude = HABITAT_ALTITUDE + y * LOCAL_VERTICAL_SCALE;
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
      playerDirection.dot(tangentA) / forward * homeSurfaceRadius / LOCAL_HORIZONTAL_SCALE,
      (radius - surfaceRadius - HABITAT_ALTITUDE) / LOCAL_VERTICAL_SCALE,
      playerDirection.dot(tangentB) / forward * homeSurfaceRadius / LOCAL_HORIZONTAL_SCALE,
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
      const dx = (p[offset] - localPlayer.x) * LOCAL_HORIZONTAL_SCALE;
      const dy = (p[offset + 1] - localPlayer.y) * LOCAL_VERTICAL_SCALE;
      const dz = (p[offset + 2] - localPlayer.z) * LOCAL_HORIZONTAL_SCALE;
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
        v[offset] += dx * inverseDistance * force * delta / LOCAL_HORIZONTAL_SCALE;
        v[offset + 1] += dy * inverseDistance * force * delta / LOCAL_VERTICAL_SCALE;
        v[offset + 2] += dz * inverseDistance * force * delta / LOCAL_HORIZONTAL_SCALE;

        if (panicPressure > 0) {
          // A per-individual sideways/upward component opens a hole around the
          // player instead of translating the school as one rigid block.
          const phase = school.phase[index] + elapsed * (1.1 + school.reaction[index] * 0.25);
          const sideForce = panicPressure * 2.2 * delta;
          v[offset] += Math.cos(phase) * sideForce / LOCAL_HORIZONTAL_SCALE;
          v[offset + 1] += Math.sin(phase * 0.73) * sideForce * 0.75 / LOCAL_VERTICAL_SCALE;
          v[offset + 2] += Math.sin(phase) * sideForce / LOCAL_HORIZONTAL_SCALE;
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
    for (let index = 0; index < school.count; index += 1) {
      const offset = index * 3;
      localToWorld(p[offset], p[offset + 1], p[offset + 2], mappedPosition);
      positions[offset] = mappedPosition.x;
      positions[offset + 1] = mappedPosition.y;
      positions[offset + 2] = mappedPosition.z;
    }
    positionAttribute.needsUpdate = true;
  };

  const updateDiagnostics = () => {
    const v = school.velocities;
    let moving = 0;
    let speedTotal = 0;
    let minSpeed = Infinity;
    let maxSpeed = 0;
    // "moving" detects a practical stop, not a temporary slowdown caused by
    // MANY NEKO's close-body/observer collision handling.
    const movingThreshold = 0.5;
    for (let index = 0; index < school.count; index += 1) {
      const offset = index * 3;
      const worldSpeed = Math.hypot(
        v[offset] * LOCAL_HORIZONTAL_SCALE,
        v[offset + 1] * LOCAL_VERTICAL_SCALE,
        v[offset + 2] * LOCAL_HORIZONTAL_SCALE,
      );
      if (worldSpeed >= movingThreshold) moving += 1;
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
    latestDiagnostics = Object.freeze({
      engine: "MANY NEKO school.js?v=20260803c11",
      adapter: assAdapterEnabled ? "ass-night-player" : "source-reference",
      particles: school.count,
      moving,
      avgSpeed: speedTotal / school.count,
      minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0,
      maxSpeed,
      distanceFromHome: mappedCenter.distanceTo(homeCenter),
      playerDistance,
    });
    if (debugHud) {
      const playerText = Number.isFinite(playerDistance) ? playerDistance.toFixed(1) : "--";
      debugHud.innerHTML = [
        "<strong>SWARM</strong>",
        "engine: MANY NEKO 20260803c11",
        `adapter: ${assAdapterEnabled ? "ASS night + player" : "source reference"}`,
        `particles: ${school.count}`,
        `moving: ${moving}`,
        `avg speed: ${latestDiagnostics.avgSpeed.toFixed(1)}`,
        `min speed: ${latestDiagnostics.minSpeed.toFixed(1)}`,
        `max speed: ${latestDiagnostics.maxSpeed.toFixed(1)}`,
        `distance from home: ${latestDiagnostics.distanceFromHome.toFixed(1)}`,
        `player distance: ${playerText}`,
      ].join("<br>");
    }
    diagnosticsCallback?.(latestDiagnostics);
  };

  writeWorldPositions();
  updateDiagnostics();

  return {
    points,
    school,
    sourceReferenceOnly,
    update(delta) {
      if (disposed) return;
      const safeDelta = Math.min(0.034, Math.max(0, Number(delta) || 0));
      if (safeDelta <= 0) return;
      elapsed += safeDelta;
      school.update(safeDelta);
      applyPlayerAvoidance(safeDelta);
      writeWorldPositions();
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
