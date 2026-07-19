# ASS MAGIC Realism Study 01

This directory is an isolated WebGL experiment. It is not imported by the
production site and does not modify the existing game.

## URLs

- Current-like comparison: `?mode=current&quality=standard`
- Realism / low: `?mode=realism&quality=low`
- Realism / standard: `?mode=realism&quality=standard`
- Realism / high: `?mode=realism&quality=high`
- Flight test: `?mode=realism&quality=high&view=flight`
- Whole planet / orbit: `planet-full.html?mode=realism&quality=high&view=orbit`
- Whole planet / flight: `planet-full.html?mode=realism&quality=high&view=flight`

Serve the repository over HTTP because browser ES modules do not reliably load
from a `file://` URL.

```sh
python3 -m http.server 8765
```

Then open:

`http://127.0.0.1:8765/experiments/realism/?mode=realism&quality=standard`

The observation camera remains available with `view=orbit`. The `view=flight`
controls mirror the production experience: use the fixed lower-right stick,
`WASD`, or the arrow keys to steer; hold the background or `Space` to accelerate;
and use the speed slider to select cruise speed. Arrow-key horizontal input uses
the same half-strength multiplier as production. Releasing vertical input
gradually restores level flight near the reference altitude above the terrain.
Ground repulsion, banking, body pitch, speed response, and chase-camera
constants match production. Realism mode adds broad continents, rugged ground,
mountain clusters, a rimmed crater, a long valley, and terrain depressions that
fill to a shared water level. The player follows the same visible terrain and
skims the water surface rather than passing through it.

## Isolation and rollback

- Production files are not referenced except for the existing read-only
  `three.module.js` runtime.
- Delete this directory or discard the `codex/realism-prototype` branch to remove
  the experiment.
- Restore point: tag `public-before-realism-a5e86d3` at commit `a5e86d3`.

## Scope

The scene compares a small curved terrain patch, sky/haze, unified sunlight,
contact shadow, and a giant book. Realism mode also adds terrain-aligned rocks,
cracks, and sparse ground dust. Rocks and cracks each use one `InstancedMesh`,
while all dust uses one `Points` draw, so the surface layer adds at most three
draw calls. Quality presets cap rock/crack/dust counts at `16/10/20` (low),
`30/16/36` (standard), and `48/24/60` (high). PBR textures are generated at
startup and do not add binary assets to production. The HUD reports browser-side
FPS trends, frame times, draw calls, triangles, pixel ratio, startup time, and
renderer resource counts.

## Whole-planet load study

`planet-full.html` keeps the production planet radius (`340`). Current-like mode
retains `IcosahedronGeometry` detail `4`; realism mode uses a smooth-shaded
`SphereGeometry` at `128 x 64` (low), `192 x 96` (standard), or `256 x 128`
(high). The macro surface combines the production terrain function with three
relief bands, then adds authored landmarks: a three-peak mountain cluster up to
roughly 58 metres, a deep crater with a raised rim, a long narrow valley with
eroded shoulders, and a broad basin. A transparent physical water sphere fills
every connected depression below 9 metres under the reference radius and uses
one CPU-generated animated normal map. Terrain color combines dry soil, damp
ground, exposed rock, and highland bands.

Rocks, pebbles, and cracks are distributed around the complete sphere with
clustered rather than even placement. Each layer stays in a single
`InstancedMesh` draw. Flight view continuously blends day, directional twilight,
and night sky/fog from the player's position. Orbit view omits the ground sky and
uses only the thin atmospheric rim, avoiding an unnecessary sky dome and its
clipping artifact. Realism mode deliberately omits the old point-sprite cloud
layer because it looked synthetic.

The whole-planet flight scene now includes a production-scale human player and
seven landmark types at production-derived directions: giant record player,
giant book, black sphere, white sphere, floating compass, sanctuary, and moving
black box. The default `start=dusk` route follows the terminator instead of
crossing immediately into day, so twilight remains visible while flying. Other
visual checkpoints can be opened with `start=recordPlayer`, `start=book`,
`start=day`, `start=night`, or `start=sanctuary`. Terrain checkpoints use
`start=mountain`, `start=crater`, `start=water`, and `start=valley`; each begins
far enough away to read the full landform. Use `start=sunset` to stand on the
terminator and face the physically computed sun direction directly.

High-quality flight mode replaces the procedural human with Khronos's
`CesiumMan.glb` sample (about 479 KB), and replaces the giant
book with a textured GLB derived from GGBotNet's 1825 real-Bible model (about
2.0 MB, 60 triangles). The book source is CC-BY 4.0 and is available at
`https://opengameart.org/content/old-bible-3d`; credit: GGBotNet. The local
Three.js r163 `GLTFLoader` is vendored with the experiment, so neither model
requires a runtime CDN request. Low and standard modes keep the procedural
models, and high mode automatically falls back to them if a GLB cannot be
decoded. `CesiumMan` is CC-BY 4.0, donated by Cesium to the Khronos glTF sample
repository. The twilight sky is camera-centred so the sun direction remains
geometrically correct at every point on the planet, and dusk uses separate
horizon, middle, and zenith bands.

High quality uses the 1K diffuse, OpenGL normal, and roughness maps from Poly
Haven's `Rocks Ground 04` material (`https://polyhaven.com/a/rocks_ground_04`).
The source is CC0 and the three local JPEGs
add about 2.1 MB. Low and standard quality keep the generated maps so the mobile
comparison does not inherit the extra transfer or texture memory cost. The maps
remain uncompressed RGBA on the GPU, so mipmapped texture memory is estimated at
about 16 MB. The 2048 shadow map adds further GPU memory in high quality. The
loading cover now stays visible until all three files have loaded or failed.

The current desktop-browser measurements at DPR `1.0` are:

| Mode | Planet mesh | Rocks | Landmarks | Triangles | Draw calls | Startup |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| High flight | 256 x 128 | 2,200 | 7 types | 889,900-890,100 | 11-27 | 102-113 ms* |

The high-quality flight view held the display's 75 FPS cap in this desktop
environment after enabling the local shadow pass and photographic PBR maps, with
a measured 1% low of about `65 FPS` and a maximum frame time of about `15.6 ms`.
The `START` value marked with `*` measures synchronous scene construction; it does
not include asynchronous JPEG transfer and decode. No mobile viewport result is
claimed here. A real iPhone GPU,
thermal, and battery test is still required.

This scene measures the whole-planet terrain, atmosphere or sky, dust, rocks,
pebbles, cracks, player, and major landmark visuals. Landmark contact events,
theme switching, return-route progression, audio paths, and production UI are
not included, so it is still not a complete production-site benchmark.
