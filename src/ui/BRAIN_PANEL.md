# Fly Brain panel

Frontend-only, read-only telemetry. `mountBrainPanel` uses the existing controller's
optional `subscribeDetails` method and returned unsubscribe function. The app forwards
its existing state subscription; no second state subscription, polling service, or
simulation loop is added. Disposing the app disposes the panel before controller teardown.
The authored visual preview has no details API and explicitly shows telemetry unavailable.

## Reading rules

- Negative decoded turn is left, positive is right (`src/brain/adapter.ts`). The meter
  preserves the decoded number. Only the descriptive word uses a ±0.05 neutral band.
- Both DNa02 bars use a fixed 0–5 Hz scale. The existing calibration uses a 4 Hz
  normalized difference for full turn and reports a ~3.58 Hz left probe response;
  5 Hz is a rounded display ceiling with headroom, not a biological maximum or a
  decoder setting. Overflow clips the bar only; numeric Hz remains visible. Rates
  are shown to one decimal, turn to two. No independent normalization is used.
- Dwell and simulation time come directly from matching-run details. The panel does
  not accumulate time, detect zones, assign confidence, or determine a result.
- New-run details may arrive before state. The observer holds that snapshot until
  the matching state arrives, clears old readings on a new run, and rejects retired
  runs. Ready mode hides rates/performance even if a controller retains old metadata.
- A single cancellable timeout marks an active run stale after 2 seconds without a
  matching details update (20 expected updates). State/pose updates do not refresh it.
  Stale bars/readings become unavailable; the next details update restores them.
  Completed selected/no-choice states cancel the timeout and label retained data
  “Final reading.” Error states keep the supplied error and suppress activity bars.
- The scene reports only changes to its actual ambient presentation flag from its
  existing render loop. Ambient readings are suppressed, including reduced-motion,
  pending-action, and failed-action behavior already owned by the idle controller.
  No panel input changes the scene or controller.
- Mock/sample and replay readings are labeled. Additional neuron rates are measurements,
  not claims about walking speed or escape behavior. Model metadata is shown only when
  supplied. Missing numbers are dashes, not zero. Menu data and run logs are not rendered.

## Layout

At 1200 px and wider, the panel occupies a 280 px column beside the world. At smaller
widths it sits below the world; at 700 px and below it starts collapsed. Neural details
always start collapsed. Expanded desktop details scroll inside the panel rather than
creating an empty area under the world. The scene's existing ResizeObserver updates
the canvas and camera framing. Reduced motion disables bar transitions.

## Verification

`npm test` includes focused mapping, reset ordering, stale/recovery, presentation and
subscription-cleanup tests. The existing preview and ambient checks remain applicable.
There is no separate lint script. Use Docker as described in the root AGENTS.md.

For isolated browser QA, open `/tests/brain-panel.html?ambient=1` in the dev server.
Its prominent development-fixture banner applies to all readings and outcomes, including
the replay-label test. Buttons publish single authored snapshots; after 2 seconds a
running sample goes stale intentionally. Remount reports active subscription counts.
This harness is not imported by the production entry point.

Live verification used the real connectome with local saved Firecrawl menus at
`/?menus=cached`: rates/turn, dwell, simulation time, final reading, reset, and Reset
view were exercised. Browser QA also covered fixture left/neutral/right, 7 Hz overflow
(100% left versus 40% right at 2 Hz), loading, ambient, missing, stale, error, no-choice,
replay labels, and repeated remounts (one state and one details listener). Desktop and
390 px layouts were inspected; mobile canvas measured 352 px with no horizontal overflow.

Restaurant search is integrated on `feature/search-brain-integration`. The picker sits
above the shared world/panel wrapper; both stay hidden until two restaurant menus are
ready. Search owns restaurant selection and the controller continues to own decisions.
The panel uses the same real telemetry API without changes to backend behavior.

Integration verification: real city/restaurant search and Firecrawl loaded Zuni Café
(19 items) and Souvla (15 items). The live connectome selected Zuni Café at 9.2 simulated
seconds; the panel retained the final reading. Reset cleared rates/time/dwell and restored
the picker; changing a place hid both world and panel. Desktop and 390 px mobile layouts,
mobile expansion, canvas resize, and Reset view were checked in Chrome. Build/typecheck,
11 frontend tests, 4 ambient tests, and all 16 controller checks passed. The existing
large-bundle advisory remains; no separate lint script exists.
