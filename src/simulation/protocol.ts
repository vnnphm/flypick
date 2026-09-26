/** Messages between the controller (main thread) and sim.worker.ts. */
import type { AdapterInfo } from "../brain/adapter.ts";
import type { RestaurantSnapshot } from "../contracts.ts";
import type { SimConfig } from "./config.ts";
import type { EngineResult } from "./engine.ts";
import type { Target } from "./geometry.ts";
import type { RunLog } from "./recorder.ts";

export type ToWorker =
  | { type: "load"; base: string; config: SimConfig; model: { modelId: string; revision: string } }
  | {
      type: "start"; runId: string; mode: "live" | "mock" | "replay"; seed: number; config: SimConfig;
      targets: Target[]; menus: RestaurantSnapshot[]; replay: RunLog | null;
    }
  | { type: "stop"; runId: string };

export type Frame = {
  type: "frame";
  runId: string;
  tick: number;
  warmingUp: boolean;
  simTimeS: number;
  pose: { x: number; z: number; heading: number };
  dwell: Record<string, number>;
  motor: { turn: number; ratesHz: Record<string, number> } | null;
  stepMs: number | null;
  simSpeed: number;
};

export type FromWorker =
  | { type: "progress"; text: string }
  | { type: "loaded"; info: AdapterInfo; groupSizes: Record<string, number> }
  | Frame
  | { type: "done"; runId: string; result: EngineResult; log: RunLog }
  | { type: "error"; runId: string | null; text: string };

/** Only messages for the current run may touch state; late replies from a reset run are dropped. */
export function isCurrent(msg: FromWorker, currentRunId: string | null): boolean {
  if (msg.type === "frame" || msg.type === "done") return msg.runId === currentRunId;
  if (msg.type === "error") return msg.runId === null || msg.runId === currentRunId;
  return true;
}
