# ASS MAGIC Realism Study 01

This directory is an isolated WebGL experiment. It is not imported by the
production site and does not modify the existing game.

## URLs

- Current-like comparison: `?mode=current&quality=standard`
- Realism / low: `?mode=realism&quality=low`
- Realism / standard: `?mode=realism&quality=standard`
- Realism / high: `?mode=realism&quality=high`
- Flight test: `?mode=realism&quality=high&view=flight`

Serve the repository over HTTP because browser ES modules do not reliably load
from a `file://` URL.

```sh
python3 -m http.server 8765
```

Then open:

`http://127.0.0.1:8765/experiments/realism/?mode=realism&quality=standard`

The observation camera remains available with `view=orbit`. In `view=flight`,
the camera moves forward automatically. Drag or swipe to steer, use the arrow
keys as an alternative, and change speed with the mouse wheel or `W` / `S`.
Releasing vertical input gradually restores level flight and the reference
altitude above the procedural terrain.

## Isolation and rollback

- Production files are not referenced except for the existing read-only
  `three.module.js` runtime.
- Delete this directory or discard the `codex/realism-prototype` branch to remove
  the experiment.
- Restore point: tag `public-before-realism-a5e86d3` at commit `a5e86d3`.

## Scope

The scene compares a small curved terrain patch, sky/haze, unified sunlight,
contact shadow, and a giant book. PBR textures are generated at startup and do
not add binary assets to production. The HUD reports browser-side FPS trends,
frame times, draw calls, triangles, pixel ratio, startup time, and renderer
resource counts.
