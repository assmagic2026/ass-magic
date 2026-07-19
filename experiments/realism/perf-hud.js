export class PerformanceHud {
  constructor(element, renderer, settings, startupMs) {
    this.element = element;
    this.renderer = renderer;
    this.settings = settings;
    this.startupMs = startupMs;
    this.samples = [];
    this.elapsed = 0;
    this.warmup = 1;
    this.lastMarkup = "";
  }

  update(deltaSeconds, currentDpr) {
    if (this.warmup > 0) {
      this.warmup -= deltaSeconds;
      return;
    }

    const frameMs = deltaSeconds * 1000;
    if (frameMs > 0 && frameMs < 250) this.samples.push(frameMs);
    if (this.samples.length > 360) this.samples.shift();
    this.elapsed += deltaSeconds;
    if (this.elapsed < 0.5 || this.samples.length < 10) return;

    const ordered = [...this.samples].sort((a, b) => a - b);
    const averageMs = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
    const p99Ms = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.99))];
    const maxMs = ordered[ordered.length - 1];
    const info = this.renderer.info;
    const modeLabel = this.settings.mode === "realism"
      ? `REALISM / ${this.settings.preset.label}`
      : "CURRENT-LIKE";
    const viewLabel = this.settings.view === "flight" ? "FLIGHT" : "ORBIT";
    const scopeLabel = this.settings.scopeLabel
      ? `${this.settings.scopeLabel} / `
      : "";

    const markup = [
      `<strong>${scopeLabel}${modeLabel} / ${viewLabel}</strong>`,
      ...(this.settings.loadLabel ? [this.settings.loadLabel] : []),
      `FPS AVG&nbsp;&nbsp;${(1000 / averageMs).toFixed(1)}`,
      `1% LOW&nbsp;&nbsp;${(1000 / p99Ms).toFixed(1)}`,
      `FRAME&nbsp;&nbsp;&nbsp;&nbsp;${averageMs.toFixed(1)} ms`,
      `MAX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${maxMs.toFixed(1)} ms`,
      `CALLS&nbsp;&nbsp;&nbsp;&nbsp;${info.render.calls}`,
      `TRIS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${info.render.triangles.toLocaleString()}`,
      `DPR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${currentDpr.toFixed(2)}`,
      `START&nbsp;&nbsp;&nbsp;&nbsp;${Math.round(this.startupMs)} ms`,
      `TEX / GEO&nbsp;${info.memory.textures} / ${info.memory.geometries}`,
    ].join("<br>");

    if (markup !== this.lastMarkup) {
      this.element.innerHTML = markup;
      this.lastMarkup = markup;
    }
    this.elapsed = 0;
  }
}
