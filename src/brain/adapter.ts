/**
 * The app's brain wrapper: sensory frame in, decoded motor frame out, one neural step per call.
 * Three implementations share the interface so the engine has one code path:
 *   ConnectomeAdapter  the full connectome (live)
 *   ReplayAdapter      motor frames recorded from a genuine live run
 *   MockAdapter        synthetic steering for UI development, always labeled "mock"
 *
 * Input: LC10a (the visual target / feature-detector cells) on each side of the fly, as voltage per
 * step. Nothing is injected into descending or motor neurons; the input has to pass through the
 * network. Output: filtered spike rates of fixed descending-neuron groups, decoded with fixed gains.
 */
import { ConnectomeBrain, cells, type ConnectomeMeta, type ConnectomeWeights } from "./connectome.ts";
import { mulberry32 } from "./rng.ts";
import type { SimConfig } from "../simulation/config.ts";

export type SensoryFrame = {
  tick: number;
  /** LC10a drive on the fly's anatomical left / right, voltage per step */
  targetLeft: number;
  targetRight: number;
};

export type MotorFrame = {
  tick: number;
  simTimeMs: number;
  turn: number; // [-1, 1], negative means the fly's left
  forward: number; // [0, 1]
  backward: number; // [0, 1]
  escape: number; // [0, 1], telemetry only
  ratesHz: Record<string, number>;
  valid: boolean;
};

export type AdapterInfo = {
  kind: "connectome" | "replay" | "mock";
  label: string;
  modelId: string | null;
  revision: string | null;
  neurons: number | null;
  synapses: number | null;
  supportedOutputs: string[];
};

export interface BrainAdapter {
  readonly info: AdapterInfo;
  reset(seed: number): void;
  step(input: SensoryFrame): MotorFrame;
}

export const INPUT_TYPE = "LC10a";
export const OUTPUT_TYPES = ["DNa02", "DNg100", "MDN", "DNp01"] as const;

/** Rates -> motor frame. Pure, so replay and checks can use it too. */
export function decode(tick: number, dt: number, ratesHz: Record<string, number>, config: SimConfig): MotorFrame {
  const r = (k: string) => ratesHz[k] ?? 0;
  const diff = r("DNa02 L") / config.dna02GainL - r("DNa02 R") / config.dna02GainR;
  const excess = Math.max(0, Math.abs(diff) - config.turnDeadHz) / config.turnFullHz;
  // DNa02 L above R turns the fly toward its left (steeringSign +1): negative turn.
  const turn = -config.steeringSign * Math.sign(diff) * Math.min(1, excess);
  const above = (hz: number) => Math.min(1, Math.max(0, hz - config.restHz) / config.walkFullHz);
  const values = [diff, ...Object.values(ratesHz)];
  return {
    tick,
    simTimeMs: tick * dt * 1000,
    turn,
    forward: above((r("DNg100 L") + r("DNg100 R")) / 2),
    backward: above((r("MDN L") + r("MDN R")) / 2),
    escape: above((r("DNp01 L") + r("DNp01 R")) / 2),
    ratesHz,
    valid: values.every(Number.isFinite),
  };
}

export class ConnectomeAdapter implements BrainAdapter {
  readonly info: AdapterInfo;
  readonly brain: ConnectomeBrain;
  private readonly inputL: Int32Array;
  private readonly inputR: Int32Array;
  private readonly outputs: [string, Int32Array][];
  private readonly groupOf: Int16Array;
  private readonly hz: Float64Array;
  private readonly count: Float64Array;
  private readonly config: SimConfig;
  private tick = 0;
  stepMs = 0;

  constructor(meta: ConnectomeMeta, weights: ConnectomeWeights, config: SimConfig,
    model: { modelId: string; revision: string }) {
    if (Math.abs(meta.params.dt - config.dt) > 1e-9) {
      throw new Error(`model dt ${meta.params.dt} s does not match config dt ${config.dt} s`);
    }
    this.config = config;
    this.brain = new ConnectomeBrain(weights, meta.params, 1);
    this.inputL = cells(meta, [INPUT_TYPE], "L");
    this.inputR = cells(meta, [INPUT_TYPE], "R");
    if (!this.inputL.length || !this.inputR.length) throw new Error(`no ${INPUT_TYPE} neurons in the model`);
    this.outputs = [];
    for (const type of OUTPUT_TYPES) {
      for (const side of ["L", "R"] as const) {
        const idx = cells(meta, [type], side);
        if (!idx.length) throw new Error(`no ${type} ${side} neurons in the model`);
        this.outputs.push([`${type} ${side}`, idx]);
      }
    }
    this.groupOf = new Int16Array(meta.n).fill(-1);
    this.outputs.forEach(([, idx], g) => { for (const i of idx) this.groupOf[i] = g; });
    this.hz = new Float64Array(this.outputs.length);
    this.count = new Float64Array(this.outputs.length);
    this.info = {
      kind: "connectome",
      label: "Full connectome (MaleCNS v1.0, 166,700 neurons)",
      modelId: model.modelId,
      revision: model.revision,
      neurons: weights.n,
      synapses: weights.nnz,
      supportedOutputs: this.outputs.map(([name]) => name),
    };
  }

