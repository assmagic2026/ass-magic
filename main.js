import * as THREE from './three.module.js';
import { playlist as playlistData } from './playlist.js';
import { supabaseConfig } from './supabase-config.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0d12, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0d12, 90, 560);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);

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
let currentTrackIndex = 0;
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
const IS_APPLE_TOUCH_AUDIO = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let appleTouchEffectsReady = false;
let appleTouchEffectsAttemptAt = 0;
let bgmFilterFrequency = THEME_FILTER_BASE_FREQ;

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

function ensureBgmAudioChain(forceOnApple = false) {
  if (IS_APPLE_TOUCH_AUDIO && !forceOnApple) {
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
}

function setRecordSpinning(isPlaying) {
  trackCard?.classList.toggle('is-spinning', isPlaying);
}

function refreshTrackControls() {
  if (!trackToggle) return;
  const isPlaying = !bgm.paused;
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

function playCurrentTrack() {
  if (bgmPending) return;
  const now = performance.now();
  if (now - bgmLastAttemptAt < 90) return;
  bgmLastAttemptAt = now;
  ensureBgmAudioChain();
  applyBgmOutputVolume(BGM_BASE_VOLUME);
  applyBgmFilterFrequency(THEME_FILTER_BASE_FREQ);
  bgmPending = true;
  const playResult = bgm.play();
  if (playResult && typeof playResult.then === 'function') {
    playResult.then(() => {
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
  applyBgmOutputVolume(BGM_BASE_VOLUME);
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
  if (!bgm.paused) return;
  playCurrentTrack();
}

function startBgmFromGesture() {
  if (!bgm.paused || bgmPending) return;
  bgm.muted = false;
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

  const targetVolume = themeDuckTimer > 0 ? THEME_DUCK_VOLUME : BGM_BASE_VOLUME;
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
const DAY_BLOCKS_DIR = SUN_DIRECTION.clone()
  .addScaledVector(NIGHT_AXIS_A, 0.42)
  .addScaledVector(NIGHT_AXIS_B, -0.16)
  .normalize();
const GIANT_BOOK_ALTITUDE = 0.04;
const GIANT_BOOK_DIR = SUN_DIRECTION.clone()
  .addScaledVector(NIGHT_AXIS_A, -1.4)
  .addScaledVector(NIGHT_AXIS_B, -0.8)
  .normalize();
const BLACK_BOX_ALTITUDE = 0.4;
const BLACK_BOX_GROUND_ALTITUDE = 0.96;
const BLACK_BOX_LOOKAHEAD_SECONDS = 20.0;
const BLACK_BOX_LOOKAHEAD_SPEED = 40;
const BLACK_BOX_SPEED = 200;
const BLACK_BOX_PHASE_LEAD_SECONDS = 0.0;
const BLACK_BOX_ROLL = Math.PI * 0.2;
const DUSK_TOWER_ALTITUDE = -3.8;
const DUSK_TOWER_DIR = NIGHT_AXIS_A.clone()
  .multiplyScalar(-1.0)
  .addScaledVector(NIGHT_AXIS_B, 0.14)
  .addScaledVector(SUN_DIRECTION, 0.12)
  .normalize();
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
const BOOK_MESSAGE_LIMIT = 12;
const BOOK_MESSAGE_TIMEOUT_MS = 9000;
const CAT_PREVIEW_HEIGHT = 4.6;
const CAT_PREVIEW_ALTITUDE = 0.18;
const CAT_PREVIEW_LOOKAHEAD_SECONDS = 5;
const CAT_PREVIEW_LOOKAHEAD_SPEED = 40;
const INVERT_WORLD_FILTER = 'invert(1) hue-rotate(180deg) saturate(0.94) brightness(1.05)';
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
  BASE_FOV: 70,
  SPEED_FOV: 7,
  BOOST_FOV: 3.5,
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
  SEAGULL_GLIDE_Y: -0.02
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

function updateColorCycle() {
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

function createDuskTowerLandmark() {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshLambertMaterial({
    color: 0xe33d34,
    emissive: 0x5e110c,
    emissiveIntensity: 0.16,
    flatShading: true,
  });
  const prism = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 151.2, 3), shellMat);
  prism.position.y = 69.1;
  prism.scale.set(2.3, 1, 0.48);
  group.add(prism);
  group.userData.shellMat = shellMat;

  return group;
}

const themeTriggerZones = [];
const themeBoundsBox = new THREE.Box3();
const themeBoundsSphere = new THREE.Sphere();
const themeSegment = new THREE.Vector3();
const themeOffset = new THREE.Vector3();
const themeClosestPoint = new THREE.Vector3();
const themeZoneCenter = new THREE.Vector3();
const themeProjected = new THREE.Vector3();
const themeFlashScreen = new THREE.Vector2();

function registerThemeTriggerFromObject(object, radiusScale = 0.82, minRadius = 1.7, extra = {}) {
  object.updateMatrixWorld(true);
  themeBoundsBox.setFromObject(object);
  if (themeBoundsBox.isEmpty()) return;
  themeBoundsBox.getBoundingSphere(themeBoundsSphere);
  if (!Number.isFinite(themeBoundsSphere.radius) || themeBoundsSphere.radius <= 0) return;
  const localCenter = object.worldToLocal(themeBoundsSphere.center.clone());
  themeTriggerZones.push({
    object,
    localCenter,
    radius: Math.max(minRadius, themeBoundsSphere.radius * radiusScale),
    onTrigger: typeof extra.onTrigger === 'function' ? extra.onTrigger : null,
    tag: extra.tag ?? null
  });
}

function registerThemeTriggersFromChildren(group, radiusScale = 0.82, minRadius = 1.7, extra = {}) {
  group.updateMatrixWorld(true);
  for (const child of group.children) {
    if (!child.visible) continue;
    registerThemeTriggerFromObject(child, radiusScale, minRadius, extra);
  }
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
registerMaterialCycle(sanctuaryShellMat, true, 0.24, 0.05, 0.03);
registerMaterialCycle(sanctuaryAccentMat, false, 0.26, 0.07, 0.04);
registerMaterialCycle(sanctuaryPulseMat, false, 0.24, 0.08, 0.03);
registerMaterialCycle(sanctuaryWarmMat, false, 0.18, 0.06, 0.03);

const sanctuaryBase = new THREE.Mesh(new THREE.CylinderGeometry(13, 18, 8, 8), sanctuaryShellMat);
sanctuaryBase.position.y = 4;
sanctuary.add(sanctuaryBase);

const sanctuaryRing = new THREE.Mesh(new THREE.TorusGeometry(18, 1.2, 5, 18), sanctuaryAccentMat);
sanctuaryRing.rotation.x = Math.PI * 0.5;
sanctuaryRing.position.y = 7.2;
sanctuary.add(sanctuaryRing);

const sanctuaryCore = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 5.6, 24, 6), sanctuaryShellMat);
sanctuaryCore.position.y = 18;
sanctuary.add(sanctuaryCore);

const sanctuaryCap = new THREE.Mesh(new THREE.OctahedronGeometry(4.8, 0), sanctuaryPulseMat);
sanctuaryCap.position.y = 31;
sanctuary.add(sanctuaryCap);

const sanctuaryBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.3, 2.8, 120, 8, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x7ee9ff, transparent: true, opacity: 0.24 })
);
sanctuaryBeam.position.y = 66;
sanctuary.add(sanctuaryBeam);

for (let i = 0; i < V.SANCTUARY_HALO_COUNT; i++) {
  const halo = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 6, 0.36 + i * 0.08, 4, 16), i === 1 ? sanctuaryPulseMat : sanctuaryAccentMat);
  halo.rotation.x = Math.PI * 0.5;
  halo.position.y = 16 + i * 9;
  halo.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.18 + i * 0.06);
  sanctuaryAnimatedHalos.push(halo);
  sanctuary.add(halo);
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
}

