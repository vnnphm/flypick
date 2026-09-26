import type { SimulationController, SimulationDetails, SimulationState } from '../contracts.ts';

// Display choices only: 4 Hz decoder range / ~3.58 Hz probe response, rounded up.
export const RATE_SCALE_HZ = 5;
export const NEUTRAL_BAND = 0.05;
export const STALE_MS = 2000; // Twenty missed 10 Hz updates; never advances simulation time.
export type DetailsSource = SimulationController & {
  subscribeDetails?: (listener: (details: SimulationDetails) => void) => () => void;
};
export type BrainReading = {
  state?: SimulationState;
  details?: SimulationDetails;
  ambient: boolean;
  stale: boolean;
  available: boolean;
};

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function fraction(value: unknown, maximum: unknown): number | null {
  const n = finite(value), max = finite(maximum);
  return n === null || max === null || max <= 0 ? null : Math.min(1, Math.max(0, n / max));
}
export function steering(value: unknown) {
  const n = finite(value);
  return n === null ? null : {
    value: n, position: (Math.max(-1, Math.min(1, n)) + 1) * 50,
    direction: Math.abs(n) <= NEUTRAL_BAND ? 'Straight' : n < 0 ? 'Left' : 'Right',
  };
}

export function presentation(reading: BrainReading) {
  const { state, details, ambient, stale, available } = reading;
  const final = state?.status === 'selected' || state?.status === 'no-choice';
  const mode = state?.mode === 'mock' ? 'Mock / sample data' : state?.mode === 'replay' ? 'Recorded / replay data' : 'Live telemetry';
  let status = 'Waiting for state';
  if (state) {
    if (ambient) status = 'Ambient animation — brain not controlling movement';
    else if (state.status === 'loading') status = details?.runtime.progress || state.message || 'Loading';
    else if (state.status === 'error') status = state.message || 'Run interrupted';
    else if (final) status = details ? 'Final reading' : 'Final reading · unavailable';
    else if (!available) status = 'Telemetry unavailable';
    else if (state.status === 'ready') status = 'Ready · waiting for run';
    else if (stale || !details) status = 'Waiting for telemetry';
    else status = 'Receiving telemetry';
  }
  const show = !ambient && !stale && (state?.status === 'running' || final);
  return { mode, status, final, motor: show ? details?.motor : null,
    timing: !ambient && !stale && state?.status !== 'loading' && state?.status !== 'error' ? details : undefined,
    runtime: details?.runtime,
    performance: show && details?.motor ? details : undefined };
}

/** The app forwards its existing state subscription; only details are subscribed here. */
export function observeBrain(controller: DetailsSource, render: (reading: BrainReading) => void) {
  let state: SimulationState | undefined;
  let details: SimulationDetails | undefined;
  let pending: SimulationDetails | undefined;
  const retired = new Set<string>();
  let ambient = false, stale = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const available = typeof controller.subscribeDetails === 'function';
  const emit = () => { if (!disposed) render({ state, details, ambient, stale, available }); };
  function cancel() { clearTimeout(timer); timer = undefined; }
  function arm() {
    cancel();
    stale = false;
    if (available && state?.status === 'running' && !ambient) {
      timer = setTimeout(() => { stale = true; emit(); }, STALE_MS);
    }
  }
  const unsubscribe = controller.subscribeDetails?.(next => {
    if (disposed || retired.has(next.runId)) return;
    if (next.runId !== state?.runId || next.mode !== state.mode) {
      pending = next; // prepare() publishes the new run's details before its state.
      return;
    }
    details = next;
    arm();
    emit();
  });
  return {
    update(next: SimulationState) {
      if (disposed) return;
      const changedRun = next.runId !== state?.runId || next.mode !== state?.mode;
      const changedStatus = next.status !== state?.status;
      const changedMessage = next.status === 'loading' || next.status === 'error' ? next.message !== state?.message : false;
      if (changedRun) {
        if (state && state.runId !== next.runId) retired.add(state.runId);
        details = pending?.runId === next.runId && pending.mode === next.mode ? pending : undefined;
        pending = undefined;
      }
      state = next;
      if (changedRun || changedStatus) arm();
      if (changedRun || changedStatus || changedMessage) emit();
    },
    setAmbient(next: boolean) {
      if (disposed || ambient === next) return;
      ambient = next;
      arm();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      unsubscribe?.();
      retired.clear();
      state = details = pending = undefined;
    },
  };
}
