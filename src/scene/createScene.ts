import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState } from '../contracts';
import { createFly } from './fly';
import { createCourtyard } from './courtyard';
import { createIdleAnimation } from './idle';
import { createIdleFruit } from './idleFruit';

const COLORS = ['#8da78e', '#c68b63'];
const TRAIL_LIMIT = 180;

export function createScene(container: HTMLElement, onAmbientChange?: (active: boolean) => void) {
  const scene = new THREE.Scene();
  // Perspective/orbit setup adapted from the pinned fly.ai renderer; see fly-ai-NOTICE.md.
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 400);
  scene.background = new THREE.Color('#c5cfbd');
  scene.fog = new THREE.Fog('#c5cfbd', 35, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minAzimuthAngle = -Math.PI * 0.85;
  controls.maxAzimuthAngle = Math.PI * 0.85;
  controls.minDistance = 5;
  controls.maxDistance = 28;
  const cameraTools = document.createElement('div');
  cameraTools.className = 'camera-tools';
  const hint = document.createElement('span');
  hint.textContent = 'Drag to orbit · scroll to zoom';
  const resetView = document.createElement('button');
  resetView.type = 'button';
  resetView.textContent = 'Reset view';
  cameraTools.append(hint, resetView);
  // Controls must be outside the scene's role=img so keyboard/AT users can reach them.
  (container.parentElement ?? container).append(cameraTools);
  scene.add(new THREE.HemisphereLight('#fff6df', '#8b9e7b', 1.8));
  const sun = new THREE.DirectionalLight('#fff6e6', 1.9);
  sun.position.set(-6, 12, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  sun.shadow.bias = -0.001;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#d4e8d6', 1.2);
  rim.position.set(5, 4, 6);
  scene.add(rim);
  let environment = new THREE.Group();
  scene.add(environment);
  const fly = createFly();
  scene.add(fly.root);
  // Reference locator ring keeps the smaller fly visible without enlarging its body.
  const locator = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.022, 3, 24), new THREE.MeshBasicMaterial({ color: '#e8f7cb', transparent: true, opacity: 0.9, depthTest: false }));
  locator.rotation.x = Math.PI / 2;
  locator.renderOrder = 2;
  scene.add(locator);
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const labels = document.createElement('div');
  labels.className = 'marker-labels';
  labels.setAttribute('aria-hidden', 'true');
  container.append(labels);
  const flyLabel = document.createElement('span');
  flyLabel.className = 'scene-fly-label';
  flyLabel.textContent = 'Fly';
  container.append(flyLabel);
  let markers: { id: string; mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>; label: HTMLElement; position: THREE.Vector3 }[] = [];
  let geometryKey = '';
  let runId = '';
  let running = false;
  let state: SimulationState | null = null;
  let width = 1;
  let height = 1;
  let radius = 6;
  let centerX = 0;
  let centerZ = 0;
  let disposed = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Explicit frontend preview only; disabled for normal URLs and all live/replay states.
  const idleEnabled = new URLSearchParams(location.search).get('ambient') === '1';
  const idle = createIdleAnimation(idleEnabled);
  const fruit = idleEnabled ? createIdleFruit() : undefined;
  const ambientLabel = idleEnabled ? document.createElement('span') : undefined;
  if (fruit && ambientLabel) {
    scene.add(fruit);
    ambientLabel.className = 'ambient-label';
    ambientLabel.textContent = 'Ambient animation · decorative only';
    ambientLabel.hidden = true;
    container.append(ambientLabel);
  }
  const trailPoints: { x: number; z: number; time: number }[] = [];
  const trailGeometry = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(TRAIL_LIMIT * 3);
  const trailColors = new Float32Array(TRAIL_LIMIT * 3);
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true }));
  trail.frustumCulled = false;
  scene.add(trail);

  function fitCamera() {
    controls.enableDamping = false;
    controls.update();
    const aspect = width / height;
    camera.aspect = aspect;
    const distance = Math.max(radius * 2.3, radius * 1.6 / aspect);
    controls.maxDistance = Math.max(28, distance * 1.4);
    controls.target.set(centerX, 0.4, centerZ);
    camera.position.copy(controls.target).add(new THREE.Vector3(0.18, 0.68, 1).normalize().multiplyScalar(distance));
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    controls.update();
    controls.enableDamping = !reducedMotion.matches;
    controls.saveState();
  }
  resetView.addEventListener('click', fitCamera);
  function updateLabels() {
    for (const marker of markers) {
      const projected = marker.position.clone().project(camera);
      marker.label.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      marker.label.style.left = `${(projected.x + 1) * width / 2}px`;
      marker.label.style.top = `${(1 - projected.y) * height / 2}px`;
    }
  }
  function resize() {
    ({ width, height } = container.getBoundingClientRect());
    if (!width || !height) return;
    renderer.setSize(width, height);
    fitCamera();
    updateLabels();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  function disposeObject(group: THREE.Object3D) {
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
  }

  function update(next: SimulationState) {
    idle.update(next);
    const freshRun = runId !== next.runId;
    if (freshRun) {
      trailPoints.length = 0;
      trailGeometry.setDrawRange(0, 0);
      runId = next.runId;
    }
    const nextKey = JSON.stringify(next.restaurants);
    if (nextKey !== geometryKey || freshRun) {
      geometryKey = nextKey;
      disposeObject(markerGroup);
      markerGroup.clear();
      labels.replaceChildren();
      markers = next.restaurants.map((restaurant, index) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(restaurant.radius, restaurant.radius, 0.035, 64), new THREE.MeshStandardMaterial({ color: COLORS[index % COLORS.length], roughness: 0.9 }));
        mesh.position.set(restaurant.x, 0.01, restaurant.z);
        mesh.receiveShadow = true;
        markerGroup.add(mesh);
        const ring = new THREE.Mesh(new THREE.RingGeometry(restaurant.radius * 0.87, restaurant.radius * 0.89, 64), new THREE.MeshBasicMaterial({ color: '#fff8e9', side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(restaurant.x, 0.032, restaurant.z);
        markerGroup.add(ring);
        const label = document.createElement('span');
        label.className = 'marker-label';
        label.textContent = `${String.fromCharCode(65 + index)} · ${restaurant.name}`;
        labels.append(label);
        return { id: restaurant.id, mesh, label, position: new THREE.Vector3(restaurant.x, 0.08, restaurant.z + restaurant.radius + 0.4) };
      });
      // Frame supplied geometry at preparation/reset; never follow the moving fly.
      if (freshRun || !state || state.status !== 'running') {
        const xs = [next.fly.x, ...next.restaurants.map(r => r.x)];
        const zs = [next.fly.z, ...next.restaurants.map(r => r.z)];
        centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
        centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
        radius = Math.max(5, ...next.restaurants.map(r => Math.hypot(r.x - centerX, r.z - centerZ) + r.radius + 1.2), Math.hypot(next.fly.x - centerX, next.fly.z - centerZ) + 1.2);
        fitCamera();
      }
      disposeObject(environment);
      scene.remove(environment);
      environment = createCourtyard(next.restaurants, { x: centerX, z: centerZ }, radius);
      scene.add(environment);
    }
    const previous = trailPoints.at(-1);
    if (next.status === 'running' && (!previous || Math.hypot(next.fly.x - previous.x, next.fly.z - previous.z) > 0.015)) {
      trailPoints.push({ x: next.fly.x, z: next.fly.z, time: performance.now() });
      if (trailPoints.length > TRAIL_LIMIT) trailPoints.shift();
    }
    for (const marker of markers) {
      const selected = next.status === 'selected' && next.selectedRestaurantId === marker.id;
      marker.mesh.material.emissive.set(selected ? '#607d4d' : '#000000');
      marker.mesh.material.emissiveIntensity = selected ? 0.3 : 0;
      marker.label.classList.toggle('is-selected', selected);
    }
    running = next.status === 'running';
    state = next;
    updateLabels();
  }
  const faded = new THREE.Color('#d8d0ba');
  const ink = new THREE.Color('#677d66');
  const color = new THREE.Color();
  // One transform writer selects local ambient presentation OR the supplied pose.
  let wasAmbient = false;
  function renderFly(now: number) {
    const pose = idle.sample(now, reducedMotion.matches);
    if (pose.ambient !== wasAmbient) {
      wasAmbient = pose.ambient;
      onAmbientChange?.(wasAmbient);
    }
    fly.root.position.set(pose.x, pose.y, pose.z);
    locator.position.set(pose.x, 0.055, pose.z);
    fly.root.rotation.set(pose.pitch, pose.heading, 0, 'YXZ');
    fly.animate(now / 1000, (pose.ambient ? pose.flying : running) && !reducedMotion.matches);
    if (fruit) { fruit.visible = pose.ambient; fruit.position.set(pose.anchor.x, 0, pose.anchor.z); }
    if (ambientLabel) ambientLabel.hidden = !pose.ambient;
  }
  function frame(now: number) {
    if (disposed) return;
    renderFly(now);
    controls.enableDamping = !reducedMotion.matches;
    controls.update();
    updateLabels();
    const flyScreen = fly.root.position.clone().add(new THREE.Vector3(0, 0.7, 0)).project(camera);
    flyLabel.hidden = flyScreen.z < -1 || flyScreen.z > 1 || Math.abs(flyScreen.x) > 1 || Math.abs(flyScreen.y) > 1;
    flyLabel.style.left = `${(flyScreen.x + 1) * width / 2}px`;
    flyLabel.style.top = `${(1 - flyScreen.y) * height / 2}px`;
    if (running) {
      while (trailPoints.length && now - trailPoints[0].time > 6000) trailPoints.shift();
    }
    trailPoints.forEach((point, index) => {
      trailPositions.set([point.x, 0.045, point.z], index * 3);
      const intensity = running ? Math.max(0, 1 - (now - point.time) / 6000) : (index + 1) / trailPoints.length;
      color.copy(faded).lerp(ink, intensity);
      trailColors.set([color.r, color.g, color.b], index * 3);
    });
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.color.needsUpdate = true;
    trailGeometry.setDrawRange(0, trailPoints.length);
    renderer.render(scene, camera);
  }
  resize();
  renderer.setAnimationLoop(frame);
  return {
    update,
    beginAction() {
      idle.beginAction();
      renderFly(performance.now()); // Restore authoritative pose before the backend call.
      renderer.render(scene, camera);
    },
    endAction(action: 'start' | 'reset', succeeded: boolean) { idle.endAction(action, succeeded); },
    dispose() {
      disposed = true;
      idle.dispose();
      observer.disconnect();
      controls.dispose();
      resetView.removeEventListener('click', fitCamera);
      cameraTools.remove();
      renderer.setAnimationLoop(null);
      disposeObject(scene);
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
      flyLabel.remove();
      ambientLabel?.remove();
    },
  };
}
