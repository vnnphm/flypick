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
Firecrawl error if keyless access is rejected, and makes no choice. Provider access may vary.
After saving new captures, restart Vite before using `?menus=cached`: fixture changes are
intentionally excluded from hot reload so they do not interrupt active runs.

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

- `src/scene/`: Read-only state rendering, fly geometry, and decorative habitat.
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
| `/` | live full connectome | **search:** pick a city and two restaurants; each menu is found and read with Firecrawl |
| `/?menus=shortlist` | live full connectome | the fixed shortlist (`src/data/restaurants.ts`), read live with Firecrawl |
| `/?menus=cached` | live full connectome | the shortlist's saved Firecrawl captures, labeled with their date |
| `/?mode=replay` | recorded motor output of a genuine live run | the menus saved in that run |
| `/?mode=mock` | **synthetic steering, not a brain** (UI work) | saved captures if any |
| `/?mode=preview` | none; authored visual fixtures | example names |

Nothing falls back silently: if Firecrawl or the model fails, the page shows an error and no choice.

## Picking restaurants (search mode)

1. **City.** Type a city (Nominatim finds it; pick one if several match) or press *Use my location*
   (the browser asks; the server rounds the position to ~1 km, names the city, and keeps nothing).
2. **Two restaurants.** Each slot searches restaurants, cafés, bars and similar near that city as you
   type (Photon, OpenStreetMap data) and lists name + address. The same place can't fill both slots.
