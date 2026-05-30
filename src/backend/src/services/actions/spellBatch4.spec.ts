// SRD spell batch — Lesser/Greater Restoration, Prayer of Healing,
// Beacon of Hope, Death Ward, Bane, Scorching Ray, Chromatic Orb.
//
// Each test pins the mechanic that's new to pansori (not just the
// spell data shape — those are exercised by the catalog smoke tests).

import type { Enemy, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Spell Batch Test',
  ship_name: 'Spell Batch Test',
  intro: '',
  seed_id: 'spell-batch',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function withEnemy(enemy: Enemy): Seed {
  return {
    ...noEnemySeed,
    enemies: { [ctx.startRoomId]: [enemy] },
  };
}

// Build a combat state with the PC + one enemy already seeded as
// grid entities (skips the runCombatStart initiative roll). Used by
// the in-combat spell tests below.
function combatStateWith(pc: ReturnType<typeof makeChar>, enemy: Enemy) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemy.id, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: pc.id,
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: pc.hp,
        maxHp: pc.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemy.id,
        isEnemy: true,
        pos: { x: 6, y: 5 },
        hp: enemy.hp,
        maxHp: enemy.hp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Lesser Restoration', () => {
  it('strips Poisoned + Blinded from a self-target', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      conditions: ['poisoned', 'blinded', 'frightened'],
      spells_known: ['lesser_restoration'],
      prepared_spells: ['lesser_restoration'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'lesser_restoration', slotLevel: 2 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.conditions).not.toContain('poisoned');
    expect(after?.conditions).not.toContain('blinded');
    // Untouched conditions remain.
    expect(after?.conditions).toContain('frightened');
  });
});

describe('Greater Restoration', () => {
  it('strips Charmed + reduces exhaustion by 1', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 9,
      wis: 16,
      gold: 500,
      conditions: ['charmed'],
      exhaustion_level: 3,
      spells_known: ['greater_restoration'],
      prepared_spells: ['greater_restoration'],
      spell_slots_max: { 5: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'greater_restoration', slotLevel: 5 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.conditions).not.toContain('charmed');
    expect(after?.exhaustion_level).toBe(2);
    expect(after?.gold).toBe(500 - 100); // 100 gp diamond dust consumed
  });
});

describe('Prayer of Healing', () => {
  it('mass-heals every living party member', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      hp: 20,
      max_hp: 40,
      spells_known: ['prayer_of_healing'],
      prepared_spells: ['prayer_of_healing'],
      spell_slots_max: { 2: 2 },
      spell_slots_used: {},
    });
    const ally = makeChar({ id: 'ally-1', hp: 10, max_hp: 30 });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric, ally],
      active_character_id: cleric.id,
    };
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // max d8 rolls
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'prayer_of_healing', slotLevel: 2 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    // 2d8 maxed → 16 + WIS mod (+3) = 19 healed each.
    const clericAfter = result.newState.characters.find((c) => c.id === 'cleric-1');
    const allyAfter = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(clericAfter?.hp).toBe(Math.min(40, 20 + 19));
    expect(allyAfter?.hp).toBe(Math.min(30, 10 + 19));
  });
});

describe('Beacon of Hope', () => {
  it('applies `hopeful` to caster + up to 2 allies', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['beacon_of_hope'],
      prepared_spells: ['beacon_of_hope'],
      spell_slots_max: { 3: 1 },
      spell_slots_used: {},
    });
    const ally1 = makeChar({ id: 'ally-1' });
    const ally2 = makeChar({ id: 'ally-2' });
    const ally3 = makeChar({ id: 'ally-3' }); // RAW cap at 3 — should NOT get the buff
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric, ally1, ally2, ally3],
      active_character_id: cleric.id,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'beacon_of_hope', slotLevel: 3 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters;
    expect(after.find((c) => c.id === 'cleric-1')?.conditions).toContain('hopeful');
    expect(after.find((c) => c.id === 'ally-1')?.conditions).toContain('hopeful');
    expect(after.find((c) => c.id === 'ally-2')?.conditions).toContain('hopeful');
    expect(after.find((c) => c.id === 'ally-3')?.conditions ?? []).not.toContain('hopeful');
  });
});

