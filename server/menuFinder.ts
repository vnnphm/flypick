/**
 * Searched place -> its menu, read by Firecrawl. The browser only ever sends a place id; the
 * server looks up the place, decides which page to read, and extracts it. Order of preference:
 *   1. an explicit menu link in the map data (OSM `website:menu`)
 *   2. the best "menu" page on the restaurant's own website (Firecrawl /map)
 *   3. the website itself
 *   4. no website: the best menu page a web search finds (Firecrawl /search)
 * At most two pages are extracted per place: the second only if the first fails or yields fewer
 * than 3 items (then the page with more items is kept). A menu that cannot be read is an error, never invented.
 * Successful captures are kept in .cache/menus/ and reused for a few hours (labeled as saved).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MenuCapture, MenuDiscovery } from "../src/data/snapshot.ts";
import { extractMenu, mapSite, searchWeb, type FoundLink } from "./firecrawl.ts";
import { placeDetails, type PlaceDetails } from "./places.ts";

const CACHE = join(dirname(fileURLToPath(import.meta.url)), "../.cache/menus");
const REUSE_MS = 6 * 60 * 60 * 1000;
/** fewer items than this from the first page also tries the next candidate page */
const ENOUGH_ITEMS = 3;

const OFF_TOPIC = /(career|jobs?\b|blog|press|news|gift|catering|nutrition|allergen|privacy|terms|login|account|franchis|investor|landing|story|about|contact|faq|rewards|merch|shop\b)/;
// a restaurant often lists several menus; prefer the main food menu over partial ones
const MAIN_MENU = /(dinner|all-?day|food|main|full|a-la-carte)/;
const SIDE_MENU = /(dessert|cocktail|wine|drinks?|beverage|bar-|happy-?hour|kids|children|catering|holiday|valentine|thanksgiving|easter|event|private|party|coffee|tea-|beer|spirits|brunch)/;
const AGGREGATOR = /(yelp|doordash|ubereats|grubhub|tripadvisor|seamless|postmates|opentable|facebook|instagram|google)\./;

const baseDomain = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");
const tokens = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((t) => t.length > 2);

/** Higher is more likely to be this restaurant's menu page. Exported for checks. */
export function scoreLink(link: FoundLink, site: URL | null, name: string): number {
  let u: URL;
  try {
    u = new URL(link.url);
  } catch {
    return -Infinity;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return -Infinity;
  const path = decodeURIComponent(u.pathname).toLowerCase();
  let s = 0;
  if (/menu/.test(path)) s += 10;
  else if (/menu/i.test(link.title ?? "")) s += 5;
  const words = `${path} ${(link.title ?? "").toLowerCase().replace(/\s+/g, "-")}`;
  if (MAIN_MENU.test(words)) s += 3;
  else if (/lunch/.test(words)) s += 2;
  if (SIDE_MENU.test(words)) s -= 5;
  if (OFF_TOPIC.test(path)) s -= 8;
  if (site) {
    if (u.host === site.host) s += 3;
    else if (baseDomain(u.host) === baseDomain(site.host)) s += 1;
    else s -= 6;
  } else {
    const host = u.host.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tokens(name).some((t) => host.includes(t))) s += 4;
    if (AGGREGATOR.test(u.host)) s -= 3;
  }
  s -= path.split("/").filter(Boolean).length * 0.5;
  return s;
}

function rank(links: FoundLink[], site: URL | null, name: string): string[] {
  const seen = new Set<string>();
  return links
    .map((l) => ({ l, s: scoreLink(l, site, name) }))
    .filter(({ l, s }) => s >= 5 && !seen.has(l.url) && seen.add(l.url))
    .sort((a, b) => b.s - a.s)
    .map(({ l }) => l.url);
}

async function candidates(place: PlaceDetails, apiKey: string | undefined): Promise<{ url: string; how: MenuDiscovery }[]> {
  const out: { url: string; how: MenuDiscovery }[] = [];
  if (place.menuLink) out.push({ url: place.menuLink, how: "osm-menu-link" });
  if (place.website) {
    const site = new URL(place.website);
    try {
      for (const url of rank(await mapSite(site.origin, "menu", apiKey), site, place.name)) out.push({ url, how: "site-map" });
    } catch {
      // mapping failed; the website itself is still worth reading
    }
    out.push({ url: place.website, how: "website" });
  } else {
    const query = `${place.name} ${place.city ?? place.address} menu`;
    for (const url of rank(await searchWeb(query, apiKey), null, place.name)) out.push({ url, how: "web-search" });
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.url) && seen.add(c.url));
}

async function reuse(id: string): Promise<MenuCapture | null> {
  try {
    const c = JSON.parse(await readFile(join(CACHE, `${id}.json`), "utf8")) as MenuCapture;
    return Date.now() - Date.parse(c.fetchedAt) < REUSE_MS ? c : null;
  } catch {
    return null;
  }
}

export async function readPlaceMenu(id: string, apiKey = process.env.FIRECRAWL_API_KEY): Promise<{ capture: MenuCapture; reused: boolean }> {
  const saved = await reuse(id);
  if (saved) return { capture: saved, reused: true };
  const place = await placeDetails(id);
  const found = await candidates(place, apiKey);
  if (!found.length) throw new Error(`No website or menu page could be found for ${place.name}.`);
  // Read the best page; if it yields only a few items, also read the next candidate and keep
  // whichever has more (at most two extractions per place).
  let best: MenuCapture | null = null;
  let lastError = "";
  for (const { url, how } of found.slice(0, 2)) {
    try {
      const { firecrawl, extraction } = await extractMenu(url, apiKey);
      if (!best || extraction.menu.length > best.extraction.menu.length) {
        best = {
          id,
          sourceUrl: url,
          fetchedAt: new Date().toISOString(),
          provider: "firecrawl",
          firecrawl,
          extraction,
          place: { id, name: place.name, address: place.address },
          discovery: { how, website: place.website },
        };
      }
      if (extraction.menu.length >= ENOUGH_ITEMS) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (best) {
    await mkdir(CACHE, { recursive: true });
    await writeFile(join(CACHE, `${id}.json`), JSON.stringify(best, null, 2) + "\n");
    return { capture: best, reused: false };
  }
  throw new Error(`Couldn’t read a menu for ${place.name} (${lastError}).`);
}
