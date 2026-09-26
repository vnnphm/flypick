import * as THREE from 'three';
import { IDLE_FRUIT } from './idle';

export function createIdleFruit() {
  const group = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#67533c', roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#708e52', roughness: 1 });
  IDLE_FRUIT.forEach((position, index) => {
    const fruit = new THREE.Group();
    fruit.position.set(position.x, 0, position.z);
    const flesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: index ? '#d4a14c' : '#bd5944', roughness: 0.85 }));
    flesh.position.y = 0.23;
    flesh.scale.set(1, index ? 1.15 : 0.9, 1);
    flesh.castShadow = true;
    fruit.add(flesh);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.027, 0.13, 5), stemMaterial);
    stem.position.set(0, 0.46, 0);
    stem.rotation.z = -0.2;
    fruit.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), leafMaterial);
    leaf.scale.set(1.3, 0.22, 0.6);
    leaf.position.set(0.075, 0.46, 0);
    fruit.add(leaf);
    group.add(fruit);
  });
  group.visible = false;
  return group;
}
