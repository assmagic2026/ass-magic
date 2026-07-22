(() => {
  if (window.__realismPhaseAudioGate) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const source = new URL("./assets/audio/phase-punch.mp3", window.location.href).href;
  const mediaPool = Array.from({ length: 2 }, () => {
    const audio = new Audio(source);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = 0.74;
    audio.load();
    return audio;
  });
  const gate = {
    context: null,
    hasGesture: false,
    mediaPool,
    mediaPrimed: false,
    mediaPrimePromise: null,
    resumePromise: null,
    ensureContext() {
      if (!this.context && AudioContextClass) this.context = new AudioContextClass();
      return this.context;
    },
    resume() {
      const context = this.ensureContext();
      if (!context || context.state === "running") return Promise.resolve(true);
      if (this.resumePromise) return this.resumePromise;
      this.resumePromise = context.resume()
        .then(() => context.state === "running")
        .catch(() => false)
        .finally(() => {
          this.resumePromise = null;
        });
      return this.resumePromise;
    },
    primeMedia() {
      if (this.mediaPrimed) return Promise.resolve(true);
      if (this.mediaPrimePromise) return this.mediaPrimePromise;
      const attempts = this.mediaPool.map((audio) => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 0;
        return Promise.resolve(audio.play())
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0.74;
            return true;
          })
          .catch(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0.74;
            return false;
          });
      });
      this.mediaPrimePromise = Promise.all(attempts)
        .then((results) => {
          this.mediaPrimed = results.some(Boolean);
          document.documentElement.dataset.phaseAudioMedia = this.mediaPrimed ? "primed" : "blocked";
          return this.mediaPrimed;
        })
        .finally(() => {
          this.mediaPrimePromise = null;
        });
      return this.mediaPrimePromise;
    },
    unlock() {
      this.hasGesture = true;
      document.documentElement.dataset.phaseAudioGesture = "received";
      return Promise.all([this.resume(), this.primeMedia()]).then((result) => {
        document.documentElement.dataset.phaseAudioContext = this.context?.state || "unavailable";
        return result;
      });
    },
  };
  window.__realismPhaseAudioGate = gate;
  document.documentElement.dataset.phaseAudioGate = "installed";
  const unlock = () => {
    void gate.unlock();
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("touchstart", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && gate.hasGesture) void gate.unlock();
  });
  window.addEventListener("pageshow", () => {
    if (gate.hasGesture) void gate.unlock();
  });
})();
