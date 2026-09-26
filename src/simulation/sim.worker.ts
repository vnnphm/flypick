/**
 * Runs the authoritative simulation off the main thread: live brain + body + decision, or the same
 * engine driven by a replay or mock adapter. Paced to real time (one 20 ms step per 20 ms of wall
 * clock); if the machine falls behind, simulated time slows down instead of skipping neural steps.
 */
import { ConnectomeAdapter, MockAdapter, ReplayAdapter, type BrainAdapter } from "../brain/adapter.ts";
import { loadModel } from "../brain/loadModel.ts";
import { Engine } from "./engine.ts";
import { buildLog } from "./recorder.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

const ctx = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const post = (m: FromWorker) => ctx.postMessage(m);

let live: ConnectomeAdapter | null = null;
let current: { runId: string; timer: ReturnType<typeof setTimeout> | null } | null = null;

async function load(msg: Extract<ToWorker, { type: "load" }>) {
  if (live) {
    post({ type: "loaded", info: live.info, groupSizes: live.groupSizes() });
    return;
  }
  const { meta, weights } = await loadModel(msg.base, (text) => post({ type: "progress", text }));
  live = new ConnectomeAdapter(meta, weights, msg.config, msg.model);
  post({ type: "loaded", info: live.info, groupSizes: live.groupSizes() });
}

function start(msg: Extract<ToWorker, { type: "start" }>) {
  stop();
  let adapter: BrainAdapter;
  if (msg.mode === "live") {
    if (!live) throw new Error("the brain is not loaded");
    adapter = live;
  } else if (msg.mode === "replay") {
    if (!msg.replay) throw new Error("no recorded run to replay");
    adapter = new ReplayAdapter(msg.replay.ticks.map((t) => t.motor), msg.replay.runtime);
  } else {
    adapter = new MockAdapter(msg.config.dt);
  }
  const engine = new Engine(msg.config, msg.targets, adapter, msg.seed);
  const run = { runId: msg.runId, timer: null as ReturnType<typeof setTimeout> | null };
  current = run;
  const dtMs = msg.config.dt * 1000;
  const t0 = performance.now();
  let lastFrame = 0;

  const loop = () => {
    if (current !== run) return;
    const now = performance.now();
    // catch up to wall clock, but never more than 5 steps per slice so frames keep flowing
    const due = Math.min(engine.tick + 5, Math.floor((now - t0) / dtMs) + 1);
    while (engine.tick < due && !engine.done) engine.step();
    const wallS = (performance.now() - t0) / 1000;
    if (!engine.done && wallS > msg.config.wallAbortS) {
      engine.abort(`the simulation ran too slowly (${engine.simTimeS.toFixed(1)} simulated s in ${wallS.toFixed(0)} wall s)`);
    }
    if (engine.done || now - lastFrame >= 30) {
      lastFrame = now;
      post({
        type: "frame",
        runId: run.runId,
        tick: engine.tick,
        warmingUp: engine.warmingUp,
        simTimeS: engine.simTimeS,
        pose: { ...engine.pose },
        dwell: { ...engine.decision.dwell },
        motor: engine.lastMotor ? { turn: engine.lastMotor.turn, ratesHz: engine.lastMotor.ratesHz } : null,
        stepMs: adapter instanceof ConnectomeAdapter ? adapter.stepMs : null,
        simSpeed: wallS > 0 ? (engine.tick * msg.config.dt) / wallS : 1,
      });
    }
    if (engine.done) {
      current = null;
      const log = buildLog({
        runId: run.runId, mode: msg.mode, engine, seed: msg.seed, menus: msg.menus,
        stepMs: adapter instanceof ConnectomeAdapter ? adapter.stepMs : null,
        environment: typeof navigator !== "undefined" ? navigator.userAgent : "worker",
      });
      post({ type: "done", runId: run.runId, result: engine.result, log });
      return;
    }
    const nextDue = t0 + (engine.tick) * dtMs;
    run.timer = setTimeout(loop, Math.max(0, nextDue - performance.now()));
  };
  loop();
}

function stop(runId?: string) {
  if (!current || (runId && current.runId !== runId)) return;
  if (current.timer) clearTimeout(current.timer);
  current = null;
}

ctx.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") load(msg).catch((err) => post({ type: "error", runId: null, text: String(err instanceof Error ? err.message : err) }));
    else if (msg.type === "start") start(msg);
    else if (msg.type === "stop") stop(msg.runId);
  } catch (err) {
    post({ type: "error", runId: msg.type === "load" ? null : msg.runId, text: String(err instanceof Error ? err.message : err) });
  }
};