3. **Menu.** Picking a result sends only its OpenStreetMap id to the server (`POST /api/menus/read`),
   which looks the place up and chooses the page to read, in this order: the map's own menu link
   (`website:menu`); the best “menu” page on the restaurant's website (Firecrawl `/map`, ranked to prefer
   the main food menu over dessert/drinks/event menus and off-topic pages); the website itself; or, with
   no website, the best result of a Firecrawl web search (preferring the restaurant's own domain).
   At most two pages are extracted per place. The card shows **Reading menu…** then **Ready · N menu
   items** with a link to the page used, or why the menu couldn't be read plus *Choose another place*.
   No menu is ever invented. Successful reads are kept in `.cache/menus/` (gitignored) and reused for
   6 hours, labeled “saved”.
4. **Map and run.** The arena appears once both menus are read and the brain is loaded; the rest of the
   flow (approve, *Ask the Fly*, result, Reset) is unchanged. Change a place any time you're not mid-run.

The read-only **Fly Brain** panel appears with the map: beside it on wide screens and below it
on smaller screens (collapsed on mobile). It shows neural steering, measured firing rates,
continuous time in each zone, and simulation time. See [panel reading rules](src/ui/BRAIN_PANEL.md).

Code: `server/places.ts` (search), `server/menuFinder.ts` (menu discovery), `server/firecrawl.ts`,
`src/data/places.ts` (browser client), `src/ui/search.ts` (panel), `controller.choosePlace(slot, place)`
and `SimulationDetails.slots` (`src/contracts.ts`). Places need no key; Firecrawl uses `FIRECRAWL_API_KEY`.
Reading one menu takes about 15–35 s in testing (one `/map` or `/search` call plus one or two extractions).

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

Confirm “I’d eat at either,” then click “Ask the Fly.” Open **Visual preview controls**
below the page and click **Play sample motion** to watch an eight-second scripted loop
with a movement trail. **Stop motion** stops it; Reset cancels it and clears the trail.
The loop never selects a restaurant and is not neural movement or a genuine recorded run.
The same controls let you supply a single sample pose or inspect
loading, either selection, no-choice, and error screens. These buttons supply authored
fixtures; they do not run a neural simulation or determine a real winner. Reset returns to
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
  The small fly has a locator ring for readability. Drag to orbit, scroll/pinch to zoom,
  and use Reset view to frame both restaurants. Camera controls are bounded and local
  to the scene. Trail samples come only from received positions.
- Live, mock, and replay states receive distinct labels. Supply readable preparation/error
  messages through `message`; replay must use genuine recorded data from the simulation owner.
- Menu URLs, dwell progress and runtime details come from `subscribeDetails` (see above).

`src/scene/courtyard.ts` owns the miniature fly.ai-inspired habitat: continuous ground,
irregular fruit patches, plants, grasses, rocks, and the existing two storefronts.
All terrain and props are decorative; destination pads still use supplied coordinates/radii.
It can later become a larger landscape without changing the UI/controller contract.
Buildings and plants have no collision meaning. A larger navigable world would also need the simulation
owner to define its actual boundaries and obstacles; decorative scenery alone cannot do that.

Fly geometry, camera patterns, and prop builders adapt MIT-licensed code from
[fly.ai's world renderer](https://github.com/alextitonis/fly.ai/blob/40fbeca60e5c16742f20b4c2c067de915b388e66/world/src/scene.ts).
See [visual handoff](src/scene/VISUALS.md) and [attribution and license](src/scene/fly-ai-NOTICE.md).

Optional frontend-only idle preview: open `http://localhost:5173/?mode=preview&ambient=1`.
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
performance measurements remain unverified. Reduced motion is
implemented through CSS and `prefers-reduced-motion`; it has not been visually exercised.
The earlier visual review used authored preview states. The integration checks below
also exercise the teammate's controller.

Brain/data side (`npm run check`, 14 checks, all passing): zero steering walks the neutral line,
misses both zones and times out at 30 s; zero motor output stops a neural-locomotion fly; zones are
equal, mirrored and off the neutral line; dwell resets on exit and wins at exactly 1 s; invalid
brain output is an error with no winner; stale worker replies are dropped; empty menus are errors;
the encoder ignores names and prices; on the real connectome, left/right probes give opposite
turns for three seeds, renaming restaurants changes nothing, a run reaches a decision, and replaying
its JSON log reproduces every pose and the result exactly. In Chrome (dev server, this machine) the
worker loads the cached model in under 1 s, steps in ~6 ms and runs at 1.0× real time; a mock run
completed start → selection in the UI.

**Integration verification (2026-09-26):** Docker build/typecheck, eight frontend tests,
and all 14 causal/decision checks pass. Chrome verified controller-driven mock movement,
30-second no-choice, reset during a run, and Reset view. Both live Firecrawl requests
completed, and a real browser connectome run selected sweetgreen after entering its zone
at 7.2 simulated seconds and dwelling for one second. Live reset worked after selection
and during a run. Ambient motion stayed disabled in live mode, even with `ambient=1`.
Cached menus reached ready after a server restart, and missing replay data produced
an explicit error with Start disabled.

**Search flow (2026-09-26, Chrome, dev server):**
- San Francisco listed five matching cities; "San Francisco, California" picked one directly.
- Zuni Café (15 items, first read) and Souvla (20 items, saved capture) both reached Ready, and the map appeared.
- A live connectome run picked Souvla (zone entry at 9.9 s plus the 1 s dwell). Reset returned to the picker.
- Change cleared a slot and hid the map. A place already in the other slot showed as "already chosen".
- Zuni's first read used a dessert-only PDF, so the ranker now prefers main menus. The re-read used the dinner menu (19 items).
- In Node, Sweetgreen (no website in OpenStreetMap) was found through Firecrawl web search: 20 items from sweetgreen.com/menu.
- Bad place ids and URLs are rejected by the server.
- `npm run check` passes 16 checks.
- Not tested: "Use my location" (the browser pane can't grant geolocation) and a place whose menu can't be found, including how the UI shows that error.

**Current shortlist:** sweetgreen and Souvla. Souvla replaces Tartine, whose capture
contained cake-order categories and a gift card entry. Souvla's official menu produced
18 food/drink entries with dish names and ingredients checked against the source.
The replacement pair completed a browser live-brain run using the saved Firecrawl
captures; sweetgreen was selected after zone entry at 7.6 seconds plus one second dwell.
These generated captures and browser run logs remain local; they are not committed. Generate your own
captures with `npm run capture`, restart Vite, then use `/?menus=cached`. No browser replay
fixture is included; `npm run record` creates one from saved captures.

## Feature branches

From your team's agreed base branch with a clean working tree:

```sh
git switch -c feature/short-description
```

Make your changes, run `npm run build`, then commit them on that branch and open
a pull request using your team's normal workflow.
