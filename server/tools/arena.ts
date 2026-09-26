/**
 * Arena calibration with restaurant-free targets: both zones get the same fixed salience, so any
 * outcome comes from geometry, gains and the brain, never from menus. Reports how often the fly
 * commits, to which side, and how long it takes, over several seeds.
 *
 *   npm run arena [-- seeds=10 salience=0.8]
 */
import { CONFIG } from "../../src/simulation/config.ts";
import { Engine } from "../../src/simulation/engine.ts";
import { placeTargets } from "../../src/simulation/geometry.ts";
import { runToEnd } from "../../src/simulation/recorder.ts";
import { connectomeAdapter } from "../model.ts";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")).map(([k, v]) => [k, Number(v)]));
const SEEDS = args.seeds ?? 10, SALIENCE = args.salience ?? 0.8, FIRST = args.first ?? 2000;
// general, restaurant-free overrides of numeric config fields, e.g. chaseGain=1.2 turnRate=1.5
const config = structuredClone(CONFIG) as Record<string, unknown> & typeof CONFIG;
for (const [k, v] of Object.entries(args)) if (typeof config[k] === "number") config[k] = v;
if (args.zoneZ !== undefined) config.zone.z = args.zoneZ;
if (args.zoneX !== undefined) config.zone.offsetX = args.zoneX;
console.log(JSON.stringify(args));

const adapter = connectomeAdapter(config);
const menus = [{ id: "A", name: "A", salience: args.salienceA ?? SALIENCE }, { id: "B", name: "B", salience: args.salienceB ?? SALIENCE }];
const won: Record<string, number> = { A: 0, B: 0 };
const tally: Record<string, number> = { left: 0, right: 0, "no-choice": 0, error: 0 };
const times: number[] = [];
for (let s = 0; s < SEEDS; s++) {
  const seed = FIRST + s; // brain seed; sides alternate by trial
  const targets = placeTargets(menus, s % 2 === 1, config);
  const engine = new Engine(config, targets, adapter, seed);
  const res = runToEnd(engine);
  let minA = Infinity, minB = Infinity;
  for (const r of engine.records) {
    minA = Math.min(minA, Math.hypot(r.pose[0] - targets[0].x, r.pose[1] - targets[0].z));
    minB = Math.min(minB, Math.hypot(r.pose[0] - targets[1].x, r.pose[1] - targets[1].z));
  }
  const p = engine.pose;
  let label: string = res.status;
  if (res.status === "selected") {
    label = res.selectedRestaurantId === targets[0].id ? "left" : "right";
    times.push(res.simTimeS);
    won[res.selectedRestaurantId]++;
  }
  tally[label]++;
  const early = engine.records.slice(50, 200);
  const dL = early.reduce((a, r) => a + r.motor.ratesHz["DNa02 L"] - r.motor.ratesHz["DNa02 R"], 0) / early.length;
  console.log(`seed ${seed}: ${label.padEnd(9)} t ${engine.simTimeS.toFixed(1).padStart(4)} s | end (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) heading ${(p.heading * 180 / Math.PI).toFixed(0)}° | closest left ${minA.toFixed(1)} right ${minB.toFixed(1)} | first 3 s L-R ${dL.toFixed(2)} Hz`);
}
console.log(JSON.stringify({ tally, won, meanTimeS: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : null }));