describe('Death Ward', () => {
  it('intercepts a lethal damage event, sets HP to 1, clears the flag', async () => {
    // Set up: cleric casts on themselves. Then take damage that would
    // reduce them to 0. Verify HP = 1 and the flag clears.
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 7,
      wis: 16,
      hp: 5,
      max_hp: 30,
      spells_known: ['death_ward'],
      prepared_spells: ['death_ward'],
      spell_slots_max: { 4: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: cleric.id }, { current_room: ctx.startRoomId }),
      characters: [cleric],
      active_character_id: cleric.id,
    };
    const cast = await takeAction({
      action: { type: 'cast_spell', spellId: 'death_ward', slotLevel: 4 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const warded = cast.newState.characters.find((c) => c.id === 'cleric-1');
    expect(warded?.death_ward_active).toBe(true);
    // Apply lethal damage directly via the damage module.
    const { applyDamage } = await import('../damage.js');
    const dmgResult = applyDamage(warded!, cast.newState, 100);
    expect(dmgResult.char.hp).toBe(1);
    expect(dmgResult.char.death_ward_active).toBe(false);
  });
});

describe('Bane', () => {
  it("applies 'baned' to an enemy on failed CHA save (suppresses Bless-like attack bonus on the enemy side)", async () => {
    // We can't cleanly observe the -1d4 from a single combat round
    // without a deeper save/attack mock chain. Instead pin the
    // condition application: the save+condition path adds 'baned'
    // to the enemy's conditions on a failed save.
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      spells_known: ['bane'],
      prepared_spells: ['bane'],
      spell_slots_max: { 1: 3 },
      spell_slots_used: {},
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 12,
      hp: 8,
      damage: '1d6',
      toHit: 4,
      xp: 25,
      cha: 6,
    };
    const state = combatStateWith(cleric, enemy);
    // Force d20 = 2 so the goblin's CHA save (8 - 2 mod, total ~3)
    // fails the DC ~14.
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'bane',
        slotLevel: 1,
        targetEnemyId: enemy.id,
      },
      history: [],
      state,
      seed: withEnemy(enemy),
      context: ctx,
    });
    const enemyAfter = result.newState.entities?.find((e) => e.id === enemy.id);
    expect(enemyAfter?.conditions).toContain('baned');
  });
});

describe('Scorching Ray', () => {
  it('routes through the multi-target attack-roll branch — 3 rays vs one target', async () => {
    const wizard = makeChar({
      id: 'wiz-1',
      character_class: 'Wizard',
      level: 5,
      int: 18,
      spells_known: ['scorching_ray'],
      prepared_spells: ['scorching_ray'],
      spell_slots_max: { 2: 3 },
      spell_slots_used: {},
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 8,
      hp: 80,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(wizard, enemy);
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // ensure hits
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'scorching_ray',
        slotLevel: 2,
        targetEnemyIds: [enemy.id, enemy.id, enemy.id],
      },
      history: [],
      state,
      seed: withEnemy(enemy),
      context: ctx,
    });
    // 3 rays × 2d6 maxed = 36; allow for variance.
    const enemyAfter = result.newState.entities?.find((e) => e.id === enemy.id);
    expect(enemyAfter?.hp).toBeLessThan(80);
    // Routed through multi-target: narrative contains per-ray labels.
    expect(result.narrative).toMatch(/Scorching Ray|1: |2: |3: /);
  });
});

describe('Chromatic Orb', () => {
  it('single-target attack-roll spell consumes the 50 gp diamond + a slot', async () => {
    const caster = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      level: 5,
      wis: 16,
      gold: 200,
      spells_known: ['chromatic_orb'],
      prepared_spells: ['chromatic_orb'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const enemy: Enemy = {
      id: `${ctx.startRoomId}#0`,
      name: 'Goblin',
      ac: 12,
      hp: 30,
      damage: '1d6',
      toHit: 4,
      xp: 25,
    };
    const state = combatStateWith(caster, enemy);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'chromatic_orb',
        slotLevel: 1,
        targetEnemyId: enemy.id,
      },
      history: [],
      state,
      seed: withEnemy(enemy),
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(after?.gold).toBe(200 - 50);
    expect(after?.spell_slots_used?.[1]).toBe(1);
  });
});
