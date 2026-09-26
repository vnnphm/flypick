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
