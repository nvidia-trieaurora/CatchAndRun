import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachHarborMarketLighting } from '../src/game/world/lighting/harborMarketLighting';

function market() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  material.name = 'MAT_MARKET_RP04_LIMESTONE';
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return root;
}

describe('RP04 Market practical lighting', () => {
  it('only lights the new authored market, never fallback or unrelated districts', () => {
    const root = new THREE.Group();
    attachHarborMarketLighting(root, 'high');
    expect(root.children).toHaveLength(0);
  });
  it('adds two bounded non-shadow practicals once, owned by the zone root', () => {
    const root = market();
    attachHarborMarketLighting(root, 'high');
    attachHarborMarketLighting(root, 'high');
    const lights = root.children.filter((child): child is THREE.PointLight => child instanceof THREE.PointLight);
    expect(lights).toHaveLength(2);
    for (const light of lights) {
      expect(light.castShadow).toBe(false);
      expect(light.distance).toBeLessThanOrEqual(8);
      expect(light.position.y).toBe(4.05);
      expect(light.parent).toBe(root);
    }
  });
  it('keeps Low free of added per-pixel lights', () => {
    const root = market();
    attachHarborMarketLighting(root, 'low');
    expect(root.children.some(child => child instanceof THREE.Light)).toBe(false);
  });
});
