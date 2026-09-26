import { finite, fraction, observeBrain, presentation, RATE_SCALE_HZ, steering } from './brainTelemetry.ts';
import type { BrainReading, DetailsSource } from './brainTelemetry.ts';
import './brainPanel.css';

const number = (value: unknown, digits = 1) => {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(digits);
};

export function mountBrainPanel(host: HTMLElement, controller: DetailsSource) {
  host.innerHTML = `<details class="brain-panel"><summary>Fly Brain <span>Telemetry</span></summary>
    <div class="brain-content">
      <p class="brain-mode"></p><p class="brain-status" role="status"></p>
      <section aria-label="Steering"><div class="brain-line"><h3>Steering</h3><output class="brain-turn"></output></div>
        <div class="brain-steering" role="meter" aria-label="Decoded steering" aria-valuemin="-1" aria-valuemax="1"><i></i></div>
        <div class="brain-ends"><span>Left</span><span>Right</span></div></section>
      <section aria-label="Steering neurons"><h3>Steering neurons</h3>
        <div class="brain-rate-left"></div><div class="brain-rate-right"></div>
        <p class="brain-note">DNa02 · shared 0–5 Hz display scale</p></section>
      <section aria-label="Time in zone"><h3>Time in zone</h3><div class="brain-zones"></div></section>
      <section aria-label="Decision timer"><div class="brain-line"><h3>Simulation time</h3><output class="brain-time"></output></div><div class="brain-clock"></div></section>
      <p class="brain-caption">Constant speed · neural steering.</p>
      <details class="brain-extra"><summary>Neural details</summary>
        <p class="brain-note">Measured activity; these rates do not establish control of movement.</p>
        <dl class="brain-rates"></dl><dl class="brain-runtime"></dl>
      </details>
    </div></details>`;
  const get = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const panel = get<HTMLDetailsElement>('.brain-panel');
  const mobile = matchMedia('(max-width: 700px)');
  const resize = () => { panel.open = !mobile.matches; };
  resize();
  mobile.addEventListener('change', resize);
  function bar(parent: HTMLElement, label: string) {
    const row = document.createElement('div'); row.className = 'brain-bar-row';
    const line = document.createElement('div'); line.className = 'brain-line';
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('output');
    const track = document.createElement('div'); track.className = 'brain-bar';
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('i'); track.append(fill);
    line.append(name, value); row.append(line, track); parent.append(row);
    return (ratio: number | null, text: string) => {
      value.textContent = text;
      fill.style.width = `${(ratio ?? 0) * 100}%`;
      track.setAttribute('aria-valuetext', ratio === null ? 'Unavailable' : text);
      if (ratio === null) track.removeAttribute('aria-valuenow');
      else track.setAttribute('aria-valuenow', String(ratio * 100));
      track.dataset.missing = String(ratio === null);
    };
  }
  const left = bar(get('.brain-rate-left'), 'DNa02 left');
  const right = bar(get('.brain-rate-right'), 'DNa02 right');
  const clock = bar(get('.brain-clock'), 'Elapsed / timeout');
  const zoneBars = new Map<string, ReturnType<typeof bar>>();
  let zoneKey = '';
  function list(parent: HTMLElement, items: [string, string][]) {
    parent.replaceChildren();
    for (const [name, value] of items) {
      const dt = document.createElement('dt'); dt.textContent = name;
      const dd = document.createElement('dd'); dd.textContent = value;
      parent.append(dt, dd);
    }
  }
  function render(reading: BrainReading) {
    const view = presentation(reading);
    get('.brain-mode').textContent = view.mode;
    get('.brain-status').textContent = view.status;
    const turn = steering(view.motor?.turn);
    get('.brain-turn').textContent = turn ? `${turn.direction} · ${number(turn.value, 2)}` : 'Unavailable';
    const meter = get('.brain-steering');
    meter.dataset.missing = String(!turn);
    meter.querySelector<HTMLElement>('i')!.style.left = `${turn?.position ?? 50}%`;
    meter.setAttribute('aria-valuetext', turn ? `${turn.direction}, ${turn.value}` : 'Unavailable');
    if (turn) meter.setAttribute('aria-valuenow', String(Math.max(-1, Math.min(1, turn.value))));
    else meter.removeAttribute('aria-valuenow');
    const rates = view.motor?.ratesHz;
    left(fraction(rates?.['DNa02 L'], RATE_SCALE_HZ), `${number(rates?.['DNa02 L'])} Hz`);
    right(fraction(rates?.['DNa02 R'], RATE_SCALE_HZ), `${number(rates?.['DNa02 R'])} Hz`);
    const restaurants = reading.state?.restaurants ?? [];
    const key = JSON.stringify(restaurants.map(r => [r.id, r.name]));
    if (key !== zoneKey) {
      zoneKey = key; zoneBars.clear(); get('.brain-zones').replaceChildren();
      restaurants.forEach(r => zoneBars.set(r.id, bar(get('.brain-zones'), r.name)));
      if (!restaurants.length) get('.brain-zones').textContent = 'Unavailable';
    }
    for (const r of restaurants) {
      const dwell = view.timing?.dwell[r.id], required = view.timing?.dwellRequiredS;
      zoneBars.get(r.id)!(fraction(dwell, required), `${number(dwell)} / ${number(required)} s`);
    }
    const elapsed = view.timing?.simTimeS, timeout = view.timing?.timeoutS;
    get('.brain-time').textContent = `${number(elapsed)} / ${number(timeout)} s`;
    clock(fraction(elapsed, timeout), `${number(elapsed)} / ${number(timeout)} simulation seconds`);
    list(get('.brain-rates'), ['DNg100', 'MDN', 'DNp01'].map(name => [name,
      `L ${number(rates?.[`${name} L`])} · R ${number(rates?.[`${name} R`])} Hz`]));
    const runtime = view.runtime;
    list(get('.brain-runtime'), [
      ['Model revision', runtime?.revision || 'Unavailable'],
      ['Neurons', finite(runtime?.neurons)?.toLocaleString('en-US') ?? '—'],
      ['Synapses', finite(runtime?.synapses)?.toLocaleString('en-US') ?? '—'],
      ['Brain step', `${number(view.performance?.runtime.stepMs, 2)} ms`],
      ['Simulation / real time', `${number(view.performance?.simSpeed, 2)}×`],
    ]);
  }
  const feed = observeBrain(controller, render);
  // Rapid measurements are available to browse, without announcing every 10 Hz update.
  host.querySelectorAll('output').forEach(output => output.setAttribute('aria-live', 'off'));
  render({ ambient: false, stale: false, available: false });
  return {
    update: feed.update, setAmbient: feed.setAmbient,
    dispose() { feed.dispose(); mobile.removeEventListener('change', resize); host.replaceChildren(); },
  };
}
