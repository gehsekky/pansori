// Spell batch: control & debuff — Sleet Storm (AoE DEX save → Prone), Heat
// Metal (full fire damage regardless of save + Disadvantage on a failed CON
// save), and Bestow Curse (WIS save → a hindering curse: the target attacks at
// Disadvantage, under Concentration).
//
// With Math.random() pinned: 0.01 → d20 1 (a save fails), 0.95 → d20 20 (a
// save succeeds) and every d8 is an 8, 0.05 → d20 1 and every d8 is a 1.

import type { CombatEntity, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

describe('spell batch 7 — catalog', () => {
  it('Sleet Storm is an AoE DEX-save → Prone control spell', () => {
    expect(SRD_SPELLS.sleet_storm).toMatchObject({
      level: 3,
      savingThrow: 'dex',
      condition: 'prone',
      aoeCondition: true,
      aoeShape: 'sphere',
    });
  });
  it('Heat Metal deals fire damage that ignores the save + a CON-save rider', () => {
    expect(SRD_SPELLS.heat_metal).toMatchObject({
      level: 2,
      damageType: 'fire',
      savingThrow: 'con',
      damageIgnoresSave: true,
      condition: 'heat_seared',
    });
  });
  it('Bestow Curse is a WIS-save concentration curse', () => {
    expect(SRD_SPELLS.bestow_curse).toMatchObject({
      level: 3,
      savingThrow: 'wis',
      condition: 'cursed',
      concentration: true,
    });
  });
});

// ── Shared harness ────────────────────────────────────────────────────────────
function seed(): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Batch7',
    ship_name: 'Batch7',
    intro: '',
    seed_id: 'b7',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: enemyId,
          name: 'Ogre',
          hp: 300,
          ac: 10,
          damage: '1d6',
          toHit: 3,
          xp: 50,
          con: 10,
          dex: 10,
          wis: 10,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

// A caster plus a second PC, so the cast advances to a PC's turn (not the
// enemy's) — otherwise the auto-run enemy turn would tick a 1-round condition
// (Prone, Heat-Seared) off before we can read it.
function casterState(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 11,
    int: 18,
    hp: 50,
    max_hp: 50,
    gold: 0,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 2 },
    spell_slots_used: {},
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 11, hp: 80, max_hp: 80 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 20, is_enemy: false },
      { id: 'pc-2', roll: 15, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 1, y: 2 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

function cast(spellId: string, slot: number) {
  return takeAction({
    action: { type: 'cast_spell', spellId, slotLevel: slot, targetEnemyId: enemyId },
    history: [],
    state: casterState(spellId, slot),
    seed: seed(),
    context: ctx,
  });
}

describe('Sleet Storm — AoE knockdown', () => {
  it('a failed DEX save knocks the target Prone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // save fails
    const r = await cast('sleet_storm', 3);
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.conditions).toContain('prone');
  });
});

describe('Heat Metal — damage ignores the save; rider does not', () => {
  it('deals full fire damage even on a SUCCESSFUL save (no Heat-Seared)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // CON save succeeds; 2d8 = 16
    const r = await cast('heat_metal', 2);
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.hp).toBe(284); // 300 − 16 full, despite the save
    expect(e?.conditions ?? []).not.toContain('heat_seared');
  });

  it('applies Heat-Seared (attack Disadvantage) on a FAILED save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // CON save fails; 2d8 = 2
    const r = await cast('heat_metal', 2);
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.hp).toBe(298); // 300 − 2
    expect(e?.conditions).toContain('heat_seared');
  });
});

describe('Bestow Curse — hindering curse under concentration', () => {
  it('a failed WIS save Curses the target and starts concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // save fails
    const r = await cast('bestow_curse', 3);
    const e = r.newState.entities?.find((x) => x.id === enemyId);
    expect(e?.conditions).toContain('cursed');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('bestow_curse');
  });
});

// ── The payoff: a Cursed creature attacks at Disadvantage ─────────────────────
function ent(o: Partial<CombatEntity>): CombatEntity {
  return {
    id: 'x',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...o,
  };
}

function attackCtx(attackerConditions: string[]): ActionContext {
  const attacker = {
    id: 'e1',
    name: 'Brute',
    hp: 30,
    ac: 13,
    toHit: 0,
    damage: '8',
    damageType: 'bludgeoning',
  } as unknown as Enemy;
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40 });
  const attackerEnt = ent({ id: 'e1', pos: { x: 5, y: 6 }, conditions: attackerConditions });
  const pcEnt = ent({ id: 'pc', isEnemy: false, pos: { x: 5, y: 5 }, hp: 40, maxHp: 40 });
  return {
    actor: enemyActor(attacker, attackerEnt),
    context: ctx,
    st: { characters: [target], entities: [pcEnt, attackerEnt], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

const enemyAttack = {
  type: 'enemy_attack' as const,
  advIdx: 0,
  multiattackIdx: 0,
  targetCharId: 'pc',
};

describe('Cursed / Heat-Seared impose Disadvantage on the creature’s attacks', () => {
  it('a cursed attacker keeps the lower of two d20s (a miss)', () => {
    mockRandom(0.95, 0.0); // disadvantage → rolls 20 then 1, keeps 1 → miss
    const c = attackCtx(['cursed']);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });

  it('an unhindered attacker keeps the single high roll (a hit)', () => {
    mockRandom(0.95);
    const c = attackCtx([]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });
});
