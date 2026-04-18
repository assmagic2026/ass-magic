// Main tuning knobs for the prototype feel.
const CONFIG = {
  canvasWidth: 420,
  canvasHeight: 680,
  worldLeft: 24,
  worldRight: 396,
  worldTop: 20,
  floorY: 630,
  spawnX: 210,
  spawnY: 88,
  spawnDelayMs: 320,
  fallSpeed: 86,
  fastFallMultiplier: 2.1,
  fallMoveSpeed: 225,
  fixedStepMs: 1000 / 60,
  physicsSubsteps: 3,
  solverIterations: 5,
  gravity: 980,
  airDrag: 0.996,
  floorBounce: 0.06,
  wallBounce: 0.08,
  floorFriction: 0.82,
  outerParticleCount: 8,
  baseRadiusMin: 24,
  baseRadiusMax: 30,
  bigChance: 0.14,
  bigScaleMin: 1.12,
  bigScaleMax: 1.28,
  particleRadiusFactor: 0.22,
  spokeStiffness: 0.28,
  rimStiffness: 0.21,
  crossStiffness: 0.12,
  spawnBlockRadius: 42,
  gameOverLineY: 116,
  crowdTintStart: 18,
  releaseVelocityFactor: 0.85,
  settleSpeedThreshold: 0.5,
  settleFramesRequired: 18,
  settleMinMs: 260,
  surfaceWalkerCount: 5,
  walkForce: 180,
  walkDurationMinMs: 900,
  walkDurationMaxMs: 1800,
  walkCooldownMinMs: 700,
  walkCooldownMaxMs: 1800,
  footFlutterAmplitude: 0.18,
  footFlutterSpeedMin: 0.0055,
  footFlutterSpeedMax: 0.0085,
  burstImpulseMin: 240,
  burstImpulseMax: 360,
  burstCenterLiftMin: 180,
  burstCenterLiftMax: 280,
  burstSpringFactor: 0.16,
  burstDurationMs: 220,
  burstBoundaryBounce: 0.46,
  burstFloorFriction: 0.94,
  burstCollisionPush: 0.72,
  burstCollisionRecoil: 0.18,
  tapMaxMoveDistance: 16,
  tapMaxTimeMs: 280
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const restartButton = document.getElementById("restartButton");
const countValue = document.getElementById("countValue");
const timeValue = document.getElementById("timeValue");
const gameOverPanel = document.getElementById("gameOverPanel");

const game = {
  bodies: [],
  particles: [],
  activeBody: null,
  spawnCooldown: 0,
  startTime: 0,
  elapsedMs: 0,
  count: 0,
  gameOver: false,
  lastFrame: 0,
  accumulator: 0,
  nextBodyId: 1
};

const input = {
  left: false,
  right: false,
  fast: false
};

const drag = {
  active: false,
  pointerId: null,
  targetX: CONFIG.spawnX
};

const tap = {
  active: false,
  pointerId: null,
  bodyId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  canceled: false
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function hsl(h, s, l, alpha = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function getDirectionInput() {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

function getPointerCanvasX(event) {
  const rect = canvas.getBoundingClientRect();
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  return clamp(ratio * CONFIG.canvasWidth, 0, CONFIG.canvasWidth);
}

function getCanvasXFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  return clamp(ratio * CONFIG.canvasWidth, 0, CONFIG.canvasWidth);
}

function getPointerCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  const yRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  return {
    x: clamp(xRatio * CONFIG.canvasWidth, 0, CONFIG.canvasWidth),
    y: clamp(yRatio * CONFIG.canvasHeight, 0, CONFIG.canvasHeight)
  };
}

function getCanvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const xRatio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  const yRatio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  return {
    x: clamp(xRatio * CONFIG.canvasWidth, 0, CONFIG.canvasWidth),
    y: clamp(yRatio * CONFIG.canvasHeight, 0, CONFIG.canvasHeight)
  };
}

function updateDragTarget(event) {
  drag.targetX = getPointerCanvasX(event);
}

function endDrag(event) {
  if (event && drag.pointerId !== null && event.pointerId !== drag.pointerId) {
    return;
  }

  if (drag.pointerId !== null && canvas.releasePointerCapture) {
    try {
      canvas.releasePointerCapture(drag.pointerId);
    } catch (error) {
      // Ignore release errors when capture has already been cleared.
    }
  }

  drag.active = false;
  drag.pointerId = null;
}

function endTap(event) {
  if (event && tap.pointerId !== null && event.pointerId !== tap.pointerId) {
    return;
  }

  if (tap.pointerId !== null && canvas.releasePointerCapture) {
    try {
      canvas.releasePointerCapture(tap.pointerId);
    } catch (error) {
      // Ignore release errors when capture has already been cleared.
    }
  }

  tap.active = false;
  tap.pointerId = null;
  tap.bodyId = null;
  tap.canceled = false;
}

function createParticle(x, y, radius, body) {
  return {
    x,
    y,
    oldX: x,
    oldY: y,
    radius,
    body
  };
}

function setParticlePosition(particle, x, y, preserveVelocity = false) {
  const velocityX = preserveVelocity ? particle.x - particle.oldX : 0;
  const velocityY = preserveVelocity ? particle.y - particle.oldY : 0;
  particle.x = x;
  particle.y = y;
  particle.oldX = x - velocityX;
  particle.oldY = y - velocityY;
}

function addSpring(body, aIndex, bIndex, stiffness) {
  const particleA = game.particles[aIndex];
  const particleB = game.particles[bIndex];
  body.springs.push({
    aIndex,
    bIndex,
    restLength: distance(particleA.x, particleA.y, particleB.x, particleB.y),
    stiffness
  });
}

function refreshBodyCache(body) {
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let speedSum = 0;

  body.particleIndices.forEach((index) => {
    const particle = game.particles[index];
    sumX += particle.x;
    sumY += particle.y;
    minX = Math.min(minX, particle.x - particle.radius);
    minY = Math.min(minY, particle.y - particle.radius);
    maxX = Math.max(maxX, particle.x + particle.radius);
    maxY = Math.max(maxY, particle.y + particle.radius);
    speedSum += Math.hypot(particle.x - particle.oldX, particle.y - particle.oldY);
  });

  body.cache = {
    cx: sumX / body.particleIndices.length,
    cy: sumY / body.particleIndices.length,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    avgSpeed: speedSum / body.particleIndices.length
  };
}

function isPointInsideBody(body, x, y) {
  const radiusX = Math.max(20, body.cache.width * 0.5 + body.radius * 0.1);
  const radiusY = Math.max(18, body.cache.height * 0.54 + body.radius * 0.08);
  const dx = (x - body.cache.cx) / radiusX;
  const dy = (y - body.cache.cy) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function findBodyAtPoint(x, y) {
  return [...game.bodies]
    .filter((body) => body.state === "resting" || body.state === "settling")
    .sort((bodyA, bodyB) => bodyB.cache.cy - bodyA.cache.cy)
    .find((body) => isPointInsideBody(body, x, y)) || null;
}

function getBodyById(bodyId) {
  return game.bodies.find((body) => body.id === bodyId) || null;
}

function createMendakoBody() {
  const big = Math.random() < CONFIG.bigChance;
  const scale = big ? randomRange(CONFIG.bigScaleMin, CONFIG.bigScaleMax) : randomRange(0.92, 1.05);
  const radius = randomRange(CONFIG.baseRadiusMin, CONFIG.baseRadiusMax) * scale;
  const hue = 324 + randomRange(-9, 10);
  const saturation = 70 + randomRange(-5, 7);
  const lightness = 77 + randomRange(-5, 6);

  const body = {
    id: game.nextBodyId,
    particleIndices: [],
    ringIndices: [],
    springs: [],
    radius,
    state: "falling",
    hue,
    saturation,
    lightness,
    blush: Math.random() < 0.75,
    eyeSpread: randomRange(0.14, 0.2),
    eyeScale: randomRange(0.95, 1.12),
    faceLift: randomRange(0.04, 0.1),
    mouthCurve: randomRange(0.14, 0.22),
    faceNudgeX: randomRange(-0.05, 0.05),
    faceTilt: randomRange(-0.08, 0.08),
    crown: randomRange(0.92, 1.08),
    wobbleSeed: Math.random() * Math.PI * 2,
    wobbleRate: randomRange(0.8, 1.22),
    settleFrames: 0,
    releasedAt: 0,
    localOffsets: [],
    footPhase: Math.random() * Math.PI * 2,
    footRate: randomRange(CONFIG.footFlutterSpeedMin, CONFIG.footFlutterSpeedMax),
    walkDir: 0,
    walkUntil: 0,
    nextWalkAt: randomRange(500, 1500),
    surfaceWalker: false,
    burstUntil: 0
  };

  game.nextBodyId += 1;

  const centerRadius = radius * CONFIG.particleRadiusFactor;
  const centerIndex = game.particles.length;
  game.particles.push(createParticle(CONFIG.spawnX, CONFIG.spawnY, centerRadius, body));
  body.particleIndices.push(centerIndex);
  body.centerIndex = centerIndex;
  body.localOffsets.push({ x: 0, y: 0 });

  const ringOffsets = [
    { x: 0, y: -radius * 0.48, size: 0.92 },
    { x: radius * 0.5, y: -radius * 0.38, size: 0.86 },
    { x: radius * 0.74, y: -radius * 0.02, size: 1.02 },
    { x: radius * 0.42, y: radius * 0.46, size: 0.82 },
    { x: 0, y: radius * 0.56, size: 0.74 },
    { x: -radius * 0.42, y: radius * 0.46, size: 0.82 },
    { x: -radius * 0.74, y: -radius * 0.02, size: 1.02 },
    { x: -radius * 0.5, y: -radius * 0.38, size: 0.86 }
  ];

  for (const offset of ringOffsets) {
    const x = CONFIG.spawnX + offset.x;
    const y = CONFIG.spawnY + offset.y;
    const particleRadius = radius * CONFIG.particleRadiusFactor * offset.size * randomRange(0.96, 1.04);
    const particleIndex = game.particles.length;
    game.particles.push(createParticle(x, y, particleRadius, body));
    body.particleIndices.push(particleIndex);
    body.ringIndices.push(particleIndex);
    body.localOffsets.push({ x: offset.x, y: offset.y });
  }

  body.ringIndices.forEach((ringIndex, index) => {
    addSpring(body, centerIndex, ringIndex, CONFIG.spokeStiffness);
    addSpring(body, ringIndex, body.ringIndices[(index + 1) % body.ringIndices.length], CONFIG.rimStiffness);
    addSpring(body, ringIndex, body.ringIndices[(index + 2) % body.ringIndices.length], CONFIG.crossStiffness * 0.9);
  });

  for (let i = 0; i < body.ringIndices.length / 2; i += 1) {
    addSpring(body, body.ringIndices[i], body.ringIndices[i + body.ringIndices.length / 2], CONFIG.crossStiffness);
  }

  refreshBodyCache(body);
  return body;
}

function positionBodyFromLocalOffsets(body, centerX, centerY, preserveVelocity = false) {
  body.localOffsets.forEach((offset, index) => {
    const particle = game.particles[body.particleIndices[index]];
    setParticlePosition(particle, centerX + offset.x, centerY + offset.y, preserveVelocity);
  });

  body.fallCenterX = centerX;
  body.fallCenterY = centerY;
  refreshBodyCache(body);
}

function canSpawnBody() {
  const blockRadius = CONFIG.spawnBlockRadius;

  for (const particle of game.particles) {
    if (distance(particle.x, particle.y, CONFIG.spawnX, CONFIG.spawnY) < particle.radius + blockRadius) {
      return false;
    }
  }

  return true;
}

function spawnBody() {
  if (!canSpawnBody()) {
    triggerGameOver();
    return;
  }

  const body = createMendakoBody();
  positionBodyFromLocalOffsets(body, CONFIG.spawnX, CONFIG.spawnY);
  drag.targetX = CONFIG.spawnX;
  game.bodies.push(body);
  game.activeBody = body;
}

function triggerGameOver() {
  game.gameOver = true;
  game.activeBody = null;
  drag.active = false;
  drag.pointerId = null;
  tap.active = false;
  tap.pointerId = null;
  tap.bodyId = null;
  gameOverPanel.hidden = false;
}

function burstBody(body) {
  if (!body) {
    return;
  }

  const now = performance.now();
  body.burstUntil = now + CONFIG.burstDurationMs;
  body.walkDir = 0;
  body.walkUntil = 0;
  body.nextWalkAt = now + randomRange(CONFIG.walkCooldownMinMs, CONFIG.walkCooldownMaxMs);
  body.surfaceWalker = false;

  const { cx, cy } = body.cache;

  body.particleIndices.forEach((index, particleIndex) => {
    const particle = game.particles[index];
    let dx = particle.x - cx;
    let dy = particle.y - cy;
    let length = Math.hypot(dx, dy);

    if (length < 0.001) {
      dx = randomRange(-0.6, 0.6);
      dy = randomRange(-1.1, -0.4);
      length = Math.hypot(dx, dy) || 1;
    }

    const directionX = dx / length;
    const directionY = dy / length;
    const impulse = randomRange(CONFIG.burstImpulseMin, CONFIG.burstImpulseMax);
    const lift = particleIndex === 0
      ? randomRange(CONFIG.burstCenterLiftMin, CONFIG.burstCenterLiftMax)
      : randomRange(18, 58);
    const jitterX = randomRange(-18, 18);
    const jitterY = randomRange(-14, 10);
    const velocityX = directionX * impulse + jitterX;
    const velocityY = directionY * impulse - lift + jitterY;

    particle.oldX = particle.x - velocityX;
    particle.oldY = particle.y - velocityY;
  });
}

function finishSettlingBody(body) {
  if (body.state === "resting") {
    return;
  }

  body.state = "resting";
  body.walkDir = 0;
  body.walkUntil = 0;
  body.nextWalkAt = performance.now() + randomRange(CONFIG.walkCooldownMinMs, CONFIG.walkCooldownMaxMs);
  body.particleIndices.forEach((index) => {
    const particle = game.particles[index];
    particle.oldX = particle.x;
    particle.oldY = particle.y;
  });

  game.count += 1;
  if (countValue) {
    countValue.textContent = String(game.count);
  }
  game.spawnCooldown = CONFIG.spawnDelayMs;
}

function releaseActiveBody(horizontalVelocity, verticalVelocity, dt) {
  if (!game.activeBody) {
    return;
  }

  const body = game.activeBody;
  body.state = "settling";
  body.releasedAt = performance.now();
  body.settleFrames = 0;

  body.particleIndices.forEach((index) => {
    const particle = game.particles[index];
    particle.oldX = particle.x - horizontalVelocity * dt * CONFIG.releaseVelocityFactor;
    particle.oldY = particle.y - verticalVelocity * dt * CONFIG.releaseVelocityFactor;
  });

  game.activeBody = null;
}

function updateRestingWalkers(now) {
  const restingBodies = game.bodies
    .filter((body) => body.state === "resting")
    .sort((bodyA, bodyB) => bodyA.cache.minY - bodyB.cache.minY);

  const surfaceIds = new Set(
    restingBodies
      .slice(0, CONFIG.surfaceWalkerCount)
      .map((body) => body.id)
  );

  restingBodies.forEach((body) => {
    if (body.burstUntil > now) {
      body.surfaceWalker = false;
      body.walkDir = 0;
      body.walkUntil = 0;
      body.nextWalkAt = now + randomRange(CONFIG.walkCooldownMinMs, CONFIG.walkCooldownMaxMs);
      return;
    }

    body.surfaceWalker = surfaceIds.has(body.id);

    if (!body.surfaceWalker) {
      body.walkDir = 0;
      body.walkUntil = 0;
      return;
    }

    if (now < body.walkUntil) {
      return;
    }

    body.walkDir = 0;

    if (now >= body.nextWalkAt) {
      body.walkDir = Math.random() < 0.5 ? -1 : 1;
      body.walkUntil = now + randomRange(CONFIG.walkDurationMinMs, CONFIG.walkDurationMaxMs);
      body.nextWalkAt = body.walkUntil + randomRange(CONFIG.walkCooldownMinMs, CONFIG.walkCooldownMaxMs);
    }
  });
}

function solveSpring(spring, now) {
  const particleA = game.particles[spring.aIndex];
  const particleB = game.particles[spring.bIndex];
  const body = particleA.body;
  const burstFactor = body.burstUntil > now ? CONFIG.burstSpringFactor : 1;
  const dx = particleB.x - particleA.x;
  const dy = particleB.y - particleA.y;
  const currentLength = Math.hypot(dx, dy) || 0.0001;
  const difference = (currentLength - spring.restLength) / currentLength;
  const offsetX = dx * difference * spring.stiffness * burstFactor * 0.5;
  const offsetY = dy * difference * spring.stiffness * burstFactor * 0.5;

  particleA.x += offsetX;
  particleA.y += offsetY;
  particleB.x -= offsetX;
  particleB.y -= offsetY;
}

function bodyHasCollision(body) {
  for (const index of body.particleIndices) {
    const particle = game.particles[index];

    if (particle.x - particle.radius < CONFIG.worldLeft || particle.x + particle.radius > CONFIG.worldRight) {
      return true;
    }

    if (particle.y + particle.radius > CONFIG.floorY) {
      return true;
    }

    for (const other of game.particles) {
      if (other.body === body) {
        continue;
      }

      const minimumDistance = particle.radius + other.radius;
      if (distance(particle.x, particle.y, other.x, other.y) < minimumDistance) {
        return true;
      }
    }
  }

  return false;
}

function applyBoundaryCollision(particle, now) {
  const burstActive = particle.body.burstUntil > now;
  const bounce = burstActive ? CONFIG.burstBoundaryBounce : CONFIG.wallBounce;
  const floorFriction = burstActive ? CONFIG.burstFloorFriction : CONFIG.floorFriction;

  if (particle.x < CONFIG.worldLeft + particle.radius) {
    const velocityX = particle.x - particle.oldX;
    particle.x = CONFIG.worldLeft + particle.radius;
    particle.oldX = particle.x + velocityX * bounce;
  }

  if (particle.x > CONFIG.worldRight - particle.radius) {
    const velocityX = particle.x - particle.oldX;
    particle.x = CONFIG.worldRight - particle.radius;
    particle.oldX = particle.x + velocityX * bounce;
  }

  if (particle.y < CONFIG.worldTop + particle.radius) {
    const velocityX = particle.x - particle.oldX;
    const velocityY = particle.y - particle.oldY;
    particle.y = CONFIG.worldTop + particle.radius;
    particle.oldY = particle.y + velocityY * bounce;
    particle.oldX = particle.x - velocityX * floorFriction;
  }

  if (particle.y > CONFIG.floorY - particle.radius) {
    const velocityX = particle.x - particle.oldX;
    const velocityY = particle.y - particle.oldY;
    particle.y = CONFIG.floorY - particle.radius;
    particle.oldY = particle.y + velocityY * bounce;
    particle.oldX = particle.x - velocityX * floorFriction;
    particle.body.stepTouched = true;
  }
}

function moveActiveBodyKinematically(dt) {
  const body = game.activeBody;
  if (!body) {
    return;
  }

  const direction = getDirectionInput();
  let nextCenterX = body.fallCenterX;
  if (drag.active) {
    nextCenterX = clamp(drag.targetX, CONFIG.worldLeft + body.radius, CONFIG.worldRight - body.radius);
  } else {
    nextCenterX += direction * CONFIG.fallMoveSpeed * dt;
  }

  const horizontalStep = nextCenterX - body.fallCenterX;
  const verticalStep = CONFIG.fallSpeed * (input.fast ? CONFIG.fastFallMultiplier : 1) * dt;

  if (horizontalStep !== 0) {
    positionBodyFromLocalOffsets(body, body.fallCenterX + horizontalStep, body.fallCenterY);
    if (bodyHasCollision(body)) {
      positionBodyFromLocalOffsets(body, body.fallCenterX - horizontalStep, body.fallCenterY);
    }
  }

  positionBodyFromLocalOffsets(body, body.fallCenterX, body.fallCenterY + verticalStep);
  if (bodyHasCollision(body)) {
    positionBodyFromLocalOffsets(body, body.fallCenterX, body.fallCenterY - verticalStep);
    releaseActiveBody(horizontalStep / dt || 0, verticalStep / dt, dt);
  }
}

function solveParticleCollisions(now) {
  for (let i = 0; i < game.particles.length - 1; i += 1) {
    const particleA = game.particles[i];

    for (let j = i + 1; j < game.particles.length; j += 1) {
      const particleB = game.particles[j];
      if (particleA.body === particleB.body) {
        continue;
      }

      let dx = particleB.x - particleA.x;
      let dy = particleB.y - particleA.y;
      let distanceSq = dx * dx + dy * dy;
      const minDistance = particleA.radius + particleB.radius;

      if (distanceSq >= minDistance * minDistance) {
        continue;
      }

      if (distanceSq < 0.0001) {
        dx = randomRange(-0.5, 0.5);
        dy = randomRange(-0.5, 0.5);
        distanceSq = dx * dx + dy * dy;
      }

      const currentDistance = Math.sqrt(distanceSq);
      const overlap = minDistance - currentDistance;
      const normalX = dx / currentDistance;
      const normalY = dy / currentDistance;
      const offsetX = normalX * overlap * 0.5;
      const offsetY = normalY * overlap * 0.5;

      particleA.x -= offsetX;
      particleA.y -= offsetY;
      particleB.x += offsetX;
      particleB.y += offsetY;

      const burstA = particleA.body.burstUntil > now;
      const burstB = particleB.body.burstUntil > now;

      if (burstA || burstB) {
        const push = overlap * CONFIG.burstCollisionPush;
        const recoil = overlap * CONFIG.burstCollisionRecoil;

        if (burstA && !burstB) {
          particleA.oldX += normalX * recoil;
          particleA.oldY += normalY * recoil;
          particleB.oldX -= normalX * push;
          particleB.oldY -= normalY * push;
        } else if (burstB && !burstA) {
          particleA.oldX += normalX * push;
          particleA.oldY += normalY * push;
          particleB.oldX -= normalX * recoil;
          particleB.oldY -= normalY * recoil;
        } else {
          const shared = overlap * 0.26;
          particleA.oldX += normalX * shared;
          particleA.oldY += normalY * shared;
          particleB.oldX -= normalX * shared;
          particleB.oldY -= normalY * shared;
        }
      }

      particleA.body.stepTouched = true;
      particleB.body.stepTouched = true;
    }
  }
}

function integrateParticles(dt) {
  game.particles.forEach((particle) => {
    const body = particle.body;
    if (body.state === "falling") {
      return;
    }

    const velocityX = (particle.x - particle.oldX) * CONFIG.airDrag;
    const velocityY = (particle.y - particle.oldY) * CONFIG.airDrag;
    const accelerationX = body.state === "resting" && body.surfaceWalker
      ? body.walkDir * CONFIG.walkForce
      : 0;
    const accelerationY = CONFIG.gravity;

    particle.oldX = particle.x;
    particle.oldY = particle.y;
    particle.x += velocityX + accelerationX * dt * dt;
    particle.y += velocityY + accelerationY * dt * dt;
  });
}

function simulateSubstep(dt) {
  const now = performance.now();

  game.bodies.forEach((body) => {
    body.stepTouched = false;
  });

  moveActiveBodyKinematically(dt);
  integrateParticles(dt);

  for (let iteration = 0; iteration < CONFIG.solverIterations; iteration += 1) {
    game.bodies.forEach((body) => {
      if (body.state === "falling") {
        return;
      }
      body.springs.forEach((spring) => solveSpring(spring, now));
    });

    solveParticleCollisions(now);

    game.particles.forEach((particle) => applyBoundaryCollision(particle, now));
  }

  game.bodies.forEach(refreshBodyCache);

  game.bodies.forEach((body) => {
    if (body.state !== "settling") {
      return;
    }

    if (body.cache.avgSpeed < CONFIG.settleSpeedThreshold) {
      body.settleFrames += 1;
    } else {
      body.settleFrames = 0;
    }

    if (
      body.settleFrames >= CONFIG.settleFramesRequired &&
      performance.now() - body.releasedAt >= CONFIG.settleMinMs
    ) {
      finishSettlingBody(body);
    }
  });
}

function stepSimulation(fixedStepMs) {
  if (game.gameOver) {
    return;
  }

  const substepDt = fixedStepMs / 1000 / CONFIG.physicsSubsteps;
  for (let step = 0; step < CONFIG.physicsSubsteps; step += 1) {
    simulateSubstep(substepDt);
  }

  const hasSettlingBody = game.bodies.some((body) => body.state === "settling");
  if (!game.activeBody && !hasSettlingBody) {
    game.spawnCooldown -= fixedStepMs;
    if (game.spawnCooldown <= 0) {
      spawnBody();
    }
  }
}

function resetGame() {
  game.bodies = [];
  game.particles = [];
  game.activeBody = null;
  game.spawnCooldown = 0;
  game.startTime = performance.now();
  game.elapsedMs = 0;
  game.count = 0;
  game.gameOver = false;
  game.lastFrame = 0;
  game.accumulator = 0;
  game.nextBodyId = 1;
  drag.active = false;
  drag.pointerId = null;
  tap.active = false;
  tap.pointerId = null;
  tap.bodyId = null;
  drag.targetX = CONFIG.spawnX;

  if (countValue) {
    countValue.textContent = "0";
  }
  if (timeValue) {
    timeValue.textContent = "0.0s";
  }
  gameOverPanel.hidden = true;

  spawnBody();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CONFIG.canvasWidth * dpr;
  canvas.height = CONFIG.canvasHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackground(now) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvasHeight);
  gradient.addColorStop(0, "#edf7f6");
  gradient.addColorStop(0.52, "#dde9ea");
  gradient.addColorStop(1, "#d7dfda");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  const glow = ctx.createRadialGradient(
    CONFIG.canvasWidth * 0.5,
    130,
    24,
    CONFIG.canvasWidth * 0.5,
    130,
    240
  );
  glow.addColorStop(0, "rgba(255, 229, 240, 0.48)");
  glow.addColorStop(1, "rgba(255, 229, 240, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  for (let i = 0; i < 5; i += 1) {
    const y = 86 + i * 96;
    const drift = Math.sin(now * 0.0004 + i * 1.5) * 10;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + drift);
    ctx.bezierCurveTo(
      CONFIG.canvasWidth * 0.25,
      y - 10 + drift,
      CONFIG.canvasWidth * 0.75,
      y + 10 + drift,
      CONFIG.canvasWidth,
      y + drift
    );
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(123, 126, 145, 0.08)";
  ctx.fillRect(0, CONFIG.gameOverLineY, CONFIG.canvasWidth, 2);

  ctx.strokeStyle = "rgba(112, 105, 120, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(CONFIG.worldLeft, CONFIG.worldTop, CONFIG.worldRight - CONFIG.worldLeft, CONFIG.floorY - CONFIG.worldTop, 22);
  ctx.stroke();

  const floorGradient = ctx.createLinearGradient(0, CONFIG.floorY - 90, 0, CONFIG.canvasHeight);
  floorGradient.addColorStop(0, "rgba(180, 152, 173, 0)");
  floorGradient.addColorStop(1, "rgba(156, 134, 147, 0.18)");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, CONFIG.floorY - 90, CONFIG.canvasWidth, CONFIG.canvasHeight - CONFIG.floorY + 90);
}

