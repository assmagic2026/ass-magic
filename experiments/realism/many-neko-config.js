// Source-equivalent parameters ported from MANY NEKO's live config.js.
// Upstream: https://manyneko.puddingsan.chatgpt.site/aquarium/config.js?v=20260803c12
export const CONFIG = {
  renderQuality: {
    desktopBasePixelRatio: 1.6,
    desktopMaxPixelRatio: 2.25,
    mobileBasePixelRatio: 1.25,
    mobileMaxPixelRatio: 1.75,
    desktopMinPixelRatio: 1,
    mobileMinPixelRatio: 0.85,
    warmupSeconds: 4,
    sampleSeconds: 2.5,
  },
  fish: {
    desktopCount: 1300,
    mobileCount: 860,
    lowPowerCount: 680,
    // Use the upper half of the measured 1.2–4.1 body-length/s range so the
    // motion reads correctly at human scale; maxSpeed is a short turn burst.
    minSpeed: 0.32,
    maxSpeed: 1.35,
    cruiseSpeed: 0.72,
    // The rendered geometry is 3.762 x this scale: roughly 18–24 cm long.
    sizeMin: 0.048,
    sizeMax: 0.064,
  },
  school: {
    cellSize: 0.78,
    separationRadius: 0.14,
    neighborRadius: 0.72,
    separationWeight: 2.9,
    alignmentWeight: 1.32,
    cohesionWeight: 0.38,
    shapeWeight: 1.82,
    flowWeight: 0.7,
    maxSteer: 1.45,
    maxNeighborChecks: 56,
    schoolingStrength: 1,
    density: 1.08,
    turnIntensity: 1.12,
    wander: 0.045,
    // A tap displaces only the nearby patch. The ordinary shell/cohesion
    // forces remain active and pull the opening closed again afterward.
    scatterRadius: 1.15,
    scatterDuration: 1.55,
    scatterForce: 4.2,
    scatterImpulse: 0.88,
    scatterSpeedFactor: 1.65,
    // One-shot "come on" pass. Distances are metres; the camera collision
    // volume below approximates an adult human head rather than a large body.
    comeOnLateralClearance: 0.58,
    comeOnApproachLead: 1.05,
    comeOnPassDistance: 2.5,
    comeOnSpeedBoost: 1.225,
    comeOnSpeedMin: 2.24,
    comeOnSpeedMax: 2.94,
    comeOnGatherSeconds: 1,
    comeOnGatherMaxSeconds: 1,
    comeOnGatherSettleDistance: 0.72,
    comeOnGatherSpeed: 0.48,
    comeOnFringeGuide: 1.15,
    comeOnGatherScale: 0.68,
    comeOnGatherScaleMin: 0.42,
    comeOnStageMinDistance: 3.15,
    comeOnStageMaxDistance: 4.25,
    comeOnStageViewMargin: 0.82,
    comeOnTurnSeconds: 1.5,
    comeOnAccelerationSeconds: 0.42,
    comeOnCancelTurnDot: 0.94,
    comeOnMinimumSpeed: 0.96,
    comeOnMinimumSteer: 2.6,
    comeOnGuideBoost: 4.4,
    comeOnMinTravelSeconds: 1.8,
    comeOnMaxTravelSeconds: 5.2,
    comeOnPassCompletion: 0.94,
    comeOnMaxTailSeconds: 1.8,
    comeOnRecoverySeconds: 0.6,
    comeOnCooldownSeconds: 7,
    comeOnExitClearance: 1.2,
    comeOnExitSteer: 8,
    comeOnStragglerRadius: 2.2,
    comeOnStragglerHardRadius: 1.45,
    // Temporary living formations: ease in, hold for ten seconds,
    // then release back into the ordinary school without teleporting.
    formationEnterSeconds: 2.4,
    formationMobiusEnterSeconds: 3.8,
    formationBigCatEnterSeconds: 3,
    formationHoldSeconds: 10,
    formationExitSeconds: 1.8,
    formationGuideStrength: 9.4,
    formationCruiseFactor: 0.62,
    formationPositionResponse: 2.8,
    formationStageDistance: 5.2,
    formationBigCatStageDistance: 6,
    formationCubeHalfExtent: 1.1,
    formationMobiusRadius: 2.05,
    formationMobiusHalfWidth: 0.42,
    formationMobiusDepthGap: 0.82,
    formationBigCatScreenHalf: 1.2,
    // Physical size stays correct; proximity supplies the impressive apparent
    // size. The hard sphere is roughly the radius of a human head.
    observerAvoidRadius: 0.46,
    observerHardRadius: 0.12,
  },
  camera: {
    followLag: 1.9,
    lookLag: 1.15,
    driftStrength: 0.2,
    returnSeconds: 3.2,
    maxYaw: 0.26,
    maxPitch: 0.16,
  },
  water: {
    color: 0x0d5661,
    fogColor: 0x155f6a,
    fogDensity: 0.013,
    // World units are meters. The footprint is exactly 10 m x 10 m.
    width: 10,
    depth: 10,
    floorHeight: -5,
    surfaceHeight: 5,
    orbitRadius: 2.2,
    orbitVariation: 0.45,
    orbitHeight: 2.9,
  },
};

export function selectFishCount() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const memory = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;

  if (memory <= 4 || cores <= 4) return CONFIG.fish.lowPowerCount;
  return coarse ? CONFIG.fish.mobileCount : CONFIG.fish.desktopCount;
}
