import { mountFlyPick } from './ui/app';
import { createPreviewController } from './ui/previewController';
import './ui/styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App container is missing.');

// Explicit visual preview entry point. Replace with the teammate's controller at integration.
const preview = createPreviewController();
const app = mountFlyPick(root, preview.controller);
const removePreviewControls = preview.mountControls(app.previewHost);
import.meta.hot?.dispose(() => {
  removePreviewControls();
  app.dispose();
});