function drawSoftShadow(body) {
  const { cx, maxY, width, height } = body.cache;
  const crowd = clamp((game.bodies.length - CONFIG.crowdTintStart) / 45, 0, 1);
  const alpha = 0.08 + crowd * 0.05;
  ctx.fillStyle = `rgba(92, 69, 87, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, maxY - height * 0.06, width * 0.36, Math.max(5, height * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
}

function getBodyAngle(body, now) {
  const rightParticle = game.particles[body.ringIndices[2]];
  const leftParticle = game.particles[body.ringIndices[6]];
  const slopeAngle = Math.atan2(rightParticle.y - leftParticle.y, rightParticle.x - leftParticle.x) * 0.4;
  const wobble = body === game.activeBody
    ? Math.sin(now * 0.0042 * body.wobbleRate + body.wobbleSeed) * 0.045
    : 0;
  return clamp(slopeAngle + wobble, -0.18, 0.18);
}

function drawMendako(body, now) {
  const { cx, cy, width, height } = body.cache;
  const burstActive = body.burstUntil > now;
  const burstProgress = burstActive
    ? 1 - clamp((body.burstUntil - now) / CONFIG.burstDurationMs, 0, 1)
    : 0;
  const drawWidth = Math.max(40, width * 1.18 * (1 + burstProgress * 0.14));
  const drawHeight = Math.max(24, height * 0.84 * (1 - burstProgress * 0.06));
  const angle = getBodyAngle(body, now);
  const walkIntensity = body.state !== "falling"
    ? (burstActive ? 0 : (body.walkDir !== 0 ? 1 : body.surfaceWalker ? 0.55 : 0.28))
    : 0;
  const bodyBob = Math.sin(now * body.footRate + body.footPhase) * drawHeight * 0.012 * walkIntensity;
  const drawY = cy + drawHeight * 0.08 + bodyBob;
  const top = -drawHeight * 0.64;
  const bottom = drawHeight * 0.32;
  const eyeX = drawWidth * body.eyeSpread;
  const eyeY = -drawHeight * 0.1;

  ctx.save();
  ctx.translate(cx, drawY);
  ctx.rotate(angle);

  if (burstActive) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * (1 - burstProgress)})`;
    ctx.lineWidth = 2 + burstProgress * 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, drawWidth * (0.68 + burstProgress * 0.16), drawHeight * (0.56 + burstProgress * 0.08), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const bodyGradient = ctx.createLinearGradient(0, top, 0, bottom + drawHeight * 0.34);
  bodyGradient.addColorStop(0, hsl(body.hue - 4, body.saturation + 4, body.lightness + 9));
  bodyGradient.addColorStop(0.55, hsl(body.hue, body.saturation, body.lightness));
  bodyGradient.addColorStop(1, hsl(body.hue + 8, body.saturation - 8, body.lightness - 6));

  ctx.fillStyle = hsl(body.hue - 6, body.saturation - 10, body.lightness - 8, 0.24);
  ctx.beginPath();
  ctx.ellipse(-drawWidth * 0.3, -drawHeight * 0.02, drawWidth * 0.15, drawHeight * 0.11, -0.42, 0, Math.PI * 2);
  ctx.ellipse(drawWidth * 0.3, -drawHeight * 0.02, drawWidth * 0.15, drawHeight * 0.11, 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hsl(body.hue - 2, body.saturation + 2, body.lightness + 4, 0.98);
  ctx.beginPath();
  ctx.ellipse(-drawWidth * 0.28, -drawHeight * 0.34, drawWidth * 0.12, drawHeight * 0.2, -0.88, 0, Math.PI * 2);
  ctx.ellipse(drawWidth * 0.28, -drawHeight * 0.34, drawWidth * 0.12, drawHeight * 0.2, 0.88, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hsl(body.hue - 6, body.saturation - 10, body.lightness - 8, 0.24);
  ctx.beginPath();
  ctx.ellipse(-drawWidth * 0.34, drawHeight * 0.01, drawWidth * 0.16, drawHeight * 0.12, -0.45, 0, Math.PI * 2);
  ctx.ellipse(drawWidth * 0.34, drawHeight * 0.01, drawWidth * 0.16, drawHeight * 0.12, 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-drawWidth * 0.52, -drawHeight * 0.04);
  ctx.bezierCurveTo(-drawWidth * 0.56, -drawHeight * 0.46, -drawWidth * 0.18, top * body.crown, 0, top);
  ctx.bezierCurveTo(drawWidth * 0.18, top * body.crown, drawWidth * 0.56, -drawHeight * 0.46, drawWidth * 0.52, -drawHeight * 0.04);
  ctx.bezierCurveTo(drawWidth * 0.54, drawHeight * 0.12, drawWidth * 0.46, drawHeight * 0.2, drawWidth * 0.44, drawHeight * 0.22);
  ctx.quadraticCurveTo(drawWidth * 0.33, drawHeight * 0.36, drawWidth * 0.2, drawHeight * 0.26);
  ctx.quadraticCurveTo(drawWidth * 0.08, drawHeight * 0.42, 0, drawHeight * 0.28);
  ctx.quadraticCurveTo(-drawWidth * 0.08, drawHeight * 0.42, -drawWidth * 0.2, drawHeight * 0.26);
  ctx.quadraticCurveTo(-drawWidth * 0.33, drawHeight * 0.36, -drawWidth * 0.44, drawHeight * 0.22);
  ctx.bezierCurveTo(-drawWidth * 0.46, drawHeight * 0.2, -drawWidth * 0.54, drawHeight * 0.12, -drawWidth * 0.52, -drawHeight * 0.04);
  ctx.closePath();
  ctx.fillStyle = bodyGradient;
  ctx.fill();

  ctx.strokeStyle = hsl(body.hue - 18, body.saturation - 18, body.lightness - 24, 0.24);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.26)";
  ctx.beginPath();
  ctx.ellipse(-drawWidth * 0.1, -drawHeight * 0.28, drawWidth * 0.17, drawHeight * 0.11, -0.35, 0, Math.PI * 2);
  ctx.fill();

  const footY = drawHeight * 0.3;
  const footXs = [-0.28, -0.09, 0.09, 0.28];
  footXs.forEach((ratio, index) => {
    const phase = now * body.footRate + body.footPhase + index * 0.95;
    const lift = Math.sin(phase) * drawHeight * CONFIG.footFlutterAmplitude * walkIntensity;
    const splay = Math.cos(phase) * 0.18 * walkIntensity;
    ctx.fillStyle = index % 2 === 0
      ? hsl(body.hue + 6, body.saturation - 10, body.lightness - 3, 0.98)
      : hsl(body.hue + 2, body.saturation - 6, body.lightness - 1, 0.98);
    ctx.beginPath();
    ctx.ellipse(
      drawWidth * ratio + splay * drawWidth * 0.02,
      footY - Math.max(0, lift),
      drawWidth * 0.075,
      drawHeight * (0.15 + Math.max(0, lift / drawHeight) * 0.15),
      ratio * 0.4 + splay,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  ctx.fillStyle = "#151016";
  ctx.beginPath();
  ctx.ellipse(drawWidth * body.faceNudgeX - eyeX, eyeY, drawWidth * 0.042 * body.eyeScale, drawHeight * 0.06 * body.eyeScale, body.faceTilt, 0, Math.PI * 2);
  ctx.ellipse(drawWidth * body.faceNudgeX + eyeX, eyeY, drawWidth * 0.042 * body.eyeScale, drawHeight * 0.06 * body.eyeScale, -body.faceTilt, 0, Math.PI * 2);
  ctx.fill();

  if (body.blush || body === game.activeBody) {
    ctx.fillStyle = "rgba(255, 229, 238, 0.45)";
    ctx.beginPath();
    ctx.ellipse(drawWidth * body.faceNudgeX - eyeX * 1.2, eyeY + drawHeight * 0.11, drawWidth * 0.05, drawHeight * 0.03, 0, 0, Math.PI * 2);
    ctx.ellipse(drawWidth * body.faceNudgeX + eyeX * 1.2, eyeY + drawHeight * 0.11, drawWidth * 0.05, drawHeight * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(41, 27, 38, 0.38)";
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(drawWidth * body.faceNudgeX - drawWidth * 0.05, eyeY + drawHeight * 0.16);
  ctx.quadraticCurveTo(drawWidth * body.faceNudgeX, eyeY + drawHeight * (body.mouthCurve - 0.03), drawWidth * body.faceNudgeX + drawWidth * 0.05, eyeY + drawHeight * 0.16);
  ctx.stroke();

  ctx.restore();
}

function drawBodies(now) {
  const bodiesToDraw = [...game.bodies].sort((bodyA, bodyB) => bodyA.cache.cy - bodyB.cache.cy);

  bodiesToDraw.forEach((body) => {
    drawSoftShadow(body);
    drawMendako(body, now);
  });
}

function drawCrowdTint() {
  const crowd = clamp((game.bodies.length - CONFIG.crowdTintStart) / 40, 0, 1);
  if (crowd <= 0) {
    return;
  }

  const tint = ctx.createLinearGradient(0, CONFIG.floorY - 220, 0, CONFIG.canvasHeight);
  tint.addColorStop(0, `rgba(140, 98, 124, ${crowd * 0.04})`);
  tint.addColorStop(1, `rgba(103, 72, 90, ${crowd * 0.14})`);
  ctx.fillStyle = tint;
  ctx.fillRect(0, CONFIG.floorY - 220, CONFIG.canvasWidth, CONFIG.canvasHeight - CONFIG.floorY + 220);
}

function render(now) {
  ctx.clearRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  drawBackground(now);
  drawBodies(now);
  drawCrowdTint();
}

function update(deltaMs) {
  if (!game.gameOver) {
    const now = performance.now();
    game.elapsedMs = now - game.startTime;
    if (timeValue) {
      timeValue.textContent = `${(game.elapsedMs / 1000).toFixed(1)}s`;
    }
    updateRestingWalkers(now);
    game.accumulator += deltaMs;

    while (game.accumulator >= CONFIG.fixedStepMs) {
      stepSimulation(CONFIG.fixedStepMs);
      game.accumulator -= CONFIG.fixedStepMs;
    }
  }
}

function loop(timestamp) {
  if (!game.lastFrame) {
    game.lastFrame = timestamp;
  }

  const deltaMs = Math.min(32, timestamp - game.lastFrame);
  game.lastFrame = timestamp;

  update(deltaMs);
  render(timestamp);
  requestAnimationFrame(loop);
}

function setKeyState(event, isPressed) {
  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      input.left = isPressed;
      break;
    case "ArrowRight":
    case "KeyD":
      input.right = isPressed;
      break;
    case "ArrowDown":
    case "KeyS":
    case "Space":
      input.fast = isPressed;
      break;
    default:
      return;
  }

  event.preventDefault();
}

window.addEventListener("keydown", (event) => setKeyState(event, true));
window.addEventListener("keyup", (event) => setKeyState(event, false));
canvas.addEventListener("pointerdown", (event) => {
  if (game.gameOver) {
    return;
  }

  const point = getPointerCanvasPoint(event);
  const tappedBody = findBodyAtPoint(point.x, point.y);

  if (tappedBody) {
    tap.active = true;
    tap.pointerId = event.pointerId;
    tap.bodyId = tappedBody.id;
    tap.startX = point.x;
    tap.startY = point.y;
    tap.startTime = performance.now();
    tap.canceled = false;
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    return;
  }

  drag.active = true;
  drag.pointerId = event.pointerId;
  updateDragTarget(event);
  if (canvas.setPointerCapture) {
    canvas.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
});
canvas.addEventListener("pointermove", (event) => {
  if (tap.active && event.pointerId === tap.pointerId) {
    const point = getPointerCanvasPoint(event);
    if (distance(point.x, point.y, tap.startX, tap.startY) > CONFIG.tapMaxMoveDistance) {
      tap.canceled = true;
    }
    event.preventDefault();
    return;
  }

  if (!drag.active || event.pointerId !== drag.pointerId) {
    return;
  }

  updateDragTarget(event);
  event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (tap.active && event.pointerId === tap.pointerId) {
    const point = getPointerCanvasPoint(event);
    const elapsed = performance.now() - tap.startTime;
    if (
      !tap.canceled &&
      distance(point.x, point.y, tap.startX, tap.startY) <= CONFIG.tapMaxMoveDistance &&
      elapsed <= CONFIG.tapMaxTimeMs
    ) {
      burstBody(getBodyById(tap.bodyId));
    }

    endTap(event);
    event.preventDefault();
    return;
  }

  endDrag(event);
});
canvas.addEventListener("pointercancel", (event) => {
  if (tap.active && event.pointerId === tap.pointerId) {
    endTap(event);
  }
  endDrag(event);
});
canvas.addEventListener("pointerleave", (event) => {
  if (event.pointerType !== "mouse") {
    return;
  }

  if (tap.active && event.pointerId === tap.pointerId) {
    endTap(event);
  }
  endDrag(event);
});

if (!window.PointerEvent) {
  canvas.addEventListener("touchstart", (event) => {
    if (game.gameOver || !event.touches.length) {
      return;
    }

    const touch = event.touches[0];
    const point = getCanvasPointFromClient(touch.clientX, touch.clientY);
    const tappedBody = findBodyAtPoint(point.x, point.y);

    if (tappedBody) {
      tap.active = true;
      tap.pointerId = touch.identifier;
      tap.bodyId = tappedBody.id;
      tap.startX = point.x;
      tap.startY = point.y;
      tap.startTime = performance.now();
      tap.canceled = false;
      event.preventDefault();
      return;
    }

    drag.active = true;
    drag.pointerId = touch.identifier;
    drag.targetX = point.x;
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (event) => {
    if (tap.active && event.touches.length) {
      const touch = event.touches[0];
      if (tap.pointerId === touch.identifier) {
        const point = getCanvasPointFromClient(touch.clientX, touch.clientY);
        if (distance(point.x, point.y, tap.startX, tap.startY) > CONFIG.tapMaxMoveDistance) {
          tap.canceled = true;
        }
        event.preventDefault();
        return;
      }
    }

    if (!drag.active || !event.touches.length) {
      return;
    }

    const touch = event.touches[0];
    if (drag.pointerId !== touch.identifier) {
      return;
    }

    const point = getCanvasPointFromClient(touch.clientX, touch.clientY);
    drag.targetX = point.x;
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (event) => {
    if (tap.active && event.changedTouches.length) {
      const touch = event.changedTouches[0];
      if (tap.pointerId === touch.identifier) {
        const point = getCanvasPointFromClient(touch.clientX, touch.clientY);
        const elapsed = performance.now() - tap.startTime;
        if (
          !tap.canceled &&
          distance(point.x, point.y, tap.startX, tap.startY) <= CONFIG.tapMaxMoveDistance &&
          elapsed <= CONFIG.tapMaxTimeMs
        ) {
          burstBody(getBodyById(tap.bodyId));
        }
        endTap();
        event.preventDefault();
        return;
      }
    }

    endDrag();
  });

  canvas.addEventListener("touchcancel", () => {
    if (tap.active) {
      endTap();
    }
    endDrag();
  });
}

window.addEventListener("resize", resizeCanvas);
restartButton.addEventListener("click", resetGame);

resizeCanvas();
resetGame();
requestAnimationFrame(loop);
