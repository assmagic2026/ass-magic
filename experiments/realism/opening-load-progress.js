const DEFAULT_TASKS = Object.freeze({
  // Asset weights follow the checked-in file sizes (about 8.2 MB total).
  // Initialization milestones use the remaining 17% and cannot reach 100%
  // until the first render and selected experience are both ready.
  artwork: 42,
  bookModel: 20,
  terrainNormal: 10,
  terrainColor: 6,
  playerModel: 5,
  bootstrap: 7,
  shaderCompile: 5,
  firstRender: 3,
  startReady: 2,
});

export function createOpeningLoadProgress(output, tasks = DEFAULT_TASKS) {
  const entries = new Map(
    Object.entries(tasks).map(([name, weight]) => [name, {
      weight: Math.max(0, Number(weight) || 0),
      progress: 0,
      settled: false,
    }]),
  );
  const totalWeight = [...entries.values()]
    .reduce((total, task) => total + task.weight, 0) || 1;
  let displayed = 0;
  let ready = false;

  const render = () => {
    const completedWeight = [...entries.values()].reduce(
      (total, task) => total + task.weight * task.progress,
      0,
    );
    const measured = Math.floor((completedWeight / totalWeight) * 100);
    const next = ready ? 100 : Math.min(99, measured);
    displayed = Math.max(displayed, next);
    if (output) output.textContent = `${displayed}%`;
    document.documentElement.dataset.openingProgress = String(displayed);
  };

  const settle = (name, status = "complete", error = null) => {
    const task = entries.get(name);
    if (!task || task.settled) return;
    task.progress = 1;
    task.settled = true;
    if (status === "failed") {
      console.warn(`[opening] ${name} failed; continuing with the existing fallback.`, error);
    }
    render();
  };

  render();
  return {
    complete(name) {
      settle(name);
    },
    track(name, promise) {
      if (!promise) {
        settle(name);
        return null;
      }
      return Promise.resolve(promise).then(
        (value) => {
          settle(name);
          return value;
        },
        (error) => {
          settle(name, "failed", error);
          throw error;
        },
      );
    },
    markReady() {
      if (ready) return;
      const pending = [...entries.entries()]
        .filter(([, task]) => !task.settled)
        .map(([name]) => name);
      if (pending.length) {
        console.warn("[opening] start-ready was reached with unfinished progress tasks.", pending);
        return;
      }
      ready = true;
      render();
    },
    get value() {
      return displayed;
    },
  };
}
