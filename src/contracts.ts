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
