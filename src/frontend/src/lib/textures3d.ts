// CC0 ground/surface textures (ambientCG, committed under public/art/
// textures3d — see LEGAL.md). Shared registry + helpers for the 3D world
// screen and the combat diorama so floor-type → texture mapping can't drift.

import * as THREE from 'three';
import { artUrl } from './art';

export const TEX3D = {
  grass: artUrl('/art/textures3d/grass.jpg'),
  rock: artUrl('/art/textures3d/rock.jpg'),
  mud: artUrl('/art/textures3d/mud.jpg'),
  snow: artUrl('/art/textures3d/snow.jpg'),
  cobblestone: artUrl('/art/textures3d/cobblestone.jpg'),
  plaster: artUrl('/art/textures3d/plaster.jpg'),
  rooftiles: artUrl('/art/textures3d/rooftiles.jpg'),
  bricks: artUrl('/art/textures3d/bricks.jpg'),
  planks: artUrl('/art/textures3d/planks.jpg'),
  sand: artUrl('/art/textures3d/sand.jpg'),
};

/** Authored FloorType → ground texture key (rooms, towns, combat). */
export const FLOOR_TEX_KEY: Record<string, keyof typeof TEX3D> = {
  cobblestone: 'cobblestone',
  dirt: 'mud',
  grass: 'grass',
  sand: 'sand',
};

export function configureTexture(t: THREE.Texture, repeat?: number): THREE.Texture {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
