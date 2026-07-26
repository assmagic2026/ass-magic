export const SKATE_MAX_SPEED = 165;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function damp(current, target, response, delta) {
  return target + (current - target) * Math.exp(-response * delta);
}

export function updateSkateGroundSpeed({
  speed,
  leverSpeed,
  slopeAcceleration,
  braking,
  delta,
}) {
  const safeDelta = clamp(finite(delta), 0, 0.1);
  const safeSpeed = clamp(finite(speed), 0, SKATE_MAX_SPEED);
  const target = clamp(finite(leverSpeed, 40), 0, SKATE_MAX_SPEED);
  const slope = clamp(finite(slopeAcceleration), -32, 32);
  const excessReturn = slope < -0.5 ? 8.2 : slope <= 0.5 ? 4.6 : 1.15;
  const controlled = braking
    ? damp(safeSpeed, 0, 6.4, safeDelta)
    : damp(safeSpeed, target, safeSpeed < target ? 2.8 : excessReturn, safeDelta);
  return clamp(controlled + slope * safeDelta, 0, SKATE_MAX_SPEED);
}

export function getUphillOllieImpulse({ normalImpulse, speed, slopeAcceleration }) {
  const base = Math.max(0, finite(normalImpulse));
  if (finite(slopeAcceleration) >= -0.75) return base;
  const multiplier = clamp(1.2 + ((finite(speed) - 12) / 48) * 0.4, 1.2, 1.6);
  return base * multiplier;
}
