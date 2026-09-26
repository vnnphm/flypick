/**
 * Fetch and parse the `flybrain export --web` files in a browser or worker. Based on fetchGz in
 * fly.ai world/src/connectome.worker.ts (40fbeca, MIT). The files are gzip streams named .bin;
 * a server may already have unpacked them, so decompress only if the gzip magic is still there.
 */
import { parseMeta, parseWeights, type ConnectomeMeta, type ConnectomeWeights } from "./connectome.ts";

type Progress = (text: string) => void;

async function fetchGz(urls: string[], label: string, totalMb: number, progress: Progress): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let got = 0, lastReport = 0;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`${url}: HTTP ${res.status}. Run \`npm run fetch:connectome\` to download the model.`);
    }
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (got - lastReport > 2_000_000) {
        lastReport = got;
        progress(`Downloading ${label}: ${(got / 1e6).toFixed(0)}${totalMb ? ` / ${totalMb.toFixed(0)}` : ""} MB`);
      }
    }
  }
  const blob = new Blob(chunks as BlobPart[]);
  if (!(chunks[0]?.[0] === 0x1f && chunks[0]?.[1] === 0x8b)) return blob.arrayBuffer();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

export async function loadModel(base: string, progress: Progress): Promise<{ meta: ConnectomeMeta; weights: ConnectomeWeights }> {
  const res = await fetch(`${base}brain.json`);
  if (!res.ok) throw new Error(`${base}brain.json: HTTP ${res.status}. Run \`npm run fetch:connectome\` to download the model.`);
  const info: { parts: string[]; weights_mb: number } = await res.json();
  const meta = parseMeta(await fetchGz([`${base}meta.bin`], "neuron labels", 0, progress));
  const buf = await fetchGz(info.parts.map((p) => base + p), "connectome", info.weights_mb, progress);
  progress("Wiring 25 M synapses");
  return { meta, weights: parseWeights(buf) };
}
