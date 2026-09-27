import { mountFlyPick } from './ui/app';
import { createPreviewController } from './ui/previewController';
import { mountRestaurantSearch } from './ui/search';
import { createSimulationController } from './simulation/controller.ts';
import './ui/styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App container is missing.');

// Modes are explicit and never switch on their own:
//   (default)          live fly brain; search a city and two restaurants, menus read with Firecrawl
//   ?menus=shortlist   live fly brain, the fixed shortlist read live with Firecrawl
//   ?menus=cached      live fly brain, the shortlist's saved Firecrawl captures (labeled)
//   ?mode=replay    a genuine recorded run
//   ?mode=mock      synthetic steering for interface work
//   ?mode=preview   the visual preview with authored fixtures
const params = new URLSearchParams(location.search);
const mode = params.get('mode');

if (mode === 'preview') {
  const preview = createPreviewController();
  const app = mountFlyPick(root, preview.controller);
  const removePreviewControls = preview.mountControls(app.previewHost);
  import.meta.hot?.dispose(() => {
    removePreviewControls();
    app.dispose();
  });
} else {
  const menus = params.get('menus');
  const runMode = mode === 'replay' || mode === 'mock' ? mode : 'live';
  const search = runMode === 'live' && menus !== 'cached' && menus !== 'shortlist';
  const controller = createSimulationController({
    mode: runMode,
    menuSource: search ? 'search' : menus === 'cached' ? 'cached' : 'live',
  });
  let picker: ReturnType<typeof mountRestaurantSearch> | undefined;
  const app = mountFlyPick(root, controller, { search, onPickAgain: search ? () => picker!.startOver() : undefined });
  picker = search ? mountRestaurantSearch(app.pickerHost, controller) : undefined;
  import.meta.hot?.dispose(() => {
    picker?.dispose();
    app.dispose();
    controller.dispose();
  });
}
