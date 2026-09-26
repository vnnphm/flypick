import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finite, fraction, observeBrain, presentation, RATE_SCALE_HZ, STALE_MS, steering } from '../src/ui/brainTelemetry.ts';

const state = (runId = 'a', status = 'running', mode = 'live') => ({
  runId, status, mode, fly: { x: 0, z: 0, heading: 0 }, restaurants: [{ id: 'one', name: 'First', x: 0, z: 1, radius: 1 }],
  selectedRestaurantId: null, message: null,
});
const details = (runId = 'a', values = {}) => ({
  runId, mode: 'live', motor: { turn: -.4, ratesHz: { 'DNa02 L': 7, 'DNa02 R': 2 } },
  dwell: { one: .4 }, dwellRequiredS: 1, simTimeS: 5, timeoutS: 30,
  runtime: { progress: null, revision: null, neurons: null, synapses: null, stepMs: 6 },
  simSpeed: 1, ...values,
});
function source() {
  const listeners = new Set(); let subscriptions = 0, removals = 0;
  return {
    controller: { subscribeDetails(fn) { subscriptions++; listeners.add(fn); return () => { removals++; listeners.delete(fn); }; } },
    send(next) { listeners.forEach(fn => fn(next)); },
    counts() { return { subscriptions, removals, active: listeners.size }; },
  };
}

test('decoded steering preserves values: negative left, neutral band, positive right', () => {
  assert.deepEqual(steering(-1), { value: -1, position: 0, direction: 'Left' });
  assert.deepEqual(steering(0), { value: 0, position: 50, direction: 'Straight' });
  assert.deepEqual(steering(1), { value: 1, position: 100, direction: 'Right' });
  assert.equal(steering(.04).value, .04);
  assert.equal(steering(.04).direction, 'Straight');
  assert.equal(steering(.06).direction, 'Right');
  assert.equal(steering(NaN), null);
  assert.equal(steering(undefined), null);
});

test('Hz bars use one fixed scale; clamp only geometry, never numeric source; missing is not zero', () => {
  const reading = details();
  assert.equal(RATE_SCALE_HZ, 5);
  assert.equal(fraction(reading.motor.ratesHz['DNa02 L'], RATE_SCALE_HZ), 1);
  assert.equal(fraction(reading.motor.ratesHz['DNa02 R'], RATE_SCALE_HZ), .4);
  assert.equal(reading.motor.ratesHz['DNa02 L'], 7);
  assert.equal(fraction(undefined, 5), null);
  assert.equal(fraction(0, 5), 0);
  assert.equal(fraction(1, 0), null);
  assert.equal(finite(Infinity), null);
});

test('new-run details arriving before state are retained; old-run updates cannot leak through reset', () => {
  const src = source(); let current;
  const feed = observeBrain(src.controller, r => { current = r; });
  feed.update(state()); src.send(details());
  assert.equal(fraction(current.details.dwell.one, current.details.dwellRequiredS), .4);
  src.send(details('b', { dwell: { one: 0 }, motor: null, simTimeS: 0 }));
  feed.update(state('b', 'ready'));
  assert.equal(current.details.simTimeS, 0);
  assert.equal(current.details.motor, null);
  assert.equal(current.details.dwell.one, 0);
  src.send(details('a'));
  assert.equal(current.details.runId, 'b');
  feed.update(state('c', 'ready'));
  assert.equal(current.details, undefined);
  src.send(details('b'));
  assert.equal(current.details, undefined);
  src.send(details('c', { dwell: { one: 0 }, motor: null }));
  assert.equal(current.details.runId, 'c');
  feed.dispose();
});

test('state frames do not mask stale details; recovery works; completion stays final', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const src = source(); let current;
  const feed = observeBrain(src.controller, r => { current = r; });
  feed.update(state()); src.send(details());
  t.mock.timers.tick(STALE_MS - 1);
  feed.update(state());
  assert.equal(current.stale, false);
  t.mock.timers.tick(1);
  assert.equal(current.stale, true);
  assert.equal(presentation(current).status, 'Waiting for telemetry');
  assert.equal(presentation(current).motor, null);
  src.send(details());
  assert.equal(current.stale, false);
  for (const status of ['selected', 'no-choice']) {
    feed.update(state('a', status));
    t.mock.timers.tick(STALE_MS * 3);
    assert.equal(current.stale, false);
    assert.equal(presentation(current).status, 'Final reading');
    assert.equal(presentation(current).motor.turn, -.4);
  }
  feed.dispose();
});

test('truthful ambient/loading/error/ready/missing/mock/replay presentation', () => {
  const base = { state: state(), details: details(), ambient: false, stale: false, available: true };
  const ambient = presentation({ ...base, ambient: true });
  assert.equal(ambient.status, 'Ambient animation — brain not controlling movement');
  assert.equal(ambient.motor, null);
  assert.equal(ambient.timing, undefined);
  assert.equal(presentation({ ...base, state: state('a', 'loading'), details: details('a', {runtime: {progress: 'Wiring synapses'}}) }).status, 'Wiring synapses');
  assert.equal(presentation({ ...base, state: { ...state('a', 'error'), message: 'Worker failed' } }).status, 'Worker failed');
  assert.equal(presentation({ ...base, state: state('a', 'error') }).motor, null);
  assert.equal(presentation({ ...base, state: state('a', 'ready') }).motor, null);
  assert.equal(presentation({ ...base, state: state('a', 'running', 'mock') }).mode, 'Mock / sample data');
  assert.equal(presentation({ ...base, state: state('a', 'running', 'replay') }).mode, 'Recorded / replay data');
  assert.equal(presentation({ ...base, details: undefined }).motor, undefined);
  assert.equal(presentation({ ...base, available: false }).status, 'Telemetry unavailable');
});

test('one details subscription per mount; dispose removes it and cancels stale work', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const src = source(); let renders = 0;
  for (let i = 0; i < 3; i++) {
    const feed = observeBrain(src.controller, () => renders++);
    feed.update(state()); src.send(details()); feed.setAmbient(true); feed.setAmbient(false);
    assert.equal(src.counts().active, 1);
    feed.dispose(); feed.dispose();
    const previous = renders;
    t.mock.timers.tick(STALE_MS * 2); src.send(details()); feed.update(state()); feed.setAmbient(true);
    assert.equal(renders, previous);
  }
  assert.deepEqual(src.counts(), { subscriptions: 3, removals: 3, active: 0 });
});

test('legacy authored preview without subscribeDetails stays explicitly unavailable', () => {
  let current;
  const feed = observeBrain({}, r => { current = r; });
  feed.update(state('preview', 'running', 'mock'));
  assert.equal(presentation(current).status, 'Telemetry unavailable');
  assert.equal(presentation(current).mode, 'Mock / sample data');
  feed.setAmbient(true);
  assert.match(presentation(current).status, /^Ambient animation/);
  feed.dispose();
});
