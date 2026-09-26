# Ambient idle preview

Open `http://localhost:5173/?mode=preview&ambient=1` to opt in. The normal URL uses the live controller;
live/replay states and reduced-motion preference always disable ambient control.
While mock state is ready, the fly roams between two decorative fruit props, lands,
and nods briefly. The scene labels this as ambient animation. No pose, fruit, or
animation data is sent to the controller or used for the movement trail or decision.

The add-on uses the existing render loop. `idle.ts` owns local presentation state;
`idleFruit.ts` owns disposable fruit geometry. `createScene.ts` has one transform
writer choosing between ambient and authoritative poses. There are no extra timers
or animation listeners. Remove `?ambient=1` to disable it.

The existing `act` handler in `src/ui/app.ts` calls `scene.beginAction()` synchronously
before either controller action. It immediately stops idle, clears its interpolation,
hides fruit, and restores the latest supplied pose. The `finally` hook reports action
completion to `scene.endAction()`. The backend call order and shared contract are unchanged.
Pending Start, duplicate ready snapshots, and failed actions cannot resume idle.
A successful Reset to ready, or an unblocked transition back to ready, permits it again.

Integration verified live Start/Reset with ambient disabled, including `ambient=1`.
This remains a mock-only preview; enabling ambient presentation for live mode is not
part of this integration. Preserve the existing frontend action hooks and mock-only gate. Do not add
backend events, reset conventions, or ambient poses to the shared contract.

Checks (existing Node runner, no new dependencies):

```sh
docker compose run --rm web npm run build
docker compose run --rm web npm test
docker compose run --rm web node --test src/scene/idle.test.mjs
```
