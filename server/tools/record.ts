/**
 * Record a genuine full-connectome run for the replay fixture, with the saved Firecrawl menus and
 * the app's config, in Node (the same engine and adapter the browser worker uses). Whatever
 * happens is saved as is, including no-choice; runs are never repeated to get a preferred result.
 *
 *   npm run record [-- seed=123]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { RESTAURANTS } from "../../src/data/restaurants.ts";
import { toSnapshot, type MenuCapture } from "../../src/data/snapshot.ts";
import { CONFIG } from "../../src/simulation/config.ts";
import { Engine } from "../../src/simulation/engine.ts";
import { placeTargets } from "../../src/simulation/geometry.ts";
import { buildLog, runToEnd } from "../../src/simulation/recorder.ts";
import { MENU_FIXTURES } from "../firecrawl.ts";
import { connectomeAdapter } from "../model.ts";

const RUNS = join(MENU_FIXTURES, "../runs");
const arg = process.argv.find((a) => a.startsWith("seed="));
const seed = arg ? Number(arg.slice(5)) : randomInt(2 ** 32);
const swap = randomInt(2) === 1;

const menus = RESTAURANTS.map((r) => {
  let capture: MenuCapture;
  try {
    capture = JSON.parse(readFileSync(join(MENU_FIXTURES, `${r.id}.json`), "utf8"));
  } catch {
    throw new Error(`no saved Firecrawl menu for ${r.id}; run \`npm run capture\` first`);
  }
  return toSnapshot(capture, "cached");
});
const targets = placeTargets(menus.map((m) => ({ id: m.id, name: m.displayName, salience: m.salience })), swap, CONFIG);
const adapter = connectomeAdapter();
const engine = new Engine(CONFIG, targets, adapter, seed);
const result = runToEnd(engine);
const runId = `recorded-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const log = buildLog({ runId, mode: "live", engine, seed, menus, stepMs: adapter.stepMs, environment: `node ${process.version}` });
mkdirSync(RUNS, { recursive: true });
const file = join(RUNS, `${runId}.json`);
writeFileSync(file, JSON.stringify(log));
console.log(`seed ${seed}, ${targets.map((t) => `${t.name} at x=${t.x}, salience ${t.salience.toFixed(3)}`).join("; ")}`);
console.log(`result ${JSON.stringify(result)} -> ${file}`);
