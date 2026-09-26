import * as THREE from 'three';
import type { SimulationState } from '../contracts';
import { createHabitatProps } from './habitatProps';

/** Miniature habitat, built entirely from decorative geometry.
 * Destinations and movement remain simulation-owned; no habitat prop is an obstacle or input.
 */
export function createCourtyard(restaurants: SimulationState['restaurants'], center: { x: number; z: number }, radius: number) {
  const group = new THREE.Group();
  const materials = {
    grass: new THREE.MeshStandardMaterial({ color: '#71865a', roughness: 1, flatShading: true }),
    wall: new THREE.MeshStandardMaterial({ color: '#f1e9d7', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#786447', roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#374d46', roughness: 0.45 }),
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
  // Continuous flat ground extends beyond the bounded camera; no raised display edge.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.015, center.z);
  ground.receiveShadow = true;
  group.add(ground);

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
  group.add(createHabitatProps(restaurants, center, radius));
  return group;
}
