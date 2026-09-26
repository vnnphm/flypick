import { createScene } from './scene/createScene';
import './ui/styles.css';

const container = document.querySelector<HTMLDivElement>('#scene');
if (!container) throw new Error('Scene container is missing.');

try {
  createScene(container);
} catch (error) {
  container.textContent = 'The 3D scene could not load. Try a browser with WebGL support.';
  console.error(error);
}
