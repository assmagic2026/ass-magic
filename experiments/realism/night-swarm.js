const MIN_SPEED = 4.8;
const MAX_SPEED = 10.5;
const MAX_STEER_FORCE = 9.5;
const NEIGHBOR_RADIUS = 10.5;
const SEPARATION_RADIUS = 4.6;
const SOFT_BOUNDARY_RADIUS = 30;
const HARD_BOUNDARY_RADIUS = 48;
const MIN_ALTITUDE = 3.2;
const SOFT_MIN_ALTITUDE = 5.4;
const SOFT_MAX_ALTITUDE = 18;
const HARD_MAX_ALTITUDE = 24;
const PLAYER_MID_RADIUS = 34;
const PLAYER_NEAR_RADIUS = 19;
const PLAYER_PANIC_RADIUS = 8;
const GRID_CELL_SIZE = NEIGHBOR_RADIUS;
const GRID_XZ_EXTENT = 64;
const GRID_Y_EXTENT = 32;
const GRID_XZ_CELLS = Math.ceil((GRID_XZ_EXTENT * 2) / GRID_CELL_SIZE) + 1;
const GRID_Y_CELLS = Math.ceil((GRID_Y_EXTENT * 2) / GRID_CELL_SIZE) + 1;
const GRID_CELL_COUNT = GRID_XZ_CELLS * GRID_Y_CELLS * GRID_XZ_CELLS;
const EPSILON = 0.000001;

function createSeededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createGlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
    uniforms: {
      pointSize: { value: 4.8 },
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
        vPulse = 0.91 + sin(swarmTime * 1.7 + glowPhase) * 0.09;
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
        float halo = pow(1.0 - radius, 2.25);
        float core = 1.0 - smoothstep(0.0, 0.26, radius);
        gl_FragColor = vec4(
          vColor * (1.12 + core * 1.85) * vPulse,
          (halo * 0.76 + core * 0.24) * vPulse
        );
      }
    `,
  });
}

function createDebugHud(count) {
  const element = document.createElement("aside");
  element.className = "swarm-debug";
  element.setAttribute("aria-label", "Night swarm diagnostics");
  element.innerHTML = [
    "<strong>SWARM</strong>",
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

  const count = config.count;
  const random = createSeededRandom(918273 + count * 31);
  const habitatUp = centerDirection.clone().normalize();
  const referenceAxis = Math.abs(habitatUp.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(referenceAxis, habitatUp).normalize();
  const tangentB = new THREE.Vector3().crossVectors(habitatUp, tangentA).normalize();
  const homeSurfaceRadius = getSurfaceRadius(habitatUp);
  const homeCenter = habitatUp.clone().multiplyScalar(homeSurfaceRadius + 11.5);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const accelerations = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const glowPhases = new Float32Array(count);
  const preferredSpeeds = new Float32Array(count);
  const wanderX = new Float32Array(count);
  const wanderY = new Float32Array(count);
  const wanderZ = new Float32Array(count);
  const wanderTargetX = new Float32Array(count);
  const wanderTargetY = new Float32Array(count);
  const wanderTargetZ = new Float32Array(count);
  const wanderTimers = new Float32Array(count);
  const gridHeads = new Int32Array(GRID_CELL_COUNT);
  const gridNext = new Int32Array(count);
  const gridCellX = new Uint8Array(count);
  const gridCellY = new Uint8Array(count);
  const gridCellZ = new Uint8Array(count);
  const color = new THREE.Color();
  const direction = new THREE.Vector3();
  const planetUp = new THREE.Vector3();
  const scratchPosition = new THREE.Vector3();
  const playerDelta = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const debugHud = debugEnabled ? createDebugHud(count) : null;
  const diagnosticsCallback = typeof onDiagnostics === "function" ? onDiagnostics : null;

  const toCellCoordinate = (value, extent, cellCount) => Math.max(
    0,
    Math.min(cellCount - 1, Math.floor((value + extent) / GRID_CELL_SIZE)),
  );
  const cellIndex = (x, y, z) => x + GRID_XZ_CELLS * (y + GRID_Y_CELLS * z);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const radialDistance = Math.sqrt(random()) * 23;
    const radialAngle = random() * Math.PI * 2;
    const localX = Math.cos(radialAngle) * radialDistance;
    const localZ = Math.sin(radialAngle) * radialDistance;
    const altitude = 5.5 + random() * 11.5;
    direction.copy(habitatUp)
      .addScaledVector(tangentA, localX / homeSurfaceRadius)
      .addScaledVector(tangentB, localZ / homeSurfaceRadius)
      .normalize();
    scratchPosition.copy(direction).multiplyScalar(getSurfaceRadius(direction) + altitude);
    positions[offset] = scratchPosition.x;
    positions[offset + 1] = scratchPosition.y;
    positions[offset + 2] = scratchPosition.z;

    const velocityAngle = random() * Math.PI * 2;
    const verticalMix = (random() - 0.5) * 0.52;
    const initialSpeed = MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED) * 0.72;
    velocities[offset] = (
      tangentA.x * Math.cos(velocityAngle)
      + tangentB.x * Math.sin(velocityAngle)
      + habitatUp.x * verticalMix
    ) * initialSpeed;
    velocities[offset + 1] = (
      tangentA.y * Math.cos(velocityAngle)
      + tangentB.y * Math.sin(velocityAngle)
      + habitatUp.y * verticalMix
    ) * initialSpeed;
    velocities[offset + 2] = (
      tangentA.z * Math.cos(velocityAngle)
      + tangentB.z * Math.sin(velocityAngle)
      + habitatUp.z * verticalMix
    ) * initialSpeed;
    const normalizedSpeed = Math.hypot(
      velocities[offset],
      velocities[offset + 1],
      velocities[offset + 2],
    );
    const speedCorrection = initialSpeed / Math.max(EPSILON, normalizedSpeed);
    velocities[offset] *= speedCorrection;
    velocities[offset + 1] *= speedCorrection;
    velocities[offset + 2] *= speedCorrection;
    preferredSpeeds[index] = MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED);
    wanderTimers[index] = random() * 0.8;
    glowPhases[index] = random() * Math.PI * 2;
    color.setHSL(0.155 + random() * 0.06, 0.79, 0.7 + random() * 0.12);
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
  geometry.computeBoundingSphere();
  const material = createGlowMaterial(THREE);
  const points = new THREE.Points(geometry, material);
  points.name = `NightSwarm_${config.label}`;
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);

  let time = 0;
  let debugElapsed = 0;
  let disposed = false;
  let latestDiagnostics = null;

  const rebuildGrid = () => {
    gridHeads.fill(-1);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const relativeX = (positions[offset] - homeCenter.x) * tangentA.x
        + (positions[offset + 1] - homeCenter.y) * tangentA.y
        + (positions[offset + 2] - homeCenter.z) * tangentA.z;
      const relativeY = (positions[offset] - homeCenter.x) * habitatUp.x
        + (positions[offset + 1] - homeCenter.y) * habitatUp.y
        + (positions[offset + 2] - homeCenter.z) * habitatUp.z;
      const relativeZ = (positions[offset] - homeCenter.x) * tangentB.x
        + (positions[offset + 1] - homeCenter.y) * tangentB.y
        + (positions[offset + 2] - homeCenter.z) * tangentB.z;
      const x = toCellCoordinate(relativeX, GRID_XZ_EXTENT, GRID_XZ_CELLS);
      const y = toCellCoordinate(relativeY, GRID_Y_EXTENT, GRID_Y_CELLS);
      const z = toCellCoordinate(relativeZ, GRID_XZ_EXTENT, GRID_XZ_CELLS);
      gridCellX[index] = x;
      gridCellY[index] = y;
      gridCellZ[index] = z;
      const hash = cellIndex(x, y, z);
      gridNext[index] = gridHeads[hash];
      gridHeads[hash] = index;
    }
  };

  const updateWanderTarget = (index) => {
    const offset = index * 3;
    const vx = velocities[offset];
    const vy = velocities[offset + 1];
    const vz = velocities[offset + 2];
    const speed = Math.max(EPSILON, Math.hypot(vx, vy, vz));
    const angle = random() * Math.PI * 2;
    const vertical = (random() - 0.5) * 1.2;
    let targetX = vx / speed
      + tangentA.x * Math.cos(angle) * 0.75
      + tangentB.x * Math.sin(angle) * 0.75
      + habitatUp.x * vertical;
    let targetY = vy / speed
      + tangentA.y * Math.cos(angle) * 0.75
      + tangentB.y * Math.sin(angle) * 0.75
      + habitatUp.y * vertical;
    let targetZ = vz / speed
      + tangentA.z * Math.cos(angle) * 0.75
      + tangentB.z * Math.sin(angle) * 0.75
      + habitatUp.z * vertical;
    const targetLength = Math.max(EPSILON, Math.hypot(targetX, targetY, targetZ));
    targetX /= targetLength;
    targetY /= targetLength;
    targetZ /= targetLength;
    wanderTargetX[index] = targetX;
    wanderTargetY[index] = targetY;
    wanderTargetZ[index] = targetZ;
    wanderTimers[index] = 0.38 + random() * 0.72;
  };

  const publishDiagnostics = () => {
    let moving = 0;
    let speedTotal = 0;
    let minimumSpeed = Infinity;
    let maximumSpeed = 0;
    let homeDistanceTotal = 0;
    let avoiding = 0;
    let minimumAltitude = Infinity;
    let maximumAltitude = -Infinity;
    centroid.set(0, 0, 0);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const speed = Math.hypot(
        velocities[offset],
        velocities[offset + 1],
        velocities[offset + 2],
      );
      if (speed >= MIN_SPEED * 0.9) moving += 1;
      speedTotal += speed;
      minimumSpeed = Math.min(minimumSpeed, speed);
      maximumSpeed = Math.max(maximumSpeed, speed);
      const dx = positions[offset] - homeCenter.x;
      const dy = positions[offset + 1] - homeCenter.y;
      const dz = positions[offset + 2] - homeCenter.z;
      homeDistanceTotal += Math.hypot(dx, dy, dz);
      scratchPosition.set(positions[offset], positions[offset + 1], positions[offset + 2]);
      planetUp.copy(scratchPosition).normalize();
      const altitude = scratchPosition.length() - getSurfaceRadius(planetUp);
      minimumAltitude = Math.min(minimumAltitude, altitude);
      maximumAltitude = Math.max(maximumAltitude, altitude);
      centroid.x += positions[offset];
      centroid.y += positions[offset + 1];
      centroid.z += positions[offset + 2];
      if (playerPosition) {
        const playerDx = positions[offset] - playerPosition.x;
        const playerDy = positions[offset + 1] - playerPosition.y;
        const playerDz = positions[offset + 2] - playerPosition.z;
        if (playerDx * playerDx + playerDy * playerDy + playerDz * playerDz
          < PLAYER_MID_RADIUS * PLAYER_MID_RADIUS) avoiding += 1;
      }
    }
    centroid.multiplyScalar(1 / count);
    let spreadX = 0;
    let spreadY = 0;
    let spreadZ = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const dx = positions[offset] - centroid.x;
      const dy = positions[offset + 1] - centroid.y;
      const dz = positions[offset + 2] - centroid.z;
      spreadX += Math.abs(dx * tangentA.x + dy * tangentA.y + dz * tangentA.z);
      spreadY += Math.abs(dx * habitatUp.x + dy * habitatUp.y + dz * habitatUp.z);
      spreadZ += Math.abs(dx * tangentB.x + dy * tangentB.y + dz * tangentB.z);
    }
    const playerDistance = playerPosition ? playerPosition.distanceTo(centroid) : Infinity;
    latestDiagnostics = Object.freeze({
      particles: count,
      moving,
      avgSpeed: speedTotal / count,
      minSpeed: minimumSpeed,
      maxSpeed: maximumSpeed,
      distanceFromHome: homeDistanceTotal / count,
      playerDistance,
      avoiding,
      minAltitude: minimumAltitude,
      maxAltitude: maximumAltitude,
      spreadX: spreadX / count,
      spreadY: spreadY / count,
      spreadZ: spreadZ / count,
      centroidX: centroid.x,
      centroidY: centroid.y,
      centroidZ: centroid.z,
    });
    if (debugHud) {
      debugHud.innerHTML = [
        "<strong>SWARM</strong>",
        `particles: ${count}`,
        `moving: ${moving}`,
        `avg speed: ${latestDiagnostics.avgSpeed.toFixed(1)}`,
        `min speed: ${minimumSpeed.toFixed(1)}`,
        `max speed: ${maximumSpeed.toFixed(1)}`,
        `distance from home: ${latestDiagnostics.distanceFromHome.toFixed(1)}`,
        `player distance: ${Number.isFinite(playerDistance) ? playerDistance.toFixed(1) : "--"}`,
      ].join("<br>");
      debugHud.dataset.moving = String(moving);
      debugHud.dataset.avgSpeed = latestDiagnostics.avgSpeed.toFixed(3);
      debugHud.dataset.minSpeed = minimumSpeed.toFixed(3);
      debugHud.dataset.maxSpeed = maximumSpeed.toFixed(3);
      debugHud.dataset.distanceFromHome = latestDiagnostics.distanceFromHome.toFixed(3);
      debugHud.dataset.playerDistance = Number.isFinite(playerDistance)
        ? playerDistance.toFixed(3)
        : "Infinity";
      debugHud.dataset.avoiding = String(avoiding);
      debugHud.dataset.minAltitude = minimumAltitude.toFixed(3);
      debugHud.dataset.maxAltitude = maximumAltitude.toFixed(3);
      debugHud.dataset.spread = [
        latestDiagnostics.spreadX,
        latestDiagnostics.spreadY,
        latestDiagnostics.spreadZ,
      ].map((value) => value.toFixed(3)).join(",");
      debugHud.dataset.centroid = [centroid.x, centroid.y, centroid.z]
        .map((value) => value.toFixed(3)).join(",");
    }
    diagnosticsCallback?.(latestDiagnostics);
  };

  publishDiagnostics();

  return {
    label: config.label,
    points,
    lights: [],
    getDiagnostics: () => latestDiagnostics,
    update(deltaSeconds) {
      if (disposed) return;
      const delta = Math.min(Math.max(deltaSeconds, 0), 1 / 24);
      if (delta <= 0) return;
      time += delta;
      debugElapsed += delta;
      material.uniforms.swarmTime.value = time;
      rebuildGrid();

      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        const px = positions[offset];
        const py = positions[offset + 1];
        const pz = positions[offset + 2];
        const vx = velocities[offset];
        const vy = velocities[offset + 1];
        const vz = velocities[offset + 2];
        let neighborCount = 0;
        let alignmentX = 0;
        let alignmentY = 0;
        let alignmentZ = 0;
        let cohesionX = 0;
        let cohesionY = 0;
        let cohesionZ = 0;
        let separationX = 0;
        let separationY = 0;
        let separationZ = 0;
        const cellX = gridCellX[index];
        const cellY = gridCellY[index];
        const cellZ = gridCellZ[index];

        for (let dz = -1; dz <= 1; dz += 1) {
          const z = cellZ + dz;
          if (z < 0 || z >= GRID_XZ_CELLS) continue;
          for (let dy = -1; dy <= 1; dy += 1) {
            const y = cellY + dy;
            if (y < 0 || y >= GRID_Y_CELLS) continue;
            for (let dx = -1; dx <= 1; dx += 1) {
              const x = cellX + dx;
              if (x < 0 || x >= GRID_XZ_CELLS) continue;
              let neighbor = gridHeads[cellIndex(x, y, z)];
              while (neighbor !== -1) {
                if (neighbor !== index) {
                  const neighborOffset = neighbor * 3;
                  const deltaX = positions[neighborOffset] - px;
                  const deltaY = positions[neighborOffset + 1] - py;
                  const deltaZ = positions[neighborOffset + 2] - pz;
                  const distanceSq = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
                  if (distanceSq < NEIGHBOR_RADIUS * NEIGHBOR_RADIUS && distanceSq > EPSILON) {
                    neighborCount += 1;
                    alignmentX += velocities[neighborOffset];
                    alignmentY += velocities[neighborOffset + 1];
                    alignmentZ += velocities[neighborOffset + 2];
                    cohesionX += positions[neighborOffset];
                    cohesionY += positions[neighborOffset + 1];
                    cohesionZ += positions[neighborOffset + 2];
                    if (distanceSq < SEPARATION_RADIUS * SEPARATION_RADIUS) {
                      separationX -= deltaX / distanceSq;
                      separationY -= deltaY / distanceSq;
                      separationZ -= deltaZ / distanceSq;
                    }
                  }
                }
                neighbor = gridNext[neighbor];
              }
            }
          }
        }

        let accelerationX = 0;
        let accelerationY = 0;
        let accelerationZ = 0;
        const preferredSpeed = preferredSpeeds[index];
        if (neighborCount > 0) {
          const alignmentLength = Math.max(EPSILON, Math.hypot(alignmentX, alignmentY, alignmentZ));
          accelerationX += (alignmentX / alignmentLength * preferredSpeed - vx) * 0.92;
          accelerationY += (alignmentY / alignmentLength * preferredSpeed - vy) * 0.92;
          accelerationZ += (alignmentZ / alignmentLength * preferredSpeed - vz) * 0.92;

          cohesionX = cohesionX / neighborCount - px;
          cohesionY = cohesionY / neighborCount - py;
          cohesionZ = cohesionZ / neighborCount - pz;
          const cohesionLength = Math.max(EPSILON, Math.hypot(cohesionX, cohesionY, cohesionZ));
          accelerationX += (cohesionX / cohesionLength * preferredSpeed - vx) * 0.42;
          accelerationY += (cohesionY / cohesionLength * preferredSpeed - vy) * 0.42;
          accelerationZ += (cohesionZ / cohesionLength * preferredSpeed - vz) * 0.42;

          const separationLength = Math.hypot(separationX, separationY, separationZ);
          if (separationLength > EPSILON) {
            accelerationX += (separationX / separationLength * preferredSpeed - vx) * 1.5;
            accelerationY += (separationY / separationLength * preferredSpeed - vy) * 1.5;
            accelerationZ += (separationZ / separationLength * preferredSpeed - vz) * 1.5;
          }
        }

        wanderTimers[index] -= delta;
        if (wanderTimers[index] <= 0) updateWanderTarget(index);
        const wanderBlend = 1 - Math.exp(-2.8 * delta);
        wanderX[index] += (wanderTargetX[index] - wanderX[index]) * wanderBlend;
        wanderY[index] += (wanderTargetY[index] - wanderY[index]) * wanderBlend;
        wanderZ[index] += (wanderTargetZ[index] - wanderZ[index]) * wanderBlend;
        accelerationX += wanderX[index] * 3.4;
        accelerationY += wanderY[index] * 3.4;
        accelerationZ += wanderZ[index] * 3.4;

        const relativeX = px - homeCenter.x;
        const relativeY = py - homeCenter.y;
        const relativeZ = pz - homeCenter.z;
        const homeDistance = Math.hypot(relativeX, relativeY, relativeZ);
        if (homeDistance > SOFT_BOUNDARY_RADIUS) {
          const boundaryMix = (homeDistance - SOFT_BOUNDARY_RADIUS)
            / (HARD_BOUNDARY_RADIUS - SOFT_BOUNDARY_RADIUS);
          const boundaryForce = 2.8 + Math.max(0, boundaryMix) ** 2 * 12;
          accelerationX -= relativeX / homeDistance * boundaryForce;
          accelerationY -= relativeY / homeDistance * boundaryForce;
          accelerationZ -= relativeZ / homeDistance * boundaryForce;
        }

        const localX = relativeX * tangentA.x + relativeY * tangentA.y + relativeZ * tangentA.z;
        const localZ = relativeX * tangentB.x + relativeY * tangentB.y + relativeZ * tangentB.z;
        const flowPhaseA = time * 0.36 + localZ * 0.055;
        const flowPhaseB = time * 0.29 + localX * 0.047;
        accelerationX += (
          tangentA.x * Math.cos(flowPhaseA)
          + tangentB.x * Math.sin(flowPhaseB)
          + habitatUp.x * Math.sin(flowPhaseA + flowPhaseB) * 0.32
        ) * 1.15;
        accelerationY += (
          tangentA.y * Math.cos(flowPhaseA)
          + tangentB.y * Math.sin(flowPhaseB)
          + habitatUp.y * Math.sin(flowPhaseA + flowPhaseB) * 0.32
        ) * 1.15;
        accelerationZ += (
          tangentA.z * Math.cos(flowPhaseA)
          + tangentB.z * Math.sin(flowPhaseB)
          + habitatUp.z * Math.sin(flowPhaseA + flowPhaseB) * 0.32
        ) * 1.15;

        scratchPosition.set(px, py, pz);
        planetUp.copy(scratchPosition).normalize();
        const surfaceRadius = getSurfaceRadius(planetUp);
        const altitude = scratchPosition.length() - surfaceRadius;
        if (altitude < SOFT_MIN_ALTITUDE) {
          const groundForce = (SOFT_MIN_ALTITUDE - altitude) * 4.8 + 4;
          accelerationX += planetUp.x * groundForce;
          accelerationY += planetUp.y * groundForce;
          accelerationZ += planetUp.z * groundForce;
        } else if (altitude > SOFT_MAX_ALTITUDE) {
          const ceilingForce = (altitude - SOFT_MAX_ALTITUDE) * 1.9;
          accelerationX -= planetUp.x * ceilingForce;
          accelerationY -= planetUp.y * ceilingForce;
          accelerationZ -= planetUp.z * ceilingForce;
        }

        if (config.avoid && playerPosition) {
          playerDelta.set(px, py, pz).sub(playerPosition);
          const playerDistance = playerDelta.length();
          if (playerDistance < PLAYER_MID_RADIUS && playerDistance > EPSILON) {
            let avoidanceForce = 0;
            if (playerDistance < PLAYER_PANIC_RADIUS) {
              avoidanceForce = 28 + (PLAYER_PANIC_RADIUS - playerDistance) * 3.2;
            } else if (playerDistance < PLAYER_NEAR_RADIUS) {
              avoidanceForce = 8 + (PLAYER_NEAR_RADIUS - playerDistance) * 1.45;
            } else {
              avoidanceForce = (PLAYER_MID_RADIUS - playerDistance) * 0.38;
            }
            playerDelta.multiplyScalar(1 / playerDistance);
            accelerationX += playerDelta.x * avoidanceForce;
            accelerationY += playerDelta.y * avoidanceForce;
            accelerationZ += playerDelta.z * avoidanceForce;
            if (playerDistance < PLAYER_PANIC_RADIUS) {
              const scatterSign = index % 2 === 0 ? 1 : -1;
              accelerationX += (tangentA.x * scatterSign + tangentB.x * (index % 3 - 1)) * 8;
              accelerationY += (tangentA.y * scatterSign + tangentB.y * (index % 3 - 1)) * 8
                + planetUp.y * 4;
              accelerationZ += (tangentA.z * scatterSign + tangentB.z * (index % 3 - 1)) * 8;
            }
          }
        }

        const accelerationLengthSq = accelerationX * accelerationX
          + accelerationY * accelerationY
          + accelerationZ * accelerationZ;
        if (accelerationLengthSq > MAX_STEER_FORCE * MAX_STEER_FORCE) {
          const accelerationScale = MAX_STEER_FORCE / Math.sqrt(accelerationLengthSq);
          accelerationX *= accelerationScale;
          accelerationY *= accelerationScale;
          accelerationZ *= accelerationScale;
        }
        accelerations[offset] = accelerationX;
        accelerations[offset + 1] = accelerationY;
        accelerations[offset + 2] = accelerationZ;
      }

      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        let vx = velocities[offset] + accelerations[offset] * delta;
        let vy = velocities[offset + 1] + accelerations[offset + 1] * delta;
        let vz = velocities[offset + 2] + accelerations[offset + 2] * delta;
        let speed = Math.max(EPSILON, Math.hypot(vx, vy, vz));
        const clampedSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
        const speedScale = clampedSpeed / speed;
        vx *= speedScale;
        vy *= speedScale;
        vz *= speedScale;
        velocities[offset] = vx;
        velocities[offset + 1] = vy;
        velocities[offset + 2] = vz;
        positions[offset] += vx * delta;
        positions[offset + 1] += vy * delta;
        positions[offset + 2] += vz * delta;

        scratchPosition.set(positions[offset], positions[offset + 1], positions[offset + 2]);
        planetUp.copy(scratchPosition).normalize();
        const surfaceRadius = getSurfaceRadius(planetUp);
        const altitude = scratchPosition.length() - surfaceRadius;
        if (altitude < MIN_ALTITUDE) {
          scratchPosition.copy(planetUp).multiplyScalar(surfaceRadius + MIN_ALTITUDE);
          positions[offset] = scratchPosition.x;
          positions[offset + 1] = scratchPosition.y;
          positions[offset + 2] = scratchPosition.z;
          const inwardSpeed = vx * planetUp.x + vy * planetUp.y + vz * planetUp.z;
          if (inwardSpeed < 0) {
            velocities[offset] -= planetUp.x * inwardSpeed * 1.15;
            velocities[offset + 1] -= planetUp.y * inwardSpeed * 1.15;
            velocities[offset + 2] -= planetUp.z * inwardSpeed * 1.15;
          }
        } else if (altitude > HARD_MAX_ALTITUDE) {
          scratchPosition.copy(planetUp).multiplyScalar(surfaceRadius + HARD_MAX_ALTITUDE);
          positions[offset] = scratchPosition.x;
          positions[offset + 1] = scratchPosition.y;
          positions[offset + 2] = scratchPosition.z;
        }
      }

      positionAttribute.needsUpdate = true;
      if (debugElapsed >= 0.2) {
        debugElapsed = 0;
        publishDiagnostics();
      }
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
