(() => {
  if (window.__realismPhaseAudioEngine) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const scriptUrl = document.currentScript?.src || window.location.href;
  const audioUrl = new URL("./assets/audio/kick-transition.mp3", scriptUrl).href;
  let context = null;
  let buffer = null;
  let encodedAudio = null;
  let hasGesture = false;
  let assetFailed = false;
  let decodeFailed = false;
  let decodePromise = null;
  const activeSources = new Set();
  let unlockAttempts = 0;
  let keepAliveSource = null;
  let cueSequence = 0;

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

  function ensureKeepAlive(targetContext) {
    if (!targetContext || keepAliveSource) return Boolean(keepAliveSource);
    try {
      // Keep the already-authorised Web Audio output graph active while the
      // separate HTMLMediaElement continues playing music. A short looping
      // zero buffer avoids Safari releasing an otherwise idle effects stream
      // between the user's first touch and a later collision.
      const silentLoop = targetContext.createBuffer(
        1,
        128,
        targetContext.sampleRate || 44100,
      );
      const source = targetContext.createBufferSource();
      source.buffer = silentLoop;
      source.loop = true;
      source.connect(targetContext.destination);
      source.start(0);
      keepAliveSource = source;
      document.documentElement.dataset.phaseAudioKeepAlive = "running";
      return true;
    } catch {
      document.documentElement.dataset.phaseAudioKeepAlive = "unavailable";
      return false;
    }
  }

  // Fetch the small encoded asset immediately. Decoding starts during the
  // curtain, but neither this fetch nor decoding is part of the curtain's
  // awaited critical work.
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

  // Decode during the opening curtain as the previously reliable version did,
  // but never add this promise to the curtain's critical loads. The first
  // touch therefore only has to authorise output; it does not also pay the MP3
  // decode cost that caused the first several collision cues to be missed.
  const decodedReady = (() => {
    const targetContext = ensureContext();
    return targetContext ? decode(targetContext) : Promise.resolve(null);
  })();

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
    ensureKeepAlive(targetContext);
    const decodeAttempt = decode(targetContext);
    document.documentElement.dataset.phaseAudioUnlockAttempts = String(unlockAttempts);
    document.documentElement.dataset.phaseAudioPrime = primed ? "started" : "unavailable";
    if (trigger) document.documentElement.dataset.phaseAudioGesture = trigger;
    return Promise.all([resumeAttempt, decodeAttempt]).then(([running, decoded]) => {
      syncStatus();
      return Boolean(running && decoded && targetContext?.state === "running");
    });
  }

  function startCue(label, route = "buffer", volumeScale = 1) {
    if (!context || !buffer || context.state !== "running") return false;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.82 * Math.max(0, Math.min(1, volumeScale));
    source.connect(gain).connect(context.destination);
    activeSources.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      activeSources.delete(source);
    };
    source.start(context.currentTime);
    document.documentElement.dataset.phaseAudioLast = `${label}-${route}`;
    return true;
  }

  function play(label = "dematerialize", volumeScale = 1) {
    if (startCue(label, "buffer", volumeScale)) return true;
    if (!context || !buffer || !hasGesture || context.state === "closed") return false;

    // Music may already be audible while iOS has temporarily interrupted the
    // effects context. Try to recover at the exact cue request and keep only a
    // very short timing window; an old cue is never replayed seconds later.
    const cueId = ++cueSequence;
    const requestedAt = performance.now();
    document.documentElement.dataset.phaseAudioLast = `${label}-recovering`;
    void Promise.race([
      resume(context),
      new Promise((resolve) => window.setTimeout(() => resolve(false), 220)),
    ]).then((running) => {
      const onTime = performance.now() - requestedAt <= 240;
      if (running && onTime && startCue(label, "recovered", volumeScale)) return;
      document.documentElement.dataset.phaseAudioLast = `${label}-missed-${cueId}`;
    });
    return true;
  }

  window.__realismPhaseAudioEngine = {
    ready,
    decodedReady,
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
      void unlock("music-playing");
    });
  }, { once: true });
})();
