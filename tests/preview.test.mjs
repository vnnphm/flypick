import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreviewController } from '../src/ui/previewController.ts';

test('preview publishes immediately, never chooses on start, and resets with a fresh run ID', async () => {
  const { controller } = createPreviewController();
  const snapshots = [];
  const unsubscribe = controller.subscribe(state => snapshots.push(state));
  assert.equal(snapshots[0].status, 'ready');
  assert.equal(snapshots[0].mode, 'mock');
  await controller.start();
  assert.equal(snapshots.at(-1).status, 'running');
  assert.equal(snapshots.at(-1).selectedRestaurantId, null);
  assert.deepEqual(snapshots.at(-1).fly, snapshots[0].fly);
  const count = snapshots.length;
  await controller.start();
  assert.equal(snapshots.length, count, 'start outside ready must be ignored');
  await controller.reset();
  assert.notEqual(snapshots.at(-1).runId, snapshots[0].runId);
  assert.equal(snapshots.at(-1).status, 'ready');
  unsubscribe();
  const afterUnsubscribe = snapshots.length;
  await controller.reset();
  assert.equal(snapshots.length, afterUnsubscribe);
});

test('a visual consumer cannot mutate the preview source or another subscriber', async () => {
  const { controller } = createPreviewController();
  controller.subscribe(state => {
    state.fly.x = 999;
    state.restaurants[0].name = 'Mutated';
    state.selectedRestaurantId = state.restaurants[0].id;
  });
  let latest;
  controller.subscribe(state => { latest = state; });
  await controller.start();
  assert.equal(latest.fly.x, 0);
  assert.equal(latest.restaurants[0].name, 'Juniper Kitchen');
  assert.equal(latest.selectedRestaurantId, null);
});

test('scripted playback moves the fly without selecting a restaurant and ends after eight seconds', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const preview = createPreviewController();
  const snapshots = [];
  preview.controller.subscribe(state => snapshots.push(state));
  preview.playMotion();
  assert.equal(snapshots.length, 1, 'motion requires starting the preview first');
  await preview.controller.start();
  preview.playMotion();
  const original = snapshots.at(-1).fly;
  t.mock.timers.tick(2000);
  assert.notDeepEqual(snapshots.at(-1).fly, original);
  t.mock.timers.tick(6000);
  assert.match(snapshots.at(-1).message, /finished/);
  assert.ok(snapshots.every(state => state.mode === 'mock' && state.selectedRestaurantId === null));
  const count = snapshots.length;
  t.mock.timers.tick(1000);
  assert.equal(snapshots.length, count, 'completed playback must stop publishing');
});

test('stop and reset cancel playback so stale animation cannot affect the next run', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const preview = createPreviewController();
  const snapshots = [];
  preview.controller.subscribe(state => snapshots.push(state));
  await preview.controller.start();
  preview.playMotion();
  t.mock.timers.tick(1000);
  preview.stopMotion();
  const count = snapshots.length;
  t.mock.timers.tick(1000);
  assert.equal(snapshots.length, count);
  preview.playMotion();
  t.mock.timers.tick(1000);
  await preview.controller.reset();
  const resetCount = snapshots.length;
  t.mock.timers.tick(10000);
  assert.equal(snapshots.length, resetCount);
  assert.equal(snapshots.at(-1).status, 'ready');
  assert.deepEqual(snapshots.at(-1).fly, { x: 0, z: 3, heading: Math.PI });
});
