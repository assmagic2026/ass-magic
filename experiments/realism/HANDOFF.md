# ASS MAGIC Realism Handoff

Updated: 2026-07-22 (phase audio + music compatibility pass)

## Scope and release model

- The current official game implementation lives in `experiments/realism/`.
- Work on game behavior only inside `experiments/realism/` unless the user explicitly expands scope.
- Do not change the legacy game or unrelated root assets as part of realism fixes.
- Preserve unrelated untracked files in the workspace.
- Public entry: `https://assmagic2026.github.io/ass-magic/`
- Direct public game: `https://assmagic2026.github.io/ass-magic/experiments/realism/planet-full.html?mode=realism&quality=high&view=flight`
- Local test URL: `http://127.0.0.1:8765/experiments/realism/planet-full.html?mode=realism&quality=high&view=flight`

## Current priority: phase transition and its sound

Files:

- `phase-audio-engine.js`: low-latency Web Audio playback and iOS activation.
- `environment-phasing.js`: collision prediction, phase state machine, visuals and exact cue trigger.
- `planet-full.js`: creates the phasing system; phase audio must not be added to `openingCriticalLoads`.
- `planet-full.html`: fixed fallback `<audio>` elements and cache versions.
- Sound asset: `assets/audio/kick-transition.mp3` (about 26 KB / 1.01 seconds).

Required behavior and invariants:

1. Collision phasing must never be permanently blocked by audio state.
2. Before the first user input, the first automatic phase may wait so iOS does not show a silent transition.
3. After input, audio gets at most 180 ms of bounded preparation time. When that deadline passes, physics and visuals proceed even if `AudioContext` is still `suspended` or `interrupted`.
4. The 26 KB phase MP3 is fetched and decoded during the opening curtain, before the first gesture, so the first gesture only authorises output. `decodedReady` must never be added to `openingCriticalLoads`.
5. WebKit activation is retried on `pointerdown`, `pointerup`, `touchstart`, `touchend`, `click`, and `keydown`. Do not deduplicate retries across different trusted events.
6. Each trusted retry starts a one-sample silent output graph and calls `resume()`. This handles Safari/WKWebView versions that reject the first down/start event but accept end/click.
7. After authorisation, a 128-frame looping zero buffer keeps the effects output graph alive beside the separate HTML music stream.
8. `unlockMusic()` invokes `audio.play()` first, then retries the phase engine in the same trusted event. Once music reports success, it calls `ensurePlayback()` again without rerouting or filtering the music.
9. Fetching/decoding the phase sound must never be awaited by the opening curtain.
10. If Web Audio is unavailable, the two fixed HTML audio elements are the same-moment fallback. Never replay a missed cue seconds later.
11. Dematerialize and rematerialize both use the attached punch sound at normal pitch. Do not alter BGM pitch or the music mix to emulate this effect.

## Root cause of the 2026-07-22 regression

PR #17 fixed a loader/audio race but introduced a hard gate in `predict()`:

- The gate required `phaseAudioEngine.isPlayable` before any phase could start.
- On iOS/WKWebView, `AudioContext.resume()` may leave the context `suspended` even after the first event.
- Because `isPlayable` never became true, the state stayed `normal`, `environmentPhaseStarts` stayed `0`, and the player could no longer dematerialize.
- A whole-operation `preparationPromise` also caused later `touchend`/`click` events to reuse the failed `pointerdown` attempt instead of retrying it.

The current fix removes the permanent audio gate, bounds the first-cue wait to 180 ms, and retries actual output activation on every trusted event.

## Root cause of the initially silent cues after PR #18

- PR #17 moved both realtime-context creation and MP3 decoding from page load to the first user gesture.
- PR #18 fixed the gameplay deadlock but retained that delayed decode.
- A collision shortly after the first control touch could pass the 180 ms gameplay deadline before mobile Safari had finished decoding.
- The fallback then used another HTML `<audio>` while the music element was already active. That route is less reliable for simultaneous mobile playback than a prepared Web Audio buffer.

