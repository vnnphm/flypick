import * as THREE from 'three';
import type { SimulationState } from '../contracts';

// Adapted from fly.ai scene.ts buildProp and sim.ts's clustered placement pattern.
// MIT, copyright (c) 2026 alextitonis. Pinned revision/license: fly-ai-NOTICE.md.
// This is a visual distribution only: no simulation props, sensors, or collisions.
export function createHabitatProps(restaurants: SimulationState['restaurants'], center: { x: number; z: number }, radius: number) {
  const group = new THREE.Group();
  let visualSeed = 317;
  const random = () => { visualSeed = (Math.imul(visualSeed, 1664525) + 1013904223) >>> 0; return visualSeed / 4294967296; };
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#81887a', flatShading: true, roughness: 0.95 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6148, flatShading: true, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x4b7a54, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  const fruitMaterials = [0xc2493d, 0xb8862f, 0x8e9b4b].map(color => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.65, emissive: 0x120704 }));
  const patchMaterial = new THREE.MeshStandardMaterial({ color: '#68734c', roughness: 1 });
  const clearOfDestinations = (x: number, z: number) => restaurants.every(r => Math.hypot(x - r.x, z - r.z) > r.radius + 1.9);
  function spot(min: number, max: number) {
    const angle = random() * Math.PI * 2;
    const distance = min + Math.sqrt(random()) * (max - min);
    return { x: center.x + Math.cos(angle) * distance, z: center.z + Math.sin(angle) * distance };
  }
  function add(mesh: THREE.Mesh, x: number, y: number, z: number) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  // Cluster fruit across the field, including the former empty center.
  for (let patch = 0; patch < 7; patch++) {
    const p = spot(0.6, radius * 1.6);
    if (!clearOfDestinations(p.x, p.z)) continue;
    const soil = add(new THREE.Mesh(new THREE.CircleGeometry(0.7 + random() * 0.55, 9), patchMaterial), p.x, 0.002, p.z);
    soil.rotation.x = -Math.PI / 2;
    soil.scale.y = 0.75;
    soil.castShadow = false;
    for (let i = 0; i < 3; i++) {
      const angle = random() * Math.PI * 2;
      const spread = random() * 0.75;
      const height = 0.35 + random() * 0.25;
      const shape = random();
      const mesh = add(new THREE.Mesh(new THREE.IcosahedronGeometry(height * 0.62, 0), fruitMaterials[patch % 3]), p.x + Math.cos(angle) * spread, height * 0.55, p.z + Math.sin(angle) * spread);
      mesh.rotation.set(shape * 3, shape * 5, shape * 2);
      mesh.scale.set(1.35, 1, 1.2);
    }
  }
  for (let i = 0; i < 42; i++) {
    const p = spot(0.5, radius * 2.6);
    if (!clearOfDestinations(p.x, p.z)) continue;
    const height = 0.28 + random() * 0.9;
    const spread = 0.22 + random() * 0.38;
    const shape = random();
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, height, 5), stemMaterial), p.x, height * 0.5, p.z);
    for (let leaf = 0; leaf < 5; leaf++) {
      const angle = leaf / 5 * 6.28 + shape * 3;
      const mesh = add(new THREE.Mesh(new THREE.CircleGeometry(spread * 0.5, 3), leafMaterial), p.x + Math.cos(angle) * spread * 0.4, height * (0.45 + 0.5 * leaf / 5), p.z + Math.sin(angle) * spread * 0.4);
      mesh.rotation.set(-Math.PI / 2 + 0.9, angle, 0);
    }
  }
  for (let i = 0; i < 24; i++) {
    const p = spot(0.8, radius * 2.5);
    if (!clearOfDestinations(p.x, p.z)) continue;
    const size = 0.16 + random() * 0.45;
    const mesh = add(new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMaterial), p.x, size * 0.4, p.z);
    mesh.scale.set(1.3, 0.7, 1);
    mesh.rotation.y = random() * 6.28;
  }
  // Low grass tufts provide irregular ground texture without hiding the fly.
  for (let i = 0; i < 100; i++) {
    const p = spot(0.3, radius * 2.8);
    if (!clearOfDestinations(p.x, p.z)) continue;
    const height = 0.08 + random() * 0.16;
    add(new THREE.Mesh(new THREE.ConeGeometry(height * 0.35, height, 3), leafMaterial), p.x, height * 0.5, p.z);
  }
  return group;
}
