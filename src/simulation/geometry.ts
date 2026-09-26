/**
 * Arena geometry and the sensory side of the loop: where the targets are, and how the fly's pose
 * turns them into LC10a voltage on each side. Rotation does not change a target's drive (angular
 * size depends on distance); which side it lands on depends on its bearing.
 *
 * Frames: facing +Z with Y up, +X is the fly's anatomical left. Heading h rotates toward +X, so
 * forward = (sin h, cos h) and left = (cos h, -sin h) in (x, z).
 */
import type { SimConfig } from "./config.ts";

export type Pose = { x: number; z: number; heading: number };

export type Target = {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  salience: number;
};

/**
 * Two equal zones mirrored across x = 0. Which restaurant goes on which side is a separate coin
 * flip per run (recorded), drawn independently of the brain seed, so a side bias in the model
 * cannot favour one restaurant every time.
 */
export function placeTargets(
  menus: { id: string; name: string; salience: number }[],
  swap: boolean,
  config: SimConfig,
): Target[] {
  if (menus.length !== 2) throw new Error(`need exactly two restaurants, got ${menus.length}`);
  const [a, b] = swap ? [menus[1], menus[0]] : menus;
  const { offsetX, z, radius } = config.zone;
  return [
    { id: a.id, name: a.name, x: offsetX, z, radius, salience: a.salience }, // +X: the start pose's left
    { id: b.id, name: b.name, x: -offsetX, z, radius, salience: b.salience },
  ];
}

export type TargetView = { id: string; bearing: number; distance: number; side: "L" | "R" | null; drive: number };

/** Bearing is positive toward the fly's left. */
export function view(pose: Pose, t: Target, config: SimConfig): TargetView {
  const dx = t.x - pose.x, dz = t.z - pose.z;
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const fwd = dx * s + dz * c;
  const left = dx * c - dz * s;
  const bearing = Math.atan2(left, fwd);
  const distance = Math.hypot(dx, dz);
  if (Math.abs(bearing) > config.fovHalf) return { id: t.id, bearing, distance, side: null, drive: 0 };
  const angle = (2 * t.radius) / Math.max(distance, config.minDist);
  // salience scales the capped visual term, so menu differences survive at close range
  const visual = Math.min(config.chaseCap, config.chaseBase + config.chaseGain * angle);
  const drive = Math.max(0, t.salience * visual);
  return { id: t.id, bearing, distance, side: bearing >= 0 ? "L" : "R", drive };
}

/** LC10a voltage per side: the strongest target on that side, as in fly.ai's Vision encoder. */
export function sense(pose: Pose, targets: Target[], config: SimConfig): { left: number; right: number } {
  let left = 0, right = 0;
  for (const t of targets) {
    const v = view(pose, t, config);
    if (v.side === "L") left = Math.max(left, v.drive);
    else if (v.side === "R") right = Math.max(right, v.drive);
  }
  return { left, right };
}

/** Advance the body one step. Speed never depends on the restaurants. */
export function move(pose: Pose, turn: number, speed: number, config: SimConfig): Pose {
  const dt = config.dt;
  // turn < 0 is the fly's left, which is +heading
  const heading = pose.heading - turn * config.turnRate * dt;
  let dx = Math.sin(heading) * speed * dt;
  let dz = Math.cos(heading) * speed * dt;
  const r = Math.hypot(pose.x + dx, pose.z + dz);
  if (r > config.arenaRadius) {
    // at the wall, block the outward part of the step; heading is left alone
    const n = Math.hypot(pose.x, pose.z) || 1;
    const nx = pose.x / n, nz = pose.z / n;
    const out = Math.max(0, dx * nx + dz * nz);
    dx -= out * nx;
    dz -= out * nz;
  }
  let x = pose.x + dx, z = pose.z + dz;
  const rr = Math.hypot(x, z);
  if (rr > config.arenaRadius) {
    x *= config.arenaRadius / rr;
    z *= config.arenaRadius / rr;
  }
  return { x, z, heading };
}