const sanctuaryLight = new THREE.PointLight(0x7ee9ff, 1.55, 180, 2);
sanctuaryLight.position.y = 40;
sanctuary.add(sanctuaryLight);

alignObjectToSphere(sanctuary, NIGHT_CENTER, 0.9, 0.24);
scene.add(sanctuary);
registerThemeTriggerFromObject(sanctuary, 0.58, 11.5);

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
const dayBlockAxes = getSurfaceAxes(DAY_BLOCKS_DIR);
placeDirectedOnSphere(dayBlocks, DAY_BLOCKS_DIR, dayBlockAxes.axisB, 0.45, 0);
scene.add(dayBlocks);
registerThemeTriggerFromObject(dayBlocks, 0.9, 6.8);

// Visual Upgrade Phase 1 landmark hierarchy removed.

const duskTower = createDuskTowerLandmark();
const duskTowerForward = SUN_DIRECTION.clone()
  .addScaledVector(DUSK_TOWER_DIR, -SUN_DIRECTION.dot(DUSK_TOWER_DIR))
  .normalize();
placeDirectedOnSphere(duskTower, DUSK_TOWER_DIR, duskTowerForward, DUSK_TOWER_ALTITUDE, 0.0);
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
registerThemeTriggersFromChildren(clouds, 0.8, 2.2);
registerThemeTriggersFromChildren(cloudVeils, 0.84, 2.4);
registerThemeTriggersFromChildren(nightFog, 0.84, 2.2);

