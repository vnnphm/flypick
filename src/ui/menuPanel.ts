import type { MenuCues, RestaurantSnapshot, SimulationDetails } from '../contracts';
import { itemCues, MAX_ITEMS, SALIENCE_BASE, WEIGHTS } from '../data/encoder';
import type { DetailsSource } from './brainTelemetry.ts';

const CUE_LABEL: Record<keyof MenuCues, string> = { sweet: 'Sweet', fruit: 'Fruit', fermented: 'Fermented' };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const host = (url: string) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function restaurantSection(menu: RestaurantSnapshot): HTMLElement {
  const section = el('section', 'menu-scan-restaurant');
  section.append(el('h3', undefined, menu.displayName));

  const source = el('p', 'menu-scan-source');
  const items = menu.extraction.menu.slice(0, MAX_ITEMS);
  source.append(`${items.length} item${items.length === 1 ? '' : 's'} scanned from `);
  const link = el('a', undefined, host(menu.sourceUrl));
  link.href = menu.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  const when = new Date(menu.fetchedAt);
  source.append(link, ` · ${menu.mode === 'cached' ? 'saved' : 'read'} ${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  section.append(source);

  const cues = el('p', 'menu-scan-cues');
  cues.textContent = `${(Object.keys(CUE_LABEL) as (keyof MenuCues)[]).map(c => `${CUE_LABEL[c]} ${pct(menu.cues[c])}`).join(' · ')} → signal strength ${menu.salience.toFixed(2)}`;
  section.append(cues);

  const list = el('ol', 'menu-scan-items');
  for (const item of items) {
    const li = el('li');
    const head = el('div', 'menu-scan-item-head');
    head.append(el('strong', undefined, item.name));
    if (item.priceText) head.append(el('span', 'menu-scan-price', item.priceText));
    li.append(head);
    const detail = [item.description, item.ingredients.length ? `Ingredients: ${item.ingredients.join(', ')}` : null].filter(Boolean).join(' · ');
    if (detail) li.append(el('p', 'menu-scan-detail', detail));
    const matched = itemCues(item);
    if (matched.length) {
      const tags = el('p', 'menu-scan-tags');
      for (const { cue, word } of matched) {
        const tag = el('span', `menu-scan-tag is-${cue}`, `${CUE_LABEL[cue]}: “${word}”`);
        tags.append(tag);
      }
      li.append(tags);
    }
    list.append(li);
  }
  section.append(list);
  if (menu.extraction.menu.length > items.length) {
    section.append(el('p', 'menu-scan-note', `${menu.extraction.menu.length - items.length} more items were on the page but only the first ${MAX_ITEMS} are used.`));
  }
  return section;
}

/** The menus as they reached the fly: every scanned item and the cue words the encoder matched. */
export function mountMenuPanel(hostEl: HTMLElement, controller: DetailsSource) {
  const panel = el('details', 'menu-scan');
  const summary = el('summary');
  const body = el('div', 'menu-scan-body');
  const explain = el('p', 'menu-scan-explain',
    `Each menu becomes one signal for the fly: the share of items that mention sweet, fruit or fermented words, weighted ${pct(WEIGHTS.sweet)} / ${pct(WEIGHTS.fruit)} / ${pct(WEIGHTS.fermented)}, on top of a base of ${SALIENCE_BASE}. Names and prices are never used. This is a playful mapping, not a judgement of the food.`);
  const columns = el('div', 'menu-scan-columns');
  body.append(explain, columns);
  panel.append(summary, body);
  hostEl.append(panel);
  hostEl.hidden = true;

  let key = '';
  function render(details: SimulationDetails) {
    const menus = details.slots.length
      ? details.slots.flatMap(s => (s.menu ? [s.menu] : []))
      : details.menus;
    const next = JSON.stringify(menus.map(m => [m.id, m.fetchedAt]));
    if (next === key) return;
    key = next;
    hostEl.hidden = menus.length === 0;
    const total = menus.reduce((n, m) => n + Math.min(MAX_ITEMS, m.extraction.menu.length), 0);
    summary.textContent = `Menu items scanned · ${total} item${total === 1 ? '' : 's'} from ${menus.length} menu${menus.length === 1 ? '' : 's'}`;
    columns.replaceChildren(...menus.map(restaurantSection));
  }

  const unsubscribe = controller.subscribeDetails?.(render) ?? (() => {});
  return () => { unsubscribe(); panel.remove(); };
}
