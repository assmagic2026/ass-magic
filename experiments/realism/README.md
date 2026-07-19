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
- Water-spray checkpoint: `planet-full.html?mode=realism&quality=high&view=flight&start=water&spray=1`
- Cave approach: `planet-full.html?mode=realism&quality=high&view=flight&start=cave`
- Cloud passage: `planet-full.html?mode=realism&quality=high&view=flight&start=cloud`
- Night lights: `planet-full.html?mode=realism&quality=high&view=flight&start=lights`

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
`SphereGeometry` at `192 x 96` (low), `256 x 128` (standard), or `512 x 256`
(high). The macro surface combines the production terrain function with three
relief bands, then adds authored landmarks: a three-peak mountain cluster up to
roughly 58 metres, a deep crater with a raised rim, a long narrow valley with
eroded shoulders, and a broad basin. A transparent physical water sphere fills
every connected depression below 9 metres under the reference radius and uses
one CPU-generated animated normal map plus a tiny sky-reflection cube map.
Terrain color combines dry soil, damp ground, exposed rock, and highland bands.

The authored terrain is supplemented with 30 broad hills and 16 smooth rimmed
craters, giving the complete sphere varied relief rather than a mostly flat
shell. Rocks, pebbles, line-art cracks, and the experimental floating relics
are omitted from realism mode. Three sparse point layers instead place 18
static cloud banks at different altitudes. The visible banks use one 512-pixel
CC0 alpha texture and three draw calls. When the player enters a cloud volume,
the nearby sprite fades before it reaches the camera and the whole scene blends
into local mist; after leaving the volume the original sky and fog return.
Flight view continuously blends day,
directional twilight, and night sky/fog from the player's position. Orbit view
omits the ground sky and uses only the thin atmospheric rim, avoiding an
unnecessary sky dome and its clipping artifact. Cloud positions never follow or
rotate with the player.

The whole-planet flight scene now includes a production-scale human player in a
horizontal flight pose with both arms spread fully sideways and the waist,
knees, feet, and paired legs held straight. It also includes seven landmark
types at production-derived directions: giant record player, giant book, black
sphere, white sphere, floating compass, sanctuary, and moving black box. The
default `start=dusk` route follows the terminator instead of
crossing immediately into day, so twilight remains visible while flying. Other
visual checkpoints can be opened with `start=recordPlayer`, `start=book`,
`start=day`, `start=night`, or `start=sanctuary`. Terrain checkpoints use
`start=mountain`, `start=crater`, `start=water`, `start=valley`, and `start=cave`;
each begins
far enough away to read the full landform. Use `start=sunset` to stand on the
terminator and face the physically computed sun direction directly.

The brighter night hemisphere uses cool moonlight and adds 12 irregular light
fixtures across the ground and lower air. Instanced dark housings and emissive
lenses use two draw calls. Six shadow-free `SpotLight` instances illuminate
nearby terrain and objects, but no hard translucent beam cone is drawn. Their
positions, altitudes, directions, colors, and pulse phases vary.
Flight starts and neutral input use
production's 10-metre altitude target; the former terrain-checkpoint altitude
overrides have been removed. Because this experiment's mountains and valleys
are much steeper than production terrain, neutral flight samples the surface
about one second ahead and gently follows its rise or fall. Manual vertical input always takes
priority over this terrain-follow correction. The altitude error itself is
returned slowly and symmetrically toward `ALT 10`, while the look-ahead term
only compensates for the much steeper experimental terrain.

The dusk blend now covers a wider band on both sides of the terminator. Its
orange sun key, hemisphere sky and ground colors, and ambient fill are updated
together, so terrain, the player, and lit landmarks share the sunset cast. High
quality terrain uses aligned diffuse and normal maps repeated `18 x 9`, while a
constant roughness of `1.0` prevents dark roughness-map regions from becoming
shiny patches. Broad vertex colors and two low-frequency UV warps soften the
regularity of the repeat without adding another material pass.

The fly-through cave is a 64-metre curved hollow mountain generated as one
continuous mesh. Its inner wall, outer rock surface, and both entrance sections
share vertices at their seams; the former pile of instanced entrance boulders
has been removed. The outer surface uses the same CC0 rock maps as the terrain,
while the rough inner wall stays darker. It follows the planet curvature and
keeps both openings clear for the production-style `ALT 10` flight path.

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

High quality uses the 1K diffuse and OpenGL normal maps from Poly
Haven's `Rocks Ground 04` material (`https://polyhaven.com/a/rocks_ground_04`).
The source is CC0. The cloud alpha texture is WickedInsignia's CC0
`FX_CloudAlpha07.png` from OpenGameArt. Low and standard quality keep the generated maps so the mobile
comparison does not inherit the extra transfer or texture memory cost. The maps
remain uncompressed RGBA on the GPU. The 2048 shadow map adds further GPU memory
in high quality. The loading cover now stays visible until both files have
loaded or failed.

Low flight over a real water depression activates a 600-particle additive spray
system. Emission depends on speed, height above the shared water surface, and
whether the terrain beneath the player is actually submerged. The particles
inherit part of the player's motion, fan sideways and upward, then fall and fade;
the system remains idle everywhere else. The `spray=1` checkpoint starts only
the experiment over the basin at `ALT 1.35` for quick visual testing.

The current desktop-browser measurements at DPR `1.0` are:

| Mode | Planet mesh | Clouds | Landmarks | Triangles | Draw calls | Startup |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| High flight | 512 x 256 | 18 | 8 types | 416,896-419,640 | 13-24 | 207-295 ms* |

The high-quality flight view held the display's 75 FPS cap in this desktop
environment after enabling the local shadow pass, PBR maps, cave, and six
shadow-free spotlights. The cave checkpoint measured a 1% low of `69.9 FPS`;
the cloud-passage checkpoint measured `70.4 FPS`. Maximum frame time was `14.3 ms`.
The `START` value marked with `*` measures synchronous scene construction; it does
not include asynchronous JPEG transfer and decode. No mobile viewport result is
claimed here. A real iPhone GPU,
thermal, and battery test is still required.

This scene measures the whole-planet terrain, atmosphere or sky, clouds, water
spray, player, and major landmark visuals. The old circular fake
player shadow is no longer attached to the scene; high flight mode uses only the
real directional-light shadow. Landmark contact events,
theme switching, return-route progression, audio paths, and production UI are
not included, so it is still not a complete production-site benchmark.
