# FlyPick — Small Frontend-Only Idle Add-on

## Task for Codex

Add a small optional idle animation to the existing FlyPick courtyard. My teammate is actively changing the backend. This is an incremental visual enhancement, not a request to reimplement the full project plan or redesign integration.

Inspect the current app first and preserve its working behavior. Treat the current code and agreed interface as authoritative. Do not migrate the stack, restructure the project, or implement unrelated items from the full planning document.

## Strict scope

- Work only on frontend scene/visual files and, if necessary, a minimal change to the existing frontend event handler that stops the animation.
- Do not edit Firecrawl, menu processing, brain/runtime code, simulation physics, restaurant decision logic, server code, shared types/contracts, or dependency files.
- Do not introduce new requirements for backend start/reset, seeds, payloads, status values, or endpoints.
- Keep the existing fly, courtyard, fixed camera, controls, and restaurant UI.
- Use existing dependencies and the existing render loop.

## Visual feature

While the app is waiting for user input, optionally let the fly:

1. Roam slowly between a few nearby points inside the camera view.
2. Land beside one of two or three simple fruit props.
3. Pause for a brief cosmetic eating animation, then take off.

Grooming is optional only if trivial. No open-world expansion, camera controls, hunger system, physics engine, or real brain simulation for idle behavior. Label it subtly as ambient animation. Respect reduced motion.

## Isolation and handoff

- Idle animation is local presentation state. Never write its pose into simulation state, shared stores, or backend inputs.
- Use a local scene flag to select ambient pose versus the existing pose-rendering path. Only one path may write the displayed fly transform per frame.
- On the existing Start action, stop idle synchronously and clear idle interpolation before the existing handler continues. Leave its backend call sequence unchanged.
- Restore the pose supplied by the existing application state; do not invent a new backend reset or starting-position requirement.
- While choosing, awaiting a start response, showing a result, or showing an error, idle must remain stopped. Delayed backend updates are not permission to roam.
- Resume only when the current app's existing flow clearly returns to its waiting/ready state. Preserve the existing Reset behavior.
- Fruit is decorative only: it must not enter sensory inputs, collision rules, zone detection, or restaurant scoring. Hide it during a run if needed for visual clarity.
- Clean up local animation state/listeners on teardown; avoid separate timers or a second animation loop.

## If the backend handoff is not stable yet

Build the idle controller and fruit props as an isolated frontend preview, disabled in the normal app by default. Verify it locally without changing the shared interface. Do not guess at evolving backend events or alter the backend to make idle work. Report the one existing frontend hook needed for later connection.

This feature must remain easy to disable or remove. It must not delay core integration. Timebox to 30–45 minutes; reduce to fruit props and a resting animation if necessary.

## Verification and handoff

- Existing start/reset and mock/live rendering behavior still work.
- Starting during roaming or eating immediately stops ambient control; no competing pose writes occur.
- Idle never selects a restaurant, changes simulation data, or hides an error/result.
- Repeated starts/resets do not accumulate listeners or animations.
- Verify the normal app is unchanged when idle is disabled.
- Run the project's existing build/typecheck and relevant checks; do not add dependencies for testing.
- Summarize the frontend files changed, whether live handoff was verified or remains preview-only, and how to disable the feature.

Do not claim this implements or validates the backend. Finish only this small visual add-on.
