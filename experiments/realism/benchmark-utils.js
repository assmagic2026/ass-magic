const SWARM_PATTERN = /^points(\d+)(?:_(avoid|group|light1|light3))?$/;
const MIN_DPR = 0.5;
const MAX_DPR = 3;

function parseDpr(value) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= MIN_DPR && parsed <= MAX_DPR
    ? Math.round(parsed * 100) / 100
    : null;
}

export function parseSwarmMode(value) {
  if (!value || value === "0") {
    return Object.freeze({
      enabled: false,
      valid: true,
      label: "baseline",
      count: 0,
      avoid: false,
      group: false,
      lightCount: 0,
    });
  }

  const match = SWARM_PATTERN.exec(value);
  if (!match) return Object.freeze({ ...parseSwarmMode("0"), valid: false });

  const count = Number(match[1]);
  if (!Number.isInteger(count) || count < 1 || count > 2000) {
    return Object.freeze({ ...parseSwarmMode("0"), valid: false });
  }

  const feature = match[2] || "points";
  return Object.freeze({
    enabled: true,
    valid: true,
    label: value,
    count,
    avoid: feature !== "points",
    // All enabled modes now use MANY NEKO's live SchoolSimulation. The plain
    // points label is the source-reference layer; suffixed modes add only the
    // ASS-specific player adapter. Keep this flag for benchmark labels/API
    // compatibility with the earlier staged prototype.
    group: feature === "group" || feature === "light1" || feature === "light3",
    // The current prototype intentionally measures motion only. Legacy light
    // labels remain parseable so old comparison URLs fail safely without
    // enabling real lights before the boid movement is accepted.
    lightCount: 0,
  });
}

export function getBenchmarkOptions(source = globalThis.location?.search || "") {
  const params = source instanceof URLSearchParams
    ? source
    : new URLSearchParams(source);
  const requestedDpr = parseDpr(params.get("dpr"));
  const swarm = parseSwarmMode(params.get("swarm"));
  return Object.freeze({
    perfEnabled: params.get("perf") === "1",
    benchEnabled: params.get("bench") === "1",
    dprLocked: params.get("dprlock") === "1" || requestedDpr !== null,
    requestedDpr,
    swarm,
    swarmDebugEnabled: params.get("swarmdebug") === "1",
    label: swarm.label,
  });
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class BenchmarkReporter {
  constructor({
    enabled,
    renderer,
    settings,
    label,
    startupMs,
    warmupSeconds = 5,
    reportSeconds = 10,
    logger = console,
    onReport = null,
  }) {
    this.enabled = enabled === true;
    this.renderer = renderer;
    this.settings = settings;
    this.label = label;
    this.startupMs = startupMs;
    this.warmupRemaining = warmupSeconds;
    this.reportSeconds = reportSeconds;
    this.windowElapsed = 0;
    this.samples = [];
    this.logger = logger;
    this.onReport = typeof onReport === "function" ? onReport : null;
    this.latest = null;
  }

  update(deltaSeconds, currentDpr) {
    if (!this.enabled || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return null;
    if (typeof document !== "undefined" && document.hidden) return null;

    if (this.warmupRemaining > 0) {
      this.warmupRemaining = Math.max(0, this.warmupRemaining - deltaSeconds);
      if (this.warmupRemaining === 0) {
        this.samples.length = 0;
        this.windowElapsed = 0;
      }
      return null;
    }

    const frameMs = deltaSeconds * 1000;
    if (frameMs > 0 && frameMs < 250) this.samples.push(frameMs);
    this.windowElapsed += deltaSeconds;
    if (this.windowElapsed < this.reportSeconds || this.samples.length < 10) return null;

    const ordered = [...this.samples].sort((a, b) => a - b);
    const totalMs = ordered.reduce((sum, value) => sum + value, 0);
    const averageMs = totalMs / ordered.length;
    const p99Index = Math.max(0, Math.ceil(ordered.length * 0.99) - 1);
    const p99Ms = ordered[p99Index];
    const info = this.renderer.info;
    const summary = {
      mode: this.settings.mode,
      quality: this.settings.quality,
      view: this.settings.view,
      fpsAvg: round(1000 / averageMs),
      fps1Low: round(1000 / p99Ms),
      frameAvgMs: round(averageMs),
      maxMs: round(ordered[ordered.length - 1]),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      dpr: round(currentDpr, 2),
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      startupMs: Math.round(this.startupMs),
      sampleCount: ordered.length,
      windowSeconds: round(this.windowElapsed, 2),
      label: this.label,
    };

    this.latest = Object.freeze(summary);
    this.logger.info?.(`[ASS MAGIC BENCH] ${JSON.stringify(summary, null, 2)}`);
    this.onReport?.(this.latest);
    this.samples.length = 0;
    this.windowElapsed = 0;
    return this.latest;
  }
}
