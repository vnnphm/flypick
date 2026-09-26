/**
 * Browser side of menu loading. "live" asks the dev/preview server to run Firecrawl now;
 * "cached" uses the last real Firecrawl captures committed under fixtures/menus/ and is labeled
 * as such. There is no silent fallback from one to the other, and no menu is ever invented.
 */
import type { RestaurantSnapshot } from "../contracts.ts";
import { RESTAURANTS } from "./restaurants.ts";
import { toSnapshot, type MenuCapture } from "./snapshot.ts";

const CACHED = import.meta.glob<MenuCapture>("./fixtures/menus/*.json", { eager: true, import: "default" });

export function cachedCapture(id: string): MenuCapture | null {
  return Object.values(CACHED).find((c) => c.id === id) ?? null;
}

async function liveCapture(id: string, signal?: AbortSignal): Promise<MenuCapture> {
  const res = await fetch("/api/restaurants/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    signal,
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || !body.capture) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.capture as MenuCapture;
}

export async function loadMenus(source: "live" | "cached", signal?: AbortSignal): Promise<RestaurantSnapshot[]> {
  return Promise.all(RESTAURANTS.map(async (r) => {
    if (source === "cached") {
      const capture = cachedCapture(r.id);
      if (!capture) throw new Error(`No saved Firecrawl menu for ${r.name}. Run \`npm run capture\` with FIRECRAWL_API_KEY set.`);
      return toSnapshot(capture, "cached");
    }
    try {
      return toSnapshot(await liveCapture(r.id, signal), "live");
    } catch (err) {
      throw new Error(`Couldn’t read the ${r.name} menu with Firecrawl: ${err instanceof Error ? err.message : err}`);
    }
  }));
}
