import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIdleAnimation } from './idle.ts';

const ready = () => ({ runId: 'one', mode: 'mock', status: 'ready', fly: { x: 0, z: 3, heading: Math.PI } });
const poseOf = ({ x, z, heading }) => ({ x, z, heading });

test('disabled, live, replay, and reduced-motion views always preserve the supplied pose', () => {
  for (const [enabled, mode, reduced] of [[false, 'mock', false], [true, 'live', false], [true, 'replay', false], [true, 'mock', true]]) {
    const idle = createIdleAnimation(enabled);
    const state = { ...ready(), mode };
    idle.update(state);
    idle.sample(0, reduced);
    const result = idle.sample(5000, reduced);
    assert.equal(result.ambient, false);
    assert.deepEqual(poseOf(result), state.fly);
  }
});

test('roaming and eating remain local, and Start immediately restores the authoritative pose', () => {
  for (const time of [2000, 5000]) {
    const state = Object.freeze({ ...ready(), fly: Object.freeze(ready().fly) });
    const original = JSON.stringify(state);
    const idle = createIdleAnimation(true);
    idle.update(state);
    idle.sample(0);
    const ambient = idle.sample(time);
    assert.equal(ambient.ambient, true);
    assert.equal(ambient.flying, time < 4000);
    assert.notDeepEqual(poseOf(ambient), state.fly);
    idle.beginAction();
    const restored = idle.sample(time);
    assert.equal(restored.ambient, false);
    assert.equal(restored.y, 0);
    assert.equal(restored.pitch, 0);
    assert.deepEqual(poseOf(restored), state.fly);
    assert.equal(JSON.stringify(state), original);
    idle.update({ ...state, runId: 'late-ready' });
    assert.equal(idle.sample(time + 100).ambient, false, 'pending ready must not resume idle');
    idle.endAction('start', true);
    idle.update({ ...state, runId: 'another-late-ready' });
    assert.equal(idle.sample(time + 200).ambient, false, 'resolved start alone must not resume idle');
  }
});

test('non-ready states stop idle and failed actions stay stopped until a successful reset', () => {
  const idle = createIdleAnimation(true);
  for (const status of ['loading', 'running', 'selected', 'no-choice', 'error']) {
    idle.update(ready());
    idle.sample(0);
    idle.update({ ...ready(), status });
    assert.equal(idle.sample(5000).ambient, false);
  }
  idle.update(ready());
  idle.beginAction();
  idle.endAction('start', false);
  idle.update({ ...ready(), status: 'loading' });
  idle.update(ready());
  assert.equal(idle.sample(10000).ambient, false, 'a visible action error must keep idle stopped');
  idle.beginAction();
  idle.update({ ...ready(), runId: 'reset' });
  assert.equal(idle.sample(11000).ambient, false, 'reset is still pending');
  idle.endAction('reset', true);
  assert.equal(idle.sample(12000).ambient, true);
  assert.deepEqual(poseOf(idle.sample(12000)), ready().fly, 'reset clears interpolation');
});

test('repeated reset cycles and teardown leave no animation state behind', () => {
  const idle = createIdleAnimation(true);
  for (let i = 0; i < 10; i++) {
    idle.beginAction();
    const state = { ...ready(), runId: String(i), fly: { x: i, z: 2, heading: 0.4 } };
    idle.update(state);
    idle.endAction('reset', true);
    assert.deepEqual(poseOf(idle.sample(i * 10000)), state.fly);
    assert.equal(idle.sample(i * 10000 + 2000).ambient, true);
  }
  idle.dispose();
  assert.equal(idle.sample(200000).ambient, false);
});
