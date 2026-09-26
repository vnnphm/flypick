/**
 * Download the full-connectome browser export pinned to one fly.ai commit into public/connectome/
 * and verify sha256. Files already present with the right hash are kept.
 *   npm run fetch:connectome
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONNECTOME } from "../src/simulation/config.ts";
import { CONNECTOME_DIR } from "./model.ts";

const FILES: Record<string, string> = {
  "brain.json": "451c37994ac33e2513f05c1c59a5043c7330dd72798f8f9f321f1de17558ac17",
  "meta.bin": "e80f58ea3faf27366fdda2d8cfe9419f53aa47dc8a56b8f5efc3f00a6dbca252",
  "weights.0.bin": "7443590f555a5a91cbd8f02886cf3f0f3a0f762add9d3a3151bb58bc35342d76",
  "weights.1.bin": "44870fad4a3f925b29b3dc3c7016166ffcf39514ba8d8c4b494c81004e7a6adf",
};
const BASE = `https://raw.githubusercontent.com/alextitonis/fly.ai/${CONNECTOME.revision}/world/public/connectome/`;

const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

mkdirSync(CONNECTOME_DIR, { recursive: true });
for (const [name, expected] of Object.entries(FILES)) {
  const file = join(CONNECTOME_DIR, name);
  if (existsSync(file) && sha256(readFileSync(file)) === expected) {
    console.log(`${name}: ok`);
    continue;
  }
  process.stdout.write(`${name}: downloading... `);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${BASE + name}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== expected) throw new Error(`${name}: sha256 ${got}, expected ${expected}`);
  writeFileSync(file, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB, sha256 ok`);
}
console.log(`model ready in ${CONNECTOME_DIR} (fly.ai ${CONNECTOME.revision.slice(0, 7)})`);
