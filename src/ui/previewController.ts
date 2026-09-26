import type { SimulationController, SimulationState } from '../contracts';

/** Scripted visual fixtures only. Never imported as a fallback by a live controller. */
export function createPreviewController() {
  const listeners = new Set<(state: SimulationState) => void>();
  let run = 1;
  function initial(): SimulationState {
    return {
      runId: `visual-preview-${run}`, mode: 'mock', status: 'ready',
      fly: { x: 0, z: 3, heading: Math.PI },
      restaurants: [
        { id: 'example-a', name: 'Juniper Kitchen', x: -3, z: -2, radius: 1.25 },
        { id: 'example-b', name: 'Little Ember', x: 3, z: -2, radius: 1.25 },
      ],
      selectedRestaurantId: null,
      message: 'Example restaurants for visual review. No live decision will be made.',
    };
  }
  let state = initial();
  let motionTimer: ReturnType<typeof setInterval> | undefined;
  function clearMotion() {
    if (motionTimer !== undefined) clearInterval(motionTimer);
    motionTimer = undefined;
  }
  function publish(next: SimulationState) {
    if (next.status !== 'running') clearMotion();
    state = next;
    listeners.forEach(listener => listener(structuredClone(state)));
  }
  const controller: SimulationController = {
    async start() {
      if (state.status !== 'ready') return;
      publish({ ...state, status: 'running', message: 'Open Visual preview controls and play sample motion to see the fly move. This is a scripted visual preview, not a brain decision.' });
    },
    async reset() { run++; publish(initial()); },
    subscribe(listener) { listeners.add(listener); listener(structuredClone(state)); return () => { listeners.delete(listener); }; },
  };
  function playMotion() {
    if (state.status !== 'running' || motionTimer !== undefined) return;
    run++;
    let elapsed = 0;
    motionTimer = setInterval(() => {
      elapsed += 20;
      const t = Math.min(elapsed / 8000, 1);
      const angle = Math.PI * t;
      // An authored loop through the courtyard, unrelated to restaurant inputs.
      const x = 1.25 * Math.sin(2 * angle) * Math.sin(angle);
      const z = 3 - 4 * Math.sin(angle);
      const dx = 1.25 * (2 * Math.cos(2 * angle) * Math.sin(angle) + Math.sin(2 * angle) * Math.cos(angle));
      const dz = -4 * Math.cos(angle);
      if (t === 1) clearMotion();
      publish({ ...state, fly: { x, z, heading: Math.atan2(dx, dz) },
        message: t === 1 ? 'Sample motion finished. No restaurant was chosen. Play it again or reset.' : 'Scripted motion preview · not neural output. Watch the fly and its trail; this animation cannot choose a restaurant.' });
    }, 20);
    publish({ ...initial(), status: 'running', message: 'Scripted motion preview · not neural output. No restaurant will be chosen.' });
  }
  function stopMotion() {
    clearMotion();
    if (state.status === 'running') publish({ ...state, message: 'Sample motion stopped. No restaurant was chosen.' });
  }
  const poses = [
    { x: 0, z: 2.5, heading: Math.PI },
    { x: -0.15, z: 1.8, heading: Math.PI + 0.25 },
    { x: -0.6, z: 1.1, heading: Math.PI + 0.45 },
    { x: -1, z: 0.5, heading: Math.PI + 0.6 },
    { x: -1.6, z: -0.1, heading: Math.PI + 0.6 },
  ];
  let poseIndex = 0;
  function mountControls(host: HTMLElement) {
    const details = document.createElement('details');
    details.className = 'preview-panel';
    details.innerHTML = '<summary>Visual preview controls</summary><p>After starting the preview, play eight seconds of scripted sample motion or supply individual states. These are authored fixtures, not neural outputs or a recorded run.</p><div class="preview-buttons"></div>';
    const buttons = details.querySelector('div')!;
    const actions: [string, () => void][] = [
      ['Play sample motion', playMotion],
      ['Stop motion', stopMotion],
      ['Sample pose', () => {
        if (state.status !== 'running') return;
        publish({ ...state, fly: { ...poses[poseIndex++ % poses.length] } });
      }],
      ['Show loading', () => publish({ ...state, status: 'loading', selectedRestaurantId: null, message: 'Preview of preparation. No services are being contacted.' })],
      ['Show selection A', () => publish({ ...state, status: 'selected', selectedRestaurantId: 'example-a', message: 'Authored result fixture for styling only. The fly did not make this choice.' })],
      ['Show selection B', () => publish({ ...state, status: 'selected', selectedRestaurantId: 'example-b', message: 'Authored result fixture for styling only. The fly did not make this choice.' })],
      ['Show no-choice', () => publish({ ...state, status: 'no-choice', selectedRestaurantId: null, message: 'Preview of a timeout. No restaurant was selected.' })],
      ['Show error', () => publish({ ...state, status: 'error', selectedRestaurantId: null, message: 'Preview of a runtime error. Reset to return to the ready screen.' })],
    ];
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      buttons.append(button);
    }
    const unsubscribe = controller.subscribe(next => {
      (buttons.children[0] as HTMLButtonElement).disabled = next.status !== 'running' || motionTimer !== undefined;
      (buttons.children[1] as HTMLButtonElement).disabled = motionTimer === undefined;
      (buttons.children[2] as HTMLButtonElement).disabled = next.status !== 'running' || motionTimer !== undefined;
      if (next.status === 'ready') poseIndex = 0;
    });
    host.append(details);
    return () => { clearMotion(); unsubscribe(); details.remove(); };
  }
  return { controller, mountControls, playMotion, stopMotion };
}
