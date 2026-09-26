import type { SimulationController, SimulationState } from '../contracts';

/** Manual visual fixtures only. Never imported as a fallback by a live controller. */
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
  function publish(next: SimulationState) {
    state = next;
    listeners.forEach(listener => listener(structuredClone(state)));
  }
  const controller: SimulationController = {
    async start() {
      if (state.status !== 'ready') return;
      publish({ ...state, status: 'running', message: 'Use the preview controls below to supply sample poses. There is no automatic movement or winner.' });
    },
    async reset() { run++; publish(initial()); },
    subscribe(listener) { listeners.add(listener); listener(structuredClone(state)); return () => { listeners.delete(listener); }; },
  };
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
    details.innerHTML = '<summary>Visual preview controls</summary><p>Manually supply sample states to review the interface. These are authored fixtures, not neural outputs or a recorded run.</p><div class="preview-buttons"></div>';
    const buttons = details.querySelector('div')!;
    const actions: [string, () => void][] = [
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
      (buttons.firstElementChild as HTMLButtonElement).disabled = next.status !== 'running';
      if (next.status === 'ready') poseIndex = 0;
    });
    host.append(details);
    return () => { unsubscribe(); details.remove(); };
  }
  return { controller, mountControls };
}
