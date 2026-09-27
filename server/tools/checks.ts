/**
 * Focused causal and decision checks with observable outcomes. The ones marked [model] run the
 * real connectome (npm run fetch:connectome first).
 *
 *   npm run check
 */
import assert from "node:assert/strict";
import { decode, type AdapterInfo, type BrainAdapter, type MotorFrame, type SensoryFrame } from "../../src/brain/adapter.ts";
import { encodeMenu, itemCues } from "../../src/data/encoder.ts";
import { validateExtraction } from "../../src/data/schema.ts";
import { CONFIG, type SimConfig } from "../../src/simulation/config.ts";
import { Decision } from "../../src/simulation/decision.ts";
import { Engine } from "../../src/simulation/engine.ts";
import { placeTargets, sense, type Target } from "../../src/simulation/geometry.ts";
import { isCurrent } from "../../src/simulation/protocol.ts";
import { buildLog, replayEngine, runToEnd, type RunLog } from "../../src/simulation/recorder.ts";
import { placeSnapshot, type MenuCapture } from "../../src/data/snapshot.ts";
import { scoreLink } from "../menuFinder.ts";
import { connectomeAdapter } from "../model.ts";

let passed = 0, failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  const t0 = performance.now();
  try {
    await fn();
    passed++;
    console.log(`ok    ${name} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err instanceof Error ? err.message : err}`);
  }
}

/** Fixed motor output, for body/decision checks that must not depend on the brain. */
class FixedAdapter implements BrainAdapter {
  readonly info: AdapterInfo = { kind: "mock", label: "fixed", modelId: null, revision: null, neurons: null, synapses: null, supportedOutputs: [] };
  private readonly out: Partial<MotorFrame>;
  private readonly failAt: number;
  constructor(out: Partial<MotorFrame>, failAt = Infinity) {
    this.out = out;
    this.failAt = failAt;
  }
  reset() {}
  step(input: SensoryFrame): MotorFrame {
    return { tick: input.tick, simTimeMs: 0, turn: 0, forward: 0, backward: 0, escape: 0, ratesHz: {}, valid: input.tick < this.failAt, ...this.out };
  }
}

const equal = [{ id: "A", name: "A", salience: 0.8 }, { id: "B", name: "B", salience: 0.8 }];
const targets = (swap = false, menus = equal) => placeTargets(menus, swap, CONFIG);
const inZone = (e: Engine) => e.records.some((r) => e.targets.some((t) => Math.hypot(r.pose[0] - t.x, r.pose[1] - t.z) <= t.radius));

// ---- no model needed -------------------------------------------------------------------------

await check("zero steering at constant speed follows the neutral path, misses both zones, times out", () => {
  const e = new Engine(CONFIG, targets(), new FixedAdapter({ turn: 0 }), 1);
  const res = runToEnd(e);
  assert.equal(res.status, "no-choice");
  assert.ok(!inZone(e), "entered a zone");
  assert.ok(e.records.every((r) => Math.abs(r.pose[0]) < 1e-9), "left the x = 0 line");
  assert.ok(Math.abs(e.simTimeS - CONFIG.timeoutS) < 1e-6, `timed out at ${e.simTimeS}`);
});

await check("zero motor output stops movement in neural locomotion mode", () => {
  const config: SimConfig = { ...CONFIG, locomotion: "neural" };
  const e = new Engine(config, targets(), new FixedAdapter({ turn: 0, forward: 0, backward: 0 }), 1);
  runToEnd(e);
  assert.deepEqual([e.pose.x, e.pose.z], [config.start.x, config.start.z]);
});

await check("targets are equal-sized, mirrored, non-overlapping and off the neutral line", () => {
  const [a, b] = targets();
  assert.equal(a.radius, b.radius);
  assert.equal(a.x, -b.x);
  assert.equal(a.z, b.z);
  assert.ok(Math.abs(a.x) > a.radius, "zone touches the neutral path");
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.radius + b.radius, "zones overlap");
  const start = CONFIG.start;
  assert.ok(Math.abs(Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z)) < 1e-9, "unequal distance");
});

