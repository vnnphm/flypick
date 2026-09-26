/**
 * Restaurant search on OpenStreetMap data, called only from the app's server:
 *   cities, reverse geocoding and place details  Nominatim (max 1 request/s, identified client)
 *   restaurant search as you type                Photon (komoot), biased to the chosen city
 * No key is needed. Results are cached in memory for the life of the server.
 * Data © OpenStreetMap contributors (ODbL); https://osmfoundation.org/wiki/Licence
 */
import type { CityResult, PlaceResult } from "../src/contracts.ts";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const PHOTON = "https://photon.komoot.io/api/";
const USER_AGENT = "FlyPick/0.1 (+https://github.com/vnnphm/flypick)";
const TIMEOUT_MS = 10_000;
const FOOD = ["restaurant", "fast_food", "cafe", "bar", "pub", "food_court", "ice_cream", "biergarten"];

export type PlaceDetails = PlaceResult & {
  city: string | null;
  website: string | null;
  /** an explicit menu link from the map data (OSM `website:menu`), when present */
  menuLink: string | null;
  cuisine: string | null;
};

const cache = new Map<string, unknown>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const value = await load();
  cache.set(key, value);
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  return res.json();
}

// Nominatim's usage policy allows one request per second; queue them.
let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatim = 0;
function nominatim(path: string): Promise<unknown> {
  const run = nominatimChain.then(async () => {
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    return getJson(`${NOMINATIM}${path}`);
  });
  nominatimChain = run.catch(() => {});
  return run;
}

type NominatimPlace = {
  osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string;
  addresstype?: string; category?: string; type?: string; boundingbox?: [string, string, string, string];
  address?: Record<string, string>; extratags?: Record<string, string> | null;
};

const osmId = (type: string, id: number) => `${type[0].toUpperCase()}${id}`;

function toCity(p: NominatimPlace): CityResult {
  const bb = p.boundingbox?.map(Number);
  const a = p.address ?? {};
  const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? p.name ?? p.display_name.split(",")[0];
  return {
    id: osmId(p.osm_type, p.osm_id),
    name,
    label: p.display_name,
    lat: Number(p.lat),
    lon: Number(p.lon),
    bbox: bb && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : null,
  };
}

export async function searchCities(q: string): Promise<CityResult[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return [];
  return cached(`city:${query.toLowerCase()}`, async () => {
    const rows = await nominatim(`/search?${new URLSearchParams({
      q: query, format: "jsonv2", addressdetails: "1", limit: "5", featureType: "settlement",
    })}`) as NominatimPlace[];
    return rows.map(toCity);
  });
}

export async function reverseCity(lat: number, lon: number): Promise<CityResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("bad coordinates");
  // round to ~1 km: enough to find the city, and the precise position is not kept or sent further
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  return cached(`rev:${la},${lo}`, async () => {
    const p = await nominatim(`/reverse?${new URLSearchParams({ lat: la, lon: lo, format: "jsonv2", zoom: "10", addressdetails: "1" })}`) as NominatimPlace & { error?: string };
    if (!p || p.error) return null;
    return { ...toCity(p), lat: Number(la), lon: Number(lo) };
  });
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string;
    housenumber?: string; street?: string; city?: string; district?: string; state?: string; postcode?: string;
  };
};

function address(p: PhotonFeature["properties"]): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  return [street, p.city ?? p.district, p.state].filter(Boolean).join(", ");
}

export async function searchRestaurants(q: string, near: { lat: number; lon: number; bbox: CityResult["bbox"] }): Promise<PlaceResult[]> {
  const query = q.trim().slice(0, 80);
  if (query.length < 2) return [];
  const params = new URLSearchParams({ q: query, lat: String(near.lat), lon: String(near.lon), limit: "12", lang: "en" });
  for (const kind of FOOD) params.append("osm_tag", `amenity:${kind}`);
  if (near.bbox) {
    // a small town's boundary can be tighter than its restaurants; keep at least ~9 km either way
    const [w, sb, e, n] = near.bbox, pad = 0.08;
    params.set("bbox", [Math.min(w, near.lon - pad), Math.min(sb, near.lat - pad), Math.max(e, near.lon + pad), Math.max(n, near.lat + pad)].join(","));
  }
  return cached(`photon:${params}`, async () => {
    const body = await getJson(`${PHOTON}?${params}`) as { features: PhotonFeature[] };
    const seen = new Set<string>();
    const out: PlaceResult[] = [];
    for (const f of body.features ?? []) {
      const p = f.properties;
      if (!p.name) continue;
      const id = osmId(p.osm_type, p.osm_id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: p.name, address: address(p), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], kind: p.osm_value });
      if (out.length >= 8) break;
    }
    return out;
  });
}

const PLACE_ID = /^[NWR]\d{1,15}$/;

function httpUrl(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.split(";")[0].trim();
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function placeDetails(id: string): Promise<PlaceDetails> {
  if (!PLACE_ID.test(id)) throw new Error("not a place id");
  return cached(`place:${id}`, async () => {
    const rows = await nominatim(`/lookup?${new URLSearchParams({ osm_ids: id, format: "jsonv2", extratags: "1", addressdetails: "1" })}`) as NominatimPlace[];
    const p = rows[0];
    if (!p) throw new Error("that place was not found on the map");
    const a = p.address ?? {};
    const t = p.extratags ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city ?? a.town ?? a.village ?? a.suburb ?? null;
    return {
      id,
      name: p.name || p.display_name.split(",")[0],
      address: [street, city, a.state].filter(Boolean).join(", "),
      lat: Number(p.lat),
      lon: Number(p.lon),
      kind: p.type ?? "restaurant",
      city,
      website: httpUrl(t.website ?? t["contact:website"] ?? t.url),
      menuLink: httpUrl(t["website:menu"] ?? t.menu),
      cuisine: t.cuisine ?? null,
    };
  });
}