const player = new THREE.Group();
const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const backMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
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

const startUp = new THREE.Vector3(0, 1, 0);
const startRadius = getSurfaceRadius(startUp) + PLAYER_CLEARANCE;
const state = {
  pos: startUp.clone().multiplyScalar(startRadius),
  forward: new THREE.Vector3(0, 0, 1),
  visualUp: startUp.clone(),
  visualForward: new THREE.Vector3(0, 0, 1),
  cameraLift: 0,
  currentSpeed: 40,
  speedLock: 40,
  holdAccel: 0,
  radialSpeed: 0,
  bodyPitch: 0,
  roll: 0,
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
  inverted: false,
  cooldown: 0,
  flashActive: false,
  flashTime: 0,
  flashWorldPoint: new THREE.Vector3(),
  flashScreenPoint: new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
  armed: false,
  startupGrace: THEME_STARTUP_GRACE,
  clearRequired: false
};
const bookUiState = {
  open: false,
  pendingTimer: null,
  lastMessages: [],
  currentView: 'read',
  pageIndex: 0,
  readPages: [],
  backend: 'local'
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
  openedOnce: false
};

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
registerThemeTriggerFromObject(giantBook, 0.72, 7.4, {
  tag: 'book',
  onTrigger: (contactPoint) => handleBookTrigger(contactPoint)
});
placeBlackBoxLandmark();
scene.add(blackBoxLandmark);
registerThemeTriggerFromObject(blackBoxLandmark, 4.7, 14.4, {
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

async function initCatPreview() {
  placeCatPreviewAnchor();
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

    catPreviewAnchor.visible = true;
  } catch (error) {
    console.error('Failed to load cat preview:', error);
  }
}

let bobPhase = Math.random() * Math.PI * 2;

const input = {
  leftId: null,
  rightId: null,
  leftLast: { x: 0, y: 0 },
  turnX: 0,
  turnY: 0,
  flapQueued: false,
  accelHeld: false,
  accelKeyHeld: false,
  stickId: null,
  stickOffset: { x: 0, y: 0 },
  stickSmooth: new THREE.Vector2()
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
const tempProjected = new THREE.Vector3();
const tempCameraDir = new THREE.Vector3();
const accelPointers = new Set();
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

function applyWorldInversion() {
  canvas.style.filter = themeState.inverted ? INVERT_WORLD_FILTER : 'none';
  applySkyPalette(themeState.inverted ? 'inverted' : 'normal');
  const lyricColor = themeState.inverted ? 'rgba(10, 10, 10, 0.94)' : 'rgba(249, 252, 255, 0.98)';
  const lyricShadow = themeState.inverted
    ? '0 1px 6px rgba(255,255,255,0.26), 0 6px 18px rgba(255,255,255,0.14)'
    : '0 2px 6px rgba(0,0,0,0.34), 0 10px 24px rgba(0,0,0,0.18)';
  if (lyricsCurrent) {
    lyricsCurrent.style.setProperty('color', lyricColor, 'important');
    lyricsCurrent.style.setProperty('-webkit-text-fill-color', lyricColor, 'important');
    lyricsCurrent.style.setProperty('text-shadow', lyricShadow, 'important');
  }
  if (lyricsFullText) {
    const fullColor = themeState.inverted ? 'rgba(12, 12, 12, 0.84)' : 'rgba(244, 248, 255, 0.72)';
    const fullShadow = themeState.inverted
      ? '0 1px 5px rgba(255,255,255,0.22)'
      : '0 2px 8px rgba(0,0,0,0.26)';
    lyricsFullText.style.setProperty('color', fullColor, 'important');
    lyricsFullText.style.setProperty('-webkit-text-fill-color', fullColor, 'important');
    lyricsFullText.style.setProperty('text-shadow', fullShadow, 'important');
  }
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
  for (const zone of themeTriggerZones) {
    zone.object.updateMatrixWorld(true);
    themeZoneCenter.copy(zone.localCenter).applyMatrix4(zone.object.matrixWorld);
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

function toggleWorldInversion(contactPoint) {
  if (!themeState.armed || themeState.cooldown > 0 || themeState.clearRequired) return;
  triggerThemeDuck();
  themeState.inverted = !themeState.inverted;
  themeState.cooldown = THEME_TRIGGER_COOLDOWN;
  themeState.clearRequired = true;
  applyWorldInversion();
  startThemeFlash(contactPoint);
}

function checkThemeTriggerCollision(start, end) {
  if (!themeState.armed || themeState.cooldown > 0 || themeState.clearRequired) return;

  let bestT = Infinity;
  let bestPoint = null;
  let bestZone = null;

  for (const zone of themeTriggerZones) {
    zone.object.updateMatrixWorld(true);
    themeZoneCenter.copy(zone.localCenter).applyMatrix4(zone.object.matrixWorld);
    const t = getSegmentSphereHit(start, end, themeZoneCenter, zone.radius + PLAYER_THEME_HIT_RADIUS);
    if (t !== null && t < bestT) {
      bestT = t;
      bestPoint = themeClosestPoint.clone();
      bestZone = zone;
    }
  }

  if (bestPoint) {
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
  if (!themeState.inverted) {
    if (skyThemeWash.style.opacity !== '0') {
      skyThemeWash.style.opacity = '0';
      skyThemeWash.style.background = 'none';
    }
    return;
  }

  camera.getWorldDirection(tempCameraDir);
  const sunView = tempCameraDir.dot(SUN_DIRECTION);
  const dayMix = THREE.MathUtils.clamp((sunView + 0.08) / 0.62, 0, 1);
  const nightMix = THREE.MathUtils.clamp((-sunView + 0.08) / 0.72, 0, 1);
  const green = new THREE.Color(0xdfffd8);
  const yellow = new THREE.Color(0xffea84);
  const wash = yellow.clone().lerp(green, dayMix);
  const alpha = 0.22 + dayMix * 0.4 + nightMix * 0.18;
  const midAlpha = alpha * 0.68;
  const lowerAlpha = alpha * 0.18;

  skyThemeWash.style.opacity = '1';
  skyThemeWash.style.background = `linear-gradient(180deg,
    rgba(${Math.round(wash.r * 255)}, ${Math.round(wash.g * 255)}, ${Math.round(wash.b * 255)}, ${alpha.toFixed(3)}) 0%,
    rgba(${Math.round(wash.r * 255)}, ${Math.round(wash.g * 255)}, ${Math.round(wash.b * 255)}, ${midAlpha.toFixed(3)}) 42%,
    rgba(${Math.round(wash.r * 255)}, ${Math.round(wash.g * 255)}, ${Math.round(wash.b * 255)}, ${lowerAlpha.toFixed(3)}) 68%,
    rgba(${Math.round(wash.r * 255)}, ${Math.round(wash.g * 255)}, ${Math.round(wash.b * 255)}, 0.0) 78%)`;
}

function queueFlap() {
  input.flapQueued = true;
}

function refreshAccelHeld() {
  input.accelHeld = input.accelKeyHeld || accelPointers.size > 0;
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
  themeDuckTimer = 0;
  themeFilterTimer = 0;
  applyBgmOutputVolume(BGM_BASE_VOLUME);
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
}

function cloneMessages(messages) {
  return messages.map((entry) => ({ ...entry }));
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

function getSupabaseRestUrl(query = '') {
  const baseUrl = supabaseConfig.url.replace(/\/+$/, '');
  return `${baseUrl}/rest/v1/${encodeURIComponent(getSupabaseTableName())}${query}`;
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
      const response = await fetchWithTimeout(
        getSupabaseRestUrl(`?select=id,name,message,created_at&order=created_at.desc&limit=${BOOK_MESSAGE_LIMIT}`),
        {
          headers: getSupabaseHeaders(),
          cache: 'no-store'
        }
      );
      if (!response.ok) {
        throw new Error(`supabase-load-${response.status}`);
      }
      const payload = await response.json();
      const messages = (Array.isArray(payload) ? payload : [])
        .map(normalizeMessageEntry)
        .filter(Boolean)
        .slice(0, BOOK_MESSAGE_LIMIT);

      bookUiState.backend = 'supabase';
      bookUiState.lastMessages = messages.length ? messages : cloneMessages(BOOK_MESSAGE_SEED);
      return cloneMessages(bookUiState.lastMessages);
    } catch (error) {
      console.warn('Failed to load Supabase book messages, falling back locally:', error);
      bookUiState.backend = 'degraded';
    }
  } else {
    bookUiState.backend = 'local';
  }

  let messages = cloneMessages(BOOK_MESSAGE_SEED);
  try {
    const stored = window.localStorage.getItem(BOOK_MESSAGE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        messages = parsed.map(normalizeMessageEntry).filter(Boolean);
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
      bookUiState.lastMessages = await loadMessages({ force: true });
      return savedEntry;
    } catch (error) {
      console.warn('Failed to save Supabase book message, falling back locally:', error);
      bookUiState.backend = 'degraded';
    }
  } else {
    bookUiState.backend = 'local';
  }

  const messages = await loadMessages();
  const entry = {
    id: `book-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: trimmedName,
    message: trimmedMessage,
    createdAt: new Date().toISOString()
  };
  const nextMessages = [entry, ...messages].slice(0, BOOK_MESSAGE_LIMIT);
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
  setBookOverlayOpen(false);
}

function openBlackBoxOverlay() {
  closeBookOverlay();
  setBlackBoxView('intro');
  if (blackBoxTitle) {
    blackBoxTitle.style.display = blackBoxUiState.openedOnce ? 'none' : '';
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
  setBlackBoxOverlayOpen(false);
}

function handleBookTrigger() {
  if (bookUiState.open) return;
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
  if (contactPoint) {
    blackBoxUiState.lastTriggerPoint.copy(contactPoint);
    blackBoxUiState.lastTriggerAngle = blackBoxUiState.routeAngle;
    const groundedDirection = contactPoint.clone().normalize();
    const groundedForward = state.forward.clone()
      .addScaledVector(groundedDirection, -state.forward.dot(groundedDirection))
      .normalize();
    blackBoxUiState.mode = 'grounded';
    placeGroundedBlackBox(groundedDirection, groundedForward);
  }
  if (blackBoxUiState.pendingTimer !== null) {
    window.clearTimeout(blackBoxUiState.pendingTimer);
    blackBoxUiState.pendingTimer = null;
  }
  openBlackBoxOverlay();
}

function handlePointerDown(e) {
  e.preventDefault();

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

  if (accelPointers.delete(e.pointerId)) {
    refreshAccelHeld();
  }

  if (e.pointerId === input.leftId) {
    input.leftId = null;
  } else if (e.pointerId === input.rightId) {
    queueFlap();
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

menuToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
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
  blackBoxBack,
  blackBoxDownload
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

bookClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBookOverlay();
});

blackBoxBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});

blackBoxClose?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeBlackBoxOverlay();
});

blackBoxOpen?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
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
  blackBoxUiState.revealCount += 1;
  setBlackBoxView('reveal');
});

blackBoxIgnore?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  resumeBlackBoxOrbit();
  closeBlackBoxOverlay();
});

blackBoxBack?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (blackBoxOpen) {
    blackBoxOpen.textContent = blackBoxUiState.openedOnce ? 'また開けちゃう' : '開けてみる';
  }
  setBlackBoxView('intro');
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
    await saveMessage({
      name: bookNameInput?.value ?? '',
      message
    });
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
loadTrack(0, false);
refreshSpeedLockUi();
refreshTrackControls();
refreshLyricsToggle();
setMenuPage(activeMenuPage);

window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('gesturechange', (e) => e.preventDefault());
window.addEventListener('gestureend', () => forceViewportReset());
window.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('touchmove', (e) => {
  const isEditable = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
  const allowScroll = isEditable || (e.target instanceof Element && e.target.closest('#book-panel, #site-menu-pages'));
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
    closeBookOverlay();
    setSiteMenuOpen(false);
  }
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
    ensureBgm();
  }
  if (e.code === 'Space') {
    input.accelKeyHeld = true;
    refreshAccelHeld();
  }
  if (e.code === 'KeyW') input.turnY -= 6;
  if (e.code === 'KeyS') input.turnY += 6;
  if (e.code === 'KeyA') input.turnX -= 8;
  if (e.code === 'KeyD') input.turnX += 8;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    input.accelKeyHeld = false;
    refreshAccelHeld();
  }
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
  const right = new THREE.Vector3().crossVectors(up, flightForward).normalize();
  const forwardQuat = createBasisQuaternion(flightForward, up);
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
      streak.quaternion.copy(forwardQuat);
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
}

function updatePlayer(dt) {
  const prevForward = state.forward.clone();
  const dragYaw = -input.turnX * P.YAW_SENS;
  const dragPitch = input.turnY * P.PITCH_SENS;
  const stickTarget = tempStick.set(
    -applyDeadzone(input.stickOffset.x / STICK_LIMIT, P.STICK_DEADZONE) * P.STICK_SCALE,
    -applyDeadzone(input.stickOffset.y / STICK_LIMIT, P.STICK_DEADZONE) * P.STICK_SCALE
  );
  const stickBlend = 1 - Math.exp(-(input.stickId !== null ? P.STICK_RESPONSE : P.STICK_RETURN) * dt);
  input.stickSmooth.lerp(stickTarget, stickBlend);
  if (input.stickId === null) {
    input.stickSmooth.y = THREE.MathUtils.damp(input.stickSmooth.y, 0, P.STICK_VERTICAL_RELEASE, dt);
    if (Math.abs(input.stickSmooth.y) < 0.01) input.stickSmooth.y = 0;
  }
  const stickTurn = input.stickSmooth.x;
  const stickLift = input.stickSmooth.y;
  const climbInput = THREE.MathUtils.clamp(
    (input.stickId === null && Math.abs(dragPitch) < 0.0001 ? 0 : stickLift) + dragPitch,
    -1,
    1
  );
  const yawDelta = dragYaw + stickTurn * P.STICK_YAW * dt * 60;
  const turnIntent = THREE.MathUtils.clamp(stickTurn + dragYaw * 18, -1, 1);

  input.turnX = 0;
  input.turnY = 0;

  const up = state.pos.clone().normalize();
  state.forward.applyAxisAngle(up, yawDelta).normalize();
  state.forward.addScaledVector(up, -state.forward.dot(up)).normalize();
  if (state.forward.lengthSq() < 0.0001) {
    state.forward.set(0, 0, 1).addScaledVector(up, -up.z).normalize();
  }

  const right = new THREE.Vector3().crossVectors(up, state.forward).normalize();
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
  } else {
    state.radialSpeed = 0;
  }

  state.radialSpeed *= 1 - P.GLIDE_DRAG * dt;
  const maxAscentSpeed = cruiseSpeed * Math.tan(P.MAX_ASCENT_ANGLE);
  state.radialSpeed = Math.min(state.radialSpeed, maxAscentSpeed);
  const orbitRadius = state.pos.length();
  const moveAngle = (cruiseSpeed * dt) / orbitRadius;
  const nextUp = up.clone().applyAxisAngle(right, moveAngle).normalize();

  state.forward.applyAxisAngle(right, moveAngle).normalize();
  state.forward.addScaledVector(nextUp, -state.forward.dot(nextUp)).normalize();

  let nextRadius = orbitRadius + state.radialSpeed * dt;

  const surfaceRadius = getSurfaceRadius(nextUp) + PLAYER_CLEARANCE;
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
  const signedTurn = Math.atan2(
    new THREE.Vector3().crossVectors(prevForward, state.forward).dot(nextUp),
    THREE.MathUtils.clamp(prevForward.dot(state.forward), -1, 1)
  );
  const bankTarget = THREE.MathUtils.clamp(
    -(signedTurn / Math.max(dt, 0.001)) * P.BANK_FROM_TURN,
    -P.MAX_BANK,
    P.MAX_BANK
  );
  state.roll = THREE.MathUtils.damp(state.roll, bankTarget, P.ROLL_RESPONSE, dt);

  const posePitchTarget = getSeagullPosePitchTarget(state.glideVisual, state.radialSpeed, cruiseSpeed, climbInput);
  const poseNoseUp = Math.max(0, -posePitchTarget);
  const neutralBodyPitch = THREE.MathUtils.lerp(0, P.CRUISE_BODY_PITCH, state.glideVisual);
  const bodyPitchTarget = THREE.MathUtils.clamp(
    Math.atan2(state.radialSpeed, Math.max(cruiseSpeed, 1)) - descendInput * P.DESCEND_INPUT_PITCH + neutralBodyPitch,
    -Math.PI * 0.5,
    Math.max(0, P.MAX_BODY_PITCH - poseNoseUp)
  );
  const bodyPitchResponse = bodyPitchTarget < state.bodyPitch ? P.BODY_DESCEND_PITCH_RESPONSE : P.BODY_PITCH_RESPONSE;
  state.bodyPitch = THREE.MathUtils.damp(state.bodyPitch, bodyPitchTarget, bodyPitchResponse, dt);
  const flightForward = state.forward.clone().applyAxisAngle(right, -state.bodyPitch).normalize();
  const lookQuat = createBasisQuaternion(flightForward, nextUp);
  const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.roll);
  player.quaternion.copy(lookQuat).multiply(rollQuat);

  bobPhase += dt * 0.7;
  const bob = Math.sin(bobPhase) * 0.22 + Math.sin(bobPhase * 0.37 + 1.1) * 0.08;
  player.position.copy(state.pos).addScaledVector(nextUp, bob);

  const shadowRadius = getSurfaceRadius(nextUp) + 0.06;
  const altitude = Math.max(0, nextRadius - surfaceRadius);
  const shadowScale = THREE.MathUtils.clamp(1.1 - altitude * 0.16, 0.34, 1.08);
  shadow.position.copy(nextUp).multiplyScalar(shadowRadius);
  shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nextUp);
  shadow.scale.set(shadowScale * 1.15, shadowScale * 0.8, 1);
  shadow.material.opacity = THREE.MathUtils.clamp(0.24 - altitude * 0.055, 0.05, 0.22);

  if (!state.wasOnGround && state.onGround) {
    spawnDustPuffs(state.pos, nextUp, state.forward);
  }
  state.wasOnGround = state.onGround;
  state.visualUp.copy(nextUp);
  state.visualForward.copy(flightForward);

  updatePlayerVisuals(dt, nextUp, flightForward, cruiseSpeed, turnIntent, climbInput);
  updateSpeedEffects(dt, nextUp, flightForward, cruiseSpeed);
}

function updateClouds(dt) {
  if (FREEZE_CLOUD_DRIFT_FOR_TEST) return;

  for (const cloud of clouds.children) {
    const axis = new THREE.Vector3().crossVectors(WORLD_UP, cloud.userData.direction).normalize();
    if (axis.lengthSq() > 0.0001) {
      cloud.userData.direction.applyAxisAngle(axis, dt * cloud.userData.drift);
      cloud.userData.direction.normalize();
      alignObjectToSphere(cloud, cloud.userData.direction, cloud.userData.height, cloud.userData.spin);
    }
  }

  for (const veil of cloudVeils.children) {
    const axis = new THREE.Vector3().crossVectors(WORLD_UP, veil.userData.direction).normalize();
    if (axis.lengthSq() > 0.0001) {
      veil.userData.direction.applyAxisAngle(axis, dt * veil.userData.drift);
      veil.userData.direction.normalize();
      alignObjectToSphere(veil, veil.userData.direction, veil.userData.height, veil.userData.spin);
    }
  }

  for (const fog of nightFog.children) {
    const axis = new THREE.Vector3().crossVectors(NIGHT_AXIS_A, fog.userData.direction).normalize();
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

function updateCamera(dt) {
  const up = state.pos.clone().normalize();
  const targetLift = THREE.MathUtils.clamp(state.visualForward.dot(up), -0.5, 0.5);
  const cameraPitchResponse = targetLift < state.cameraLift
    ? P.CAMERA_DESCEND_PITCH_SMOOTH
    : P.CAMERA_PITCH_SMOOTH;
  const forwardBlend = 1 - Math.exp(-cameraPitchResponse * dt);
  state.cameraLift = THREE.MathUtils.lerp(state.cameraLift, targetLift, forwardBlend);
  const cameraForward = state.forward.clone().addScaledVector(up, state.cameraLift).normalize();
  const speed = state.currentSpeed;
  const dist = P.CAMERA_DIST + speed * P.CAMERA_DIST_SPEED;
  const target = state.pos.clone().addScaledVector(up, P.CAMERA_HEIGHT);
  const desired = target.clone().addScaledVector(cameraForward, -dist).addScaledVector(up, 1.6);
  const smooth = 1 - Math.pow(1 - P.CAMERA_SMOOTH, dt * 60);
  camera.position.lerp(desired, smooth);
  camera.up.lerp(up, smooth).normalize();
  const speedFactor = THREE.MathUtils.clamp((speed - P.MIN_FWD_SPEED) / Math.max(P.GLIDE_SPEED - P.MIN_FWD_SPEED + P.BOOST_ENERGY, 1), 0, 1);
  const targetFov = P.BASE_FOV + speedFactor * P.SPEED_FOV;
  const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, smooth);
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
  if (bgm.paused) {
    for (const bar of visualizerBars) {
      bar.style.transform = 'scaleY(0.22)';
      bar.style.opacity = '0.42';
    }
    return;
  }

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

  const track = playlist[currentTrackIndex];
  const lyrics = track?.lyrics ?? [];
  const fullLyrics = normalizeFullLyricsText(track?.fullLyrics ?? '');
  const hasTimedLyrics = lyrics.length > 0;
  const hasFullLyrics = fullLyrics.length > 0;
  const shouldShowTimed = lyricsEnabled && hasTimedLyrics && !bgm.paused;
  const shouldShowFull = lyricsEnabled && !hasTimedLyrics && hasFullLyrics && !bgm.paused;

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
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  lastLyricsPanelY = null;
  lastLyricsFullTop = null;
  updateLyricsLayout();
  if (bookUiState.open && bookUiState.currentView === 'read') {
    renderBookReadPage(bookUiState.lastMessages);
  }
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
applyWorldInversion();

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const previousPos = state.pos.clone();
  updateColorCycle();
  updateThemeSystem(dt);
  const gameplayPaused = bookUiState.open || blackBoxUiState.open;
  if (!gameplayPaused) {
    updatePlayer(dt);
    checkThemeTriggerCollision(previousPos, state.pos);
    updateBlackBox(dt);
    updateClouds(dt);
    updateCamera(dt);
  } else {
    blackBoxLandmark.updateMatrixWorld(true);
  }
  updateInvertedSkyWash();
  updateThemeFlash(dt);
  updateThemeDuck(dt);
  updateTrackVisualizer();
  updateLyricsLayout();
  updateLyricsUi();
  renderer.render(scene, camera);

  const info = document.getElementById('info');
  if (info) {
    const altitude = Math.max(0, getAltitude(state.pos));
    info.textContent = `speed ${state.currentSpeed.toFixed(1)}  alt ${altitude.toFixed(1)}`;
  }

  requestAnimationFrame(tick);
}

tick();
