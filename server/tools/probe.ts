/**
 * Steering probes on the real connectome: neutral, left-only, right-only and equal LC10a drive.
 * Measures DNa02 L - R through the same adapter the app uses, over several brain seeds, and saves
 * the result. The decoder's steering sign and scale are chosen from this, not from any restaurant.
 *
 *   npm run probe
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, CONNECTOME } from "../../src/simulation/config.ts";
import { connectomeAdapter } from "../model.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../src/data/fixtures/probes/steering.json");
const SEEDS = Number(process.env.PROBE_SEEDS ?? 6);
const WARM = 50, SETTLE = 25, MEASURE = 100;
const DRIVES = [0.3, 0.6, 0.8];

const t0 = performance.now();
// the probe measures raw responses above the app's input cap too, so it lifts the cap
const adapter = connectomeAdapter({ ...CONFIG, chaseCap: 1 });
console.log(`model loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s; groups ${JSON.stringify(adapter.groupSizes())}`);

type Row = { condition: string; drive: number; left: number; right: number; diffHz: number[]; meanDiffHz: number; sdHz: number;
  turn: number[]; meanTurn: number; dna02L: number; dna02R: number; dng100: number; mdn: number };

function trial(left: number, right: number, seed: number) {
  adapter.reset(seed);
  let tick = 0;
  for (let i = 0; i < WARM; i++) adapter.step({ tick: tick++, targetLeft: 0, targetRight: 0 });
  for (let i = 0; i < SETTLE; i++) adapter.step({ tick: tick++, targetLeft: left, targetRight: right });
  let L = 0, R = 0, turn = 0, fwd = 0, back = 0;
  for (let i = 0; i < MEASURE; i++) {
    const m = adapter.step({ tick: tick++, targetLeft: left, targetRight: right });
    L += m.ratesHz["DNa02 L"]; R += m.ratesHz["DNa02 R"]; turn += m.turn;
    fwd += (m.ratesHz["DNg100 L"] + m.ratesHz["DNg100 R"]) / 2;
    back += (m.ratesHz["MDN L"] + m.ratesHz["MDN R"]) / 2;
  }
  return { L: L / MEASURE, R: R / MEASURE, turn: turn / MEASURE, fwd: fwd / MEASURE, back: back / MEASURE };
}

const conditions: [string, number, number, number][] = [["neutral", 0, 0, 0]];
for (const d of DRIVES) conditions.push(["left", d, d, 0], ["right", d, 0, d], ["both", d, d, d]);

const rows: Row[] = [];
for (const [condition, drive, left, right] of conditions) {
  const res = Array.from({ length: SEEDS }, (_, s) => trial(left, right, 1000 + s));
  const diff = res.map((r) => r.L - r.R);
  const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
  const sd = Math.sqrt(diff.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, diff.length - 1));
  const avg = (f: (r: (typeof res)[number]) => number) => res.reduce((a, r) => a + f(r), 0) / res.length;
  const row: Row = { condition, drive, left, right, diffHz: diff.map((x) => +x.toFixed(3)), meanDiffHz: +mean.toFixed(3), sdHz: +sd.toFixed(3),
    turn: res.map((r) => +r.turn.toFixed(3)), meanTurn: +avg((r) => r.turn).toFixed(3),
    dna02L: +avg((r) => r.L).toFixed(3), dna02R: +avg((r) => r.R).toFixed(3), dng100: +avg((r) => r.fwd).toFixed(3), mdn: +avg((r) => r.back).toFixed(3) };
  rows.push(row);
  console.log(`${condition.padEnd(8)} drive ${drive.toFixed(1)} | DNa02 L ${row.dna02L.toFixed(2)} R ${row.dna02R.toFixed(2)} Hz | L-R ${mean >= 0 ? "+" : ""}${mean.toFixed(2)} ± ${sd.toFixed(2)} Hz | turn ${row.meanTurn.toFixed(3)} | DNg100 ${row.dng100.toFixed(2)} MDN ${row.mdn.toFixed(2)} Hz`);
}

const at = (c: string, d: number) => rows.find((r) => r.condition === c && r.drive === d)!;
const verdict = DRIVES.map((d) => ({
  drive: d,
  leftMinusRightHz: +(at("left", d).meanDiffHz - at("right", d).meanDiffHz).toFixed(3),
  opposite: Math.sign(at("left", d).meanDiffHz) === -Math.sign(at("right", d).meanDiffHz) && at("left", d).meanDiffHz !== 0,
  // with steeringSign +1 a left target should give a negative (leftward) turn
  leftTurnsLeft: at("left", d).meanTurn < 0,
  rightTurnsRight: at("right", d).meanTurn > 0,
}));
console.log(JSON.stringify(verdict));
// per-side decoder gains: single-side responses at 0.6 V, normalized to their mean
const gl = at("left", 0.6).meanDiffHz, gr = -at("right", 0.6).meanDiffHz;
const gains = { dna02GainL: +(gl / ((gl + gr) / 2)).toFixed(3), dna02GainR: +(gr / ((gl + gr) / 2)).toFixed(3) };
console.log(`suggested decoder gains ${JSON.stringify(gains)} (config: ${CONFIG.dna02GainL}, ${CONFIG.dna02GainR})`);
console.log(`ms/step ${adapter.stepMs.toFixed(1)}; total ${((performance.now() - t0) / 1000).toFixed(0)} s`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  createdAt: new Date().toISOString(),
  model: { id: CONNECTOME.modelId, revision: CONNECTOME.revision },
  settings: { seeds: SEEDS, warmSteps: WARM, settleSteps: SETTLE, measureSteps: MEASURE, dt: CONFIG.dt, rateTau: CONFIG.rateTau,
    input: "LC10a L/R voltage per step (app input cap lifted for the probe)", decoder: { turnDeadHz: CONFIG.turnDeadHz, turnFullHz: CONFIG.turnFullHz, steeringSign: CONFIG.steeringSign, dna02GainL: CONFIG.dna02GainL, dna02GainR: CONFIG.dna02GainR } },
  groupSizes: adapter.groupSizes(),
  stepMs: +adapter.stepMs.toFixed(2),
  rows,
  verdict,
  suggestedGains: gains,
}, null, 2) + "\n");
console.log(`saved ${OUT}`);
