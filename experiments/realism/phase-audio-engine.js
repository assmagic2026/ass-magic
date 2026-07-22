(() => {
  if (window.__realismPhaseAudioEngine) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const scriptUrl = document.currentScript?.src || window.location.href;
  const audioUrl = new URL("./assets/audio/phase-punch.mp3", scriptUrl).href;
  let context = null;
  let buffer = null;
  let encodedAudio = null;
  let hasGesture = false;
  let assetFailed = false;
  let decodeFailed = false;
  let decodePromise = null;
  const activeSources = new Set();
  let unlockAttempts = 0;

  document.documentElement.dataset.phaseAudioEngine = "loading";
  document.documentElement.dataset.phaseAudioContext = "uninitialized";
  document.documentElement.dataset.phaseAudioPlayable = "false";

  function syncStatus() {
    const playable = Boolean(context && buffer && context.state === "running");
    document.documentElement.dataset.phaseAudioContext = context?.state || "uninitialized";
    document.documentElement.dataset.phaseAudioPlayable = playable ? "true" : "false";
    return playable;
  }

  function ensureContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
    } catch {
      try {
        // Older Safari versions support AudioContext but reject constructor
        // options. Create the same single context without the hint there.
        context = new AudioContextClass();
      } catch {
        context = null;
      }
    }
    context?.addEventListener?.("statechange", syncStatus);
    syncStatus();
    return context;
  }

  function resume(targetContext) {
    if (!targetContext || targetContext.state === "running") {
      return Promise.resolve(targetContext?.state === "running");
    }
    try {
      return Promise.resolve(targetContext.resume())
        .then(() => {
          syncStatus();
          return targetContext.state === "running";
        })
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function primeOutput(targetContext) {
    if (!targetContext) return false;
    try {
      // WebKit can leave resume() pending when it is first called from
      // pointerdown/touchstart. Starting a silent source in the same trusted
      // event gives iOS an actual output graph to authorise. We repeat this on
      // later pointerup/touchend/click events because those are the accepted
      // activation events on some Safari/WKWebView versions.
      const silentBuffer = targetContext.createBuffer(
        1,
        1,
        targetContext.sampleRate || 44100,
      );
      const source = targetContext.createBufferSource();
      const gain = targetContext.createGain();
      source.buffer = silentBuffer;
      gain.gain.value = 0;
      source.connect(gain).connect(targetContext.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  // Fetch the small encoded asset immediately, but do not create an
  // AudioContext or decode it during opening. On mobile Safari a context made
  // before user input can keep decodeAudioData pending and hold the loader.
  const ready = fetch(audioUrl, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`phase-audio-${response.status}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      encodedAudio = arrayBuffer;
      document.documentElement.dataset.phaseAudioEngine = "encoded";
      return arrayBuffer;
    })
    .catch(() => {
      assetFailed = true;
      document.documentElement.dataset.phaseAudioEngine = "media-fallback";
      return null;
    });

  function decodeAudioData(targetContext, arrayBuffer) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = (decoded) => {
        if (settled) return;
        settled = true;
        resolve(decoded);
      };
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      try {
        // Supply callbacks for older WebKit and also adopt the Promise
        // returned by current Safari/Chromium. The settle guard handles both.
        const result = targetContext.decodeAudioData(arrayBuffer, resolveOnce, rejectOnce);
        if (result && typeof result.then === "function") result.then(resolveOnce, rejectOnce);
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  function decode(targetContext) {
    if (buffer) return Promise.resolve(buffer);
    if (decodePromise) return decodePromise;
    decodePromise = ready
      .then((arrayBuffer) => {
        if (!targetContext || !arrayBuffer) return null;
        document.documentElement.dataset.phaseAudioEngine = "decoding";
        // Some WebKit builds detach the supplied ArrayBuffer while decoding.
        return decodeAudioData(targetContext, arrayBuffer.slice(0));
      })
      .then((decoded) => {
        buffer = decoded;
        decodeFailed = !decoded;
        document.documentElement.dataset.phaseAudioEngine = decoded ? "decoded" : "media-fallback";
        syncStatus();
        return decoded;
      })
      .catch(() => {
        buffer = null;
        decodeFailed = true;
        document.documentElement.dataset.phaseAudioEngine = "media-fallback";
        syncStatus();
        return null;
      });
    return decodePromise;
  }

  function preparePlayback() {
    if (syncStatus()) return Promise.resolve(true);
    const targetContext = ensureContext();
    if (!targetContext) return Promise.resolve(false);
    return Promise.all([resume(targetContext), decode(targetContext)])
      .then(([running, decoded]) => {
        syncStatus();
        return Boolean(running && decoded && targetContext.state === "running");
      });
  }

  function unlock(trigger = "") {
    hasGesture = true;
    unlockAttempts += 1;
    const targetContext = ensureContext();
    // Do not deduplicate trusted activation attempts. A pointerdown attempt
    // may be rejected by WebKit while the following touchend/click succeeds.
    const resumeAttempt = resume(targetContext);
    const primed = primeOutput(targetContext);
    const decodeAttempt = decode(targetContext);
    document.documentElement.dataset.phaseAudioUnlockAttempts = String(unlockAttempts);
    document.documentElement.dataset.phaseAudioPrime = primed ? "started" : "unavailable";
    if (trigger) document.documentElement.dataset.phaseAudioGesture = trigger;
    return Promise.all([resumeAttempt, decodeAttempt]).then(([running, decoded]) => {
      syncStatus();
      return Boolean(running && decoded && targetContext?.state === "running");
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
    ensurePlayback() {
      return hasGesture ? preparePlayback() : Promise.resolve(false);
    },
    play,
    get supported() {
      return Boolean(AudioContextClass);
    },
    get failed() {
      return assetFailed || decodeFailed || !AudioContextClass;
    },
    get isPlayable() {
      return Boolean(context && buffer && context.state === "running");
    },
    get contextState() {
      return context?.state || "uninitialized";
    },
    get hasGesture() {
      return hasGesture;
    },
  };

  const onGesture = (event) => {
    void unlock(event.type);
  };
  window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
  window.addEventListener("pointerup", onGesture, { capture: true, passive: true });
  window.addEventListener("touchstart", onGesture, { capture: true, passive: true });
  window.addEventListener("touchend", onGesture, { capture: true, passive: true });
  window.addEventListener("click", onGesture, { capture: true, passive: true });
  window.addEventListener("keydown", onGesture, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && hasGesture) void preparePlayback();
  });
  window.addEventListener("pageshow", () => {
    if (hasGesture) void preparePlayback();
  });
  document.addEventListener("DOMContentLoaded", () => {
    // If music was allowed to start automatically, the origin already has
    // audible playback permission; wake the low-latency effects context too.
    document.querySelector("#experience-audio")?.addEventListener("playing", () => {
      void unlock();
    });
  }, { once: true });
})();
