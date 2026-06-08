// End-of-turn "save ends" hook + incapacitation skip.
//
// SRD conditions like Power Word Stun's Stunned and Slow's slowed end on a save
// the creature repeats at the end of each of its turns. Enemies stamp
// `save_ends[cond] = { ability, dc }`; the enemy turn loop evaluates it at turn
// start (gated by `save_ends_acted` so the effect always lasts ≥1 turn) and
// clears the condition on a success. Incapacitating conditions (stunned /
// paralyzed / unconscious / …) now make an enemy skip its turn — so the Stun
// actually costs turns.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

function seedWith(hp: number, con = 10): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Save Ends Test',
    ship_name: 'Save Ends Test',
    intro: '',
    seed_id: 'save-ends',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        { id: enemyId, name: 'Ogre', hp, ac: 12, damage: '8', toHit: 5, xp: 50, con },
      ],
    },
    loot: {},
    npcs: {},
  };
}

describe('save-ends — catalog', () => {
  it('Power Word Stun is L8, V-only, arcane', () => {
    const pws = SRD_SPELLS.power_word_stun;
    expect(pws).toBeDefined();
    expect(pws.level).toBe(8);
    expect(pws.somatic).toBe(false);
    expect(pws.verbal).toBe(true);
    expect(pws.spellList).toEqual(['arcane']);
  });
  it('Slow carries conditionSaveEnds (WIS)', () => {
    expect(SRD_SPELLS.slow.conditionSaveEnds).toBe(true);
    expect(SRD_SPELLS.slow.savingThrow).toBe('wis');
    expect(SRD_SPELLS.slow.condition).toBe('slowed');
  });
});

// A second PC sits next in initiative so the caster's turn hands off to them,
// not the enemy — the cast's effect is read before any enemy turn / round wrap.
function casterState(spellId: string, slot: number, enemyHp: number) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 20,
    hp: 60,
    max_hp: 60,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 10, hp: 50, max_hp: 50 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz, ally],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'pc-2', roll: 12, is_enemy: false },
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
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 1, y: 3 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: enemyHp,
        maxHp: enemyHp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Power Word Stun — HP threshold', () => {
  it('a target with ≤150 HP is Stunned with a CON save-ends', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'power_word_stun',
        slotLevel: 8,
        targetEnemyId: enemyId,
      },
      history: [],
      state: casterState('power_word_stun', 8, 50),
      seed: seedWith(50),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('stunned');
    expect(ent?.save_ends?.stunned?.ability).toBe('con');
    expect(ent?.save_ends?.stunned?.dc).toBeGreaterThan(0);
  });

  it('a target with >150 HP is not Stunned', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'power_word_stun',
        slotLevel: 8,
        targetEnemyId: enemyId,
      },
      history: [],
      state: casterState('power_word_stun', 8, 200),
      seed: seedWith(200),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions ?? []).not.toContain('stunned');
    expect(ent?.save_ends?.stunned).toBeUndefined();
  });
});

describe('Slow — WIS save-ends stamped on cast', () => {
  it('a slowed enemy carries a WIS save-ends entry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // every roll low → WIS save fails → slowed
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'slow', slotLevel: 3, targetEnemyId: enemyId },
      history: [],
      state: casterState('slow', 3, 80),
      seed: seedWith(80),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('slowed');
    expect(ent?.save_ends?.slowed?.ability).toBe('wis');
  });
});

// ── Enemy-turn behavior: skip + re-save ───────────────────────────────────────
// One PC + one stunned enemy; the PC ends its turn so the enemy's turn runs.
function stunnedEnemyState(opts: { dc: number; acted: boolean }) {
  const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 10, hp: 60, max_hp: 60 });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
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
        pos: { x: 2, y: 2 },
        hp: 200,
        maxHp: 200,
        conditions: ['stunned'],
        condition_durations: {},
        save_ends: { stunned: { ability: 'con' as const, dc: opts.dc } },
        save_ends_acted: opts.acted ? ['stunned'] : [],
      },
    ],
  };
}

describe('Stunned enemy — incapacitation skip + recurring save', () => {
  it('skips its first afflicted turn (no re-save yet) and deals no damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // a re-save (if it wrongly fired) would pass — it must NOT this turn
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stunnedEnemyState({ dc: 5, acted: false }),
      seed: seedWith(200),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('stunned'); // still stunned — first turn, no save
    expect(ent?.save_ends_acted).toContain('stunned'); // now marked as having had a turn
    expect(r.newState.characters[0].hp).toBe(60); // enemy skipped — no attack
  });

  it('re-saves on a later turn and recovers on a success', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // high roll → CON save vs DC 5 succeeds → stun ends
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stunnedEnemyState({ dc: 5, acted: true }),
      seed: seedWith(200),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions ?? []).not.toContain('stunned');
    expect(ent?.save_ends?.stunned).toBeUndefined();
  });

  it('stays stunned on a failed re-save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // low roll → CON save vs DC 25 fails → still stunned
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stunnedEnemyState({ dc: 25, acted: true }),
      seed: seedWith(200),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId && e.isEnemy);
    expect(ent?.conditions).toContain('stunned');
    expect(r.newState.characters[0].hp).toBe(60); // still incapacitated — no attack
  });
});
