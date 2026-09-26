import { mountFlyPick } from './ui/app';
import { createPreviewController } from './ui/previewController';
import { createSimulationController } from './simulation/controller.ts';
import './ui/styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App container is missing.');

// Modes are explicit and never switch on their own:
//   (default)       live fly brain, menus read live with Firecrawl
//   ?menus=cached   live fly brain, the saved Firecrawl captures (labeled)
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
  const controller = createSimulationController({
    mode: mode === 'replay' || mode === 'mock' ? mode : 'live',
    menuSource: params.get('menus') === 'cached' ? 'cached' : 'live',
  });
  const app = mountFlyPick(root, controller);
  import.meta.hot?.dispose(() => {
    app.dispose();
    controller.dispose();
  });
}
