/**
 * A menu capture is the validated Firecrawl extraction plus where and when it came from. It is
 * stored as-is (fixtures/menus/<id>.json); the encoder is applied when a snapshot is built, so the
 * source evidence stays separate from the derived features.
 */
import type { ExtractedRestaurant, RestaurantSnapshot } from "../contracts.ts";
import { ENCODER_VERSION, encodeMenu } from "./encoder.ts";
import { restaurantById } from "./restaurants.ts";
import { validateExtraction } from "./schema.ts";

export type MenuCapture = {
  id: string;
  sourceUrl: string;
  fetchedAt: string;
  provider: "firecrawl";
  firecrawl: { endpoint: string; title: string | null; statusCode: number | null };
  extraction: ExtractedRestaurant;
  /** set for searched places: which place, and how its menu page was found */
  place?: { id: string; name: string; address: string };
  discovery?: { how: MenuDiscovery; website: string | null };
};

export type MenuDiscovery = "allowlist" | "osm-menu-link" | "site-map" | "website" | "web-search";

/** A capture from the fixed shortlist; the page must still be the allowlisted one. */
export function toSnapshot(capture: MenuCapture, mode: "live" | "cached"): RestaurantSnapshot {
  const restaurant = restaurantById(capture.id);
  if (capture.sourceUrl !== restaurant.url) {
    throw new Error(`${capture.id}: capture is for ${capture.sourceUrl}, allowlist says ${restaurant.url}`);
  }
  return snapshotOf(capture, mode, restaurant.name, null);
}

/** A capture for a searched place. */
export function placeSnapshot(capture: MenuCapture, mode: "live" | "cached"): RestaurantSnapshot {
  if (!capture.place) throw new Error("capture has no place");
  return snapshotOf(capture, mode, capture.place.name, capture.place.address);
}

function snapshotOf(capture: MenuCapture, mode: "live" | "cached", displayName: string, address: string | null): RestaurantSnapshot {
  const extraction = validateExtraction(capture.extraction);
  const { cues, salience } = encodeMenu(extraction);
  return {
    id: capture.id,
    displayName,
    address,
    sourceUrl: capture.sourceUrl,
    fetchedAt: capture.fetchedAt,
    mode,
    extraction,
    cues,
    salience,
    encoderVersion: ENCODER_VERSION,
  };
}
