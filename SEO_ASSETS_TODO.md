# Social preview and icon assets

The site has no existing, approved ASS MAGIC logo/icon or dedicated landscape artwork that can safely be repurposed for social previews.

Before adding the corresponding metadata, provide these approved static assets:

- `assets/og-ass-planet.jpg` — 1200 × 630 px social preview image
- `assets/favicon-32.png` — 32 × 32 px favicon
- `assets/apple-touch-icon.png` — 180 × 180 px Apple Touch Icon

These files should remain independent from runtime game preloads. Once supplied, add their `<link>`/Open Graph references in `index.html` and `experiments/realism/planet-full.html`.
