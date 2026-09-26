// Manual browser QA only. Not imported by the app or included in its production entry.
import { mountFlyPick } from '../src/ui/app';
import type { SimulationDetails, SimulationState } from '../src/contracts';
import '../src/ui/styles.css';

let sequence = 0;
let state: SimulationState = {
  runId: 'fixture-0', mode: 'mock', status: 'ready', fly: { x: 0, z: -4, heading: 0 },
  restaurants: [{id: 'a', name: 'Example North', x: -3.2, z: 4, radius: 1.6}, {id: 'b', name: 'Example South', x: 3.2, z: 4, radius: 1.6}],
  selectedRestaurantId: null, message: 'Development fixture — authored values, not a brain run.',
};
let details: SimulationDetails = {
  runId: state.runId, mode: 'mock', menuSource: null, locomotion: 'constant-speed-neural-steering',
  simTimeS: 0, timeoutS: 30, dwellRequiredS: 1, dwell: {a: 0, b: 0}, trail: [], menus: [], slots: [], motor: null, simSpeed: 1, log: null,
  runtime: {label: 'Development fixture', modelId: null, revision: 'fixture-only', neurons: null, synapses: null, stepMs: null, progress: null},
};
const states = new Set<(s: SimulationState) => void>();
const readings = new Set<(d: SimulationDetails) => void>();
function publish() {
  readings.forEach(fn => fn(structuredClone(details)));
  states.forEach(fn => fn(structuredClone(state)));
}
const controller = {
  async start() { state = {...state, status: 'running'}; publish(); },
  async reset() {
    state = {...state, runId: `fixture-${++sequence}`, status: 'ready', selectedRestaurantId: null};
    details = {...details, runId: state.runId, simTimeS: 0, dwell: {a: 0, b: 0}, motor: null}; publish();
  },
  subscribe(fn: (s: SimulationState) => void) { states.add(fn); fn(structuredClone(state)); return () => { states.delete(fn); }; },
  subscribeDetails(fn: (d: SimulationDetails) => void) { readings.add(fn); fn(structuredClone(details)); return () => { readings.delete(fn); }; },
};
const root = document.querySelector<HTMLElement>('#app')!;
let app = mountFlyPick(root, controller);
const controls = document.querySelector<HTMLElement>('#fixture-controls')!;
const banner = document.createElement('p'); banner.textContent = 'DEVELOPMENT FIXTURE — all readings and outcomes below are authored test data.';
controls.append(banner);
function button(name: string, run: () => void) {
  const el = document.createElement('button'); el.textContent = name; el.addEventListener('click', run); controls.append(el);
}
for (const [label, turn] of [['Left', -.7], ['Neutral', .02], ['Right / overflow', .8]] as const) {
  button(label, () => {
    state = {...state, mode: 'mock', status: 'running', selectedRestaurantId: null};
    details = {...details, mode: 'mock', simTimeS: 3.4, dwell: {a: .4, b: 0}, motor: {turn, ratesHz: {'DNa02 L': 7, 'DNa02 R': 2, 'DNg100 L': .3, 'DNg100 R': .2, 'MDN L': .1, 'MDN R': .1, 'DNp01 L': 0, 'DNp01 R': 0}}};
    publish();
  });
}
button('Missing readings', () => { details = {...details, motor: null}; publish(); });
button('Loading', () => { state = {...state, status: 'loading'}; details = {...details, runtime: {...details.runtime, progress: 'Fixture: loading model'}}; publish(); });
for (const status of ['selected', 'no-choice', 'error'] as const) button(status, () => {
  state = {...state, status, selectedRestaurantId: status === 'selected' ? 'a' : null, message: `Development fixture: ${status}`}; publish();
});
button('Replay label', () => { state = {...state, mode: 'replay', status: 'running'}; details = {...details, mode: 'replay'}; publish(); });
button('Reset fixture', () => { void controller.reset(); });
button('Remount', () => {
  app.dispose(); app = mountFlyPick(root, controller);
  banner.textContent = `DEVELOPMENT FIXTURE — subscriptions: state ${states.size}, telemetry ${readings.size}. Authored data only.`;
});
import.meta.hot?.dispose(() => { app.dispose(); controls.replaceChildren(); });
