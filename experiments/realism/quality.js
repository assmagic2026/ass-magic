const QUALITY_PRESETS = Object.freeze({
  current: {
    label: "現行風",
    dprMin: 1,
    dprMax: 1.45,
    terrainSegments: 30,
    textureSize: 0,
    shadowSize: 0,
    atmosphereParticles: 0,
    rockCount: 0,
    crackCount: 0,
    groundDustCount: 0,
    pageLayers: 5,
    targetFrameMs: 24,
  },
  low: {
    label: "軽量",
    dprMin: 0.9,
    dprMax: 1.2,
    terrainSegments: 40,
    textureSize: 512,
    shadowSize: 0,
    atmosphereParticles: 24,
    rockCount: 16,
    crackCount: 10,
    groundDustCount: 20,
    pageLayers: 7,
    targetFrameMs: 30,
  },
  standard: {
    label: "標準",
    dprMin: 1,
    dprMax: 1.5,
    terrainSegments: 64,
    textureSize: 1024,
    shadowSize: 1024,
    atmosphereParticles: 54,
    rockCount: 30,
    crackCount: 16,
    groundDustCount: 36,
    pageLayers: 11,
    targetFrameMs: 23,
  },
  high: {
    label: "高画質",
    dprMin: 1.1,
    dprMax: 2,
    terrainSegments: 96,
    textureSize: 1024,
    shadowSize: 2048,
    atmosphereParticles: 92,
    rockCount: 48,
    crackCount: 24,
    groundDustCount: 60,
    pageLayers: 16,
    targetFrameMs: 18,
  },
});

export function getExperimentSettings() {
  const params = new URLSearchParams(window.location.search);
  const rootDefaults = globalThis.__ASS_MAGIC_ROOT_DEFAULTS__ || {};
  const defaultMode = rootDefaults.mode === "realism" ? "realism" : "current";
  const defaultQuality = typeof rootDefaults.quality === "string" ? rootDefaults.quality : "standard";
  const defaultView = rootDefaults.view === "flight" ? "flight" : "orbit";
  const mode = params.has("mode")
    ? (params.get("mode") === "realism" ? "realism" : "current")
    : defaultMode;
  const requestedQuality = params.has("quality") ? params.get("quality") : defaultQuality;
  const view = params.has("view")
    ? (params.get("view") === "flight" ? "flight" : "orbit")
    : defaultView;
  const quality = Object.hasOwn(QUALITY_PRESETS, requestedQuality)
    ? requestedQuality
    : "standard";
  const presetKey = mode === "current" ? "current" : quality;

  return {
    mode,
    quality,
    view,
    preset: QUALITY_PRESETS[presetKey],
  };
}

export function configureLinks(settings) {
  const currentLink = document.querySelector("#mode-current");
  const realismLink = document.querySelector("#mode-realism");
  const qualitySwitch = document.querySelector("#quality-switch");
  const viewSwitch = document.querySelector(".view-switch");
  const orbitLink = document.querySelector("#view-orbit");
  const flightLink = document.querySelector("#view-flight");
  const viewParam = `&view=${settings.view}`;

  currentLink.href = `?mode=current&quality=standard${viewParam}`;
  realismLink.href = `?mode=realism&quality=${settings.quality}${viewParam}`;
  currentLink.setAttribute("aria-current", String(settings.mode === "current"));
  realismLink.setAttribute("aria-current", String(settings.mode === "realism"));
  qualitySwitch.classList.toggle("is-disabled", settings.mode === "current");

  qualitySwitch.querySelectorAll("[data-quality]").forEach((link) => {
    const quality = link.dataset.quality;
    link.href = `?mode=realism&quality=${quality}${viewParam}`;
    link.setAttribute(
      "aria-current",
      String(settings.mode === "realism" && settings.quality === quality),
    );
  });

  orbitLink.href = `?mode=${settings.mode}&quality=${settings.quality}&view=orbit`;
  flightLink.href = `?mode=${settings.mode}&quality=${settings.quality}&view=flight`;
  orbitLink.setAttribute("aria-current", String(settings.view === "orbit"));
  flightLink.setAttribute("aria-current", String(settings.view === "flight"));
  viewSwitch.classList.toggle("is-flight", settings.view === "flight");
}

export class AdaptivePixelRatio {
  constructor(renderer, preset, { initialRatio = null, settleSeconds = 3 } = {}) {
    this.renderer = renderer;
    this.preset = preset;
    this.deviceRatio = Math.max(1, window.devicePixelRatio || 1);
    this.minimumRatio = Math.min(this.deviceRatio, preset.dprMin);
    this.ratio = Number.isFinite(initialRatio)
      ? Math.min(
        this.deviceRatio,
        preset.dprMax,
        Math.max(this.minimumRatio, initialRatio),
      )
      : Math.min(this.deviceRatio, preset.dprMax);
    this.settleSeconds = settleSeconds;
    this.elapsed = 0;
    this.samples = [];
    renderer.setPixelRatio(this.ratio);
  }

  sample(deltaSeconds) {
    const frameMs = deltaSeconds * 1000;
    if (frameMs > 0 && frameMs < 120) this.samples.push(frameMs);
    this.elapsed += deltaSeconds;

    if (this.elapsed < this.settleSeconds || this.samples.length < 45) return false;

    const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    const oldRatio = this.ratio;
    const slowLimit = this.preset.targetFrameMs * 1.16;
    const fastLimit = this.preset.targetFrameMs * 0.72;

    if (average > slowLimit) {
      this.ratio = Math.max(this.minimumRatio, this.ratio - 0.1);
    } else if (average < fastLimit) {
      this.ratio = Math.min(this.deviceRatio, this.preset.dprMax, this.ratio + 0.05);
    }

    this.elapsed = 0;
    this.samples.length = 0;

    if (Math.abs(oldRatio - this.ratio) < 0.001) return false;
    this.renderer.setPixelRatio(this.ratio);
    return true;
  }
}
