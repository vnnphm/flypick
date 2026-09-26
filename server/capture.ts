/**
 * Capture real Firecrawl menus for the allowlist and store them as the cached fixtures.
 *   npm run capture            # every restaurant
 *   npm run capture -- souvla  # one
 */
import { RESTAURANTS } from "../src/data/restaurants.ts";
import { encodeMenu } from "../src/data/encoder.ts";
import { saveCapture, scrapeMenu } from "./firecrawl.ts";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : RESTAURANTS.map((r) => r.id);
let failed = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const capture = await scrapeMenu(id);
    const file = await saveCapture(capture);
    const { cues, salience } = encodeMenu(capture.extraction);
    console.log(`${id}: ${capture.extraction.menu.length} items in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${file}`);
    console.log(`  cues ${JSON.stringify(cues)} salience ${salience.toFixed(3)}`);
  } catch (err) {
    failed++;
    console.error(`${id}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${err instanceof Error ? err.message : err}`);
  }
}
process.exit(failed ? 1 : 0);
