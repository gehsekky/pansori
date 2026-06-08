// The item-icon bucketing: a pure function over an item's fields that
// covers the WHOLE catalog (and any custom item) with no manual mapping.
// This guards the buckets the visual inventory renders.

import { ITEM_ICONS, iconForItem } from '../../shared-types.js';
import { describe, expect, it } from 'vitest';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

describe('iconForItem — catalog bucketing', () => {
  it('every SRD item resolves to a valid bucket', () => {
    for (const item of Object.values(SRD_ITEMS)) {
      const bucket = iconForItem(item);
      expect(ITEM_ICONS, item.id).toContain(bucket);
    }
  });

  it('weapons bucket by silhouette from id + fields', () => {
    const b = (id: string) => iconForItem(SRD_ITEMS[id]);
    expect(b('longsword')).toBe('blade');
    expect(b('greatsword')).toBe('blade');
    expect(b('scimitar')).toBe('blade');
    expect(b('battleaxe')).toBe('axe');
    expect(b('dagger')).toBe('dagger');
    expect(b('mace')).toBe('blunt');
    expect(b('warhammer')).toBe('blunt');
    expect(b('quarterstaff')).toBe('blunt');
    expect(b('spear')).toBe('polearm');
    expect(b('halberd')).toBe('polearm');
    expect(b('whip')).toBe('polearm');
    expect(b('longbow')).toBe('bow');
    expect(b('heavy_crossbow')).toBe('crossbow');
    expect(b('sling')).toBe('sling');
    expect(b('blowgun')).toBe('sling');
    expect(b('musket')).toBe('firearm');
    expect(b('pistol')).toBe('firearm');
  });

  it('armor / consumable / misc families bucket correctly', () => {
    const b = (id: string) => iconForItem(SRD_ITEMS[id]);
    expect(b('plate_armor')).toBe('armor');
    expect(b('chain_mail')).toBe('armor');
    expect(b('shield')).toBe('shield');
    expect(b('healing_potion')).toBe('potion');
    expect(b('antitoxin')).toBe('potion');
    expect(b('oil_flask')).toBe('flask');
    expect(b('acid_vial')).toBe('flask');
    expect(b('rations')).toBe('food');
    expect(b('arrows')).toBe('ammo');
    expect(b('torch')).toBe('light');
    expect(b('hooded_lantern')).toBe('light');
    expect(b('thieves_tools')).toBe('tools');
    expect(b('backpack')).toBe('gear');
    expect(b('rope_hempen')).toBe('gear');
    expect(b('holy_symbol')).toBe('holy');
  });

  it('an explicit icon override wins over the derived silhouette', () => {
    expect(iconForItem({ id: 'longsword', type: 'weapon', icon: 'dagger' })).toBe('dagger');
    expect(iconForItem({ id: 'whatever', icon: 'holy' })).toBe('holy');
  });

  it('works off a slim { id } (a vendor ware) and falls back to misc', () => {
    expect(iconForItem({ id: 'longsword' })).toBe('blade'); // id keyword, no type
    expect(iconForItem({ id: 'a_strange_curio' })).toBe('misc'); // nothing matches
  });

  it('a custom weapon with a novel name still buckets by type + keyword', () => {
    expect(iconForItem({ id: 'frostfang_greatsword', type: 'weapon' })).toBe('blade');
    expect(iconForItem({ id: 'gut_ripper', type: 'weapon' })).toBe('blunt'); // no shape keyword → blunt
    expect(iconForItem({ id: 'doom_plate', type: 'armor' })).toBe('armor');
  });
});

describe('painted item icons resolve to files', () => {
  const ART = fileURLToPath(new URL('../../../../frontend/public/art/icons', import.meta.url));
  // The buckets the Medieval Arms & Armor set covers (painted PNGs); the
  // rest render game-icons glyphs until a matching set lands.
  const PAINTED = [
    'blade',
    'axe',
    'dagger',
    'blunt',
    'polearm',
    'bow',
    'crossbow',
    'armor',
    'shield',
    'ammo',
  ];
  it('every painted bucket has its PNG under /art/icons', () => {
    const missing = PAINTED.filter((b) => !existsSync(`${ART}/${b}.png`));
    expect(missing).toEqual([]);
  });
});
