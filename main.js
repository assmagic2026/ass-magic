import * as THREE from './three.module.js';
import { playlist as playlistData } from './playlist.js';
import { supabaseConfig } from './supabase-config.js';

const IS_APPLE_TOUCH_AUDIO = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_SAFARI_BROWSER = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

const canvas = document.getElementById('c');
const DEFAULT_CAMERA_FAR = 800;
const SPACE_CAMERA_FAR = 14000;
const DEFAULT_FOG_NEAR = 90;
const DEFAULT_FOG_FAR = 560;
const SPACE_FOG_NEAR = 2400;
const SPACE_FOG_FAR = 14000;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false
});
const RUNTIME_PIXEL_RATIO_MAX = Math.min(window.devicePixelRatio || 1, IS_APPLE_TOUCH_AUDIO ? 1.7 : 1.9);
const RUNTIME_PIXEL_RATIO_MIN = Math.min(RUNTIME_PIXEL_RATIO_MAX, IS_APPLE_TOUCH_AUDIO ? 1.05 : 1.2);
const GROUND_PIXEL_RATIO_SOFT_CAP = Math.min(RUNTIME_PIXEL_RATIO_MAX, IS_APPLE_TOUCH_AUDIO ? 1.42 : RUNTIME_PIXEL_RATIO_MAX);
const CAPTURE_PIXEL_RATIO = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2.5);
renderer.setPixelRatio(GROUND_PIXEL_RATIO_SOFT_CAP);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0d12, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0d12, DEFAULT_FOG_NEAR, DEFAULT_FOG_FAR);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, DEFAULT_CAMERA_FAR);
const runtimeUrlParams = new URLSearchParams(window.location.search);
const DEBUG_CAT_PREVIEW = runtimeUrlParams.get('catdebug') === '1';
const DEBUG_SANCTUARY_START = runtimeUrlParams.get('sanctuarydebug') === '1';

function parseLyricTimestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const parts = value.trim().split(':');
  if (parts.length === 0) return 0;
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + Number(part || 0);
  }
  return Number.isFinite(seconds) ? seconds : 0;
}

function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuint(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5
    ? 16 * Math.pow(t, 5)
    : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

const playlist = playlistData.map((track) => ({
  ...track,
  lyrics: Array.isArray(track.lyrics)
    ? track.lyrics
      .map((line) => ({
        time: parseLyricTimestamp(line.at ?? line.time ?? 0),
        text: line.text ?? ''
      }))
      .sort((a, b) => a.time - b.time)
    : [],
  lyricsPath: track.lyricsPath ?? (typeof track.src === 'string' ? track.src.replace(/\/[^/]+\.mp3$/i, '/lyrics.txt') : null),
  fullLyrics: typeof track.lyricsText === 'string' ? track.lyricsText.trim() : '',
  fullLyricsPromise: null
}));
const INITIAL_TRACK_INDEX = playlist.length > 0
  ? Math.floor(Math.random() * playlist.length)
  : 0;
let currentTrackIndex = INITIAL_TRACK_INDEX;
let randomTrackQueue = [];
const bgm = document.getElementById('bgm-audio') || new Audio();
bgm.preload = 'auto';
bgm.playsInline = true;
bgm.crossOrigin = 'anonymous';
const BGM_BASE_VOLUME = 0.42;
const THEME_DUCK_VOLUME = 0.025;
const THEME_DUCK_HOLD = 0.12;
const THEME_DUCK_DOWN_RATE = 34;
const THEME_DUCK_UP_RATE = 2.15;
const THEME_FILTER_FREQ = 680;
const THEME_FILTER_BASE_FREQ = 18000;
const THEME_FILTER_HOLD = 0.08;
const THEME_FILTER_DOWN_RATE = 42;
const THEME_FILTER_UP_RATE = 1.35;
let bgmPending = false;
let bgmLastAttemptAt = 0;
let lastTrackControlActionAt = 0;
let lastLyricsCurrent = '';
let lastLyricsFull = '';
let lyricsVisible = false;
let lyricsFullVisible = false;
let lyricsEnabled = true;
let lastLyricsPanelY = null;
let lastLyricsFullTop = null;
let themeDuckTimer = 0;
let themeFilterTimer = 0;
let bgmOutputVolume = BGM_BASE_VOLUME;
let bgmAudioContext = null;
let bgmMediaSource = null;
let bgmGainNode = null;
let bgmLowpassNode = null;
let appleTouchEffectsReady = false;
let appleTouchEffectsAttemptAt = 0;
let bgmFilterFrequency = THEME_FILTER_BASE_FREQ;
let bgmPausedForMonochrome = false;
let bgmSuppressedForMonochrome = false;
let bgmPausedForSpaceReturn = false;
const elementVisibilityState = new WeakMap();
const TRACK_VISUALIZER_INTERVAL = IS_APPLE_TOUCH_AUDIO ? 1 / 18 : 1 / 30;
const LYRICS_LAYOUT_INTERVAL = IS_APPLE_TOUCH_AUDIO ? 1 / 12 : 1 / 24;
const LYRICS_UI_INTERVAL = IS_APPLE_TOUCH_AUDIO ? 1 / 15 : 1 / 24;
const INFO_PANEL_INTERVAL = IS_APPLE_TOUCH_AUDIO ? 0.18 : 0.08;
const COLOR_CYCLE_INTERVAL = IS_APPLE_TOUCH_AUDIO ? 1 / 24 : 1 / 30;
const uiPerfState = {
  visualizer: 0,
  lyricsLayout: 0,
  lyricsUi: 0,
  info: 0
};
const colorCyclePerfState = {
  accumulator: 0
};
const rendererPerfState = {
  currentPixelRatio: GROUND_PIXEL_RATIO_SOFT_CAP,
  smoothedFrameTime: 1 / 60,
  sampleTime: 0,
  stableTime: 0,
  changeCooldown: 0
};
const spaceEnvironmentPerfState = {
  initialized: false,
  lastBlend: -1
};
let visualizerIdleState = null;
let lastInfoText = '';
const monochromeClockAudio = new Audio();
monochromeClockAudio.src = encodeURI('./振り子時計（エコー入り）.mp3');
monochromeClockAudio.preload = 'auto';
monochromeClockAudio.loop = true;
monochromeClockAudio.playsInline = true;
monochromeClockAudio.crossOrigin = 'anonymous';
monochromeClockAudio.volume = 0.72;
const earthArrivalAudio = new Audio();
earthArrivalAudio.src = encodeURI('./過去を思い出す.mp3');
earthArrivalAudio.preload = 'auto';
earthArrivalAudio.playsInline = true;
earthArrivalAudio.crossOrigin = 'anonymous';
earthArrivalAudio.volume = 0.9;
const endingRollAudio = new Audio();
endingRollAudio.src = encodeURI('./森の羊水　piano 1 2.m4a');
endingRollAudio.preload = 'auto';
endingRollAudio.playsInline = true;
endingRollAudio.crossOrigin = 'anonymous';
endingRollAudio.volume = 0.72;
const spaceReturnAudio = new Audio();
spaceReturnAudio.src = encodeURI('./死後の世界.mp3');
spaceReturnAudio.preload = 'auto';
spaceReturnAudio.loop = true;
spaceReturnAudio.playsInline = true;
spaceReturnAudio.crossOrigin = 'anonymous';
spaceReturnAudio.volume = 0.78;
let effectAudioPrimed = false;

function getRuntimePixelRatioCeiling() {
  if (
    IS_APPLE_TOUCH_AUDIO &&
    returnRouteState.spaceTransition < 0.08 &&
    !returnRouteState.spaceFlightActive &&
    returnRouteState.phase !== RETURN_ROUTE_PHASES.SANCTUARY &&
    !endingUiState.open &&
    !endingUiState.transitionActive &&
    !endingUiState.whiteoutActive
  ) {
    return GROUND_PIXEL_RATIO_SOFT_CAP;
  }
  return RUNTIME_PIXEL_RATIO_MAX;
}

function applyRuntimePixelRatio(nextPixelRatio, force = false, maxOverride = getRuntimePixelRatioCeiling()) {
  const clamped = THREE.MathUtils.clamp(nextPixelRatio, RUNTIME_PIXEL_RATIO_MIN, maxOverride);
  const rounded = Math.round(clamped * 100) / 100;
  if (!force && Math.abs(rounded - rendererPerfState.currentPixelRatio) < 0.08) return;
  rendererPerfState.currentPixelRatio = rounded;
  renderer.setPixelRatio(rounded);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  rendererPerfState.changeCooldown = IS_APPLE_TOUCH_AUDIO ? 0.6 : 0.4;
}

function updateRuntimePixelRatio(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (captureUiState?.busy || captureUiState?.open) return;

  if (rendererPerfState.changeCooldown > 0) {
    rendererPerfState.changeCooldown = Math.max(0, rendererPerfState.changeCooldown - dt);
    rendererPerfState.sampleTime = 0;
    return;
  }

  rendererPerfState.smoothedFrameTime = THREE.MathUtils.lerp(rendererPerfState.smoothedFrameTime, dt, 0.08);
  rendererPerfState.sampleTime += dt;
  const sampleInterval = IS_APPLE_TOUCH_AUDIO ? 0.8 : 0.5;
  if (rendererPerfState.sampleTime < sampleInterval) return;
  rendererPerfState.sampleTime = 0;

  const heavyScene = returnRouteState.spaceTransition > 0.08
    || returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY
    || endingUiState.open
    || endingUiState.transitionActive
    || endingUiState.whiteoutActive;
  const groundFocusedScene = !heavyScene;
  const effectiveMax = getRuntimePixelRatioCeiling();
  const downThreshold = groundFocusedScene
    ? (IS_APPLE_TOUCH_AUDIO ? 1 / 52 : 1 / 48)
    : (IS_APPLE_TOUCH_AUDIO ? 1 / 44 : 1 / 43);
  const upThreshold = groundFocusedScene
    ? (IS_APPLE_TOUCH_AUDIO ? 1 / 61 : 1 / 59)
    : (IS_APPLE_TOUCH_AUDIO ? 1 / 55 : 1 / 57);
  const stepDown = groundFocusedScene
    ? (IS_APPLE_TOUCH_AUDIO ? 0.06 : 0.08)
    : (IS_APPLE_TOUCH_AUDIO ? 0.06 : 0.06);
  const stepUp = groundFocusedScene
    ? (IS_APPLE_TOUCH_AUDIO ? 0.04 : 0.05)
    : (IS_APPLE_TOUCH_AUDIO ? 0.04 : 0.06);

  if (rendererPerfState.currentPixelRatio > effectiveMax + 0.01) {
    rendererPerfState.stableTime = 0;
    applyRuntimePixelRatio(effectiveMax, true, effectiveMax);
    return;
  }

  if (rendererPerfState.smoothedFrameTime > downThreshold && rendererPerfState.currentPixelRatio > RUNTIME_PIXEL_RATIO_MIN + 0.01) {
    rendererPerfState.stableTime = 0;
    applyRuntimePixelRatio(rendererPerfState.currentPixelRatio - stepDown, false, effectiveMax);
    return;
  }

  if (rendererPerfState.smoothedFrameTime < upThreshold && rendererPerfState.currentPixelRatio < effectiveMax - 0.01) {
    rendererPerfState.stableTime += sampleInterval;
    const settleTime = groundFocusedScene
      ? (IS_APPLE_TOUCH_AUDIO ? 2.4 : 1.0)
      : (IS_APPLE_TOUCH_AUDIO ? 3.0 : 1.4);
    if (rendererPerfState.stableTime >= settleTime) {
      rendererPerfState.stableTime = 0;
      applyRuntimePixelRatio(rendererPerfState.currentPixelRatio + stepUp, false, effectiveMax);
    }
    return;
  }

  rendererPerfState.stableTime = 0;
}

function fitFullLyricsText() {
  if (!lyricsFullPanel || !lyricsFullText || !lyricsFullVisible || !lastLyricsFull) return;
  const isCompact = window.innerWidth <= 860;
  const baseFont = isCompact ? 11.2 : 13.5;
  const minFont = isCompact ? 8.6 : 10.4;
  const baseLineHeight = isCompact ? 1.42 : 1.5;
  let fontSize = baseFont;
  let lineHeight = baseLineHeight;

  lyricsFullText.style.fontSize = `${fontSize}px`;
  lyricsFullText.style.lineHeight = `${lineHeight}`;

  let guard = 0;
  while (lyricsFullText.scrollHeight > lyricsFullPanel.clientHeight + 1 && fontSize > minFont && guard < 14) {
    fontSize -= isCompact ? 0.28 : 0.36;
    lineHeight = Math.max(isCompact ? 1.24 : 1.3, lineHeight - 0.02);
    lyricsFullText.style.fontSize = `${fontSize.toFixed(2)}px`;
    lyricsFullText.style.lineHeight = `${lineHeight.toFixed(2)}`;
    guard += 1;
  }
}

function applyBgmOutputVolume(value) {
  bgmOutputVolume = THREE.MathUtils.clamp(value, 0, 1);
  if (bgmGainNode) {
    bgm.volume = 1;
    bgmGainNode.gain.value = bgmOutputVolume;
  } else {
    bgm.volume = bgmOutputVolume;
  }
}

function applyBgmFilterFrequency(value) {
  bgmFilterFrequency = THREE.MathUtils.clamp(value, 120, THEME_FILTER_BASE_FREQ);
  if (bgmLowpassNode) {
    bgmLowpassNode.frequency.value = bgmFilterFrequency;
  }
}

function stopEffectAudio(audio, reset = false) {
  if (!audio) return;
  try {
    audio.pause();
    if (reset) audio.currentTime = 0;
  } catch (error) {
    console.warn('Effect audio stop failed:', error);
  }
}

function playEffectAudio(audio, { restart = false, startTime = null } = {}) {
  if (!audio) return;
  if (restart || startTime !== null) {
    try {
      audio.currentTime = startTime !== null ? Math.max(0, startTime) : 0;
    } catch (error) {
      console.warn('Effect audio rewind failed:', error);
    }
  }
  if (!audio.paused && !restart) return;
  audio.muted = false;
  const playResult = audio.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch((error) => {
      if (error?.name === 'AbortError') return;
      console.warn('Effect audio playback was blocked or failed:', error);
    });
  }
}

function clearEndingRollAudioDelay() {
  if (endingUiState.rollAudioDelayTimer !== null) {
    window.clearTimeout(endingUiState.rollAudioDelayTimer);
    endingUiState.rollAudioDelayTimer = null;
  }
}

function queueEndingRollAudio() {
  clearEndingRollAudioDelay();
  try {
    endingRollAudio.currentTime = 0;
  } catch (error) {
    console.warn('Effect audio rewind failed:', error);
  }
  endingUiState.rollAudioDelayTimer = window.setTimeout(() => {
    endingUiState.rollAudioDelayTimer = null;
    if (!endingUiState.open) return;
    playEffectAudio(endingRollAudio);
  }, ENDING_ROLL_AUDIO_DELAY_MS);
}

function stopEndingRollAudioPlayback() {
  clearEndingRollAudioDelay();
  stopEffectAudio(endingRollAudio, true);
}

function stopRouteEffectAudios() {
  clearEndingRollAudioDelay();
  stopEffectAudio(monochromeClockAudio, true);
  stopEffectAudio(earthArrivalAudio, true);
  stopEffectAudio(endingRollAudio, true);
  stopEffectAudio(spaceReturnAudio, true);
}

function primeEffectAudioFromGesture() {
  if (effectAudioPrimed) return;
  effectAudioPrimed = true;
  for (const audio of [monochromeClockAudio, earthArrivalAudio, endingRollAudio, spaceReturnAudio]) {
    try {
      audio.load();
    } catch (error) {
      console.warn('Effect audio preload failed:', error);
    }
  }
}

function syncMonochromeEffectState() {
  const monochromeActive = themeState.mode === 'monochrome' && !endingUiState.completed;
  if (monochromeActive) {
    playEffectAudio(monochromeClockAudio);
    return;
  }
  stopEffectAudio(monochromeClockAudio, true);
}

function isBgmEffectivelyPlaying() {
  return !bgm.paused && !bgmSuppressedForMonochrome;
}

function ensureBgmAudioChain(forceOnApple = false) {
  if ((IS_APPLE_TOUCH_AUDIO || IS_SAFARI_BROWSER) && !forceOnApple) {
    applyBgmOutputVolume(bgmOutputVolume);
    return;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    applyBgmOutputVolume(bgmOutputVolume);
    return;
  }

  try {
    if (!bgmAudioContext) {
      bgmAudioContext = new AudioContextCtor();
    }
    if (!bgmMediaSource) {
      bgmMediaSource = bgmAudioContext.createMediaElementSource(bgm);
      bgmLowpassNode = bgmAudioContext.createBiquadFilter();
      bgmLowpassNode.type = 'lowpass';
      bgmLowpassNode.Q.value = 0.0001;
      bgmGainNode = bgmAudioContext.createGain();
      bgmMediaSource.connect(bgmLowpassNode);
      bgmLowpassNode.connect(bgmGainNode);
      bgmGainNode.connect(bgmAudioContext.destination);
    }
    if (bgmAudioContext.state === 'suspended') {
      const resumeResult = bgmAudioContext.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        resumeResult.catch((error) => {
          console.warn('AudioContext resume failed:', error);
        });
      }
    }
  } catch (error) {
    console.warn('BGM audio chain setup failed:', error);
  }

  applyBgmOutputVolume(bgmOutputVolume);
  applyBgmFilterFrequency(bgmFilterFrequency);
  if (IS_APPLE_TOUCH_AUDIO && bgmGainNode && bgmLowpassNode) {
    appleTouchEffectsReady = true;
  }
}

applyBgmOutputVolume(BGM_BASE_VOLUME);

function syncTrackUi() {
  const track = playlist[currentTrackIndex];
  if (trackCard) {
    trackCard.setAttribute('aria-label', track.title);
    if (track.href) {
      trackCard.href = track.href;
      trackCard.setAttribute('target', '_blank');
      trackCard.setAttribute('rel', 'noreferrer noopener');
      trackCard.classList.remove('is-disabled');
    } else {
      trackCard.removeAttribute('href');
      trackCard.removeAttribute('target');
      trackCard.removeAttribute('rel');
      trackCard.classList.add('is-disabled');
    }
  }
  if (trackArt) {
    trackArt.src = encodeURI(track.art);
    trackArt.alt = `${track.title} jacket`;
  }
  refreshMusicSelectorUi();
}

function setRecordSpinning(isPlaying) {
  trackCard?.classList.toggle('is-spinning', isPlaying);
}

function ensureMusicSelectorList() {
  if (!musicSelectorList || musicSelectorList.childElementCount > 0) return;
  for (let i = 0; i < playlist.length; i++) {
    const track = playlist[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-selector-item ui-control';
    button.dataset.trackIndex = `${i}`;

    const main = document.createElement('div');
    main.className = 'music-selector-item-main';

    const art = document.createElement('img');
    art.className = 'music-selector-item-art';
    art.loading = 'lazy';
    art.decoding = 'async';
    art.src = encodeURI(track.art);
    art.alt = `${track.title} jacket`;

    const title = document.createElement('div');
    title.className = 'music-selector-item-title';
    title.textContent = track.title;

    const meta = document.createElement('div');
    meta.className = 'music-selector-item-meta';
    meta.textContent = `TRACK ${String(i + 1).padStart(2, '0')}`;

    const state = document.createElement('div');
    state.className = 'music-selector-item-state';
    state.textContent = 'PLAY';

    main.append(title, meta);
    button.append(art, main, state);
    musicSelectorList.append(button);
  }
}

function refreshMusicSelectorUi() {
  const track = playlist[currentTrackIndex];
  if (musicSelectorNowPlaying && track) {
    musicSelectorNowPlaying.replaceChildren();
    const art = document.createElement('img');
    art.className = 'music-selector-now-playing-art';
    art.loading = 'lazy';
    art.decoding = 'async';
    art.src = encodeURI(track.art);
    art.alt = `${track.title} jacket`;

    const copy = document.createElement('div');
    copy.className = 'music-selector-now-playing-copy';

    const label = document.createElement('div');
    label.className = 'music-selector-now-playing-label';
    label.textContent = '再生中';

    const meta = document.createElement('div');
    meta.className = 'music-selector-now-playing-meta';
    meta.textContent = `TRACK ${String(currentTrackIndex + 1).padStart(2, '0')}`;

    const title = document.createElement('div');
    title.className = 'music-selector-now-playing-title';
    title.textContent = track.title;

    copy.append(label, title, meta);
    musicSelectorNowPlaying.append(art, copy);
  }
  if (!musicSelectorList) return;
  const isPlaying = isBgmEffectivelyPlaying();
  for (const element of musicSelectorList.querySelectorAll('.music-selector-item')) {
    const index = Number(element.dataset.trackIndex ?? '-1');
    const active = index === currentTrackIndex;
    element.classList.toggle('is-current', active);
    const stateLabel = element.querySelector('.music-selector-item-state');
    if (stateLabel) {
      stateLabel.textContent = active ? (isPlaying ? 'NOW PLAYING' : 'READY') : 'PLAY';
    }
  }
}

function refreshTrackControls() {
  if (!trackToggle) return;
  const isPlaying = isBgmEffectivelyPlaying();
  trackToggle.classList.toggle('is-playing', isPlaying);
  trackToggle.setAttribute('aria-label', isPlaying ? 'Stop' : 'Play');
}

function refreshLyricsToggle() {
  if (!lyricsToggle) return;
  lyricsToggle.classList.toggle('is-active', lyricsEnabled);
  lyricsToggle.setAttribute('aria-pressed', lyricsEnabled ? 'true' : 'false');
}

function normalizeFullLyricsText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim();
}

function ensureTrackFullLyrics(track) {
  if (!track || Array.isArray(track.lyrics) && track.lyrics.length > 0) return Promise.resolve(track?.fullLyrics ?? '');
  if (typeof track.fullLyrics === 'string' && track.fullLyrics.length > 0) return Promise.resolve(track.fullLyrics);
  if (!track.lyricsPath) return Promise.resolve('');
  if (track.fullLyricsPromise) return track.fullLyricsPromise;

  track.fullLyricsPromise = fetch(encodeURI(track.lyricsPath))
    .then((response) => {
      if (!response.ok) return '';
      return response.text();
    })
    .then((text) => {
      track.fullLyrics = normalizeFullLyricsText(text);
      return track.fullLyrics;
    })
    .catch(() => {
      track.fullLyrics = '';
      return '';
    })
    .finally(() => {
      track.fullLyricsPromise = null;
      if (playlist[currentTrackIndex] === track) updateLyricsUi();
    });

  return track.fullLyricsPromise;
}

function getSpaceReturnBgmVolumeFactor() {
  if (returnRouteState.phase !== RETURN_ROUTE_PHASES.SANCTUARY || !returnRouteState.spaceFlightActive) return 1;
  const altitude = Math.max(0, getAltitude(state.pos));
  const fade = THREE.MathUtils.smoothstep(
    altitude,
    SPACE_RETURN_MODE_ALTITUDE + 20,
    SPACE_RETURN_MODE_ALTITUDE + 260
  );
  return THREE.MathUtils.lerp(1, 0, fade);
}

function getBgmBaseTargetVolume() {
  return BGM_BASE_VOLUME * getSpaceReturnBgmVolumeFactor();
}

function isEndingSequenceActive() {
  return (
    endingUiState.completed ||
    endingUiState.whiteoutActive ||
    endingUiState.transitionActive ||
    endingUiState.open
  );
}

function stopBgmForEnding() {
  bgm.pause();
  bgmPending = false;
  bgm.muted = false;
  bgmPausedForMonochrome = false;
  bgmSuppressedForMonochrome = false;
  bgmPausedForSpaceReturn = false;
  setRecordSpinning(false);
  refreshTrackControls();
  updateLyricsUi();
}

function shouldHideMusicUi() {
  return (
    returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY &&
    returnRouteState.spaceFlightActive &&
    getSpaceReturnBgmVolumeFactor() <= 0.02 &&
    !endingUiState.completed
  );
}

function shouldPlaySpaceReturnAudio() {
  return (
    returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY &&
    returnRouteState.spaceFlightActive &&
    !endingUiState.completed
  );
}

function syncSpaceReturnAudioState() {
  if (shouldPlaySpaceReturnAudio()) {
    if (!bgm.paused || bgmPending) {
      bgmPausedForSpaceReturn = true;
      bgm.pause();
      bgmPending = false;
      bgm.muted = false;
      setRecordSpinning(false);
      refreshTrackControls();
      updateLyricsUi();
    }
    playEffectAudio(spaceReturnAudio);
    return;
  }
  stopEffectAudio(spaceReturnAudio, true);
  if (bgmPausedForSpaceReturn && themeState.mode !== 'monochrome' && !isEndingSequenceActive()) {
    bgmPausedForSpaceReturn = false;
    playCurrentTrack();
  } else if (!shouldPlaySpaceReturnAudio()) {
    bgmPausedForSpaceReturn = false;
  }
}

function setElementUiVisibility(element, isVisible) {
  if (!element) return;
  if (elementVisibilityState.get(element) === isVisible) return;
  elementVisibilityState.set(element, isVisible);
  element.style.opacity = isVisible ? '' : '0';
  element.style.visibility = isVisible ? '' : 'hidden';
  element.style.pointerEvents = isVisible ? '' : 'none';
}

function shouldRunUiStep(bucket, interval, dt, force = false) {
  if (force) {
    uiPerfState[bucket] = 0;
    return true;
  }
  uiPerfState[bucket] += dt;
  if (uiPerfState[bucket] < interval) return false;
  uiPerfState[bucket] = 0;
  return true;
}

function syncMusicUiVisibility() {
  const showMusicUi = !shouldHideMusicUi();
  setElementUiVisibility(trackCard, showMusicUi);
  setElementUiVisibility(trackControls, showMusicUi);

  if (!showMusicUi) {
    lyricsPanel?.classList.remove('is-visible', 'is-idle');
    lyricsPanel?.setAttribute('aria-hidden', 'true');
    lyricsFullPanel?.classList.remove('is-visible');
    lyricsFullPanel?.setAttribute('aria-hidden', 'true');
    lyricsVisible = false;
    lyricsFullVisible = false;
  }

  setElementUiVisibility(lyricsPanel, showMusicUi && lyricsVisible);
  setElementUiVisibility(lyricsFullPanel, showMusicUi && lyricsFullVisible);
}

function syncMonochromeBgmState() {
  if (isEndingSequenceActive()) {
    bgmPausedForMonochrome = false;
    bgmSuppressedForMonochrome = false;
    if (!bgm.paused || bgmPending) {
      stopBgmForEnding();
    }
    return;
  }
  const monochromeActive = themeState.mode === 'monochrome';
  if (monochromeActive) {
    if (IS_SAFARI_BROWSER) {
      if (!bgm.paused || bgmPending) {
        bgmPausedForMonochrome = false;
        bgmSuppressedForMonochrome = true;
        bgm.muted = true;
        setRecordSpinning(false);
        refreshTrackControls();
        updateLyricsUi();
      }
      return;
    }
    if (!bgm.paused || bgmPending) {
      bgmPausedForMonochrome = true;
      bgmSuppressedForMonochrome = false;
      bgm.pause();
      bgmPending = false;
      setRecordSpinning(false);
      refreshTrackControls();
      updateLyricsUi();
    }
    return;
  }

  if (bgmSuppressedForMonochrome) {
    bgmSuppressedForMonochrome = false;
    bgm.muted = false;
    setRecordSpinning(!bgm.paused);
    refreshTrackControls();
    updateLyricsUi();
    return;
  }

  if (bgmPausedForMonochrome) {
    bgmPausedForMonochrome = false;
    playCurrentTrack();
  }
}

function playCurrentTrack() {
  if (themeState.mode === 'monochrome') return;
  if (shouldPlaySpaceReturnAudio()) return;
  if (isEndingSequenceActive()) return;
  if (bgmPending) return;
  const now = performance.now();
  if (now - bgmLastAttemptAt < 90) return;
  bgmLastAttemptAt = now;
  bgm.muted = false;
  bgmSuppressedForMonochrome = false;
  ensureBgmAudioChain();
  applyBgmOutputVolume(getBgmBaseTargetVolume());
  applyBgmFilterFrequency(THEME_FILTER_BASE_FREQ);
  bgmPending = true;
  const playResult = bgm.play();
  if (playResult && typeof playResult.then === 'function') {
    playResult.then(() => {
      if (themeState.mode === 'monochrome' || isEndingSequenceActive()) {
        bgm.pause();
        bgmPending = false;
        setRecordSpinning(false);
        refreshTrackControls();
        updateLyricsUi();
        return;
      }
      setRecordSpinning(true);
      refreshTrackControls();
      updateLyricsUi();
      bgmPending = false;
    }).catch((error) => {
      console.warn('BGM playback was blocked or failed:', error);
      bgmPending = false;
    });
  } else {
    setRecordSpinning(true);
    refreshTrackControls();
    updateLyricsUi();
    bgmPending = false;
  }
}

function loadTrack(index, autoplay = false) {
  currentTrackIndex = (index + playlist.length) % playlist.length;
  const track = playlist[currentTrackIndex];
  bgm.pause();
  themeDuckTimer = 0;
  themeFilterTimer = 0;
  applyBgmOutputVolume(getBgmBaseTargetVolume());
  applyBgmFilterFrequency(THEME_FILTER_BASE_FREQ);
  bgm.src = encodeURI(track.src);
  bgm.load();
  syncTrackUi();
  setRecordSpinning(false);
  refreshTrackControls();
  ensureTrackFullLyrics(track);
  updateLyricsUi();
  if (autoplay) playCurrentTrack();
}

function ensureBgm() {
  if (themeState.mode === 'monochrome') return;
  if (shouldPlaySpaceReturnAudio()) return;
  if (isEndingSequenceActive()) return;
  if (!bgm.paused) return;
  playCurrentTrack();
}

function startBgmFromGesture() {
  primeEffectAudioFromGesture();
  if (themeState.mode === 'monochrome') return;
  if (shouldPlaySpaceReturnAudio()) return;
  if (isEndingSequenceActive()) return;
  if (!bgm.paused || bgmPending) return;
  bgm.muted = false;
  bgmSuppressedForMonochrome = false;
  ensureBgmAudioChain();
  playCurrentTrack();
}

function triggerThemeDuck() {
  themeDuckTimer = THEME_DUCK_HOLD;
  themeFilterTimer = THEME_FILTER_HOLD;
}

function updateThemeDuck(dt) {
  if (themeDuckTimer > 0) {
    themeDuckTimer = Math.max(0, themeDuckTimer - dt);
  }
  if (themeFilterTimer > 0) {
    themeFilterTimer = Math.max(0, themeFilterTimer - dt);
  }

  const targetVolume = (themeDuckTimer > 0 ? THEME_DUCK_VOLUME : getBgmBaseTargetVolume());
  const response = targetVolume < bgmOutputVolume ? THEME_DUCK_DOWN_RATE : THEME_DUCK_UP_RATE;
  const blend = 1 - Math.exp(-response * dt);
  applyBgmOutputVolume(THREE.MathUtils.lerp(bgmOutputVolume, targetVolume, blend));

  const targetFilter = themeFilterTimer > 0 ? THEME_FILTER_FREQ : THEME_FILTER_BASE_FREQ;
  const filterResponse = targetFilter < bgmFilterFrequency ? THEME_FILTER_DOWN_RATE : THEME_FILTER_UP_RATE;
  const filterBlend = 1 - Math.exp(-filterResponse * dt);
  applyBgmFilterFrequency(THREE.MathUtils.lerp(bgmFilterFrequency, targetFilter, filterBlend));
}

function maybeEnableAppleTouchEffects() {
  // iPhone/iPad Safari gets unreliable if we attach the Web Audio chain
  // after playback has already started, so keep mobile on the plain audio path.
  if (IS_APPLE_TOUCH_AUDIO) return;
}

function runTrackControlAction(action) {
  const now = performance.now();
  if (now - lastTrackControlActionAt < 120) return;
  lastTrackControlActionAt = now;
  action();
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PLANET_RADIUS = 340;
const PLAYER_CLEARANCE = 0.9;
const SUN_DIRECTION = new THREE.Vector3(0.82, 0.33, 0.46).normalize();
const SUN_DISTANCE = 240;
const NIGHT_CENTER = SUN_DIRECTION.clone().multiplyScalar(-1).normalize();
const NIGHT_AXIS_A = new THREE.Vector3()
  .crossVectors(Math.abs(NIGHT_CENTER.y) > 0.96 ? new THREE.Vector3(1, 0, 0) : WORLD_UP, NIGHT_CENTER)
  .normalize();
const NIGHT_AXIS_B = new THREE.Vector3().crossVectors(NIGHT_CENTER, NIGHT_AXIS_A).normalize();
const ROUTE_AXIS = new THREE.Vector3(1, 0, 0);
const USE_GIANT_RECORD_PLAYER = true;
const DAY_BLOCKS_DIR = SUN_DIRECTION.clone()
  .addScaledVector(NIGHT_AXIS_A, 0.42)
  .addScaledVector(NIGHT_AXIS_B, -0.16)
  .normalize();
const GIANT_RECORD_PLAYER_ALTITUDE = 0.45;
const GIANT_RECORD_PLAYER_TRIGGER_RADIUS = 18.5;
const GIANT_RECORD_PLAYER_REARM_EXIT_EXTRA_RADIUS = 1.6;
const GIANT_RECORD_PLAYER_SPIN_RATE = 1.55;
const MENU_CLICK_THROUGH_GUARD_MS = 420;
const GIANT_BOOK_ALTITUDE = 0.04;
const GIANT_BOOK_DIR = SUN_DIRECTION.clone()
  .addScaledVector(NIGHT_AXIS_A, -1.4)
  .addScaledVector(NIGHT_AXIS_B, -0.8)
  .normalize();
const SANCTUARY_DIR = NIGHT_CENTER.clone()
  .addScaledVector(NIGHT_AXIS_A, 1.08)
  .addScaledVector(NIGHT_AXIS_B, 0.48)
  .normalize();
const BLACK_BOX_ALTITUDE = 0.4;
const BLACK_BOX_GROUND_ALTITUDE = 0.96;
const BLACK_BOX_LOOKAHEAD_SECONDS = 20.0;
const BLACK_BOX_LOOKAHEAD_SPEED = 40;
const BLACK_BOX_SPEED = 200;
const BLACK_BOX_PHASE_LEAD_SECONDS = 0.0;
const BLACK_BOX_ROLL = Math.PI * 0.2;
const BLACK_BOX_REOPEN_TRIGGER_RADIUS = 6.6;
const BLACK_BOX_REARM_EXIT_RADIUS = 8.4;
const DUSK_TOWER_ALTITUDE = 24.0;
const DUSK_TOWER_DIR = NIGHT_AXIS_A.clone()
  .multiplyScalar(-1.0)
  .addScaledVector(NIGHT_AXIS_B, 0.14)
  .addScaledVector(SUN_DIRECTION, 0.12)
  .normalize();
const COMPASS_DIR = DUSK_TOWER_DIR.clone()
  .addScaledVector(SUN_DIRECTION, -DUSK_TOWER_DIR.dot(SUN_DIRECTION))
  .normalize();
const DAY_MONO_SPHERE_CENTER_ALTITUDE = 40.0;
const DAY_MONO_SPHERE_RADIUS = 18.0;
const NIGHT_MONO_SPHERE_CENTER_ALTITUDE = 40.0;
const NIGHT_MONO_SPHERE_RADIUS = 18.0;
const SANCTUARY_TRIGGER_HEIGHT = 30;
const SANCTUARY_TRIGGER_RADIUS = 36;
const SANCTUARY_RING_TRIGGER_HEIGHT = 10;
const SANCTUARY_RING_TRIGGER_RADIUS = 56;
const SANCTUARY_ACTIVATION_DURATION = 1.6;
const SANCTUARY_BEAM_HEIGHT = 6400;
const SANCTUARY_BEAM_MARKER_COUNT = 18;
const SANCTUARY_BEAM_THICKNESS_SCALE = 0.1;
const SPACE_RETURN_MODE_ALTITUDE = 220;
const SPACE_RETURN_ACTIVATION_HOLD = 0.32;
const SPACE_RETURN_MIN_ASCENT_SPEED = 0.8;
const SPACE_PARALLEL_RETURN_RATE = 0.08;
const SPACE_PARALLEL_RETURN_MAX = 1.8;
const SPACE_PARALLEL_RETURN_DEADZONE = 18;
const SPACE_CAMERA_LOOK_AHEAD = 34;
const SPACE_CAMERA_TRAIL = 18;
const SPACE_CAMERA_HEIGHT = 1.6;
const SPACE_CAMERA_LIFT = 0.55;
const SPACE_CAMERA_SMOOTH = 0.2;
const SPACE_TRANSITION_IN_RATE = 1.45;
const SPACE_TRANSITION_OUT_RATE = 4.4;
const EARTH_RETURN_DISTANCE = SANCTUARY_BEAM_HEIGHT;
const EARTH_RETURN_SIZE = 220;
const EARTH_RETURN_GLOW_SIZE = 380;
const EARTH_APPROACH_START_DISTANCE = 4800;
const EARTH_APPROACH_END_DISTANCE = 320;
const EARTH_CONTACT_DISTANCE = 150;
const EARTH_GUIDE_TURN_RATE = 1.35;
const EARTH_GUIDE_PULL_SPEED = 11;
const EARTH_GUIDE_INPUT_RELIEF = 0.92;
const KEYBOARD_ARROW_STICK_SCALE_X = 0.5;
const KEYBOARD_ARROW_STICK_SCALE_Y = 1.0;
const ENDING_WHITEOUT_DURATION = 1.05;
const ENDING_BLACK_RISE_DURATION = 0.65;
const ENDING_TRUE_MESSAGE_DURATION = 2.2;
const ENDING_ROLL_DURATION = 46;
const SPACE_STAR_COUNT = 88;
const SPACE_STAR_RADIUS = 240;
const SPACE_STAR_DEPTH = 1500;
const SPACE_STAR_SPEED_MULTIPLIER = 2.4;
const SPACE_ASTEROID_COUNT = 5;
const SPACE_ASTEROID_RADIUS = 260;
const SPACE_ASTEROID_DEPTH = 1800;
const COMPASS_SPIN_RATE = 1.35;
const COMPASS_SETTLE_RATE = 6.8;
const COMPASS_ASSIST_TRIGGER_RADIUS = 9.8;
const COMPASS_ASSIST_REARM_EXIT_RADIUS = 13.6;
const COMPASS_ASSIST_DURATION = 0.92;
const COMPASS_ASSIST_COOLDOWN = 2.4;
const COMPASS_ASSIST_TURN_RATE = 9.4;
const COMPASS_ASSIST_INPUT_RELIEF = 0.9;
const CAMERA_LOOK_MODES = Object.freeze({
  CHASE: 'chase',
  FP_LEFT: 'fp-left',
  FP_RIGHT: 'fp-right',
  FP_FORWARD: 'fp-forward',
  FRONT_LOOKBACK: 'front-lookback'
});
const RETURN_ROUTE_PHASES = Object.freeze({
  IDLE: 'idle',
  CHALLENGE: 'challenge',
  INVERTED: 'inverted',
  SANCTUARY: 'sanctuary'
});
const BLACK_BOX_IMAGE_SET = [
  {
    src: './blackbox.jpg',
    download: 'blackbox.jpg',
    caption: 'かわいいのがいた。'
  },
  {
    src: './blackbox2.jpg',
    download: 'blackbox2.jpg',
    caption: 'うーん、やっぱりかわいい。'
  }
];
const BOOK_MESSAGE_STORAGE_KEY = 'ass-magic-book-messages-v1';
const BOOK_PLAYER_STATE_STORAGE_KEY = 'ass-magic-book-player-v1';
const BOOK_MESSAGE_LIMIT = 12;
const BOOK_MESSAGE_FETCH_LIMIT = 24;
const BOOK_MESSAGE_TIMEOUT_MS = 9000;
const BOOK_REARM_EXIT_EXTRA_RADIUS = 3.2;
const RETURN_HISTORY_STORAGE_KEY = 'ass-magic-return-histories-v1';
const RETURN_HISTORY_LIMIT = 80;
const RETURN_HISTORY_BOOK_FALLBACK_AUTHOR = '__return_history__';
const RETURN_HISTORY_BOOK_FALLBACK_PREFIX = '__return_history__:';
const RETURN_HISTORY_BOOK_FALLBACK_FETCH_LIMIT = 120;
const BOOK_RECORD_EXCLUDED_NAMES = new Set(['サーモンユッケ伯爵', '揚げパン大王', '道夫', 'トリケラトプさん']);
const ENDING_CREDITS_EXCLUDED_NAMES = new Set(['サーモンユッケ伯爵', '道夫', 'トリケラトプさん', '揚げパン大王']);
const ENDING_ROLL_AUDIO_DELAY_MS = 2000;
const CAT_PREVIEW_HEIGHT = 4.6;
const CAT_PREVIEW_ALTITUDE = 0.18;
const CAT_PREVIEW_LOOKAHEAD_SECONDS = 5;
const CAT_PREVIEW_LOOKAHEAD_SPEED = 40;
const CAT_ROUTE_BUBBLE_DURATION = 3.8;
const CAT_ROUTE_JOIN_DURATION = 1.75;
const CAT_ROUTE_FOLLOW_DISTANCE = 1.8;
const CAT_ROUTE_FOLLOW_SIDE = 0.0;
const CAT_ROUTE_FOLLOW_HEIGHT = 0.0;
const CAT_ROUTE_FOLLOW_RESPONSE = 8.8;
const CAT_ROUTE_CATCHUP_RESPONSE = 20.0;
const CAT_ROUTE_ROTATION_RESPONSE = 7.2;
const CAT_ROUTE_COMPANION_SCALE = 0.1512;
const CAT_ROUTE_MOUNT_OFFSET = new THREE.Vector3(0.34, 0.02, 0.12);
const INVERT_WORLD_FILTER = 'invert(1) hue-rotate(180deg) saturate(0.94) brightness(1.05)';
const MONOCHROME_WORLD_FILTER = 'grayscale(1) contrast(1.78) brightness(1.42)';
const FREEZE_CLOUD_DRIFT_FOR_TEST = true;
const THEME_TRIGGER_COOLDOWN = 7.0;
const THEME_FLASH_DURATION = 0.42;
const PLAYER_THEME_HIT_RADIUS = 1.45;
const THEME_ARM_DISTANCE = 24;
const THEME_STARTUP_GRACE = 0.9;
const SKY_PALETTES = {
  normal: {
    dayZenith: new THREE.Color(0x65b7ff),
    dayHorizon: new THREE.Color(0xcbe8ff),
    duskZenith: new THREE.Color(0x5b4f96),
    duskHorizon: new THREE.Color(0xff9f5a),
    nightZenith: new THREE.Color(0x06111f),
    nightHorizon: new THREE.Color(0x10233f)
  },
  inverted: {
    dayZenith: new THREE.Color(0x65b7ff),
    dayHorizon: new THREE.Color(0xcbe8ff),
    duskZenith: new THREE.Color(0x5b4f96),
    duskHorizon: new THREE.Color(0xff9f5a),
    nightZenith: new THREE.Color(0x06111f),
    nightHorizon: new THREE.Color(0x10233f)
  }
};

const P = {
  GLIDE_SPEED: 12,
  GROUND_SPEED: 7,
  MIN_FWD_SPEED: 9,
  GLIDE_DRAG: 0.03,
  BOOST_ENERGY: 2.75,
  HOLD_ACCEL_RATE: 7.5,
  HOLD_ACCEL_DECAY: 5.2,
  LOCK_ACCEL_DECAY: 1.4,
  LOCK_SPEED_ACCEL: 3.2,
  LOCK_SPEED_SETTLE: 0.9,
  MAX_FLAPS: 4,
  FLAP_COOLDOWN: 0.2,
  YAW_SENS: 0.0021,
  PITCH_SENS: 0.003,
  STICK_YAW: 0.0252,
  STICK_BOOST: 1.7,
  STICK_CLIMB: 11.5,
  STICK_DESCEND: 6.5,
  DESCEND_RESPONSE: 1.7,
  DESCEND_TARGET_RATIO: 0.3,
  DESCEND_TARGET_MIN: 1.9,
  DESCEND_INPUT_PITCH: 0.18,
  DESCEND_POSE_PITCH: 0.05,
  STICK_DEADZONE: 0.12,
  STICK_SCALE: 0.5,
  STICK_RESPONSE: 5.0,
  STICK_RETURN: 3.2,
  STICK_VERTICAL_RELEASE: 12.0,
  DIVE_FORCE: 15,
  DIVE_BONUS: 4,
  DIVE_DECAY: 0.8,
  DIVE_GESTURE: 60,
  SOFT_GROUND_RANGE: 2.4,
  SOFT_GROUND_FORCE: 28,
  SOFT_GROUND_DAMP: 7.5,
  SOFT_GROUND_MIN_ALT: 0.32,
  SOFT_GROUND_LAND_ALT: 0.08,
  NEUTRAL_ALTITUDE: 10.0,
  NEUTRAL_DESCEND_MIN: 0.55,
  NEUTRAL_DESCEND_MAX: 2.1,
  NEUTRAL_RETURN: 1.1,
  NEUTRAL_ASCENT_BRAKE: 3.0,
  CRUISE_BLEND: 4.2,
  VERTICAL_DAMP: 4.6,
  TAKEOFF_UP: 5.2,
  MAX_ASCENT_ANGLE: Math.PI / 4,
  MAX_BODY_PITCH: Math.PI / 9,
  MAX_POSE_NOSE_UP: Math.PI / 36,
  CRUISE_BODY_PITCH: -0.12,
  BODY_PITCH_RESPONSE: 6.0,
  BODY_DESCEND_PITCH_RESPONSE: 1.5,
  CAMERA_DIST: 11,
  CAMERA_HEIGHT: 2.8,
  CAMERA_DIST_SPEED: 0.08,
  CAMERA_SMOOTH: 0.12,
  CAMERA_PITCH_SMOOTH: 3.4,
  CAMERA_DESCEND_PITCH_SMOOTH: 0.85,
  CAMERA_LOOK_DRAG_START: 16,
  CAMERA_LOOK_SIDE_SWITCH: 34,
  CAMERA_LOOK_SIDE_RELEASE: 12,
  CAMERA_LOOK_FOV_SENS: 0.22,
  CAMERA_LOOK_MAX_YAW: Math.PI * 0.58,
  CAMERA_LOOK_MAX_WIDE_FOV: 54,
  CAMERA_LOOK_MAX_TELE_FOV: 30,
  CAMERA_LOOK_RESPONSE: 10.5,
  CAMERA_LOOK_RETURN: 4.4,
  BASE_FOV: 70,
  SPEED_FOV: 7,
  BOOST_FOV: 3.5,
  LOOP_SWIPE_TRIGGER: 58,
  LOOP_SWIPE_HORIZONTAL_TOLERANCE: 52,
  LOOP_DURATION: 5.4,
  LOOP_SPEED_SCALE: 0.35,
  LOOP_RECOVERY_DURATION: 1.8,
  MAX_BANK: 0.9,
  BANK_FROM_TURN: 3.4,
  ROLL_RESPONSE: 4.8,
  PLAYER_GLIDE_RESPONSE: 4.6,
  BOOST_FLASH_DECAY: 3.6,
  SEAGULL_POSE_SCALE: 1.0,
  SEAGULL_POSE_RESPONSE: 4.4,
  SEAGULL_GROUND_PITCH: 0.16,
  SEAGULL_GLIDE_PITCH: -0.07,
  SEAGULL_GROUND_Y: 0.02,
  SEAGULL_GLIDE_Y: -0.02,
  DOUBLE_TAP_WINDOW: 0.32,
  DOUBLE_TAP_DISTANCE: 74,
  TAP_MAX_DURATION: 0.3,
  TAP_MOVE_TOLERANCE: 24,
  SCREW_DURATION: 2.24,
  SCREW_TURNS: 3,
  SCREW_FORWARD_OFFSET: 3.6,
  SCREW_PEAK_AT: 0.28,
  POOP_GRAVITY: 12,
  POOP_LIFETIME: 14
};

const V = {
  ROUTE_GATE_COUNT: 7,
  LARGE_TOWER_COUNT: 7,
  CLIFF_CLUSTER_COUNT: 7,
  CLOUD_LAYER_LOW: 90,
  CLOUD_LAYER_MID: 70,
  CLOUD_LAYER_HIGH: 50,
  CLOUD_VEIL_COUNT: 70,
  NIGHT_FOG_COUNT: 50,
  NIGHT_MIST_COUNT: 600,
  NIGHT_TOWER_COUNT: 90,
  NIGHT_SHRINE_COUNT: 70,
  NIGHT_HALO_COUNT: 30,
  NIGHT_LIGHT_COUNT: 20,
  SANCTUARY_HALO_COUNT: 15,
  SANCTUARY_SPOKE_COUNT: 50,
  BEACON_COUNT: 30,
  SMALL_INSTANCE_COUNT: 210,
  BOOST_TRAIL_COUNT: 7,
  DIVE_STREAK_COUNT: 10,
  SPEED_PARTICLE_COUNT: 16,
  DUST_COUNT: 12
};

const BOOK_MESSAGE_SEED = [
  {
    id: 'seed-1',
    name: 'anonymous',
    message: 'ここまで飛んできた人だけが読める、静かな余白。',
    createdAt: '2026-03-20T07:18:00.000Z'
  },
  {
    id: 'seed-2',
    name: 'night traveler',
    message: '雲に触れた音が消えたあと、この本だけが残っていた。',
    createdAt: '2026-03-20T07:35:00.000Z'
  },
  {
    id: 'seed-3',
    name: 'shore',
    message: '見つけた人は、短いひとことを置いていってください。',
    createdAt: '2026-03-20T07:52:00.000Z'
  }
];

const colorCycleEntries = [];

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function retargetColorCycle(entry, now) {
  const hsl = { h: 0, s: 0, l: 0 };
  entry.from.copy(entry.target);
  entry.base.getHSL(hsl);
  entry.to.setHSL(
    Math.random(),
    THREE.MathUtils.clamp(Math.max(hsl.s, 0.28) + randomRange(0.04, entry.satRange + 0.22), 0.25, 0.88),
    THREE.MathUtils.clamp((hsl.l < 0.18 ? 0.28 : hsl.l) + randomRange(-entry.lightRange, entry.lightRange), 0.18, 0.82)
  );
  entry.start = now;
}

function registerColorCycle(targetColor, hueRange = 0.18, satRange = 0.05, lightRange = 0.04) {
  const now = performance.now();
  const entry = {
    target: targetColor,
    base: targetColor.clone(),
    from: targetColor.clone(),
    to: targetColor.clone(),
    hueRange,
    satRange,
    lightRange,
    start: now
  };
  retargetColorCycle(entry, now);
  colorCycleEntries.push(entry);
}

function registerMaterialCycle(material, includeEmissive = false, hueRange = 0.18, satRange = 0.05, lightRange = 0.04) {
  if (material.color) registerColorCycle(material.color, hueRange, satRange, lightRange);
  if (includeEmissive && material.emissive) registerColorCycle(material.emissive, hueRange * 0.7, satRange * 0.4, lightRange * 0.4);
}

function updateColorCycle(dt) {
  if (!colorCycleEntries.length || !Number.isFinite(dt) || dt <= 0) return;
  colorCyclePerfState.accumulator += dt;
  if (colorCyclePerfState.accumulator < COLOR_CYCLE_INTERVAL) return;
  colorCyclePerfState.accumulator = Math.max(0, colorCyclePerfState.accumulator - COLOR_CYCLE_INTERVAL);
  const now = performance.now();
  for (const entry of colorCycleEntries) {
    const t = Math.min(1, (now - entry.start) / 15000);
    entry.target.copy(entry.from).lerp(entry.to, t);
    if (t >= 1) retargetColorCycle(entry, now);
  }
}

const ambientLight = new THREE.AmbientLight(0x5c6e89, 0.14);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff0c2, 1.55);
sunLight.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
sunLight.target.position.set(0, 0, 0);
scene.add(sunLight);
scene.add(sunLight.target);

const nightFill = new THREE.DirectionalLight(0x16304f, 0.08);
nightFill.position.copy(SUN_DIRECTION).multiplyScalar(-SUN_DISTANCE * 0.8);
nightFill.target.position.set(0, 0, 0);
scene.add(nightFill);
scene.add(nightFill.target);

function terrainHeightFromDir(direction) {
  const ridge = Math.sin(direction.x * 7.0 + direction.z * 3.4) * 1.5;
  const swell = Math.cos(direction.y * 8.6 - direction.x * 2.4) * 1.0;
  const twist = Math.sin((direction.x - direction.z) * 10.0 + direction.y * 4.2) * 0.55;
  return ridge + swell + twist;
}

function getSurfaceRadius(direction) {
  return PLANET_RADIUS + terrainHeightFromDir(direction);
}

function getAltitude(position) {
  const up = position.clone().normalize();
  return position.length() - getSurfaceRadius(up) - PLAYER_CLEARANCE;
}

function applyDeadzone(value, deadzone) {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  return Math.sign(value) * ((abs - deadzone) / (1 - deadzone));
}

function createBasisQuaternion(forward, up) {
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const localUp = new THREE.Vector3().crossVectors(forward, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, localUp, forward);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

const basisRightScratch = new THREE.Vector3();
const basisLocalUpScratch = new THREE.Vector3();
const basisMatrixScratch = new THREE.Matrix4();
function writeBasisQuaternion(target, forward, up) {
  basisRightScratch.crossVectors(up, forward).normalize();
  basisLocalUpScratch.crossVectors(forward, basisRightScratch).normalize();
  basisMatrixScratch.makeBasis(basisRightScratch, basisLocalUpScratch, forward);
  return target.setFromRotationMatrix(basisMatrixScratch);
}

function getSurfaceAxes(direction) {
  const up = direction.clone().normalize();
  const axisA = new THREE.Vector3()
    .crossVectors(Math.abs(up.y) > 0.96 ? new THREE.Vector3(1, 0, 0) : WORLD_UP, up)
    .normalize();
  const axisB = new THREE.Vector3().crossVectors(up, axisA).normalize();
  return { up, axisA, axisB };
}

function alignObjectToSphere(object, direction, altitude, spin = 0) {
  const up = direction.clone().normalize();
  const tangent = new THREE.Vector3().crossVectors(WORLD_UP, up);
  if (tangent.lengthSq() < 0.0001) tangent.set(1, 0, 0);
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const basis = new THREE.Matrix4().makeBasis(tangent, up, bitangent);
  object.position.copy(up).multiplyScalar(getSurfaceRadius(up) + altitude);
  object.quaternion.setFromRotationMatrix(basis);
  object.rotateY(spin);
}

function placeDirectedOnSphere(object, direction, forward, altitude, roll = 0) {
  const up = direction.clone().normalize();
  const tangentForward = forward.clone().addScaledVector(up, -forward.dot(up)).normalize();
  object.position.copy(up).multiplyScalar(getSurfaceRadius(up) + altitude);
  object.quaternion.copy(createBasisQuaternion(tangentForward, up));
  object.rotateZ(roll);
}

function createGiantBookLandmark() {
  const group = new THREE.Group();
  const coverMat = new THREE.MeshLambertMaterial({
    color: 0x4f2b43,
    emissive: 0x1f0f16,
    emissiveIntensity: 0.1,
    flatShading: true
  });
  const pageMat = new THREE.MeshLambertMaterial({
    color: 0xf0e2c4,
    emissive: 0x372a18,
    emissiveIntensity: 0.07,
    flatShading: true
  });
  const edgeMat = new THREE.MeshLambertMaterial({
    color: 0xd6bf98,
    emissive: 0x261b0f,
    emissiveIntensity: 0.05,
    flatShading: true
  });
  const bookPivot = new THREE.Group();
  bookPivot.position.y = 2.45;
  bookPivot.rotation.z = -0.68;
  bookPivot.rotation.x = -0.22;
  bookPivot.rotation.y = 0.08;
  group.add(bookPivot);

  const pageCore = new THREE.Mesh(new THREE.BoxGeometry(9.6, 13.8, 3.12), pageMat);
  pageCore.position.set(0.06, 0.08, 0);
  bookPivot.add(pageCore);

  const pageArchTop = new THREE.Mesh(new THREE.BoxGeometry(9.0, 6.4, 1.08), pageMat);
  pageArchTop.position.set(0.62, 2.78, 0.7);
  pageArchTop.rotation.y = -0.16;
  pageArchTop.rotation.z = 0.04;
  bookPivot.add(pageArchTop);

  const pageArchBottom = new THREE.Mesh(new THREE.BoxGeometry(8.8, 5.8, 1.02), pageMat);
  pageArchBottom.position.set(0.58, -2.48, -0.62);
  pageArchBottom.rotation.y = 0.14;
  pageArchBottom.rotation.z = -0.03;
  bookPivot.add(pageArchBottom);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.92, 14.5, 2.72), coverMat);
  spine.position.set(-4.7, -0.04, 0);
  bookPivot.add(spine);

  const backCover = new THREE.Mesh(new THREE.BoxGeometry(9.82, 14.72, 0.7), coverMat);
  backCover.position.set(0.08, -0.02, -1.98);
  backCover.rotation.y = 0.12;
  backCover.rotation.z = 0.02;
  bookPivot.add(backCover);

  const frontCover = new THREE.Mesh(new THREE.BoxGeometry(9.76, 14.64, 0.7), coverMat);
  frontCover.position.set(0.18, -0.08, 2.04);
  frontCover.rotation.y = -0.18;
  frontCover.rotation.z = -0.02;
  bookPivot.add(frontCover);

  const pageSplitLeft = new THREE.Mesh(new THREE.BoxGeometry(4.24, 12.9, 1.2), pageMat);
  pageSplitLeft.position.set(-1.12, 0.22, -0.7);
  pageSplitLeft.rotation.y = 0.11;
  bookPivot.add(pageSplitLeft);

  const pageSplitRight = new THREE.Mesh(new THREE.BoxGeometry(4.12, 12.7, 1.12), pageMat);
  pageSplitRight.position.set(1.68, -0.12, 0.56);
  pageSplitRight.rotation.y = -0.14;
  bookPivot.add(pageSplitRight);

  const foreEdge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 12.2, 2.86), edgeMat);
  foreEdge.position.set(4.44, -0.02, 0);
  bookPivot.add(foreEdge);

  const topEdge = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.24, 2.92), edgeMat);
  topEdge.position.set(0.38, 6.82, 0);
  bookPivot.add(topEdge);

  const bottomEdge = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.24, 2.9), edgeMat);
  bottomEdge.position.set(0.34, -6.72, 0);
  bookPivot.add(bottomEdge);

  const pageEdge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 11.4, 2.62), edgeMat);
  pageEdge.position.set(4.66, 0.02, 0.08);
  bookPivot.add(pageEdge);

  return group;
}

function createBlackBoxLandmark() {
  const group = new THREE.Group();
  const cubeMat = new THREE.MeshLambertMaterial({
    color: 0x050505,
    emissive: 0x151515,
    emissiveIntensity: 0.12,
    flatShading: true
  });
  const innerMat = new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: 0x090909,
    emissiveIntensity: 0.08,
    flatShading: true
  });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.9), cubeMat);
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.46, 1.46, 1.46), innerMat);
  group.add(shell, core);
  return group;
}

function createDayBlocksLandmark(dayBlocksMat) {
  const dayBlocks = new THREE.Group();
  const dayBlockGeo = new THREE.BoxGeometry(2.8, 11.5, 5.2);
  const dayBlockRows = 4;
  const dayBlockCols = 5;
  const dayBlockSpacingX = 5.9;
  const dayBlockSpacingZ = 8.6;
  for (let row = 0; row < dayBlockRows; row++) {
    for (let col = 0; col < dayBlockCols; col++) {
      const block = new THREE.Mesh(dayBlockGeo, dayBlocksMat);
      block.position.set(
        (col - (dayBlockCols - 1) * 0.5) * dayBlockSpacingX,
        5.75,
        (row - (dayBlockRows - 1) * 0.5) * dayBlockSpacingZ
      );
      dayBlocks.add(block);
    }
  }
  const dayBlocksBase = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.8, 42),
    new THREE.MeshLambertMaterial({ color: 0x9cc6ff, flatShading: true, transparent: true, opacity: 0.35 })
  );
  dayBlocksBase.position.y = 0.2;
  dayBlocks.add(dayBlocksBase);
  return dayBlocks;
}

function createGiantRecordPlayerLandmark() {
  const group = new THREE.Group();
  const plinthMat = new THREE.MeshLambertMaterial({
    color: 0xc79a67,
    emissive: 0x2a1709,
    emissiveIntensity: 0.16,
    flatShading: true
  });
  const metalMat = new THREE.MeshLambertMaterial({
    color: 0xd5dde8,
    emissive: 0x1a2330,
    emissiveIntensity: 0.1,
    flatShading: true
  });
  const vinylMat = new THREE.MeshLambertMaterial({
    color: 0x121212,
    emissive: 0x040404,
    emissiveIntensity: 0.12,
    flatShading: true
  });
  const labelMat = new THREE.MeshBasicMaterial({
    color: 0xf0dfab,
    toneMapped: false
  });
  const accentMat = new THREE.MeshBasicMaterial({
    color: 0xffd286,
    toneMapped: false
  });
  const grooveMat = new THREE.MeshBasicMaterial({
    color: 0x1f1f1f,
    toneMapped: false
  });
  const grooveHighlightMat = new THREE.MeshBasicMaterial({
    color: 0x3a3a3a,
    toneMapped: false
  });
  const cartridgeMat = new THREE.MeshLambertMaterial({
    color: 0xf2efe8,
    emissive: 0x3a3124,
    emissiveIntensity: 0.08,
    flatShading: true
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(44, 4.2, 34), plinthMat);
  plinth.position.y = 2.1;
  group.add(plinth);

  const platter = new THREE.Group();
  platter.position.set(-6.2, 4.5, -1.2);

  const platterBase = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.6, 1.8, 32), metalMat);
  platterBase.position.y = -0.25;
  platter.add(platterBase);

  const platterTop = new THREE.Mesh(new THREE.CylinderGeometry(12.7, 12.7, 0.8, 36), metalMat);
  platterTop.position.y = 0.85;
  platter.add(platterTop);

  const platterLip = new THREE.Mesh(new THREE.TorusGeometry(12.55, 0.22, 8, 56), accentMat);
  platterLip.rotation.x = Math.PI * 0.5;
  platterLip.position.y = 1.25;
  platter.add(platterLip);
  group.add(platter);

  const recordDisc = new THREE.Group();
  recordDisc.position.set(-6.2, 5.92, -1.2);

  const recordBody = new THREE.Mesh(new THREE.CylinderGeometry(11.16, 11.16, 0.34, 48), vinylMat);
  recordDisc.add(recordBody);

  const recordTop = new THREE.Mesh(new THREE.CylinderGeometry(10.94, 10.94, 0.18, 48), vinylMat);
  recordTop.position.y = 0.15;
  recordDisc.add(recordTop);

  const recordEdgeHighlight = new THREE.Mesh(new THREE.TorusGeometry(11.02, 0.06, 5, 60), grooveHighlightMat);
  recordEdgeHighlight.rotation.x = Math.PI * 0.5;
  recordEdgeHighlight.position.y = 0.17;
  recordDisc.add(recordEdgeHighlight);

  const label = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.06, 0.22, 24), labelMat);
  label.position.y = 0.19;
  recordDisc.add(label);

  const labelInner = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.24, 20), accentMat);
  labelInner.position.y = 0.22;
  recordDisc.add(labelInner);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 10), accentMat);
  spindle.position.y = 0.96;
  recordDisc.add(spindle);
  group.add(recordDisc);

  const recordGroove = new THREE.Group();
  recordGroove.position.set(0, 0.22, 0);
  for (let i = 0; i < 5; i++) {
    const groove = new THREE.Mesh(
      new THREE.TorusGeometry(4.8 + i * 1.18, 0.065 + i * 0.006, 4, 54),
      i === 4 ? grooveHighlightMat : grooveMat
    );
    groove.rotation.x = Math.PI * 0.5;
    groove.position.y = i * 0.005;
    recordGroove.add(groove);
  }
  recordDisc.add(recordGroove);

  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.5, 2.9, 16), metalMat);
  armBase.position.set(12.8, 5.35, 5.7);
  group.add(armBase);

  const armPivot = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.88, 2.2, 14), metalMat);
  armPivot.position.set(12.8, 6.7, 5.7);
  group.add(armPivot);

  const armRig = new THREE.Group();
  armRig.position.set(12.8, 7.1, 5.7);
  armRig.rotation.y = -0.24;
  group.add(armRig);

  const rearStub = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.46, 0.46), metalMat);
  rearStub.position.set(1.65, 0, 0.05);
  armRig.add(rearStub);

  const counterWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 1.7, 14), plinthMat);
  counterWeight.rotation.z = Math.PI * 0.5;
  counterWeight.position.set(3.15, 0, 0.05);
  armRig.add(counterWeight);

  const mainArm = new THREE.Group();
  mainArm.position.set(-7.15, 0.14, -0.62);
  mainArm.rotation.y = 0.1;
  armRig.add(mainArm);

  const mainArmBeam = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.3, 0.3), metalMat);
  mainArmBeam.position.set(0, 0, 0);
  mainArm.add(mainArmBeam);

  const headShellStem = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.22), metalMat);
  headShellStem.position.set(-6.55, -0.02, 0);
  headShellStem.rotation.y = -0.03;
  mainArm.add(headShellStem);

  const headShell = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.22, 1.02), metalMat);
  headShell.position.set(-8.28, -0.05, 0);
  headShell.rotation.y = -0.08;
  mainArm.add(headShell);

  const cartridgeMount = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.28), metalMat);
  cartridgeMount.position.set(-9.28, -0.24, 0);
  cartridgeMount.rotation.y = -0.08;
  mainArm.add(cartridgeMount);

  const cartridge = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.72, 0.86), cartridgeMat);
  cartridge.position.set(-9.56, -0.56, 0);
  cartridge.rotation.y = -0.08;
  mainArm.add(cartridge);

  const stylus = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), accentMat);
  stylus.position.set(-9.88, -1.02, 0);
  stylus.rotation.y = -0.08;
  stylus.rotation.z = 0.1;
  mainArm.add(stylus);

  const armRest = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.1, 10), metalMat);
  armRest.position.set(-0.58, -0.28, 1.22);
  armRig.add(armRest);

  const armClip = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.07, 5, 18), accentMat);
  armClip.rotation.x = Math.PI * 0.5;
  armClip.position.set(-0.58, 0.55, 1.22);
  armRig.add(armClip);

  const controlPlate = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.46, 6.4), metalMat);
  controlPlate.position.set(11.8, 4.55, -9.6);
  group.add(controlPlate);

  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.64, 14), accentMat);
    knob.position.set(8.4 + i * 2.5, 5.1, -9.8);
    group.add(knob);
  }

  for (let i = 0; i < 4; i++) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.26, 1.3, 12), metalMat);
    foot.position.set(i < 2 ? -15.5 : 15.5, 0.65, i % 2 === 0 ? -11.4 : 11.4);
    group.add(foot);
  }

  group.userData.recordDisc = recordDisc;
  group.userData.recordGroove = recordGroove;
  return group;
}

function createIsoscelesPrismGeometry(apexAngleDeg, depth, height) {
  const halfBase = Math.tan(THREE.MathUtils.degToRad(apexAngleDeg * 0.5)) * depth;
  const apex = [0, 0, depth * 0.5];
  const baseLeft = [-halfBase, 0, -depth * 0.5];
  const baseRight = [halfBase, 0, -depth * 0.5];
  const apexTop = [0, height, depth * 0.5];
  const baseLeftTop = [-halfBase, height, -depth * 0.5];
  const baseRightTop = [halfBase, height, -depth * 0.5];
  const positions = [];

  const pushTriangle = (a, b, c) => {
    positions.push(...a, ...b, ...c);
  };

  pushTriangle(apex, baseRight, baseLeft);
  pushTriangle(apexTop, baseLeftTop, baseRightTop);

  pushTriangle(apex, baseLeft, baseLeftTop);
  pushTriangle(apex, baseLeftTop, apexTop);

  pushTriangle(baseLeft, baseRight, baseRightTop);
  pushTriangle(baseLeft, baseRightTop, baseLeftTop);

  pushTriangle(baseRight, apex, apexTop);
  pushTriangle(baseRight, apexTop, baseRightTop);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createDuskTowerLandmark() {
  const group = new THREE.Group();
  const needleDarkMat = new THREE.MeshBasicMaterial({
    color: 0x0a0d12,
    toneMapped: false,
    fog: false
  });
  const needleLightMat = new THREE.MeshBasicMaterial({
    color: 0xf3f7ff,
    toneMapped: false,
    fog: false
  });

  const rotor = new THREE.Group();
  group.add(rotor);

  const northNeedle = new THREE.Mesh(
    new THREE.ConeGeometry(1.64, 16.8, 4),
    needleLightMat
  );
  northNeedle.position.z = 7.6;
  northNeedle.rotation.x = Math.PI * 0.5;
  rotor.add(northNeedle);

  const southNeedle = new THREE.Mesh(
    new THREE.ConeGeometry(1.64, 16.8, 4),
    needleDarkMat
  );
  southNeedle.position.z = -7.6;
  southNeedle.rotation.x = -Math.PI * 0.5;
  rotor.add(southNeedle);

  group.userData.rotor = rotor;

  return group;
}

function createMonochromeSphereLandmark(radius, color) {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    fog: false
  });
  const sphereGeo = new THREE.SphereGeometry(radius, 18, 12);
  const sphere = new THREE.Mesh(sphereGeo, shellMat);
  group.add(sphere);

  return group;
}

function createEarthTexture(size = 768) {
  const earthCanvas = document.createElement('canvas');
  earthCanvas.width = size;
  earthCanvas.height = size;
  const ctx = earthCanvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(earthCanvas);

  const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
  const smoothstep01 = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const viewDir = new THREE.Vector3(0, 0, 1);
  const lightDir = new THREE.Vector3(-0.42, -0.26, 0.87).normalize();
  const reflectDir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const textureData = ctx.createImageData(size, size);
  const data = textureData.data;

  for (let y = 0; y < size; y++) {
    const v = ((y + 0.5) / size) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const rr = u * u + v * v;
      const i = (y * size + x) * 4;

      if (rr > 1) {
        data[i + 3] = 0;
        continue;
      }

      const z = Math.sqrt(1 - rr);
      normal.set(u, -v, z).normalize();
      const lon = Math.atan2(normal.x, normal.z);
      const lat = Math.asin(normal.y);

      const terrainNoise =
        Math.sin(lon * 2.8 + lat * 3.7)
        + Math.sin(lon * 5.4 - lat * 2.3) * 0.58
        + Math.cos((normal.x * 4.8) + (normal.y * 7.6) - (normal.z * 3.1)) * 0.52
        + Math.sin((normal.x - normal.z) * 8.9 + normal.y * 4.7) * 0.28;
      const ridgeNoise =
        Math.cos(lon * 10.5 + lat * 5.7) * 0.22
        + Math.sin((normal.x + normal.y) * 13.1 - normal.z * 6.4) * 0.18;
      const humidityNoise =
        Math.sin(lon * 4.2 - lat * 6.1)
        + Math.cos((normal.x * 5.7) - (normal.z * 4.8) + (normal.y * 2.2)) * 0.42;
      const polarMask = smoothstep01(0.58, 0.92, Math.abs(normal.y));
      const landField = terrainNoise * 0.5 + ridgeNoise * 0.5 + polarMask * 0.14;
      const landMask = smoothstep01(0.08, 0.23, landField);
      const elevation = smoothstep01(0.18, 0.9, landField + ridgeNoise * 0.8);

      const light = clamp01(normal.dot(lightDir) * 0.88 + 0.18);
      const shadow = Math.pow(light, 0.82);
      const rim = Math.pow(1 - z, 2.7);
      const waterBand = smoothstep01(-1, 1, Math.sin(lon * 2.4 + normal.y * 5.1));
      const warmCurrent = smoothstep01(-1, 1, Math.cos((lon - lat) * 3.4));

      let r = mix(9, 36, waterBand);
      let g = mix(28, 102, warmCurrent);
      let b = mix(72, 192, waterBand * 0.6 + 0.2);

      const specularBase = Math.max(0, reflectDir.copy(normal).multiplyScalar(2 * normal.dot(lightDir)).sub(lightDir).dot(viewDir));
      const specular = Math.pow(specularBase, 22) * (1 - landMask) * 0.9;

      const vegetation = smoothstep01(-0.5, 0.85, humidityNoise);
      const desertMask = smoothstep01(0.18, 0.72, 1 - vegetation) * (1 - polarMask * 0.85);
      const mountainMask = smoothstep01(0.42, 0.92, elevation);

      if (landMask > 0.001) {
        const lushR = mix(38, 72, vegetation);
        const lushG = mix(74, 128, vegetation);
        const lushB = mix(28, 64, vegetation);
        const desertR = mix(118, 176, desertMask);
        const desertG = mix(104, 154, desertMask);
        const desertB = mix(72, 108, desertMask);
        r = mix(lushR, desertR, desertMask);
        g = mix(lushG, desertG, desertMask * 0.92);
        b = mix(lushB, desertB, desertMask * 0.82);

        const mountainLift = mountainMask * 92;
        r += mountainLift;
        g += mountainLift * 0.88;
        b += mountainLift * 0.8;

        if (polarMask > 0.12) {
          const ice = smoothstep01(0.18, 0.8, polarMask + elevation * 0.3);
          r = mix(r, 236, ice);
          g = mix(g, 243, ice);
          b = mix(b, 248, ice);
        }
      }

      const cloudNoise =
        Math.sin(lon * 8.2 + lat * 13.4) * 0.32
        + Math.cos(lon * 12.8 - lat * 7.1) * 0.28
        + Math.sin((normal.x * 18.4) + (normal.y * 21.6) - (normal.z * 9.2)) * 0.2
        + Math.cos((normal.x - normal.z) * 16.5 + normal.y * 14.1) * 0.2;
      const cloudMask = smoothstep01(0.32, 0.74, cloudNoise + rim * 0.22);

      r *= 0.58 + shadow * 0.62;
      g *= 0.58 + shadow * 0.64;
      b *= 0.62 + shadow * 0.66;

      r += specular * 165;
      g += specular * 176;
      b += specular * 190;

      r = mix(r, 244, cloudMask * 0.46);
      g = mix(g, 248, cloudMask * 0.48);
      b = mix(b, 252, cloudMask * 0.5);

      const atmosphere = Math.pow(rim, 0.6);
      r = mix(r, 118, atmosphere * 0.36);
      g = mix(g, 181, atmosphere * 0.42);
      b = mix(b, 255, atmosphere * 0.66);

      data[i] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
      data[i + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
      data[i + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(textureData, 0, 0);
  const texture = new THREE.CanvasTexture(earthCanvas);
  if ('colorSpace' in texture && 'SRGBColorSpace' in THREE) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in texture && 'sRGBEncoding' in THREE) {
    texture.encoding = THREE.sRGBEncoding;
  }
  if ('anisotropy' in texture && renderer?.capabilities) {
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const earthPhoto = new Image();
  earthPhoto.decoding = 'async';
  earthPhoto.onload = () => {
    const center = size * 0.5;
    const photoCropSize = Math.min(earthPhoto.width, earthPhoto.height) * 0.92;
    const sx = (earthPhoto.width - photoCropSize) * 0.5;
    const sy = (earthPhoto.height - photoCropSize) * 0.49;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, size * 0.496, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(earthPhoto, sx, sy, photoCropSize, photoCropSize, 0, 0, size, size);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const alphaMask = ctx.createRadialGradient(center, center, size * 0.43, center, center, size * 0.5);
    alphaMask.addColorStop(0, 'rgba(255,255,255,1)');
    alphaMask.addColorStop(0.95, 'rgba(255,255,255,1)');
    alphaMask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = alphaMask;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    texture.needsUpdate = true;
  };
  earthPhoto.src = './earth.jpg';
  texture.needsUpdate = true;
  return texture;
}

function createEarthReturnBillboard() {
  const earthTexture = createEarthTexture();
  const spriteMat = new THREE.SpriteMaterial({
    map: earthTexture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false
  });
  spriteMat.toneMapped = false;

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext('2d');
  if (glowCtx) {
    const glowGrad = glowCtx.createRadialGradient(128, 128, 26, 128, 128, 128);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
    glowGrad.addColorStop(0.35, 'rgba(120,180,255,0.28)');
    glowGrad.addColorStop(1, 'rgba(120,180,255,0)');
    glowCtx.fillStyle = glowGrad;
    glowCtx.fillRect(0, 0, 256, 256);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fog: false
  });
  glowMat.toneMapped = false;

  const earth = new THREE.Sprite(spriteMat);
  earth.scale.setScalar(EARTH_RETURN_SIZE);
  earth.visible = false;
  earth.renderOrder = 0;
  earth.frustumCulled = false;

  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(EARTH_RETURN_GLOW_SIZE);
  glow.visible = false;
  glow.renderOrder = 0;
  glow.frustumCulled = false;

  return { earth, glow };
}

const THEME_TRIGGER_BUCKET_SIZE = 72;
const themeTriggerZones = [];
const staticThemeTriggerBuckets = new Map();
const dynamicThemeTriggerZones = [];
const themeBoundsBox = new THREE.Box3();
const themeBoundsSphere = new THREE.Sphere();
const themeSegment = new THREE.Vector3();
const themeOffset = new THREE.Vector3();
const themeClosestPoint = new THREE.Vector3();
const themeZoneCenter = new THREE.Vector3();
const themeSegmentMidpoint = new THREE.Vector3();
const themeProjected = new THREE.Vector3();
const themeFlashScreen = new THREE.Vector2();
const themeCandidateZones = [];
const defaultClearColor = new THREE.Color(0x0a0d12);
const spaceClearColor = new THREE.Color(0x000000);
const blendedClearColor = new THREE.Color();
const monochromeSphereWorld = new THREE.Vector3();
const activeSunDirection = new THREE.Vector3();
const sanctuaryTriggerWorld = new THREE.Vector3();
const sanctuaryRingTriggerWorld = new THREE.Vector3();
const sanctuaryBoundsTriggerLocalCenter = new THREE.Vector3();
let sanctuaryBoundsTriggerRadius = SANCTUARY_RING_TRIGGER_RADIUS;
const sanctuaryBeamBaseWorld = new THREE.Vector3();
const sanctuaryBeamTopWorld = new THREE.Vector3();
const sanctuaryBeamDirectionWorld = new THREE.Vector3();
const beamClosestPointWorld = new THREE.Vector3();
const fallbackSpaceAxis = new THREE.Vector3(1, 0, 0);
const spaceLocalForward = new THREE.Vector3(0, 0, 1);
const beamRelativeWorld = new THREE.Vector3();
const spaceUpCandidate = new THREE.Vector3();
const spaceForwardProjected = new THREE.Vector3();
const earthWorldPosition = new THREE.Vector3();
const earthGuideDirection = new THREE.Vector3();
const earthGuideProjected = new THREE.Vector3();
const compassTargetLocal = new THREE.Vector3();
const compassTargetProjected = new THREE.Vector3();
const compassAssistProjected = new THREE.Vector3();
const previousFramePlayerPos = new THREE.Vector3();
const catDesiredPosition = new THREE.Vector3();
const catMountForward = new THREE.Vector3();
const catMountUp = new THREE.Vector3();
const catTargetQuaternion = new THREE.Quaternion();
const updatePlayerPrevForwardScratch = new THREE.Vector3();
const updatePlayerUpScratch = new THREE.Vector3();
const updatePlayerRightScratch = new THREE.Vector3();
const updatePlayerNextUpScratch = new THREE.Vector3();
const updatePlayerCrossScratch = new THREE.Vector3();
const updatePlayerFlightForwardScratch = new THREE.Vector3();
const updatePlayerVisualPosScratch = new THREE.Vector3();
const updatePlayerShadowDirectionScratch = new THREE.Vector3();
const updatePlayerLoopCenterScratch = new THREE.Vector3();
const updatePlayerLoopForwardScratch = new THREE.Vector3();
const updatePlayerLoopBodyUpScratch = new THREE.Vector3();
const updatePlayerRecoveryForwardScratch = new THREE.Vector3();
const updatePlayerRecoveryUpScratch = new THREE.Vector3();
const updatePlayerLookQuatScratch = new THREE.Quaternion();
const updatePlayerRollQuatScratch = new THREE.Quaternion();
const updateSpeedEffectsRightScratch = new THREE.Vector3();
const updateSpeedEffectsForwardQuatScratch = new THREE.Quaternion();
const updateCameraGroundUpScratch = new THREE.Vector3();
const updateCameraForwardScratch = new THREE.Vector3();
const updateCameraRightScratch = new THREE.Vector3();
const updateCameraHeadBaseScratch = new THREE.Vector3();
const updateCameraGroundTargetScratch = new THREE.Vector3();
const updateCameraOrbitOffsetScratch = new THREE.Vector3();
const updateCameraGroundDesiredScratch = new THREE.Vector3();
const updateCameraDesiredScratch = new THREE.Vector3();
const updateCameraTargetScratch = new THREE.Vector3();
const updateCameraUpScratch = new THREE.Vector3();
const updateCameraSpaceUpScratch = new THREE.Vector3();
const updateCameraSpaceForwardScratch = new THREE.Vector3();
const updateCameraSpaceTargetScratch = new THREE.Vector3();
const updateCameraSpaceDesiredScratch = new THREE.Vector3();
const cloudDriftAxisScratch = new THREE.Vector3();
const compassTargetDirectionScratch = new THREE.Vector3();
const compassAssistTargetScratch = new THREE.Vector3();
const duskTowerInverseQuatScratch = new THREE.Quaternion();
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
let maxStaticThemeTriggerRadius = 0;
const spaceStarsGeometry = new THREE.BufferGeometry();
const spaceStarPositions = new Float32Array(SPACE_STAR_COUNT * 3);
const spaceStarDrift = new Float32Array(SPACE_STAR_COUNT);
const spaceAsteroidField = new THREE.Group();
const spaceAsteroids = [];

function createSpaceStarSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(250,253,255,0.98)');
  gradient.addColorStop(0.48, 'rgba(224,234,255,0.68)');
  gradient.addColorStop(0.72, 'rgba(188,206,255,0.22)');
  gradient.addColorStop(1, 'rgba(188,206,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSpaceAsteroidGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const stretchX = 0.82 + Math.random() * 0.45;
  const stretchY = 0.74 + Math.random() * 0.55;
  const stretchZ = 0.78 + Math.random() * 0.5;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wobble = 0.78 + Math.random() * 0.44;
    position.setXYZ(i, x * stretchX * wobble, y * stretchY * wobble, z * stretchZ * wobble);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function resetSpaceStar(index, z = null) {
  const radius = Math.sqrt(Math.random()) * SPACE_STAR_RADIUS;
  const angle = Math.random() * Math.PI * 2;
  const zPos = z ?? THREE.MathUtils.randFloat(-SPACE_STAR_DEPTH * 0.45, SPACE_STAR_DEPTH * 0.5);
  const i3 = index * 3;
  spaceStarPositions[i3] = Math.cos(angle) * radius;
  spaceStarPositions[i3 + 1] = Math.sin(angle) * radius * 0.7;
  spaceStarPositions[i3 + 2] = zPos;
  spaceStarDrift[index] = 0.7 + Math.random() * 0.52;
}

function resetSpaceAsteroid(mesh, z = null) {
  const radius = THREE.MathUtils.lerp(42, SPACE_ASTEROID_RADIUS, Math.random());
  const angle = Math.random() * Math.PI * 2;
  const zPos = z ?? THREE.MathUtils.randFloat(220, SPACE_ASTEROID_DEPTH * 0.5);
  const size = THREE.MathUtils.lerp(2.4, 8.6, Math.random());

  mesh.position.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.58 + THREE.MathUtils.randFloatSpread(20),
    zPos
  );
  mesh.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  mesh.scale.set(
    size * THREE.MathUtils.lerp(0.72, 1.28, Math.random()),
    size * THREE.MathUtils.lerp(0.76, 1.34, Math.random()),
    size * THREE.MathUtils.lerp(0.72, 1.22, Math.random())
  );
  mesh.userData.drift = 0.24 + Math.random() * 0.46;
  mesh.userData.spin.set(
    THREE.MathUtils.randFloatSpread(1.1),
    THREE.MathUtils.randFloatSpread(1.1),
    THREE.MathUtils.randFloatSpread(1.1)
  );
  mesh.userData.opacity = THREE.MathUtils.lerp(0.26, 0.72, Math.random());
}

for (let i = 0; i < SPACE_STAR_COUNT; i++) {
  resetSpaceStar(i);
}
spaceStarsGeometry.setAttribute('position', new THREE.BufferAttribute(spaceStarPositions, 3));
for (let i = 0; i < SPACE_ASTEROID_COUNT; i++) {
  const asteroid = new THREE.Mesh(
    createSpaceAsteroidGeometry(),
    new THREE.MeshLambertMaterial({
      color: 0x8b94a3,
      emissive: 0x11161d,
      emissiveIntensity: 0.18,
      flatShading: true,
      transparent: true,
      opacity: 0.42,
      fog: false
    })
  );
  asteroid.userData.spin = new THREE.Vector3();
  resetSpaceAsteroid(asteroid);
  asteroid.visible = false;
  spaceAsteroids.push(asteroid);
  spaceAsteroidField.add(asteroid);
}

function getThemeTriggerBucketCoord(value) {
  return Math.floor(value / THEME_TRIGGER_BUCKET_SIZE);
}

function getThemeTriggerBucketKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addThemeTriggerZoneToBuckets(zone) {
  const x = getThemeTriggerBucketCoord(zone.worldCenter.x);
  const y = getThemeTriggerBucketCoord(zone.worldCenter.y);
  const z = getThemeTriggerBucketCoord(zone.worldCenter.z);
  const key = getThemeTriggerBucketKey(x, y, z);
  const bucket = staticThemeTriggerBuckets.get(key);
  if (bucket) {
    bucket.push(zone);
  } else {
    staticThemeTriggerBuckets.set(key, [zone]);
  }
  maxStaticThemeTriggerRadius = Math.max(maxStaticThemeTriggerRadius, zone.radius);
}

function collectThemeCandidateZones(center, paddingRadius, target, tag = null) {
  target.length = 0;
  const minX = getThemeTriggerBucketCoord(center.x - paddingRadius);
  const maxX = getThemeTriggerBucketCoord(center.x + paddingRadius);
  const minY = getThemeTriggerBucketCoord(center.y - paddingRadius);
  const maxY = getThemeTriggerBucketCoord(center.y + paddingRadius);
  const minZ = getThemeTriggerBucketCoord(center.z - paddingRadius);
  const maxZ = getThemeTriggerBucketCoord(center.z + paddingRadius);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const bucket = staticThemeTriggerBuckets.get(getThemeTriggerBucketKey(x, y, z));
        if (!bucket) continue;
        for (const zone of bucket) {
          if (tag !== null && zone.tag !== tag) continue;
          target.push(zone);
        }
      }
    }
  }

  for (const zone of dynamicThemeTriggerZones) {
    if (tag !== null && zone.tag !== tag) continue;
    target.push(zone);
  }
  return target;
}

function registerThemeTriggerFromObject(object, radiusScale = 0.82, minRadius = 1.7, extra = {}) {
  object.updateMatrixWorld(true);
  themeBoundsBox.setFromObject(object);
  if (themeBoundsBox.isEmpty()) return;
  themeBoundsBox.getBoundingSphere(themeBoundsSphere);
  if (!Number.isFinite(themeBoundsSphere.radius) || themeBoundsSphere.radius <= 0) return;
  const dynamic = !!extra.dynamic;
  const localCenter = object.worldToLocal(themeBoundsSphere.center.clone());
  const zone = {
    object,
    localCenter,
    worldCenter: themeBoundsSphere.center.clone(),
    dynamic,
    radius: Math.max(minRadius, themeBoundsSphere.radius * radiusScale),
    onTrigger: typeof extra.onTrigger === 'function' ? extra.onTrigger : null,
    canTrigger: typeof extra.canTrigger === 'function' ? extra.canTrigger : null,
    tag: extra.tag ?? null,
    themeMode: extra.themeMode ?? null
  };
  themeTriggerZones.push(zone);
  if (dynamic) {
    dynamicThemeTriggerZones.push(zone);
  } else {
    addThemeTriggerZoneToBuckets(zone);
  }
  return zone;
}

function registerThemeTriggersFromChildren(group, radiusScale = 0.82, minRadius = 1.7, extra = {}) {
  group.updateMatrixWorld(true);
  for (const child of group.children) {
    if (!child.visible) continue;
    registerThemeTriggerFromObject(child, radiusScale, minRadius, extra);
  }
}

function copyThemeZoneCenter(target, zone) {
  if (!zone.dynamic) {
    return target.copy(zone.worldCenter);
  }
  zone.object.updateMatrixWorld(true);
  return target.copy(zone.localCenter).applyMatrix4(zone.object.matrixWorld);
}

function getSegmentSphereHit(start, end, center, radius) {
  themeSegment.subVectors(end, start);
  const lengthSq = themeSegment.lengthSq();
  if (lengthSq < 0.000001) {
    return start.distanceToSquared(center) <= radius * radius ? 0 : null;
  }

  themeOffset.subVectors(start, center);
  const t = THREE.MathUtils.clamp(-themeOffset.dot(themeSegment) / lengthSq, 0, 1);
  themeClosestPoint.copy(start).addScaledVector(themeSegment, t);
  return themeClosestPoint.distanceToSquared(center) <= radius * radius ? t : null;
}

const GLB_COMPONENT_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

const GLB_COMPONENT_READERS = {
  5120: 'getInt8',
  5121: 'getUint8',
  5122: 'getInt16',
  5123: 'getUint16',
  5125: 'getUint32',
  5126: 'getFloat32'
};

const GLB_TYPE_SIZES = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16
};

const GLB_ATTRIBUTE_NAMES = {
  POSITION: 'position',
  NORMAL: 'normal',
  TEXCOORD_0: 'uv'
};

function parseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Invalid GLB header');
  }

  const decoder = new TextDecoder();
  let offset = 12;
  let document = null;
  let binChunk = null;

  while (offset < view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;

    const chunk = arrayBuffer.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 0x4e4f534a) {
      document = JSON.parse(decoder.decode(new Uint8Array(chunk)));
    } else if (chunkType === 0x004e4942) {
      binChunk = chunk;
    }
  }

  if (!document || !binChunk) {
    throw new Error('GLB is missing required chunks');
  }

  return { document, binChunk };
}

function collectNodeSubtree(nodes, rootNodeIndex) {
  const subtree = new Set();
  const stack = [rootNodeIndex];
  while (stack.length) {
    const nodeIndex = stack.pop();
    if (subtree.has(nodeIndex)) continue;
    subtree.add(nodeIndex);
    const children = nodes[nodeIndex]?.children ?? [];
    for (const childIndex of children) {
      stack.push(childIndex);
    }
  }
  return subtree;
}

function getAccessorData(document, binChunk, accessorIndex, accessorCache) {
  if (accessorCache.has(accessorIndex)) {
    return accessorCache.get(accessorIndex);
  }

  const accessor = document.accessors?.[accessorIndex];
  const bufferView = document.bufferViews?.[accessor?.bufferView];
  if (!accessor || !bufferView) {
    throw new Error(`Missing accessor ${accessorIndex}`);
  }
  if (accessor.sparse) {
    throw new Error('Sparse accessors are not supported in this preview loader');
  }

  const ArrayType = GLB_COMPONENT_ARRAYS[accessor.componentType];
  const itemSize = GLB_TYPE_SIZES[accessor.type];
  if (!ArrayType || !itemSize) {
    throw new Error(`Unsupported accessor format: ${accessor.componentType} ${accessor.type}`);
  }

  const componentBytes = ArrayType.BYTES_PER_ELEMENT;
  const elementBytes = componentBytes * itemSize;
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const byteStride = bufferView.byteStride || elementBytes;
  const length = accessor.count * itemSize;
  let array;

  if ((byteOffset % componentBytes) === 0 && byteStride === elementBytes) {
    array = new ArrayType(binChunk, byteOffset, length);
  } else {
    array = new ArrayType(length);
    const reader = GLB_COMPONENT_READERS[accessor.componentType];
    const dataView = new DataView(binChunk);
    for (let i = 0; i < accessor.count; i++) {
      const base = byteOffset + i * byteStride;
      for (let j = 0; j < itemSize; j++) {
        array[i * itemSize + j] = dataView[reader](base + j * componentBytes, true);
      }
    }
  }

  const parsed = {
    array,
    itemSize,
    normalized: !!accessor.normalized,
    count: accessor.count
  };
  accessorCache.set(accessorIndex, parsed);
  return parsed;
}

function createStaticGlbMaterial(document, materialIndex, materialCache, options = {}) {
  const cacheKey = `${materialIndex ?? 'default'}:${options.unlit ? 'unlit' : 'lit'}`;
  if (materialCache.has(cacheKey)) {
    return materialCache.get(cacheKey);
  }

  const materialDef = document.materials?.[materialIndex] ?? {};
  const pbr = materialDef.pbrMetallicRoughness ?? {};
  const baseColorFactor = pbr.baseColorFactor ?? [1, 1, 1, 1];
  const materialParams = {
    color: new THREE.Color(baseColorFactor[0], baseColorFactor[1], baseColorFactor[2]),
    opacity: baseColorFactor[3] ?? 1,
    transparent: materialDef.alphaMode === 'BLEND' || (baseColorFactor[3] ?? 1) < 1,
    depthWrite: materialDef.alphaMode !== 'BLEND',
    side: materialDef.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    fog: false
  };
  const material = options.unlit
    ? new THREE.MeshBasicMaterial(materialParams)
    : new THREE.MeshStandardMaterial({
      ...materialParams,
      roughness: pbr.roughnessFactor ?? 0.92,
      metalness: pbr.metallicFactor ?? 0
    });

  if (!options.unlit && Array.isArray(materialDef.emissiveFactor)) {
    material.emissive.setRGB(
      materialDef.emissiveFactor[0] ?? 0,
      materialDef.emissiveFactor[1] ?? 0,
      materialDef.emissiveFactor[2] ?? 0
    );
  }
  material.toneMapped = false;
  material.userData.sourceMaterialIndex = materialIndex ?? -1;

  materialCache.set(cacheKey, material);
  return material;
}

function createStaticGlbPrimitive(document, binChunk, primitive, accessorCache, materialCache, options = {}) {
  const geometry = new THREE.BufferGeometry();
  for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
    const targetName = GLB_ATTRIBUTE_NAMES[attributeName];
    if (!targetName) continue;
    const accessor = getAccessorData(document, binChunk, accessorIndex, accessorCache);
    geometry.setAttribute(
      targetName,
      new THREE.BufferAttribute(accessor.array, accessor.itemSize, accessor.normalized)
    );
  }

  if (primitive.indices !== undefined) {
    const indexAccessor = getAccessorData(document, binChunk, primitive.indices, accessorCache);
    geometry.setIndex(new THREE.BufferAttribute(indexAccessor.array, 1, indexAccessor.normalized));
  }

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = createStaticGlbMaterial(document, primitive.material, materialCache, options);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

async function loadStaticGlbNode(url, rootNodeIndex, options = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  const { document, binChunk } = parseGlb(await response.arrayBuffer());
  const nodes = document.nodes ?? [];
  const meshes = document.meshes ?? [];
  const subtree = collectNodeSubtree(nodes, rootNodeIndex);
  const excludedNodes = new Set(options.excludeNodes ?? []);

  const accessorCache = new Map();
  const materialCache = new Map();
  const nodeCache = new Map();

  function buildNode(nodeIndex) {
    if (nodeCache.has(nodeIndex)) return nodeCache.get(nodeIndex);

    const nodeDef = nodes[nodeIndex] ?? {};
    const object = new THREE.Group();
    object.name = nodeDef.name || `node-${nodeIndex}`;

    if (nodeDef.matrix) {
      object.matrix.fromArray(nodeDef.matrix);
      object.matrix.decompose(object.position, object.quaternion, object.scale);
    } else {
      if (nodeDef.translation) object.position.fromArray(nodeDef.translation);
      if (nodeDef.rotation) object.quaternion.fromArray(nodeDef.rotation);
      if (nodeDef.scale) object.scale.fromArray(nodeDef.scale);
    }

    const meshIndex = nodeDef.mesh;
    if (meshIndex !== undefined && meshes[meshIndex]) {
      const primitives = meshes[meshIndex].primitives ?? [];
      for (const primitive of primitives) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const mesh = createStaticGlbPrimitive(document, binChunk, primitive, accessorCache, materialCache, options);
        object.add(mesh);
      }
    }

    nodeCache.set(nodeIndex, object);
    for (const childIndex of nodeDef.children ?? []) {
      if (!subtree.has(childIndex) || excludedNodes.has(childIndex)) continue;
      object.add(buildNode(childIndex));
    }

    return object;
  }

  if (excludedNodes.has(rootNodeIndex)) {
    throw new Error(`Root node ${rootNodeIndex} is excluded`);
  }
  const root = buildNode(rootNodeIndex);
  root.updateMatrixWorld(true);
  return root;
}

function getOffsetDirection(center, angle, spread, ellipse = 1) {
  const axes = getSurfaceAxes(center);
  return center.clone()
    .addScaledVector(axes.axisA, Math.cos(angle) * spread)
    .addScaledVector(axes.axisB, Math.sin(angle) * spread * ellipse)
    .normalize();
}

function getNightDirection(angle, spread, ellipse = 0.8) {
  return NIGHT_CENTER.clone()
    .addScaledVector(NIGHT_AXIS_A, Math.cos(angle) * spread)
    .addScaledVector(NIGHT_AXIS_B, Math.sin(angle) * spread * ellipse)
    .normalize();
}

function getRouteDirection(angle, lateral = 0) {
  return new THREE.Vector3(lateral, Math.cos(angle), Math.sin(angle)).normalize();
}

function getRouteForward(angle) {
  return new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle)).normalize();
}

const surfaceDummy = new THREE.Object3D();

function setSurfaceInstance(instancedMesh, index, direction, altitude, scale, spin = 0) {
  alignObjectToSphere(surfaceDummy, direction, altitude, spin);
  surfaceDummy.scale.copy(scale);
  surfaceDummy.updateMatrix();
  instancedMesh.setMatrixAt(index, surfaceDummy.matrix);
}

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    sunDirection: { value: SUN_DIRECTION.clone() },
    dayZenith: { value: new THREE.Color(0x65b7ff) },
    dayHorizon: { value: new THREE.Color(0xcbe8ff) },
    duskZenith: { value: new THREE.Color(0x5b4f96) },
    duskHorizon: { value: new THREE.Color(0xff9f5a) },
    nightZenith: { value: new THREE.Color(0x06111f) },
    nightHorizon: { value: new THREE.Color(0x10233f) }
  },
  vertexShader: `
    varying vec3 vWorldDir;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 sunDirection;
    uniform vec3 dayZenith;
    uniform vec3 dayHorizon;
    uniform vec3 duskZenith;
    uniform vec3 duskHorizon;
    uniform vec3 nightZenith;
    uniform vec3 nightHorizon;
    varying vec3 vWorldDir;

    void main() {
      vec3 dir = normalize(vWorldDir);
      float sunAmount = dot(dir, normalize(sunDirection));
      float dayMix = smoothstep(0.02, 0.32, sunAmount);
      float nightMix = smoothstep(-0.3, -0.08, sunAmount);
      float duskBand = 1.0 - smoothstep(0.08, 0.42, abs(sunAmount + 0.02));
      float skyHeight = smoothstep(-0.55, 0.92, dir.y);
      float zenithMix = pow(skyHeight, 0.82);

      vec3 daySky = mix(dayHorizon, dayZenith, zenithMix);
      vec3 duskSky = mix(duskHorizon, duskZenith, zenithMix);
      vec3 nightSky = mix(nightHorizon, nightZenith, zenithMix);
      vec3 color = mix(nightSky, duskSky, nightMix);
      color = mix(color, daySky, dayMix);
      color = mix(color, duskSky, duskBand * 0.85 * (1.0 - dayMix * 0.35));

      gl_FragColor = vec4(color, 1.0);
    }
  `
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 20, 20), skyMat);
scene.add(sky);

const spaceStarSpriteTexture = createSpaceStarSpriteTexture();
const spaceStars = new THREE.Points(
  spaceStarsGeometry,
  new THREE.PointsMaterial({
    color: 0xf7fbff,
    size: 4.6,
    map: spaceStarSpriteTexture,
    alphaTest: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    fog: false,
    blending: THREE.NormalBlending
  })
);
spaceStars.visible = false;
scene.add(spaceStars);
spaceAsteroidField.visible = false;
scene.add(spaceAsteroidField);

const earthReturn = createEarthReturnBillboard();
scene.add(earthReturn.glow);
scene.add(earthReturn.earth);

const sun = new THREE.Group();
const sunCore = new THREE.Mesh(
  new THREE.SphereGeometry(8, 14, 14),
  new THREE.MeshBasicMaterial({ color: 0xffe08a })
);
const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(12, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22 })
);
sun.add(sunCore);
sun.add(sunHalo);
sun.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE * 0.9);
scene.add(sun);

const nightWorld = new THREE.Group();
const nightTowerGeo = new THREE.BoxGeometry(1, 1, 1);
const nightSpireGeo = new THREE.CylinderGeometry(0.28, 0.52, 1.8, 5);
const nightColumnGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.4, 5);
const crystalGeo = new THREE.OctahedronGeometry(1.1, 0);
const runeGeo = new THREE.TorusGeometry(1.5, 0.08, 4, 10);
const haloGeo = new THREE.TorusGeometry(4.6, 0.16, 4, 14);
const towerShellMat = new THREE.MeshLambertMaterial({ color: 0x09101d, emissive: 0x15243f, emissiveIntensity: 0.5, flatShading: true });
const crystalBaseMat = new THREE.MeshLambertMaterial({ color: 0x151126, emissive: 0x261d48, emissiveIntensity: 0.75, flatShading: true });
const neonBasicMats = [
  new THREE.MeshBasicMaterial({ color: 0x58efff }),
  new THREE.MeshBasicMaterial({ color: 0xff5fd1 }),
  new THREE.MeshBasicMaterial({ color: 0xffc06b }),
  new THREE.MeshBasicMaterial({ color: 0x8dffb7 })
];
registerMaterialCycle(towerShellMat, true, 0.24, 0.05, 0.03);
registerMaterialCycle(crystalBaseMat, true, 0.24, 0.05, 0.03);
for (const mat of neonBasicMats) registerMaterialCycle(mat, false, 0.26, 0.07, 0.04);

for (let i = 0; i < V.NIGHT_TOWER_COUNT; i++) {
  const tower = new THREE.Group();
  const accentMat = neonBasicMats[i % neonBasicMats.length];
  const height = 6 + (i % 5) * 2.6;
  const width = 2.1 + (i % 3) * 0.32;

  const core = new THREE.Mesh(nightTowerGeo, towerShellMat);
  core.scale.set(width, height, width);
  core.position.y = height * 0.5;
  tower.add(core);

  const bandCount = 2 + (i % 3);
  for (let j = 0; j < bandCount; j++) {
    const band = new THREE.Mesh(nightTowerGeo, accentMat);
    band.scale.set(width * 1.08, 0.16, width * 1.08);
    band.position.y = height * (0.24 + j * (0.52 / Math.max(1, bandCount - 1)));
    tower.add(band);
  }

  const column = new THREE.Mesh(nightColumnGeo, accentMat);
  column.position.y = height + 1.2;
  tower.add(column);

  const cap = new THREE.Mesh(nightSpireGeo, accentMat);
  cap.position.y = height + 2.5;
  tower.add(cap);

  const dir = getNightDirection(i * 2.3999632297, 0.12 + (i % 6) * 0.06);
  alignObjectToSphere(tower, dir, 0.35, i * 0.37);
  nightWorld.add(tower);
}

for (let i = 0; i < V.NIGHT_SHRINE_COUNT; i++) {
  const shrine = new THREE.Group();
  const accentMat = neonBasicMats[(i + 1) % neonBasicMats.length];

  const crystal = new THREE.Mesh(crystalGeo, accentMat);
  const crystalScale = 2.1 + (i % 4) * 0.55;
  crystal.scale.set(crystalScale * 0.7, crystalScale, crystalScale * 0.7);
  crystal.position.y = crystalScale * 0.8;
  shrine.add(crystal);

  const base = new THREE.Mesh(nightTowerGeo, crystalBaseMat);
  base.scale.set(1.8, 0.65, 1.8);
  base.position.y = 0.32;
  shrine.add(base);

  const rune = new THREE.Mesh(runeGeo, accentMat);
  rune.rotation.x = Math.PI * 0.5;
  rune.position.y = 0.36;
  shrine.add(rune);

  const dir = getNightDirection(i * 1.6180339887 + 0.6, 0.34 + (i % 5) * 0.08, 1.05);
  alignObjectToSphere(shrine, dir, 0.32, i * 0.41);
  nightWorld.add(shrine);
}

for (let i = 0; i < V.NIGHT_HALO_COUNT; i++) {
  const haloGroup = new THREE.Group();
  const halo = new THREE.Mesh(haloGeo, neonBasicMats[(i + 2) % neonBasicMats.length]);
  halo.rotation.x = Math.PI * 0.5;
  haloGroup.add(halo);

  const dir = getNightDirection(i * 1.0471975512 + 0.3, 0.22 + i * 0.045, 0.92);
  alignObjectToSphere(haloGroup, dir, 10 + i * 1.5, i * 0.7);
  nightWorld.add(haloGroup);
}

const nightLightColors = [0x58efff, 0xff5fd1, 0xffc06b, 0x8dffb7];
for (let i = 0; i < V.NIGHT_LIGHT_COUNT; i++) {
  const glow = new THREE.PointLight(nightLightColors[i], 1.1, 55, 2);
  const dir = getNightDirection(i * 1.5707963268 + 0.25, 0.18 + i * 0.06);
  alignObjectToSphere(glow, dir, 8 + i * 1.2);
  nightWorld.add(glow);
}

scene.add(nightWorld);

const sanctuaryAnimatedHalos = [];
const sanctuary = new THREE.Group();
const sanctuaryShellMat = new THREE.MeshLambertMaterial({ color: 0x0b1222, emissive: 0x1f2e54, emissiveIntensity: 0.65, flatShading: true });
const sanctuaryAccentMat = new THREE.MeshBasicMaterial({ color: 0x68f0ff });
const sanctuaryPulseMat = new THREE.MeshBasicMaterial({ color: 0xff77dd, transparent: true, opacity: 0.72 });
const sanctuaryWarmMat = new THREE.MeshBasicMaterial({ color: 0xffc26b });
const sanctuaryLaunchMat = new THREE.MeshBasicMaterial({
  color: 0xe8fbff,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide,
  depthWrite: true,
  fog: false,
  blending: THREE.AdditiveBlending
});
const sanctuaryLaunchGlowMat = new THREE.MeshBasicMaterial({
  color: 0xb8f6ff,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide,
  depthWrite: false,
  fog: false,
  blending: THREE.AdditiveBlending
});
const sanctuaryMarkerMat = new THREE.MeshBasicMaterial({
  color: 0xf8fdff,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide,
  depthWrite: true,
  fog: false,
  blending: THREE.AdditiveBlending
});
registerMaterialCycle(sanctuaryShellMat, true, 0.24, 0.05, 0.03);
registerMaterialCycle(sanctuaryAccentMat, false, 0.26, 0.07, 0.04);
registerMaterialCycle(sanctuaryPulseMat, false, 0.24, 0.08, 0.03);
registerMaterialCycle(sanctuaryWarmMat, false, 0.18, 0.06, 0.03);
const sanctuaryTriggerObjects = [];

const sanctuaryBase = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 8, 8), sanctuaryShellMat);
sanctuaryBase.position.y = 4;
sanctuary.add(sanctuaryBase);
sanctuaryTriggerObjects.push(sanctuaryBase);

const sanctuaryRing = new THREE.Mesh(new THREE.TorusGeometry(18, 1.2, 5, 18), sanctuaryAccentMat);
sanctuaryRing.rotation.x = Math.PI * 0.5;
sanctuaryRing.position.y = 7.2;
sanctuary.add(sanctuaryRing);
sanctuaryTriggerObjects.push(sanctuaryRing);

const sanctuaryCore = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 5.6, 24, 6), sanctuaryShellMat);
sanctuaryCore.position.y = 18;
sanctuary.add(sanctuaryCore);
sanctuaryTriggerObjects.push(sanctuaryCore);

const sanctuaryCap = new THREE.Mesh(new THREE.OctahedronGeometry(4.8, 0), sanctuaryPulseMat);
sanctuaryCap.position.y = 31;
sanctuary.add(sanctuaryCap);
sanctuaryTriggerObjects.push(sanctuaryCap);

const sanctuaryBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.3, 2.8, 120, 8, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x7ee9ff,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  })
);
sanctuaryBeam.position.y = 66;
sanctuaryBeam.scale.set(SANCTUARY_BEAM_THICKNESS_SCALE, 1, SANCTUARY_BEAM_THICKNESS_SCALE);
sanctuary.add(sanctuaryBeam);

const sanctuaryLaunchRig = new THREE.Group();
sanctuaryLaunchRig.position.y = 66;
sanctuary.add(sanctuaryLaunchRig);

const sanctuaryLaunchBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(3.8, 8.8, SANCTUARY_BEAM_HEIGHT, 12, 1, true),
  sanctuaryLaunchMat
);
sanctuaryLaunchBeam.position.y = SANCTUARY_BEAM_HEIGHT * 0.5;
sanctuaryLaunchBeam.scale.set(SANCTUARY_BEAM_THICKNESS_SCALE, 0.02, SANCTUARY_BEAM_THICKNESS_SCALE);
sanctuaryLaunchBeam.visible = false;
sanctuaryLaunchRig.add(sanctuaryLaunchBeam);

const sanctuaryLaunchGlow = new THREE.Mesh(
  new THREE.CylinderGeometry(9.2, 18.4, SANCTUARY_BEAM_HEIGHT, 14, 1, true),
  sanctuaryLaunchGlowMat
);
sanctuaryLaunchGlow.position.copy(sanctuaryLaunchBeam.position);
sanctuaryLaunchGlow.scale.set(SANCTUARY_BEAM_THICKNESS_SCALE, 0.02, SANCTUARY_BEAM_THICKNESS_SCALE);
sanctuaryLaunchGlow.visible = false;
sanctuaryLaunchRig.add(sanctuaryLaunchGlow);

const sanctuaryLaunchMarkers = [];
for (let i = 0; i < SANCTUARY_BEAM_MARKER_COUNT; i++) {
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(16.5, 0.28, 6, 18),
    sanctuaryMarkerMat.clone()
  );
  marker.rotation.x = Math.PI * 0.5;
  marker.scale.setScalar(SANCTUARY_BEAM_THICKNESS_SCALE);
  marker.visible = false;
  marker.userData.offset = i / SANCTUARY_BEAM_MARKER_COUNT;
  sanctuaryLaunchMarkers.push(marker);
  sanctuaryLaunchRig.add(marker);
}

for (let i = 0; i < V.SANCTUARY_HALO_COUNT; i++) {
  const halo = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 6, 0.36 + i * 0.08, 4, 16), i === 1 ? sanctuaryPulseMat : sanctuaryAccentMat);
  halo.rotation.x = Math.PI * 0.5;
  halo.position.y = 16 + i * 9;
  halo.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.18 + i * 0.06);
  sanctuaryAnimatedHalos.push(halo);
  sanctuary.add(halo);
  sanctuaryTriggerObjects.push(halo);
}

for (let i = 0; i < V.SANCTUARY_SPOKE_COUNT; i++) {
  const spoke = new THREE.Group();
  const spokeTower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8 + (i % 3) * 2.2, 2.2), sanctuaryShellMat);
  spokeTower.position.y = 4 + (i % 3);
  spoke.add(spokeTower);

  const spokeGlow = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 2.5), i % 2 === 0 ? sanctuaryAccentMat : sanctuaryWarmMat);
  spokeGlow.position.y = 6 + (i % 3) * 2.1;
  spoke.add(spokeGlow);

  const angle = (i / V.SANCTUARY_SPOKE_COUNT) * Math.PI * 2;
  spoke.position.set(Math.cos(angle) * 22, 0, Math.sin(angle) * 22);
  spoke.rotation.y = -angle;
  sanctuary.add(spoke);
  sanctuaryTriggerObjects.push(spoke);
}

const sanctuaryLight = new THREE.PointLight(0x7ee9ff, 1.55, 180, 2);
sanctuaryLight.position.y = 40;
sanctuary.add(sanctuaryLight);

alignObjectToSphere(sanctuary, SANCTUARY_DIR, 0.9, 0.24);
scene.add(sanctuary);
sanctuary.updateMatrixWorld(true);
themeBoundsBox.makeEmpty();
for (const triggerObject of sanctuaryTriggerObjects) {
  themeBoundsBox.expandByObject(triggerObject);
}
if (!themeBoundsBox.isEmpty()) {
  themeBoundsBox.getBoundingSphere(themeBoundsSphere);
  if (Number.isFinite(themeBoundsSphere.radius) && themeBoundsSphere.radius > 0) {
    sanctuaryBoundsTriggerLocalCenter.copy(sanctuary.worldToLocal(themeBoundsSphere.center.clone()));
    sanctuaryBoundsTriggerRadius = Math.max(SANCTUARY_RING_TRIGGER_RADIUS, themeBoundsSphere.radius * 1.08);
  }
}

const planetGeo = new THREE.IcosahedronGeometry(PLANET_RADIUS, 4);
const planetColors = [];
const landPalette = [
  0x00ffd0, 0x00fff0, 0x00d9ff, 0x00a2ff, 0x3d6dff,
  0x7a4dff, 0xb43dff, 0xf02dff, 0xff2fd1, 0xff3f94,
  0xff4f63, 0xff6c2f, 0xff9822, 0xffc300, 0xf8f32b,
  0xb8ff1f, 0x67ff2e, 0x1fff59, 0x18ff9d, 0x6afff2,
  0xff7cf5, 0xff91ff, 0xffb36a, 0xffe14a, 0xe6ff57,
  0x8cff7c, 0x4dffd1, 0x62f0ff, 0x9ea8ff, 0xff8ac8
].map((hex) => new THREE.Color(hex));
const hillTint = new THREE.Color(0xffffd8);
const valleyTint = new THREE.Color(0x180826);

for (let i = 0; i < planetGeo.attributes.position.count; i++) {
  const vertex = new THREE.Vector3().fromBufferAttribute(planetGeo.attributes.position, i);
  const direction = vertex.normalize();
  const surfaceRadius = getSurfaceRadius(direction);
  planetGeo.attributes.position.setXYZ(i, direction.x * surfaceRadius, direction.y * surfaceRadius, direction.z * surfaceRadius);

  const lon = Math.atan2(direction.z, direction.x);
  const lat = Math.asin(direction.y);
  const lon01 = (lon + Math.PI) / (Math.PI * 2);
  const lat01 = (lat + Math.PI * 0.5) / Math.PI;
  const biomeNoise = Math.sin(lon * 2.7 + lat * 4.4)
    + Math.cos(lon * 5.1 - lat * 2.6)
    + Math.sin((direction.x - direction.z) * 8.2 + direction.y * 3.4);
  const patchX = Math.floor(lon01 * 13 + biomeNoise * 0.85);
  const patchY = Math.floor(lat01 * 9 + biomeNoise * 0.45);
  const paletteIndex = ((patchX * 7 + patchY * 11) % landPalette.length + landPalette.length) % landPalette.length;
  const blendIndex = (paletteIndex + 5 + ((patchX + patchY) & 3)) % landPalette.length;
  const blendMix = 0.03 + (((biomeNoise * 0.5) + 0.5) * 0.08);
  const base = landPalette[paletteIndex].clone().lerp(landPalette[blendIndex], blendMix);
  const heightMix = THREE.MathUtils.clamp((surfaceRadius - PLANET_RADIUS) / 2.7, -1, 1);
  if (heightMix > 0) {
    base.lerp(hillTint, heightMix * 0.38);
  } else {
    base.lerp(valleyTint, -heightMix * 0.3);
  }
  planetColors.push(base.r, base.g, base.b);
}

planetGeo.setAttribute('color', new THREE.Float32BufferAttribute(planetColors, 3));
planetGeo.computeVertexNormals();
const planetMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const planet = new THREE.Mesh(planetGeo, planetMat);
scene.add(planet);
registerColorCycle(planetMat.color, 0.18, 0.05, 0.04);

const dayBlocksMat = new THREE.MeshLambertMaterial({
  color: 0xe7eeff,
  emissive: 0x102038,
  emissiveIntensity: 0.14,
  flatShading: true
});
registerMaterialCycle(dayBlocksMat, true, 0.18, 0.05, 0.04);

const dayBlockAxes = getSurfaceAxes(DAY_BLOCKS_DIR);
const dayBlocks = USE_GIANT_RECORD_PLAYER ? null : createDayBlocksLandmark(dayBlocksMat);
const giantRecordPlayer = USE_GIANT_RECORD_PLAYER ? createGiantRecordPlayerLandmark() : null;
const giantRecordPlayerDisc = giantRecordPlayer?.userData.recordDisc ?? null;
if (dayBlocks) {
  placeDirectedOnSphere(dayBlocks, DAY_BLOCKS_DIR, dayBlockAxes.axisB, 0.45, 0);
  scene.add(dayBlocks);
  registerThemeTriggerFromObject(dayBlocks, 0.9, 6.8);
}
if (giantRecordPlayer) {
  placeDirectedOnSphere(giantRecordPlayer, DAY_BLOCKS_DIR, dayBlockAxes.axisB, GIANT_RECORD_PLAYER_ALTITUDE, 0);
  scene.add(giantRecordPlayer);
}

// Visual Upgrade Phase 1 landmark hierarchy removed.

const dayMonochromeSphere = createMonochromeSphereLandmark(DAY_MONO_SPHERE_RADIUS, 0x111111);
const dayMonochromeSphereForward = COMPASS_DIR.clone()
  .addScaledVector(SUN_DIRECTION, -COMPASS_DIR.dot(SUN_DIRECTION))
  .normalize();
placeDirectedOnSphere(dayMonochromeSphere, SUN_DIRECTION, dayMonochromeSphereForward, DAY_MONO_SPHERE_CENTER_ALTITUDE, 0.0);
scene.add(dayMonochromeSphere);

const nightMonochromeSphere = createMonochromeSphereLandmark(NIGHT_MONO_SPHERE_RADIUS, 0xffffff);
placeDirectedOnSphere(nightMonochromeSphere, NIGHT_CENTER, NIGHT_AXIS_A, NIGHT_MONO_SPHERE_CENTER_ALTITUDE, 0.0);
scene.add(nightMonochromeSphere);

const duskTower = createDuskTowerLandmark();
duskTower.scale.setScalar(2.8);
const duskTowerForward = SUN_DIRECTION.clone()
  .addScaledVector(COMPASS_DIR, -SUN_DIRECTION.dot(COMPASS_DIR))
  .normalize();
placeDirectedOnSphere(duskTower, COMPASS_DIR, duskTowerForward, DUSK_TOWER_ALTITUDE, 0.0);
scene.add(duskTower);

const beaconGroup = new THREE.Group();
for (let i = 0; i < V.BEACON_COUNT; i++) {
  const y = 1 - (i / Math.max(1, V.BEACON_COUNT - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.3999632297;
  const direction = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).normalize();
  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.6, 5),
    new THREE.MeshLambertMaterial({ color: i % 2 ? 0x7ed9ff : 0xffc86b, flatShading: true })
  );
  alignObjectToSphere(beacon, direction, 1.8, i * 0.35);
  beaconGroup.add(beacon);
}
scene.add(beaconGroup);
registerThemeTriggersFromChildren(beaconGroup, 0.9, 1.8);

const atmosphereMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    cameraPos: { value: new THREE.Vector3() },
    sunDirection: { value: SUN_DIRECTION.clone() }
  },
  vertexShader: `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 cameraPos;
    uniform vec3 sunDirection;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
      vec3 viewDir = normalize(cameraPos - vWorldPos);
      float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.8);
      float sunGlow = pow(max(dot(normalize(vWorldNormal), normalize(sunDirection)), 0.0), 1.8);
      vec3 color = mix(vec3(0.18, 0.4, 0.88), vec3(0.52, 0.88, 1.0), sunGlow * 0.6);
      float alpha = fresnel * 0.22 + sunGlow * 0.05;
      gl_FragColor = vec4(color, alpha);
    }
  `
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS + 140, 28, 28), atmosphereMat);
scene.add(atmosphere);

const cloudSolidMat = new THREE.MeshLambertMaterial({
  color: 0xeef7ff,
  emissive: 0x122035,
  transparent: true,
  opacity: 0.9,
  depthWrite: false
});
const cloudThinMat = new THREE.MeshLambertMaterial({
  color: 0xdbeeff,
  emissive: 0x102137,
  transparent: true,
  opacity: 0.24,
  depthWrite: false
});
const cloudNightMat = new THREE.MeshLambertMaterial({
  color: 0x7db5ff,
  emissive: 0x0d2241,
  transparent: true,
  opacity: 0.12,
  depthWrite: false
});

function createCloud(preset = 'puff') {
  const group = new THREE.Group();
  const partGeo = preset === 'veil' ? new THREE.BoxGeometry(9, 0.5, 5.5) : new THREE.BoxGeometry(3.2, 1.1, 2.1);
  const partMat = preset === 'veil' ? cloudThinMat : cloudSolidMat;
  const count = preset === 'veil' ? 3 : 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const part = new THREE.Mesh(partGeo, partMat);
    if (preset === 'veil') {
      part.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 8
      );
      const scale = 0.8 + Math.random() * 0.9;
      part.scale.set(scale * 1.4, 0.5 + Math.random() * 0.2, scale);
      part.rotation.y = Math.random() * Math.PI;
    } else {
      part.position.set(
        (Math.random() - 0.5) * 6.5,
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 4.2
      );
      const scale = 0.75 + Math.random() * 1.15;
      part.scale.set(scale, scale * 0.85, scale);
    }
    group.add(part);
  }
  return group;
}

const clouds = new THREE.Group();
const cloudLayerSettings = [
  { count: V.CLOUD_LAYER_LOW, minHeight: 12, maxHeight: 20, drift: 0.018, preset: 'puff' },
  { count: V.CLOUD_LAYER_MID, minHeight: 28, maxHeight: 42, drift: 0.013, preset: 'puff' },
  { count: V.CLOUD_LAYER_HIGH, minHeight: 54, maxHeight: 76, drift: 0.009, preset: 'puff' }
];

for (const layer of cloudLayerSettings) {
  for (let i = 0; i < layer.count; i++) {
    const cloud = createCloud(layer.preset);
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
    cloud.userData.direction = direction;
    cloud.userData.height = layer.minHeight + Math.random() * (layer.maxHeight - layer.minHeight);
    cloud.userData.spin = Math.random() * Math.PI * 2;
    cloud.userData.drift = layer.drift * (0.7 + Math.random() * 0.8);
    alignObjectToSphere(cloud, direction, cloud.userData.height, cloud.userData.spin);
    clouds.add(cloud);
  }
}

const cloudVeils = new THREE.Group();
const cloudVeilAngles = [0.35, 0.92, 1.64, 2.33, 3.12, 4.08, 5.02];
for (let i = 0; i < V.CLOUD_VEIL_COUNT; i++) {
  const veil = createCloud('veil');
  const routeAngle = cloudVeilAngles[i % cloudVeilAngles.length] + (i - 6) * 0.08;
  const direction = i % 2 === 0
    ? getRouteDirection(routeAngle, (i % 3 - 1) * 0.08)
    : getNightDirection(i * 0.41, 0.22 + (i % 5) * 0.05, 1.1);
  veil.userData.direction = direction;
  veil.userData.height = 14 + Math.random() * 24;
  veil.userData.spin = Math.random() * Math.PI * 2;
  veil.userData.drift = 0.01 + (i % 4) * 0.002;
  alignObjectToSphere(veil, direction, veil.userData.height, veil.userData.spin);
  cloudVeils.add(veil);
}

const nightFog = new THREE.Group();
for (let i = 0; i < V.NIGHT_FOG_COUNT; i++) {
  const fog = createCloud('veil');
  for (const child of fog.children) child.material = cloudNightMat;
  const direction = getNightDirection(i * 0.61, 0.12 + (i % 4) * 0.08, 1.25);
  fog.userData.direction = direction;
  fog.userData.height = 6 + Math.random() * 12;
  fog.userData.spin = i * 0.3;
  fog.userData.drift = 0.008;
  alignObjectToSphere(fog, direction, fog.userData.height, fog.userData.spin);
  nightFog.add(fog);
}

const nightMistGeo = new THREE.BufferGeometry();
const nightMistPositions = new Float32Array(V.NIGHT_MIST_COUNT * 3);
for (let i = 0; i < V.NIGHT_MIST_COUNT; i++) {
  const direction = getNightDirection(i * 0.37, 0.08 + (i % 9) * 0.015, 1.2);
  const radius = getSurfaceRadius(direction) + 8 + (i % 11) * 1.6;
  nightMistPositions[i * 3] = direction.x * radius;
  nightMistPositions[i * 3 + 1] = direction.y * radius;
  nightMistPositions[i * 3 + 2] = direction.z * radius;
}
nightMistGeo.setAttribute('position', new THREE.BufferAttribute(nightMistPositions, 3));
const nightMist = new THREE.Points(
  nightMistGeo,
  new THREE.PointsMaterial({
    color: 0x8ec3ff,
    size: 2.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.2,
    depthWrite: false
  })
);

scene.add(clouds);
scene.add(cloudVeils);
scene.add(nightFog);
scene.add(nightMist);
registerThemeTriggersFromChildren(nightWorld, 0.78, 2.0);
registerThemeTriggersFromChildren(clouds, 0.8, 2.2, { dynamic: !FREEZE_CLOUD_DRIFT_FOR_TEST });
registerThemeTriggersFromChildren(cloudVeils, 0.84, 2.4, { dynamic: !FREEZE_CLOUD_DRIFT_FOR_TEST });
registerThemeTriggersFromChildren(nightFog, 0.84, 2.2, { dynamic: !FREEZE_CLOUD_DRIFT_FOR_TEST });

const player = new THREE.Group();
const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf5f9ff, emissive: 0x0b1018, emissiveIntensity: 0.02 });
const backMat = new THREE.MeshLambertMaterial({ color: 0xf1f6ff, emissive: 0x0b1018, emissiveIntensity: 0.02 });
const wingMat = new THREE.MeshLambertMaterial({ color: 0xf7fbff, emissive: 0x0b1018, emissiveIntensity: 0.02, flatShading: true });
const beakMat = new THREE.MeshLambertMaterial({ color: 0xf0b24a, flatShading: true });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x171b24 });
const accentMat = new THREE.MeshBasicMaterial({ color: 0x7ef4ff, transparent: true, opacity: 0.0 });

const seagullVisual = new THREE.Group();
seagullVisual.scale.setScalar(P.SEAGULL_POSE_SCALE);
player.add(seagullVisual);

const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.08, 12, 22), bodyMat);
body.rotation.x = Math.PI * 0.5;
body.scale.set(0.67, 0.6, 1.06);
body.position.z = -0.03;
body.userData.baseScale = body.scale.clone();
seagullVisual.add(body);

const backShell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), backMat);
backShell.scale.set(0.8, 0.48, 1.78);
backShell.position.set(0, 0.06, -0.08);
backShell.userData.baseScale = backShell.scale.clone();
seagullVisual.add(backShell);

const noseFairing = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), bodyMat);
noseFairing.scale.set(0.46, 0.36, 0.82);
noseFairing.position.set(0, -0.012, 0.88);
seagullVisual.add(noseFairing);

const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), bodyMat);
belly.scale.set(0.58, 0.34, 1.28);
belly.position.set(0, -0.085, 0.05);
seagullVisual.add(belly);

const chest = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), bodyMat);
chest.scale.set(0.52, 0.34, 0.76);
chest.position.set(0, -0.03, 0.38);
seagullVisual.add(chest);

const headRoot = new THREE.Group();
headRoot.position.set(0, 0.05, 0.9);
seagullVisual.add(headRoot);

const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.18, 5, 10), bodyMat);
neck.rotation.x = Math.PI * 0.42;
neck.position.set(0, -0.01, -0.12);
neck.scale.set(0.82, 0.74, 1.05);
headRoot.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), bodyMat);
head.scale.set(0.82, 0.66, 1.06);
head.position.set(0, 0.02, 0.05);
headRoot.add(head);

const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.38, 4), beakMat);
beak.rotation.x = Math.PI * 0.5;
beak.position.set(0, -0.02, 0.27);
headRoot.add(beak);

const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyeMat);
const eyeRight = eyeLeft.clone();
eyeLeft.position.set(-0.085, 0.03, 0.07);
eyeRight.position.set(0.085, 0.03, 0.07);
headRoot.add(eyeLeft, eyeRight);

const wingLeftRoot = new THREE.Group();
const wingRightRoot = new THREE.Group();
wingLeftRoot.position.set(-0.18, 0.08, 0.0);
wingRightRoot.position.set(0.18, 0.08, 0.0);
seagullVisual.add(wingLeftRoot, wingRightRoot);

const wingMainGeo = new THREE.CapsuleGeometry(0.17, 0.58, 3, 6);
wingMainGeo.rotateZ(Math.PI * 0.5);
const wingTipGeo = new THREE.CapsuleGeometry(0.13, 0.42, 3, 6);
wingTipGeo.rotateZ(Math.PI * 0.5);
const wingLeftMain = new THREE.Mesh(wingMainGeo, wingMat);
const wingLeftTip = new THREE.Mesh(wingTipGeo, wingMat);
wingLeftMain.position.x = -0.32;
wingLeftMain.scale.set(0.7, 0.3, 0.62);
wingLeftMain.rotation.z = -0.002;
wingLeftTip.scale.set(0.7, 0.28, 0.52);
wingLeftTip.position.set(-0.69, -0.005, -0.03);
wingLeftTip.rotation.y = 0.06;
wingLeftTip.rotation.z = -0.004;
wingLeftRoot.add(wingLeftMain, wingLeftTip);

const wingRightMain = wingLeftMain.clone();
const wingRightTip = wingLeftTip.clone();
wingRightMain.position.x = 0.32;
wingRightMain.rotation.z = 0.002;
wingRightTip.position.set(0.69, -0.005, -0.03);
wingRightTip.rotation.y = -0.06;
wingRightTip.rotation.z = 0.004;
wingRightRoot.add(wingRightMain, wingRightTip);

const tailRoot = new THREE.Group();
tailRoot.position.set(0, -0.03, -1.08);
seagullVisual.add(tailRoot);

const tailStemGeo = new THREE.CapsuleGeometry(0.08, 0.86, 6, 10);
tailStemGeo.rotateX(Math.PI * 0.5);
const tailStemLeft = new THREE.Mesh(tailStemGeo, wingMat);
const tailStemRight = tailStemLeft.clone();
tailStemLeft.scale.set(0.78, 0.34, 1.0);
tailStemRight.scale.copy(tailStemLeft.scale);
tailStemLeft.position.set(-0.12, -0.01, -0.24);
tailStemRight.position.set(0.12, -0.01, -0.24);
tailStemLeft.rotation.y = -0.06;
tailStemRight.rotation.y = 0.06;
tailRoot.add(tailStemLeft, tailStemRight);

const boostGlow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 4, 10), accentMat);
boostGlow.position.set(0, 0.05, -1.25);
boostGlow.rotation.x = Math.PI * 0.5;
player.add(boostGlow);

const seagullTipGlowMat = new THREE.MeshBasicMaterial({ color: 0x89f3ff, transparent: true, opacity: 0.0, depthWrite: false });
const seagullTailGlowMat = new THREE.MeshBasicMaterial({ color: 0xffcf86, transparent: true, opacity: 0.0, depthWrite: false });
const seagullLeftTipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), seagullTipGlowMat);
const seagullRightTipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), seagullTipGlowMat);
const seagullTailGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, 1.2, 5), seagullTailGlowMat);
seagullTailGlow.rotation.x = Math.PI * 0.5;
seagullLeftTipGlow.position.set(-0.98, 0.03, -0.03);
seagullRightTipGlow.position.set(0.98, 0.03, -0.03);
seagullTailGlow.position.set(0, -0.03, -1.42);
seagullVisual.add(seagullLeftTipGlow, seagullRightTipGlow, seagullTailGlow);

const boostTrail = new THREE.Group();
const boostTrailMats = [];
for (let i = 0; i < V.BOOST_TRAIL_COUNT; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x7ef4ff : 0xffd07c, transparent: true, opacity: 0.0, depthWrite: false });
  const segment = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.2 + i * 0.24), mat);
  segment.visible = false;
  boostTrailMats.push(mat);
  boostTrail.add(segment);
}
scene.add(boostTrail);

const diveStreaks = new THREE.Group();
const diveStreakMats = [];
for (let i = 0; i < V.DIVE_STREAK_COUNT; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xb7e7ff, transparent: true, opacity: 0.0, depthWrite: false });
  const streak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 5.4 + i * 0.35), mat);
  streak.userData.phase = i * 0.7;
  streak.visible = false;
  diveStreakMats.push(mat);
  diveStreaks.add(streak);
}
scene.add(diveStreaks);

const speedParticlesGeo = new THREE.BufferGeometry();
const speedParticlePositions = new Float32Array(V.SPEED_PARTICLE_COUNT * 3);
speedParticlesGeo.setAttribute('position', new THREE.BufferAttribute(speedParticlePositions, 3));
const speedParticles = new THREE.Points(
  speedParticlesGeo,
  new THREE.PointsMaterial({
    color: 0xe8fbff,
    size: 1.9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  })
);
speedParticles.visible = false;
scene.add(speedParticles);

const dustPuffs = [];
for (let i = 0; i < V.DUST_COUNT; i++) {
  const puff = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.22, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xd8ead8, transparent: true, opacity: 0.0, depthWrite: false })
  );
  puff.visible = false;
  puff.userData.life = 0;
  puff.userData.velocity = new THREE.Vector3();
  dustPuffs.push(puff);
  scene.add(puff);
}

function createPoopMesh() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4b2410 });
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), mat);
  base.scale.set(1.18, 0.78, 1.05);
  base.position.y = 0.18;
  group.add(base);

  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), mat);
  mid.scale.set(1.0, 0.82, 0.96);
  mid.position.y = 0.48;
  group.add(mid);

  const top = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), mat);
  top.position.y = 0.77;
  group.add(top);
  return group;
}

const poopDrops = [];
for (let i = 0; i < 6; i++) {
  const poop = createPoopMesh();
  poop.visible = false;
  poop.userData.life = 0;
  poop.userData.velocity = new THREE.Vector3();
  poop.userData.grounded = false;
  poop.userData.groundDir = new THREE.Vector3();
  scene.add(poop);
  poopDrops.push(poop);
}

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 18),
  new THREE.MeshBasicMaterial({
    color: 0x02050a,
    transparent: true,
    opacity: 0.26,
    depthWrite: false
  })
);
shadow.renderOrder = 2;
scene.add(shadow);

scene.add(player);

const catPreviewAnchor = new THREE.Group();
catPreviewAnchor.visible = false;
const catPreviewShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 18),
  new THREE.MeshBasicMaterial({
    color: 0x051019,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  })
);
catPreviewShadow.rotation.x = -Math.PI * 0.5;
catPreviewShadow.position.y = 0.04;
catPreviewShadow.scale.set(1.1, 0.9, 1);
catPreviewAnchor.add(catPreviewShadow);
scene.add(catPreviewAnchor);

const seagullState = {
  posePitch: 0
};

const verticalLoopState = {
  startPos: new THREE.Vector3(),
  startForward: new THREE.Vector3(),
  startUp: new THREE.Vector3(),
  radius: 0,
  recoveryForward: new THREE.Vector3(),
  recoveryUp: new THREE.Vector3(),
  recoveryTime: 0
};

const startUp = new THREE.Vector3(0, 1, 0);
const startRadius = getSurfaceRadius(startUp) + PLAYER_CLEARANCE;
const state = {
  pos: startUp.clone().multiplyScalar(startRadius),
  forward: new THREE.Vector3(0, 0, 1),
  visualUp: startUp.clone(),
  visualForward: new THREE.Vector3(0, 0, 1),
  cameraLift: 0,
  cameraLookMode: CAMERA_LOOK_MODES.CHASE,
  cameraYawOffset: 0,
  cameraYawTarget: 0,
  cameraLensOffset: 0,
  cameraLensTarget: 0,
  currentSpeed: 40,
  speedLock: 40,
  holdAccel: 0,
  radialSpeed: 0,
  bodyPitch: 0,
  roll: 0,
  loopSpinActive: false,
  loopSpinTime: 0,
  loopSpinAngle: 0,
  screwSpinActive: false,
  screwSpinTime: 0,
  screwSpinAngle: 0,
  screwSpinDirection: 1,
  screwForwardOffset: 0,
  glideVisual: 0.2,
  boostFlash: 0,
  onGround: true,
  flaps: P.MAX_FLAPS,
  lastFlap: 0,
  diveTimer: 0,
  diveEnergy: 0,
  wasOnGround: true
};
const startPosition = state.pos.clone();
const themeState = {
  mode: 'normal',
  cooldown: 0,
  flashActive: false,
  flashTime: 0,
  flashWorldPoint: new THREE.Vector3(),
  flashScreenPoint: new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
  armed: false,
  startupGrace: THEME_STARTUP_GRACE,
  clearRequired: false
};
const returnRouteState = {
  phase: RETURN_ROUTE_PHASES.IDLE,
  originTag: null,
  targetTag: 'night-monochrome-sphere',
  targetDirection: NIGHT_CENTER.clone(),
  sanctuaryActivationTime: 0,
  sanctuaryStartAltitude: 0,
  earthApproachStartDistance: 0,
  beamDirection: SANCTUARY_DIR.clone(),
  spaceUpDirection: new THREE.Vector3(),
  spaceActivationCharge: 0,
  spaceTransition: 0,
  spaceCameraSnapPending: false,
  spaceParallelActive: false,
  spaceFlightActive: false
};
const musicSelectorState = {
  open: false,
  rearmRequired: false
};
let menuClickThroughGuardUntil = 0;
const bookUiState = {
  open: false,
  pendingTimer: null,
  lastMessages: [],
  currentView: 'read',
  pageIndex: 0,
  readPages: [],
  backend: 'local',
  rearmRequired: false
};
const catRouteState = {
  blackBoxOpened: false,
  catFound: false,
  catRouteAvailable: false,
  catFollowing: false,
  debugPreviewActive: false,
  reachedEarth: false,
  reachedEarthWithCat: false,
  hasWrittenNameInBook: false,
  bookPlayerName: '',
  latestBookMessageId: '',
  bubbleActive: false,
  bubbleTime: 0,
  companionIntroActive: false,
  companionIntroTime: 0,
  companionStart: new THREE.Vector3(),
  companionPosition: new THREE.Vector3(),
  companionForward: new THREE.Vector3(),
  companionUp: new THREE.Vector3()
};
const returnHistoryState = {
  entries: [],
  backend: 'local',
  loadingPromise: null
};
const compassAssistState = {
  active: false,
  time: 0,
  cooldown: 0,
  rearmRequired: false,
  targetDirection: new THREE.Vector3()
};
const blackBoxUiState = {
  open: false,
  pendingTimer: null,
  currentView: 'intro',
  mode: 'orbit',
  routeReady: false,
  routeAngle: 0,
  routeAngleSpeed: 0,
  revealCount: 0,
  currentImageIndex: 0,
  routeAxisB: new THREE.Vector3(),
  routeNormal: new THREE.Vector3(),
  groundedDirection: new THREE.Vector3(),
  groundedForward: new THREE.Vector3(),
  lastTriggerPoint: new THREE.Vector3(),
  lastTriggerAngle: 0,
  openedOnce: false,
  rearmRequired: false
};
const captureUiState = {
  open: false,
  busy: false,
  objectUrl: '',
  blob: null,
  fileName: '',
  shutterTimer: null
};
const endingUiState = {
  whiteoutActive: false,
  whiteoutTime: 0,
  transitionActive: false,
  transitionTime: 0,
  trueEnding: false,
  trueMessageActive: false,
  trueMessageTime: 0,
  rollTime: 0,
  rollStartY: 0,
  rollEndY: 0,
  rollCurrentY: 0,
  rollAudioDelayTimer: null,
  open: false,
  completed: false
};
let lastCameraTriggerAt = 0;

const giantBook = createGiantBookLandmark();
const blackBoxLandmark = createBlackBoxLandmark();

function placeGiantBookLandmark() {
  const towardSun = SUN_DIRECTION.clone()
    .addScaledVector(GIANT_BOOK_DIR, -SUN_DIRECTION.dot(GIANT_BOOK_DIR))
    .normalize();
  placeDirectedOnSphere(giantBook, GIANT_BOOK_DIR, towardSun, GIANT_BOOK_ALTITUDE, 0.06);
}

function ensureBlackBoxRoute() {
  if (blackBoxUiState.routeReady) return;
  const startRight = new THREE.Vector3().crossVectors(startUp, state.forward).normalize();
  const lookAheadAngle = (BLACK_BOX_LOOKAHEAD_SPEED * BLACK_BOX_LOOKAHEAD_SECONDS) / startRadius;
  const interceptDirection = startUp.clone().applyAxisAngle(startRight, lookAheadAngle).normalize();
  blackBoxUiState.routeAxisB.copy(
    interceptDirection.clone().addScaledVector(SUN_DIRECTION, -interceptDirection.dot(SUN_DIRECTION))
  );
  if (blackBoxUiState.routeAxisB.lengthSq() < 0.0001) {
    blackBoxUiState.routeAxisB.copy(NIGHT_AXIS_A);
  } else {
    blackBoxUiState.routeAxisB.normalize();
  }
  blackBoxUiState.routeNormal.crossVectors(SUN_DIRECTION, blackBoxUiState.routeAxisB).normalize();
  const interceptRouteAngle = Math.atan2(
    interceptDirection.dot(blackBoxUiState.routeAxisB),
    interceptDirection.dot(SUN_DIRECTION)
  );
  blackBoxUiState.routeAngleSpeed = BLACK_BOX_SPEED / (getSurfaceRadius(interceptDirection) + BLACK_BOX_ALTITUDE);
  blackBoxUiState.routeAngle = interceptRouteAngle
    - blackBoxUiState.routeAngleSpeed * BLACK_BOX_LOOKAHEAD_SECONDS
    + blackBoxUiState.routeAngleSpeed * BLACK_BOX_PHASE_LEAD_SECONDS;
  blackBoxUiState.routeReady = true;
}

function getBlackBoxDirectionFromAngle(angle) {
  return SUN_DIRECTION.clone()
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(blackBoxUiState.routeAxisB, Math.sin(angle))
    .normalize();
}

function getBlackBoxForwardFromAngle(angle) {
  return SUN_DIRECTION.clone()
    .multiplyScalar(-Math.sin(angle))
    .addScaledVector(blackBoxUiState.routeAxisB, Math.cos(angle))
    .normalize();
}

function getBlackBoxRouteAngleFromDirection(direction) {
  const projected = direction.clone()
    .addScaledVector(blackBoxUiState.routeNormal, -direction.dot(blackBoxUiState.routeNormal));
  if (projected.lengthSq() < 0.0001) {
    return blackBoxUiState.routeAngle;
  }
  projected.normalize();
  return Math.atan2(projected.dot(blackBoxUiState.routeAxisB), projected.dot(SUN_DIRECTION));
}

function placeBlackBoxOrbit() {
  ensureBlackBoxRoute();
  const direction = getBlackBoxDirectionFromAngle(blackBoxUiState.routeAngle);
  const tangentForward = getBlackBoxForwardFromAngle(blackBoxUiState.routeAngle);
  placeDirectedOnSphere(blackBoxLandmark, direction, tangentForward, BLACK_BOX_ALTITUDE, BLACK_BOX_ROLL);
}

function placeGroundedBlackBox(direction, forward = null) {
  const groundedDirection = direction.clone().normalize();
  const sourceForward = (forward ? forward.clone() : getBlackBoxForwardFromAngle(blackBoxUiState.routeAngle));
  const groundedForward = sourceForward.addScaledVector(groundedDirection, -sourceForward.dot(groundedDirection));
  if (groundedForward.lengthSq() < 0.0001) {
    groundedForward.copy(state.forward).addScaledVector(groundedDirection, -state.forward.dot(groundedDirection));
  }
  groundedForward.normalize();
  blackBoxUiState.groundedDirection.copy(groundedDirection);
  blackBoxUiState.groundedForward.copy(groundedForward);
  blackBoxUiState.routeAngle = getBlackBoxRouteAngleFromDirection(groundedDirection);
  placeDirectedOnSphere(blackBoxLandmark, groundedDirection, groundedForward, BLACK_BOX_GROUND_ALTITUDE, BLACK_BOX_ROLL);
}

function placeBlackBoxLandmark() {
  placeBlackBoxOrbit();
}

function isInsideBlackBoxInteractionZone(point, extraRadius = 0) {
  const limit = BLACK_BOX_REARM_EXIT_RADIUS + PLAYER_THEME_HIT_RADIUS + extraRadius;
  return point.distanceToSquared(blackBoxLandmark.position) <= limit * limit;
}

function getGroundedBlackBoxInteractionHit(start, end) {
  if (blackBoxUiState.mode !== 'grounded') return null;
  return getSegmentSphereHit(
    start,
    end,
    blackBoxLandmark.position,
    BLACK_BOX_REOPEN_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS
  );
}

function updateBlackBox(dt) {
  if (blackBoxUiState.mode !== 'orbit') return;
  blackBoxUiState.routeAngle += blackBoxUiState.routeAngleSpeed * dt;
  placeBlackBoxOrbit();
}

function resumeBlackBoxOrbit() {
  blackBoxUiState.mode = 'orbit';
  placeBlackBoxOrbit();
}

function setBlackBoxRevealImage(index) {
  const reveal = BLACK_BOX_IMAGE_SET[Math.min(index, BLACK_BOX_IMAGE_SET.length - 1)] ?? BLACK_BOX_IMAGE_SET[0];
  blackBoxUiState.currentImageIndex = Math.min(index, BLACK_BOX_IMAGE_SET.length - 1);
  if (blackBoxCatImage) {
    blackBoxCatImage.src = reveal.src;
    blackBoxCatImage.alt = reveal.caption;
  }
  if (blackBoxCaption) {
    blackBoxCaption.textContent = reveal.caption;
  }
  if (blackBoxDownload) {
    blackBoxDownload.href = reveal.src;
    blackBoxDownload.setAttribute('download', reveal.download);
  }
}

placeGiantBookLandmark();
scene.add(giantBook);
const giantBookThemeZone = registerThemeTriggerFromObject(giantBook, 0.72, 7.4, {
  tag: 'book',
  onTrigger: (contactPoint) => handleBookTrigger(contactPoint)
});
placeBlackBoxLandmark();
scene.add(blackBoxLandmark);
registerThemeTriggerFromObject(blackBoxLandmark, 4.7, 14.4, {
  dynamic: true,
  tag: 'black-box',
  onTrigger: (contactPoint) => handleBlackBoxTrigger(contactPoint)
});

function placeCatPreviewAnchor() {
  const startRight = new THREE.Vector3().crossVectors(startUp, state.forward).normalize();
  const lookAheadAngle = (CAT_PREVIEW_LOOKAHEAD_SPEED * CAT_PREVIEW_LOOKAHEAD_SECONDS) / startRadius;
  const catDirection = startUp.clone().applyAxisAngle(startRight, lookAheadAngle).normalize();
  const towardStart = startUp.clone()
    .addScaledVector(catDirection, -startUp.dot(catDirection))
    .normalize();
  placeDirectedOnSphere(catPreviewAnchor, catDirection, towardStart, CAT_PREVIEW_ALTITUDE);
}

function recolorCatPreview(catRoot) {
  const furBrown = new THREE.Color(0x3a2318);

  catRoot.traverse((object) => {
    if (!object.isMesh || !object.material?.color) return;
    const materialIndex = object.material.userData?.sourceMaterialIndex;
    if (materialIndex >= 1 && materialIndex <= 7) {
      object.material.color.copy(furBrown);
    }
  });
}

function addCatPreviewAccents(catRoot, size) {
  const brownMat = new THREE.MeshBasicMaterial({ color: 0x3a2318, toneMapped: false, fog: false });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x73b7ff, toneMapped: false, fog: false });
  const noseMat = new THREE.MeshBasicMaterial({ color: 0x25150f, toneMapped: false, fog: false });
  const accentGroup = new THREE.Group();

  const eyePatchGeo = new THREE.SphereGeometry(0.18, 10, 8);
  const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const earGeo = new THREE.ConeGeometry(0.16, 0.34, 4);
  const whiskerGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5);
  const noseGeo = new THREE.SphereGeometry(0.06, 8, 6);

  const headX = -size.x * 0.44;
  const eyeY = size.y * 0.7;
  const eyeZ = size.z * 0.17;
  const whiskerBaseX = headX - 0.05;
  const whiskerBaseY = size.y * 0.62;
  const whiskerSpread = 0.16;

  for (const side of [-1, 1]) {
    const patch = new THREE.Mesh(eyePatchGeo, brownMat);
    patch.scale.set(1.18, 0.86, 0.52);
    patch.position.set(headX, eyeY, side * eyeZ);
    accentGroup.add(patch);

    const eye = new THREE.Mesh(eyeGeo, blueMat);
    eye.position.set(headX - 0.1, eyeY + 0.01, side * eyeZ);
    accentGroup.add(eye);

    const ear = new THREE.Mesh(earGeo, brownMat);
    ear.position.set(-size.x * 0.27, size.y * 0.92, side * size.z * 0.2);
    ear.rotation.z = side * -0.2;
    ear.rotation.x = -0.14;
    accentGroup.add(ear);

    for (let i = 0; i < 3; i++) {
      const whisker = new THREE.Mesh(whiskerGeo, noseMat);
      whisker.position.set(whiskerBaseX, whiskerBaseY + (i - 1) * 0.09, side * (size.z * 0.08 + i * whiskerSpread * 0.34));
      whisker.rotation.z = Math.PI * 0.5;
      whisker.rotation.y = side * (0.2 + i * 0.12);
      whisker.rotation.x = (i - 1) * 0.08;
      accentGroup.add(whisker);
    }
  }

  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.scale.set(1.2, 0.9, 1.1);
  nose.position.set(headX - 0.16, size.y * 0.61, 0);
  accentGroup.add(nose);

  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 4), noseMat);
  mouth.position.set(headX - 0.18, size.y * 0.54, 0);
  mouth.rotation.z = Math.PI * 0.5;
  accentGroup.add(mouth);

  const tailBand = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.86, 4, 6), brownMat);
  tailBand.position.set(size.x * 0.34, size.y * 0.5, 0);
  tailBand.rotation.z = Math.PI * 0.5;
  tailBand.rotation.y = 0.22;
  accentGroup.add(tailBand);

  catRoot.add(accentGroup);
}

function createCatCompanionRearVisual() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xfcfcfb });
  const bodyShadeMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
  const brownMat = new THREE.MeshLambertMaterial({ color: 0x6a4632 });
  const innerEarMat = new THREE.MeshLambertMaterial({ color: 0xe7cdbf });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), bodyMat);
  body.scale.set(0.94, 0.62, 1.82);
  body.position.set(0, 0.96, -0.08);
  group.add(body);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.86, 14, 12), bodyShadeMat);
  shoulders.scale.set(0.82, 0.58, 0.92);
  shoulders.position.set(0, 1.08, 0.92);
  group.add(shoulders);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.68, 14, 12), bodyMat);
  head.scale.set(0.82, 0.7, 0.76);
  head.position.set(0, 1.1, 1.72);
  group.add(head);

  for (const side of [-1, 1]) {
    const earOuter = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), brownMat);
    earOuter.position.set(side * 0.28, 1.52, 1.9);
    earOuter.rotation.x = -0.1;
    earOuter.rotation.z = side * -0.2;
    group.add(earOuter);

    const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), innerEarMat);
    earInner.position.set(side * 0.28, 1.48, 1.92);
    earInner.rotation.x = -0.1;
    earInner.rotation.z = side * -0.2;
    group.add(earInner);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.24, 4, 8), brownMat);
  tail.position.set(0.62, 1.18, -1.48);
  tail.rotation.z = -0.54;
  tail.rotation.x = 0.82;
  group.add(tail);

  const hindLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.72, 3, 6), bodyShadeMat);
  hindLeft.position.set(-0.34, 0.72, -1.62);
  hindLeft.rotation.x = Math.PI * 0.5;
  hindLeft.rotation.z = 0.16;
  group.add(hindLeft);

  const hindRight = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.72, 3, 6), bodyShadeMat);
  hindRight.position.set(0.34, 0.72, -1.62);
  hindRight.rotation.x = Math.PI * 0.5;
  hindRight.rotation.z = -0.16;
  group.add(hindRight);

  const frontLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.88, 3, 6), bodyMat);
  frontLeft.position.set(-0.28, 0.82, 2.04);
  frontLeft.rotation.x = Math.PI * 0.5;
  frontLeft.rotation.z = 0.08;
  group.add(frontLeft);

  const frontRight = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.88, 3, 6), bodyMat);
  frontRight.position.set(0.28, 0.82, 2.04);
  frontRight.rotation.x = Math.PI * 0.5;
  frontRight.rotation.z = -0.08;
  group.add(frontRight);

  group.scale.setScalar(CAT_ROUTE_COMPANION_SCALE);
  return group;
}

function ensureCatCompanionRearVisual() {
  let companionRear = catPreviewAnchor.userData.companionRear;
  if (!companionRear) {
    companionRear = createCatCompanionRearVisual();
    companionRear.visible = false;
    catPreviewAnchor.userData.companionRear = companionRear;
    catPreviewAnchor.add(companionRear);
  }
  return companionRear;
}

function setCatPreviewMode(mode) {
  const previewOffset = catPreviewAnchor.userData.previewOffset;
  const companionRear = ensureCatCompanionRearVisual();
  if (previewOffset) {
    previewOffset.visible = mode !== 'follow';
  }
  if (companionRear) {
    companionRear.visible = mode === 'follow';
  }
}

async function initCatPreview() {
  placeCatPreviewAnchor();
  ensureCatCompanionRearVisual();
  try {
    const catModel = await loadStaticGlbNode('./neko.glb', 19, { excludeNodes: [16, 17, 20], unlit: true });
    const catOffset = new THREE.Group();
    catPreviewAnchor.add(catOffset);
    catOffset.add(catModel);

    catModel.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(catModel);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    catModel.position.set(-center.x, -bounds.min.y, -center.z);
    recolorCatPreview(catModel);
    addCatPreviewAccents(catModel, size);

    // Keep the model upright, then turn the whole preview back toward the player.
    catModel.rotation.y = -Math.PI * 0.5;
    catOffset.rotation.y = Math.PI;

    const scale = CAT_PREVIEW_HEIGHT / Math.max(size.y, 0.001);
    catOffset.scale.setScalar(scale);
    catOffset.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(catOffset);
    const scaledSize = scaledBounds.getSize(new THREE.Vector3());
    catPreviewShadow.scale.set(
      THREE.MathUtils.clamp(scaledSize.x * 0.42, 0.9, 2.4),
      THREE.MathUtils.clamp(scaledSize.z * 0.42, 0.75, 2.1),
      1
    );
    catPreviewShadow.visible = false;

    catPreviewAnchor.userData.previewOffset = catOffset;
    setCatPreviewMode(catRouteState.catFollowing ? 'follow' : 'preview');
    catPreviewAnchor.visible = true;
  } catch (error) {
    console.error('Failed to load cat preview:', error);
  }
}

function refreshCatRouteAvailability() {
  catRouteState.catRouteAvailable =
    catRouteState.blackBoxOpened &&
    catRouteState.catFound &&
    returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY &&
    !catRouteState.catFollowing &&
    !endingUiState.completed;
}

function isCatCompanionActive() {
  return catRouteState.catFollowing || catRouteState.debugPreviewActive;
}

function setCatRouteBubbleVisible(isVisible) {
  catRouteBubble?.classList.toggle('is-active', isVisible);
  catRouteBubble?.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
}

function startCatRouteBubble() {
  catRouteState.bubbleActive = true;
  catRouteState.bubbleTime = 0;
  setCatRouteBubbleVisible(true);
}

function startCatFollowing(contactPoint = null) {
  catRouteState.catFollowing = true;
  catRouteState.debugPreviewActive = false;
  catRouteState.reachedEarthWithCat = false;
  refreshCatRouteAvailability();
  ensureCatCompanionRearVisual();
  startCatRouteBubble();
  setCatPreviewMode('follow');

  const sourcePoint = contactPoint && contactPoint.lengthSq() > 0.0001
    ? contactPoint.clone()
    : blackBoxLandmark.position.clone();
  const sourceUp = sourcePoint.clone().normalize();
  catRouteState.companionStart.copy(sourcePoint).addScaledVector(sourceUp, 1.3);
  catRouteState.companionPosition.copy(catRouteState.companionStart);
  catRouteState.companionForward.copy(state.visualForward).normalize();
  catRouteState.companionUp.copy(sourceUp).normalize();
  catRouteState.companionIntroActive = true;
  catRouteState.companionIntroTime = 0;

  catPreviewAnchor.position.copy(catRouteState.companionStart);
  catPreviewAnchor.visible = true;
  catPreviewShadow.visible = false;
  catPreviewAnchor.quaternion.copy(createBasisQuaternion(catRouteState.companionForward, catRouteState.companionUp));
  catPreviewAnchor.updateMatrixWorld(true);
}

function setCatDebugPreviewEnabled(isEnabled) {
  if (isEnabled) {
    catRouteState.debugPreviewActive = true;
    ensureCatCompanionRearVisual();
    setCatPreviewMode('follow');
    catRouteState.companionIntroActive = false;
    catRouteState.companionPosition.copy(state.pos);
    catRouteState.companionForward.copy(state.visualForward).normalize();
    catRouteState.companionUp.copy(state.visualUp).normalize();
    catPreviewAnchor.visible = true;
    catPreviewShadow.visible = false;
    return;
  }

  catRouteState.debugPreviewActive = false;
  if (catRouteState.catFollowing) return;
  setCatPreviewMode('preview');
  placeCatPreviewAnchor();
  catPreviewShadow.visible = false;
  catPreviewAnchor.visible = true;
  catPreviewAnchor.updateMatrixWorld(true);
}

function updateCatRouteBubble(dt) {
  if (!catRouteState.bubbleActive) {
    setCatRouteBubbleVisible(false);
    return;
  }
  catRouteState.bubbleTime += dt;
  if (catRouteState.bubbleTime >= CAT_ROUTE_BUBBLE_DURATION) {
    catRouteState.bubbleActive = false;
    setCatRouteBubbleVisible(false);
  }
}

function updateCatCompanion(dt) {
  if (!isCatCompanionActive()) return;
  const desiredPosition = catDesiredPosition.copy(CAT_ROUTE_MOUNT_OFFSET).applyQuaternion(player.quaternion).add(player.position);
  const mountForward = catMountForward.copy(state.visualForward).normalize();
  const mountUp = catMountUp.copy(state.visualUp).normalize();
  if (mountForward.lengthSq() < 0.0001) {
    mountForward.set(0, 0, 1);
  }
  if (mountUp.lengthSq() < 0.0001) {
    mountUp.set(0, 1, 0);
  }
  const targetQuaternion = writeBasisQuaternion(catTargetQuaternion, mountForward, mountUp);

  if (catRouteState.companionIntroActive) {
    catRouteState.companionIntroTime += dt;
    const introT = THREE.MathUtils.clamp(catRouteState.companionIntroTime / CAT_ROUTE_JOIN_DURATION, 0, 1);
    catRouteState.companionPosition.lerpVectors(
      catRouteState.companionStart,
      desiredPosition,
      easeOutCubic(introT)
    );
    if (introT >= 1) {
      catRouteState.companionIntroActive = false;
    }
  } else {
    catRouteState.companionPosition.copy(desiredPosition);
  }

  catPreviewAnchor.position.copy(catRouteState.companionPosition);
  if (catRouteState.companionIntroActive) {
    const rotationBlend = 1 - Math.exp(-CAT_ROUTE_ROTATION_RESPONSE * dt);
    catPreviewAnchor.quaternion.slerp(targetQuaternion, rotationBlend);
  } else {
    catPreviewAnchor.quaternion.copy(targetQuaternion);
  }
  catPreviewShadow.visible = false;
  catPreviewAnchor.updateMatrixWorld(true);
}

let bobPhase = Math.random() * Math.PI * 2;

const input = {
  leftId: null,
  rightId: null,
  lookId: null,
  leftLast: { x: 0, y: 0 },
  lookLast: { x: 0, y: 0 },
  lookStart: { x: 0, y: 0 },
  lookDragging: false,
  turnX: 0,
  turnY: 0,
  flapQueued: false,
  accelHeld: false,
  accelKeyHeld: false,
  keyLeftHeld: false,
  keyRightHeld: false,
  keyUpHeld: false,
  keyDownHeld: false,
  arrowLeftHeld: false,
  arrowRightHeld: false,
  arrowUpHeld: false,
  arrowDownHeld: false,
  stickId: null,
  stickOffset: { x: 0, y: 0 },
  stickSmooth: new THREE.Vector2(),
  keySmooth: new THREE.Vector2()
};

const stickArea = document.getElementById('stick-area');
const stickHandle = document.getElementById('stick-handle');
const skyThemeWash = document.getElementById('sky-theme-wash');
const themeFlash = document.getElementById('theme-flash');
const themeFlashRing = document.getElementById('theme-flash-ring');
const viewportMeta = document.querySelector('meta[name="viewport"]');
const trackCard = document.getElementById('track-card');
const trackArt = document.getElementById('track-art');
const trackControls = document.getElementById('track-controls');
const trackToggle = document.getElementById('track-toggle');
const trackNext = document.getElementById('track-next');
const lyricsToggle = document.getElementById('lyrics-toggle');
const lyricsPanel = document.getElementById('lyrics-panel');
const lyricsCurrent = document.getElementById('lyrics-current');
const lyricsFullPanel = document.getElementById('lyrics-full-panel');
const lyricsFullText = document.getElementById('lyrics-full-text');
const menuToggle = document.getElementById('menu-toggle');
const cameraCapture = document.getElementById('camera-capture');
const siteMenu = document.getElementById('site-menu');
const siteMenuBackdrop = document.getElementById('site-menu-backdrop');
const menuNavButtons = Array.from(document.querySelectorAll('.menu-nav-btn'));
const menuPages = Array.from(document.querySelectorAll('.menu-page'));
const bookOverlay = document.getElementById('book-overlay');
const bookBackdrop = document.getElementById('book-backdrop');
const bookPanel = document.getElementById('book-panel');
const bookClose = document.getElementById('book-close');
const bookViewButtons = Array.from(document.querySelectorAll('.book-mode-btn'));
const bookViews = Array.from(document.querySelectorAll('.book-view'));
const bookMessagePage = document.getElementById('book-message-page');
const bookNextPage = document.getElementById('book-next-page');
const bookForm = document.getElementById('book-form');
const bookNameInput = document.getElementById('book-name');
const bookMessageInput = document.getElementById('book-message-input');
const bookStatus = document.getElementById('book-status');
const blackBoxOverlay = document.getElementById('black-box-overlay');
const blackBoxBackdrop = document.getElementById('black-box-backdrop');
const blackBoxPanel = document.getElementById('black-box-panel');
const blackBoxTitle = document.getElementById('black-box-title');
const blackBoxClose = document.getElementById('black-box-close');
const blackBoxOpen = document.getElementById('black-box-open');
const blackBoxIgnore = document.getElementById('black-box-ignore');
const blackBoxBack = document.getElementById('black-box-back');
const blackBoxViewIntro = document.getElementById('black-box-view-intro');
const blackBoxViewReveal = document.getElementById('black-box-view-reveal');
const blackBoxCatImage = document.getElementById('black-box-cat-image');
const blackBoxCaption = document.getElementById('black-box-caption');
const blackBoxDownload = document.getElementById('black-box-download');
const musicSelectorOverlay = document.getElementById('music-selector-overlay');
const musicSelectorBackdrop = document.getElementById('music-selector-backdrop');
const musicSelectorPanel = document.getElementById('music-selector-panel');
const musicSelectorClose = document.getElementById('music-selector-close');
const musicSelectorNowPlaying = document.getElementById('music-selector-now-playing');
const musicSelectorList = document.getElementById('music-selector-list');
const cameraShutter = document.getElementById('camera-shutter');
const captureOverlay = document.getElementById('capture-overlay');
const captureBackdrop = document.getElementById('capture-backdrop');
const capturePanel = document.getElementById('capture-panel');
const captureImage = document.getElementById('capture-image');
const captureClose = document.getElementById('capture-close');
const captureSave = document.getElementById('capture-save');
const captureShare = document.getElementById('capture-share');
const endingWhiteout = document.getElementById('ending-whiteout');
const endingTrueMessage = document.getElementById('ending-true-message');
const endingOverlay = document.getElementById('ending-overlay');
const endingPanel = document.getElementById('ending-panel');
const endingRise = document.getElementById('ending-rise');
const endingRollViewport = document.getElementById('ending-roll-viewport');
const endingRollTrack = document.getElementById('ending-roll-track');
const endingRestartTrigger = document.getElementById('ending-restart-trigger');
const endingReturneesList = document.getElementById('ending-returnees-list');
const endingTrueReturneesList = document.getElementById('ending-true-returnees-list');
const endingRollCredits = endingRollTrack ? Array.from(endingRollTrack.querySelectorAll('.ending-roll-credit')) : [];
const endingRollLastCredit = endingTrueReturneesList?.closest('.ending-roll-credit')
  || endingRollCredits[endingRollCredits.length - 2]
  || endingRollCredits[endingRollCredits.length - 1]
  || null;
const endingClose = document.getElementById('ending-close');
const catRouteBubble = document.getElementById('cat-route-bubble');
const hud = document.getElementById('hud');
const infoPanel = document.getElementById('info');
setBlackBoxRevealImage(0);
const visualizerBars = Array.from(document.querySelectorAll('.viz-bar'));
const speedLockPanel = document.getElementById('speed-lock-panel');
const speedLockSlider = document.getElementById('speed-lock-slider');
const speedLockRail = document.getElementById('speed-lock-rail');
const speedLockFill = document.getElementById('speed-lock-fill');
const speedLockThumb = document.getElementById('speed-lock-thumb');
const speedLockValue = document.getElementById('speed-lock-value');
const STICK_LIMIT = 50;
const tempStick = new THREE.Vector2();
const tempKey = new THREE.Vector2();
const tempProjected = new THREE.Vector3();
const tempCameraDir = new THREE.Vector3();
const tempPoopUp = new THREE.Vector3();
const tempPoopQuat = new THREE.Quaternion();
const accelPointers = new Set();
const backgroundTapCandidates = new Map();
const tapSequence = {
  count: 0,
  at: -Infinity,
  x: 0,
  y: 0
};
let speedLockSelection = 40;
let speedLockPointerId = null;
let activeMenuPage = 'about';

function applySkyPalette(mode) {
  const palette = SKY_PALETTES[mode] ?? SKY_PALETTES.normal;
  skyMat.uniforms.dayZenith.value.copy(palette.dayZenith);
  skyMat.uniforms.dayHorizon.value.copy(palette.dayHorizon);
  skyMat.uniforms.duskZenith.value.copy(palette.duskZenith);
  skyMat.uniforms.duskHorizon.value.copy(palette.duskHorizon);
  skyMat.uniforms.nightZenith.value.copy(palette.nightZenith);
  skyMat.uniforms.nightHorizon.value.copy(palette.nightHorizon);
}

function getWorldThemeFilter() {
  if (themeState.mode === 'monochrome') return MONOCHROME_WORLD_FILTER;
  if (themeState.mode === 'inverted') return INVERT_WORLD_FILTER;
  return 'none';
}

function hasDayNightInversion() {
  return returnRouteState.phase === RETURN_ROUTE_PHASES.INVERTED || returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY;
}

function getActiveSunDirection(target) {
  return target.copy(hasDayNightInversion() ? NIGHT_CENTER : SUN_DIRECTION);
}

function applyWorldTheme() {
  const isInverted = themeState.mode === 'inverted';
  if (themeState.mode !== 'monochrome' && returnRouteState.phase === RETURN_ROUTE_PHASES.CHALLENGE) {
    failMonochromeChallenge();
  }
  canvas.style.filter = getWorldThemeFilter();
  applySkyPalette(isInverted ? 'inverted' : 'normal');
  const lyricColor = isInverted ? 'rgba(10, 10, 10, 0.94)' : 'rgba(249, 252, 255, 0.98)';
  const lyricShadow = isInverted
    ? '0 1px 6px rgba(255,255,255,0.26), 0 6px 18px rgba(255,255,255,0.14)'
    : '0 2px 6px rgba(0,0,0,0.34), 0 10px 24px rgba(0,0,0,0.18)';
  if (lyricsCurrent) {
    lyricsCurrent.style.setProperty('color', lyricColor, 'important');
    lyricsCurrent.style.setProperty('-webkit-text-fill-color', lyricColor, 'important');
    lyricsCurrent.style.setProperty('text-shadow', lyricShadow, 'important');
  }
  if (lyricsFullText) {
    const fullColor = isInverted ? 'rgba(12, 12, 12, 0.84)' : 'rgba(244, 248, 255, 0.72)';
    const fullShadow = isInverted
      ? '0 1px 5px rgba(255,255,255,0.22)'
      : '0 2px 8px rgba(0,0,0,0.26)';
    lyricsFullText.style.setProperty('color', fullColor, 'important');
    lyricsFullText.style.setProperty('-webkit-text-fill-color', fullColor, 'important');
    lyricsFullText.style.setProperty('text-shadow', fullShadow, 'important');
  }
  syncMonochromeBgmState();
  syncMonochromeEffectState();
}

function getInvertedSkyWashState() {
  camera.getWorldDirection(tempCameraDir);
  const sunView = tempCameraDir.dot(getActiveSunDirection(activeSunDirection));
  const dayMix = THREE.MathUtils.clamp((sunView + 0.08) / 0.62, 0, 1);
  const nightMix = THREE.MathUtils.clamp((-sunView + 0.08) / 0.72, 0, 1);
  const green = new THREE.Color(0xdfffd8);
  const yellow = new THREE.Color(0xffea84);
  const wash = yellow.clone().lerp(green, dayMix);
  const alpha = 0.22 + dayMix * 0.4 + nightMix * 0.18;
  return {
    r: Math.round(wash.r * 255),
    g: Math.round(wash.g * 255),
    b: Math.round(wash.b * 255),
    alpha,
    midAlpha: alpha * 0.68,
    lowerAlpha: alpha * 0.18
  };
}

function forceViewportReset() {
  if (!viewportMeta) return;
  const baseContent = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
  requestAnimationFrame(() => {
    viewportMeta.setAttribute('content', baseContent);
  });
}

function isInsideThemeTrigger(point) {
  const candidates = collectThemeCandidateZones(
    point,
    maxStaticThemeTriggerRadius + PLAYER_THEME_HIT_RADIUS,
    themeCandidateZones
  );
  for (const zone of candidates) {
    copyThemeZoneCenter(themeZoneCenter, zone);
    const limit = zone.radius + PLAYER_THEME_HIT_RADIUS;
    if (point.distanceToSquared(themeZoneCenter) <= limit * limit) {
      return true;
    }
  }
  return false;
}

function isInsideThemeTriggerTag(point, tag) {
  const candidates = collectThemeCandidateZones(
    point,
    maxStaticThemeTriggerRadius + PLAYER_THEME_HIT_RADIUS,
    themeCandidateZones,
    tag
  );
  for (const zone of candidates) {
    copyThemeZoneCenter(themeZoneCenter, zone);
    const limit = zone.radius + PLAYER_THEME_HIT_RADIUS;
    if (point.distanceToSquared(themeZoneCenter) <= limit * limit) {
      return true;
    }
  }
  return false;
}

function startThemeFlash(contactPoint) {
  themeState.flashActive = true;
  themeState.flashTime = 0;
  if (contactPoint) {
    themeState.flashWorldPoint.copy(contactPoint);
    themeProjected.copy(contactPoint).project(camera);
    themeFlashScreen.set(
      (themeProjected.x * 0.5 + 0.5) * window.innerWidth,
      (-themeProjected.y * 0.5 + 0.5) * window.innerHeight
    );
  } else {
    themeFlashScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5);
  }
  themeState.flashScreenPoint.copy(themeFlashScreen);
}

function setWorldTheme(nextMode, contactPoint, options = {}) {
  const force = options.force === true;
  if (!force && (!themeState.armed || themeState.cooldown > 0 || themeState.clearRequired)) return false;
  triggerThemeDuck();
  themeState.mode = nextMode;
  themeState.cooldown = THEME_TRIGGER_COOLDOWN;
  themeState.clearRequired = true;
  if (force) {
    themeState.armed = true;
    themeState.startupGrace = 0;
  }
  applyWorldTheme();
  startThemeFlash(contactPoint);
  return true;
}

function applyDayNightProgression() {
  getActiveSunDirection(activeSunDirection);
  skyMat.uniforms.sunDirection.value.copy(activeSunDirection);
  atmosphereMat.uniforms.sunDirection.value.copy(activeSunDirection);
  sun.position.copy(activeSunDirection).multiplyScalar(SUN_DISTANCE * 0.9);
  sunLight.position.copy(activeSunDirection).multiplyScalar(SUN_DISTANCE);
  nightFill.position.copy(activeSunDirection).multiplyScalar(-SUN_DISTANCE * 0.8);
}

function getSanctuaryTriggerWorldPosition(target) {
  return sanctuary.localToWorld(target.set(0, SANCTUARY_TRIGGER_HEIGHT, 0));
}

function getSanctuaryRingTriggerWorldPosition(target) {
  return sanctuary.localToWorld(target.set(0, SANCTUARY_RING_TRIGGER_HEIGHT, 0));
}

function getSanctuaryBoundsTriggerWorldPosition(target) {
  return sanctuary.localToWorld(target.copy(sanctuaryBoundsTriggerLocalCenter));
}

function getSanctuaryBeamBaseWorldPosition(target) {
  return sanctuary.localToWorld(target.set(0, 66, 0));
}

function getSanctuaryBeamTipWorldPosition(target) {
  return sanctuary.localToWorld(target.set(0, SANCTUARY_BEAM_HEIGHT + 66, 0));
}

function getSanctuaryBeamDirection(target) {
  getSanctuaryBeamBaseWorldPosition(sanctuaryBeamBaseWorld);
  getSanctuaryBeamTipWorldPosition(sanctuaryBeamTopWorld);
  return target.copy(sanctuaryBeamTopWorld).sub(sanctuaryBeamBaseWorld).normalize();
}

function projectVectorOnPlane(target, vector, planeNormal) {
  return target.copy(vector).addScaledVector(planeNormal, -vector.dot(planeNormal));
}

function getBeamAxisDistanceForPosition(position) {
  if (returnRouteState.beamDirection.lengthSq() < 0.0001) return 0;
  getSanctuaryBeamBaseWorldPosition(sanctuaryBeamBaseWorld);
  return Math.max(
    0,
    beamRelativeWorld.copy(position).sub(sanctuaryBeamBaseWorld).dot(returnRouteState.beamDirection)
  );
}

function getBeamClosestPointForPosition(position, target) {
  const axisDistance = getBeamAxisDistanceForPosition(position);
  return target.copy(sanctuaryBeamBaseWorld).addScaledVector(returnRouteState.beamDirection, axisDistance);
}

function getEarthReturnWorldPosition(target) {
  getSanctuaryBeamTipWorldPosition(sanctuaryBeamTopWorld);
  return target.copy(sanctuaryBeamTopWorld)
    .addScaledVector(returnRouteState.beamDirection, EARTH_RETURN_DISTANCE - SANCTUARY_BEAM_HEIGHT);
}

function triggerEarthEnding() {
  if (endingUiState.completed) return;
  catRouteState.reachedEarth = true;
  catRouteState.reachedEarthWithCat = catRouteState.catFollowing;
  endingUiState.trueEnding = catRouteState.reachedEarthWithCat;
  endingUiState.trueMessageActive = false;
  endingUiState.trueMessageTime = 0;
  endingUiState.completed = true;
  endingUiState.whiteoutActive = true;
  endingUiState.whiteoutTime = 0;
  endingUiState.transitionTime = 0;
  endingUiState.rollTime = 0;
  catRouteState.bubbleActive = false;
  setCatRouteBubbleVisible(false);
  stopBgmForEnding();
  stopEffectAudio(monochromeClockAudio, true);
  stopEffectAudio(spaceReturnAudio, true);
  playEffectAudio(earthArrivalAudio, { restart: true });
  setEndingOverlayOpen(false);
  setEndingOverlayTransitioning(false);
  if (endingRise) {
    endingRise.style.animation = 'none';
    endingRise.offsetHeight;
    endingRise.style.animation = '';
  }
  endingWhiteout?.classList.add('is-active');
  earthReturn.earth.visible = false;
  earthReturn.glow.visible = false;
  refreshCatRouteAvailability();
  if (catRouteState.hasWrittenNameInBook) {
    renderEndingReturnHistory([
      {
        id: `pending-return-${Date.now()}`,
        playerName: catRouteState.bookPlayerName,
        isTrueReturn: catRouteState.reachedEarthWithCat,
        createdAt: new Date().toISOString()
      },
      ...returnHistoryState.entries
    ]);
  }
  void recordReturnHistoryForEnding();
  syncEndingPresentation();
}

function ensureSpaceParallelUpDirection() {
  if (returnRouteState.beamDirection.lengthSq() < 0.0001) return;
  if (returnRouteState.spaceUpDirection.lengthSq() >= 0.0001) return;

  projectVectorOnPlane(spaceUpCandidate, state.visualUp, returnRouteState.beamDirection);
  if (spaceUpCandidate.lengthSq() < 0.0001) {
    getBeamClosestPointForPosition(state.pos, beamClosestPointWorld);
    beamRelativeWorld.copy(state.pos).sub(beamClosestPointWorld);
    projectVectorOnPlane(spaceUpCandidate, beamRelativeWorld, returnRouteState.beamDirection);
  }
  if (spaceUpCandidate.lengthSq() < 0.0001) {
    spaceUpCandidate.crossVectors(
      Math.abs(returnRouteState.beamDirection.dot(WORLD_UP)) < 0.92 ? WORLD_UP : fallbackSpaceAxis,
      returnRouteState.beamDirection
    );
  }
  if (spaceUpCandidate.lengthSq() < 0.0001) {
    spaceUpCandidate.set(0, 1, 0);
  }
  returnRouteState.spaceUpDirection.copy(spaceUpCandidate).normalize();
  alignSpaceForwardToReturnTarget(returnRouteState.spaceUpDirection);
  state.radialSpeed = 0;
}

function alignSpaceForwardToReturnTarget(controlUp = returnRouteState.spaceUpDirection) {
  if (controlUp.lengthSq() < 0.0001) return;

  let hasTarget = false;
  if (returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY) {
    getEarthReturnWorldPosition(earthWorldPosition);
    earthGuideDirection.copy(earthWorldPosition).sub(state.pos);
    if (earthGuideDirection.lengthSq() > 0.0001) {
      projectVectorOnPlane(spaceForwardProjected, earthGuideDirection, controlUp);
      hasTarget = spaceForwardProjected.lengthSq() > 0.0001;
    }
  }
  if (!hasTarget) {
    projectVectorOnPlane(spaceForwardProjected, returnRouteState.beamDirection, controlUp);
  }
  if (spaceForwardProjected.lengthSq() > 0.0001) {
    state.forward.copy(spaceForwardProjected).normalize();
    state.visualForward.copy(state.forward);
  }
}

function getMonochromeSphereHit(start, end) {
  if (hasDayNightInversion()) return null;

  const candidates = [
    {
      object: dayMonochromeSphere,
      tag: 'day-monochrome-sphere',
      originTag: 'day',
      radius: DAY_MONO_SPHERE_RADIUS
    },
    {
      object: nightMonochromeSphere,
      tag: 'night-monochrome-sphere',
      originTag: 'night',
      radius: NIGHT_MONO_SPHERE_RADIUS
    }
  ];

  let best = null;
  let bestT = Infinity;
  for (const candidate of candidates) {
    candidate.object.getWorldPosition(monochromeSphereWorld);
    const t = getSegmentSphereHit(
      start,
      end,
      monochromeSphereWorld,
      candidate.radius + PLAYER_THEME_HIT_RADIUS + 1.8
    );
    if (t !== null && t < bestT) {
      bestT = t;
      best = {
        ...candidate,
        point: themeClosestPoint.clone()
      };
    }
  }
  return best;
}

function armMonochromeChallenge(originTag) {
  returnRouteState.phase = RETURN_ROUTE_PHASES.CHALLENGE;
  returnRouteState.originTag = originTag;
  returnRouteState.targetTag = originTag === 'night' ? 'day-monochrome-sphere' : 'night-monochrome-sphere';
  returnRouteState.targetDirection.copy(originTag === 'night' ? SUN_DIRECTION : NIGHT_CENTER);
}

function failMonochromeChallenge() {
  returnRouteState.phase = RETURN_ROUTE_PHASES.IDLE;
  returnRouteState.originTag = null;
  returnRouteState.targetTag = 'night-monochrome-sphere';
  returnRouteState.targetDirection.copy(NIGHT_CENTER);
  returnRouteState.sanctuaryActivationTime = 0;
  returnRouteState.sanctuaryStartAltitude = 0;
  returnRouteState.earthApproachStartDistance = 0;
  returnRouteState.spaceUpDirection.set(0, 0, 0);
  returnRouteState.spaceActivationCharge = 0;
  returnRouteState.spaceTransition = 0;
  returnRouteState.spaceCameraSnapPending = false;
  returnRouteState.spaceParallelActive = false;
  returnRouteState.spaceFlightActive = false;
  refreshCatRouteAvailability();
}

function completeMonochromeChallenge(contactPoint) {
  returnRouteState.phase = RETURN_ROUTE_PHASES.INVERTED;
  returnRouteState.originTag = null;
  returnRouteState.targetTag = 'night-monochrome-sphere';
  returnRouteState.targetDirection.copy(NIGHT_CENTER);
  returnRouteState.sanctuaryActivationTime = 0;
  returnRouteState.sanctuaryStartAltitude = 0;
  returnRouteState.earthApproachStartDistance = 0;
  returnRouteState.spaceUpDirection.set(0, 0, 0);
  returnRouteState.spaceActivationCharge = 0;
  returnRouteState.spaceTransition = 0;
  returnRouteState.spaceCameraSnapPending = false;
  returnRouteState.spaceParallelActive = false;
  returnRouteState.spaceFlightActive = false;
  themeState.mode = 'normal';
  themeState.cooldown = THEME_TRIGGER_COOLDOWN;
  themeState.clearRequired = true;
  applyDayNightProgression();
  applyWorldTheme();
  startThemeFlash(contactPoint);
  refreshCatRouteAvailability();
}

function activateSanctuary(contactPoint) {
  if (returnRouteState.phase !== RETURN_ROUTE_PHASES.INVERTED) return;
  returnRouteState.phase = RETURN_ROUTE_PHASES.SANCTUARY;
  returnRouteState.sanctuaryActivationTime = 0;
  returnRouteState.sanctuaryStartAltitude = Math.max(0, getAltitude(state.pos));
  returnRouteState.earthApproachStartDistance = 0;
  returnRouteState.spaceUpDirection.set(0, 0, 0);
  returnRouteState.spaceActivationCharge = 0;
  returnRouteState.spaceTransition = 0;
  returnRouteState.spaceCameraSnapPending = false;
  returnRouteState.spaceParallelActive = false;
  returnRouteState.spaceFlightActive = false;
  getSanctuaryBeamDirection(returnRouteState.beamDirection);
  if (returnRouteState.beamDirection.lengthSq() < 0.0001) {
    returnRouteState.beamDirection.copy(SANCTUARY_DIR).normalize();
  }
  triggerThemeDuck();
  startThemeFlash(contactPoint);
  refreshCatRouteAvailability();
}

function debugJumpToSanctuaryCheckpoint() {
  closeCaptureOverlay();
  closeBookOverlay();
  closeBlackBoxOverlay();
  closeEndingOverlay();
  setSiteMenuOpen(false);

  stopEffectAudio(monochromeClockAudio, true);
  stopEffectAudio(earthArrivalAudio, true);
  stopEffectAudio(endingRollAudio, true);
  stopEffectAudio(spaceReturnAudio, true);

  themeState.mode = 'normal';
  themeState.cooldown = 0;
  themeState.flashActive = false;
  themeState.flashTime = 0;
  themeState.armed = true;
  themeState.startupGrace = 0;
  themeState.clearRequired = false;

  returnRouteState.phase = RETURN_ROUTE_PHASES.INVERTED;
  returnRouteState.originTag = null;
  returnRouteState.targetTag = 'night-monochrome-sphere';
  returnRouteState.targetDirection.copy(NIGHT_CENTER);
  returnRouteState.sanctuaryActivationTime = 0;
  returnRouteState.sanctuaryStartAltitude = 0;
  returnRouteState.earthApproachStartDistance = 0;
  returnRouteState.spaceUpDirection.set(0, 0, 0);
  returnRouteState.spaceActivationCharge = 0;
  returnRouteState.spaceTransition = 0;
  returnRouteState.spaceCameraSnapPending = false;
  returnRouteState.spaceParallelActive = false;
  returnRouteState.spaceFlightActive = false;

  const sanctuaryUp = sanctuary.position.clone().normalize();
  const sanctuaryForward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(sanctuary.quaternion)
    .addScaledVector(sanctuaryUp, 0)
    .normalize();
  const startDirection = sanctuaryUp.clone().addScaledVector(sanctuaryForward, -0.1).normalize();
  const startAltitude = Math.max(P.NEUTRAL_ALTITUDE, 10);
  state.pos.copy(startDirection).multiplyScalar(getSurfaceRadius(startDirection) + PLAYER_CLEARANCE + startAltitude);

  const towardSanctuary = sanctuary.position.clone()
    .sub(state.pos)
    .addScaledVector(startDirection, -sanctuary.position.clone().sub(state.pos).dot(startDirection));
  if (towardSanctuary.lengthSq() > 0.0001) {
    state.forward.copy(towardSanctuary.normalize());
  } else {
    state.forward.copy(sanctuaryForward);
  }
  state.visualForward.copy(state.forward);
  state.visualUp.copy(startDirection);
  state.radialSpeed = 0;
  state.currentSpeed = Math.max(state.speedLock, 40);
  state.holdAccel = 0;
  state.diveTimer = 0;
  state.diveEnergy = 0;
  state.onGround = false;
  state.wasOnGround = false;
  state.flaps = P.MAX_FLAPS;
  state.bodyPitch = 0;
  state.roll = 0;
  state.loopSpinActive = false;
  state.loopSpinTime = 0;
  state.loopSpinAngle = 0;
  verticalLoopState.radius = 0;
  verticalLoopState.recoveryTime = 0;
  state.screwSpinActive = false;
  state.screwSpinTime = 0;
  state.screwSpinAngle = 0;
  state.screwForwardOffset = 0;
  state.cameraLookMode = CAMERA_LOOK_MODES.CHASE;
  state.cameraYawTarget = 0;
  state.cameraLensTarget = 0;
  state.cameraYawOffset = 0;
  state.cameraLensOffset = 0;
  state.cameraLift = 0;

  activateSanctuary(sanctuary.position.clone());
  applyDayNightProgression();
  applyWorldTheme();
  syncMusicUiVisibility();
  syncSpaceReturnAudioState();
}

function toggleWorldInversion(contactPoint) {
  const nextMode = themeState.mode === 'inverted' ? 'normal' : 'inverted';
  setWorldTheme(nextMode, contactPoint);
}

function activateMonochromeWorld(contactPoint, options = {}) {
  return setWorldTheme('monochrome', contactPoint, options);
}

function getCompassGuidanceMode() {
  if (
    themeState.mode === 'monochrome' &&
    returnRouteState.phase === RETURN_ROUTE_PHASES.CHALLENGE
  ) {
    return 'monochrome';
  }
  if (
    returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY &&
    blackBoxUiState.openedOnce &&
    blackBoxUiState.mode === 'grounded'
  ) {
    return 'black-box';
  }
  return null;
}

function getCompassGuidanceDirection(target = compassTargetDirectionScratch, mode = getCompassGuidanceMode()) {
  if (mode === 'monochrome') {
    target.copy(returnRouteState.targetDirection);
  } else if (mode === 'black-box') {
    target.copy(blackBoxLandmark.position);
  } else {
    return null;
  }
  if (target.lengthSq() < 0.0001) return null;
  return target.normalize();
}

function clearCompassAssist() {
  compassAssistState.active = false;
  compassAssistState.time = 0;
  compassAssistState.targetDirection.set(0, 0, 0);
}

function tryActivateCompassAssist(start, end) {
  if (returnRouteState.spaceFlightActive) return false;
  if (compassAssistState.cooldown > 0 || compassAssistState.rearmRequired) return false;
  const guidanceMode = getCompassGuidanceMode();
  if (!guidanceMode) return false;
  if (!getCompassGuidanceDirection(compassAssistTargetScratch, guidanceMode)) return false;
  const hit = getSegmentSphereHit(
    start,
    end,
    duskTower.position,
    COMPASS_ASSIST_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS
  );
  if (hit === null) return false;
  compassAssistState.active = true;
  compassAssistState.time = 0;
  compassAssistState.cooldown = COMPASS_ASSIST_COOLDOWN;
  compassAssistState.rearmRequired = true;
  compassAssistState.targetDirection.copy(compassAssistTargetScratch);
  resetCameraLook();
  return true;
}

function handleMonochromeSphereTrigger(hit, contactPoint) {
  if (returnRouteState.phase === RETURN_ROUTE_PHASES.CHALLENGE) {
    if (hit.tag === returnRouteState.targetTag) {
      completeMonochromeChallenge(contactPoint);
      return;
    }
    if (hit.tag === `${returnRouteState.originTag}-monochrome-sphere`) {
      return;
    }
  }

  if (activateMonochromeWorld(contactPoint, { force: true })) {
    armMonochromeChallenge(hit.originTag);
  }
}

function checkThemeTriggerCollision(start, end) {
  const monochromeHit = getMonochromeSphereHit(start, end);
  if (monochromeHit) {
    handleMonochromeSphereTrigger(monochromeHit, monochromeHit.point);
    return;
  }

  if (
    giantRecordPlayer &&
    returnRouteState.phase !== RETURN_ROUTE_PHASES.CHALLENGE &&
    themeState.mode !== 'monochrome' &&
    !returnRouteState.spaceFlightActive &&
    !endingUiState.open &&
    !endingUiState.transitionActive &&
    !endingUiState.whiteoutActive
  ) {
    const musicSelectorHit = getSegmentSphereHit(
      start,
      end,
      giantRecordPlayer.position,
      GIANT_RECORD_PLAYER_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS
    );
    if (musicSelectorHit !== null) {
      handleMusicSelectorTrigger();
      return;
    }
  }

  const blackBoxInteractionHit = getGroundedBlackBoxInteractionHit(start, end);
  if (blackBoxInteractionHit !== null) {
    handleBlackBoxTrigger(themeClosestPoint.clone());
    return;
  }

  if (returnRouteState.phase === RETURN_ROUTE_PHASES.INVERTED) {
    getSanctuaryTriggerWorldPosition(sanctuaryTriggerWorld);
    let sanctuaryHit = getSegmentSphereHit(
      start,
      end,
      sanctuaryTriggerWorld,
      SANCTUARY_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS
    );
    getSanctuaryRingTriggerWorldPosition(sanctuaryRingTriggerWorld);
    const sanctuaryRingHit = getSegmentSphereHit(
      start,
      end,
      sanctuaryRingTriggerWorld,
      SANCTUARY_RING_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS
    );
    if (sanctuaryHit === null || (sanctuaryRingHit !== null && sanctuaryRingHit < sanctuaryHit)) {
      sanctuaryHit = sanctuaryRingHit;
    }
    getSanctuaryBoundsTriggerWorldPosition(sanctuaryTriggerWorld);
    const sanctuaryBoundsHit = getSegmentSphereHit(
      start,
      end,
      sanctuaryTriggerWorld,
      sanctuaryBoundsTriggerRadius + PLAYER_THEME_HIT_RADIUS
    );
    if (sanctuaryHit === null || (sanctuaryBoundsHit !== null && sanctuaryBoundsHit < sanctuaryHit)) {
      sanctuaryHit = sanctuaryBoundsHit;
    }
    if (sanctuaryHit !== null) {
      activateSanctuary(themeClosestPoint.clone());
      return;
    }
  }

  if (tryActivateCompassAssist(start, end)) {
    return;
  }

  if (!hasDayNightInversion() && (!themeState.armed || themeState.cooldown > 0 || themeState.clearRequired)) return;

  let bestT = Infinity;
  let bestPoint = null;
  let bestZone = null;
  const segmentHalfLength = Math.sqrt(start.distanceToSquared(end)) * 0.5;
  const segmentPadding = segmentHalfLength + maxStaticThemeTriggerRadius + PLAYER_THEME_HIT_RADIUS;
  themeSegmentMidpoint.copy(start).lerp(end, 0.5);
  const candidates = collectThemeCandidateZones(themeSegmentMidpoint, segmentPadding, themeCandidateZones);

  for (const zone of candidates) {
    if (zone.canTrigger && !zone.canTrigger()) continue;
    copyThemeZoneCenter(themeZoneCenter, zone);
    const t = getSegmentSphereHit(start, end, themeZoneCenter, zone.radius + PLAYER_THEME_HIT_RADIUS);
    if (t !== null && t < bestT) {
      bestT = t;
      bestPoint = themeClosestPoint.clone();
      bestZone = zone;
    }
  }

  if (bestPoint) {
    if (returnRouteState.phase === RETURN_ROUTE_PHASES.CHALLENGE) {
      failMonochromeChallenge();
      toggleWorldInversion(bestPoint);
      if (bestZone?.onTrigger) {
        bestZone.onTrigger(bestPoint.clone());
      }
      return;
    }
    if (hasDayNightInversion()) {
      if (bestZone?.tag === 'book' || bestZone?.tag === 'black-box') {
        bestZone.onTrigger?.(bestPoint.clone());
      }
      return;
    }
    toggleWorldInversion(bestPoint);
    if (bestZone?.onTrigger) {
      bestZone.onTrigger(bestPoint.clone());
    }
  }
}

function updateThemeSystem(dt) {
  if (themeState.cooldown > 0) {
    themeState.cooldown = Math.max(0, themeState.cooldown - dt);
  }

  if (themeState.clearRequired && !isInsideThemeTrigger(state.pos)) {
    themeState.clearRequired = false;
  }

  if (!themeState.armed) {
    themeState.startupGrace = Math.max(0, themeState.startupGrace - dt);
    if (
      themeState.startupGrace <= 0 &&
      state.pos.distanceTo(startPosition) >= THEME_ARM_DISTANCE &&
      !isInsideThemeTrigger(state.pos)
    ) {
      themeState.armed = true;
    }
  }
}

function updateThemeFlash(dt) {
  if (!themeFlash) return;
  if (!themeState.flashActive) {
    if (themeFlash.style.opacity !== '0') {
      themeFlash.style.opacity = '0';
      themeFlash.style.background = 'rgba(0,0,0,0)';
    }
    if (themeFlashRing) {
      themeFlashRing.style.opacity = '0';
      themeFlashRing.style.transform = 'translate(-50%, -50%) scale(0.15)';
    }
    return;
  }

  themeState.flashTime += dt;
  const progress = THREE.MathUtils.clamp(themeState.flashTime / THEME_FLASH_DURATION, 0, 1);
  if (progress >= 1) {
    themeState.flashActive = false;
    themeFlash.style.opacity = '0';
    themeFlash.style.background = 'rgba(0,0,0,0)';
    if (themeFlashRing) {
      themeFlashRing.style.opacity = '0';
      themeFlashRing.style.transform = 'translate(-50%, -50%) scale(0.15)';
    }
    return;
  }

  const veilOpacity = Math.max(0, 0.08 * (1 - progress * 0.88));
  const ringOpacity = Math.max(0, 0.9 * (1 - progress * 0.94));
  const ringScale = THREE.MathUtils.lerp(0.12, 20.0, progress);

  themeFlash.style.opacity = '1';
  themeFlash.style.background = `rgba(0, 0, 0, ${veilOpacity.toFixed(3)})`;
  themeFlash.style.setProperty('--flash-x', `${themeState.flashScreenPoint.x.toFixed(1)}px`);
  themeFlash.style.setProperty('--flash-y', `${themeState.flashScreenPoint.y.toFixed(1)}px`);
  if (themeFlashRing) {
    themeFlashRing.style.opacity = ringOpacity.toFixed(3);
    themeFlashRing.style.transform = `translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
  }
}

function updateInvertedSkyWash() {
  if (!skyThemeWash) return;
  if (themeState.mode !== 'inverted') {
    if (skyThemeWash.style.opacity !== '0') {
      skyThemeWash.style.opacity = '0';
      skyThemeWash.style.background = 'none';
    }
    return;
  }

  const wash = getInvertedSkyWashState();

  skyThemeWash.style.opacity = '1';
  skyThemeWash.style.background = `linear-gradient(180deg,
    rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.alpha.toFixed(3)}) 0%,
    rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.midAlpha.toFixed(3)}) 42%,
    rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.lowerAlpha.toFixed(3)}) 68%,
    rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.0) 78%)`;
}

function queueFlap() {
  input.flapQueued = true;
}

function refreshAccelHeld() {
  input.accelHeld = input.accelKeyHeld || accelPointers.size > 0;
}

function resetCameraLook(forceImmediate = false) {
  input.lookId = null;
  input.lookDragging = false;
  state.cameraLookMode = CAMERA_LOOK_MODES.CHASE;
  state.cameraYawTarget = 0;
  state.cameraLensTarget = 0;
  if (forceImmediate) {
    state.cameraYawOffset = 0;
    state.cameraLensOffset = 0;
  }
}

function releaseCameraLook() {
  input.lookId = null;
  input.lookDragging = false;
  state.cameraLensTarget = 0;
}

function triggerVerticalLoop() {
  if (
    state.loopSpinActive ||
    state.screwSpinActive ||
    returnRouteState.spaceFlightActive ||
    endingUiState.open ||
    endingUiState.transitionActive ||
    endingUiState.whiteoutActive
  ) {
    return;
  }
  verticalLoopState.startPos.copy(state.pos);
  verticalLoopState.startUp.copy(state.pos).normalize();
  projectVectorOnPlane(verticalLoopState.startForward, state.forward, verticalLoopState.startUp);
  if (verticalLoopState.startForward.lengthSq() < 0.0001) {
    verticalLoopState.startForward.copy(state.forward).normalize();
  }
  if (verticalLoopState.startForward.lengthSq() < 0.0001) {
    verticalLoopState.startForward.set(0, 0, 1);
  }
  verticalLoopState.radius = THREE.MathUtils.clamp(
    (Math.max(state.currentSpeed, P.MIN_FWD_SPEED) * P.LOOP_SPEED_SCALE * P.LOOP_DURATION) / (Math.PI * 2),
    5.5,
    12.5
  );
  verticalLoopState.recoveryTime = 0;
  state.loopSpinActive = true;
  state.loopSpinTime = 0;
  state.loopSpinAngle = 0;
  state.onGround = false;
  state.radialSpeed = 0;
  state.bodyPitch = 0;
  state.roll = 0;
}

function triggerScrewSpin() {
  state.screwSpinActive = true;
  state.screwSpinTime = 0;
  state.screwSpinAngle = 0;
  state.screwForwardOffset = 0;
  state.screwSpinDirection *= -1;
}

function resetTapSequence() {
  tapSequence.count = 0;
  tapSequence.at = -Infinity;
}

function cancelScrewSpin() {
  state.screwSpinActive = false;
  state.screwSpinTime = 0;
  state.screwSpinAngle = 0;
  state.screwForwardOffset = 0;
}

function getScrewForwardOffset(progress) {
  const delayed = THREE.MathUtils.clamp((progress - 0.22) / 0.78, 0, 1);
  return Math.pow(Math.sin(Math.PI * delayed), 1.7);
}

function spawnPoopDrop() {
  const poop = poopDrops.find((entry) => entry.userData.life <= 0) ?? poopDrops[0];
  const up = state.pos.clone().normalize();
  const forward = state.visualForward.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const baseDir = state.pos.clone()
    .addScaledVector(forward, -1.3)
    .addScaledVector(up, -0.74)
    .normalize();
  poop.visible = true;
  poop.userData.life = P.POOP_LIFETIME;
  poop.userData.grounded = false;
  poop.userData.groundDir.copy(baseDir);
  poop.position.copy(state.pos)
    .addScaledVector(forward, -0.55)
    .addScaledVector(up, -0.58)
    .addScaledVector(right, (Math.random() - 0.5) * 0.18);
  poop.rotation.set(Math.random() * 0.16, Math.random() * Math.PI * 2, Math.random() * 0.12);
  poop.scale.setScalar(0.2);
  poop.userData.velocity.copy(forward).multiplyScalar(8.4)
    .addScaledVector(up, -2.4)
    .addScaledVector(right, (Math.random() - 0.5) * 0.6);
}

function registerBackgroundTapCandidate(pointerId, x, y) {
  backgroundTapCandidates.set(pointerId, {
    x,
    y,
    at: performance.now() / 1000,
    eligible: true
  });
}

function invalidateBackgroundTapCandidate(pointerId, x, y) {
  const candidate = backgroundTapCandidates.get(pointerId);
  if (!candidate || !candidate.eligible) return;
  if (Math.hypot(x - candidate.x, y - candidate.y) > P.TAP_MOVE_TOLERANCE) {
    candidate.eligible = false;
  }
}

function resolveBackgroundTap(pointerId, x, y) {
  const candidate = backgroundTapCandidates.get(pointerId);
  backgroundTapCandidates.delete(pointerId);
  if (!candidate || !candidate.eligible) return false;
  const now = performance.now() / 1000;
  if (now - candidate.at > P.TAP_MAX_DURATION) return false;
  const continuesSequence =
    tapSequence.count > 0 &&
    now - tapSequence.at <= P.DOUBLE_TAP_WINDOW &&
    Math.hypot(x - tapSequence.x, y - tapSequence.y) <= P.DOUBLE_TAP_DISTANCE;

  if (!continuesSequence) {
    tapSequence.count = 1;
  } else {
    tapSequence.count += 1;
  }
  tapSequence.at = now;
  tapSequence.x = x;
  tapSequence.y = y;

  if (tapSequence.count === 2) {
    triggerScrewSpin();
    return true;
  }

  if (tapSequence.count >= 3) {
    cancelScrewSpin();
    spawnPoopDrop();
    resetTapSequence();
    return true;
  }

  return false;
}

function getSpeedLockSelection() {
  return THREE.MathUtils.clamp(speedLockSelection, 12, 120);
}

function setSpeedLockSelection(value) {
  speedLockSelection = THREE.MathUtils.clamp(Math.round(value), 12, 120);
}

function updateSpeedLockFromPointer(clientY) {
  if (!speedLockRail) return;
  const rect = speedLockRail.getBoundingClientRect();
  const trackInset = 12;
  const trackHeight = Math.max(1, rect.height - trackInset * 2);
  const y = THREE.MathUtils.clamp(clientY - rect.top - trackInset, 0, trackHeight);
  const ratio = 1 - y / trackHeight;
  setSpeedLockSelection(12 + ratio * (120 - 12));
  refreshSpeedLockUi();
}

function refreshSpeedLockUi() {
  const lockValue = getSpeedLockSelection();
  if (speedLockValue) speedLockValue.textContent = `${lockValue.toFixed(0)}`;
  if (speedLockSlider) speedLockSlider.setAttribute('aria-valuenow', `${lockValue.toFixed(0)}`);
  if (speedLockRail && speedLockFill && speedLockThumb) {
    const trackInset = 12;
    const thumbSize = 24;
    const ratio = (lockValue - 12) / (120 - 12);
    const trackHeight = Math.max(1, speedLockRail.clientHeight - trackInset * 2);
    const clampedRatio = THREE.MathUtils.clamp(ratio, 0, 1);
    const fillHeight = trackHeight * clampedRatio;
    const thumbTop = trackInset + (trackHeight - fillHeight) - thumbSize * 0.5;
    speedLockFill.style.height = `${fillHeight.toFixed(1)}px`;
    speedLockThumb.style.top = `${thumbTop.toFixed(1)}px`;
  }
  state.speedLock = lockValue;
}

function stopCurrentTrack() {
  if (bgm.paused || bgmPending) return;
  bgm.pause();
  bgm.currentTime = 0;
  bgmPausedForMonochrome = false;
  bgmSuppressedForMonochrome = false;
  bgmPausedForSpaceReturn = false;
  bgm.muted = false;
  themeDuckTimer = 0;
  themeFilterTimer = 0;
  applyBgmOutputVolume(getBgmBaseTargetVolume());
  applyBgmFilterFrequency(THEME_FILTER_BASE_FREQ);
  setRecordSpinning(false);
  refreshTrackControls();
  updateLyricsUi();
}

function nextTrack() {
  loadTrack(getNextRandomTrackIndex(), true);
}

function shuffleIndices(indices) {
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}

function refillRandomTrackQueue(excludeIndex = currentTrackIndex) {
  const indices = [];
  for (let i = 0; i < playlist.length; i++) {
    if (playlist.length > 1 && i === excludeIndex) continue;
    indices.push(i);
  }
  randomTrackQueue = shuffleIndices(indices);
}

function getNextRandomTrackIndex() {
  if (playlist.length <= 1) return 0;
  if (!randomTrackQueue.length) {
    refillRandomTrackQueue(currentTrackIndex);
  }
  const nextIndex = randomTrackQueue.shift();
  return typeof nextIndex === 'number' ? nextIndex : currentTrackIndex;
}

function getInitialRandomTrackIndex() {
  if (playlist.length <= 1) return 0;
  return INITIAL_TRACK_INDEX;
}

function setMenuPage(pageId) {
  activeMenuPage = pageId;
  for (const button of menuNavButtons) {
    button.classList.toggle('is-active', button.dataset.page === pageId);
  }
  for (const page of menuPages) {
    page.classList.toggle('is-active', page.dataset.page === pageId);
  }
}

function setSiteMenuOpen(isOpen) {
  siteMenu?.classList.toggle('is-open', isOpen);
  menuToggle?.classList.toggle('is-open', isOpen);
  menuToggle?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  siteMenu?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) resetCameraLook(true);
}

function setCaptureOverlayOpen(isOpen) {
  captureUiState.open = isOpen;
  captureOverlay?.classList.toggle('is-open', isOpen);
  captureOverlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) resetCameraLook(true);
}

function hasEndingCreditsClearedViewport() {
  if (!endingRollLastCredit) {
    return endingUiState.rollTime >= ENDING_ROLL_DURATION;
  }
  const creditBottom = endingUiState.rollCurrentY
    + endingRollLastCredit.offsetTop
    + endingRollLastCredit.offsetHeight;
  return creditBottom <= 0;
}

function syncEndingPresentation() {
  const endingVisible = endingUiState.whiteoutActive || endingUiState.transitionActive || endingUiState.open;
  const showTrueMessage = endingUiState.whiteoutActive && endingUiState.trueMessageActive;
  if (canvas) {
    canvas.style.opacity = endingVisible ? '0' : '';
  }
  if (hud) {
    hud.style.opacity = endingVisible ? '0' : '';
    hud.style.pointerEvents = endingVisible ? 'none' : '';
  }
  if (endingOverlay) {
    endingOverlay.style.position = 'fixed';
    endingOverlay.style.inset = '0';
    endingOverlay.style.zIndex = '40';
    endingOverlay.style.overflow = 'hidden';
    endingOverlay.style.opacity = endingVisible ? '1' : '0';
    endingOverlay.style.pointerEvents = endingUiState.open ? 'auto' : 'none';
    endingOverlay.style.background = endingUiState.open ? '#000' : 'rgba(0, 0, 0, 0)';
  }
  if (endingWhiteout) {
    endingWhiteout.classList.toggle('is-true-message', showTrueMessage);
    endingWhiteout.setAttribute('aria-hidden', endingVisible ? 'false' : 'true');
  }
  if (endingTrueMessage) {
    endingTrueMessage.style.opacity = showTrueMessage ? '1' : '0';
  }
  if (endingPanel) {
    endingPanel.style.position = 'absolute';
    endingPanel.style.inset = '0';
    endingPanel.style.width = '100%';
    endingPanel.style.height = '100%';
    endingPanel.style.maxWidth = 'none';
    endingPanel.style.padding = '0';
    endingPanel.style.margin = '0';
    endingPanel.style.border = '0';
    endingPanel.style.borderRadius = '0';
    endingPanel.style.boxShadow = 'none';
    endingPanel.style.backdropFilter = 'none';
    endingPanel.style.background = 'none';
    endingPanel.style.pointerEvents = endingUiState.open ? 'auto' : 'none';
  }
  if (endingRise) {
    endingRise.style.position = 'absolute';
    endingRise.style.inset = '0';
    endingRise.style.pointerEvents = 'none';
    endingRise.style.background = 'none';
    endingRise.style.opacity = '0';
  }
  if (endingRollViewport) {
    endingRollViewport.style.position = 'absolute';
    endingRollViewport.style.inset = '0';
    endingRollViewport.style.overflow = 'hidden';
    endingRollViewport.style.background = endingUiState.open ? '#000' : 'transparent';
    endingRollViewport.style.pointerEvents = endingUiState.open ? 'auto' : 'none';
  }
  if (endingRollTrack) {
    endingRollTrack.style.position = 'absolute';
    endingRollTrack.style.left = '50%';
    endingRollTrack.style.top = '0';
    endingRollTrack.style.width = '100%';
    endingRollTrack.style.display = 'flex';
    endingRollTrack.style.flexDirection = 'column';
    endingRollTrack.style.alignItems = 'center';
    endingRollTrack.style.gap = '14vh';
    endingRollTrack.style.padding = '18vh 0 34vh';
    endingRollTrack.style.animation = 'none';
    endingRollTrack.style.willChange = 'transform';
    endingRollTrack.style.pointerEvents = endingUiState.open ? 'auto' : 'none';
  }
  if (endingRestartTrigger) {
    const showRestart = endingUiState.open && hasEndingCreditsClearedViewport();
    endingRestartTrigger.classList.toggle('is-visible', showRestart);
  }
  if (endingClose) {
    endingClose.style.display = 'none';
  }
}

function layoutEndingRoll(reset = false) {
  if (!endingRollTrack) return;
  const viewportHeight = Math.max(window.innerHeight, 1);
  const startY = viewportHeight + 60;
  const endY = -(endingRollTrack.scrollHeight + viewportHeight * 0.3);
  endingUiState.rollStartY = startY;
  endingUiState.rollEndY = endY;
  if (reset) {
    endingUiState.rollTime = 0;
  }
  const progress = THREE.MathUtils.clamp(endingUiState.rollTime / ENDING_ROLL_DURATION, 0, 1);
  const y = THREE.MathUtils.lerp(endingUiState.rollStartY, endingUiState.rollEndY, progress);
  endingUiState.rollCurrentY = y;
  endingRollTrack.style.transform = `translate3d(-50%, ${y.toFixed(1)}px, 0)`;
}

function setEndingOverlayOpen(isOpen) {
  endingUiState.open = isOpen;
  endingOverlay?.classList.toggle('is-open', isOpen);
  endingOverlay?.setAttribute(
    'aria-hidden',
    (isOpen || endingUiState.transitionActive) ? 'false' : 'true'
  );
  if (isOpen) {
    stopBgmForEnding();
    queueEndingRollAudio();
  } else {
    clearEndingRollAudioDelay();
    stopEffectAudio(endingRollAudio, true);
  }
  syncEndingPresentation();
  if (isOpen) {
    layoutEndingRoll(true);
    resetCameraLook(true);
  }
}

function setEndingOverlayTransitioning(isTransitioning) {
  endingUiState.transitionActive = isTransitioning;
  endingOverlay?.classList.toggle('is-transitioning', isTransitioning);
  endingOverlay?.setAttribute(
    'aria-hidden',
    (endingUiState.open || isTransitioning) ? 'false' : 'true'
  );
  if (endingRise) {
    endingRise.style.transition = 'none';
    endingRise.style.opacity = '0';
    endingRise.style.transform = 'translate3d(0, 100%, 0)';
  }
  syncEndingPresentation();
}

function clearCaptureObjectUrl() {
  if (captureUiState.objectUrl) {
    URL.revokeObjectURL(captureUiState.objectUrl);
    captureUiState.objectUrl = '';
  }
}

function closeCaptureOverlay() {
  setCaptureOverlayOpen(false);
}

function closeEndingOverlay() {
  endingUiState.whiteoutActive = false;
  endingUiState.whiteoutTime = 0;
  endingUiState.transitionTime = 0;
  endingUiState.trueEnding = false;
  endingUiState.trueMessageActive = false;
  endingUiState.trueMessageTime = 0;
  endingUiState.rollTime = 0;
  endingUiState.rollCurrentY = endingUiState.rollStartY;
  endingWhiteout?.classList.remove('is-active');
  endingWhiteout?.classList.remove('is-true-message');
  if (endingRise) {
    endingRise.style.animation = 'none';
    endingRise.offsetHeight;
    endingRise.style.animation = '';
  }
  stopRouteEffectAudios();
  setEndingOverlayTransitioning(false);
  setEndingOverlayOpen(false);
  layoutEndingRoll(true);
}

function restartFlightFromEnding() {
  const nextUrl = new URL(window.location.href);
  nextUrl.search = '';
  nextUrl.hash = '';
  themeState.mode = 'normal';
  returnRouteState.phase = RETURN_ROUTE_PHASES.IDLE;
  returnRouteState.spaceFlightActive = false;
  returnRouteState.spaceParallelActive = false;
  returnRouteState.spaceTransition = 0;
  compassAssistState.cooldown = 0;
  compassAssistState.rearmRequired = false;
  clearCompassAssist();
  endingUiState.completed = false;
  endingUiState.trueEnding = false;
  catRouteState.reachedEarth = false;
  catRouteState.reachedEarthWithCat = false;
  closeEndingOverlay();
  applyWorldTheme();
  syncMonochromeEffectState();
  syncSpaceReturnAudioState();
  window.setTimeout(() => {
    window.location.replace(nextUrl.pathname || '/');
  }, 40);
}

function buildCaptureFileName() {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `ass-magic-flight-record-${date}-${time}.png`;
}

function triggerCameraShutter() {
  if (!cameraShutter) return;
  if (captureUiState.shutterTimer !== null) {
    window.clearTimeout(captureUiState.shutterTimer);
    captureUiState.shutterTimer = null;
  }
  cameraShutter.classList.add('is-active');
  captureUiState.shutterTimer = window.setTimeout(() => {
    cameraShutter.classList.remove('is-active');
    captureUiState.shutterTimer = null;
  }, 140);
}

function waitForPaintFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function canvasToBlob(sourceCanvas) {
  return new Promise((resolve) => {
    if (typeof sourceCanvas.toBlob === 'function') {
      sourceCanvas.toBlob((blob) => resolve(blob), 'image/png');
      return;
    }
    try {
      const dataUrl = sourceCanvas.toDataURL('image/png');
      fetch(dataUrl).then((response) => response.blob()).then(resolve).catch(() => resolve(null));
    } catch (error) {
      console.error('Failed to create capture data URL:', error);
      resolve(null);
    }
  });
}

function clamp8(value) {
  return Math.min(255, Math.max(0, value));
}

function applyColorMatrix(r, g, b, matrix) {
  return [
    r * matrix[0] + g * matrix[1] + b * matrix[2],
    r * matrix[3] + g * matrix[4] + b * matrix[5],
    r * matrix[6] + g * matrix[7] + b * matrix[8]
  ];
}

function applyMonochromeCaptureFilter(imageData) {
  const data = imageData.data;
  const brightness = 1.42;
  const contrast = 1.78;
  for (let i = 0; i < data.length; i += 4) {
    const luminance =
      data[i] * 0.2126 +
      data[i + 1] * 0.7152 +
      data[i + 2] * 0.0722;
    const brightGray = luminance * brightness;
    const contrasted = (brightGray - 128) * contrast + 128;
    const gray = clamp8(contrasted);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
}

function applyInvertedCaptureFilter(imageData) {
  const data = imageData.data;
  const hueRotate180 = [
    -0.574, 1.43, 0.144,
    0.426, 0.43, 0.144,
    0.426, 1.43, -0.856
  ];
  const saturate094 = [
    0.95278, 0.0429, 0.00432,
    0.01278, 0.9829, 0.00432,
    0.01278, 0.0429, 0.94432
  ];
  const brightness = 1.05;

  for (let i = 0; i < data.length; i += 4) {
    let r = (255 - data[i]) / 255;
    let g = (255 - data[i + 1]) / 255;
    let b = (255 - data[i + 2]) / 255;

    [r, g, b] = applyColorMatrix(r, g, b, hueRotate180);
    [r, g, b] = applyColorMatrix(r, g, b, saturate094);

    data[i] = clamp8(r * brightness * 255);
    data[i + 1] = clamp8(g * brightness * 255);
    data[i + 2] = clamp8(b * brightness * 255);
  }
}

function buildThemedCaptureCanvas() {
  if (themeState.mode === 'normal') {
    return null;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const ctx = outputCanvas.getContext('2d', { alpha: false });
  if (!ctx) return null;

  ctx.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);

  if (themeState.mode === 'monochrome' || themeState.mode === 'inverted') {
    const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    if (themeState.mode === 'inverted') {
      applyInvertedCaptureFilter(imageData);
    } else {
      applyMonochromeCaptureFilter(imageData);
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (themeState.mode === 'monochrome') {
    return outputCanvas;
  }

  if (themeState.mode === 'inverted') {
    const wash = getInvertedSkyWashState();
    const gradient = ctx.createLinearGradient(0, 0, 0, outputCanvas.height);
    gradient.addColorStop(0, `rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.alpha.toFixed(3)})`);
    gradient.addColorStop(0.42, `rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.midAlpha.toFixed(3)})`);
    gradient.addColorStop(0.68, `rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.lowerAlpha.toFixed(3)})`);
    gradient.addColorStop(0.78, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  }

  return outputCanvas;
}

function captureCanvasBlob() {
  const themedCanvas = buildThemedCaptureCanvas();
  return canvasToBlob(themedCanvas || canvas);
}

function refreshCaptureShareButton() {
  if (!captureShare) return;
  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof window.File === 'function';
  captureShare.classList.toggle('is-hidden', !canShareFiles);
}

async function shareCaptureImage() {
  if (!captureUiState.blob || !captureShare) return;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof window.File !== 'function') {
    return;
  }
  const file = new File([captureUiState.blob], captureUiState.fileName || buildCaptureFileName(), {
    type: captureUiState.blob.type || 'image/png'
  });
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return;
  }
  try {
    await navigator.share({
      title: 'ASS MAGIC 飛行記録',
      text: 'ASS MAGICの飛行風景を記録しました。',
      files: [file]
    });
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('Failed to share capture:', error);
    }
  }
}

async function captureFlightRecord() {
  if (!cameraCapture || captureUiState.busy || captureUiState.open) return;
  if (bookUiState.open || blackBoxUiState.open || siteMenu?.classList.contains('is-open')) return;
  captureUiState.busy = true;
  if (cameraCapture) cameraCapture.disabled = true;
  triggerCameraShutter();
  document.body.classList.add('is-capture-clean');
  const previousPixelRatio = renderer.getPixelRatio();

  try {
    await waitForPaintFrame();
    if (CAPTURE_PIXEL_RATIO > previousPixelRatio + 0.01) {
      renderer.setPixelRatio(CAPTURE_PIXEL_RATIO);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      await waitForPaintFrame();
    }
    renderer.render(scene, camera);
    const blob = await captureCanvasBlob();
    document.body.classList.remove('is-capture-clean');

    if (!blob) {
      throw new Error('Capture blob was empty');
    }

    clearCaptureObjectUrl();
    captureUiState.blob = blob;
    captureUiState.fileName = buildCaptureFileName();
    captureUiState.objectUrl = URL.createObjectURL(blob);
    if (captureImage) captureImage.src = captureUiState.objectUrl;
    if (captureSave) {
      captureSave.href = captureUiState.objectUrl;
      captureSave.download = captureUiState.fileName;
    }
    refreshCaptureShareButton();
    setCaptureOverlayOpen(true);
  } catch (error) {
    document.body.classList.remove('is-capture-clean');
    console.error('Failed to capture flight record:', error);
  } finally {
    if (renderer.getPixelRatio() !== previousPixelRatio) {
      renderer.setPixelRatio(previousPixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    captureUiState.busy = false;
    if (cameraCapture) cameraCapture.disabled = false;
  }
}

function cloneMessages(messages) {
  return messages.map((entry) => ({ ...entry }));
}

function cloneReturnHistoryEntries(entries) {
  return entries.map((entry) => ({ ...entry }));
}

function persistBookPlayerState() {
  try {
    window.localStorage.setItem(
      BOOK_PLAYER_STATE_STORAGE_KEY,
      JSON.stringify({
        hasWrittenNameInBook: catRouteState.hasWrittenNameInBook,
        bookPlayerName: catRouteState.bookPlayerName,
        latestBookMessageId: catRouteState.latestBookMessageId
      })
    );
  } catch (error) {
    console.warn('Failed to persist book player state:', error);
  }
}

function loadBookPlayerState() {
  try {
    const stored = window.localStorage.getItem(BOOK_PLAYER_STATE_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    const bookPlayerName = typeof parsed?.bookPlayerName === 'string' ? parsed.bookPlayerName.trim() : '';
    catRouteState.hasWrittenNameInBook = Boolean(parsed?.hasWrittenNameInBook) && bookPlayerName.length > 0;
    catRouteState.bookPlayerName = catRouteState.hasWrittenNameInBook ? bookPlayerName : '';
    catRouteState.latestBookMessageId = typeof parsed?.latestBookMessageId === 'string'
      ? parsed.latestBookMessageId
      : '';
  } catch (error) {
    console.warn('Failed to load book player state:', error);
  }
}

function rememberBookPlayerState(name, entryId = '') {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  catRouteState.hasWrittenNameInBook = trimmedName.length > 0;
  catRouteState.bookPlayerName = trimmedName;
  catRouteState.latestBookMessageId = entryId ? String(entryId) : '';
  persistBookPlayerState();
}

function isSupabaseConfigured() {
  return Boolean(
    typeof supabaseConfig?.url === 'string' &&
    supabaseConfig.url.trim() &&
    typeof supabaseConfig?.anonKey === 'string' &&
    supabaseConfig.anonKey.trim()
  );
}

function getSupabaseTableName() {
  return (supabaseConfig?.table || 'book_messages').trim() || 'book_messages';
}

function getSupabaseReturnHistoryTableName() {
  return (supabaseConfig?.returnHistoryTable || 'return_histories').trim() || 'return_histories';
}

function getSupabaseRestUrl(query = '') {
  const baseUrl = supabaseConfig.url.replace(/\/+$/, '');
  return `${baseUrl}/rest/v1/${encodeURIComponent(getSupabaseTableName())}${query}`;
}

function getSupabaseReturnHistoryRestUrl(query = '') {
  const baseUrl = supabaseConfig.url.replace(/\/+$/, '');
  return `${baseUrl}/rest/v1/${encodeURIComponent(getSupabaseReturnHistoryTableName())}${query}`;
}

function getSupabaseHeaders(prefer = '') {
  const headers = {
    apikey: supabaseConfig.anonKey,
    Authorization: `Bearer ${supabaseConfig.anonKey}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = BOOK_MESSAGE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeMessageEntry(entry) {
  if (!entry || typeof entry.message !== 'string') return null;
  return {
    id: String(entry.id ?? `${Date.now()}-${Math.random()}`),
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'anonymous',
    message: entry.message,
    createdAt: String(entry.createdAt ?? entry.created_at ?? new Date().toISOString())
  };
}

function buildSharedReturnHistoryMessage(payload) {
  return `${RETURN_HISTORY_BOOK_FALLBACK_PREFIX}${JSON.stringify({
    playerName: typeof payload?.playerName === 'string' ? payload.playerName.trim() : '',
    isTrueReturn: Boolean(payload?.isTrueReturn)
  })}`;
}

function parseSharedReturnHistoryMessage(message) {
  if (typeof message !== 'string' || !message.startsWith(RETURN_HISTORY_BOOK_FALLBACK_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(message.slice(RETURN_HISTORY_BOOK_FALLBACK_PREFIX.length));
    return {
      playerName: typeof parsed?.playerName === 'string' ? parsed.playerName.trim() : '',
      isTrueReturn: Boolean(parsed?.isTrueReturn)
    };
  } catch (error) {
    console.warn('Failed to parse shared return history message:', error);
    return null;
  }
}

function normalizeSharedBookReturnHistoryEntry(entry) {
  const parsed = parseSharedReturnHistoryMessage(entry?.message);
  if (!parsed) return null;
  return normalizeReturnHistoryEntry({
    id: entry.id,
    player_name: parsed.playerName,
    is_true_return: parsed.isTrueReturn,
    created_at: entry.createdAt ?? entry.created_at
  });
}

function isSharedReturnHistoryBookEntry(entry) {
  const trimmedName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  return trimmedName === RETURN_HISTORY_BOOK_FALLBACK_AUTHOR
    || Boolean(parseSharedReturnHistoryMessage(entry?.message));
}

function shouldIncludeBookMessageEntry(entry) {
  const trimmedName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  return !BOOK_RECORD_EXCLUDED_NAMES.has(trimmedName) && !isSharedReturnHistoryBookEntry(entry);
}

function filterVisibleBookMessages(entries) {
  return entries.filter((entry) => shouldIncludeBookMessageEntry(entry));
}

function purgeExcludedBookMessagesFromStorage() {
  try {
    const stored = window.localStorage.getItem(BOOK_MESSAGE_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;
    const normalizedMessages = parsed.map(normalizeMessageEntry).filter(Boolean);
    const visibleMessages = filterVisibleBookMessages(normalizedMessages);
    if (visibleMessages.length === normalizedMessages.length) return;
    window.localStorage.setItem(BOOK_MESSAGE_STORAGE_KEY, JSON.stringify(visibleMessages));
  } catch (error) {
    console.warn('Failed to purge excluded book messages:', error);
  }
}

function normalizeReturnHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const playerName = typeof entry.playerName === 'string'
    ? entry.playerName.trim()
    : typeof entry.player_name === 'string'
    ? entry.player_name.trim()
    : '';
  const rawTrueReturn = entry.isTrueReturn ?? entry.is_true_return ?? false;
  const isTrueReturn = rawTrueReturn === true
    || rawTrueReturn === 'true'
    || rawTrueReturn === 1
    || rawTrueReturn === '1';
  return {
    id: String(entry.id ?? `return-${Date.now()}-${Math.floor(Math.random() * 10000)}`),
    playerName,
    isTrueReturn,
    createdAt: String(entry.createdAt ?? entry.created_at ?? new Date().toISOString())
  };
}

function shouldIncludeEndingCreditName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length > 0 && !ENDING_CREDITS_EXCLUDED_NAMES.has(trimmed);
}

function renderEndingReturnHistory(entries = returnHistoryState.entries) {
  const sortedEntries = cloneReturnHistoryEntries(entries)
    .filter(Boolean)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const returnees = sortedEntries
    .filter((entry) => !entry.isTrueReturn)
    .map((entry) => entry.playerName)
    .filter(shouldIncludeEndingCreditName);
  const trueReturnees = sortedEntries
    .filter((entry) => entry.isTrueReturn)
    .map((entry) => entry.playerName)
    .filter(shouldIncludeEndingCreditName);
  if (endingReturneesList) {
    endingReturneesList.textContent = returnees.length ? returnees.join('\n') : '未確認';
  }
  if (endingTrueReturneesList) {
    endingTrueReturneesList.textContent = trueReturnees.length ? trueReturnees.join('\n') : '未確認';
  }
}

async function loadSharedBookReturnHistories() {
  const sharedAuthor = encodeURIComponent(RETURN_HISTORY_BOOK_FALLBACK_AUTHOR);
  const response = await fetchWithTimeout(
    getSupabaseRestUrl(`?select=id,name,message,created_at&name=eq.${sharedAuthor}&order=created_at.desc&limit=${RETURN_HISTORY_BOOK_FALLBACK_FETCH_LIMIT}`),
    {
      headers: getSupabaseHeaders(),
      cache: 'no-store'
    }
  );
  if (!response.ok) {
    throw new Error(`supabase-shared-return-load-${response.status}`);
  }
  const payload = await response.json();
  return (Array.isArray(payload) ? payload : [])
    .map(normalizeSharedBookReturnHistoryEntry)
    .filter(Boolean)
    .slice(0, RETURN_HISTORY_LIMIT);
}

async function saveSharedBookReturnHistory(payload) {
  const response = await fetchWithTimeout(
    getSupabaseRestUrl('?select=id,name,message,created_at'),
    {
      method: 'POST',
      headers: getSupabaseHeaders('return=representation'),
      body: JSON.stringify([
        {
          name: RETURN_HISTORY_BOOK_FALLBACK_AUTHOR,
          message: buildSharedReturnHistoryMessage(payload)
        }
      ])
    }
  );
  if (!response.ok) {
    throw new Error(`supabase-shared-return-save-${response.status}`);
  }
  const payloadRows = await response.json();
  const savedEntry = normalizeSharedBookReturnHistoryEntry(Array.isArray(payloadRows) ? payloadRows[0] : null);
  if (!savedEntry) {
    throw new Error('supabase-shared-return-save-empty');
  }
  return savedEntry;
}

async function loadReturnHistories(options = {}) {
  const force = Boolean(options.force);
  if (!force && returnHistoryState.loadingPromise) {
    return returnHistoryState.loadingPromise;
  }
  if (!force && returnHistoryState.entries.length) {
    return cloneReturnHistoryEntries(returnHistoryState.entries);
  }

  const loader = (async () => {
    if (isSupabaseConfigured()) {
      try {
        const response = await fetchWithTimeout(
          getSupabaseReturnHistoryRestUrl(`?select=id,player_name,is_true_return,created_at&order=created_at.desc&limit=${RETURN_HISTORY_LIMIT}`),
          {
            headers: getSupabaseHeaders(),
            cache: 'no-store'
          }
        );
        if (!response.ok) {
          throw new Error(`supabase-return-load-${response.status}`);
        }
        const payload = await response.json();
        const entries = (Array.isArray(payload) ? payload : [])
          .map(normalizeReturnHistoryEntry)
          .filter(Boolean)
          .slice(0, RETURN_HISTORY_LIMIT);
        returnHistoryState.backend = 'supabase';
        returnHistoryState.entries = entries;
        renderEndingReturnHistory(entries);
        return cloneReturnHistoryEntries(entries);
      } catch (error) {
        console.warn('Failed to load Supabase return histories, falling back locally:', error);
        try {
          const entries = await loadSharedBookReturnHistories();
          returnHistoryState.backend = 'shared-book';
          returnHistoryState.entries = entries;
          renderEndingReturnHistory(entries);
          return cloneReturnHistoryEntries(entries);
        } catch (sharedError) {
          console.warn('Failed to load shared-book return histories, falling back locally:', sharedError);
          returnHistoryState.backend = 'degraded';
        }
      }
    }

    let entries = [];
    try {
      const stored = window.localStorage.getItem(RETURN_HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          entries = parsed.map(normalizeReturnHistoryEntry).filter(Boolean);
        }
      }
    } catch (error) {
      console.warn('Failed to load local return histories:', error);
    }

    entries = entries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, RETURN_HISTORY_LIMIT);
    returnHistoryState.entries = entries;
    renderEndingReturnHistory(entries);
    return cloneReturnHistoryEntries(entries);
  })();

  returnHistoryState.loadingPromise = loader.finally(() => {
    returnHistoryState.loadingPromise = null;
  });
  return returnHistoryState.loadingPromise;
}

async function saveReturnHistory(payload) {
  const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
  const isTrueReturn = Boolean(payload?.isTrueReturn);

  if (isSupabaseConfigured()) {
    try {
      const response = await fetchWithTimeout(
        getSupabaseReturnHistoryRestUrl('?select=id,player_name,is_true_return,created_at'),
        {
          method: 'POST',
          headers: getSupabaseHeaders('return=representation'),
          body: JSON.stringify([
            {
              player_name: playerName || null,
              is_true_return: isTrueReturn
            }
          ])
        }
      );
      if (!response.ok) {
        throw new Error(`supabase-return-save-${response.status}`);
      }
      const payloadRows = await response.json();
      const savedEntry = normalizeReturnHistoryEntry(Array.isArray(payloadRows) ? payloadRows[0] : null);
      if (!savedEntry) {
        throw new Error('supabase-return-save-empty');
      }
      returnHistoryState.backend = 'supabase';
      returnHistoryState.entries = await loadReturnHistories({ force: true });
      renderEndingReturnHistory(returnHistoryState.entries);
      return savedEntry;
    } catch (error) {
      console.warn('Failed to save Supabase return history, falling back locally:', error);
      try {
        const savedEntry = await saveSharedBookReturnHistory({ playerName, isTrueReturn });
        returnHistoryState.backend = 'shared-book';
        returnHistoryState.entries = [savedEntry, ...returnHistoryState.entries]
          .map(normalizeReturnHistoryEntry)
          .filter(Boolean)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, RETURN_HISTORY_LIMIT);
        renderEndingReturnHistory(returnHistoryState.entries);
        void loadReturnHistories({ force: true });
        return savedEntry;
      } catch (sharedError) {
        console.warn('Failed to save shared-book return history, falling back locally:', sharedError);
        returnHistoryState.backend = 'degraded';
      }
    }
  } else {
    returnHistoryState.backend = 'local';
  }

  let entries = [];
  try {
    const stored = window.localStorage.getItem(RETURN_HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        entries = parsed.map(normalizeReturnHistoryEntry).filter(Boolean);
      }
    }
  } catch (error) {
    console.warn('Failed to read local return history before save:', error);
  }

  const entry = {
    id: `return-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    playerName,
    isTrueReturn,
    createdAt: new Date().toISOString()
  };
  const nextEntries = [entry, ...entries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RETURN_HISTORY_LIMIT);
  returnHistoryState.entries = nextEntries;
  try {
    window.localStorage.setItem(RETURN_HISTORY_STORAGE_KEY, JSON.stringify(nextEntries));
  } catch (error) {
    console.warn('Failed to save local return history:', error);
  }
  renderEndingReturnHistory(nextEntries);
  return { ...entry };
}

async function recordReturnHistoryForEnding() {
  try {
    await saveReturnHistory({
      playerName: catRouteState.hasWrittenNameInBook ? catRouteState.bookPlayerName : '',
      isTrueReturn: catRouteState.reachedEarthWithCat
    });
    await loadReturnHistories({ force: true });
  } catch (error) {
    console.warn('Failed to record return history:', error);
  }
}

function setBookStatusDefault() {
  if (!bookStatus) return;
  switch (bookUiState.backend) {
    case 'supabase':
      bookStatus.textContent = 'この本に書いたことばは、ほかの人にも共有されます。';
      break;
    case 'degraded':
      bookStatus.textContent = '共有の記録に接続できなかったため、この端末の記録を表示しています。';
      break;
    default:
      bookStatus.textContent = '今はこの端末の中だけに保存されます。Supabaseをつなぐと、みんなのメッセージを共有できます。';
      break;
  }
}

function formatBookMessageDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadMessages(options = {}) {
  const force = Boolean(options.force);
  if (!force && bookUiState.lastMessages.length && !isSupabaseConfigured()) {
    return cloneMessages(bookUiState.lastMessages);
  }

  if (isSupabaseConfigured()) {
    try {
      const hiddenAuthor = encodeURIComponent(RETURN_HISTORY_BOOK_FALLBACK_AUTHOR);
      const response = await fetchWithTimeout(
        getSupabaseRestUrl(`?select=id,name,message,created_at&name=not.eq.${hiddenAuthor}&order=created_at.desc&limit=${BOOK_MESSAGE_FETCH_LIMIT}`),
        {
          headers: getSupabaseHeaders(),
          cache: 'no-store'
        }
      );
      if (!response.ok) {
        throw new Error(`supabase-load-${response.status}`);
      }
      const payload = await response.json();
      const messages = filterVisibleBookMessages((Array.isArray(payload) ? payload : [])
        .map(normalizeMessageEntry)
        .filter(Boolean)
      ).slice(0, BOOK_MESSAGE_LIMIT);

      bookUiState.backend = 'supabase';
      setBookStatusDefault();
      bookUiState.lastMessages = messages.length ? messages : cloneMessages(BOOK_MESSAGE_SEED);
      return cloneMessages(bookUiState.lastMessages);
    } catch (error) {
      console.warn('Failed to load Supabase book messages, falling back locally:', error);
      bookUiState.backend = 'degraded';
      setBookStatusDefault();
    }
  } else {
    bookUiState.backend = 'local';
    setBookStatusDefault();
  }

  let messages = cloneMessages(BOOK_MESSAGE_SEED);
  try {
    const stored = window.localStorage.getItem(BOOK_MESSAGE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        messages = filterVisibleBookMessages(parsed.map(normalizeMessageEntry).filter(Boolean));
      }
    }
  } catch (error) {
    console.warn('Failed to load book messages:', error);
  }

  bookUiState.lastMessages = messages
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, BOOK_MESSAGE_LIMIT);
  return cloneMessages(bookUiState.lastMessages);
}

async function saveMessage(payload) {
  const trimmedMessage = (payload.message ?? '').trim();
  if (!trimmedMessage) {
    throw new Error('empty-message');
  }

  const trimmedName = (payload.name ?? '').trim() || 'anonymous';

  if (isSupabaseConfigured()) {
    try {
      const response = await fetchWithTimeout(
        getSupabaseRestUrl('?select=id,name,message,created_at'),
        {
          method: 'POST',
          headers: getSupabaseHeaders('return=representation'),
          body: JSON.stringify([
            {
              name: trimmedName,
              message: trimmedMessage
            }
          ])
        }
      );
      if (!response.ok) {
        throw new Error(`supabase-save-${response.status}`);
      }
      const payloadRows = await response.json();
      const savedEntry = normalizeMessageEntry(Array.isArray(payloadRows) ? payloadRows[0] : null);
      if (!savedEntry) {
        throw new Error('supabase-save-empty');
      }
      bookUiState.backend = 'supabase';
      setBookStatusDefault();
      bookUiState.lastMessages = await loadMessages({ force: true });
      return savedEntry;
    } catch (error) {
      console.warn('Failed to save Supabase book message, falling back locally:', error);
      bookUiState.backend = 'degraded';
      setBookStatusDefault();
    }
  } else {
    bookUiState.backend = 'local';
    setBookStatusDefault();
  }

  const messages = await loadMessages();
  const entry = {
    id: `book-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: trimmedName,
    message: trimmedMessage,
    createdAt: new Date().toISOString()
  };
  const nextMessages = filterVisibleBookMessages([entry, ...messages]).slice(0, BOOK_MESSAGE_LIMIT);
  bookUiState.lastMessages = nextMessages;
  try {
    window.localStorage.setItem(BOOK_MESSAGE_STORAGE_KEY, JSON.stringify(nextMessages));
  } catch (error) {
    console.warn('Failed to save book message:', error);
  }
  return { ...entry };
}

function setBookView(view) {
  const nextView = view === 'write' ? 'write' : 'read';
  bookUiState.currentView = nextView;
  for (const button of bookViewButtons) {
    const active = button.dataset.bookView === nextView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const panel of bookViews) {
    panel.classList.toggle('is-active', panel.dataset.bookView === nextView);
  }
}

function createBookMessageCard(entry) {
  const card = document.createElement('article');
  card.className = 'book-message-card';

  const meta = document.createElement('div');
  meta.className = 'book-message-meta';

  const author = document.createElement('div');
  author.className = 'book-message-author';

  const name = document.createElement('div');
  name.className = 'book-message-name';
  name.textContent = entry.name || 'anonymous';
  author.append(name);

  meta.append(author);

  const date = document.createElement('div');
  date.className = 'book-message-date';
  date.textContent = formatBookMessageDate(entry.createdAt);
  meta.append(date);

  const body = document.createElement('div');
  body.className = 'book-message-body';
  body.textContent = entry.message;

  card.append(meta, body);
  return card;
}

function buildBookReadPages(messages) {
  if (!bookMessagePage) {
    bookUiState.readPages = messages.length ? [messages] : [];
    return bookUiState.readPages;
  }

  if (!messages.length) {
    bookUiState.readPages = [];
    return bookUiState.readPages;
  }

  const measuredPages = [];
  const availableHeight = Math.max(
    180,
    Math.floor(bookMessagePage.clientHeight || bookMessagePage.getBoundingClientRect().height || 320)
  );

  let cursor = 0;
  while (cursor < messages.length) {
    const pageEntries = [];
    bookMessagePage.textContent = '';

    for (let i = cursor; i < messages.length; i++) {
      const candidate = createBookMessageCard(messages[i]);
      bookMessagePage.append(candidate);
      const fits = bookMessagePage.scrollHeight <= availableHeight + 1;
      if (!fits && pageEntries.length > 0) {
        candidate.remove();
        break;
      }
      pageEntries.push(messages[i]);
    }

    if (!pageEntries.length) {
      pageEntries.push(messages[cursor]);
    }

    measuredPages.push(pageEntries);
    cursor += pageEntries.length;
  }

  bookMessagePage.textContent = '';
  bookUiState.readPages = measuredPages;
  return measuredPages;
}

function renderBookReadPage(messages) {
  if (!bookMessagePage) return;
  bookMessagePage.textContent = '';

  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'book-message-card';
    empty.textContent = 'まだ何も書かれていません。最初のひとことを残せます。';
    bookMessagePage.append(empty);
    if (bookNextPage) bookNextPage.disabled = true;
    return;
  }

  const pages = buildBookReadPages(messages);
  if (!pages.length) return;
  if (bookUiState.pageIndex >= pages.length) {
    bookUiState.pageIndex = 0;
  }

  const entries = pages[bookUiState.pageIndex];
  for (const entry of entries) {
    bookMessagePage.append(createBookMessageCard(entry));
  }

  const pageInfo = document.createElement('div');
  pageInfo.className = 'book-message-index';
  pageInfo.textContent = `${bookUiState.pageIndex + 1} / ${pages.length}`;
  bookMessagePage.append(pageInfo);

  if (bookNextPage) {
    bookNextPage.disabled = pages.length <= 1;
  }
}

function setBookOverlayOpen(isOpen) {
  bookUiState.open = isOpen;
  bookOverlay?.classList.toggle('is-open', isOpen);
  bookOverlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) {
    accelPointers.clear();
    refreshAccelHeld();
    input.leftId = null;
    input.rightId = null;
    resetCameraLook(true);
    input.stickId = null;
    input.stickOffset.x = 0;
    input.stickOffset.y = 0;
    input.turnX = 0;
    input.turnY = 0;
    if (stickHandle) {
      stickHandle.style.transform = 'translate(-50%, -50%)';
    }
    setSiteMenuOpen(false);
  } else {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
}

function setBlackBoxView(nextView) {
  blackBoxUiState.currentView = nextView;
  blackBoxViewIntro?.classList.toggle('is-active', nextView === 'intro');
  blackBoxViewReveal?.classList.toggle('is-active', nextView === 'reveal');
}

function setBlackBoxOverlayOpen(isOpen) {
  blackBoxUiState.open = isOpen;
  blackBoxOverlay?.classList.toggle('is-open', isOpen);
  blackBoxOverlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) {
    accelPointers.clear();
    refreshAccelHeld();
    input.leftId = null;
    input.rightId = null;
    resetCameraLook(true);
    input.stickId = null;
    input.stickOffset.x = 0;
    input.stickOffset.y = 0;
    input.turnX = 0;
    input.turnY = 0;
    if (stickHandle) {
      stickHandle.style.transform = 'translate(-50%, -50%)';
    }
    setSiteMenuOpen(false);
  } else if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function setMusicSelectorOverlayOpen(isOpen) {
  musicSelectorState.open = isOpen;
  musicSelectorOverlay?.classList.toggle('is-open', isOpen);
  musicSelectorOverlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) {
    accelPointers.clear();
    refreshAccelHeld();
    input.leftId = null;
    input.rightId = null;
    resetCameraLook(true);
    input.stickId = null;
    input.stickOffset.x = 0;
    input.stickOffset.y = 0;
    input.turnX = 0;
    input.turnY = 0;
    if (stickHandle) {
      stickHandle.style.transform = 'translate(-50%, -50%)';
    }
    setSiteMenuOpen(false);
  } else if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

async function openBookOverlay() {
  bookUiState.pageIndex = 0;
  setBookStatusDefault();
  setBookView('write');
  setBookOverlayOpen(true);
  bookMessageInput?.focus({ preventScroll: true });
  const messages = await loadMessages({ force: true });
  renderBookReadPage(messages);
}

function closeBookOverlay() {
  if (bookUiState.pendingTimer !== null) {
    window.clearTimeout(bookUiState.pendingTimer);
    bookUiState.pendingTimer = null;
  }
  bookUiState.rearmRequired = isInsideBookInteractionZone(state.pos);
  setBookOverlayOpen(false);
}

function openBlackBoxOverlay() {
  stopEndingRollAudioPlayback();
  setEndingOverlayTransitioning(false);
  setEndingOverlayOpen(false);
  endingUiState.rollTime = 0;
  closeBookOverlay();
  setBlackBoxView('intro');
  if (blackBoxTitle) {
    blackBoxTitle.style.visibility = blackBoxUiState.openedOnce ? 'hidden' : 'visible';
    blackBoxTitle.setAttribute('aria-hidden', blackBoxUiState.openedOnce ? 'true' : 'false');
  }
  if (blackBoxOpen) {
    blackBoxOpen.textContent = blackBoxUiState.openedOnce ? 'また開けちゃう' : '開けてみる';
  }
  setBlackBoxOverlayOpen(true);
}

function closeBlackBoxOverlay() {
  if (blackBoxUiState.pendingTimer !== null) {
    window.clearTimeout(blackBoxUiState.pendingTimer);
    blackBoxUiState.pendingTimer = null;
  }
  blackBoxUiState.rearmRequired = isInsideBlackBoxInteractionZone(state.pos);
  setBlackBoxOverlayOpen(false);
}

function openMusicSelectorOverlay() {
  if (!USE_GIANT_RECORD_PLAYER) return;
  closeBookOverlay();
  closeBlackBoxOverlay();
  ensureMusicSelectorList();
  refreshMusicSelectorUi();
  setMusicSelectorOverlayOpen(true);
}

function suppressMenuClickThrough() {
  menuClickThroughGuardUntil = performance.now() + MENU_CLICK_THROUGH_GUARD_MS;
}

function closeMusicSelectorOverlay() {
  suppressMenuClickThrough();
  musicSelectorState.rearmRequired = isInsideMusicSelectorInteractionZone(state.pos);
  setMusicSelectorOverlayOpen(false);
}

function activateMusicSelectorTrack(index) {
  if (!Number.isFinite(index) || index < 0 || index >= playlist.length) return;
  runTrackControlAction(() => {
    if (index === currentTrackIndex) {
      playCurrentTrack();
    } else {
      loadTrack(index, true);
    }
  });
}

function handleBookTrigger() {
  if (bookUiState.open) return;
  if (bookUiState.rearmRequired) {
    if (isInsideBookInteractionZone(state.pos, BOOK_REARM_EXIT_EXTRA_RADIUS)) {
      return;
    }
    bookUiState.rearmRequired = false;
  }
  if (bookUiState.pendingTimer !== null) {
    window.clearTimeout(bookUiState.pendingTimer);
    bookUiState.pendingTimer = null;
  }
  openBookOverlay().catch((error) => {
    console.error('Failed to open book overlay:', error);
  });
}

function handleBlackBoxTrigger(contactPoint) {
  if (blackBoxUiState.open) return;
  if (blackBoxUiState.rearmRequired) {
    if (isInsideBlackBoxInteractionZone(state.pos)) {
      return;
    }
    blackBoxUiState.rearmRequired = false;
  }
  if (contactPoint) {
    blackBoxUiState.lastTriggerPoint.copy(contactPoint);
    blackBoxUiState.lastTriggerAngle = blackBoxUiState.routeAngle;
  }
  refreshCatRouteAvailability();
  if (catRouteState.catFollowing) {
    return;
  }
  if (catRouteState.catRouteAvailable) {
    startCatFollowing(contactPoint ?? blackBoxLandmark.position);
    return;
  }
  if (blackBoxUiState.pendingTimer !== null) {
    window.clearTimeout(blackBoxUiState.pendingTimer);
    blackBoxUiState.pendingTimer = null;
  }
  openBlackBoxOverlay();
}

function isInsideMusicSelectorInteractionZone(position, extraRadius = 0) {
  if (!giantRecordPlayer) return false;
  const limit = GIANT_RECORD_PLAYER_TRIGGER_RADIUS + PLAYER_THEME_HIT_RADIUS + extraRadius;
  return position.distanceToSquared(giantRecordPlayer.position) <= limit * limit;
}

function handleMusicSelectorTrigger() {
  if (musicSelectorState.open) return;
  if (musicSelectorState.rearmRequired) {
    return;
  }
  openMusicSelectorOverlay();
}

function isInsideBookInteractionZone(position, extraRadius = 0) {
  if (!giantBookThemeZone) return false;
  copyThemeZoneCenter(themeZoneCenter, giantBookThemeZone);
  const limit = giantBookThemeZone.radius + PLAYER_THEME_HIT_RADIUS + extraRadius;
  return position.distanceToSquared(themeZoneCenter) <= limit * limit;
}

function handlePointerDown(e) {
  e.preventDefault();
  primeEffectAudioFromGesture();

  if (e.target instanceof Element && e.target.closest('.ui-control')) {
    maybeEnableAppleTouchEffects();
    return;
  }

  startBgmFromGesture();
  maybeEnableAppleTouchEffects();

  if (stickArea && input.stickId === null) {
    const rect = stickArea.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      input.stickId = e.pointerId;
      input.stickOffset.x = 0;
      input.stickOffset.y = 0;
      return;
    }
  }

  accelPointers.add(e.pointerId);
  refreshAccelHeld();
  registerBackgroundTapCandidate(e.pointerId, e.clientX, e.clientY);

  if (e.clientY < window.innerHeight * 0.5) {
    if (input.lookId === null) {
      input.lookId = e.pointerId;
      input.lookDragging = false;
      input.lookLast.x = e.clientX;
      input.lookLast.y = e.clientY;
      input.lookStart.x = e.clientX;
      input.lookStart.y = e.clientY;
    }
    return;
  }

  if (e.clientX < window.innerWidth * 0.5 && input.leftId === null) {
    input.leftId = e.pointerId;
    input.leftLast.x = e.clientX;
    input.leftLast.y = e.clientY;
  } else if (input.rightId === null) {
    input.rightId = e.pointerId;
  }
}

function handlePointerMove(e) {
  e.preventDefault();
  invalidateBackgroundTapCandidate(e.pointerId, e.clientX, e.clientY);

  if (e.pointerId === input.lookId) {
    const totalDx = e.clientX - input.lookStart.x;
    const totalDy = e.clientY - input.lookStart.y;
    const dragDistance = Math.hypot(e.clientX - input.lookStart.x, e.clientY - input.lookStart.y);
    if (!input.lookDragging && dragDistance > P.CAMERA_LOOK_DRAG_START) {
      input.lookDragging = true;
      accelPointers.delete(e.pointerId);
      refreshAccelHeld();
    }
    if (
      input.lookDragging &&
      totalDy <= -P.LOOP_SWIPE_TRIGGER &&
      Math.abs(totalDx) <= P.LOOP_SWIPE_HORIZONTAL_TOLERANCE
    ) {
      invalidateBackgroundTapCandidate(e.pointerId, e.clientX + P.TAP_MOVE_TOLERANCE * 2, e.clientY);
      accelPointers.delete(e.pointerId);
      refreshAccelHeld();
      releaseCameraLook();
      triggerVerticalLoop();
      return;
    }
    input.lookLast.x = e.clientX;
    input.lookLast.y = e.clientY;
  }

  if (e.pointerId === input.leftId) {
    const dx = e.clientX - input.leftLast.x;
    const dy = e.clientY - input.leftLast.y;
    input.turnX += dx;
    input.turnY += dy;
    input.leftLast.x = e.clientX;
    input.leftLast.y = e.clientY;
  }

  if (e.pointerId === input.stickId && stickArea) {
    const rect = stickArea.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    const clamp = Math.min(len, STICK_LIMIT);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    input.stickOffset.x = nx * clamp;
    input.stickOffset.y = ny * clamp;
    stickHandle.style.transform = `translate(calc(-50% + ${nx * clamp}px), calc(-50% + ${ny * clamp}px))`;
  }
}

function handlePointerUp(e) {
  e.preventDefault();
  const screwTriggered = resolveBackgroundTap(e.pointerId, e.clientX, e.clientY);
  accelPointers.delete(e.pointerId);
  refreshAccelHeld();

  if (e.pointerId === input.lookId) {
    releaseCameraLook();
  }

  if (e.pointerId === input.leftId) {
    input.leftId = null;
  } else if (e.pointerId === input.rightId) {
    if (!screwTriggered) {
      queueFlap();
    }
    input.rightId = null;
  }

  if (e.pointerId === input.stickId) {
    input.stickId = null;
    input.stickOffset.x = 0;
    input.stickOffset.y = 0;
    stickHandle.style.transform = 'translate(-50%, -50%)';
  }
}

function handleMouseDown(e) {
  if (e.target instanceof Element && e.target.closest('.ui-control')) return;
  startBgmFromGesture();
  maybeEnableAppleTouchEffects();
}

window.addEventListener('pointerdown', handlePointerDown, { passive: false });
window.addEventListener('pointermove', handlePointerMove, { passive: false });
window.addEventListener('pointerup', handlePointerUp, { passive: false });
window.addEventListener('pointercancel', handlePointerUp);
window.addEventListener('mousedown', handleMouseDown, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());

if (trackCard) {
  trackCard.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    startBgmFromGesture();
  });
  trackCard.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startBgmFromGesture();
  });
  trackCard.addEventListener('pointerup', (e) => {
    e.stopPropagation();
  });
  trackCard.addEventListener('click', (e) => {
    e.stopPropagation();
    startBgmFromGesture();
  });
}

for (const control of [trackToggle, trackNext]) {
  if (!control) continue;
  control.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  control.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  control.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

trackToggle?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  runTrackControlAction(() => {
    if (bgm.paused) startBgmFromGesture();
    else stopCurrentTrack();
  });
});
trackToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  runTrackControlAction(() => {
    if (bgm.paused) startBgmFromGesture();
    else stopCurrentTrack();
  });
});

trackNext?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  runTrackControlAction(() => {
    nextTrack();
  });
});
trackNext?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  runTrackControlAction(() => {
    nextTrack();
  });
});

function toggleLyricsDisplay(e) {
  e.preventDefault();
  e.stopPropagation();
  lyricsEnabled = !lyricsEnabled;
  refreshLyricsToggle();
  updateLyricsUi();
}

if (lyricsToggle) {
  lyricsToggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  lyricsToggle.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  lyricsToggle.addEventListener('click', toggleLyricsDisplay);
}

for (const control of [menuToggle, siteMenuBackdrop, ...menuNavButtons]) {
  if (!control) continue;
  control.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  control.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

for (const control of [
  cameraCapture,
  captureBackdrop,
  capturePanel,
  captureClose,
  captureSave,
  captureShare
]) {
  if (!control) continue;
  control.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  control.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  control.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

cameraCapture?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  if (now - lastCameraTriggerAt < 420) return;
  lastCameraTriggerAt = now;
  await captureFlightRecord();
});

cameraCapture?.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  if (now - lastCameraTriggerAt < 420) return;
  lastCameraTriggerAt = now;
  await captureFlightRecord();
});

captureBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeCaptureOverlay();
});

captureClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeCaptureOverlay();
});

endingClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeEndingOverlay();
});

endingRestartTrigger?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  restartFlightFromEnding();
});

window.addEventListener('pagehide', () => {
  stopRouteEffectAudios();
});

captureShare?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  await shareCaptureImage();
});

menuToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (performance.now() < menuClickThroughGuardUntil) {
    return;
  }
  setSiteMenuOpen(!siteMenu?.classList.contains('is-open'));
});

siteMenuBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setSiteMenuOpen(false);
});

for (const button of menuNavButtons) {
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const href = button.dataset.href;
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    const pageId = button.dataset.page;
    if (!pageId) return;
    setMenuPage(pageId);
  });
}

for (const control of [
  bookBackdrop,
  bookPanel,
  bookClose,
  ...bookViewButtons,
  bookNextPage,
  bookForm,
  bookMessagePage,
  bookNameInput,
  bookMessageInput,
  blackBoxBackdrop,
  blackBoxPanel,
  blackBoxClose,
  blackBoxOpen,
  blackBoxIgnore,
  blackBoxDownload,
  musicSelectorBackdrop,
  musicSelectorPanel,
  musicSelectorClose,
  musicSelectorList
]) {
  if (!control) continue;
  control.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('pointermove', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('pointerup', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

bookBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBookOverlay();
});
bookBackdrop?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBookOverlay();
});

bookClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBookOverlay();
});
bookClose?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBookOverlay();
});

blackBoxBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});
blackBoxBackdrop?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});

blackBoxClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});
blackBoxClose?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});

blackBoxOpen?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  stopEndingRollAudioPlayback();
  if (blackBoxUiState.mode !== 'grounded') {
    blackBoxUiState.mode = 'grounded';
    const groundedSource = blackBoxUiState.lastTriggerPoint.lengthSq() > 0.0001
      ? blackBoxUiState.lastTriggerPoint
      : blackBoxLandmark.position;
    placeGroundedBlackBox(groundedSource, getBlackBoxForwardFromAngle(blackBoxUiState.lastTriggerAngle));
  }
  const repeatEncounter = blackBoxUiState.openedOnce;
  const nextImageIndex = repeatEncounter
    ? (blackBoxUiState.revealCount % BLACK_BOX_IMAGE_SET.length)
    : 0;
  setBlackBoxRevealImage(nextImageIndex);
  if (blackBoxCaption) {
    blackBoxCaption.textContent = repeatEncounter ? 'うーん、やっぱりかわいい。' : 'かわいいのがいた。';
  }
  blackBoxUiState.openedOnce = true;
  catRouteState.blackBoxOpened = true;
  catRouteState.catFound = true;
  refreshCatRouteAvailability();
  blackBoxUiState.revealCount += 1;
  setBlackBoxView('reveal');
});

blackBoxIgnore?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  resumeBlackBoxOrbit();
  closeBlackBoxOverlay();
});

musicSelectorBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeMusicSelectorOverlay();
});
musicSelectorBackdrop?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeMusicSelectorOverlay();
});

musicSelectorClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeMusicSelectorOverlay();
});
musicSelectorClose?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeMusicSelectorOverlay();
});

musicSelectorList?.addEventListener('pointerup', (e) => {
  const button = e.target instanceof Element ? e.target.closest('.music-selector-item') : null;
  if (!button) return;
  e.preventDefault();
  e.stopPropagation();
  const index = Number(button.dataset.trackIndex ?? '-1');
  activateMusicSelectorTrack(index);
});

musicSelectorList?.addEventListener('click', (e) => {
  const button = e.target instanceof Element ? e.target.closest('.music-selector-item') : null;
  if (!button) return;
  e.preventDefault();
  e.stopPropagation();
  const index = Number(button.dataset.trackIndex ?? '-1');
  activateMusicSelectorTrack(index);
});

for (const button of bookViewButtons) {
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBookView(button.dataset.bookView);
    if (button.dataset.bookView === 'write') {
      window.setTimeout(() => {
        bookMessageInput?.focus({ preventScroll: true });
      }, 20);
    } else {
      renderBookReadPage(bookUiState.lastMessages);
    }
  });
}

bookNextPage?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!bookUiState.lastMessages.length) return;
  bookUiState.pageIndex = (bookUiState.pageIndex + 1) % bookUiState.lastMessages.length;
  renderBookReadPage(bookUiState.lastMessages);
});

bookForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!bookMessageInput || !bookStatus) return;
  const message = bookMessageInput.value.trim();
  if (!message) {
    bookStatus.textContent = 'ひとこと書いてから記してください。';
    return;
  }

  try {
    const savedEntry = await saveMessage({
      name: bookNameInput?.value ?? '',
      message
    });
    rememberBookPlayerState(bookNameInput?.value ?? '', savedEntry?.id ?? '');
    bookUiState.pageIndex = 0;
    renderBookReadPage(await loadMessages({ force: true }));
    setBookView('read');
    bookMessageInput.value = '';
    if (bookNameInput) bookNameInput.value = '';
    bookStatus.textContent = '本に新しいことばが記されました。';
  } catch (error) {
    console.error('Failed to save book message:', error);
    bookStatus.textContent = '今は書き込みに失敗しました。少し時間をおいてもう一度どうぞ。';
  }
});

for (const control of [speedLockPanel, speedLockSlider]) {
  if (!control) continue;
  control.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('pointermove', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('pointerup', (e) => {
    e.stopPropagation();
  });
  control.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

if (speedLockSlider) {
  speedLockSlider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!(e.target instanceof Element)) return;
    speedLockPointerId = e.pointerId;
    speedLockSlider.setPointerCapture(e.pointerId);
    updateSpeedLockFromPointer(e.clientY);
  });
  speedLockSlider.addEventListener('pointermove', (e) => {
    if (speedLockPointerId !== e.pointerId) return;
    e.preventDefault();
    updateSpeedLockFromPointer(e.clientY);
  });
  speedLockSlider.addEventListener('pointerup', (e) => {
    if (speedLockPointerId !== e.pointerId) return;
    e.preventDefault();
    updateSpeedLockFromPointer(e.clientY);
    speedLockPointerId = null;
  });
  speedLockSlider.addEventListener('pointercancel', () => {
    speedLockPointerId = null;
  });
  speedLockSlider.addEventListener('keydown', (e) => {
    let nextValue = getSpeedLockSelection();
    if (e.code === 'ArrowUp' || e.code === 'ArrowRight') nextValue += 1;
    else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') nextValue -= 1;
    else if (e.code === 'PageUp') nextValue += 10;
    else if (e.code === 'PageDown') nextValue -= 10;
    else if (e.code === 'Home') nextValue = 12;
    else if (e.code === 'End') nextValue = 120;
    else return;
    e.preventDefault();
    setSpeedLockSelection(nextValue);
    refreshSpeedLockUi();
  });
}
bgm.addEventListener('ended', () => {
  nextTrack();
});
loadTrack(getInitialRandomTrackIndex(), false);
refreshSpeedLockUi();
refreshTrackControls();
refreshLyricsToggle();
refreshCaptureShareButton();
setMenuPage(activeMenuPage);
syncMusicUiVisibility();
syncSpaceReturnAudioState();

window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('gesturechange', (e) => e.preventDefault());
window.addEventListener('gestureend', () => forceViewportReset());
window.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('touchmove', (e) => {
  const isEditable = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
  const allowScroll = isEditable || (e.target instanceof Element && e.target.closest('#book-panel, #site-menu-pages, #music-selector-panel, #music-selector-list'));
  if (!allowScroll && e.cancelable) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  if (now - lastTouchEnd < 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
  if (window.visualViewport && window.visualViewport.scale > 1.01) {
    setTimeout(forceViewportReset, 0);
  }
}, { passive: false });
document.addEventListener('touchcancel', () => {
  if (window.visualViewport && window.visualViewport.scale > 1.01) {
    setTimeout(forceViewportReset, 0);
  }
}, { passive: false });
window.visualViewport?.addEventListener('resize', () => {
  if (window.visualViewport.scale > 1.01) {
    forceViewportReset();
  }
});
window.addEventListener('orientationchange', () => {
  setTimeout(forceViewportReset, 50);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    closeCaptureOverlay();
    closeBookOverlay();
    closeBlackBoxOverlay();
    closeMusicSelectorOverlay();
    closeEndingOverlay();
    setSiteMenuOpen(false);
  }
  if (e.code === 'KeyC' && e.shiftKey) {
    e.preventDefault();
    setCatDebugPreviewEnabled(!catRouteState.debugPreviewActive);
  }
  if (e.code === 'KeyV' && e.shiftKey) {
    e.preventDefault();
    debugJumpToSanctuaryCheckpoint();
  }
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault();
    primeEffectAudioFromGesture();
    ensureBgm();
  }
  if (e.code === 'Space') {
    input.accelKeyHeld = true;
    refreshAccelHeld();
  }
  if (e.code === 'KeyW') input.keyUpHeld = true;
  if (e.code === 'KeyS') input.keyDownHeld = true;
  if (e.code === 'KeyA') input.keyLeftHeld = true;
  if (e.code === 'KeyD') input.keyRightHeld = true;
  if (e.code === 'ArrowUp') input.arrowUpHeld = true;
  if (e.code === 'ArrowDown') input.arrowDownHeld = true;
  if (e.code === 'ArrowLeft') input.arrowLeftHeld = true;
  if (e.code === 'ArrowRight') input.arrowRightHeld = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    input.accelKeyHeld = false;
    refreshAccelHeld();
  }
  if (e.code === 'KeyW') input.keyUpHeld = false;
  if (e.code === 'KeyS') input.keyDownHeld = false;
  if (e.code === 'KeyA') input.keyLeftHeld = false;
  if (e.code === 'KeyD') input.keyRightHeld = false;
  if (e.code === 'ArrowUp') input.arrowUpHeld = false;
  if (e.code === 'ArrowDown') input.arrowDownHeld = false;
  if (e.code === 'ArrowLeft') input.arrowLeftHeld = false;
  if (e.code === 'ArrowRight') input.arrowRightHeld = false;
});

function spawnDustPuffs(position, up, forward) {
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  for (let i = 0; i < dustPuffs.length; i++) {
    const puff = dustPuffs[i];
    puff.visible = true;
    puff.userData.life = 0.55 + (i % 4) * 0.06;
    puff.position.copy(position)
      .addScaledVector(up, 0.35)
      .addScaledVector(right, (i - dustPuffs.length * 0.5) * 0.18)
      .addScaledVector(forward, Math.sin(i * 1.4) * 0.3);
    puff.quaternion.copy(createBasisQuaternion(forward, up));
    puff.scale.setScalar(0.8 + (i % 3) * 0.28);
    puff.material.opacity = 0.34;
    puff.userData.velocity.copy(up).multiplyScalar(0.7 + (i % 3) * 0.24)
      .addScaledVector(right, (i - dustPuffs.length * 0.5) * 0.24)
      .addScaledVector(forward, 0.3 + (i % 4) * 0.08);
  }
}

function getSeagullPosePitchTarget(glideVisual, radialSpeed, speed, climbInput = 0) {
  const climbLean = THREE.MathUtils.clamp(radialSpeed / Math.max(speed, 1), -0.18, 0.24);
  const descendPose = Math.max(0, -climbInput) * P.DESCEND_POSE_PITCH;
  return THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(P.SEAGULL_GROUND_PITCH, P.SEAGULL_GLIDE_PITCH, glideVisual) - climbLean + descendPose,
    -P.MAX_POSE_NOSE_UP,
    0.35
  );
}

function updatePlayerVisuals(dt, up, flightForward, speed, turnIntent, climbInput) {
  const glideTarget = state.onGround ? 0.16 : 1.0;
  state.glideVisual = THREE.MathUtils.damp(state.glideVisual, glideTarget, P.PLAYER_GLIDE_RESPONSE, dt);

  const wingOpen = THREE.MathUtils.lerp(0.015, 0.06, state.glideVisual);
  const wingSweep = THREE.MathUtils.lerp(0.14, 0.02, state.glideVisual);
  wingLeftRoot.rotation.z = wingOpen;
  wingRightRoot.rotation.z = -wingOpen;
  wingLeftRoot.rotation.y = -wingSweep;
  wingRightRoot.rotation.y = wingSweep;
  wingLeftTip.rotation.z = -0.005 - state.glideVisual * 0.03 + Math.max(0, turnIntent) * 0.025;
  wingRightTip.rotation.z = 0.005 + state.glideVisual * 0.03 + Math.min(0, turnIntent) * 0.025;
  wingLeftTip.rotation.y = 0.1 - state.glideVisual * 0.04;
  wingRightTip.rotation.y = -0.1 + state.glideVisual * 0.04;

  headRoot.rotation.x = THREE.MathUtils.lerp(0.08, -0.02, state.glideVisual);
  headRoot.rotation.z = -turnIntent * 0.04;
  tailRoot.rotation.x = -0.08 - THREE.MathUtils.clamp(state.radialSpeed / Math.max(speed, 1), -0.15, 0.22);
  tailRoot.rotation.z = -state.roll * 0.12;
  body.scale.set(
    body.userData.baseScale.x,
    body.userData.baseScale.y * (0.96 + state.glideVisual * 0.04),
    body.userData.baseScale.z * (0.96 + state.glideVisual * 0.08)
  );
  backShell.scale.set(
    backShell.userData.baseScale.x,
    backShell.userData.baseScale.y * (0.96 + state.glideVisual * 0.02),
    backShell.userData.baseScale.z * (0.96 + state.glideVisual * 0.1)
  );

  state.boostFlash = 0;
  boostGlow.visible = false;
  boostGlow.material.opacity = 0;
  boostGlow.scale.setScalar(1);

  const pitchTarget = getSeagullPosePitchTarget(state.glideVisual, state.radialSpeed, speed, climbInput);
  seagullState.posePitch = THREE.MathUtils.damp(seagullState.posePitch, pitchTarget, P.SEAGULL_POSE_RESPONSE, dt);
  seagullVisual.rotation.x = seagullState.posePitch;
  seagullVisual.rotation.y = THREE.MathUtils.damp(seagullVisual.rotation.y, turnIntent * 0.08, P.SEAGULL_POSE_RESPONSE, dt);
  seagullVisual.position.y = THREE.MathUtils.damp(
    seagullVisual.position.y,
    THREE.MathUtils.lerp(P.SEAGULL_GROUND_Y, P.SEAGULL_GLIDE_Y, state.glideVisual),
    P.SEAGULL_POSE_RESPONSE,
    dt
  );
  seagullVisual.position.z = THREE.MathUtils.damp(seagullVisual.position.z, THREE.MathUtils.lerp(-0.18, 0.04, state.glideVisual), P.SEAGULL_POSE_RESPONSE, dt);

  seagullTipGlowMat.opacity = 0;
  seagullTailGlowMat.opacity = 0;
  seagullLeftTipGlow.scale.setScalar(1);
  seagullRightTipGlow.scale.setScalar(1);
  seagullTailGlow.scale.x = 1;
  seagullTailGlow.scale.z = 1;
}

function updateSpeedEffects(dt, up, flightForward, speed) {
  const right = updateSpeedEffectsRightScratch.crossVectors(up, flightForward).normalize();
  writeBasisQuaternion(updateSpeedEffectsForwardQuatScratch, flightForward, up);
  boostTrail.visible = false;

  const diveStrength = THREE.MathUtils.clamp(state.diveTimer / 0.9, 0, 1);
  for (let i = 0; i < diveStreaks.children.length; i++) {
    const streak = diveStreaks.children[i];
    if (diveStrength > 0.03) {
      const sway = Math.sin(performance.now() * 0.003 + streak.userData.phase);
      streak.visible = true;
      streak.position.copy(state.pos)
        .addScaledVector(flightForward, 4 + i * 1.8)
        .addScaledVector(right, sway * (1.3 + i * 0.16))
        .addScaledVector(up, ((i % 3) - 1) * 0.6);
      streak.quaternion.copy(updateSpeedEffectsForwardQuatScratch);
      diveStreakMats[i].opacity = diveStrength * (0.3 - i * 0.016);
    } else {
      streak.visible = false;
    }
  }

  speedParticles.visible = false;

  for (const puff of dustPuffs) {
    if (puff.userData.life > 0) {
      puff.userData.life -= dt;
      puff.position.addScaledVector(puff.userData.velocity, dt);
      puff.userData.velocity.multiplyScalar(1 - dt * 2.5);
      puff.scale.multiplyScalar(1 + dt * 1.8);
      puff.material.opacity = Math.max(0, puff.userData.life) * 0.45;
      puff.visible = puff.userData.life > 0;
    } else {
      puff.visible = false;
    }
  }

  for (const poop of poopDrops) {
    if (poop.userData.life <= 0) {
      poop.visible = false;
      continue;
    }

    poop.userData.life = Math.max(0, poop.userData.life - dt);
    if (!poop.userData.grounded) {
      tempPoopUp.copy(poop.position).normalize();
      poop.userData.velocity.addScaledVector(tempPoopUp, -P.POOP_GRAVITY * dt);
      poop.position.addScaledVector(poop.userData.velocity, dt);

      tempPoopUp.copy(poop.position).normalize();
      const surfaceRadius = getSurfaceRadius(tempPoopUp) + 0.12;
      if (poop.position.length() <= surfaceRadius) {
        poop.userData.grounded = true;
        poop.userData.groundDir.copy(tempPoopUp);
        poop.position.copy(tempPoopUp).multiplyScalar(surfaceRadius);
        poop.userData.velocity.set(0, 0, 0);
        tempPoopQuat.setFromUnitVectors(WORLD_UP, tempPoopUp);
        poop.quaternion.copy(tempPoopQuat);
      }
    } else {
      tempPoopUp.copy(poop.userData.groundDir);
      poop.position.copy(tempPoopUp).multiplyScalar(getSurfaceRadius(tempPoopUp) + 0.12);
      tempPoopQuat.setFromUnitVectors(WORLD_UP, tempPoopUp);
      poop.quaternion.copy(tempPoopQuat);
    }

    poop.visible = poop.userData.life > 0;
  }
}

function updatePlayer(dt) {
  const prevForward = updatePlayerPrevForwardScratch.copy(state.forward);
  const dragYaw = -input.turnX * P.YAW_SENS;
  const dragPitch = input.turnY * P.PITCH_SENS;
  const stickTarget = tempStick.set(
    -applyDeadzone(input.stickOffset.x / STICK_LIMIT, P.STICK_DEADZONE) * P.STICK_SCALE,
    -applyDeadzone(input.stickOffset.y / STICK_LIMIT, P.STICK_DEADZONE) * P.STICK_SCALE
  );
  const keyTarget = tempKey.set(
    ((input.keyLeftHeld ? 1 : 0) - (input.keyRightHeld ? 1 : 0))
      + (((input.arrowLeftHeld ? 1 : 0) - (input.arrowRightHeld ? 1 : 0)) * KEYBOARD_ARROW_STICK_SCALE_X),
    ((input.keyUpHeld ? 1 : 0) - (input.keyDownHeld ? 1 : 0))
      + (((input.arrowUpHeld ? 1 : 0) - (input.arrowDownHeld ? 1 : 0)) * KEYBOARD_ARROW_STICK_SCALE_Y)
  );
  keyTarget.clampScalar(-1, 1);
  const keyboardInputActive =
    input.keyLeftHeld ||
    input.keyRightHeld ||
    input.keyUpHeld ||
    input.keyDownHeld ||
    input.arrowLeftHeld ||
    input.arrowRightHeld ||
    input.arrowUpHeld ||
    input.arrowDownHeld;
  const stickBlend = 1 - Math.exp(-(input.stickId !== null ? P.STICK_RESPONSE : P.STICK_RETURN) * dt);
  const keyBlend = 1 - Math.exp(-((keyboardInputActive ? P.STICK_RESPONSE : P.STICK_RETURN) * 0.8) * dt);
  input.stickSmooth.lerp(stickTarget, stickBlend);
  input.keySmooth.lerp(keyTarget, keyBlend);
  if (input.stickId === null) {
    input.stickSmooth.y = THREE.MathUtils.damp(input.stickSmooth.y, 0, P.STICK_VERTICAL_RELEASE, dt);
    if (Math.abs(input.stickSmooth.y) < 0.01) input.stickSmooth.y = 0;
  }
  if (!keyboardInputActive) {
    input.keySmooth.x = THREE.MathUtils.damp(input.keySmooth.x, 0, P.STICK_RETURN, dt);
    input.keySmooth.y = THREE.MathUtils.damp(input.keySmooth.y, 0, P.STICK_VERTICAL_RELEASE, dt);
    if (Math.abs(input.keySmooth.x) < 0.01) input.keySmooth.x = 0;
    if (Math.abs(input.keySmooth.y) < 0.01) input.keySmooth.y = 0;
  }
  const stickTurn = input.stickSmooth.x + input.keySmooth.x;
  const stickLift = input.stickSmooth.y + input.keySmooth.y;
  const climbInput = THREE.MathUtils.clamp(
    ((input.stickId === null && Math.abs(dragPitch) < 0.0001 && Math.abs(input.keySmooth.y) < 0.001) ? 0 : stickLift) + dragPitch,
    -1,
    1
  );
  const yawDelta = dragYaw + stickTurn * P.STICK_YAW * dt * 60;
  const turnIntent = THREE.MathUtils.clamp(stickTurn + dragYaw * 18, -1, 1);

  input.turnX = 0;
  input.turnY = 0;

  const up = updatePlayerUpScratch.copy(state.pos).normalize();
  const currentAltitude = getAltitude(state.pos);
  if (compassAssistState.cooldown > 0) {
    compassAssistState.cooldown = Math.max(0, compassAssistState.cooldown - dt);
  }
  if (musicSelectorState.rearmRequired) {
    if (!isInsideMusicSelectorInteractionZone(state.pos, GIANT_RECORD_PLAYER_REARM_EXIT_EXTRA_RADIUS)) {
      musicSelectorState.rearmRequired = false;
    }
  }
  if (compassAssistState.rearmRequired) {
    const rearmDistanceSq = (COMPASS_ASSIST_REARM_EXIT_RADIUS + PLAYER_THEME_HIT_RADIUS) ** 2;
    if (state.pos.distanceToSquared(duskTower.position) >= rearmDistanceSq) {
      compassAssistState.rearmRequired = false;
    }
  }
  const compassGuidanceMode = getCompassGuidanceMode();
  if (
    compassAssistState.active &&
    (!compassGuidanceMode || returnRouteState.spaceFlightActive)
  ) {
    clearCompassAssist();
  }
  const wasSpaceFlightActive = returnRouteState.spaceFlightActive;
  const wasSpaceParallelActive = returnRouteState.spaceParallelActive;
  if (returnRouteState.phase !== RETURN_ROUTE_PHASES.SANCTUARY) {
    returnRouteState.spaceUpDirection.set(0, 0, 0);
    returnRouteState.spaceActivationCharge = 0;
    returnRouteState.spaceTransition = 0;
    returnRouteState.spaceCameraSnapPending = false;
    returnRouteState.spaceParallelActive = false;
    returnRouteState.spaceFlightActive = false;
  } else {
    if (!returnRouteState.spaceFlightActive) {
      const sanctuaryClimb = currentAltitude - Math.max(0, returnRouteState.sanctuaryStartAltitude);
      const reachedReturnAltitude =
        currentAltitude >= SPACE_RETURN_MODE_ALTITUDE &&
        sanctuaryClimb >= SPACE_RETURN_MODE_ALTITUDE * 0.9 &&
        state.radialSpeed >= SPACE_RETURN_MIN_ASCENT_SPEED;
      if (reachedReturnAltitude) {
        returnRouteState.spaceActivationCharge = Math.min(
          SPACE_RETURN_ACTIVATION_HOLD,
          returnRouteState.spaceActivationCharge + dt
        );
      } else {
        returnRouteState.spaceActivationCharge = Math.max(0, returnRouteState.spaceActivationCharge - dt * 2.4);
      }
      if (returnRouteState.spaceActivationCharge >= SPACE_RETURN_ACTIVATION_HOLD) {
        returnRouteState.spaceFlightActive = true;
        returnRouteState.spaceParallelActive = true;
      }
    }
    if (!returnRouteState.spaceParallelActive) {
      returnRouteState.spaceUpDirection.set(0, 0, 0);
    }
  }
  returnRouteState.spaceTransition = THREE.MathUtils.damp(
    returnRouteState.spaceTransition,
    returnRouteState.spaceFlightActive ? 1 : 0,
    returnRouteState.spaceFlightActive ? SPACE_TRANSITION_IN_RATE : SPACE_TRANSITION_OUT_RATE,
    dt
  );
  if (returnRouteState.spaceFlightActive && !wasSpaceFlightActive) {
    ensureSpaceParallelUpDirection();
    alignSpaceForwardToReturnTarget(returnRouteState.spaceUpDirection);
    returnRouteState.spaceCameraSnapPending = false;
    state.cameraLookMode = CAMERA_LOOK_MODES.CHASE;
    state.cameraYawTarget = 0;
    state.cameraLensTarget = 0;
    state.cameraYawOffset = 0;
    state.cameraLensOffset = 0;
    state.cameraLift = 0;
    state.bodyPitch = 0;
    state.loopSpinActive = false;
    state.loopSpinTime = 0;
    state.loopSpinAngle = 0;
    verticalLoopState.radius = 0;
    verticalLoopState.recoveryTime = 0;
    state.visualForward.copy(state.forward);
  }
  if (returnRouteState.spaceParallelActive && !wasSpaceParallelActive) {
    ensureSpaceParallelUpDirection();
    alignSpaceForwardToReturnTarget(returnRouteState.spaceUpDirection);
    state.bodyPitch = 0;
    state.visualForward.copy(state.forward);
  }
  const controlUp = returnRouteState.spaceParallelActive
    ? returnRouteState.spaceUpDirection
    : up;
  state.forward.applyAxisAngle(controlUp, yawDelta).normalize();
  state.forward.addScaledVector(controlUp, -state.forward.dot(controlUp)).normalize();
  if (returnRouteState.spaceParallelActive && returnRouteState.beamDirection.lengthSq() > 0.0001 && state.forward.lengthSq() < 0.0001) {
    projectVectorOnPlane(state.forward, returnRouteState.beamDirection, controlUp).normalize();
  }
  if (state.forward.lengthSq() < 0.0001) {
    projectVectorOnPlane(state.forward, spaceLocalForward, controlUp).normalize();
  }
  if (state.forward.lengthSq() < 0.0001) {
    state.forward.crossVectors(
      controlUp,
      Math.abs(controlUp.dot(spaceLocalForward)) < 0.92 ? spaceLocalForward : WORLD_UP
    ).normalize();
  }
  if (compassAssistState.active && !returnRouteState.spaceParallelActive) {
    if (!getCompassGuidanceDirection(compassAssistState.targetDirection, compassGuidanceMode)) {
      clearCompassAssist();
    } else {
      compassAssistProjected.copy(compassAssistState.targetDirection)
        .addScaledVector(controlUp, -compassAssistState.targetDirection.dot(controlUp));
      if (compassAssistProjected.lengthSq() < 0.0001) {
        clearCompassAssist();
      } else {
        compassAssistProjected.normalize();
        const assistInputStrength = THREE.MathUtils.clamp(
          Math.max(Math.abs(turnIntent), Math.abs(climbInput)),
          0,
          1
        );
        const assistFade = Math.max(0, 1 - compassAssistState.time / COMPASS_ASSIST_DURATION);
        const assistInfluence = assistFade * (1 - Math.min(1, assistInputStrength * COMPASS_ASSIST_INPUT_RELIEF));
        if (assistInfluence > 0.0001) {
          const assistBlend = 1 - Math.exp(-COMPASS_ASSIST_TURN_RATE * assistInfluence * dt);
          state.forward.lerp(compassAssistProjected, assistBlend).normalize();
        }
        compassAssistState.time += dt;
        if (compassAssistState.time >= COMPASS_ASSIST_DURATION) {
          clearCompassAssist();
        }
      }
    }
  }
  let earthGuideInfluence = 0;
  if (returnRouteState.spaceParallelActive) {
    getEarthReturnWorldPosition(earthWorldPosition);
    earthGuideDirection.copy(earthWorldPosition).sub(state.pos);
    projectVectorOnPlane(earthGuideProjected, earthGuideDirection, controlUp);
    if (earthGuideProjected.lengthSq() > 0.0001) {
      earthGuideProjected.normalize();
      const inputStrength = THREE.MathUtils.clamp(Math.max(Math.abs(turnIntent), Math.abs(climbInput)), 0, 1);
      earthGuideInfluence = 1 - Math.min(1, inputStrength * EARTH_GUIDE_INPUT_RELIEF);
      const alignBlend = 1 - Math.exp(-EARTH_GUIDE_TURN_RATE * earthGuideInfluence * dt);
      state.forward.lerp(earthGuideProjected, alignBlend).normalize();
    }
  }

  const right = updatePlayerRightScratch.crossVectors(controlUp, state.forward).normalize();
  if (right.lengthSq() < 0.0001) {
    right.set(1, 0, 0);
  }

  if (state.onGround && climbInput > 0.08) {
    state.onGround = false;
    state.radialSpeed = Math.max(state.radialSpeed, P.TAKEOFF_UP + climbInput * 2.5);
  }

  if (state.diveTimer > 0) {
    state.diveTimer -= dt;
    state.radialSpeed -= P.DIVE_FORCE * dt;
    state.diveEnergy = Math.min(state.diveEnergy + P.DIVE_BONUS * dt, 18);
  } else {
    state.diveEnergy = THREE.MathUtils.lerp(state.diveEnergy, 0, P.DIVE_DECAY * dt);
  }

  if (input.flapQueued && (performance.now() / 1000 - state.lastFlap) > P.FLAP_COOLDOWN && state.flaps > 0) {
    state.flaps -= 1;
    state.lastFlap = performance.now() / 1000;
    state.diveEnergy = Math.min(state.diveEnergy + P.BOOST_ENERGY, 18);
  }
  input.flapQueued = false;

  if (input.accelHeld) {
    state.holdAccel += P.HOLD_ACCEL_RATE * dt;
  } else {
    state.holdAccel = Math.max(0, state.holdAccel - P.LOCK_ACCEL_DECAY * dt);
  }

  const accelBoost = state.holdAccel;
  const speedTarget = Math.max(
    P.MIN_FWD_SPEED,
    state.speedLock + state.diveEnergy + Math.max(0, climbInput) * P.STICK_BOOST + accelBoost
  );
  const speedResponse = speedTarget > state.currentSpeed ? P.LOCK_SPEED_ACCEL : P.LOCK_SPEED_SETTLE;
  state.currentSpeed = THREE.MathUtils.damp(state.currentSpeed, speedTarget, speedResponse, dt);
  const cruiseSpeed = state.currentSpeed;
  const descendInput = Math.max(0, -climbInput);

  if (!state.onGround) {
    if (climbInput > 0) {
      state.radialSpeed += climbInput * P.STICK_CLIMB * dt;
    } else if (climbInput < 0) {
      const descendTarget = -descendInput * Math.max(P.DESCEND_TARGET_MIN, cruiseSpeed * P.DESCEND_TARGET_RATIO);
      const descendBlend = 1 - Math.exp(-P.DESCEND_RESPONSE * dt);
      state.radialSpeed += climbInput * P.STICK_DESCEND * dt;
      state.radialSpeed = THREE.MathUtils.lerp(state.radialSpeed, descendTarget, descendBlend);
    } else if (state.diveTimer <= 0) {
      if (returnRouteState.spaceParallelActive) {
        getBeamClosestPointForPosition(state.pos, beamClosestPointWorld);
        const beamAltitude = beamRelativeWorld.copy(state.pos).sub(beamClosestPointWorld).dot(controlUp);
        const altitudeOffset = Math.abs(beamAltitude) <= SPACE_PARALLEL_RETURN_DEADZONE
          ? 0
          : beamAltitude - Math.sign(beamAltitude) * SPACE_PARALLEL_RETURN_DEADZONE;
        const neutralTarget = THREE.MathUtils.clamp(
          -altitudeOffset * SPACE_PARALLEL_RETURN_RATE,
          -SPACE_PARALLEL_RETURN_MAX,
          SPACE_PARALLEL_RETURN_MAX
        );
        const neutralResponse = Math.abs(state.radialSpeed) > Math.abs(neutralTarget)
          ? P.NEUTRAL_ASCENT_BRAKE
          : P.NEUTRAL_RETURN;
        const neutralBlend = 1 - Math.exp(-neutralResponse * dt);
        state.radialSpeed = THREE.MathUtils.lerp(state.radialSpeed, neutralTarget, neutralBlend);
      } else {
        const altitude = getAltitude(state.pos);
        const excessAltitude = Math.max(0, altitude - P.NEUTRAL_ALTITUDE);
        const neutralTarget = excessAltitude > 0
          ? -THREE.MathUtils.clamp(
            P.NEUTRAL_DESCEND_MIN + excessAltitude * 0.12,
            P.NEUTRAL_DESCEND_MIN,
            P.NEUTRAL_DESCEND_MAX
          )
          : 0;
        const neutralResponse = state.radialSpeed > neutralTarget
          ? P.NEUTRAL_ASCENT_BRAKE
          : P.NEUTRAL_RETURN;
        const neutralBlend = 1 - Math.exp(-neutralResponse * dt);
        state.radialSpeed = THREE.MathUtils.lerp(state.radialSpeed, neutralTarget, neutralBlend);
      }
    }
  } else {
    state.radialSpeed = 0;
  }

  state.radialSpeed *= 1 - P.GLIDE_DRAG * dt;
  const maxAscentSpeed = cruiseSpeed * Math.tan(P.MAX_ASCENT_ANGLE);
  state.radialSpeed = Math.min(state.radialSpeed, maxAscentSpeed);
  const orbitRadius = state.pos.length();
  let nextUp = updatePlayerNextUpScratch.copy(up);
  let nextRadius = orbitRadius;
  let surfaceRadius = getSurfaceRadius(nextUp) + PLAYER_CLEARANCE;

  if (returnRouteState.spaceParallelActive) {
    state.onGround = false;
    state.flaps = P.MAX_FLAPS;
    state.pos.addScaledVector(state.forward, cruiseSpeed * dt);
    state.pos.addScaledVector(controlUp, state.radialSpeed * dt);
    if (earthGuideProjected.lengthSq() > 0.0001 && earthGuideInfluence > 0.0001) {
      state.pos.addScaledVector(earthGuideProjected, EARTH_GUIDE_PULL_SPEED * earthGuideInfluence * dt);
    }
    nextUp.copy(controlUp).normalize();
    nextRadius = state.pos.length();
    surfaceRadius = nextRadius;
  } else {
    const moveAngle = (cruiseSpeed * dt) / orbitRadius;
    nextUp.copy(up).applyAxisAngle(right, moveAngle).normalize();

    state.forward.applyAxisAngle(right, moveAngle).normalize();
    state.forward.addScaledVector(nextUp, -state.forward.dot(nextUp)).normalize();

    nextRadius = orbitRadius + state.radialSpeed * dt;

    surfaceRadius = getSurfaceRadius(nextUp) + PLAYER_CLEARANCE;
    let surfaceGap = nextRadius - surfaceRadius;
    if (!state.onGround && surfaceGap < P.SOFT_GROUND_RANGE) {
      const repel = THREE.MathUtils.clamp(1 - surfaceGap / P.SOFT_GROUND_RANGE, 0, 1);
      const repelSq = repel * repel;
      state.radialSpeed += repelSq * P.SOFT_GROUND_FORCE * dt;
      if (state.radialSpeed < 0) {
        state.radialSpeed = THREE.MathUtils.lerp(state.radialSpeed, 0, repelSq * P.SOFT_GROUND_DAMP * dt);
      }
      nextRadius = Math.max(nextRadius, surfaceRadius + P.SOFT_GROUND_MIN_ALT);
      surfaceGap = nextRadius - surfaceRadius;
    }

    const canLand = !input.accelHeld
      && Math.abs(climbInput) < 0.08
      && cruiseSpeed < P.GROUND_SPEED + 0.45
      && surfaceGap <= P.SOFT_GROUND_LAND_ALT;

    if (canLand) {
      nextRadius = surfaceRadius;
      state.radialSpeed = 0;
      state.onGround = true;
      state.flaps = P.MAX_FLAPS;
      state.diveEnergy = 0;
    } else {
      state.onGround = false;
    }

    state.pos.copy(nextUp).multiplyScalar(nextRadius);
  }
  if (state.loopSpinActive) {
    state.loopSpinTime += dt;
    const loopProgress = THREE.MathUtils.clamp(state.loopSpinTime / P.LOOP_DURATION, 0, 1);
    state.loopSpinAngle = Math.PI * 2 * easeInOutCubic(loopProgress);
    const loopSin = Math.sin(state.loopSpinAngle);
    const loopCos = Math.cos(state.loopSpinAngle);
    updatePlayerLoopCenterScratch.copy(verticalLoopState.startPos)
      .addScaledVector(verticalLoopState.startUp, verticalLoopState.radius);
    state.pos.copy(updatePlayerLoopCenterScratch)
      .addScaledVector(verticalLoopState.startUp, -loopCos * verticalLoopState.radius)
      .addScaledVector(verticalLoopState.startForward, loopSin * verticalLoopState.radius);
    updatePlayerLoopForwardScratch.copy(verticalLoopState.startForward)
      .multiplyScalar(loopCos)
      .addScaledVector(verticalLoopState.startUp, loopSin)
      .normalize();
    state.forward.copy(updatePlayerLoopForwardScratch);
    nextUp.copy(state.pos).normalize();
    nextRadius = state.pos.length();
    surfaceRadius = getSurfaceRadius(nextUp) + PLAYER_CLEARANCE;
    state.onGround = false;
    state.radialSpeed = 0;
    state.bodyPitch = 0;
    state.roll = 0;
    if (loopProgress >= 1) {
      state.loopSpinActive = false;
      state.loopSpinTime = 0;
      state.loopSpinAngle = 0;
      verticalLoopState.radius = 0;
      verticalLoopState.recoveryForward.copy(updatePlayerLoopForwardScratch);
      verticalLoopState.recoveryUp.copy(updatePlayerLoopBodyUpScratch);
      verticalLoopState.recoveryTime = P.LOOP_RECOVERY_DURATION;
    }
  } else {
    state.loopSpinAngle = 0;
    const signedTurn = Math.atan2(
      updatePlayerCrossScratch.crossVectors(prevForward, state.forward).dot(nextUp),
      THREE.MathUtils.clamp(prevForward.dot(state.forward), -1, 1)
    );
    const bankTarget = THREE.MathUtils.clamp(
      -(signedTurn / Math.max(dt, 0.001)) * P.BANK_FROM_TURN,
      -P.MAX_BANK,
      P.MAX_BANK
    );
    state.roll = THREE.MathUtils.damp(state.roll, bankTarget, P.ROLL_RESPONSE, dt);
  }
  if (state.screwSpinActive) {
    state.screwSpinTime += dt;
    const screwProgress = THREE.MathUtils.clamp(state.screwSpinTime / P.SCREW_DURATION, 0, 1);
    state.screwSpinAngle = state.screwSpinDirection
      * Math.PI
      * 2
      * P.SCREW_TURNS
      * easeInOutQuint(screwProgress);
    state.screwForwardOffset = getScrewForwardOffset(screwProgress) * P.SCREW_FORWARD_OFFSET;
    if (screwProgress >= 1) {
      state.screwSpinActive = false;
      state.screwSpinTime = 0;
      state.screwSpinAngle = 0;
      state.screwForwardOffset = 0;
    }
  } else {
    state.screwSpinAngle = 0;
    state.screwForwardOffset = 0;
  }

  const flightForward = updatePlayerFlightForwardScratch.copy(state.forward);
  if (state.loopSpinActive) {
    updatePlayerLoopBodyUpScratch.copy(verticalLoopState.startUp)
      .multiplyScalar(Math.cos(state.loopSpinAngle))
      .addScaledVector(verticalLoopState.startForward, -Math.sin(state.loopSpinAngle))
      .normalize();
    writeBasisQuaternion(updatePlayerLookQuatScratch, flightForward, updatePlayerLoopBodyUpScratch);
  } else {
    const posePitchTarget = returnRouteState.spaceParallelActive
      ? 0
      : getSeagullPosePitchTarget(state.glideVisual, state.radialSpeed, cruiseSpeed, climbInput);
    const poseNoseUp = Math.max(0, -posePitchTarget);
    const neutralBodyPitch = THREE.MathUtils.lerp(0, P.CRUISE_BODY_PITCH, state.glideVisual);
    const bodyPitchTarget = returnRouteState.spaceParallelActive
      ? 0
      : THREE.MathUtils.clamp(
        Math.atan2(state.radialSpeed, Math.max(cruiseSpeed, 1)) - descendInput * P.DESCEND_INPUT_PITCH + neutralBodyPitch,
        -Math.PI * 0.5,
        Math.max(0, P.MAX_BODY_PITCH - poseNoseUp)
      );
    const bodyPitchResponse = bodyPitchTarget < state.bodyPitch ? P.BODY_DESCEND_PITCH_RESPONSE : P.BODY_PITCH_RESPONSE;
    state.bodyPitch = THREE.MathUtils.damp(state.bodyPitch, bodyPitchTarget, bodyPitchResponse, dt);
    if (!returnRouteState.spaceParallelActive) {
      flightForward.applyAxisAngle(right, -state.bodyPitch).normalize();
    }
    if (verticalLoopState.recoveryTime > 0) {
      const recoveryProgress = 1 - THREE.MathUtils.clamp(
        verticalLoopState.recoveryTime / P.LOOP_RECOVERY_DURATION,
        0,
        1
      );
      const recoveryBlend = easeInOutCubic(recoveryProgress);
      updatePlayerRecoveryForwardScratch.copy(verticalLoopState.recoveryForward)
        .lerp(flightForward, recoveryBlend)
        .normalize();
      updatePlayerRecoveryUpScratch.copy(verticalLoopState.recoveryUp)
        .lerp(nextUp, recoveryBlend)
        .normalize();
      flightForward.copy(updatePlayerRecoveryForwardScratch);
      writeBasisQuaternion(updatePlayerLookQuatScratch, flightForward, updatePlayerRecoveryUpScratch);
      verticalLoopState.recoveryTime = Math.max(0, verticalLoopState.recoveryTime - dt);
    } else {
      writeBasisQuaternion(updatePlayerLookQuatScratch, flightForward, nextUp);
    }
  }
  updatePlayerRollQuatScratch.setFromAxisAngle(FORWARD_AXIS, state.roll + state.screwSpinAngle);
  player.quaternion
    .copy(updatePlayerLookQuatScratch)
    .multiply(updatePlayerRollQuatScratch);

  bobPhase += dt * 0.7;
  const bob = Math.sin(bobPhase) * 0.22 + Math.sin(bobPhase * 0.37 + 1.1) * 0.08;
  const screwVisualPos = updatePlayerVisualPosScratch.copy(state.pos).addScaledVector(flightForward, state.screwForwardOffset);
  player.position.copy(screwVisualPos).addScaledVector(nextUp, bob);

  const shadowDirection = updatePlayerShadowDirectionScratch.copy(screwVisualPos).normalize();
  const shadowRadius = getSurfaceRadius(shadowDirection) + 0.06;
  const altitude = Math.max(0, nextRadius - surfaceRadius);
  if (returnRouteState.spaceParallelActive) {
    shadow.visible = false;
  } else {
    shadow.visible = true;
    const shadowScale = THREE.MathUtils.clamp(1.1 - altitude * 0.16, 0.34, 1.08);
    shadow.position.copy(shadowDirection).multiplyScalar(shadowRadius);
    shadow.quaternion.setFromUnitVectors(FORWARD_AXIS, shadowDirection);
    shadow.scale.set(shadowScale * 1.15, shadowScale * 0.8, 1);
    shadow.material.opacity = THREE.MathUtils.clamp(0.24 - altitude * 0.055, 0.05, 0.22);
  }

  if (!state.wasOnGround && state.onGround) {
    spawnDustPuffs(state.pos, nextUp, state.forward);
  }
  state.wasOnGround = state.onGround;
  state.visualUp.copy(
    state.loopSpinActive
      ? updatePlayerLoopBodyUpScratch
      : (verticalLoopState.recoveryTime > 0 ? updatePlayerRecoveryUpScratch : nextUp)
  );
  state.visualForward.copy(flightForward);

  updatePlayerVisuals(dt, state.visualUp, flightForward, cruiseSpeed, turnIntent, climbInput);
  updateSpeedEffects(dt, state.visualUp, flightForward, cruiseSpeed);
}

function updateClouds(dt) {
  if (FREEZE_CLOUD_DRIFT_FOR_TEST) return;

  for (const cloud of clouds.children) {
    const axis = cloudDriftAxisScratch.crossVectors(WORLD_UP, cloud.userData.direction).normalize();
    if (axis.lengthSq() > 0.0001) {
      cloud.userData.direction.applyAxisAngle(axis, dt * cloud.userData.drift);
      cloud.userData.direction.normalize();
      alignObjectToSphere(cloud, cloud.userData.direction, cloud.userData.height, cloud.userData.spin);
    }
  }

  for (const veil of cloudVeils.children) {
    const axis = cloudDriftAxisScratch.crossVectors(WORLD_UP, veil.userData.direction).normalize();
    if (axis.lengthSq() > 0.0001) {
      veil.userData.direction.applyAxisAngle(axis, dt * veil.userData.drift);
      veil.userData.direction.normalize();
      alignObjectToSphere(veil, veil.userData.direction, veil.userData.height, veil.userData.spin);
    }
  }

  for (const fog of nightFog.children) {
    const axis = cloudDriftAxisScratch.crossVectors(NIGHT_AXIS_A, fog.userData.direction).normalize();
    if (axis.lengthSq() > 0.0001) {
      fog.userData.direction.applyAxisAngle(axis, dt * fog.userData.drift);
      fog.userData.direction.normalize();
      alignObjectToSphere(fog, fog.userData.direction, fog.userData.height, fog.userData.spin);
    }
  }

  for (const halo of sanctuaryAnimatedHalos) {
    halo.rotation.z += dt * halo.userData.spin;
  }
}

function updateDuskTowerCompass(dt) {
  const rotor = duskTower.userData.rotor;
  if (!rotor) return;
  const guidanceMode = getCompassGuidanceMode();
  let targetAngleOffset = 0;
  if (guidanceMode === 'black-box') {
    targetAngleOffset = Math.PI;
  }
  const targetDirection = getCompassGuidanceDirection(compassTargetDirectionScratch, guidanceMode);

  if (!targetDirection) {
    rotor.rotation.y += dt * COMPASS_SPIN_RATE;
    return;
  }

  compassTargetProjected.copy(targetDirection)
    .addScaledVector(COMPASS_DIR, -targetDirection.dot(COMPASS_DIR));
  if (compassTargetProjected.lengthSq() < 0.0001) return;
  compassTargetProjected.normalize();

  duskTowerInverseQuatScratch.copy(duskTower.quaternion).invert();
  compassTargetLocal.copy(compassTargetProjected).applyQuaternion(duskTowerInverseQuatScratch);
  compassTargetLocal.y = 0;
  if (compassTargetLocal.lengthSq() < 0.0001) return;
  compassTargetLocal.normalize();

  const targetAngle = Math.atan2(compassTargetLocal.x, compassTargetLocal.z) + targetAngleOffset;
  const delta = THREE.MathUtils.euclideanModulo(targetAngle - rotor.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  rotor.rotation.y += delta * (1 - Math.exp(-COMPASS_SETTLE_RATE * dt));
}

function updateSanctuaryActivation(dt) {
  if (returnRouteState.phase !== RETURN_ROUTE_PHASES.SANCTUARY) {
    returnRouteState.sanctuaryActivationTime = 0;
    sanctuaryLight.intensity = 1.55;
    sanctuaryBeam.visible = false;
    sanctuaryBeam.material.opacity = 0.0;
    sanctuaryPulseMat.opacity = 0.72;
  sanctuaryLaunchBeam.visible = false;
  sanctuaryLaunchGlow.visible = false;
  sanctuaryLaunchBeam.position.y = SANCTUARY_BEAM_HEIGHT * 0.01;
  sanctuaryLaunchGlow.position.y = SANCTUARY_BEAM_HEIGHT * 0.01;
  sanctuaryLaunchBeam.scale.set(SANCTUARY_BEAM_THICKNESS_SCALE, 0.02, SANCTUARY_BEAM_THICKNESS_SCALE);
  sanctuaryLaunchGlow.scale.set(SANCTUARY_BEAM_THICKNESS_SCALE, 0.02, SANCTUARY_BEAM_THICKNESS_SCALE);
  sanctuaryLaunchMat.opacity = 0.0;
  sanctuaryLaunchGlowMat.opacity = 0.0;
  for (const marker of sanctuaryLaunchMarkers) {
      marker.visible = false;
      marker.material.opacity = 0.0;
    }
    return;
  }

  returnRouteState.sanctuaryActivationTime += dt;
  const activationTime = Math.min(returnRouteState.sanctuaryActivationTime, SANCTUARY_ACTIVATION_DURATION);
  const activation = THREE.MathUtils.smoothstep(
    activationTime / SANCTUARY_ACTIVATION_DURATION,
    0,
    1
  );
  const beamProgress = THREE.MathUtils.smoothstep(
    THREE.MathUtils.clamp((activationTime - SANCTUARY_ACTIVATION_DURATION * 0.28) / (SANCTUARY_ACTIVATION_DURATION * 0.72), 0, 1),
    0,
    1
  );
  sanctuaryLight.intensity = THREE.MathUtils.lerp(1.55, 4.2, activation);
  sanctuaryBeam.visible = activation > 0.02;
  sanctuaryBeam.material.opacity = THREE.MathUtils.lerp(0.0, 0.58, activation);
  sanctuaryPulseMat.opacity = THREE.MathUtils.lerp(0.72, 0.98, activation);
  sanctuaryLaunchBeam.visible = beamProgress > 0.001;
  sanctuaryLaunchGlow.visible = beamProgress > 0.001;
  const beamLengthScale = THREE.MathUtils.lerp(0.02, 1.0, beamProgress);
  const beamHalfHeight = SANCTUARY_BEAM_HEIGHT * beamLengthScale * 0.5;
  sanctuaryLaunchBeam.position.y = beamHalfHeight;
  sanctuaryLaunchGlow.position.y = beamHalfHeight;
  sanctuaryLaunchBeam.scale.set(
    SANCTUARY_BEAM_THICKNESS_SCALE,
    beamLengthScale,
    SANCTUARY_BEAM_THICKNESS_SCALE
  );
  sanctuaryLaunchGlow.scale.set(
    SANCTUARY_BEAM_THICKNESS_SCALE,
    beamLengthScale,
    SANCTUARY_BEAM_THICKNESS_SCALE
  );
  sanctuaryLaunchMat.opacity = THREE.MathUtils.lerp(0.0, 0.88, beamProgress);
  sanctuaryLaunchGlowMat.opacity = THREE.MathUtils.lerp(0.0, 0.3, beamProgress);
  const markerScroll = (returnRouteState.sanctuaryActivationTime * 0.19) % 1;
  const markerSpan = Math.max(0, SANCTUARY_BEAM_HEIGHT * beamLengthScale - 180);
  for (const marker of sanctuaryLaunchMarkers) {
    const cycle = (marker.userData.offset + markerScroll) % 1;
    const pulse = 0.72 + Math.sin((cycle + beamProgress) * Math.PI * 2) * 0.18;
    marker.visible = beamProgress > 0.06 && markerSpan > 0;
    marker.position.y = 90 + cycle * markerSpan;
    marker.scale.setScalar(THREE.MathUtils.lerp(0.86, 1.14, cycle) * SANCTUARY_BEAM_THICKNESS_SCALE);
    marker.material.opacity = marker.visible
      ? THREE.MathUtils.lerp(0.0, 0.46, beamProgress) * pulse
      : 0.0;
  }
}

function updateSpaceEnvironment() {
  const spaceBlend = returnRouteState.spaceTransition;
  if (
    spaceEnvironmentPerfState.initialized &&
    Math.abs(spaceBlend - spaceEnvironmentPerfState.lastBlend) < 0.0005
  ) {
    return;
  }
  spaceEnvironmentPerfState.initialized = true;
  spaceEnvironmentPerfState.lastBlend = spaceBlend;
  const targetFar = THREE.MathUtils.lerp(DEFAULT_CAMERA_FAR, SPACE_CAMERA_FAR, spaceBlend);
  if (Math.abs(camera.far - targetFar) > 0.1) {
    camera.far = targetFar;
    camera.updateProjectionMatrix();
  }
  renderer.setClearColor(blendedClearColor.copy(defaultClearColor).lerp(spaceClearColor, spaceBlend), 1);
  if (scene.fog) {
    scene.fog.near = THREE.MathUtils.lerp(DEFAULT_FOG_NEAR, SPACE_FOG_NEAR, spaceBlend);
    scene.fog.far = THREE.MathUtils.lerp(DEFAULT_FOG_FAR, SPACE_FOG_FAR, spaceBlend);
  }
  sky.visible = spaceBlend < 0.92;
  atmosphere.visible = spaceBlend < 0.88;
  sun.visible = spaceBlend < 0.8;
  if (spaceBlend < 0.92) {
    const targetSkyScale = 1;
    if (Math.abs(sky.scale.x - targetSkyScale) > 0.001) {
      sky.scale.setScalar(targetSkyScale);
    }
  }
}

function updateSpaceStars(dt) {
  const useStars = returnRouteState.spaceTransition > 0.02 && returnRouteState.beamDirection.lengthSq() > 0.0001;
  spaceStars.visible = useStars;
  spaceAsteroidField.visible = useStars;
  if (!useStars) return;
  const transitionOpacity = THREE.MathUtils.smoothstep(returnRouteState.spaceTransition, 0.12, 0.72);
  spaceStars.material.opacity = 0.9 * transitionOpacity;

  spaceStars.position.copy(camera.position);
  spaceStars.quaternion.setFromUnitVectors(spaceLocalForward, returnRouteState.beamDirection);
  spaceAsteroidField.position.copy(camera.position);
  spaceAsteroidField.quaternion.setFromUnitVectors(spaceLocalForward, returnRouteState.beamDirection);

  const positions = spaceStarsGeometry.attributes.position.array;
  const scrollSpeed = Math.max(
    110,
    (state.currentSpeed + Math.max(0, state.radialSpeed) + 20) * SPACE_STAR_SPEED_MULTIPLIER
  );
  for (let i = 0; i < SPACE_STAR_COUNT; i++) {
    const i3 = i * 3;
    positions[i3 + 2] -= scrollSpeed * spaceStarDrift[i] * dt;
    if (positions[i3 + 2] < -SPACE_STAR_DEPTH * 0.5) {
      resetSpaceStar(i, SPACE_STAR_DEPTH * 0.5);
    }
  }
  spaceStarsGeometry.attributes.position.needsUpdate = true;

  const asteroidScrollSpeed = scrollSpeed * 0.68;
  for (const asteroid of spaceAsteroids) {
    asteroid.visible = true;
    asteroid.material.opacity = asteroid.userData.opacity * transitionOpacity;
    asteroid.position.z -= asteroidScrollSpeed * asteroid.userData.drift * dt;
    asteroid.rotation.x += asteroid.userData.spin.x * dt;
    asteroid.rotation.y += asteroid.userData.spin.y * dt;
    asteroid.rotation.z += asteroid.userData.spin.z * dt;
    if (asteroid.position.z < -SPACE_ASTEROID_DEPTH * 0.34) {
      resetSpaceAsteroid(asteroid, SPACE_ASTEROID_DEPTH * 0.5 + Math.random() * 220);
    }
  }
}

function updateEarthReturn() {
  const earthActive = returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY
    && returnRouteState.beamDirection.lengthSq() > 0.0001
    && !endingUiState.completed;
  if (!earthActive) {
    earthReturn.earth.visible = false;
    earthReturn.glow.visible = false;
    return;
  }

  getEarthReturnWorldPosition(earthWorldPosition);
  earthReturn.earth.position.copy(earthWorldPosition);
  earthReturn.glow.position.copy(earthWorldPosition);

  const approachDistance = state.pos.distanceTo(earthWorldPosition);
  if (returnRouteState.earthApproachStartDistance <= 0) {
    returnRouteState.earthApproachStartDistance = Math.max(EARTH_APPROACH_START_DISTANCE, approachDistance);
  } else {
    returnRouteState.earthApproachStartDistance = Math.max(
      returnRouteState.earthApproachStartDistance,
      approachDistance
    );
  }
  const approachStartDistance = Math.max(
    EARTH_APPROACH_END_DISTANCE + 1,
    returnRouteState.earthApproachStartDistance
  );
  const approachProgress = THREE.MathUtils.smoothstep(
    THREE.MathUtils.clamp(
      1 - (approachDistance - EARTH_APPROACH_END_DISTANCE) /
      Math.max(1, approachStartDistance - EARTH_APPROACH_END_DISTANCE),
      0,
      1
    ),
    0,
    1
  );
  const altitude = Math.max(0, getAltitude(state.pos));
  const silenceGate = THREE.MathUtils.smoothstep(
    altitude,
    SPACE_RETURN_MODE_ALTITUDE + 250,
    SPACE_RETURN_MODE_ALTITUDE + 360
  );
  const reveal = returnRouteState.spaceFlightActive
    ? silenceGate * THREE.MathUtils.smoothstep(approachProgress, 0.05, 0.2)
    : 0;

  earthReturn.earth.visible = reveal > 0.001;
  earthReturn.glow.visible = reveal > 0.001;
  earthReturn.earth.material.opacity = reveal;
  earthReturn.glow.material.opacity = THREE.MathUtils.lerp(0.04, 0.24, reveal) * (0.68 + approachProgress * 0.28);
  earthReturn.earth.scale.setScalar(THREE.MathUtils.lerp(EARTH_RETURN_SIZE * 0.34, EARTH_RETURN_SIZE * 1.62, approachProgress));
  earthReturn.glow.scale.setScalar(THREE.MathUtils.lerp(EARTH_RETURN_GLOW_SIZE * 0.28, EARTH_RETURN_GLOW_SIZE * 1.38, approachProgress));

  if (approachDistance <= EARTH_CONTACT_DISTANCE) {
    triggerEarthEnding();
  }
}

function updateEndingSequence(dt) {
  if (endingUiState.whiteoutActive) {
    endingUiState.whiteoutTime += dt;
    if (endingUiState.trueEnding && endingUiState.whiteoutTime >= ENDING_WHITEOUT_DURATION) {
      endingUiState.trueMessageActive = true;
      endingUiState.trueMessageTime += dt;
      syncEndingPresentation();
      if (endingUiState.trueMessageTime < ENDING_TRUE_MESSAGE_DURATION) {
        return;
      }
      endingUiState.trueMessageActive = false;
    }
    if (endingUiState.whiteoutTime >= ENDING_WHITEOUT_DURATION) {
      endingUiState.whiteoutActive = false;
      endingUiState.transitionTime = 0;
      if (endingRise) {
        endingRise.style.animation = 'none';
        endingRise.offsetHeight;
        endingRise.style.animation = '';
      }
      setEndingOverlayTransitioning(true);
    }
    return;
  }

  if (endingUiState.transitionActive) {
    endingUiState.transitionTime += dt;
    if (endingUiState.transitionTime >= ENDING_BLACK_RISE_DURATION) {
      endingUiState.transitionTime = 0;
      endingWhiteout?.classList.remove('is-active');
      setEndingOverlayTransitioning(false);
      setEndingOverlayOpen(true);
    }
    return;
  }

  if (!endingUiState.open) return;
  endingUiState.rollTime = Math.min(ENDING_ROLL_DURATION, endingUiState.rollTime + dt);
  layoutEndingRoll(false);
  syncEndingPresentation();
  if (endingOverlay) {
    endingOverlay.style.background = '#000';
  }
  if (endingRollViewport) {
    endingRollViewport.style.background = '#000';
  }
}

function updateCamera(dt) {
  const groundUp = updateCameraGroundUpScratch.copy(state.visualUp).normalize();
  const targetLift = THREE.MathUtils.clamp(state.visualForward.dot(groundUp), -0.5, 0.5);
  const cameraPitchResponse = targetLift < state.cameraLift
    ? P.CAMERA_DESCEND_PITCH_SMOOTH
    : P.CAMERA_PITCH_SMOOTH;
  const forwardBlend = 1 - Math.exp(-cameraPitchResponse * dt);
  state.cameraLift = THREE.MathUtils.lerp(state.cameraLift, targetLift, forwardBlend);
  const lookResponse = input.lookDragging ? P.CAMERA_LOOK_RESPONSE : P.CAMERA_LOOK_RETURN;
  state.cameraYawOffset = THREE.MathUtils.damp(state.cameraYawOffset, state.cameraYawTarget, lookResponse, dt);
  state.cameraLensOffset = THREE.MathUtils.damp(state.cameraLensOffset, 0, lookResponse, dt);
  const cameraForward = updateCameraForwardScratch.copy(state.forward).addScaledVector(groundUp, state.cameraLift).normalize();
  const cameraRight = updateCameraRightScratch.crossVectors(groundUp, cameraForward).normalize();
  const speed = state.currentSpeed;
  const dist = P.CAMERA_DIST + speed * P.CAMERA_DIST_SPEED;
  const groundTarget = updateCameraGroundTargetScratch.copy(state.pos).addScaledVector(groundUp, P.CAMERA_HEIGHT);
  const orbitOffset = updateCameraOrbitOffsetScratch.copy(cameraForward).multiplyScalar(-dist).addScaledVector(groundUp, 1.6);
  if (Math.abs(state.cameraYawOffset) > 0.0001) {
    orbitOffset.applyAxisAngle(groundUp, -state.cameraYawOffset);
  }
  const groundDesired = updateCameraGroundDesiredScratch.copy(groundTarget).add(orbitOffset);
  const speedFactor = THREE.MathUtils.clamp((speed - P.MIN_FWD_SPEED) / Math.max(P.GLIDE_SPEED - P.MIN_FWD_SPEED + P.BOOST_ENERGY, 1), 0, 1);
  const groundFov = P.BASE_FOV + speedFactor * P.SPEED_FOV + state.cameraLensOffset;

  const desired = updateCameraDesiredScratch.copy(groundDesired);
  const target = updateCameraTargetScratch.copy(groundTarget);
  const up = updateCameraUpScratch.copy(groundUp);
  let targetFov = groundFov;
  const spaceBlend = returnRouteState.spaceTransition;
  const groundLookMode = spaceBlend > 0.001 ? CAMERA_LOOK_MODES.CHASE : state.cameraLookMode;
  const useFirstPersonLook =
    groundLookMode === CAMERA_LOOK_MODES.FP_LEFT ||
    groundLookMode === CAMERA_LOOK_MODES.FP_RIGHT ||
    groundLookMode === CAMERA_LOOK_MODES.FP_FORWARD;
  player.visible = !useFirstPersonLook;

  if (groundLookMode !== CAMERA_LOOK_MODES.CHASE) {
    const headBase = updateCameraHeadBaseScratch.copy(player.position)
      .addScaledVector(groundUp, 0.42)
      .addScaledVector(cameraForward, 0.2);

    if (groundLookMode === CAMERA_LOOK_MODES.FP_LEFT) {
      desired.copy(headBase);
      target.copy(headBase).addScaledVector(cameraRight, -24);
      targetFov = 70;
    } else if (groundLookMode === CAMERA_LOOK_MODES.FP_RIGHT) {
      desired.copy(headBase);
      target.copy(headBase).addScaledVector(cameraRight, 24);
      targetFov = 70;
    } else if (groundLookMode === CAMERA_LOOK_MODES.FP_FORWARD) {
      desired.copy(headBase);
      target.copy(headBase).addScaledVector(cameraForward, 28);
      targetFov = 70;
    } else if (groundLookMode === CAMERA_LOOK_MODES.FRONT_LOOKBACK) {
      desired.copy(player.position)
        .addScaledVector(cameraForward, 8.8)
        .addScaledVector(groundUp, 2.3);
      target.copy(player.position)
        .addScaledVector(groundUp, 0.55)
        .addScaledVector(cameraForward, -0.2);
      targetFov = 86;
    }
  } else if (spaceBlend > 0.001 && returnRouteState.spaceUpDirection.lengthSq() > 0.0001) {
    const spaceUp = updateCameraSpaceUpScratch.copy(returnRouteState.spaceUpDirection).normalize();
    const spaceForward = updateCameraSpaceForwardScratch.copy(state.visualForward).normalize();
    if (returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY && !endingUiState.completed) {
      getEarthReturnWorldPosition(earthWorldPosition);
      earthGuideDirection.copy(earthWorldPosition).sub(state.pos);
      if (earthGuideDirection.lengthSq() > 0.0001) {
        earthGuideDirection.normalize();
        spaceForward.lerp(earthGuideDirection, 0.82).normalize();
      }
    }
    const spaceTarget = updateCameraSpaceTargetScratch.copy(state.pos)
      .addScaledVector(spaceUp, SPACE_CAMERA_HEIGHT)
      .addScaledVector(spaceForward, SPACE_CAMERA_LOOK_AHEAD);
    const spaceDesired = updateCameraSpaceDesiredScratch.copy(state.pos)
      .addScaledVector(spaceUp, SPACE_CAMERA_HEIGHT + SPACE_CAMERA_LIFT)
      .addScaledVector(spaceForward, -SPACE_CAMERA_TRAIL);
    desired.lerp(spaceDesired, spaceBlend);
    target.lerp(spaceTarget, spaceBlend);
    up.lerp(spaceUp, spaceBlend).normalize();
    targetFov = THREE.MathUtils.lerp(groundFov, P.BASE_FOV + state.cameraLensOffset * 0.6, spaceBlend);
  }

  const smoothBase = THREE.MathUtils.lerp(P.CAMERA_SMOOTH, SPACE_CAMERA_SMOOTH, spaceBlend);
  const smooth = 1 - Math.pow(1 - smoothBase, dt * 60);
  camera.position.lerp(desired, smooth);
  camera.up.lerp(up, smooth).normalize();
  const clampedTargetFov = THREE.MathUtils.clamp(targetFov, 30, 138);
  const nextFov = THREE.MathUtils.lerp(camera.fov, clampedTargetFov, smooth);
  if (Math.abs(nextFov - camera.fov) > 0.01) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(target);
  camera.updateMatrixWorld();
  atmosphereMat.uniforms.cameraPos.value.copy(camera.position);
}

function updateTrackVisualizer() {
  if (!visualizerBars.length) return;
  if (!isBgmEffectivelyPlaying()) {
    if (visualizerIdleState === true) return;
    visualizerIdleState = true;
    for (const bar of visualizerBars) {
      bar.style.transform = 'scaleY(0.22)';
      bar.style.opacity = '0.42';
    }
    return;
  }

  visualizerIdleState = false;
  for (let i = 0; i < visualizerBars.length; i++) {
    const phase = bgm.currentTime * (2.1 + i * 0.23) + i * 0.85;
    const pulse = Math.abs(Math.sin(phase) * 0.66 + Math.cos(phase * 0.57) * 0.34);
    const scale = 0.24 + pulse * 1.45;
    visualizerBars[i].style.transform = `scaleY(${scale.toFixed(3)})`;
    visualizerBars[i].style.opacity = `${(0.48 + pulse * 0.46).toFixed(3)}`;
  }
}

function updateLyricsLayout() {
  if (!lyricsPanel || !stickArea) return;
  if (!lyricsVisible && !lyricsFullVisible) return;
  tempProjected.copy(state.pos).project(camera);
  const playerScreenY = (1 - tempProjected.y) * 0.5 * window.innerHeight;
  const stickTop = stickArea.getBoundingClientRect().top;
  const midpointY = THREE.MathUtils.clamp((playerScreenY + stickTop) * 0.5, 88, window.innerHeight - 120);
  if (lastLyricsPanelY === null || Math.abs(midpointY - lastLyricsPanelY) > 1) {
    lyricsPanel.style.top = `${midpointY.toFixed(1)}px`;
    lastLyricsPanelY = midpointY;
  }

  if (lyricsFullPanel && trackControls) {
    const controlsRect = trackControls.getBoundingClientRect();
    const fullTop = Math.min(controlsRect.bottom + 10, window.innerHeight - 220);
    const footerClearance = window.innerWidth <= 860 ? 44 : 56;
    const availableHeight = THREE.MathUtils.clamp(window.innerHeight - fullTop - footerClearance, 220, window.innerWidth <= 860 ? 520 : 640);
    if (lastLyricsFullTop === null || Math.abs(fullTop - lastLyricsFullTop) > 1) {
      lyricsFullPanel.style.top = `${fullTop.toFixed(1)}px`;
      lastLyricsFullTop = fullTop;
    }
    lyricsFullPanel.style.maxHeight = `${availableHeight.toFixed(1)}px`;
    if (lyricsFullVisible) fitFullLyricsText();
  }
}

function updateLyricsUi() {
  if (!lyricsPanel || !lyricsCurrent || !lyricsFullPanel || !lyricsFullText) return;
  if (shouldHideMusicUi()) {
    lyricsPanel.classList.remove('is-visible', 'is-idle');
    lyricsPanel.setAttribute('aria-hidden', 'true');
    lyricsFullPanel.classList.remove('is-visible');
    lyricsFullPanel.setAttribute('aria-hidden', 'true');
    lyricsVisible = false;
    lyricsFullVisible = false;
    return;
  }

  const track = playlist[currentTrackIndex];
  const lyrics = track?.lyrics ?? [];
  const fullLyrics = normalizeFullLyricsText(track?.fullLyrics ?? '');
  const hasTimedLyrics = lyrics.length > 0;
  const hasFullLyrics = fullLyrics.length > 0;
  const bgmPlaying = isBgmEffectivelyPlaying();
  const shouldShowTimed = lyricsEnabled && hasTimedLyrics && bgmPlaying;
  const shouldShowFull = lyricsEnabled && !hasTimedLyrics && hasFullLyrics && bgmPlaying;

  if (!shouldShowTimed) {
    if (lyricsVisible) {
      lyricsPanel.classList.remove('is-visible', 'is-idle');
      lyricsPanel.setAttribute('aria-hidden', 'true');
      lyricsCurrent.textContent = '';
      lastLyricsCurrent = '';
      lyricsVisible = false;
    }
  }

  if (!shouldShowFull) {
    if (lyricsFullVisible) {
      lyricsFullPanel.classList.remove('is-visible');
      lyricsFullPanel.setAttribute('aria-hidden', 'true');
      lyricsFullText.textContent = '';
      lastLyricsFull = '';
      lyricsFullVisible = false;
    }
  }

  if (!shouldShowTimed && !shouldShowFull) {
    return;
  }

  if (shouldShowFull) {
    if (fullLyrics !== lastLyricsFull) {
      lyricsFullText.textContent = fullLyrics;
      lyricsFullPanel.scrollTop = 0;
      lastLyricsFull = fullLyrics;
    }
    if (!lyricsFullVisible) {
      lyricsFullPanel.classList.add('is-visible');
      lyricsFullPanel.setAttribute('aria-hidden', 'false');
      lyricsFullVisible = true;
    }
    fitFullLyricsText();
  } else if (track && !hasTimedLyrics && !track.fullLyricsPromise) {
    ensureTrackFullLyrics(track);
  }

  if (shouldShowTimed) {
    let currentIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= bgm.currentTime + 0.02) currentIndex = i;
      else break;
    }

    const currentText = currentIndex >= 0 ? lyrics[currentIndex].text : '';

    if (currentText !== lastLyricsCurrent) {
      lyricsCurrent.textContent = currentText || '\u00a0';
      lastLyricsCurrent = currentText;
    }

    lyricsPanel.classList.toggle('is-idle', !currentText);
    if (!lyricsVisible) {
      lyricsPanel.classList.add('is-visible');
      lyricsPanel.setAttribute('aria-hidden', 'false');
      lyricsVisible = true;
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRuntimePixelRatio(rendererPerfState.currentPixelRatio, true);
  lastLyricsPanelY = null;
  lastLyricsFullTop = null;
  updateLyricsLayout();
  if (bookUiState.open && bookUiState.currentView === 'read') {
    renderBookReadPage(bookUiState.lastMessages);
  }
  layoutEndingRoll(false);
  syncEndingPresentation();
});

function snapCameraOnce() {
  const up = state.pos.clone().normalize();
  const target = state.pos.clone().addScaledVector(up, P.CAMERA_HEIGHT);
  const desired = target.clone().addScaledVector(state.forward, -P.CAMERA_DIST).addScaledVector(up, 1.6);
  camera.position.copy(desired);
  camera.up.copy(up);
  camera.fov = P.BASE_FOV;
  camera.updateProjectionMatrix();
  atmosphereMat.uniforms.cameraPos.value.copy(camera.position);
  camera.lookAt(target);
}

snapCameraOnce();
updateLyricsLayout();
applyDayNightProgression();
applyWorldTheme();
purgeExcludedBookMessagesFromStorage();
loadBookPlayerState();
renderEndingReturnHistory();
loadReturnHistories().catch((error) => {
  console.warn('Failed to prime return histories:', error);
});
if (DEBUG_CAT_PREVIEW) {
  setCatDebugPreviewEnabled(true);
}
if (DEBUG_SANCTUARY_START) {
  debugJumpToSanctuaryCheckpoint();
}
syncEndingPresentation();
layoutEndingRoll(true);

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  previousFramePlayerPos.copy(state.pos);
  updateColorCycle(dt);
  updateThemeSystem(dt);
  const gameplayPaused =
    captureUiState.open ||
    bookUiState.open ||
    blackBoxUiState.open ||
    musicSelectorState.open ||
    endingUiState.open ||
    endingUiState.transitionActive ||
    endingUiState.whiteoutActive;
  if (!gameplayPaused) {
    updatePlayer(dt);
    checkThemeTriggerCollision(previousFramePlayerPos, state.pos);
    updateBlackBox(dt);
    if (giantRecordPlayerDisc && isBgmEffectivelyPlaying()) {
      giantRecordPlayerDisc.rotation.y += dt * GIANT_RECORD_PLAYER_SPIN_RATE;
    }
    updateClouds(dt);
    updateDuskTowerCompass(dt);
    updateSanctuaryActivation(dt);
    updateSpaceEnvironment();
    updateCamera(dt);
    updateSpaceStars(dt);
    updateEarthReturn();
  } else {
    blackBoxLandmark.updateMatrixWorld(true);
    updateSanctuaryActivation(dt);
    updateSpaceEnvironment();
    updateDuskTowerCompass(dt);
    updateSpaceStars(0);
    updateEarthReturn();
  }
  updateCatCompanion(dt);
  updateCatRouteBubble(dt);
  updateEndingSequence(dt);
  updateInvertedSkyWash();
  updateThemeFlash(dt);
  updateThemeDuck(dt);
  if (shouldRunUiStep('visualizer', TRACK_VISUALIZER_INTERVAL, dt)) {
    updateTrackVisualizer();
  }
  if (shouldRunUiStep('lyricsLayout', LYRICS_LAYOUT_INTERVAL, dt)) {
    updateLyricsLayout();
  }
  if (shouldRunUiStep('lyricsUi', LYRICS_UI_INTERVAL, dt)) {
    updateLyricsUi();
  }
  syncMusicUiVisibility();
  syncSpaceReturnAudioState();
  updateRuntimePixelRatio(dt);
  renderer.render(scene, camera);

  if (infoPanel && shouldRunUiStep('info', INFO_PANEL_INTERVAL, dt)) {
    const altitude = Math.max(0, getAltitude(state.pos));
    const routeMode = returnRouteState.spaceFlightActive ? 'space' : returnRouteState.phase;
    let earthInfo = '';
    if (returnRouteState.phase === RETURN_ROUTE_PHASES.SANCTUARY && !endingUiState.completed) {
      getEarthReturnWorldPosition(earthWorldPosition);
      earthInfo = `  earth ${state.pos.distanceTo(earthWorldPosition).toFixed(0)}`;
    }
    const catInfo = catRouteState.debugPreviewActive ? '  cat preview' : '';
    const nextInfoText = `speed ${state.currentSpeed.toFixed(1)}  alt ${altitude.toFixed(1)}  mode ${routeMode}${earthInfo}${catInfo}`;
    if (nextInfoText !== lastInfoText) {
      infoPanel.textContent = nextInfoText;
      lastInfoText = nextInfoText;
    }
  }

  requestAnimationFrame(tick);
}

tick();
