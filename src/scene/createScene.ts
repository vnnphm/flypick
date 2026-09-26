import * as THREE from 'three';

export function createScene(container: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f5f1e8');

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(4, 5, 7);
  camera.lookAt(0, 0.4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b695d, 3));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 6, 4);
  scene.add(light);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.18, 64),
    new THREE.MeshStandardMaterial({ color: '#dfd6c3', roughness: 0.9 }),
  );
  platform.position.y = -0.1;
  scene.add(platform);

  const fly = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#292e32', roughness: 0.65 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), dark);
  body.scale.set(0.85, 0.8, 1.4);
  body.position.y = 0.55;
  fly.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), dark);
  head.position.set(0, 0.65, 0.65);
  fly.add(head);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#b64a3e' });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: '#eaf8ff', transparent: true, opacity: 0.7, roughness: 0.3,
  });

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), eyeMaterial);
    eye.position.set(side * 0.24, 0.73, 0.8);
    fly.add(eye);

    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), wingMaterial);
    wing.scale.set(0.65, 0.035, 0.32);
    wing.position.set(side * 0.62, 0.93, -0.12);
    wing.rotation.y = side * 0.4;
    fly.add(wing);

    for (const z of [-0.35, 0, 0.35]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8), dark);
      leg.position.set(side * 0.4, 0.28, z);
      leg.rotation.z = side * 0.65;
      fly.add(leg);
    }
  }
  scene.add(fly);

  // This starter is static: render only when the container changes size.
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(container);
  resize();
}
