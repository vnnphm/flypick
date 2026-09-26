type Pose = { x: number; z: number; heading: number };
type Snapshot = {
  runId: string;
  mode: string;
  status: string;
  fly: Pose;
};
type Action = 'start' | 'reset';

// Offsets are presentation-only; neither fruit nor waypoints leave the scene.
export const IDLE_FRUIT = [{ x: -1.2, z: -0.8 }, { x: 1.2, z: -0.8 }];
const LANDING_OFFSET = 1.05; // Keep the enlarged fly's head beside the fruit.

export function createIdleAnimation(enabled = false) {
  let snapshot: Snapshot | undefined;
  let pending = false;
  let stopped = false;
  let actionFailed = false;
  let epoch: number | undefined;
  let anchor: Pose = { x: 0, z: 0, heading: 0 };
  function clear() { epoch = undefined; }
  function update(next: Snapshot) {
    // A duplicate ready snapshot after Start must not re-enable ambient control.
    if (next.status === 'ready' && snapshot && snapshot.status !== 'ready' && !pending) stopped = false;
    if (snapshot?.runId !== next.runId || next.status !== 'ready' || next.mode !== 'mock') clear();
    snapshot = { runId: next.runId, mode: next.mode, status: next.status, fly: { ...next.fly } };
  }
  function sample(now: number, reducedMotion = false) {
    const authoritative = snapshot?.fly ?? { x: 0, z: 0, heading: 0 };
    const active = enabled && snapshot?.mode === 'mock' && snapshot.status === 'ready' && !pending && !stopped && !actionFailed && !reducedMotion;
    if (!active) {
      clear();
      return { ...authoritative, y: 0, pitch: 0, ambient: false, flying: false, anchor: { ...authoritative } };
    }
    if (epoch === undefined) { epoch = now; anchor = { ...authoritative }; }
    const elapsed = Math.max(0, now - epoch) / 1000;
    const leg = Math.floor(elapsed / 6.4);
    const phase = elapsed % 6.4;
    const target = IDLE_FRUIT[leg % IDLE_FRUIT.length];
    const previous = IDLE_FRUIT[(leg + IDLE_FRUIT.length - 1) % IDLE_FRUIT.length];
    const from = leg === 0 ? anchor : { x: anchor.x + previous.x, z: anchor.z + previous.z + LANDING_OFFSET };
    const to = { x: anchor.x + target.x, z: anchor.z + target.z + LANDING_OFFSET };
    const traveling = phase < 4;
    const progress = Math.min(phase / 4, 1);
    const smooth = progress * progress * (3 - 2 * progress);
    const travelHeading = Math.atan2(to.x - from.x, to.z - from.z);
    const mixAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
    const heading = mixAngle(
      mixAngle(leg === 0 ? anchor.heading : Math.PI, travelHeading, Math.min(progress * 4, 1)),
      Math.PI, Math.max(0, (progress - 0.75) * 4),
    );
    return {
      x: from.x + (to.x - from.x) * smooth,
      z: from.z + (to.z - from.z) * smooth,
      y: traveling ? Math.sin(Math.PI * progress) * 0.32 : 0,
      heading,
      pitch: traveling ? 0 : Math.sin((phase - 4) * Math.PI / 2.4) * (0.1 + 0.025 * Math.sin(phase * 12)),
      ambient: true, flying: traveling, anchor: { ...anchor },
    };
  }
  return {
    update, sample,
    beginAction() { pending = true; stopped = true; clear(); },
    endAction(action: Action, succeeded: boolean) {
      pending = false;
      if (!succeeded) actionFailed = true;
      // A completed reset is the existing app's explicit return-to-ready flow.
      if (action === 'reset' && succeeded && snapshot?.status === 'ready') { stopped = false; actionFailed = false; }
    },
    dispose() { pending = false; stopped = true; snapshot = undefined; clear(); },
  };
}
