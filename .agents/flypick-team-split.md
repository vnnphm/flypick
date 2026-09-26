# FlyPick — Two-Person Feature Split

## Ownership

| You: `feature/visuals` | Friend: `feature/brain-data` |
|---|---|
| Fly asset and cosmetic animation | Firecrawl integration and menu processing |
| Arena, camera, restaurant markers | Menu-to-sensory encoding |
| Controls, loading/error screens | Full-connectome runtime integration |
| Movement trail and visual polish | Neural motor-output decoding |
| Restaurant cards and result display | Authoritative movement simulation |
| Render incoming simulation state | Zone detection, dwell, timeout, final decision |

**You own how it looks. Your friend owns how it behaves.** Motor decoding, movement, and decision logic stay together so there is one source of truth.

## Folder ownership

- **You:** `src/scene/`, `src/ui/`, visual assets, and styles.
- **Friend:** `src/brain/`, `src/data/`, `src/simulation/`, and `server/`.
- **Shared:** `src/contracts.ts`, app entry point, configuration, and dependency files. Agree on these together; have one person make each shared change. Your friend maintains the contract after initial agreement.

## Shared interface

Agree on this before developing separately. Your friend publishes state; your scene renders it.

```ts
export type SimulationState = {
  runId: string;
  mode: "live" | "mock" | "replay";
  status:
    | "loading"
    | "ready"
    | "running"
    | "selected"
    | "no-choice"
    | "error";
  fly: { x: number; z: number; heading: number };
  restaurants: {
    id: string;
    name: string;
    x: number;
    z: number;
    radius: number;
  }[];
  selectedRestaurantId: string | null;
  message: string | null;
};

export interface SimulationController {
  start(): Promise<void>;
  reset(): Promise<void>;
  subscribe(listener: (state: SimulationState) => void): () => void;
}
```

- Use world units consistently. Ground is the X/Z plane; Y is visual height.
- Heading is in radians: zero faces +Z; positive heading turns toward +X.
- `subscribe` immediately supplies current state and returns an unsubscribe function.
- `start` runs only when ready. `reset` cancels the current run and prepares a fresh ready state; initialization failures produce an error state.
- UI actions call `start` and `reset`. Runtime failures also appear in state with a readable message.
- Render snapshots as read-only. Cosmetic interpolation, wing flutter, and bobbing must not change simulation state.
- `selectedRestaurantId` is set only by the simulation's decision logic.
- Restaurant marker locations and selection-zone dimensions come from the same state; do not duplicate coordinates in the scene.
- Display mock/replay mode clearly. A mock feed is a development aid and must never silently replace the live brain.

## Behavioral rules

- Users approve two restaurants they would actually eat at; the fly breaks the tie.
- Menu data becomes sensory input. Actual brain outputs control steering.
- No scripted destination, hidden restaurant ranking, or winner-selected animation.
- Simplified constant forward speed is allowed if disclosed; steering remains neural.
- First restaurant zone occupied continuously for one simulated second wins.
- After 30 simulated seconds without commitment, return `no-choice`.
- Visual celebration begins after receiving `selected`; it never determines the winner.

## Branch workflow

1. Commit and push the working scaffold to `main`.
2. Create `feature/visuals` and `feature/brain-data` from that same commit.
3. Make small commits and merge working increments through pull requests, roughly every hour.
4. After a merge, bring the latest `main` into the other feature branch.
5. Coordinate before changing shared types, dependencies, or the app entry point.
6. Keep `main` runnable. Build and typecheck before merging.

Do not wait until the final hour to integrate.

## Integration milestones

| When | You | Friend | Shared checkpoint |
|---|---|---|---|
| First 30 minutes | Render fly and two markers | Supply a clearly labeled mock state feed | Agree on interface and coordinates; start/reset connected |
| By hour 1 | Show incoming position and heading | Prove real stimulus-responsive brain steering | Real neural output visibly changes heading |
| Hours 1–3 | Arena, trail, cards, camera, status UI | Firecrawl, menu encoding, movement, decision rule | First complete menu-to-brain-to-choice run |
| Hours 3–4 | Result reveal and visual polish | Cached menus, failure handling, logs | Reset, no-choice, and errors work end to end |
| Hours 4–6 | Visual review and rehearsal | Causal checks, performance, genuine replay | Build/typecheck pass; demo on presentation laptop |

Your friend's side has greater integration risk. Prioritize proving neural steering before polishing Firecrawl. Use labeled cached menus if needed. If visual work finishes early, help with integration testing and presentation rather than adding features.

## Done means

- The fly is recognizable, both restaurant targets are readable, and its movement is easy to follow.
- The scene displays authoritative state without independently steering or choosing.
- A live brain run controls steering; a mock or replay is clearly identified.
- Start/reset, selection, timeout, and error states work.
- Zero steering in constant-speed mode follows a neutral path that misses both restaurant zones.
- Both developers can pull `main`, follow the README, and run the same working demo.
