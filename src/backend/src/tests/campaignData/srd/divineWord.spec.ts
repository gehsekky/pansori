// SRD Divine Word (L7) — engine-backed CHA-save word of power. Each enemy in
// range makes a CHA save; on a failure the effect is keyed to its CURRENT HP
// (≤20 dies; 21–30 Blinded+Deafened+Stunned; 31–40 Blinded+Deafened; 41–50
// Deafened). Above 50 HP it's unaffected.
//
// Math.random draws per target: [one leading cast-path draw] [CHA save d20].
// We force a failed save with a low d20 (the enemy has poor CHA vs a high DC),
// so no condition rolls follow.

import type { Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

describe('Divine Word — catalog', () => {
  it('is a 7th-level divine bonus-action CHA-save word, V only', () => {
    const s = SRD_SPELLS.divine_word;
    expect(s.level).toBe(7);
    expect(s.castTime).toBe('bonus_action');
    expect(s.divineWord).toBe(true);
    expect(s.savingThrow).toBe('cha');
    expect(s.rangeFt).toBe(30);
    expect(s.somatic).toBe(false);
    expect(s.spellList).toEqual(['divine']);
  });
});

function seedWith(hp: number, cha = 6): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Word Test',
    ship_name: 'Word Test',
    intro: '',
    seed_id: 'word',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Cultist',
          hp,
          ac: 10,
          damage: '1d6',
          toHit: 3,
          xp: 50,
          cha, // poor CHA → fails the save on a low roll
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function cleric(hp: number): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 18,
    wis: 20,
    hp: 90,
    max_hp: 90,
    spells_known: ['divine_word'],
    prepared_spells: ['divine_word'],
    spell_slots_max: { 7: 1 },
    spell_slots_used: {},
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
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 5, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 6 },
        hp,
        maxHp: hp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

// Cast with the enemy at `hp`; force the CHA save to fail (low d20).
async function castFail(hp: number) {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0.5) // leading cast-path draw
    .mockReturnValueOnce(0.0) // CHA save: d20 = 1 → fails
    .mockReturnValue(0.5);
  return takeAction({
    action: { type: 'cast_spell', spellId: 'divine_word', slotLevel: 7, targetEnemyId: ENEMY },
    history: [],
    state: cleric(hp),
    seed: seedWith(hp),
    context: ctx,
  });
}

const ent = (st: GameState) => st.entities?.find((e) => e.id === ENEMY);

describe('Divine Word — current-HP brackets (failed save)', () => {
  it('≤20 HP: the target dies', async () => {
    const r = await castFail(18);
    // The lone enemy dies and combat ends (its grid entity is cleared), so the
    // proof of death is the kill list.
    expect(r.newState.enemies_killed).toContain(ENEMY);
  });

  it('21–30 HP: Blinded, Deafened, and Stunned', async () => {
    const r = await castFail(28);
    const e = ent(r.newState);
    expect(e?.conditions).toEqual(expect.arrayContaining(['blinded', 'deafened', 'stunned']));
    expect(e?.hp).toBe(28); // no HP damage
  });

  it('31–40 HP: Blinded and Deafened (not Stunned)', async () => {
    const r = await castFail(36);
    const e = ent(r.newState);
    expect(e?.conditions).toEqual(expect.arrayContaining(['blinded', 'deafened']));
    expect(e?.conditions).not.toContain('stunned');
  });

  it('41–50 HP: Deafened only', async () => {
    const r = await castFail(48);
    const e = ent(r.newState);
    expect(e?.conditions).toContain('deafened');
    expect(e?.conditions).not.toContain('blinded');
  });

  it('>50 HP: unaffected even on a failed save', async () => {
    const r = await castFail(80);
    const e = ent(r.newState);
    expect(e?.hp).toBe(80);
    expect(e?.conditions ?? []).toEqual([]);
  });
});

describe('Divine Word — a made save spares the target', () => {
  it('a successful CHA save leaves a low-HP target untouched', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.99) // CHA save: d20 = 20 → succeeds
      .mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'divine_word', slotLevel: 7, targetEnemyId: ENEMY },
      history: [],
      state: cleric(18),
      seed: seedWith(18, 20), // CHA 20 (+5) so a nat-20 clears the DC
      context: ctx,
    });
    expect(ent(r.newState)?.hp).toBe(18);
    expect(r.newState.enemies_killed).not.toContain(ENEMY);
  });
});
