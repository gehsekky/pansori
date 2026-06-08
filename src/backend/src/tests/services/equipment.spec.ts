import {
  candidateSlots,
  clearInstance,
  equipmentFromLegacy,
  equippedArmorId,
  equippedId,
  equippedShieldId,
  equippedWeaponId,
  setSlot,
  slotsForInstance,
  toggleWornItem,
} from '../../services/equipment.js';
import { describe, expect, it } from 'vitest';
import { makeChar } from '../../test-fixtures.js';

describe('equipment accessors', () => {
  it('reads the three legacy slots through the named accessors', () => {
    const char = makeChar({ equipment: { main_hand: 'w1', armor: 'a1', shield: 's1' } });
    expect(equippedWeaponId(char)).toBe('w1');
    expect(equippedArmorId(char)).toBe('a1');
    expect(equippedShieldId(char)).toBe('s1');
    expect(equippedId(char, 'neck')).toBeNull();
  });

  it('returns null for an empty slot (never undefined)', () => {
    const char = makeChar({ equipment: {} });
    expect(equippedWeaponId(char)).toBeNull();
    expect(equippedId(char, 'ring_1')).toBeNull();
  });
});

describe('setSlot', () => {
  it('sets a slot without mutating the input', () => {
    const eq = { main_hand: 'w1' };
    const next = setSlot(eq, 'neck', 'amulet');
    expect(next).toEqual({ main_hand: 'w1', neck: 'amulet' });
    expect(eq).toEqual({ main_hand: 'w1' }); // unchanged
  });

  it('clears a slot when given null', () => {
    expect(setSlot({ main_hand: 'w1', neck: 'amulet' }, 'neck', null)).toEqual({ main_hand: 'w1' });
  });
});

describe('clearInstance', () => {
  it('removes an instance from whatever slot(s) hold it', () => {
    const eq = { main_hand: 'w1', ring_1: 'r1', ring_2: 'r1' };
    expect(clearInstance(eq, 'r1')).toEqual({ main_hand: 'w1' });
  });

  it('is a no-op when the instance is not equipped', () => {
    const eq = { main_hand: 'w1' };
    expect(clearInstance(eq, 'nope')).toEqual({ main_hand: 'w1' });
  });
});

describe('slotsForInstance', () => {
  it('lists the slots an instance occupies', () => {
    expect(slotsForInstance({ main_hand: 'w1', neck: 'amulet' }, 'amulet')).toEqual(['neck']);
    expect(slotsForInstance({ main_hand: 'w1' }, 'absent')).toEqual([]);
  });
});

describe('candidateSlots', () => {
  it('maps weapon → main_hand and ring → both ring slots', () => {
    expect(candidateSlots('weapon')).toEqual(['main_hand']);
    expect(candidateSlots('ring')).toEqual(['ring_1', 'ring_2']);
  });

  it('maps every other category 1:1 to its EquipSlot', () => {
    expect(candidateSlots('neck')).toEqual(['neck']);
    expect(candidateSlots('cloak')).toEqual(['cloak']);
    expect(candidateSlots('armor')).toEqual(['armor']);
  });
});

describe('toggleWornItem', () => {
  it('equips a wondrous item into its 1:1 slot', () => {
    const r = toggleWornItem({}, 'neck', 'amulet');
    expect(r).toEqual({ equipment: { neck: 'amulet' } });
  });

  it('unequips when the item is already worn in its slot', () => {
    const r = toggleWornItem({ neck: 'amulet' }, 'neck', 'amulet');
    expect(r).toEqual({ equipment: {} });
  });

  it('fills ring_1 then ring_2 for rings', () => {
    const first = toggleWornItem({}, 'ring', 'r1');
    expect(first).toEqual({ equipment: { ring_1: 'r1' } });
    const second = toggleWornItem({ ring_1: 'r1' }, 'ring', 'r2');
    expect(second).toEqual({ equipment: { ring_1: 'r1', ring_2: 'r2' } });
  });

  it('reports full when both ring slots are taken by other items', () => {
    const r = toggleWornItem({ ring_1: 'r1', ring_2: 'r2' }, 'ring', 'r3');
    expect(r).toEqual({ full: true });
  });

  it('takes a worn ring off from whichever ring slot holds it', () => {
    const r = toggleWornItem({ ring_1: 'r1', ring_2: 'r2' }, 'ring', 'r2');
    expect(r).toEqual({ equipment: { ring_1: 'r1' } });
  });
});

describe('equipmentFromLegacy (save migration)', () => {
  it('maps legacy equipped_* fields onto body slots', () => {
    expect(
      equipmentFromLegacy({ equipped_weapon: 'w1', equipped_armor: 'a1', equipped_shield: 's1' })
    ).toEqual({ main_hand: 'w1', armor: 'a1', shield: 's1' });
  });

  it('drops null legacy fields', () => {
    expect(
      equipmentFromLegacy({ equipped_weapon: 'w1', equipped_armor: null, equipped_shield: null })
    ).toEqual({ main_hand: 'w1' });
  });

  it('prefers an already-migrated equipment map when present', () => {
    expect(equipmentFromLegacy({ equipped_weapon: 'w1', equipment: { neck: 'amulet' } })).toEqual({
      neck: 'amulet',
    });
  });

  it('yields an empty map for a character with nothing equipped', () => {
    expect(equipmentFromLegacy({})).toEqual({});
  });
});
