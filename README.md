# FlyPick

A TypeScript + Vite + plain Three.js visual frontend: a miniature restaurant
garden habitat, animated fly, destination markers, trail, restaurant cards, and run controls.
The current entry point is an explicitly labeled **visual preview** with example
restaurants. No brain runtime, Firecrawl integration, or automatic decision is connected.

## Setup

Clone this repository and enter its directory. With Docker and Docker Compose installed:

```sh
docker compose up --build
```

Open http://localhost:5173. Source edits reload automatically. Stop with Ctrl+C,
then `docker compose down`. If dependencies change, run
`docker compose run --rm web npm ci` before restarting.

Alternatively, with Node.js 24 and npm already installed:

```sh
npm ci
npm run dev
```

No environment variables are required. `.env.example` is a placeholder for future
configuration; keep secrets out of client code and version control.

## Commands

```sh
npm run dev        # Development server
npm run typecheck  # Strict TypeScript checks
npm test           # Focused controller-boundary tests, using Node's built-in runner
npm run build      # Typecheck and production build into dist/
npm run preview    # Serve an existing build locally on port 4173
```

To verify in Docker, run `docker compose run --rm web npm run build` and
`docker compose run --rm web npm test`. No separate linter is installed.
Three.js currently produces Vite's advisory warning for a bundle larger than 500 kB.

## Folders

- `src/scene/`: Read-only state rendering, fly geometry, and decorative habitat.
- `src/brain/`: Reserved for future brain code; currently empty.
- `src/data/`: Reserved for future restaurant data code; currently empty.
- `src/ui/`: Cards, controls, status displays, styles, and manual visual preview fixtures.
- `src/contracts.ts`: Shared restaurant, motor-output, simulation state, and controller types.
- `src/main.ts`: Explicit preview entry point; controller integration happens here.
- `server/`: Reserved for future server code; no server runs yet.

## Review the visual preview

Confirm “I’d eat at either,” then click “Ask the Fly.” Open **Visual preview controls**
below the page and click **Play sample motion** to watch an eight-second scripted loop
with a movement trail. **Stop motion** stops it; Reset cancels it and clears the trail.
The loop never selects a restaurant and is not neural movement or a genuine recorded run.
The same controls let you supply a single sample pose or inspect
loading, either selection, no-choice, and error screens. These buttons supply authored
fixtures; they do not run a neural simulation or determine a real winner. Reset returns to
ready with a new run ID and clears the trail. Both restaurant names are fictional
examples. No live feed ever falls back to these fixtures automatically.

## Connect the simulation

Call `mountFlyPick(root, controller)` from `src/ui/app.ts` with your implementation
of the agreed `SimulationController`. Replace the preview creation and preview-control
mounting in `src/main.ts`; retain disposal on hot reload. No UI API change is needed.

- `subscribe` immediately supplies current state and returns an unsubscribe function.
- `start` runs only from ready; `reset` cancels the run and publishes a new run ID.
- Position uses X/Z world coordinates. Heading is radians: zero faces +Z, positive turns toward +X.
- Destination coordinates and radii come from state. The scene doesn't calculate movement,
  collision, dwell, timeout, or winners. Only `selected` with a matching restaurant ID highlights a result.
- Wings and slight body bobbing are cosmetic; reduced-motion preference disables them.
  The small fly has a locator ring for readability. Drag to orbit, scroll/pinch to zoom,
  and use Reset view to frame both restaurants. Camera controls are bounded and local
  to the scene. Trail samples come only from received positions.
- Live, mock, and replay states receive distinct labels. Supply readable preparation/error
  messages through `message`; replay must use genuine recorded data from the simulation owner.
- The current contract has no menu URLs or dwell progress. Those UI elements await agreed
  fields from the simulation/data owner; the frontend does not invent them.

`src/scene/courtyard.ts` owns the miniature fly.ai-inspired habitat: continuous ground,
irregular fruit patches, plants, grasses, rocks, and the existing two storefronts.
All terrain and props are decorative; destination pads still use supplied coordinates/radii.
It can later become a larger landscape without changing the UI/controller contract.
Buildings and plants have no collision meaning. A larger navigable world would also need the simulation
owner to define its actual boundaries and obstacles; decorative scenery alone cannot do that.

Fly geometry, camera patterns, and prop builders adapt MIT-licensed code from
[fly.ai's world renderer](https://github.com/alextitonis/fly.ai/blob/40fbeca60e5c16742f20b4c2c067de915b388e66/world/src/scene.ts).
See [visual handoff](src/scene/VISUALS.md) and [attribution and license](src/scene/fly-ai-NOTICE.md).

Optional frontend-only idle preview: open `http://localhost:5173/?ambient=1`.
While mock state is ready, the fly roams beside two fruit props and briefly lands/nods.
Start stops this synchronously; the normal URL, live/replay modes, and reduced-motion
preference keep it disabled. It supplies no sensory inputs or decisions. See
[`src/scene/IDLE.md`](src/scene/IDLE.md) for its action hooks and focused checks.

## Verification and remaining work

The Docker production build and strict typecheck pass. Four Node tests cover preview
reset/unsubscribe behavior, snapshot isolation, scripted playback completion, cancellation,
and the absence of an automatic winner. Four additional ambient-isolation tests run with
`docker compose run --rm web node --test src/scene/idle.test.mjs`.
Chrome visual review covered desktop and narrow layouts, approval/start, sample poses,
selection, no-choice, loading, error, and reset. Exact 1280×720 / 1440×900 presets,
performance measurements, and a live neural run remain unverified. Reduced motion is
implemented through CSS and `prefers-reduced-motion`; it has not been visually exercised.
The browser review uses authored preview states, not evidence of working brain integration.

## Feature branches

From your team's agreed base branch with a clean working tree:

```sh
git switch -c feature/short-description
```

Make your changes, run `npm run build`, then commit them on that branch and open
a pull request using your team's normal workflow.
