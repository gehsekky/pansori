// Paladin features — SRD 5.2.1 Abjure Foes (L9), Restoring Touch (L14) and
// Oath of Devotion Smite of Protection (L15).

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakAbjureOnDamage, generateChoices, takeAction } from '../../services/gameEngine.js';
import { layOnHandsCurable, smiteOfProtectionAc } from '../../services/paladinFeatures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const gid = (i: number) => `${CORRIDOR_ID}#${i}`;

const goblin = (i: number): Enemy =>
  ({ id: gid(i), name: `Goblin ${i}`, hp: 500, ac: 10, damage: '1d6', toHit: 3, xp: 20 }) as Enemy;

/** Three goblins: two near the Paladin, one 75 ft away. */
const seed: Seed = {
  ...seedWithEnemy,
  enemies: { [CORRIDOR_ID]: [goblin(0), goblin(1), goblin(2)] },
};

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

const paladin = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pal',
    name: 'Paladin',
    character_class: 'Paladin',
    subclass: 'devotion',
    level,
    class_levels: { paladin: level },
    cha: 16, // +3
    hp: 80,
    max_hp: 80,
    turn_actions: fresh,
    ...over,
  });

const ally = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    name: 'Ally',
    character_class: 'Wizard',
    level: 10,
    ac: 15,
    hp: 40,
    max_hp: 40,
    ...over,
  });

const ent = (id: string, isEnemy: boolean, pos: { x: number; y: number }, hp = 500) => ({
  id,
  isEnemy,
  pos,
  hp,
  maxHp: hp,
  conditions: [] as string[],
  condition_durations: {} as Record<string, number>,
});

/** Paladin at (1,2), ally at (2,2); goblins at (3,2), (4,2) and (16,2). */
function fight(p: Character, a: Character = ally()): GameState {
  return {
    ...makeState({ id: p.id }),
    characters: [p, a],
    active_character_id: p.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: p.id, roll: 20, is_enemy: false },
      { id: a.id, roll: 15, is_enemy: false },
      { id: gid(0), roll: 5, is_enemy: true },
      { id: gid(1), roll: 4, is_enemy: true },
      { id: gid(2), roll: 3, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      ent(p.id, false, { x: 1, y: 2 }, p.hp),
      ent(a.id, false, { x: 2, y: 2 }, a.hp),
      ent(gid(0), true, { x: 3, y: 2 }),
      ent(gid(1), true, { x: 4, y: 2 }),
      ent(gid(2), true, { x: 16, y: 2 }),
    ],
    movement_used: {},
    gridWidth: 20,
    gridHeight: 8,
  } as GameState;
}

const act = (state: GameState, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

const conds = (st: GameState, id: string) => st.entities?.find((e) => e.id === id)?.conditions;

// ─── Abjure Foes ─────────────────────────────────────────────────────────────

describe('Abjure Foes (L9)', () => {
  const abjure = { type: 'use_class_feature', featureId: 'abjure_foes' };

  it('frightens the foes in range that fail, for a Channel Divinity use and the action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every save rolls a 1
    const r = await act(fight(paladin(9)), abjure);
    expect(conds(r.newState, gid(0))).toEqual(expect.arrayContaining(['frightened', 'abjured']));
    expect(conds(r.newState, gid(1))).toContain('frightened');
    expect(conds(r.newState, gid(2))).not.toContain('frightened'); // 75 ft away
    const pal = r.newState.characters[0];
    expect(pal.class_resource_uses?.channel_divinity).toBe(1); // 2 at L9, one spent
    expect(pal.turn_actions.action_used).toBe(true);
    expect(r.narrative).toMatch(/Abjure Foes/);
  });

  it('targets only CHA-modifier foes, nearest first', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await act(fight(paladin(9, { cha: 12 })), abjure); // +1 → one target
    expect(conds(r.newState, gid(0))).toContain('frightened');
    expect(conds(r.newState, gid(1))).not.toContain('frightened');
  });

  it('requires Paladin level 9', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await act(fight(paladin(8)), abjure);
    expect(conds(r.newState, gid(0))).not.toContain('frightened');
  });

  it('ends when the creature takes damage', () => {
    const st = fight(paladin(9));
    const abjured = {
      ...st,
      entities: st.entities!.map((e) =>
        e.id === gid(0) || e.id === gid(1)
          ? {
              ...e,
              conditions: ['frightened', 'abjured'],
              condition_durations: { frightened: 10, abjured: 10 },
              hp: e.id === gid(0) ? 490 : 500,
            }
          : e
      ),
    };
    const prev = new Map([
      [gid(0), 500],
      [gid(1), 500],
    ]);
    const out = breakAbjureOnDamage(abjured, prev);
    expect(conds(out, gid(0))).toEqual([]); // hurt → fear ends
    expect(conds(out, gid(1))).toEqual(['frightened', 'abjured']); // untouched
  });

  it('a weapon hit on an abjured foe ends its fear (end-to-end)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // the attack hits
    const st = fight(
      paladin(9, {
        str: 16,
        inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
        equipment: { main_hand: 'sw-1' },
        weapon_proficiencies: ['simple', 'martial'],
      })
    );
    const scared = {
      ...st,
      entities: st.entities!.map((e) =>
        e.id === gid(0)
          ? {
              ...e,
              pos: { x: 1, y: 3 }, // adjacent to the Paladin
              conditions: ['frightened', 'abjured'],
              condition_durations: { frightened: 10, abjured: 10 },
            }
          : e
      ),
    };
    const r = await act(scared, { type: 'attack', targetEnemyId: gid(0) });
    expect(r.newState.entities?.find((e) => e.id === gid(0))?.hp).toBeLessThan(500);
    expect(conds(r.newState, gid(0))).not.toContain('frightened');
  });

  it('is offered in combat', () => {
    const labels = generateChoices(fight(paladin(9)), seed, ctx).map((c) => c.label);
    expect(labels.some((l) => l.startsWith('Abjure Foes — up to 3 foes'))).toBe(true);
    const low = generateChoices(fight(paladin(8)), seed, ctx).map((c) => c.label);
    expect(low.some((l) => l.startsWith('Abjure Foes'))).toBe(false);
  });
});