  /** neurons per group, for logs */
  groupSizes(): Record<string, number> {
    return Object.fromEntries([
      [`${INPUT_TYPE} L`, this.inputL.length], [`${INPUT_TYPE} R`, this.inputR.length],
      ...this.outputs.map(([name, idx]) => [name, idx.length]),
    ]);
  }

  reset(seed: number): void {
    this.brain.reset(seed);
    this.hz.fill(0);
    this.tick = 0;
  }

  step(input: SensoryFrame): MotorFrame {
    const t0 = performance.now();
    const b = this.brain;
    const cap = this.config.chaseCap;
    const clampIn = (x: number) => (Number.isFinite(x) ? Math.min(cap, Math.max(0, x)) : 0);
    b.stimulate(this.inputL, clampIn(input.targetLeft));
    b.stimulate(this.inputR, clampIn(input.targetRight));
    b.step();
    const dt = this.config.dt;
    const a = Math.exp(-dt / this.config.rateTau);
    this.count.fill(0);
    for (let k = 0; k < b.firedCount; k++) {
      const g = this.groupOf[b.fired[k]];
      if (g >= 0) this.count[g]++;
    }
    const ratesHz: Record<string, number> = {};
    for (let g = 0; g < this.outputs.length; g++) {
      this.hz[g] = a * this.hz[g] + (1 - a) * this.count[g] / (this.outputs[g][1].length * dt);
      ratesHz[this.outputs[g][0]] = this.hz[g];
    }
    this.stepMs += (performance.now() - t0 - this.stepMs) * 0.05;
    return decode(this.tick++, dt, ratesHz, this.config);
  }
}

/** Plays back motor frames from a recorded live run; ignores its input. */
export class ReplayAdapter implements BrainAdapter {
  readonly info: AdapterInfo;
  private readonly frames: MotorFrame[];
  private tick = 0;

  constructor(frames: MotorFrame[], source: { modelId: string | null; revision: string | null }) {
    this.frames = frames;
    this.info = {
      kind: "replay",
      label: "Recorded run replay (motor frames from a genuine full-connectome run)",
      modelId: source.modelId,
      revision: source.revision,
      neurons: null,
      synapses: null,
      supportedOutputs: frames.length ? Object.keys(frames[0].ratesHz) : [],
    };
  }

  reset(): void {
    this.tick = 0;
  }

  step(input: SensoryFrame): MotorFrame {
    const f = this.frames[this.tick++];
    if (!f || f.tick !== input.tick) {
      return { tick: input.tick, simTimeMs: 0, turn: 0, forward: 0, backward: 0, escape: 0, ratesHz: {}, valid: false };
    }
    return f;
  }
}

/** Synthetic steering (smoothed seeded noise) for UI work. Not a brain; never used in live mode. */
export class MockAdapter implements BrainAdapter {
  readonly info: AdapterInfo = {
    kind: "mock",
    label: "MOCK: synthetic steering, not a brain",
    modelId: null,
    revision: null,
    neurons: null,
    synapses: null,
    supportedOutputs: [],
  };
  private rand = mulberry32(1);
  private turn = 0;
  private tick = 0;
  private readonly dt: number;

  constructor(dt: number) {
    this.dt = dt;
  }

  reset(seed: number): void {
    this.rand = mulberry32(seed);
    this.turn = 0;
    this.tick = 0;
  }

  step(): MotorFrame {
    this.turn += (-this.turn * 0.8 + (this.rand() - 0.5) * 6) * this.dt;
    const turn = Math.max(-1, Math.min(1, this.turn));
    return { tick: this.tick, simTimeMs: this.tick++ * this.dt * 1000, turn, forward: 0, backward: 0, escape: 0, ratesHz: {}, valid: true };
  }
}
