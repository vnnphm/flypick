/**
 * The MVP allowlist: the only pages the scrape endpoint will send to Firecrawl. The order here is
 * display order only; which side of the arena each restaurant gets is drawn per run from the seed.
 * To change the shortlist, edit this list and capture new menus (`npm run capture`).
 */
export type Restaurant = { id: string; name: string; url: string };

export const RESTAURANTS: readonly Restaurant[] = [
  { id: "sweetgreen", name: "sweetgreen", url: "https://www.sweetgreen.com/menu" },
  { id: "souvla", name: "Souvla", url: "https://www.souvla.com/menus/" },
];

export function restaurantById(id: string): Restaurant {
  const r = RESTAURANTS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown restaurant id ${JSON.stringify(id)}`);
  return r;
}
