# FlyPick

A minimal TypeScript + Vite + plain Three.js starter. The page renders a static
placeholder fly on a platform. No restaurant features, brain simulation, fly.ai,
or Firecrawl integration is implemented.

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
npm run build      # Typecheck and production build into dist/
npm run preview    # Serve an existing build locally on port 4173
```

To verify in Docker, run `docker compose run --rm web npm run build`.
No separate lint or test tooling is installed.

## Folders

- `src/scene/`: Three.js scene and placeholder fly geometry.
- `src/brain/`: Reserved for future brain code; currently empty.
- `src/data/`: Reserved for future restaurant data code; currently empty.
- `src/ui/`: Page styling and future UI code.
- `src/contracts.ts`: Minimal shared restaurant and motor-output types.
- `src/main.ts`: Page entry point.
- `server/`: Reserved for future server code; no server runs yet.

## Feature branches

From your team's agreed base branch with a clean working tree:

```sh
git switch -c feature/short-description
```

Make your changes, run `npm run build`, then commit them on that branch and open
a pull request using your team's normal workflow.
