/**
 * The authoritative simulation. One tick = one neural step:
 *   pose -> sensory frame -> brain step -> decoded motor frame -> body -> zone/dwell/timeout
 * During warm-up the brain runs with no input and the fly does not move. Every tick is recorded.
 * Rendering reads snapshots of this; it never drives time or decides anything.
 */
import type { BrainAdapter, MotorFrame } from "../brain/adapter.ts";
import { subSeed } from "../brain/rng.ts";
import type { SimConfig } from "./config.ts";
import { Decision, type Verdict } from "./decision.ts";
import { move, sense, type Pose, type Target } from "./geometry.ts";

export type TickRecord = {
  tick: number;
  /** LC10a drive [left, right] */
  input: [number, number];
  motor: MotorFrame;
  /** pose after the tick */
  pose: [number, number, number];
};

export type EngineResult =
  | { status: "running" }
  | { status: "selected"; selectedRestaurantId: string; simTimeS: number }
  | { status: "no-choice"; simTimeS: number; reason: string }
  | { status: "error"; simTimeS: number; reason: string };

export class Engine {
  readonly config: SimConfig;
  readonly targets: Target[];
  readonly adapter: BrainAdapter;
  readonly decision: Decision;
  readonly records: TickRecord[] = [];
  pose: Pose;
  tick = 0;
  simTimeS = 0;
  lastMotor: MotorFrame | null = null;
  result: EngineResult = { status: "running" };
  private readonly warmupTicks: number;

  constructor(config: SimConfig, targets: Target[], adapter: BrainAdapter, seed: number) {
    this.config = config;
    this.targets = targets;
    this.adapter = adapter;
    this.decision = new Decision(targets, config);
    this.pose = { ...config.start };
    this.warmupTicks = Math.round(config.warmupS / config.dt);
    adapter.reset(subSeed(seed, "brain"));
  }

  get warmingUp(): boolean {
    return this.tick < this.warmupTicks;
  }

  get done(): boolean {
    return this.result.status !== "running";
  }

  step(): EngineResult {
    if (this.done) return this.result;
    const warm = this.warmingUp;
    const input = warm ? { left: 0, right: 0 } : sense(this.pose, this.targets, this.config);
    const motor = this.adapter.step({ tick: this.tick, targetLeft: input.left, targetRight: input.right });
    if (!motor.valid || motor.tick !== this.tick) {
      this.result = { status: "error", simTimeS: this.simTimeS, reason: `invalid brain output at tick ${this.tick}` };
      return this.result;
    }
    this.lastMotor = motor;
    if (!warm) {
      const c = this.config;
      const speed = c.locomotion === "neural" ? Math.max(0, c.moveGain * (motor.forward - motor.backward)) : c.speed;
      this.pose = move(this.pose, motor.turn, speed, c);
      this.simTimeS = (this.tick + 1 - this.warmupTicks) * c.dt;
    }
    this.records.push({
      tick: this.tick,
      input: [input.left, input.right],
      motor,
      pose: [this.pose.x, this.pose.z, this.pose.heading],
    });
    this.tick++;
    if (!warm) this.result = toResult(this.decision.update(this.pose.x, this.pose.z, this.simTimeS), this.simTimeS);
    return this.result;
  }

  abort(reason: string, status: "no-choice" | "error" = "no-choice"): void {
    if (!this.done) this.result = { status, simTimeS: this.simTimeS, reason };
  }
}

function toResult(v: Verdict, simTimeS: number): EngineResult {
  if (v.kind === "selected") return { status: "selected", selectedRestaurantId: v.id, simTimeS };
  if (v.kind === "no-choice") return { status: "no-choice", simTimeS, reason: "timeout" };
  return { status: "running" };
}
