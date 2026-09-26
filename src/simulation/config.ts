/**
 * The one configuration for a run: decoder calibration, body gains, sensory falloff, timing, zone
 * geometry and encoder version. A copy is frozen into every run log. Nothing here depends on which
 * restaurant is which; both targets get identical geometry and identical gains.
 */
import { ENCODER_VERSION } from "../data/encoder.ts";

export const CONNECTOME = {
  modelId: "MaleCNS v1.0 via fly.ai flybrain export --web",
  upstream: "https://github.com/alextitonis/fly.ai",
  revision: "40fbeca60e5c16742f20b4c2c067de915b388e66",
  /** where the browser fetches the files; `npm run fetch:connectome` puts them there */
  base: "/connectome/",
};

export const CONFIG = {
  encoderVersion: ENCODER_VERSION,

  // ---- time -------------------------------------------------------------------------------
  /** neural and body step, seconds; must equal the model's dt (checked at load) */
  dt: 0.02,
  /** brain runs with no input before the clock starts, so rates settle */
  warmupS: 1.0,
  dwellS: 1.0,
  timeoutS: 30,
  /** live runs that fall this far behind wall clock are aborted with no choice */
  wallAbortS: 60,

  // ---- arena ------------------------------------------------------------------------------
  arenaRadius: 8,
  start: { x: 0, z: -4, heading: 0 },
  /** two equal zones, mirror images across x = 0, ahead-left and ahead-right of the start */
  zone: { offsetX: 3.2, z: 4, radius: 1.6 },

  // ---- sensory encoding (geometry -> LC10a voltage per step) ----------------------------------
  /**
   * The upstream Vision chase formula, base + gain * angular size, capped; salience scales it.
   * Gain lowered from upstream 1.9 so the drive is not already at the cap from the start pose and
   * distance still matters (tuned with equal, restaurant-free targets: npm run arena).
   */
  chaseBase: 0.08,
  chaseGain: 0.6,
  /**
   * Upstream caps at 0.8, but the bilateral probe (equal drive both sides) is balanced only up to
   * 0.6 (L-R +0.03 Hz at 0.6, +0.75 Hz at 0.8), so inputs stay in the balanced range.
   */
  chaseCap: 0.6,
  /** targets further than this off the midline are outside the eye */
  fovHalf: 2.3,
  minDist: 0.8,

  // ---- decoder ----------------------------------------------------------------------------
  /** spike-rate filter time constant, seconds (upstream RATE_TAU) */
  rateTau: 0.18,
  /**
   * |DNa02 L - DNa02 R| below this is treated as no turn. Upstream Wiz uses 1 Hz; that rectifies
   * the larger left-side fluctuations into a steady left turn (12/12 runs to +X with equal targets),
   * so the decoder is linear.
   */
  turnDeadHz: 0,
  /** a difference this far above the deadband is a full turn */
  turnFullHz: 4.0,
  /**
   * +1 if DNa02 L > DNa02 R turns the fly to its anatomical left. Set from the probe results
   * (src/data/fixtures/probes/steering.json), not from which restaurant should win.
   */
  steeringSign: 1,
  /**
   * Per-side DNa02 scale: each side's rate is divided by its gain before L - R. From the
   * single-side probes at 0.6 V (steering.json): left +3.58 Hz, right -2.73 Hz, normalized to their
   * mean. Raw Hz (1/1) sent 27 of 32 equal-target runs to the fly's left; these sent 19 of 32.
   */
  dna02GainL: 1.135,
  dna02GainR: 0.865,
  restHz: 0.6,
  walkFullHz: 10,

  // ---- body -------------------------------------------------------------------------------
  /** DNg100/MDN do not respond to any tested sensory input, so speed is constant (disclosed) */
  locomotion: "constant-speed-neural-steering" as "constant-speed-neural-steering" | "neural",
  speed: 1.0, // world units per second, independent of restaurant data
  /** heading rate at turn = +-1, radians per second */
  turnRate: 1.2,
  /** only used in "neural" locomotion */
  moveGain: 2.0,
};

export type SimConfig = typeof CONFIG;
