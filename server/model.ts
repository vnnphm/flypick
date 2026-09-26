/** Load the connectome files from disk for Node tools (same parser as the browser). */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConnectomeAdapter } from "../src/brain/adapter.ts";
import { parseMeta, parseWeights } from "../src/brain/connectome.ts";
import { CONFIG, CONNECTOME, type SimConfig } from "../src/simulation/config.ts";

export const CONNECTOME_DIR = join(dirname(fileURLToPath(import.meta.url)), "../public/connectome");

const unpack = (raw: Buffer): ArrayBuffer => {
  const b = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

export function loadModelFromDisk(dir = CONNECTOME_DIR) {
  let parts: string[];
  try {
    parts = JSON.parse(readFileSync(join(dir, "brain.json"), "utf8")).parts;
  } catch {
    throw new Error(`no model in ${dir}; run \`npm run fetch:connectome\``);
  }
  const meta = parseMeta(unpack(readFileSync(join(dir, "meta.bin"))));
  const weights = parseWeights(unpack(Buffer.concat(parts.map((p) => readFileSync(join(dir, p))))));
  return { meta, weights };
}

export function connectomeAdapter(config: SimConfig = CONFIG): ConnectomeAdapter {
  const { meta, weights } = loadModelFromDisk();
  return new ConnectomeAdapter(meta, weights, config, { modelId: CONNECTOME.modelId, revision: CONNECTOME.revision });
}