The current implementation restores early decoding from the previously reliable version while keeping it completely outside the loader's awaited promises. The effects graph is kept alive, synchronised again immediately after music playback starts, and allowed a maximum 220 ms same-cue recovery when iOS temporarily marks it `interrupted`.

## Reproduction and diagnostics

Force an immediate mountain threat:

```text
http://127.0.0.1:8765/experiments/realism/planet-full.html?mode=realism&quality=high&view=flight&start=mountain&alt=0&openinghold=180&flightdebug=1
```

Useful DOM diagnostics:

- `<html data-phase-audio-context>`: `uninitialized`, `suspended`, `interrupted`, or `running`.
- `<html data-phase-audio-playable>`: decoded buffer plus running context.
- `<html data-phase-audio-gesture>`: last trusted event used for activation.
- `<html data-phase-audio-unlock-attempts>`, `data-phase-audio-prime`, and `data-phase-audio-keep-alive`.
- Canvas `data-phase-audio-music-sync` records whether the effects context joined the active music session.
- Canvas `data-environment-phase`, `data-environment-phase-starts`, `data-environment-phase-audio-gate`, and `data-environment-phase-sound`.

Expected results:

- Before input: engine `decoded`, context normally `suspended`, phase `normal`, starts `0`, gate `waiting-for-input`.
- If audio runs: gate `armed`; first cue uses `*-buffer`.
- If audio remains suspended: after the bounded grace, gate `degraded-no-block`, starts becomes `1`, phase proceeds through dematerialization and returns to `normal` with the player visible.

## Validation used for the current fix

```sh
/Users/assmagic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check experiments/realism/phase-audio-engine.js
/Users/assmagic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check experiments/realism/environment-phasing.js
/Users/assmagic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check experiments/realism/planet-full.js
git diff --check
```

Browser regression result with audio forcibly remaining `suspended`:

- Before input: `phase=normal`, `starts=0`, `gate=waiting-for-input`.
- After input: `phase=phasing`, `starts=1`, `gate=degraded-no-block`.
- Completion: `phase=normal`, player visible, body class no longer phasing.

Mock audio tests cover:

- Modern Promise-based `decodeAudioData`.
- Old WebKit callback-based `decodeAudioData`.
- Safari-like first `pointerdown` resume failure followed by successful `touchend`; the first phase cue starts exactly once.
- Music-session recovery: an `interrupted` effects context resumes beside active music and starts the requested cue once within the bounded timing window.

## Opening performance

- Phase audio is intentionally absent from `openingCriticalLoads`.
- Early `decodedReady` is also intentionally absent from `openingCriticalLoads`.
- The loader waits for the authored book, player model, and experience art, then a deliberate minimum hold and first shader compilation.
- Phase sound preload is small and must not be turned back into a critical promise.
- Use canvas `data-opening-critical-ready-ms` and `data-opening-total-ms` when investigating perceived loading time.

## Git history relevant to this area

- PR #14: startup/audio exactness and authored-book stabilization.
- PR #15: experimental BGM spatial/pitch treatment; rejected by the user.
- PR #16: exact revert of PR #15.
- PR #17: lazy phase audio context and loader decoupling; introduced the permanent phase gate described above.
- PR #18: removed the gameplay deadlock and added bounded audio gating, but retained first-gesture decoding.
- The next release must preserve loader decoupling, early decode, non-blocking phasing, and unchanged music pitch together.

## Final device check after publishing

Automated tests can prove state transitions and source starts, but cannot listen through a real iPhone speaker. On the public page, confirm once on iPhone Safari:

1. Move a control so the page receives a trusted touch sequence.
2. Fly toward terrain until dematerialization begins.
3. Confirm the first cue sounds at the disappearance transition, not later.
4. Confirm rematerialization sounds once and the player becomes visible again.
