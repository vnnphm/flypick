# FlyPick

You pick two restaurants you’d eat at. Firecrawl reads their menus, a designed encoder turns
menu features into visual input for the full fruit-fly connectome (MaleCNS v1.0, 166,700 neurons,
running in a Web Worker), and the brain’s measured steering neurons turn a fly walking at constant
speed. The first restaurant zone it stays in for one simulated second wins; 30 simulated seconds
without that is “no choice.” TypeScript + Vite + plain Three.js.

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

Then, once per clone, download the connectome (58 MB, pinned and sha256-checked, gitignored):

```sh
npm run fetch:connectome      # or: docker compose run --rm web npm run fetch:connectome
```

Live menus need a Firecrawl key in `.env` (copy `.env.example`): `FIRECRAWL_API_KEY=...`. It is read
only by the server side of Vite and never reaches client code. Without it the live page shows a
Firecrawl error and makes no choice.

## Commands

```sh
npm run dev        # Development server
npm run typecheck  # Strict TypeScript checks
npm test           # Focused controller-boundary tests, using Node's built-in runner
npm run build      # Typecheck and production build into dist/
npm run preview    # Serve an existing build locally on port 4173

npm run fetch:connectome  # Download the pinned full-connectome files into public/connectome/
npm run capture           # Firecrawl both menus and save them as the cached captures
npm run check             # Causal and decision checks (real connectome; ~15 s)
npm run probe             # Left/right/neutral steering probes -> src/data/fixtures/probes/
npm run arena             # Restaurant-free arena statistics (equal targets, many seeds)
npm run record            # Record a genuine run with the saved menus for replay
```

To verify in Docker, run `docker compose run --rm web npm run build` and
`docker compose run --rm web npm test`. No separate linter is installed.
Three.js currently produces Vite's advisory warning for a bundle larger than 500 kB.

## Folders

- `src/scene/`: Read-only state rendering, original fly geometry, and decorative courtyard.
- `src/brain/`: The connectome runtime (from fly.ai), model loading, and the brain adapter/decoder.
- `src/data/`: Restaurant allowlist, Firecrawl schema/validation, menu encoder, fixtures.
- `src/simulation/`: Config, geometry, engine, decision rule, run logs/replay, worker, controller.
- `src/ui/`: Cards, controls, status displays, styles, and manual visual preview fixtures.
- `src/contracts.ts`: Shared restaurant, motor-output, simulation state, and controller types.
- `src/main.ts`: Entry point; picks the controller from the URL (see below).
- `server/`: Firecrawl + run-log endpoints (a Vite plugin, so `npm run dev` serves them), model
  download, and the probe/arena/check/record tools.

## Modes

| URL | Brain | Menus |
|---|---|---|
| `/` | live full connectome | read live with Firecrawl |
| `/?menus=cached` | live full connectome | the saved Firecrawl captures, labeled with their date |
| `/?mode=replay` | recorded motor output of a genuine live run | the menus saved in that run |
| `/?mode=mock` | **synthetic steering, not a brain** (UI work) | saved captures if any |
| `/?mode=preview` | none; authored visual fixtures | example names |

Nothing falls back silently: if Firecrawl or the model fails, the page shows an error and no choice.

## How the fly picks (brain, menus, simulation)

Each 20 ms tick, one neural step, in `src/simulation/engine.ts`:

1. **Menu → salience** (`src/data/encoder.ts`). A visible keyword list scores three playful cues,
   sweet / fruit / fermented, as the share of up to 20 menu items that mention them. Fixed weights
   (0.4 / 0.35 / 0.25) give `salience = 0.6 + 0.4 × cues`, the same formula for both restaurants.
   Price, name and id are never used. It is a designed mapping, not a taste or quality judgement.
2. **Geometry → sensory input** (`src/simulation/geometry.ts`). Each restaurant is a visual target.
   Its drive is fly.ai’s LC10a “chase” formula (`0.08 + 0.6 × angular size`, capped at 0.6) times its
   salience, injected into the LC10a neurons on the side of the fly it is on (the stronger target
   per side). Nothing is injected into descending or motor neurons.
3. **Brain** (`src/brain/`). The full connectome steps once: leaky integrate-and-fire,
   166,700 neurons, 25.1 M synapses, ~6 ms per step in Chrome and Node on the dev machine.
4. **Decoder**. Spike rates of the DNa02 steering neurons (filtered, τ 0.18 s) give
   `turn = −(L/1.135 − R/0.865) / 4 Hz`, clamped to ±1. Per-side scales come from the saved probes.
   DNg100/MDN (walking) and DNp01 (escape) are recorded but unused.
5. **Body**. Constant speed, 1 unit/s, independent of the restaurants (**simplified locomotion**:
   no tested stimulus drives the walking neurons in this model). Heading changes at
   1.2 rad/s × turn. At the arena wall the outward step is blocked; heading is never corrected.
6. **Decision** (`src/simulation/decision.ts`). First zone occupied continuously for 1 simulated
   second wins; leaving resets that zone’s dwell; 30 simulated seconds is no choice; live runs that
   take over 60 wall seconds are aborted as no choice. Invalid brain output is an error.

The fly starts at (0, −4) facing +Z. The two equal zones (radius 1.6) sit mirrored at (±3.2, 4), and a
zero-steering fly walks straight between them. Which restaurant gets which side is an independent
coin flip per run, recorded with the brain seed. The rendering reads snapshots; it never steers,
measures dwell or picks.

