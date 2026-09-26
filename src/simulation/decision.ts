/**
 * The one decision rule. The first zone occupied continuously for dwellS simulated seconds wins;
 * leaving a zone resets its dwell; timeoutS without a winner is no choice.
 */
import type { SimConfig } from "./config.ts";

export type Zone = { id: string; x: number; z: number; radius: number };
export type Verdict = { kind: "running" } | { kind: "selected"; id: string } | { kind: "no-choice" };

export class Decision {
  readonly dwell: Record<string, number>;
  private readonly zones: Zone[];
  private readonly config: SimConfig;

  constructor(zones: Zone[], config: SimConfig) {
    this.zones = zones;
    this.config = config;
    this.dwell = Object.fromEntries(zones.map((z) => [z.id, 0]));
  }

  occupied(x: number, z: number): string | null {
    for (const zone of this.zones) if (Math.hypot(x - zone.x, z - zone.z) <= zone.radius) return zone.id;
    return null;
  }

  /** Call once per simulated step, after the body has moved; simTimeS is the time after the step. */
  update(x: number, z: number, simTimeS: number): Verdict {
    const inside = this.occupied(x, z);
    for (const zone of this.zones) {
      this.dwell[zone.id] = zone.id === inside ? this.dwell[zone.id] + this.config.dt : 0;
    }
    // small epsilon so 50 steps of 0.02 s count as a full second
    if (inside && this.dwell[inside] >= this.config.dwellS - 1e-9) return { kind: "selected", id: inside };
    if (simTimeS >= this.config.timeoutS - 1e-9) return { kind: "no-choice" };
    return { kind: "running" };
  }
}
