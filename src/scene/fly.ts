import * as THREE from 'three';

// Adapted from fly.ai world/src/scene.ts at 40fbeca60e5c16742f20b4c2c067de915b388e66.
// Copyright (c) 2026 alextitonis, MIT. See fly-ai-NOTICE.md.
export function createFly() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.24;
  root.add(body);
  const bodyGeometry = new THREE.IcosahedronGeometry(0.26, 0);
  bodyGeometry.scale(0.62, 0.58, 1.5);
  const thorax = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: 0x6b6459, flatShading: true, roughness: 0.7 }));
  thorax.castShadow = true;
  body.add(thorax);
  const abdomenGeometry = new THREE.IcosahedronGeometry(0.24, 0);
  abdomenGeometry.scale(0.72, 0.66, 1.35);
  abdomenGeometry.translate(0, -0.01, -0.3);
  const abdomen = new THREE.Mesh(abdomenGeometry, new THREE.MeshStandardMaterial({ color: 0x23211d, flatShading: true, roughness: 0.85 }));
  abdomen.castShadow = true;
  body.add(abdomen);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xd0322a, flatShading: true, roughness: 0.35, emissive: 0x2a0705 });
  const wingGeometry = new THREE.PlaneGeometry(0.72, 0.2);
  wingGeometry.rotateX(-Math.PI / 2);
  wingGeometry.translate(0.36, 0, -0.05);
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.15, emissive: 0x16222b, depthWrite: false });
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 0), eyeMaterial);
    eye.position.set(side * 0.115, 0.055, 0.26);
    body.add(eye);
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.y = 0.14;
    wing.scale.x = side;
    body.add(wing);
    wings.push(wing);
  }
  return {
    root,
    animate(time: number, active: boolean) {
      body.position.y = 0.24 + (active ? Math.sin(time * 3) * 0.015 : 0);
      wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * (0.25 + (active ? Math.sin(time * 38) * 0.5 : 0)); });
    },
  };
}
