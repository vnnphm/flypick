# Habitat visual revision

The visual scene uses a perspective camera and OrbitControls adapted from fly.ai's
pinned renderer. See `fly-ai-NOTICE.md` for revision, reused portions, and license.
Upstream attribution and the full MIT license accompany these files.

- Drag to orbit; scroll/pinch to zoom. Panning is disabled. Polar angle, azimuth,
  and camera distance are bounded. Reset view restores a view containing both restaurants.
- The fly uses upstream body/wing proportions at natural scale. A pale locator ring
  marks its displayed position. It receives the same authoritative pose as before.
- Ground extends beyond the initial view with no display-board edge. Its extent
  does not change simulation boundaries or grant any new movement capability.
- Restaurant zones retain their supplied coordinates and radii. HTML names project
  through the current camera; offscreen labels hide, and restaurant cards remain visible.
- Camera input is local only. It never calls the simulation or changes its state.
- The prior optional ambient preview remains isolated behind `?ambient=1` and mock mode.

First-pass screenshot was shown before adding new decorative scatter. The habitat
then gained irregular fruit clusters, broad-leaf plants, low grass and rocks using
adapted upstream prop builders. No mirrored perimeter planting is used. Props keep
clear of restaurant pads and storefronts; the rest of the field remains explorable
through orbit/zoom. Their distribution is deterministic visual data, not a backend seed.

Verified: production build/typecheck, four existing controller tests and four ambient
isolation tests. Browser screenshots captured the first undecorated pass and final
habitat; orbit, zoom, and Reset view were exercised. The Three.js bundle-size advisory
remains. Subsequent controller integration and live-run results are documented in
the root README; this visual revision itself did not validate the backend.
