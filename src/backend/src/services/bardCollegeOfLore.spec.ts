// RE-2 — Bard College of Lore: Peerless Skill (L14) lets a failed ability
// check or attack roll add a rolled Bardic Inspiration die (the BI use is
// spent only when it converts the failure to a success). Also verifies
// Magical Secrets (L10) is satisfied by pansori's list-agnostic spell model:
// a Bard casting a Cleric/Druid/Wizard spell uses CHA (it "counts as a Bard
// spell"), so no spell-list restriction needs lifting.

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPeerlessSkill, peerlessSkillDie, resolveCastingAbility } from './multiclass.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { skillCheck } from './rulesEngine.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const lore = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Bard', subclass: 'lore', level: 14, cha: 16, ...over });

describe('Peerless Skill helpers', () => {
  it('hasPeerlessSkill gates on a Lore Bard L14+', () => {
    expect(hasPeerlessSkill(lore())).toBe(true);
    expect(hasPeerlessSkill(lore({ level: 13 }))).toBe(false);
    expect(hasPeerlessSkill(lore({ subclass: 'valor' }))).toBe(false);
  });

  it('peerlessSkillDie rolls a die when a BI use remains, else 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(
      peerlessSkillDie(lore({ class_resource_uses: { bardic_inspiration: 2 } }))
    ).toBeGreaterThan(0);
    expect(peerlessSkillDie(lore({ class_resource_uses: { bardic_inspiration: 0 } }))).toBe(0);
    expect(
      peerlessSkillDie(lore({ level: 13, class_resource_uses: { bardic_inspiration: 2 } }))
    ).toBe(0);
  });
});

describe('Peerless Skill — failed ability check (skillCheck)', () => {
  it('adds the BI die and converts a failure to a success', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 → 11
    // ability 10 (+0), not proficient, DC 15 → 11 fails; +5 die → 16 succeeds.
    const r = skillCheck(10, 15, false, 1, false, false, false, false, false, false, false, 0, 5);
    expect(r.success).toBe(true);
    expect(r.peerlessSkillUsed).toBe(true);
  });

  it('does not consume the use when the die cannot rescue the check', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 → 11
    const r = skillCheck(10, 15, false, 1, false, false, false, false, false, false, false, 0, 2);
    expect(r.success).toBe(false);
    expect(r.peerlessSkillUsed).toBe(false);
  });
});

// ── Peerless Skill on a missed attack ────────────────────────────────────────
const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Lore',
  ship_name: 'Lore',
  intro: '',
  seed_id: 'lore',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 50,
        ac: 20,
        damage: '1d4',
        toHit: 2,
        xp: 30,
        dex: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function loreCombat(over: Partial<Character> = {}): GameState {
  const c = lore({
    id: 'pc-1',
    str: 14,
    equipped_weapon: 'm-1',
    inventory: [{ instance_id: 'm-1', id: 'mace', name: 'Mace' }],
    weapon_proficiencies: ['simple'],
    class_resource_uses: { bardic_inspiration: 2 },
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
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
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const attack = async (state: GameState) =>
  takeAction({
    action: { type: 'attack', targetEnemyId: ENEMY },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Peerless Skill — missed attack converted to a hit', () => {
  it('a Lore Bard L14 spends a BI use to turn a miss into a hit', async () => {
    // d20 11 + 2 STR + 5 prof = 18 vs AC 20 → miss; +d10 (6) → 24 → hit.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await attack(loreCombat());
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(50); // the converted hit landed
    expect(r.newState.characters[0].class_resource_uses?.bardic_inspiration).toBe(1); // one use spent
    expect(r.narrative).toMatch(/Peerless Skill/);
  });

  it('with no Bardic Inspiration left, the miss stands', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await attack(loreCombat({ class_resource_uses: { bardic_inspiration: 0 } }));
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(50);
    expect(r.narrative).not.toMatch(/Peerless Skill/);
  });
});

describe('Magical Secrets (L10) — cross-list spells cast as Bard spells', () => {
  it('a Bard casting a Cleric (divine) spell uses CHA', () => {
    const bard = lore({ cha: 18, wis: 8 });
    // No Bard class list overlaps 'divine' → falls back to the Bard ability.
    expect(resolveCastingAbility(bard, ['divine'], { Bard: 'cha' }, 'cha')).toBe('cha');
    expect(resolveCastingAbility(bard, ['primal'], { Bard: 'cha' }, 'cha')).toBe('cha');
  });
});