await check("sensory frame is mirror-symmetric and a target to the fly's left drives the left side", () => {
  const pose = { x: 0, z: 0, heading: 0 };
  const t: Target = { id: "t", name: "t", x: 2, z: 3, radius: 1, salience: 1 };
  const left = sense(pose, [t], CONFIG);
  const right = sense(pose, [{ ...t, x: -2 }], CONFIG);
  assert.ok(left.left > 0 && left.right === 0, "+X target should be on the fly's left");
  assert.equal(left.left, right.right);
});

await check("dwell resets on exit; only 1 continuous simulated second wins", () => {
  const d = new Decision([{ id: "A", x: 0, z: 0, radius: 1 }], CONFIG);
  let t = 0;
  const stepAt = (x: number) => d.update(x, 0, (t += CONFIG.dt));
  for (let i = 0; i < 40; i++) assert.equal(stepAt(0).kind, "running");
  assert.equal(stepAt(5).kind, "running");
  assert.equal(d.dwell.A, 0);
  for (let i = 0; i < 49; i++) assert.equal(stepAt(0).kind, "running");
  const v = stepAt(0);
  assert.deepEqual(v, { kind: "selected", id: "A" });
});

await check("invalid brain output is an error, never a winner", () => {
  const e = new Engine(CONFIG, targets(), new FixedAdapter({ turn: 0 }, 120), 1);
  const res = runToEnd(e);
  assert.equal(res.status, "error");
});

await check("decoder: DNa02 L above R is a left (negative) turn; symmetric; non-finite is invalid", () => {
  const l = decode(0, 0.02, { "DNa02 L": 5, "DNa02 R": 1 }, CONFIG);
  const r = decode(0, 0.02, { "DNa02 L": 1, "DNa02 R": 5 }, CONFIG);
  assert.ok(l.turn < 0 && r.turn > 0);
  const unit = { ...CONFIG, dna02GainL: 1, dna02GainR: 1 };
  assert.equal(decode(0, 0.02, { "DNa02 L": 5, "DNa02 R": 1 }, unit).turn, -decode(0, 0.02, { "DNa02 L": 1, "DNa02 R": 5 }, unit).turn);
  assert.equal(decode(0, 0.02, { "DNa02 L": NaN }, CONFIG).valid, false);
});

await check("stale worker replies from a reset run are ignored", () => {
  const frame = { type: "frame", runId: "old" } as Parameters<typeof isCurrent>[0];
  assert.equal(isCurrent(frame, "new"), false);
  assert.equal(isCurrent({ ...frame, runId: "new" } as typeof frame, "new"), true);
  assert.equal(isCurrent({ type: "done", runId: "old" } as Parameters<typeof isCurrent>[0], "new"), false);
});

await check("missing or empty menu data is an error, not a low score", () => {
  assert.throws(() => validateExtraction({ name: "x", menu: [] }));
  assert.throws(() => validateExtraction(null));
  assert.throws(() => encodeMenu({ name: "x", menu: [] }));
});

await check("encoder ignores restaurant name and price", () => {
  const item = { name: "Lemon tart", description: "with honey", priceText: "$5", ingredients: [], evidenceText: "" };
  const a = encodeMenu({ name: "Alpha", menu: [item] });
  const b = encodeMenu({ name: "Zeta", menu: [{ ...item, priceText: "$500" }] });
  assert.deepEqual(a, b);
  assert.ok(a.cues.fruit === 1 && a.cues.sweet === 1 && a.cues.fermented === 0);
});

await check("menu finder prefers the site's main menu over partial, off-site or off-topic pages", () => {
  const site = new URL("https://example-cafe.com/");
  const score = (url: string, title: string | null = null) => scoreLink({ url, title, description: null }, site, "Example Cafe");
  assert.ok(score("https://example-cafe.com/wp-content/uploads/Sample-Dinner-menu.pdf") > score("https://example-cafe.com/wp-content/uploads/Sample-Dessert-menu.pdf"));
  assert.ok(score("https://example-cafe.com/menu") > score("https://other-site.com/menu"));
  assert.ok(score("https://example-cafe.com/careers/menu-developer") < 5, "careers page counted as a menu");
  assert.ok(score("https://example-cafe.com/about") < 5, "page without 'menu' counted as a menu");
  const found = (url: string) => scoreLink({ url, title: null, description: null }, null, "Example Cafe");
  assert.ok(found("https://examplecafe.com/menu") > found("https://www.yelp.com/menu/example-cafe"), "web search should prefer the restaurant's own domain");
});

