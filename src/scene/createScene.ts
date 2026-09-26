import * as THREE from 'three';
import type { SimulationState } from '../contracts';
import { createFly } from './fly';
import { createCourtyard } from './courtyard';

const COLORS = ['#8da78e', '#c68b63'];
const TRAIL_LIMIT = 180;

export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#fff6df', '#b1b5a0', 2.7));
  const sun = new THREE.DirectionalLight('#fff6e6', 3);
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
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const labels = document.createElement('div');
  labels.className = 'marker-labels';
  labels.setAttribute('aria-hidden', 'true');
  container.append(labels);
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
    const aspect = width / height;
    const halfHeight = Math.max(radius * 0.83, radius * 1.15 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.position.set(centerX, 12, centerZ + 13);
    camera.lookAt(centerX, 0.4, centerZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function updateLabels() {
    for (const marker of markers) {
      const projected = marker.position.clone().project(camera);
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
    fly.root.position.set(next.fly.x, 0, next.fly.z);
    fly.root.rotation.y = next.fly.heading;
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
  function frame(now: number) {
    if (disposed) return;
    fly.animate(now / 1000, running && !reducedMotion.matches);
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
    dispose() {
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      disposeObject(scene);
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