// ─── Restoring Touch ─────────────────────────────────────────────────────────

describe('Restoring Touch (L14)', () => {
  it('adds six conditions to what Lay on Hands can end', () => {
    expect(layOnHandsCurable(paladin(13))).toEqual(['poisoned']);
    expect(layOnHandsCurable(paladin(14))).toEqual([
      'poisoned',
      'blinded',
      'charmed',
      'deafened',
      'frightened',
      'paralyzed',
      'stunned',
    ]);
  });

  const stunnedAlly = () => ally({ conditions: ['stunned'], condition_durations: { stunned: 3 } });

  it('ends Stunned on an ally for 5 pool points, restoring no HP', async () => {
    const st = fight(paladin(14), stunnedAlly());
    const r = await act(st, {
      type: 'lay_on_hands',
      targetCharId: 'pc-1',
      cure: true,
      condition: 'stunned',
    });
    const [pal, a] = r.newState.characters;
    expect(a.conditions).not.toContain('stunned');
    expect(a.condition_durations?.stunned).toBeUndefined();
    expect(pal.class_resource_uses?.lay_on_hands).toBe(5);
    expect(r.narrative).toMatch(/Restoring Touch/);
  });

  it('refuses below L14', async () => {
    const r = await act(fight(paladin(13), stunnedAlly()), {
      type: 'lay_on_hands',
      targetCharId: 'pc-1',
      cure: true,
      condition: 'stunned',
    });
    expect(r.newState.characters[1].conditions).toContain('stunned');
  });

  it('still cures poison when no condition is named', async () => {
    const r = await act(fight(paladin(3), ally({ conditions: ['poisoned'] })), {
      type: 'lay_on_hands',
      targetCharId: 'pc-1',
      cure: true,
    });
    expect(r.newState.characters[1].conditions).not.toContain('poisoned');
  });

  it('offers one choice per afflicted ally and condition', () => {
    const labels = generateChoices(fight(paladin(14), stunnedAlly()), seed, ctx).map(
      (c) => c.label
    );
    expect(labels).toContain('Lay on Hands — Restoring Touch: end stunned → Ally (5 HP from pool)');
  });
});

// ─── Smite of Protection ─────────────────────────────────────────────────────

describe('Smite of Protection (Devotion L15)', () => {
  const smiter = (level: number) =>
    paladin(level, {
      spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 2 },
      spell_slots_used: {},
      spells_known: ['divine_smite_spell'],
      prepared_spells: ['divine_smite_spell'],
    });
  const cast = { type: 'cast_spell', spellId: 'divine_smite_spell', slotLevel: 1 };

  it('casting Divine Smite raises Half Cover across the aura', async () => {
    const r = await act(fight(smiter(15)), cast);
    expect(r.newState.characters[0].turn_actions.smite_of_protection).toBe(true);
    expect(smiteOfProtectionAc(r.newState, 'pc-1')).toBe(2); // 5 ft away
    expect(smiteOfProtectionAc(r.newState, 'pal')).toBe(2);
    expect(r.narrative).toMatch(/Smite of Protection/);
  });

  it('belongs to the Oath of Devotion', async () => {
    const r = await act(fight({ ...smiter(15), subclass: undefined }), cast);
    expect(r.newState.characters[0].turn_actions.smite_of_protection).toBeUndefined();
  });

  it('does nothing below L15', async () => {
    const r = await act(fight(smiter(14)), cast);
    expect(r.newState.characters[0].turn_actions.smite_of_protection).toBeUndefined();
    expect(smiteOfProtectionAc(r.newState, 'pc-1')).toBe(0);
  });

  it('only covers allies inside the aura', () => {
    const st = fight(smiter(15));
    const pal = { ...st.characters[0], turn_actions: { ...fresh, smite_of_protection: true } };
    const far = {
      ...st,
      characters: [pal, st.characters[1]],
      entities: st.entities!.map((e) => (e.id === 'pc-1' ? { ...e, pos: { x: 6, y: 2 } } : e)),
    };
    expect(smiteOfProtectionAc(far, 'pc-1')).toBe(0); // 25 ft > 10-ft aura
  });

  it('turns a 16-vs-AC-15 enemy hit into a miss', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
    const swing = (st: GameState) => {
      const brute = { ...goblin(0), toHit: 5, damage: '20' } as Enemy;
      const c = {
        actor: enemyActor(brute),
        context: ctx,
        st,
        narrative: '',
      } as unknown as ActionContext;
      handleEnemyAttack(c, {
        type: 'enemy_attack',
        targetCharId: 'pc-1',
        advIdx: 0,
        multiattackIdx: 0,
      });
      if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
      return c.enemySubAttack.target.hp;
    };
    const st = fight(smiter(15));
    expect(swing(st)).toBe(20); // control: hits
    const covered = {
      ...st,
      characters: [
        { ...st.characters[0], turn_actions: { ...fresh, smite_of_protection: true } },
        st.characters[1],
      ],
    };
    expect(swing(covered)).toBe(40); // AC 17: misses
  });
});
