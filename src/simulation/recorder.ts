/**
 * Run logs: everything needed to audit or replay a run. Replaying feeds the recorded motor frames
 * back through the same Engine (ReplayAdapter) and must reproduce the same poses and decision.
 */
import { ReplayAdapter, type AdapterInfo } from "../brain/adapter.ts";
import type { RestaurantSnapshot } from "../contracts.ts";
import type { SimConfig } from "./config.ts";
import { Engine, type EngineResult, type TickRecord } from "./engine.ts";
import type { Target } from "./geometry.ts";

export type RunLog = {
  format: "flypick-run-v1";
  runId: string;
  mode: "live" | "mock" | "replay";
  createdAt: string;
  runtime: AdapterInfo & { stepMs: number | null; environment: string };
  config: SimConfig;
  seed: number;
  menus: RestaurantSnapshot[];
  targets: Target[];
  ticks: TickRecord[];
  result: EngineResult;
};

export function buildLog(args: {
  runId: string; mode: RunLog["mode"]; engine: Engine; seed: number; menus: RestaurantSnapshot[];
  stepMs: number | null; environment: string;
}): RunLog {
  const { engine } = args;
  return {
    format: "flypick-run-v1",
    runId: args.runId,
    mode: args.mode,
    createdAt: new Date().toISOString(),
    runtime: { ...engine.adapter.info, stepMs: args.stepMs, environment: args.environment },
    config: structuredClone(engine.config),
    seed: args.seed,
    menus: args.menus,
    targets: engine.targets,
    ticks: engine.records,
    result: engine.result,
  };
}

/** A fresh engine that replays a log's motor frames with the log's own frozen config and geometry. */
export function replayEngine(log: RunLog): Engine {
  const adapter = new ReplayAdapter(log.ticks.map((t) => t.motor), { modelId: log.runtime.modelId, revision: log.runtime.revision });
  return new Engine(log.config, log.targets, adapter, log.seed);
}

/** Run an engine to completion without pacing (Node tools, replay checks). */
export function runToEnd(engine: Engine, maxTicks = 100_000): EngineResult {
  for (let i = 0; i < maxTicks && !engine.done; i++) engine.step();
  return engine.result;
}
