export interface RestaurantData {
  id: string;
  name: string;
  sourceUrl: string;
  menu: { name: string; description: string | null }[];
}

/** Proposed app contract; no neural runtime is connected yet. */
export interface BrainMotorOutput {
  tick: number;
  turn: number; // [-1, 1]; negative means left
  forward: number; // [0, 1]
  backward: number; // [0, 1]
  valid: boolean;
}

/** Published by the simulation; visual consumers treat snapshots as read-only. */
export type SimulationState = {
  runId: string;
  mode: 'live' | 'mock' | 'replay';
  status: 'loading' | 'ready' | 'running' | 'selected' | 'no-choice' | 'error';
  fly: { x: number; z: number; heading: number };
  restaurants: { id: string; name: string; x: number; z: number; radius: number }[];
  selectedRestaurantId: string | null;
  message: string | null;
};

export interface SimulationController {
  start(): Promise<void>;
  reset(): Promise<void>;
  /** Immediately publishes current state; returns an unsubscribe function. */
  subscribe(listener: (state: SimulationState) => void): () => void;
}