await check("a searched place's menu keeps its place identity; an empty menu is an error", () => {
  const capture: MenuCapture = {
    id: "N1", sourceUrl: "https://example-cafe.com/menu", fetchedAt: "2026-09-26T00:00:00Z", provider: "firecrawl",
    firecrawl: { endpoint: "x", title: null, statusCode: 200 },
    extraction: { name: "Example", menu: [{ name: "Lemon tart", description: null, priceText: null, ingredients: [], evidenceText: "" }] },
    place: { id: "N1", name: "Example Cafe", address: "1 Main St" },
  };
  const snap = placeSnapshot(capture, "live");
  assert.equal(snap.displayName, "Example Cafe");
  assert.equal(snap.address, "1 Main St");
  assert.throws(() => placeSnapshot({ ...capture, place: undefined }, "live"));
  assert.throws(() => placeSnapshot({ ...capture, extraction: { name: null, menu: [] } }, "live"));
});

await check("the scanned-items panel's per-item cue tags add up to the encoder's cue shares", () => {
  const menu = [
    { name: "Lemon tart", description: "with honey", priceText: null, ingredients: [], evidenceText: "" },
    { name: "Kimchi fried rice", description: null, priceText: null, ingredients: ["pickled radish"], evidenceText: "" },
    { name: "Plain rice", description: null, priceText: null, ingredients: [], evidenceText: "" },
  ];
  const { cues } = encodeMenu({ name: null, menu });
  for (const cue of ["sweet", "fruit", "fermented"] as const) {
    assert.equal(menu.filter((m) => itemCues(m).some((c) => c.cue === cue)).length / menu.length, cues[cue]);
  }
  assert.deepEqual(itemCues(menu[1]), [{ cue: "fermented", word: "kimchi" }]);
});

// ---- real connectome -------------------------------------------------------------------------

const adapter = connectomeAdapter();

await check("[model] left and right probes give opposite steering; swapping inputs swaps the sign", () => {
  const probe = (left: number, right: number, seed: number) => {
    adapter.reset(seed);
    let turn = 0;
    for (let i = 0; i < 175; i++) {
      const m = adapter.step({ tick: i, targetLeft: i < 50 ? 0 : left, targetRight: i < 50 ? 0 : right });
      if (i >= 75) turn += m.turn;
    }
    return turn / 100;
  };
  for (const seed of [11, 12, 13]) {
    const l = probe(0.6, 0, seed), r = probe(0, 0.6, seed);
    assert.ok(l < -0.1 && r > 0.1, `seed ${seed}: left ${l.toFixed(3)}, right ${r.toFixed(3)}`);
  }
});

await check("[model] renaming restaurant ids/labels leaves stimulus and motion unchanged", () => {
  const renamed = [{ id: "zz-9", name: "Something Else", salience: 0.8 }, { id: "aa-1", name: "Other", salience: 0.8 }];
  const a = new Engine(CONFIG, targets(false), adapter, 77);
  for (let i = 0; i < 400; i++) a.step();
  const poses = a.records.map((r) => [...r.pose, ...r.input]);
  const b = new Engine(CONFIG, targets(false, renamed), adapter, 77);
  for (let i = 0; i < 400; i++) b.step();
  assert.deepEqual(b.records.map((r) => [...r.pose, ...r.input]), poses);
});

let log: RunLog | null = null;
await check("[model] a full-connectome run reaches the decision stage", () => {
  const e = new Engine(CONFIG, targets(false), adapter, 4242);
  const res = runToEnd(e);
  assert.ok(res.status === "selected" || res.status === "no-choice", res.status);
  log = buildLog({ runId: "check-4242", mode: "live", engine: e, seed: 4242, menus: [], stepMs: adapter.stepMs, environment: "node" });
  console.log(`      result ${JSON.stringify(res)}`);
});

await check("[model] replaying recorded motor frames reproduces poses and decision exactly", () => {
  assert.ok(log, "no log");
  const roundTrip: RunLog = JSON.parse(JSON.stringify(log));
  const e = replayEngine(roundTrip);
  const res = runToEnd(e);
  assert.deepEqual(res, roundTrip.result);
  const maxErr = Math.max(...e.records.map((r, i) => Math.max(...r.pose.map((v, k) => Math.abs(v - roundTrip.ticks[i].pose[k])))));
  assert.ok(maxErr === 0, `max pose error ${maxErr}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
