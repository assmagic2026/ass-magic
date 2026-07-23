# Cesium Man Type C reference preview: attribution and implementation plan

This direct-only, `noindex` preview reproduces the historical Type C body-proportion
view using the existing `assets/models/cesium-man.glb` asset. The GLB is not
rewritten; the Type C adjustment changes torso vertex positions only in memory.

## Required attribution for this preview

> Player model: “Cesium Man”, donated by Cesium for glTF testing. Source:
> KhronosGroup/glTF-Sample-Models. Licensed under CC BY 4.0. Modified by ASS
> MAGIC (runtime body-proportion deformation). No endorsement by Cesium implied.

- Model source: https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/CesiumMan
- License: https://creativecommons.org/licenses/by/4.0/
- The source README identifies Cesium as donor, licenses the model under CC BY
  4.0, and asks users to follow Cesium trademark terms.
- CC BY 4.0 allows commercial sharing and adaptation, but requires appropriate
  credit, a license link, and an indication of modifications.

The preview repeats this notice in its visible information panel and links to
both the source and license. It does not imply Cesium endorsement.

## If Type C is adopted into the official game

1. Keep the exact notice above in an always-available `CREDITS / ASSET LICENSES`
   panel opened from the existing menu.
2. Add the same notice to a public, linked credits/licenses page and preserve it
   in `assets/models/ATTRIBUTION.md`.
3. Do not use a Cesium logo or state/imply Cesium endorsement unless separately
   authorized. The Cesium ion logo rules do not apply solely because of this
   standalone CC BY sample asset; no Cesium ion service or data output is used.
4. If the GLB, texture, animation, or presentation changes further, update the
   modification sentence so it accurately describes the change.
