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
retains `IcosahedronGeometry` detail `4`; realism mode uses a displaced,
smooth-shaded `SphereGeometry` at `128 x 64` (low), `192 x 96` (standard), or
`256 x 128` (high). The CPU-generated albedo, bump, and roughness maps avoid
shipping new binary production assets. Terrain color combines dry soil, damp
ground, exposed rock, and highland bands.

Rocks, pebbles, and cracks are distributed around the complete sphere with
clustered rather than even placement. Each layer stays in a single
`InstancedMesh` draw. Flight view uses a blue sky shader and light distance fog;
orbit view omits the ground sky and uses only the thin atmospheric rim, avoiding
an unnecessary sky dome and its clipping artifact. Realism mode deliberately
omits the old point-sprite cloud layer because it looked synthetic.

The current desktop-browser measurements at DPR `1.0` are:

| Mode | Planet mesh | Rocks | Pebbles | Cracks | Triangles | Draw calls | Startup |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current-like | Ico D4 | 210 | 0 | 0 | 9,276 | 5 | 14 ms |
| Low | 128 x 64 | 600 | 2,500 | 360 | 116,784 | 7 | 46 ms |
| Standard | 192 x 96 | 1,200 | 9,000 | 800 | 316,896 | 7 | 92 ms |
| High | 256 x 128 | 2,200 | 30,000 | 1,400 | 847,840 | 7 | 109 ms |

All four flight-view modes held the display's 75 FPS cap in this desktop
environment. High orbit measured `849,600` triangles and `7` draw calls at the
same cap. The browser viewport override remained at `1280 x 720`, so no mobile
viewport result is claimed here. A real iPhone GPU, thermal, and battery test is
still required.

This scene measures the whole-planet terrain, atmosphere or sky, dust, rocks,
pebbles, and cracks. It does not include every production landmark, event,
audio path, collision check, or UI update, so it must not be read as a complete
production-site benchmark.
