const HABITAT_RADIUS = 30;
const MIN_ALTITUDE = 2.8;
const MAX_ALTITUDE = 14;
const AVOID_RADIUS = 22;
const SUBGROUP_COUNT = 5;

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
      pointSize: { value: 5.4 },
    },
    vertexShader: `
      uniform float pointSize;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = pointSize * clamp(250.0 / max(1.0, -viewPosition.z), 0.7, 3.2);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius >= 1.0) discard;
        float halo = pow(1.0 - radius, 2.2);
        float core = 1.0 - smoothstep(0.0, 0.28, radius);
        gl_FragColor = vec4(vColor * (1.15 + core * 1.9), halo * 0.78 + core * 0.22);
      }
    `,
  });
}

export function createNightSwarm({
  THREE,
  scene,
  config,
  centerDirection,
  getSurfaceRadius,
  playerPosition,
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
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const localX = new Float32Array(count);
  const localY = new Float32Array(count);
  const localZ = new Float32Array(count);
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const baseZ = new Float32Array(count);
  const velocityX = new Float32Array(count);
  const velocityY = new Float32Array(count);
  const velocityZ = new Float32Array(count);
  const phases = new Float32Array(count);
  const subgroups = new Uint8Array(count);
  const color = new THREE.Color();
  const direction = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const habitatReferenceRadius = getSurfaceRadius(habitatUp)
    + (MIN_ALTITUDE + MAX_ALTITUDE) * 0.5;

  const writeWorldPosition = (index) => {
    direction.copy(habitatUp)
      .addScaledVector(tangentA, localX[index] / habitatReferenceRadius)
      .addScaledVector(tangentB, localZ[index] / habitatReferenceRadius)
      .normalize();
    worldPosition.copy(direction).multiplyScalar(getSurfaceRadius(direction) + localY[index]);
    const offset = index * 3;
    positions[offset] = worldPosition.x;
    positions[offset + 1] = worldPosition.y;
    positions[offset + 2] = worldPosition.z;
  };

  for (let index = 0; index < count; index += 1) {
    const radius = Math.sqrt(random()) * HABITAT_RADIUS * 0.78;
    const angle = random() * Math.PI * 2;
    baseX[index] = localX[index] = Math.cos(angle) * radius;
    baseZ[index] = localZ[index] = Math.sin(angle) * radius;
    baseY[index] = localY[index] = MIN_ALTITUDE + 1.2 + random() * (MAX_ALTITUDE - MIN_ALTITUDE - 2.4);
    phases[index] = random() * Math.PI * 2;
    subgroups[index] = index % SUBGROUP_COUNT;
    color.setHSL(0.16 + random() * 0.055, 0.82, 0.68 + random() * 0.13);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    writeWorldPosition(index);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(config.avoid || config.group
    ? THREE.DynamicDrawUsage
    : THREE.StaticDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const material = createGlowMaterial(THREE);
  const points = new THREE.Points(geometry, material);
  points.name = `NightSwarm_${config.label}`;
  points.frustumCulled = false;
  points.renderOrder = 4;
  scene.add(points);

  const lights = Array.from({ length: config.lightCount }, (_, index) => {
    const light = new THREE.PointLight(index % 2 ? 0xf4ff9b : 0xdfff72, 0, 34, 2);
    light.name = `NightSwarmLight_${index + 1}`;
    light.castShadow = false;
    scene.add(light);
    return light;
  });
  const lightSums = new Float32Array(Math.max(1, lights.length) * 3);
  const lightCounts = new Uint16Array(Math.max(1, lights.length));
  const playerDelta = new THREE.Vector3();
  let time = 0;
  let disposed = false;

  const updateLights = () => {
    if (!lights.length) return;
    lightSums.fill(0);
    lightCounts.fill(0);
    for (let index = 0; index < count; index += 1) {
      const lightIndex = lights.length === 1 ? 0 : index % lights.length;
      const offset = index * 3;
      lightSums[lightIndex * 3] += positions[offset];
      lightSums[lightIndex * 3 + 1] += positions[offset + 1];
      lightSums[lightIndex * 3 + 2] += positions[offset + 2];
      lightCounts[lightIndex] += 1;
    }
    for (let index = 0; index < lights.length; index += 1) {
      const divisor = Math.max(1, lightCounts[index]);
      const offset = index * 3;
      const light = lights[index];
      light.position.set(
        lightSums[offset] / divisor,
        lightSums[offset + 1] / divisor,
        lightSums[offset + 2] / divisor,
      );
      const distance = playerPosition?.distanceTo(light.position) ?? Infinity;
      const proximity = THREE.MathUtils.clamp(1 - distance / 72, 0, 1);
      light.intensity = proximity * proximity * (lights.length === 1 ? 720 : 260);
    }
  };
  updateLights();

  return {
    label: config.label,
    points,
    lights,
    update(deltaSeconds) {
      if (disposed || (!config.avoid && !config.group)) return;
      const delta = Math.min(Math.max(deltaSeconds, 0), 1 / 20);
      if (delta <= 0) return;
      time += delta;
      const player = playerPosition;

      for (let index = 0; index < count; index += 1) {
        const subgroup = subgroups[index];
        const groupAngle = time * (0.14 + subgroup * 0.007) + subgroup * 1.37;
        const groupX = config.group ? Math.sin(groupAngle) * 4.8 : 0;
        const groupZ = config.group ? Math.cos(groupAngle * 0.91) * 4.4 : 0;
        const groupY = config.group ? Math.sin(groupAngle * 1.23) * 1.25 : 0;
        const targetX = baseX[index] + groupX;
        const targetY = baseY[index] + groupY;
        const targetZ = baseZ[index] + groupZ;
        const phase = phases[index];
        let accelerationX = (targetX - localX[index]) * (config.group ? 0.72 : 1.05)
          + Math.sin(time * 0.73 + phase) * 0.2;
        let accelerationY = (targetY - localY[index]) * 0.94
          + Math.sin(time * 0.91 + phase * 1.7) * 0.16;
        let accelerationZ = (targetZ - localZ[index]) * (config.group ? 0.72 : 1.05)
          + Math.cos(time * 0.67 + phase) * 0.2;

        if (config.avoid && player) {
          const offset = index * 3;
          worldPosition.set(positions[offset], positions[offset + 1], positions[offset + 2]);
          playerDelta.subVectors(worldPosition, player);
          const distanceSq = playerDelta.lengthSq();
          if (distanceSq < AVOID_RADIUS * AVOID_RADIUS && distanceSq > 0.0001) {
            const distance = Math.sqrt(distanceSq);
            const force = (1 - distance / AVOID_RADIUS) * 22;
            playerDelta.multiplyScalar(1 / distance);
            accelerationX += playerDelta.dot(tangentA) * force;
            accelerationY += playerDelta.dot(habitatUp) * force * 0.7 + force * 0.24;
            accelerationZ += playerDelta.dot(tangentB) * force;
          }
        }

        velocityX[index] += accelerationX * delta;
        velocityY[index] += accelerationY * delta;
        velocityZ[index] += accelerationZ * delta;
        const damping = Math.exp(-(config.group ? 2.1 : 2.7) * delta);
        velocityX[index] *= damping;
        velocityY[index] *= damping;
        velocityZ[index] *= damping;
        localX[index] += velocityX[index] * delta;
        localY[index] += velocityY[index] * delta;
        localZ[index] += velocityZ[index] * delta;

        const horizontalRadius = Math.hypot(localX[index], localZ[index]);
        if (horizontalRadius > HABITAT_RADIUS) {
          const scale = HABITAT_RADIUS / horizontalRadius;
          localX[index] *= scale;
          localZ[index] *= scale;
          velocityX[index] *= 0.35;
          velocityZ[index] *= 0.35;
        }
        if (localY[index] < MIN_ALTITUDE) {
          localY[index] = MIN_ALTITUDE;
          velocityY[index] = Math.max(0, velocityY[index]) * 0.35;
        } else if (localY[index] > MAX_ALTITUDE) {
          localY[index] = MAX_ALTITUDE;
          velocityY[index] = Math.min(0, velocityY[index]) * 0.35;
        }
        writeWorldPosition(index);
      }

      positionAttribute.needsUpdate = true;
      updateLights();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(points);
      for (const light of lights) scene.remove(light);
      geometry.dispose();
      material.dispose();
    },
  };
}
