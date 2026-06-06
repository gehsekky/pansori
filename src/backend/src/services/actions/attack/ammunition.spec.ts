import type { Character, Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { context as baseCtx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../gameEngine.js';

// SRD ammunition. A ranged attack with a bow/crossbow/sling/blowgun/firearm
// spends one matching round (preattack.ts) — preferring the bundle equipped in
// the quiver slot, falling back to loose ammo in the pack. The stack's `count`
// decrements; at 0 the bundle is removed and the quiver slot cleared. Out of
// ammo blocks the shot.

afterEach(() => vi.restoreAllMocks());

const ctx = {
  ...baseCtx,
  lootTable: [
    ...baseCtx.lootTable,
    // Weapons + ammo the tests reference (sandbox doesn't carry firearms/blowguns).
    SRD_ITEMS.longbow,
    SRD_ITEMS.light_crossbow,
    SRD_ITEMS.blowgun,
    SRD_ITEMS.pistol,
    SRD_ITEMS.arrows,
    SRD_ITEMS.crossbow_bolts,
    SRD_ITEMS.blowgun_needles,
    SRD_ITEMS.firearm_bullets,
  ],
};

const ENEMY_ID = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Ammo Test',
  ship_name: 'Ammo Test',
  intro: '',
  seed_id: 'ammo',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY_ID, name: 'Foe', hp: 40, ac: 10, damage: '1d6', toHit: 4, xp: 50 } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function stateWith(over: Partial<Character>): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 1,
    dex: 14,
    str: 14,
    hp: 30,
    max_hp: 30,
    weapon_proficiencies: ['simple', 'martial'],
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY_ID,
        isEnemy: true,
        pos: { x: 6, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const fire = (state: GameState) =>
  takeAction({
    action: { type: 'attack', targetEnemyId: ENEMY_ID },
    history: [],
    state,
    seed,
    context: ctx,
  });

const ammoOf = (st: GameState, id: string) => st.characters[0].inventory?.find((i) => i.id === id);

describe('ammunition — quiver-equipped', () => {
  it('a shot spends one arrow from the equipped quiver', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [
        { instance_id: 'bow-1', id: 'longbow', name: 'Longbow' },
        { instance_id: 'arr-1', id: 'arrows', name: 'Arrows', count: 20 },
      ],
      equipment: { main_hand: 'bow-1', quiver: 'arr-1' },
    });
    const r = await fire(state);
    expect(ammoOf(r.newState, 'arrows')?.count).toBe(19);
    expect(r.newState.characters[0].equipment.quiver).toBe('arr-1');
  });

  it('the last arrow is spent and the quiver slot is cleared', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [
        { instance_id: 'bow-1', id: 'longbow', name: 'Longbow' },
        { instance_id: 'arr-1', id: 'arrows', name: 'Arrows', count: 1 },
      ],
      equipment: { main_hand: 'bow-1', quiver: 'arr-1' },
    });
    const r = await fire(state);
    expect(ammoOf(r.newState, 'arrows')).toBeUndefined(); // bundle gone
    expect(r.newState.characters[0].equipment.quiver).toBeUndefined(); // slot cleared
  });

  it('blocks the shot with no ammunition', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [{ instance_id: 'bow-1', id: 'longbow', name: 'Longbow' }],
      equipment: { main_hand: 'bow-1' },
    });
    const r = await fire(state);
    expect(r.narrative).toMatch(/no ammunition/i);
    expect(enemyHp(r.newState)).toBe(40); // never resolved
  });
});

describe('ammunition — weapon → ammo matching', () => {
  it('a crossbow spends bolts (not arrows)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [
        { instance_id: 'xb-1', id: 'light_crossbow', name: 'Light Crossbow' },
        { instance_id: 'arr-1', id: 'arrows', name: 'Arrows', count: 20 },
        { instance_id: 'bolt-1', id: 'crossbow_bolts', name: 'Crossbow Bolts', count: 20 },
      ],
      equipment: { main_hand: 'xb-1' },
    });
    const r = await fire(state);
    expect(ammoOf(r.newState, 'crossbow_bolts')?.count).toBe(19); // bolts spent
    expect(ammoOf(r.newState, 'arrows')?.count).toBe(20); // arrows untouched
  });

  it('a blowgun spends needles', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [
        { instance_id: 'bg-1', id: 'blowgun', name: 'Blowgun' },
        { instance_id: 'ndl-1', id: 'blowgun_needles', name: 'Blowgun Needles', count: 50 },
      ],
      equipment: { main_hand: 'bg-1' },
    });
    const r = await fire(state);
    expect(ammoOf(r.newState, 'blowgun_needles')?.count).toBe(49);
  });

  it('a pistol spends firearm bullets (not a sling bullet match)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = stateWith({
      inventory: [
        { instance_id: 'pst-1', id: 'pistol', name: 'Pistol' },
        { instance_id: 'fb-1', id: 'firearm_bullets', name: 'Firearm Bullets', count: 20 },
      ],
      equipment: { main_hand: 'pst-1' },
    });
    const r = await fire(state);
    expect(ammoOf(r.newState, 'firearm_bullets')?.count).toBe(19);
  });
});

function enemyHp(st: GameState) {
  return st.entities?.find((e) => e.id === ENEMY_ID)?.hp;
}
