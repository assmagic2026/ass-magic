const QUALITY_PRESETS = Object.freeze({
  current: {
    label: "現行風",
    dprMin: 1,
    dprMax: 1.45,
    terrainSegments: 30,
    textureSize: 0,
    shadowSize: 0,
    atmosphereParticles: 0,
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
    pageLayers: 16,
    targetFrameMs: 18,
  },
});

export function getExperimentSettings() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "realism" ? "realism" : "current";
  const requestedQuality = params.get("quality") || "standard";
  const quality = Object.hasOwn(QUALITY_PRESETS, requestedQuality)
    ? requestedQuality
    : "standard";
  const presetKey = mode === "current" ? "current" : quality;

  return {
    mode,
    quality,
    preset: QUALITY_PRESETS[presetKey],
  };
}

export function configureLinks(settings) {
  const currentLink = document.querySelector("#mode-current");
  const realismLink = document.querySelector("#mode-realism");
  const qualitySwitch = document.querySelector("#quality-switch");

  currentLink.href = "?mode=current&quality=standard";
  realismLink.href = `?mode=realism&quality=${settings.quality}`;
  currentLink.setAttribute("aria-current", String(settings.mode === "current"));
  realismLink.setAttribute("aria-current", String(settings.mode === "realism"));
  qualitySwitch.classList.toggle("is-disabled", settings.mode === "current");

  qualitySwitch.querySelectorAll("[data-quality]").forEach((link) => {
    const quality = link.dataset.quality;
    link.href = `?mode=realism&quality=${quality}`;
    link.setAttribute(
      "aria-current",
      String(settings.mode === "realism" && settings.quality === quality),
    );
  });
}

export class AdaptivePixelRatio {
  constructor(renderer, preset) {
    this.renderer = renderer;
    this.preset = preset;
    this.deviceRatio = Math.max(1, window.devicePixelRatio || 1);
    this.ratio = Math.min(this.deviceRatio, preset.dprMax);
    this.elapsed = 0;
    this.samples = [];
    renderer.setPixelRatio(this.ratio);
  }

  sample(deltaSeconds) {
    const frameMs = deltaSeconds * 1000;
    if (frameMs > 0 && frameMs < 120) this.samples.push(frameMs);
    this.elapsed += deltaSeconds;

    if (this.elapsed < 3 || this.samples.length < 45) return false;

    const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    const oldRatio = this.ratio;
    const slowLimit = this.preset.targetFrameMs * 1.16;
    const fastLimit = this.preset.targetFrameMs * 0.72;

    if (average > slowLimit) {
      this.ratio = Math.max(this.preset.dprMin, this.ratio - 0.1);
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
