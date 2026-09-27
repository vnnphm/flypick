import type { CityResult, PlaceResult, SimulationDetails, SimulationState, SlotState } from '../contracts';
import { cityAt, findCities, findRestaurants } from '../data/places';

type SearchController = {
  subscribe(listener: (state: SimulationState) => void): () => void;
  subscribeDetails(listener: (details: SimulationDetails) => void): () => void;
  choosePlace(slot: 0 | 1, place: PlaceResult | null): Promise<void>;
  reset(): Promise<void>;
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const host = (url: string) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

/**
 * City + two restaurant searches. Picking a result hands the place to the controller, which reads
 * its menu; each card shows "Reading menu…" then "Ready", or why the menu couldn't be read.
 */
export function mountRestaurantSearch(hostEl: HTMLElement, controller: SearchController) {
  const el = document.createElement('section');
  el.className = 'picker';
  el.setAttribute('aria-label', 'Choose two restaurants');
  el.innerHTML = `
    <div class="picker-city">
      <form class="city-form" id="city-form">
        <label for="city-input">1. Where are you eating?</label>
        <div class="picker-row">
          <input id="city-input" type="search" placeholder="Enter a city" autocomplete="address-level2" maxlength="100">
          <button class="button secondary" type="submit">Find city</button>
          <button class="button secondary" type="button" id="use-location">Use my location</button>
        </div>
      </form>
      <ul class="picker-results" id="city-results" hidden></ul>
      <p class="picker-chosen" id="city-chosen" hidden></p>
      <p class="picker-note" id="city-note" role="status"></p>
    </div>
    <p class="picker-step">2. Pick two places you’d eat at.</p>
    <div class="picker-slots" id="slots"></div>
    <p class="picker-credit">Places from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>. Menus read with Firecrawl.</p>`;
  hostEl.append(el);

  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
  const cityInput = $<HTMLInputElement>('city-input');
  const cityResults = $('city-results');
  const cityChosen = $('city-chosen');
  const cityNote = $('city-note');
  const locate = $<HTMLButtonElement>('use-location');
  const slotsEl = $('slots');

  let city: CityResult | null = null;
  let slots: SlotState[] = [];
  let locked = false;
  let disposed = false;
  const queries = ['', ''];
  const results: PlaceResult[][] = [[], []];
  const searching = [false, false];
  const searchErrors: (string | null)[] = [null, null];
  const timers: (ReturnType<typeof setTimeout> | undefined)[] = [undefined, undefined];
  const aborts: (AbortController | null)[] = [null, null];
  let cityAbort: AbortController | null = null;

  function setCity(next: CityResult | null) {
    city = next;
    cityResults.hidden = true;
    cityChosen.hidden = !city;
    if (city) {
      cityChosen.innerHTML = `Searching near <strong>${esc(city.label)}</strong> <button type="button" class="link-button" id="change-city">Change</button>`;
      cityChosen.querySelector('button')!.addEventListener('click', () => { setCity(null); cityInput.focus(); });
      cityNote.textContent = '';
    }
    el.querySelector<HTMLFormElement>('#city-form')!.hidden = !!city;
    for (const i of [0, 1] as const) { results[i] = []; queries[i] = ''; }
    renderSlots();
  }

  async function lookupCity(q: string) {
    cityAbort?.abort();
    const ctl = new AbortController();
    cityAbort = ctl;
    cityNote.textContent = 'Looking up the city…';
    try {
      const found = await findCities(q, ctl.signal);
      if (ctl.signal.aborted) return;
      if (!found.length) { cityNote.textContent = `No city called “${q}” was found. Try adding the state or country.`; return; }
      if (found.length === 1) return setCity(found[0]);
      cityNote.textContent = 'Which one?';
      cityResults.replaceChildren(...found.map(c => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'picker-result';
        b.innerHTML = `<strong>${esc(c.name)}</strong><span>${esc(c.label)}</span>`;
        b.addEventListener('click', () => setCity(c));
        li.append(b);
        return li;
      }));
      cityResults.hidden = false;
    } catch (err) {
      if (!ctl.signal.aborted) cityNote.textContent = `City search failed: ${(err as Error).message}`;
    }
  }

  el.querySelector('#city-form')!.addEventListener('submit', e => {
    e.preventDefault();
    const q = cityInput.value.trim();
    if (q.length >= 2) void lookupCity(q);
  });

  locate.addEventListener('click', () => {
    if (!('geolocation' in navigator)) { cityNote.textContent = 'This browser can’t share its location. Enter a city instead.'; return; }
    cityNote.textContent = 'Finding your location…';
    locate.disabled = true;
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const c = await cityAt(pos.coords.latitude, pos.coords.longitude);
        if (disposed) return;
        if (c) setCity(c); else cityNote.textContent = 'Couldn’t name the area around you. Enter a city instead.';
      } catch (err) {
        cityNote.textContent = `Location lookup failed: ${(err as Error).message}`;
      } finally { locate.disabled = false; }
    }, err => {
      locate.disabled = false;
      cityNote.textContent = err.code === err.PERMISSION_DENIED ? 'Location permission was declined. Enter a city instead.' : 'Couldn’t get your location. Enter a city instead.';
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 });
  });

  function search(i: 0 | 1, q: string) {
    queries[i] = q;
    clearTimeout(timers[i]);
    aborts[i]?.abort();
    searchErrors[i] = null;
    if (!city || q.trim().length < 2) { results[i] = []; searching[i] = false; renderResults(i); return; }
    searching[i] = true;
    renderResults(i);
    timers[i] = setTimeout(async () => {
      const ctl = new AbortController();
      aborts[i] = ctl;
      try {
        results[i] = await findRestaurants(q.trim(), city!, ctl.signal);
      } catch (err) {
        if (ctl.signal.aborted) return;
        results[i] = [];
        searchErrors[i] = `Search failed: ${(err as Error).message}`;
      }
      searching[i] = false;
      renderResults(i);
    }, 350);
  }

  function renderResults(i: 0 | 1) {
    const list = slotsEl.querySelector<HTMLElement>(`#results-${i}`);
    if (!list) return;
    const note = slotsEl.querySelector<HTMLElement>(`#search-note-${i}`)!;
    note.textContent = searchErrors[i] ?? (searching[i] ? 'Searching…'
      : queries[i].trim().length >= 2 && !results[i].length ? `Nothing called “${queries[i].trim()}” near ${city?.name ?? 'there'}.` : '');
    const other = slots[1 - i]?.place?.id;
    list.replaceChildren(...results[i].map(p => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'picker-result';
      b.disabled = locked || p.id === other;
      b.innerHTML = `<strong>${esc(p.name)}</strong><span>${esc(p.address || 'Address not listed')}${p.id === other ? ' · already chosen' : ''}</span>`;
      b.addEventListener('click', () => { results[i] = []; queries[i] = ''; void controller.choosePlace(i, p).catch(err => { searchErrors[i] = (err as Error).message; renderResults(i); }); });
      li.append(b);
      return li;
    }));
  }

  function slotBody(sl: SlotState): string {
    const i = sl.slot;
    const label = `<p class="eyebrow">Option ${String(i + 1).padStart(2, '0')}</p>`;
    if (!sl.place) {
      return `${label}
        <label class="visually-hidden" for="search-${i}">Search restaurant ${i + 1}</label>
        <input id="search-${i}" type="search" placeholder="${city ? `Search a restaurant in ${esc(city.name)}` : 'Choose a city first'}" ${city && !locked ? '' : 'disabled'} maxlength="80" autocomplete="off" value="${esc(queries[i])}">
        <p class="picker-note" id="search-note-${i}" role="status"></p>
        <ul class="picker-results" id="results-${i}"></ul>`;
    }
    const menu = sl.menu;
    const status = sl.status === 'reading' ? `<span class="slot-status is-reading">Reading menu…</span>`
      : sl.status === 'ready' ? `<span class="slot-status is-ready">${esc(sl.message ?? 'Ready')}</span>${menu ? ` <a href="${esc(menu.sourceUrl)}" target="_blank" rel="noopener">menu on ${esc(host(menu.sourceUrl))}</a>` : ''}`
      : `<span class="slot-status is-error">${esc(sl.message ?? 'The menu couldn’t be read.')}</span>`;
    return `${label}<h3>${esc(sl.place.name)}</h3><p class="slot-address">${esc(sl.place.address || 'Address not listed')}</p>
      <p class="slot-line" role="status">${status}</p>
      <button type="button" class="link-button" data-change="${i}" ${locked ? 'disabled' : ''}>${sl.status === 'error' ? 'Choose another place' : 'Change'}</button>`;
  }

  function renderSlots() {
    const focused = document.activeElement instanceof HTMLInputElement && document.activeElement.id.startsWith('search-') ? document.activeElement.id : null;
    slotsEl.replaceChildren(...slots.map(sl => {
      const card = document.createElement('article');
      card.className = `slot-card option-${sl.slot} is-${sl.status}`;
      card.innerHTML = slotBody(sl);
      const input = card.querySelector<HTMLInputElement>('input');
      input?.addEventListener('input', () => search(sl.slot, input.value));
      card.querySelector('[data-change]')?.addEventListener('click', () => {
        void controller.choosePlace(sl.slot, null).then(() => slotsEl.querySelector<HTMLInputElement>(`#search-${sl.slot}`)?.focus());
      });
      return card;
    }));
    for (const i of [0, 1] as const) renderResults(i);
    if (focused) {
      const again = slotsEl.querySelector<HTMLInputElement>(`#${focused}`);
      again?.focus();
      again?.setSelectionRange(again.value.length, again.value.length);
    }
  }

  let slotsKey = '';
  const offDetails = controller.subscribeDetails(d => {
    const key = JSON.stringify(d.slots.map(s => [s.place?.id, s.status, s.message]));
    slots = d.slots;
    if (key !== slotsKey) { slotsKey = key; renderSlots(); }
  });
  const offState = controller.subscribe(s => {
    const next = s.status === 'running';
    el.hidden = s.status === 'running' || s.status === 'selected' || s.status === 'no-choice';
    if (next !== locked) { locked = next; renderSlots(); }
  });

  /** After a result: clear both choices (the city stays) and bring the search back into view. */
  async function startOver() {
    await controller.reset();
    for (const i of [0, 1] as const) { clearTimeout(timers[i]); aborts[i]?.abort(); results[i] = []; queries[i] = ''; searchErrors[i] = null; }
    await controller.choosePlace(0, null);
    await controller.choosePlace(1, null);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    (city ? slotsEl.querySelector<HTMLInputElement>('#search-0') : cityInput)?.focus({ preventScroll: true });
  }

  function dispose() {
    disposed = true;
    offDetails();
    offState();
    for (const i of [0, 1]) { clearTimeout(timers[i]); aborts[i]?.abort(); }
    cityAbort?.abort();
    el.remove();
  }

  return { dispose, startOver };
}
