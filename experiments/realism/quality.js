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

export const MOBILE_HIGH_FLIGHT_DPR_POLICY = Object.freeze({
  name: "mobile-high-flight-v1",
  minimumRatio: 1,
  maximumRatio: 1.5,
  evaluationSeconds: 2,
  increaseStep: 0.05,
  decreaseStep: 0.1,
  severeDecreaseStep: 0.15,
  stableSecondsBeforeIncrease: 8,
  cooldownSecondsAfterDecrease: 20,
  resumeSettleSeconds: 2,
  averageDecreaseMs: 18.7,
  p95DecreaseMs: 22.5,
  jankFrameMs: 25,
  jankRatioDecrease: 0.03,
  consecutiveJankDecrease: 2,
  severeAverageMs: 21,
  severeP95Ms: 30,
  severeFrameMs: 34,
  severeFrameCount: 2,
  severeConsecutiveJank: 4,
  stableAverageMs: 17.2,
  stableP95Ms: 19,
  stableJankRatio: 0.005,
  persistAfterStableSeconds: 30,
  persistedStartOffset: 0.05,
  persistedStartMaximum: 1.3,
});

function clampRatio(value, minimum, maximum) {
  return Math.round(Math.min(maximum, Math.max(minimum, value)) * 100) / 100;
}

export class AdaptivePixelRatio {
  constructor(renderer, preset, {
    initialRatio = null,
    settleSeconds = 3,
    policy = null,
    storageKey = null,
    onEvaluation = null,
    lockedRatio = null,
  } = {}) {
    this.renderer = renderer;
    this.preset = preset;
    this.deviceRatio = Math.max(1, window.devicePixelRatio || 1);
    this.policy = policy;
    this.minimumRatio = Math.min(
      this.deviceRatio,
      policy?.minimumRatio ?? preset.dprMin,
    );
    this.maximumRatio = Math.min(
      this.deviceRatio,
      policy?.maximumRatio ?? preset.dprMax,
    );
    this.storageKey = policy && typeof storageKey === "string" ? storageKey : null;
    this.onEvaluation = typeof onEvaluation === "function" ? onEvaluation : null;
    const savedRatio = this.readSavedRatio();
    const savedStart = Number.isFinite(savedRatio)
      ? Math.min(
        policy.persistedStartMaximum,
        savedRatio - policy.persistedStartOffset,
      )
      : null;
    const requestedRatio = Number.isFinite(savedStart)
      ? savedStart
      : Number.isFinite(initialRatio) ? initialRatio : this.maximumRatio;
    this.locked = Number.isFinite(lockedRatio);
    this.ratio = this.locked
      ? Math.round(Math.min(3, Math.max(0.5, lockedRatio)) * 100) / 100
      : clampRatio(requestedRatio, this.minimumRatio, this.maximumRatio);
    this.settleSeconds = settleSeconds;
    this.elapsed = 0;
    this.samples = [];
    this.settleRemaining = policy ? settleSeconds : 0;
    this.cooldownRemaining = 0;
    this.stableWindows = 0;
    this.stableSecondsAtRatio = 0;
    this.consecutiveJank = 0;
    this.maximumConsecutiveJank = 0;
    this.lastChangeAt = null;
    this.lastReason = savedRatio === null ? "initial" : "saved-start";
    this.lastMetrics = null;
    this.savedRatio = savedRatio;
    renderer.setPixelRatio(this.ratio);
  }

  lock(requestedRatio = this.ratio) {
    if (!Number.isFinite(requestedRatio)) return false;
    this.locked = true;
    this.ratio = Math.round(Math.min(3, Math.max(0.5, requestedRatio)) * 100) / 100;
    this.renderer.setPixelRatio(this.ratio);
    this.clearWindow();
    this.lastReason = "locked";
    return true;
  }

  sample(deltaSeconds) {
    if (this.locked) return false;
    if (this.policy) return this.samplePolicy(deltaSeconds);

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
      this.ratio = Math.min(this.maximumRatio, this.ratio + 0.05);
    }

    this.elapsed = 0;
    this.samples.length = 0;

