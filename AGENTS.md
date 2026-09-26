# FlyPick starter

Keep the starter small: TypeScript, Vite, and plain Three.js. Brain and data folders
are placeholders; add integrations only when requested.

Use the Node 24 container workflow for tooling:

- `docker compose up --build` starts development.
- `docker compose run --rm web npm ci` refreshes dependencies after lockfile changes.
- `docker compose run --rm web npm run build` checks types and builds.
- `docker compose run --rm web npm run typecheck` checks types separately.

Dependencies live in the Compose `dependencies` volume. No host package installation
is needed. There is no separate linter or test framework in this minimal starter.
