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

`planet-full.html` keeps the production planet radius (`340`) and uses the
production sphere density (`IcosahedronGeometry` detail `4`) for current-like,
low, and standard modes. High mode deliberately raises the planet to detail `5`.
It distributes the realism layer around the complete sphere rather than only
around the camera. The global rock and crack meshes remain single
`InstancedMesh` draws, which intentionally makes every instance part of one
conservative full-planet render batch.

The current desktop-browser measurements at DPR `1.0` are:

| Mode | Rocks | Cracks | Triangles | Draw calls |
| --- | ---: | ---: | ---: | ---: |
| Current-like | 210 | 0 | 9,996 | 6 |
| Low | 600 | 360 | 25,476 | 8 |
| Standard | 1,200 | 800 | 49,396 | 8 |
| High | 2,200 | 1,400 | 89,712 | 8 |

All four modes held the display's 75 FPS cap in this environment. A `390 x 844`
viewport check also held 75 FPS, but it still used the desktop GPU and therefore
is not an iPhone performance measurement. The scene measures the whole-planet
terrain, atmosphere, clouds, dust, rocks, and cracks. It does not include every
production landmark, event, audio path, collision check, or UI update, so it
must not be read as a complete production-site benchmark.