    if (Math.abs(oldRatio - this.ratio) < 0.001) return false;
    this.renderer.setPixelRatio(this.ratio);
    return true;
  }

  samplePolicy(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    if (typeof document !== "undefined" && document.hidden) return false;

    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaSeconds);
    if (this.settleRemaining > 0) {
      this.settleRemaining = Math.max(0, this.settleRemaining - deltaSeconds);
      if (this.settleRemaining === 0) this.clearWindow();
      return false;
    }

    const frameMs = deltaSeconds * 1000;
    if (frameMs <= 0 || frameMs >= 120) {
      this.resetSampling({
        settleSeconds: this.policy.resumeSettleSeconds,
        reason: "invalid-delta",
      });
      return false;
    }

    this.samples.push(frameMs);
    this.elapsed += deltaSeconds;
    if (frameMs > this.policy.jankFrameMs) {
      this.consecutiveJank += 1;
      this.maximumConsecutiveJank = Math.max(
        this.maximumConsecutiveJank,
        this.consecutiveJank,
      );
    } else {
      this.consecutiveJank = 0;
    }

    if (this.elapsed < this.policy.evaluationSeconds || this.samples.length < 30) {
      return false;
    }

    const ordered = [...this.samples].sort((a, b) => a - b);
    const average = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
    const p95Index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
    const p95 = ordered[p95Index];
    const jankCount = ordered.filter((value) => value > this.policy.jankFrameMs).length;
    const severeCount = ordered.filter((value) => value > this.policy.severeFrameMs).length;
    const jankRatio = jankCount / ordered.length;
    const windowSeconds = this.elapsed;
    const metrics = {
      average,
      p95,
      maximum: ordered[ordered.length - 1],
      jankRatio,
      jankCount,
      severeCount,
      maximumConsecutiveJank: this.maximumConsecutiveJank,
      sampleCount: ordered.length,
      windowSeconds,
    };
    const severe = average >= this.policy.severeAverageMs
      || p95 >= this.policy.severeP95Ms
      || severeCount >= this.policy.severeFrameCount
      || this.maximumConsecutiveJank >= this.policy.severeConsecutiveJank;
    const slow = severe
      || average > this.policy.averageDecreaseMs
      || p95 > this.policy.p95DecreaseMs
      || jankRatio >= this.policy.jankRatioDecrease
      || this.maximumConsecutiveJank >= this.policy.consecutiveJankDecrease;
    const stable = average <= this.policy.stableAverageMs
      && p95 <= this.policy.stableP95Ms
      && jankRatio <= this.policy.stableJankRatio
      && this.maximumConsecutiveJank === 0;

    const oldRatio = this.ratio;
    let reason = "hold";
    if (slow) {
      const step = severe
        ? this.policy.severeDecreaseStep
        : this.policy.decreaseStep;
      this.ratio = clampRatio(
        this.ratio - step,
        this.minimumRatio,
        this.maximumRatio,
      );
      this.cooldownRemaining = this.policy.cooldownSecondsAfterDecrease;
      this.stableWindows = 0;
      this.stableSecondsAtRatio = 0;
      reason = severe ? "severe-decrease" : "decrease";
    } else if (stable) {
      this.stableWindows += 1;
      this.stableSecondsAtRatio += windowSeconds;
      const stableSeconds = this.stableWindows * this.policy.evaluationSeconds;
      if (
        stableSeconds >= this.policy.stableSecondsBeforeIncrease
        && this.cooldownRemaining <= 0
        && this.ratio < this.maximumRatio - 0.001
      ) {
        this.ratio = clampRatio(
          this.ratio + this.policy.increaseStep,
          this.minimumRatio,
          this.maximumRatio,
        );
        this.stableWindows = 0;
        this.stableSecondsAtRatio = 0;
        reason = "increase";
      } else {
        reason = this.cooldownRemaining > 0
          ? "stable-cooldown"
          : this.ratio >= this.maximumRatio - 0.001
            ? "stable-maximum"
            : "stable";
      }
    } else {
      this.stableWindows = 0;
      this.stableSecondsAtRatio = 0;
      reason = "unstable-hold";
    }

    const changed = Math.abs(oldRatio - this.ratio) >= 0.001;
    this.lastReason = reason;
    if (changed) {
      this.renderer.setPixelRatio(this.ratio);
      this.lastChangeAt = Date.now();
    }
    this.lastMetrics = metrics;
    this.maybeSaveRatio(stable, changed, reason);
    this.emitEvaluation(reason, metrics, changed);
    this.clearWindow();
    return changed;
  }

  clearWindow() {
    this.elapsed = 0;
    this.samples.length = 0;
    this.consecutiveJank = 0;
    this.maximumConsecutiveJank = 0;
  }

  resetSampling({ settleSeconds = 0, reason = "reset" } = {}) {
    if (!this.policy) {
      this.elapsed = 0;
      this.samples.length = 0;
      return;
    }
    this.clearWindow();
    this.settleRemaining = Math.max(0, settleSeconds);
    this.stableWindows = 0;
    this.stableSecondsAtRatio = 0;
    this.lastReason = reason;
    this.emitEvaluation(reason, this.lastMetrics, false);
  }

  getDiagnostics() {
    return {
      policy: this.policy?.name || "legacy",
      locked: this.locked,
      ratio: this.ratio,
      average: this.lastMetrics?.average ?? null,
      p95: this.lastMetrics?.p95 ?? null,
      maximum: this.lastMetrics?.maximum ?? null,
      jankRatio: this.lastMetrics?.jankRatio ?? null,
      severeCount: this.lastMetrics?.severeCount ?? null,
      maximumConsecutiveJank: this.lastMetrics?.maximumConsecutiveJank ?? null,
      lastReason: this.lastReason,
      lastChangeAt: this.lastChangeAt,
      stableWindows: this.stableWindows,
      cooldownRemaining: this.cooldownRemaining,
      settleRemaining: this.settleRemaining,
    };
  }

  emitEvaluation(reason, metrics, changed) {
    this.onEvaluation?.({
      ...this.getDiagnostics(),
      reason,
      changed,
      metrics,
    });
  }

  readSavedRatio() {
    if (!this.storageKey || !this.policy) return null;
    try {
      const value = Number(window.localStorage?.getItem(this.storageKey));
      if (
        !Number.isFinite(value)
        || value < this.policy.minimumRatio
        || value > this.policy.maximumRatio
      ) return null;
      return value;
    } catch {
      return null;
    }
  }

  maybeSaveRatio(stable, changed, reason) {
    if (
      !this.storageKey
      || !stable
      || changed
      || reason.includes("decrease")
      || this.cooldownRemaining > 0
      || this.stableSecondsAtRatio < this.policy.persistAfterStableSeconds
      || Math.abs((this.savedRatio ?? -1) - this.ratio) < 0.001
    ) return;
    try {
      window.localStorage?.setItem(this.storageKey, this.ratio.toFixed(2));
      this.savedRatio = this.ratio;
    } catch {
      // Storage can be unavailable in private browsing; DPR control continues.
    }
  }
}
