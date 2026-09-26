import * as THREE from 'three';
import type { SimulationState } from '../contracts';

/** Decorative environment only. Destinations and movement remain simulation-owned.
 * Replace this builder to expand the setting later without changing the controller/UI.
 */
export function createCourtyard(restaurants: SimulationState['restaurants'], center: { x: number; z: number }, radius: number) {
  const group = new THREE.Group();
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: '#d8d0ba', roughness: 1 }),
    edge: new THREE.MeshStandardMaterial({ color: '#c1b79c', roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f1e9d7', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#786447', roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#374d46', roughness: 0.45 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#7b9164', roughness: 1, flatShading: true }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#a0ae7c', roughness: 1, flatShading: true }),
    pot: new THREE.MeshStandardMaterial({ color: '#ae7454', roughness: 1 }),
    green: new THREE.MeshStandardMaterial({ color: '#7e967e', roughness: 0.9 }),
    clay: new THREE.MeshStandardMaterial({ color: '#b77c56', roughness: 0.9 }),
  };
  function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(group, [radius * 2, 0.2, radius * 1.85], [center.x, -0.15, center.z], materials.edge);
  box(group, [radius * 2 - 0.2, 0.08, radius * 1.85 - 0.2], [center.x, -0.035, center.z], materials.stone);
  // Quiet paving joints give motion a visible scale without adding obstacles.
  const joints: THREE.Vector3[] = [];
  for (let offset = -Math.floor(radius) + 1; offset < radius - 1; offset += 1.25) {
    joints.push(new THREE.Vector3(center.x + offset, 0.007, center.z - radius * 0.9), new THREE.Vector3(center.x + offset, 0.007, center.z + radius * 0.9));
    joints.push(new THREE.Vector3(center.x - radius + 0.2, 0.007, center.z + offset * 0.9), new THREE.Vector3(center.x + radius - 0.2, 0.007, center.z + offset * 0.9));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(joints), new THREE.LineBasicMaterial({ color: '#c6bda7', transparent: true, opacity: 0.45 })));

  function plant(x: number, z: number, scale = 1) {
    const planter = new THREE.Group();
    planter.position.set(x, 0, z);
    planter.scale.setScalar(scale);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.35, 8), materials.pot);
    pot.position.y = 0.18;
    pot.castShadow = true;
    planter.add(pot);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.65, 6), materials.wood);
    trunk.position.y = 0.58;
    planter.add(trunk);
    for (const [xOffset, y, zOffset, size] of [[0, 1.08, 0, 0.45], [-0.15, 0.87, 0.1, 0.34], [0.18, 1.22, -0.03, 0.28]]) {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), y > 1.1 ? materials.leafLight : materials.leaf);
      leaves.position.set(xOffset, y, zOffset);
      leaves.castShadow = true;
      planter.add(leaves);
    }
    group.add(planter);
  }

  restaurants.forEach((restaurant, index) => {
    const shop = new THREE.Group();
    // Buildings sit beyond each pad, facing the courtyard's center.
    const outward = new THREE.Vector2(restaurant.x - center.x, restaurant.z - center.z).normalize();
    const distance = restaurant.radius + 0.65;
    shop.position.set(restaurant.x + outward.x * distance, 0, restaurant.z + outward.y * distance);
    shop.rotation.y = Math.atan2(-outward.x, -outward.y);
    const accent = index % 2 ? materials.clay : materials.green;
    box(shop, [2.05, 1.7, 1.05], [0, 0.85, 0], materials.wall);
    box(shop, [2.22, 0.13, 1.2], [0, 1.75, 0], accent);
    box(shop, [0.57, 1.12, 0.03], [-0.5, 0.58, 0.543], materials.glass);
    box(shop, [0.84, 0.72, 0.035], [0.42, 0.83, 0.547], materials.glass);
    box(shop, [0.03, 0.72, 0.05], [0.42, 0.83, 0.575], materials.wall);
    box(shop, [0.86, 0.04, 0.05], [0.42, 0.81, 0.575], materials.wall);
    box(shop, [0.035, 0.15, 0.055], [-0.32, 0.57, 0.59], materials.wood);
    const canopy = new THREE.Group();
    canopy.position.set(0, 1.4, 0.79);
    canopy.rotation.x = 0.16;
    for (let stripe = 0; stripe < 9; stripe++) {
      box(canopy, [0.24, 0.06, 0.66], [(stripe - 4) * 0.24, 0, 0], stripe % 2 ? materials.wall : accent);
      box(canopy, [0.24, 0.13, 0.045], [(stripe - 4) * 0.24, -0.055, 0.32], stripe % 2 ? materials.wall : accent);
    }
    shop.add(canopy);
    group.add(shop);
  });
  // Edge scenery is cosmetic and has no collision or navigation meaning.
  plant(center.x - radius + 0.6, center.z + 1.1, 1.15);
  plant(center.x + radius - 0.6, center.z + 1.1, 1.15);
  plant(center.x - radius + 0.7, center.z - radius * 0.72, 1.5);
  plant(center.x + radius - 0.7, center.z - radius * 0.72, 1.5);
  return group;
}
