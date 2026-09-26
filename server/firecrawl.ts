/**
 * Server-side Firecrawl call: one allowlisted page -> validated MenuCapture. The API key comes
 * from FIRECRAWL_API_KEY and never reaches client code. Firecrawl v2 /scrape with JSON mode:
 * https://docs.firecrawl.dev/features/llm-extract
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { restaurantById } from "../src/data/restaurants.ts";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, validateExtraction } from "../src/data/schema.ts";
import type { MenuCapture } from "../src/data/snapshot.ts";

const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export const MENU_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../src/data/fixtures/menus");

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Firecrawl response larger than ${MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function scrapeMenu(id: string, apiKey = process.env.FIRECRAWL_API_KEY): Promise<MenuCapture> {
  const restaurant = restaurantById(id);
  // Firecrawl serves keyless requests at a low rate limit; a key raises it.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: restaurant.url,
      formats: [{ type: "json", schema: EXTRACTION_SCHEMA, prompt: EXTRACTION_PROMPT }],
      onlyMainContent: true,
      timeout: TIMEOUT_MS - 10_000,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await readCapped(res);
  let body: { success?: boolean; error?: string; data?: { json?: unknown; metadata?: Record<string, unknown> } };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Firecrawl HTTP ${res.status}: not JSON`);
  }
  if (!res.ok || !body.success || !body.data) {
    throw new Error(`Firecrawl HTTP ${res.status}: ${body.error ?? "no data"}`);
  }
  const meta = body.data.metadata ?? {};
  return {
    id,
    sourceUrl: restaurant.url,
    fetchedAt: new Date().toISOString(),
    provider: "firecrawl",
    firecrawl: {
      endpoint: ENDPOINT,
      title: typeof meta.title === "string" ? meta.title : null,
      statusCode: typeof meta.statusCode === "number" ? meta.statusCode : null,
    },
    extraction: validateExtraction(body.data.json),
  };
}

/** Keep the latest successful capture as the cached fixture for that restaurant. */
export async function saveCapture(capture: MenuCapture): Promise<string> {
  await mkdir(MENU_FIXTURES, { recursive: true });
  const file = join(MENU_FIXTURES, `${capture.id}.json`);
  await writeFile(file, JSON.stringify(capture, null, 2) + "\n");
  return file;
}
