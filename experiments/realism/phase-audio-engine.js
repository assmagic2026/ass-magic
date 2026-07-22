(() => {
  if (window.__realismPhaseAudioEngine) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const scriptUrl = document.currentScript?.src || window.location.href;
  const audioUrl = new URL("./assets/audio/phase-punch.mp3", scriptUrl).href;
  let context = null;
  let buffer = null;
  let hasGesture = false;
  const activeSources = new Set();

  try {
    context = AudioContextClass ? new AudioContextClass({ latencyHint: "interactive" }) : null;
  } catch {
    try {
      // Older Safari versions support AudioContext but reject constructor
      // options. Keep the exact same engine without the latency hint there.
      context = AudioContextClass ? new AudioContextClass() : null;
    } catch {
      context = null;
    }
  }

  function resume() {
    if (!context || context.state === "running") return Promise.resolve(context?.state === "running");
    try {
      return Promise.resolve(context.resume())
        .then(() => context.state === "running")
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  const ready = context
    ? fetch(audioUrl, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`phase-audio-${response.status}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
      .then((decoded) => {
        buffer = decoded;
        document.documentElement.dataset.phaseAudioEngine = "decoded";
        return decoded;
      })
      .catch(() => {
        buffer = null;
        document.documentElement.dataset.phaseAudioEngine = "media-fallback";
        return null;
      })
    : Promise.resolve(null);

  function unlock() {
    hasGesture = true;
    // Called directly from capture-phase input handlers, including taps made
    // while the loading curtain is still visible.
    void resume().then((running) => {
      document.documentElement.dataset.phaseAudioContext = running ? "running" : "suspended";
    });
  }

  function play(label = "dematerialize") {
    if (!context || !buffer || context.state !== "running") return false;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.82;
    source.connect(gain).connect(context.destination);
    activeSources.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      activeSources.delete(source);
    };
    source.start(context.currentTime);
    document.documentElement.dataset.phaseAudioLast = `${label}-buffer`;
    return true;
  }

  window.__realismPhaseAudioEngine = {
    ready,
    unlock,
    play,
    get contextState() {
      return context?.state || "unavailable";
    },
    get hasGesture() {
      return hasGesture;
    },
  };

  const onGesture = () => unlock();
  window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
  window.addEventListener("touchstart", onGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onGesture, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && hasGesture) unlock();
  });
  window.addEventListener("pageshow", () => {
    if (hasGesture) unlock();
  });
  document.addEventListener("DOMContentLoaded", () => {
    // If music was allowed to start automatically, the origin already has
    // audible playback permission; wake the low-latency effects context too.
    document.querySelector("#experience-audio")?.addEventListener("playing", unlock);
  }, { once: true });

  // Sites with an existing autoplay grant can start the context before the
  // first input. Browsers without that grant simply keep it suspended until
  // one of the capture-phase gesture handlers above runs.
  void resume();
})();
