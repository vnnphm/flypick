/**
 * The SimulationController the UI mounts. It owns run lifecycle and publishes read-only snapshots;
 * the worker owns the authoritative simulation. Modes are chosen explicitly and never switch on
 * their own:
 *   live    full connectome + menus (live Firecrawl, or the labeled saved captures)
 *   replay  a genuine recorded live run, replayed through the same engine
 *   mock    synthetic steering for UI work, labeled as such
 */
import type { RestaurantSnapshot, SimulationController, SimulationDetails, SimulationState } from "../contracts.ts";
import { SALIENCE_BASE } from "../data/encoder.ts";
import { cachedCapture, loadMenus } from "../data/menus.ts";
import { RESTAURANTS } from "../data/restaurants.ts";
import { toSnapshot } from "../data/snapshot.ts";
import { CONFIG, CONNECTOME, type SimConfig } from "./config.ts";
import { placeTargets, type Target } from "./geometry.ts";
import { isCurrent, type FromWorker, type ToWorker } from "./protocol.ts";
import type { RunLog } from "./recorder.ts";

export type ControllerOptions = {
  mode: "live" | "mock" | "replay";
  menuSource: "live" | "cached";
};

const REPLAYS = import.meta.glob<RunLog>("../data/fixtures/runs/*.json", { import: "default" });

const randomU32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const TRAIL_MAX = 600;

export type FlyPickController = SimulationController & {
  subscribeDetails(listener: (details: SimulationDetails) => void): () => void;
  /** Stop the worker (hot reload, page teardown). */
  dispose(): void;
};

