/**
 * Server-side Firecrawl calls: JSON extraction of a menu page (/scrape), finding a site's menu page
 * (/map) and finding a restaurant's pages on the web (/search). The API key comes from
 * FIRECRAWL_API_KEY and never reaches client code. https://docs.firecrawl.dev/features/llm-extract
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { restaurantById } from "../src/data/restaurants.ts";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, validateExtraction } from "../src/data/schema.ts";
import type { MenuCapture } from "../src/data/snapshot.ts";

const API = "https://api.firecrawl.dev/v2";
const ENDPOINT = `${API}/scrape`;
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

function headers(apiKey: string | undefined): Record<string, string> {
  // Firecrawl serves keyless requests at a low rate limit; a key raises it.
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

async function call<T>(path: string, body: unknown, apiKey: string | undefined, timeoutMs = TIMEOUT_MS): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await readCapped(res);
  let parsed: { success?: boolean; error?: string } & T;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Firecrawl HTTP ${res.status}: not JSON`);
  }
  if (!res.ok || !parsed.success) throw new Error(`Firecrawl HTTP ${res.status}: ${parsed.error ?? "no data"}`);
  return parsed;
}

/** Firecrawl JSON extraction of one page -> validated menu, plus page metadata. */
export async function extractMenu(url: string, apiKey = process.env.FIRECRAWL_API_KEY) {
  const body = await call<{ data?: { json?: unknown; metadata?: Record<string, unknown> } }>("/scrape", {
    url,
    formats: [{ type: "json", schema: EXTRACTION_SCHEMA, prompt: EXTRACTION_PROMPT }],
    // Whole page, minus site chrome: "main content" detection drops tabbed menus on common
    // restaurant platforms (e.g. BentoBox sites kept only the intro: 1 of ~18 items).
    onlyMainContent: false,
    excludeTags: ["nav", "footer"],
    timeout: TIMEOUT_MS - 10_000,
  }, apiKey);
  if (!body.data) throw new Error("Firecrawl returned no data");
  const meta = body.data.metadata ?? {};
  return {
    firecrawl: {
      endpoint: ENDPOINT,
      title: typeof meta.title === "string" ? meta.title : null,
      statusCode: typeof meta.statusCode === "number" ? meta.statusCode : null,
    },
    extraction: validateExtraction(body.data.json),
  };
}

export type FoundLink = { url: string; title: string | null; description: string | null };

/** Links on a site that match a search word (Firecrawl /map; 1 credit). */
export async function mapSite(url: string, search: string, apiKey = process.env.FIRECRAWL_API_KEY): Promise<FoundLink[]> {
  const body = await call<{ links?: (FoundLink | string)[] }>("/map", { url, search, limit: 30 }, apiKey, 30_000);
  return (body.links ?? []).map((l) => (typeof l === "string" ? { url: l, title: null, description: null } : l));
}

/** Web search results (Firecrawl /search). */
export async function searchWeb(query: string, apiKey = process.env.FIRECRAWL_API_KEY): Promise<FoundLink[]> {
  const body = await call<{ data?: { web?: FoundLink[] } | FoundLink[] }>("/search", { query, limit: 8 }, apiKey, 30_000);
  const web = Array.isArray(body.data) ? body.data : body.data?.web ?? [];
  return web.filter((r) => typeof r?.url === "string");
}

/** The fixed shortlist: one allowlisted page -> MenuCapture. */
export async function scrapeMenu(id: string, apiKey = process.env.FIRECRAWL_API_KEY): Promise<MenuCapture> {
  const restaurant = restaurantById(id);
  const { firecrawl, extraction } = await extractMenu(restaurant.url, apiKey);
  return {
    id,
    sourceUrl: restaurant.url,
    fetchedAt: new Date().toISOString(),
    provider: "firecrawl",
    firecrawl,
    extraction,
  };
}

/** Keep the latest successful capture as the cached fixture for that restaurant. */
export async function saveCapture(capture: MenuCapture): Promise<string> {
  await mkdir(MENU_FIXTURES, { recursive: true });
  const file = join(MENU_FIXTURES, `${capture.id}.json`);
  await writeFile(file, JSON.stringify(capture, null, 2) + "\n");
  return file;
}
