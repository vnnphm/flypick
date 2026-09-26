# FlyPick

Keep the app small: TypeScript, Vite, and plain Three.js. Visual work belongs in
src/scene and src/ui. Brain/data/server/simulation belong to the teammate. Coordinate
shared contracts and entry-point changes. See .agents/flypick-team-split.md.

The entry point defaults to the live controller; mock, replay, and visual preview modes
are explicit URL options. Never silently replace a live controller with mock data.
The renderer must not steer, infer dwell, or choose
a restaurant. Keep scenery decorative; authoritative geometry comes from state.

Use the Node 24 container workflow for tooling:

- `docker compose up --build` starts development.
- `docker compose run --rm web npm ci` refreshes dependencies after lockfile changes.
- `docker compose run --rm web npm run build` checks types and builds.
- `docker compose run --rm web npm run typecheck` checks types separately.
- `docker compose run --rm web npm test` runs the focused Node tests.

Brain/data side: the fly must be steered only by decoded connectome output; never add a
target-seeking controller, per-restaurant tuning, or a fallback that picks a winner. Tune gains
only with restaurant-free tools (`npm run probe`, `npm run arena`) and rerun `npm run check`.
Model files come from `npm run fetch:connectome` (pinned fly.ai revision, gitignored).

Dependencies live in the Compose `dependencies` volume. No host package installation
is needed. There is no separate linter; tests use Node's built-in runner.