export function createSimulationController(options: ControllerOptions): FlyPickController {
  const { mode } = options;
  const config: SimConfig = structuredClone(CONFIG);
  const listeners = new Set<(s: SimulationState) => void>();
  const detailListeners = new Set<(d: SimulationDetails) => void>();
  let worker: Worker | null = null;
  let loaded: Promise<void> | null = null;
  let menus: RestaurantSnapshot[] = [];
  let replay: RunLog | null = null;
  let initError: string | null = null;
  let seed = 0;
  let targets: Target[] = [];
  let dirtyDetails = false;

  let state: SimulationState = {
    runId: newRunId(), mode, status: "loading", fly: { ...config.start }, restaurants: [],
    selectedRestaurantId: null, message: "Getting ready.",
  };
  let details: SimulationDetails = {
    runId: state.runId, mode, menuSource: mode === "mock" ? null : options.menuSource, locomotion: config.locomotion,
    simTimeS: 0, timeoutS: config.timeoutS, dwellRequiredS: config.dwellS, dwell: {}, trail: [], menus: [],
    runtime: { label: runtimeLabel(), modelId: null, revision: null, neurons: null, synapses: null, stepMs: null, progress: null },
    motor: null, simSpeed: 1, log: null,
  };

  function newRunId() {
    return `${mode}-${Date.now().toString(36)}-${randomU32().toString(36).slice(0, 4)}`;
  }

  function runtimeLabel() {
    if (mode === "mock") return "MOCK: synthetic steering, not a brain";
    if (mode === "replay") return "Recorded run: motor output from a genuine full-connectome run";
    return "Full fly connectome (MaleCNS v1.0, 166,700 neurons) in a Web Worker";
  }

  function publish(patch: Partial<SimulationState>) {
    state = { ...state, ...patch };
    const snapshot = structuredClone(state);
    listeners.forEach((l) => l(snapshot));
  }

  function publishDetails(patch: Partial<SimulationDetails> = {}) {
    details = { ...details, ...patch };
    dirtyDetails = false;
    const snapshot = structuredClone(details);
    detailListeners.forEach((l) => l(snapshot));
  }

  function progress(text: string) {
    publishDetails({ runtime: { ...details.runtime, progress: text } });
    publish({ status: "loading", message: text });
  }

  function getWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      fail(`The simulation worker stopped: ${e.message || "unknown error"}`);
    };
    return worker;
  }

  function send(msg: ToWorker) {
    getWorker().postMessage(msg);
  }

  let resolveLoaded: (() => void) | null = null;
  let rejectLoaded: ((e: Error) => void) | null = null;

  function onWorker(msg: FromWorker) {
    if (!isCurrent(msg, state.runId)) return;
    switch (msg.type) {
      case "progress":
        progress(msg.text);
        break;
      case "loaded":
        publishDetails({ runtime: { ...details.runtime, modelId: msg.info.modelId, revision: msg.info.revision,
          neurons: msg.info.neurons, synapses: msg.info.synapses, progress: null } });
        resolveLoaded?.();
        break;
      case "frame": {
        if (state.status !== "running") return;
        const last = details.trail.at(-1);
        const trail = !msg.warmingUp && (!last || last.x !== msg.pose.x || last.z !== msg.pose.z)
          ? [...details.trail, { x: msg.pose.x, z: msg.pose.z }].slice(-TRAIL_MAX) : details.trail;
        details = { ...details, simTimeS: msg.simTimeS, dwell: msg.dwell, trail, motor: msg.motor,
          simSpeed: msg.simSpeed, runtime: { ...details.runtime, stepMs: msg.stepMs } };
        dirtyDetails = true;
        publish({
          fly: msg.pose,
          message: msg.warmingUp ? "The brain is settling before the fly sets off." : runningMessage(),
        });
        break;
      }
      case "done": {
        publishDetails({ log: msg.log });
        const r = msg.result;
        if (r.status === "selected") {
          const name = targets.find((t) => t.id === r.selectedRestaurantId)?.name ?? r.selectedRestaurantId;
          publish({ status: "selected", selectedRestaurantId: r.selectedRestaurantId,
            message: `The fly stayed in ${name}’s zone for ${config.dwellS} simulated second after ${(r.simTimeS - config.dwellS).toFixed(1)} s.` });
        } else if (r.status === "no-choice") {
          publish({ status: "no-choice", selectedRestaurantId: null,
            message: r.reason === "timeout"
              ? `${config.timeoutS} simulated seconds passed without the fly settling in either zone.`
              : `No choice: ${r.reason}.` });
        } else if (r.status === "error") {
          publish({ status: "error", selectedRestaurantId: null, message: `No choice was made: ${r.reason}.` });
        }
        if (mode === "live") saveLog(msg.log);
        break;
      }
      case "error":
        if (msg.runId === null && rejectLoaded) rejectLoaded(new Error(msg.text));
        else fail(msg.text);
        break;
    }
  }

  function runningMessage() {
    if (mode === "mock") return "Mock steering (synthetic, not a brain).";
    if (mode === "replay") return "Replaying a recorded run. No new decision is being made.";
    return "The fly brain is steering. Walking speed is constant.";
  }

  function fail(text: string) {
    if (state.status === "selected" || state.status === "no-choice") return;
    publish({ status: "error", selectedRestaurantId: null, message: text });
  }

  function saveLog(log: RunLog) {
    fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log) })
      .catch((err) => console.warn("run log not saved", err));
  }

  async function loadBrain(): Promise<void> {
    if (!loaded) {
      loaded = new Promise<void>((resolve, reject) => {
        resolveLoaded = resolve;
        rejectLoaded = reject;
      });
      send({ type: "load", base: CONNECTOME.base, config, model: { modelId: CONNECTOME.modelId, revision: CONNECTOME.revision } });
      loaded.catch(() => { loaded = null; });
    }
    return loaded;
  }

  async function init(): Promise<void> {
    initError = null;
    try {
      if (mode === "replay") {
        progress("Loading the recorded run.");
        const entries = Object.entries(REPLAYS).sort(([a], [b]) => b.localeCompare(a));
        if (!entries.length) throw new Error("No recorded run is available yet (npm run record).");
        replay = await entries[0][1]();
        menus = replay.menus;
      } else if (mode === "mock") {
        menus = RESTAURANTS.map((r) => {
          const c = cachedCapture(r.id);
          return c ? toSnapshot(c, "cached") : null;
        }).filter((m): m is RestaurantSnapshot => m !== null);
      } else {
        progress(options.menuSource === "cached" ? "Opening the saved Firecrawl menus." : "Reading both menus with Firecrawl.");
        menus = await loadMenus(options.menuSource);
        publishDetails({ menus });
        progress("Preparing the fly brain.");
        await loadBrain();
      }
      publishDetails({ menus });
      prepare();
    } catch (err) {
      initError = err instanceof Error ? err.message : String(err);
      publish({ status: "error", restaurants: [], message: initError });
    }
  }

  /** A fresh ready state: new run id, new brain seed, new independent side draw. */
  function prepare() {
    const runId = newRunId();
    let runConfig = config;
    if (replay) {
      seed = replay.seed;
      targets = replay.targets;
      runConfig = replay.config;
    } else {
      seed = randomU32();
      const swap = (randomU32() & 1) === 1;
      const byId = new Map(menus.map((m) => [m.id, m]));
      targets = placeTargets(
        RESTAURANTS.map((r) => ({ id: r.id, name: r.name, salience: mode === "mock" ? (byId.get(r.id)?.salience ?? SALIENCE_BASE) : byId.get(r.id)!.salience })),
        swap, config);
    }
    publishDetails({ runId, simTimeS: 0, dwell: Object.fromEntries(targets.map((t) => [t.id, 0])), trail: [], motor: null, log: null,
      timeoutS: runConfig.timeoutS, dwellRequiredS: runConfig.dwellS });
    publish({
      runId, status: "ready", fly: { ...runConfig.start }, selectedRestaurantId: null,
      restaurants: targets.map(({ id, name, x, z, radius }) => ({ id, name, x, z, radius })),
      message: readyMessage(),
    });
  }

  function readyMessage() {
    if (mode === "mock") return "Mock mode: synthetic steering for interface work. The fly brain is not running.";
    if (mode === "replay") return `Recorded run from ${replay?.createdAt.slice(0, 10)}. Replays the original brain output; no new decision is made.`;
    if (options.menuSource === "cached") {
      const when = menus.map((m) => m.fetchedAt.slice(0, 10)).sort()[0];
      return `Menus from a saved Firecrawl capture (${when}). The fly brain is loaded.`;
    }
    return "Menus read live with Firecrawl. The fly brain is loaded.";
  }

  // throttle detail updates from frames to ~10 Hz
  const detailTimer = setInterval(() => { if (dirtyDetails) publishDetails(); }, 100);

  void init();

  return {
    async start() {
      if (state.status !== "ready") return;
      publish({ status: "running", message: mode === "live" ? "The brain is settling before the fly sets off." : runningMessage() });
      send({ type: "start", runId: state.runId, mode, seed, config: replay ? replay.config : config, targets, menus, replay });
    },
    async reset() {
      send({ type: "stop", runId: state.runId });
      if (initError || state.status === "loading") {
        if (state.status !== "loading") await init();
        return;
      }
      prepare();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(structuredClone(state));
      return () => { listeners.delete(listener); };
    },
    subscribeDetails(listener) {
      detailListeners.add(listener);
      listener(structuredClone(details));
      return () => { detailListeners.delete(listener); };
    },
    dispose() {
      clearInterval(detailTimer);
      worker?.terminate();
      worker = null;
      listeners.clear();
      detailListeners.clear();
    },
  };
}
