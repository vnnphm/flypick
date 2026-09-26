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
};

export function toSnapshot(capture: MenuCapture, mode: "live" | "cached"): RestaurantSnapshot {
  const restaurant = restaurantById(capture.id);
  if (capture.sourceUrl !== restaurant.url) {
    throw new Error(`${capture.id}: capture is for ${capture.sourceUrl}, allowlist says ${restaurant.url}`);
  }
  const extraction = validateExtraction(capture.extraction);
  const { cues, salience } = encodeMenu(extraction);
  return {
    id: capture.id,
    displayName: restaurant.name,
    sourceUrl: capture.sourceUrl,
    fetchedAt: capture.fetchedAt,
    mode,
    extraction,
    cues,
    salience,
    encoderVersion: ENCODER_VERSION,
  };
}
