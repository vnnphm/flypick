/**
 * Shared contract between the brain/data side and the visuals side (maintained by the
 * brain/data owner; see .agents/flypick-team-split.md).
 *
 * World units: the ground is the X/Z plane, Y is visual height. Heading is in radians; zero faces
 * +Z and positive heading turns toward +X.
 */

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

// ---- additive types --------------------------------------------------------------------------

/** One menu item as Firecrawl extracted it. Only explicitly stated facts. */
export type MenuItem = {
  name: string;
  description: string | null;
  priceText: string | null;
  ingredients: string[];
  evidenceText: string;
};

export type ExtractedRestaurant = {
  name: string | null;
  menu: MenuItem[];
};

/** Playful designed menu features in [0, 1]; not aromas, not a quality rating. */
export type MenuCues = { sweet: number; fruit: number; fermented: number };

export type RestaurantSnapshot = {
  id: string; // assigned by this app (a place id, or an allowlist id)
  displayName: string; // shown on cards
  address: string | null;
  sourceUrl: string; // the menu page that was actually requested
  fetchedAt: string; // ISO time of the Firecrawl response
  mode: "live" | "cached";
  extraction: ExtractedRestaurant;
  cues: MenuCues;
  /** Fixed combination of the cues; scales this target's visual (LC10a) drive. */
  salience: number;
  encoderVersion: string;
};

/** A city (or the area around the user's location) that restaurant search is limited to. */
export type CityResult = {
  id: string;
  name: string;
  label: string; // e.g. "San Francisco, California, United States"
  lat: number;
  lon: number;
  /** [minLon, minLat, maxLon, maxLat] when known */
  bbox: [number, number, number, number] | null;
};

/** One restaurant search result (OpenStreetMap data via the app's server). */
export type PlaceResult = {
  id: string; // OSM type + id, e.g. "N3458525148"
  name: string;
  address: string;
  lat: number;
  lon: number;
  kind: string; // restaurant, cafe, fast_food, ...
};

/** One of the two restaurant choices while it is being picked and its menu read. */
export type SlotState = {
  slot: 0 | 1;
  place: PlaceResult | null;
  status: 'empty' | 'reading' | 'ready' | 'error';
  /** reading progress or why the menu could not be read */
  message: string | null;
  menu: RestaurantSnapshot | null;
};

/** Extra telemetry for the UI. Rendering may read it; it never decides anything. */
export type SimulationDetails = {
  runId: string;
  mode: SimulationState["mode"];
  menuSource: 'search' | 'live' | 'cached' | null;
  locomotion: "constant-speed-neural-steering" | "neural";
  simTimeS: number;
  timeoutS: number;
  dwellRequiredS: number;
  /** seconds of continuous occupancy per restaurant id */
  dwell: Record<string, number>;
  /** authoritative positions, oldest first, for the trail */
  trail: { x: number; z: number }[];
  menus: RestaurantSnapshot[];
  /** the two searchable choices (live search mode); empty in the other modes */
  slots: SlotState[];
  runtime: {
    label: string; // e.g. "Full connectome (MaleCNS v1.0) in a Web Worker"
    modelId: string | null;
    revision: string | null;
    neurons: number | null;
    synapses: number | null;
    stepMs: number | null; // wall time per neural step
    progress: string | null; // loading progress text
  };
  motor: {
    turn: number; // [-1, 1], negative means the fly's left
    ratesHz: Record<string, number>;
  } | null;
  /** simulated seconds per wall-clock second */
  simSpeed: number;
  /** run log of a finished run, for download */
  log: unknown | null;
};
