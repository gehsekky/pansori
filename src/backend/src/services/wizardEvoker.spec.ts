// RE-2 — Wizard Evoker subclass (combat core). Potent Cantrip (L3): a
// damaging cantrip deals half damage even on a miss / successful save.

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evocationSavantBudget, isEvocationSpell } from './multiclass.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { handleChooseEvocationSavant } from './actions/meta.js';
import { pcActor } from './actions/actor.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Evoker',
  ship_name: 'Evoker',
  intro: '',
  seed_id: 'evoker',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  // AC 20 so a mediocre spell-attack roll misses (exercising Potent Cantrip).
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 80,
        ac: 20,
        damage: '1d4',
        toHit: 3,
        xp: 50,
        dex: 8,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function evokerCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    subclass: 'evoker',
    level: 3,
    int: 16,
    spells_known: ['fire_bolt', 'sacred_flame'],
    spell_slots_max: {},
    spell_slots_used: {},
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
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
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const castFireBolt = async (state: GameState) =>
  takeAction({
    action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Potent Cantrip (L3) — attack-roll cantrip half damage on a miss', () => {
  it('an Evoker still deals half damage when Fire Bolt misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3); // d20 = 7 → miss vs AC 20
    const r = await castFireBolt(evokerCombat());
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(80); // half damage still landed
    expect(enemyHp).toBeGreaterThan(0);
    expect(r.narrative).toMatch(/Potent Cantrip/);
  });

  it('a non-Evoker Wizard deals no damage on the same miss', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const r = await castFireBolt(evokerCombat({ subclass: undefined }));
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBe(80); // a plain miss deals nothing
    expect(r.narrative).not.toMatch(/Potent Cantrip/);
  });

  it('does not apply below Wizard L3', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const r = await castFireBolt(evokerCombat({ level: 2 }));
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(80);
  });
});

describe('Potent Cantrip (L3) — save cantrip half damage on a successful save', () => {
  it('an Evoker deals half with Sacred Flame when the target saves', async () => {
    // High roll → the target succeeds on its DEX save (Sacred Flame normally
    // negates), so Potent Cantrip applies half damage.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'sacred_flame', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: evokerCombat(),
      seed,
      context: ctx,
    });
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(80);
    expect(r.narrative).toMatch(/Potent Cantrip/);
  });
});

describe('Empowered Evocation (L10) — +INT to one evocation damage roll', () => {
  // Low-AC enemy so the spell attack always lands (isolates the damage bonus).
  const hitSeed: Seed = {
    ...seed,
    enemies: {
      ['entry_hall']: [
        {
          id: ENEMY,
          name: 'Dummy',
          hp: 80,
          ac: 5,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          dex: 8,
        } as unknown as Enemy,
      ],
    },
  };
  const fireBolt = async (state: GameState) =>
    takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state,
      seed: hitSeed,
      context: ctx,
    });

  it('adds INT mod to Fire Bolt damage on a hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11 → hit (not crit); dice fixed
    const withEmp = await fireBolt(evokerCombat({ level: 10 }));
    const without = await fireBolt(evokerCombat({ level: 10, subclass: undefined }));
    const hpWith = (withEmp.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    const hpWithout = (without.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(hpWithout - hpWith).toBe(3); // +INT mod (16 → +3)
  });

  it('does not apply below Evoker L10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const lowLevel = await fireBolt(evokerCombat({ level: 9 }));
    const plain = await fireBolt(evokerCombat({ level: 9, subclass: undefined }));
    const hpEvoker = (lowLevel.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    const hpPlain = (plain.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(hpEvoker).toBe(hpPlain); // no bonus yet
  });
});

