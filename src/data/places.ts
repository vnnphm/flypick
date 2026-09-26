/** Browser client for the app server's places endpoints (OpenStreetMap data; see server/places.ts). */
import type { CityResult, PlaceResult } from "../contracts.ts";

async function get<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${path}?${new URLSearchParams(params)}`, { signal });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export async function findCities(q: string, signal?: AbortSignal): Promise<CityResult[]> {
  return (await get<{ cities: CityResult[] }>("/api/places/cities", { q }, signal)).cities;
}

/** The city around a position; the server rounds it to about 1 km and keeps nothing. */
export async function cityAt(lat: number, lon: number, signal?: AbortSignal): Promise<CityResult | null> {
  return (await get<{ city: CityResult | null }>("/api/places/reverse", { lat: String(lat), lon: String(lon) }, signal)).city;
}

export async function findRestaurants(q: string, city: CityResult, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params: Record<string, string> = { q, lat: String(city.lat), lon: String(city.lon) };
  if (city.bbox) params.bbox = city.bbox.join(",");
  return (await get<{ places: PlaceResult[] }>("/api/places/search", params, signal)).places;
}