**Calibration and measured behavior** (all restaurant-free, `npm run probe` / `npm run arena`):

- Probes (6 seeds, `src/data/fixtures/probes/steering.json`): 0.6 V on left LC10a raises DNa02 L by
  3.58 Hz; on the right it raises DNa02 R by 2.73 Hz; equal input on both sides balances
  (+0.03 Hz at 0.6 V, but +0.75 Hz at 0.8 V, hence the 0.6 cap). The walking neurons stay at rest.
- Equal-salience arena, 32 seeds: every run commits (mean ~9 s); the fly reaches the zone on its
  own left 19/32 times. A **side bias remains**. Raw Hz without the per-side scales gave 27/32.
- Salience 1.0 vs 0.6, 32 seeds (16 per side): the higher-salience target won 32/32.
  0.72 vs 0.66: 18/14, so small menu differences are mostly swamped by neural noise and the side
  bias.

**Run logs.** Every run records config, model revision, seed, side draw, menus, per-tick input,
motor output and pose. Live browser runs are saved to `runs/` (gitignored) by the dev server;
`npm run record` saves a Node run to `src/data/fixtures/runs/`, which `?mode=replay` plays back
through the same engine (checked to reproduce poses and decision exactly).

**UI data beyond the contract.** `createSimulationController` also offers
`subscribeDetails(listener)` with `SimulationDetails` (`src/contracts.ts`): dwell per restaurant,
simulated time, trail, menus with source URLs, fetch time and cached/live flag, runtime identity,
decoded turn, rates, and the run log.

## Review the visual preview

Open `/?mode=preview`.

Confirm “I’d eat at either,” then click “Ask the Fly.” Only cosmetic wings animate.
Open **Visual preview controls** below the page to supply a sample pose or inspect
loading, either selection, no-choice, and error screens. These buttons supply authored
fixtures; they do not run a simulation or determine a real winner. Reset returns to
ready with a new run ID and clears the trail. Both restaurant names are fictional
examples. No live feed ever falls back to these fixtures automatically.

## Controller contract (as integrated)

`src/main.ts` passes `createSimulationController` (from `src/simulation/controller.ts`) to
`mountFlyPick(root, controller)`.

- `subscribe` immediately supplies current state and returns an unsubscribe function.
- `start` runs only from ready; `reset` cancels the run and publishes a new run ID.
- Position uses X/Z world coordinates. Heading is radians: zero faces +Z, positive turns toward +X.
- Destination coordinates and radii come from state. The scene doesn't calculate movement,
  collision, dwell, timeout, or winners. Only `selected` with a matching restaurant ID highlights a result.
- Wings and slight body bobbing are cosmetic; reduced-motion preference disables them.
  Camera framing stays fixed during each run. Trail samples come only from received positions.
- Live, mock, and replay states receive distinct labels. Supply readable preparation/error
  messages through `message`; replay must use genuine recorded data from the simulation owner.
- Menu URLs, dwell progress and runtime details come from `subscribeDetails` (see above).

`src/scene/courtyard.ts` owns the decorative environment. It can later become a larger
fly.ai-inspired landscape without changing the UI/controller contract. Buildings and
plants have no collision meaning. A larger navigable world would also need the simulation
owner to define its actual boundaries and obstacles; decorative scenery alone cannot do that.

Visual guidance: [fly.ai's world renderer](https://github.com/alextitonis/fly.ai/blob/main/world/src/scene.ts)
informed the simple fly silhouette and lighting approach. All scene geometry here is
original; no upstream code, models, textures, or assets are copied.

## Verification and remaining work

The Docker production build and strict typecheck pass. Two Node tests cover preview
reset/unsubscribe behavior, snapshot isolation, and the absence of an automatic winner.
Chrome visual review covered desktop and narrow layouts, approval/start, sample poses,
selection, no-choice, loading, error, and reset. Exact 1280×720 / 1440×900 presets,
performance measurements, and a live neural run remain unverified. Reduced motion is
implemented through CSS and `prefers-reduced-motion`; it has not been visually exercised.
The browser review uses authored preview states, not evidence of working brain integration.

Brain/data side (`npm run check`, 14 checks, all passing): zero steering walks the neutral line,
misses both zones and times out at 30 s; zero motor output stops a neural-locomotion fly; zones are
equal, mirrored and off the neutral line; dwell resets on exit and wins at exactly 1 s; invalid
brain output is an error with no winner; stale worker replies are dropped; empty menus are errors;
the encoder ignores names and prices; on the real connectome, left/right probes give opposite
turns for three seeds, renaming restaurants changes nothing, a run reaches a decision, and replaying
its JSON log reproduces every pose and the result exactly. In Chrome (dev server, this machine) the
worker loads the cached model in under 1 s, steps in ~6 ms and runs at 1.0× real time; a mock run
completed start → selection in the UI.

**Not yet verified:** a real Firecrawl extraction. From this machine Firecrawl refuses keyless
requests, so there are no saved menu captures and no recorded replay yet. With a key:
`npm run capture`, then `npm run record`, then try `/` and `/?menus=cached`. The two allowlisted pages
(`src/data/restaurants.ts`) were picked because they load; swap in your own shortlist there.

## Feature branches

From your team's agreed base branch with a clean working tree:

```sh
git switch -c feature/short-description
```

Make your changes, run `npm run build`, then commit them on that branch and open
a pull request using your team's normal workflow.
