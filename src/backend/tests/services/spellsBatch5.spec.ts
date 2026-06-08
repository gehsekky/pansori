// Spell batch: Blur (+ the `blurred` condition), two AoE damage spells
// (Incendiary Cloud, Sunbeam), and a set of narrative-utility spells.

import type { Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState, mockRandom } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { enemyActor } from '../../src/services/actions/actor.js';
import { handleEnemyAttack } from '../../src/services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

describe('spell batch — catalog', () => {
  it('Blur is a self, concentration buff applying the blurred condition', () => {
    const b = SRD_SPELLS.blur;
    expect(b.level).toBe(2);
    expect(b.targetType).toBe('self');
    expect(b.condition).toBe('blurred');
    expect(b.concentration).toBe(true);
  });
  it('Incendiary Cloud + Sunbeam are save-for-half AoE damage', () => {
    expect(SRD_SPELLS.incendiary_cloud).toMatchObject({
      level: 8,
      damageType: 'fire',
      savingThrow: 'dex',
      saveEffect: 'half',
      aoeShape: 'sphere',
    });
    expect(SRD_SPELLS.sunbeam).toMatchObject({
      level: 6,
      damageType: 'radiant',
      savingThrow: 'con',
      saveEffect: 'half',
      aoeShape: 'line',
    });
  });
  it('narrative-utility spells are registered with the right level', () => {
    const expected: Record<string, number> = {
      commune_with_nature: 5,
      find_the_path: 6,
      legend_lore: 5,
      meld_into_stone: 3,
      animal_messenger: 2,
      tiny_hut: 3,
    };
    for (const [id, level] of Object.entries(expected)) {
      expect(SRD_SPELLS[id], id).toBeDefined();
      expect(SRD_SPELLS[id].level, id).toBe(level);
    }
  });
});

// ── Blur — applies blurred + concentration, gives attackers Disadvantage ──────
function selfCasterState(spellId: string, slot: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    hp: 40,
    max_hp: 40,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [wiz],
    active_character_id: 'pc-1',
  };
}

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Blur Test',
  ship_name: 'Blur Test',
  intro: '',
  seed_id: 'blur',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Blur — self-buff', () => {
  it('applies blurred + starts concentration on cast', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'blur', slotLevel: 2 },
      history: [],
      state: selfCasterState('blur', 2),
      seed: noEnemySeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.conditions).toContain('blurred');
    expect(pc.concentrating_on?.spellId).toBe('blur');
  });

  it('breakConcentration clears blurred', () => {
    const char = makeChar({
      id: 'pc-1',
      conditions: ['blurred'],
      concentrating_on: { spellId: 'blur', rounds_left: 10 },
    });
    const st = { characters: [char], entities: [] } as unknown as GameState;
    const { char: after } = breakConcentration(char, st, ctx);
    expect(after.conditions).not.toContain('blurred');
  });
});

// A blurred defender imposes Disadvantage on the attacker. Flat-damage brute;
// [0.95, 0.0]: with Disadvantage the enemy rolls 20 then 1 and keeps the lower
// (1 → miss); against an unblurred target it keeps the single 20 (auto-hit).
const brute = {
  id: enemyId,
  name: 'Brute',
  hp: 30,
  ac: 13,
  toHit: 0,
  damage: '8',
  damageType: 'bludgeoning',
} as unknown as Enemy;

function attackCtx(targetConditions: string[]): ActionContext {
  const target = makeChar({ id: 'pc', ac: 10, hp: 40, max_hp: 40, conditions: targetConditions });
  return {
    actor: enemyActor(brute),
    context: ctx,
    st: { characters: [target], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}
const enemyAttack = {
  type: 'enemy_attack' as const,
  advIdx: 0,
  multiattackIdx: 0,
  targetCharId: 'pc',
};

describe('Blur — attackers roll with Disadvantage', () => {
  it('a blurred defender makes the attacker keep the lower roll (miss)', () => {
    mockRandom(0.95, 0.0);
    const c = attackCtx(['blurred']);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(40);
    else throw new Error('expected a resolved attack');
  });

  it('an unblurred defender is hit normally', () => {
    mockRandom(0.95);
    const c = attackCtx([]);
    handleEnemyAttack(c, enemyAttack);
    if (c.enemySubAttack?.outcome === 'done') expect(c.enemySubAttack.target.hp).toBe(32);
    else throw new Error('expected a resolved attack');
  });
});

// ── AoE damage — Incendiary Cloud (sphere) + Sunbeam (line) ───────────────────
const dmgSeed: Seed = {
  context_id: ctx.id,
  world_name: 'AoE Test',
  ship_name: 'AoE Test',
  intro: '',
  seed_id: 'aoe',
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
        con: 8,
        dex: 8,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function dmgCasterState(spellId: string, slot: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 18,
    hp: 60,
    max_hp: 60,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 60,
        maxHp: 60,
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

describe('AoE damage — Incendiary Cloud + Sunbeam', () => {
  for (const [id, slot] of [
    ['incendiary_cloud', 8],
    ['sunbeam', 6],
  ] as const) {
    it(`${id} damages a target that fails its save`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // save fails → full damage
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: id, slotLevel: slot, targetEnemyId: enemyId },
        history: [],
        state: dmgCasterState(id, slot),
        seed: dmgSeed,
        context: ctx,
      });
      const hp = r.newState.entities?.find((e) => e.id === enemyId)?.hp ?? 300;
      expect(hp, `${id} should have dealt damage`).toBeLessThan(300);
    });
  }
});
