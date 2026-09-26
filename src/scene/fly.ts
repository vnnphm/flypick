import * as THREE from 'three';

/** Original primitive geometry. Only the root receives simulation transforms. */
export function createFly() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = new THREE.MeshStandardMaterial({ color: '#41453b', roughness: 0.7, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#222d28', roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: '#b84330', roughness: 0.45, flatShading: true });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: '#e3eee7', transparent: true, opacity: 0.72,
    side: THREE.DoubleSide, depthWrite: false, roughness: 0.35,
  });
  function ellipsoid(size: [number, number, number], position: [number, number, number], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    body.add(mesh);
  }
  ellipsoid([0.32, 0.29, 0.53], [0, 0.43, -0.36], dark);
  ellipsoid([0.34, 0.32, 0.35], [0, 0.52, 0.14], shell);
  ellipsoid([0.28, 0.25, 0.24], [0, 0.58, 0.57], dark);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    ellipsoid([0.14, 0.2, 0.16], [side * 0.23, 0.63, 0.65], red);
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.73, 0.13);
    const wing = new THREE.Mesh(new THREE.CircleGeometry(1, 24), wingMaterial);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.set(0.65, 0.24, 1);
    wing.position.set(side * 0.53, 0, -0.25);
    wing.rotation.z = side * -0.3;
    pivot.add(wing);
    body.add(pivot);
    wings.push(pivot);
    for (let i = 0; i < 3; i++) {
      const z = -0.36 + i * 0.34;
      const points = [new THREE.Vector3(side * 0.2, 0.4, z), new THREE.Vector3(side * 0.49, 0.24, z - 0.1), new THREE.Vector3(side * 0.62, 0.035, z + 0.04)];
      for (let j = 0; j < 2; j++) {
        const direction = points[j + 1].clone().sub(points[j]);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, direction.length(), 5), dark);
        leg.position.copy(points[j]).add(points[j + 1]).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        body.add(leg);
      }
    }
  }
  return {
    root,
    animate(time: number, active: boolean) {
      body.position.y = active ? Math.sin(time * 3) * 0.025 : 0;
      wings.forEach((wing, i) => { wing.rotation.z = active ? Math.sin(time * 38) * 0.22 * (i ? 1 : -1) : 0; });
    },
  };
}
