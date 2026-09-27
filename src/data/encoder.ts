/**
 * Designed menu -> sensory encoding. A small, visible keyword dictionary over menu item names,
 * descriptions and explicit ingredients gives three playful cues in [0, 1]: the share of inspected
 * items that mention each category. Fixed weights combine them into one salience that scales a
 * target's visual drive. These are menu features, not measured aromas, and not a quality rating.
 * Price, rating, restaurant name and id are never used.
 */
import type { ExtractedRestaurant, MenuCues, MenuItem } from "../contracts.ts";

export const ENCODER_VERSION = "menu-cues-v1";

export const KEYWORDS: Record<keyof MenuCues, string[]> = {
  sweet: [
    "sweet", "sugar", "honey", "syrup", "caramel", "chocolate", "cocoa", "vanilla", "dessert",
    "cake", "cookie", "brownie", "pie", "custard", "cream", "ice cream", "gelato", "shake",
    "milkshake", "candy", "glaze", "maple", "molasses", "jam", "teriyaki", "hoisin", "sundae",
  ],
  fruit: [
    "fruit", "apple", "banana", "berry", "berries", "strawberry", "blueberry", "raspberry",
    "cherry", "grape", "lemon", "lime", "orange", "mango", "pineapple", "peach", "pear", "plum",
    "fig", "coconut", "citrus", "yuzu", "passion fruit", "melon", "watermelon", "pomegranate",
    "apricot", "tomato", "avocado", "lychee", "guava",
  ],
  fermented: [
    "fermented", "pickle", "pickled", "kimchi", "sauerkraut", "miso", "soy sauce", "vinegar",
    "yogurt", "kefir", "cheese", "sourdough", "beer", "wine", "sake", "kombucha", "fish sauce",
    "tempeh", "natto", "gochujang", "doenjang", "cultured", "buttermilk", "sour cream", "salami",
  ],
};

/** Fixed before any run; identical for every restaurant. */
export const WEIGHTS: MenuCues = { sweet: 0.4, fruit: 0.35, fermented: 0.25 };
/** Neutral equal baseline so every target is detectable; cues add at most (1 - BASE). */
export const SALIENCE_BASE = 0.6;

export const MAX_ITEMS = 20;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = Object.fromEntries(
  Object.entries(KEYWORDS).map(([cue, words]) => [cue, new RegExp(`\\b(${words.map(escape).join("|")})\\b`, "i")]),
) as Record<keyof MenuCues, RegExp>;

/** Which cues one menu item matches, and the words that matched (for display). */
export function itemCues(item: MenuItem): { cue: keyof MenuCues; word: string }[] {
  const text = [item.name, item.description ?? "", ...item.ingredients].join(" ");
  const out: { cue: keyof MenuCues; word: string }[] = [];
  for (const cue of Object.keys(PATTERNS) as (keyof MenuCues)[]) {
    const m = PATTERNS[cue].exec(text);
    if (m) out.push({ cue, word: m[1].toLowerCase() });
  }
  return out;
}

export function encodeMenu(extraction: ExtractedRestaurant): { cues: MenuCues; salience: number } {
  const items = extraction.menu.slice(0, MAX_ITEMS);
  if (items.length === 0) throw new Error("menu has no items; refusing to encode an empty menu");
  const cues: MenuCues = { sweet: 0, fruit: 0, fermented: 0 };
  for (const item of items) {
    for (const { cue } of itemCues(item)) cues[cue] += 1;
  }
  for (const cue of Object.keys(cues) as (keyof MenuCues)[]) cues[cue] /= items.length;
  const combined = WEIGHTS.sweet * cues.sweet + WEIGHTS.fruit * cues.fruit + WEIGHTS.fermented * cues.fermented;
  return { cues, salience: SALIENCE_BASE + (1 - SALIENCE_BASE) * combined };
}
