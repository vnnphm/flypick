import type { SimulationController, SimulationState } from '../contracts';
import { createScene } from '../scene/createScene';
import { mountBrainPanel } from './brainPanel';

const flyIcon = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><ellipse cx="12" cy="16" rx="10" ry="6" transform="rotate(30 12 16)" fill="currentColor" opacity=".3"/><ellipse cx="28" cy="16" rx="10" ry="6" transform="rotate(-30 28 16)" fill="currentColor" opacity=".3"/><ellipse cx="20" cy="24" rx="5" ry="10" fill="currentColor"/><circle cx="20" cy="12" r="5" fill="currentColor"/></svg>`;

/** Render the supplied controller's state without owning movement or decisions. */
export function mountFlyPick(root: HTMLElement, controller: SimulationController, options: { search?: boolean } = {}) {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar"><a class="brand" href="./" aria-label="FlyPick home">${flyIcon}<span>flypick<span class="brand-dot">.</span></span></a><span class="topbar-note">A little help with a big little decision.</span><span class="mode-badge" id="mode"></span></header>
      <main>
        <section class="intro" aria-labelledby="title"><p class="eyebrow">Your shortlist. A different perspective.</p><h1 id="title">Two good options.<br><em>One tiny decision-maker.</em></h1><p>You pick the places. Let a little curiosity take it from here.</p></section>
        <section class="experience" aria-label="Restaurant choice arena">
          <div id="picker-host"></div>
          <div class="world-and-brain" id="stage"><div class="stage"><div id="scene" role="img" aria-label="A small fly with a locator ring in an explorable field with two restaurant storefronts, scattered fruit patches, grasses, plants, and rocks."></div></div><aside class="brain-host" id="brain-panel" aria-label="Fly Brain telemetry"></aside></div>
          <div class="restaurant-cards" id="restaurants" aria-label="Your restaurant options"></div>
          <div class="decision" aria-live="polite" aria-atomic="true"><p class="eyebrow" id="status-label"></p><h2 id="status-title"></h2><p id="status-message"></p></div>
          <div class="action-bar"><label class="approval"><input id="approve" type="checkbox"><span>I’d eat at either.<small>Two places you already like.</small></span></label><div class="buttons"><button class="button secondary" id="reset" type="button">Reset</button><button class="button primary" id="start" type="button">Ask the Fly <span aria-hidden="true">↗</span></button></div></div>
          <p class="action-error" id="action-error" role="alert" hidden></p>
        </section>
        <footer class="footer"><p id="disclosure"></p><details><summary>How the fly picks</summary><p>The live experience maps menu features to sensory signals for a simulated fly brain. The simulation supplies the fly’s position and the final result. Wings and lighting are decorative.</p><p>These designed signals do not measure food quality or biological food preference. Your shortlist stays your choice.</p></details></footer>
        <div id="preview-tools"></div>
      </main>
    </div>`;
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const start = get<HTMLButtonElement>('start');
  const reset = get<HTMLButtonElement>('reset');
  const approve = get<HTMLInputElement>('approve');
  const actionError = get('action-error');
  const sceneContainer = get('scene');
  const brainPanel = mountBrainPanel(get('brain-panel'), controller);
  let scene: ReturnType<typeof createScene> | undefined;
  let sceneFailed = false;
  try { scene = createScene(sceneContainer, brainPanel.setAmbient); }
  catch (error) {
    sceneFailed = true;
    sceneContainer.replaceChildren();
    const notice = document.createElement('p');
    notice.className = 'scene-error';
    notice.textContent = 'The 3D view couldn’t load. Try a browser with WebGL enabled. Restaurant and status information is still available below.';
    sceneContainer.append(notice);
    console.error('Unable to initialize the FlyPick scene', error);
  }
  let state: SimulationState | undefined;
  let pending = false;
  let disposed = false;
  let cardsKey = '';
  let decisionKey = '';
  const cards = new Map<string, HTMLElement>();
  function refreshControls() {
    start.disabled = !state || state.status !== 'ready' || !approve.checked || pending || sceneFailed || state.restaurants.length !== 2;
    approve.disabled = pending || state?.status !== 'ready';
    reset.disabled = pending || !state;
    start.setAttribute('aria-busy', String(pending));
  }
  function update(next: SimulationState) {
    if (disposed) return;
    if (state?.runId !== next.runId) {
      actionError.hidden = true;
      const previousOptions = state?.restaurants.map(r => `${r.id}:${r.name}`).join('|');
      const nextOptions = next.restaurants.map(r => `${r.id}:${r.name}`).join('|');
      if (previousOptions !== nextOptions) approve.checked = false;
    }
    state = next;
    scene?.update(next);
    brainPanel.update(next);
    if (options.search) {
      // search mode: the map appears once both places are ready; cards replace the picker during a run
      get('stage').hidden = next.restaurants.length !== 2;
      get('restaurants').hidden = !['running', 'selected', 'no-choice'].includes(next.status);
    }
    root.dataset.status = next.status;
    root.dataset.mode = next.mode;
    get('mode').textContent = next.mode === 'mock' ? 'Mock mode · no live brain' : next.mode === 'replay' ? 'Recorded run · replay' : 'Live simulation';
    get('disclosure').textContent = next.mode === 'mock' ? 'Mock mode. Movement and results are synthetic; no live brain is running.' : next.mode === 'replay' ? 'Recorded run. Original inputs and outcome; no new decision is being made.' : 'Simulated fly brain. Simplified movement. Your restaurant shortlist.';
    const key = JSON.stringify(next.restaurants.map(r => [r.id, r.name]));
    if (key !== cardsKey) {
      cardsKey = key;
      cards.clear();
      const container = get('restaurants');
      container.replaceChildren();
      next.restaurants.forEach((restaurant, index) => {
        const card = document.createElement('article');
        card.className = `restaurant-card option-${index % 2}`;
        const letter = document.createElement('span');
        letter.className = 'restaurant-letter';
        letter.textContent = String.fromCharCode(65 + index);
        const copy = document.createElement('div');
        const label = document.createElement('p');
        label.className = 'eyebrow';
        label.textContent = `Option ${String(index + 1).padStart(2, '0')}`;
        const name = document.createElement('h3');
        name.textContent = restaurant.name;
        copy.append(label, name);
        const badge = document.createElement('span');
        badge.className = 'restaurant-outcome';
        card.append(letter, copy, badge);
        container.append(card);
        cards.set(restaurant.id, card);
      });
    }
    for (const [id, card] of cards) {
      const selected = next.status === 'selected' && next.selectedRestaurantId === id;
      card.classList.toggle('is-selected', selected);
      card.querySelector('.restaurant-outcome')!.textContent = selected ? 'Picked ✓' : '';
    }
    const selected = next.restaurants.find(r => r.id === next.selectedRestaurantId);
    const titles: Record<SimulationState['status'], string> = {
      loading: 'Getting things ready…', ready: 'Good with both? Let’s begin.',
      running: next.mode === 'mock' ? 'Mock run in progress.' : 'A little patience. A little fly.',
      selected: selected ? `${next.mode === 'mock' ? 'Mock pick' : 'The fly picked'}: ${selected.name}.` : 'The result is unavailable.',
      'no-choice': 'The fly couldn’t decide. Try again?', error: 'Something interrupted the run.',
    };
    const messages: Record<SimulationState['status'], string> = {
      loading: 'Preparing the restaurant options and simulation.', ready: 'Confirm your two options, then ask the fly.',
      running: 'Watch the trail. The simulation will report the result.',
      selected: 'One tiny decision, settled. Reset to prepare another run.',
      'no-choice': 'No restaurant was selected. Reset when you’re ready.', error: 'No choice was made. Reset to try again.',
    };
    const nextDecisionKey = JSON.stringify([next.status, next.mode, next.selectedRestaurantId, next.message, selected?.name]);
    if (nextDecisionKey !== decisionKey) {
      decisionKey = nextDecisionKey;
      get('status-label').textContent = next.mode === 'mock' ? `Mock mode / ${next.status}` : next.mode === 'replay' ? `Recorded run / ${next.status}` : next.status.replace('-', ' ');
      get('status-title').textContent = titles[next.status];
      get('status-message').textContent = next.message || messages[next.status];
    }
    refreshControls();
  }
  async function act(action: 'start' | 'reset') {
    if (pending || disposed) return;
    scene?.beginAction();
    let succeeded = false;
    pending = true;
    actionError.hidden = true;
    refreshControls();
    try { await controller[action](); succeeded = true; }
    catch {
      if (!disposed) {
        actionError.textContent = `Couldn’t ${action} the run. Please try again.`;
        actionError.hidden = false;
      }
    } finally {
      if (!disposed) scene?.endAction(action, succeeded);
      pending = false;
      if (!disposed) refreshControls();
    }
  }
  const onStart = () => { if (!start.disabled) void act('start'); };
  const onReset = () => { if (!reset.disabled) void act('reset'); };
  start.addEventListener('click', onStart);
  reset.addEventListener('click', onReset);
  approve.addEventListener('change', refreshControls);
  const unsubscribe = controller.subscribe(update);
  return {
    previewHost: get('preview-tools'),
    pickerHost: get('picker-host'),
    dispose() {
      disposed = true;
      unsubscribe();
      brainPanel.dispose();
      start.removeEventListener('click', onStart);
      reset.removeEventListener('click', onReset);
      approve.removeEventListener('change', refreshControls);
      scene?.dispose();
      root.replaceChildren();
    },
  };
}