// Fireball (20-ft sphere, DEX save) with an ally PC standing one square from
// the target enemy — inside the blast.
function sculptState(level: number): GameState {
  const evoker = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    subclass: 'evoker',
    level,
    int: 16,
    spells_known: ['fireball'],
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
  });
  const ally = makeChar({
    id: 'pc-2',
    character_class: 'Fighter',
    level,
    hp: 40,
    max_hp: 40,
    dex: 10,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [evoker, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 25,
        maxHp: 25,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 10, y: 11 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 10, y: 10 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const castFireball = async (state: GameState) =>
  takeAction({
    action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: ENEMY },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Sculpt Spells (L6) — allies auto-succeed and take no damage', () => {
  it('an ally in an Evoker L6 Fireball takes no damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await castFireball(sculptState(6));
    expect(r.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBe(40);
    expect(r.narrative).toMatch(/Sculpt Spells/);
  });

  it('is not available below Wizard L6 — the ally is caught in the blast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await castFireball(sculptState(5));
    expect(r.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBeLessThan(40);
  });
});

describe('Overchannel (L14) — maximize a damaging spell, escalating cost', () => {
  const hitSeed: Seed = {
    ...seed,
    enemies: {
      ['entry_hall']: [
        {
          id: ENEMY,
          name: 'Dummy',
          hp: 80,
          ac: 5,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          dex: 8,
        } as unknown as Enemy,
      ],
    },
  };
  // Guiding Bolt: 4d6 radiant, spell attack, Evocation. L14 Evoker also has
  // Empowered Evocation (+INT). Maximized: 4×6 = 24, +3 INT = 27.
  const overchannelGuidingBolt = (over: Partial<Character> = {}) =>
    takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'guiding_bolt',
        slotLevel: 1,
        targetEnemyId: ENEMY,
        overchannel: true,
      },
      history: [],
      state: evokerCombat({
        level: 14,
        hp: 60,
        max_hp: 60,
        spells_known: ['guiding_bolt'],
        spell_slots_max: { 1: 4 },
        spell_slots_used: {},
        ...over,
      }),
      seed: hitSeed,
      context: ctx,
    });

  it('first use is free and deals maximum damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11 → hit (not crit); dice maximized regardless
    const r = await overchannelGuidingBolt();
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(80 - enemyHp).toBe(27); // 24 (max 4d6) + 3 (Empowered INT)
    expect(r.newState.characters[0].class_resource_uses?.overchannel_uses).toBe(1);
    expect(r.narrative).not.toMatch(/Necrotic backlash/); // first use is free
    expect(r.narrative).toMatch(/maximum damage/);
  });

  it('a second use before a long rest deals escalating Necrotic backlash', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await overchannelGuidingBolt({ class_resource_uses: { overchannel_uses: 1 } });
    // 2nd use: (1+1) × slot level 1 = 2d12 Necrotic, ignoring resistance.
    expect(r.newState.characters[0].class_resource_uses?.overchannel_uses).toBe(2);
    expect(r.narrative).toMatch(/Necrotic backlash/);
  });

  it('requires an Evoker of level 14', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await overchannelGuidingBolt({ level: 13 });
    expect(r.narrative).toMatch(/requires an Evoker of level 14/);
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(80); // nothing cast
  });
});

describe('Evocation Savant (L3) — free spellbook additions', () => {
  const savant = (over: Partial<Character> = {}) =>
    makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      subclass: 'evoker',
      level: 3,
      spells_known: [],
      spell_slots_max: { 1: 4, 2: 2 },
      ...over,
    });
  function featCtx(char: Character) {
    return {
      actor: pcActor(char, 0),
      context: ctx,
      narrative: '',
    } as unknown as Parameters<typeof handleChooseEvocationSavant>[0];
  }
  const pcChar = (c: ReturnType<typeof featCtx>) => {
    if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
    return c.actor.char;
  };

  it('budget is 2 at L3 and grows with new slot levels', () => {
    expect(evocationSavantBudget(savant())).toBe(2); // max slot 2 → 2
    expect(evocationSavantBudget(savant({ level: 5, spell_slots_max: { 1: 4, 2: 3, 3: 2 } }))).toBe(
      3
    );
    expect(evocationSavantBudget(makeChar({ character_class: 'Wizard', level: 3 }))).toBe(0); // not an evoker
  });

  it('confirms burning_hands is Evocation but charm_person is not', () => {
    expect(isEvocationSpell({ id: 'burning_hands' })).toBe(true);
    expect(isEvocationSpell({ id: 'charm_person' })).toBe(false);
  });

  it('adds an eligible Evocation spell to the spellbook and tracks the claim', () => {
    const c = featCtx(savant());
    handleChooseEvocationSavant(c, { type: 'choose_evocation_savant', spellId: 'burning_hands' });
    expect(pcChar(c).spells_known).toContain('burning_hands');
    expect(pcChar(c).class_resource_uses?.evocation_savant_claimed).toBe(1);
  });

  it('rejects a non-Evocation spell', () => {
    const c = featCtx(savant());
    const res = handleChooseEvocationSavant(c, {
      type: 'choose_evocation_savant',
      spellId: 'charm_person',
    });
    expect(res).toEqual({
      rejected: expect.stringMatching(/isn't an eligible Wizard Evocation spell/),
    });
  });

  it('stops once the budget is spent', () => {
    const c = featCtx(savant({ class_resource_uses: { evocation_savant_claimed: 2 } }));
    handleChooseEvocationSavant(c, { type: 'choose_evocation_savant', spellId: 'burning_hands' });
    expect(pcChar(c).spells_known ?? []).not.toContain('burning_hands');
  });
});
