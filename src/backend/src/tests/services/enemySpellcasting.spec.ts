// SRD 5.2.1 monster Spellcasting — the enemy resolver casts spells at the stat
// block's level ("level N version"), honours "N/Day" limits, rolls spell
// attacks (rays included), applies damage-spell riders, and resolves a spell
// that gets past Counterspell in full.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyEnemySpellDamage,
  castableEnemySpells,
  enemyCastSpell,
  resolveEnemySpell,
  takeAction,
} from '../../services/gameEngine.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const GOB = `${CORRIDOR_ID}#0`;
const spells = ctx.spellTable ?? {};

const pc = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    name: 'Hero',
    character_class: 'Fighter',
    level: 5,
    ac: 15,
    hp: 80,
    max_hp: 80,
    ...over,
  });

const caster = (over: Partial<Enemy> = {}): Enemy =>
  ({
    id: GOB,
    name: 'Hag',
    hp: 60,
    ac: 12,
    damage: '1d6',
    toHit: 4,
    xp: 100,
    spellSaveDC: 14,
    spellAttackBonus: 6,
    ...over,
  }) as Enemy;

function grid(char: Character): GameState {
  return {
    ...makeState({ id: char.id }),
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: char.id, roll: 20, is_enemy: false },
      { id: GOB, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: char.id,
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: char.hp,
        maxHp: char.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOB,
        isEnemy: true,
        pos: { x: 9, y: 2 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
    movement_used: {},
  };
}

const cast = (enemy: Enemy, spellId: string, st: GameState) =>
  resolveEnemySpell({
    enemy,
    spell: enemyCastSpell(enemy, spells[spellId]),
    target: st.characters[0],
    st,
    narrative: '',
    context: ctx,
  });

describe('bestiary spell lists', () => {
  const casters = Object.entries(SRD_MONSTERS).filter(([, m]) => (m.spells ?? []).length > 0);

  it('covers the SRD casters with combat spells', () => {
    expect(casters.length).toBeGreaterThanOrEqual(33);
  });

  it.each(casters)('%s lists castable spells with valid levels and per-day keys', (_, m) => {
    for (const id of m.spells!) {
      const sp = SRD_SPELLS[id];
      expect(sp, id).toBeDefined();
      expect(!!sp.damage || !!sp.condition, id).toBe(true);
    }
    for (const [id, lvl] of Object.entries(m.spellLevels ?? {})) {
      expect(m.spells).toContain(id);
      expect(lvl).toBeGreaterThan(SRD_SPELLS[id].level);
    }
    for (const id of Object.keys(m.spellsPerDay ?? {})) expect(m.spells).toContain(id);
    expect(m.spellSaveDC).toBeGreaterThan(0);
  });
});

describe('cast level and per-day limits', () => {
  it('casts at the stat-block level (Lich Fireball, level 5 version)', () => {
    const lich = SRD_MONSTERS.lich as unknown as Enemy;
    const fb = enemyCastSpell(lich, spells.fireball);
    expect(fb.level).toBe(5);
    expect(fb.damage).toBe('10d6');
    expect(enemyCastSpell(lich, spells.chain_lightning)).toBe(spells.chain_lightning); // base level
  });

  it('drops an N/Day spell once its uses are spent; At Will stays', () => {
    const e = caster({ spells: ['fireball', 'magic_missile'], spellsPerDay: { fireball: 1 } });
    expect(castableEnemySpells(e, {}, ctx)).toEqual(['fireball', 'magic_missile']);
    expect(castableEnemySpells(e, { enemy_spell_uses: { [GOB]: { fireball: 1 } } }, ctx)).toEqual([
      'magic_missile',
    ]);
  });

  it('skips spells the resolver cannot express', () => {
    expect(
      castableEnemySpells(caster({ spells: ['detect_magic', 'fog_cloud', 'fireball'] }), {}, ctx)
    ).toEqual(['fireball']);
  });

  it('spends a use when the enemy casts on its turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const e = caster({ spells: ['mind_spike'], spellsPerDay: { mind_spike: 1 }, castChance: 1 });
    const seed: Seed = { ...seedWithEnemy, enemies: { [CORRIDOR_ID]: [e] } };
    const r = await takeAction({
      action: { type: 'end_turn' } as never,
      history: [],
      state: grid(
        pc({
          turn_actions: {
            action_used: false,
            bonus_action_used: false,
            reaction_used: true,
            free_interaction_used: false,
          },
        })
      ),
      seed,
      context: ctx,
    });
    expect(r.narrative).toContain('Mind Spike');
    expect(r.newState.enemy_spell_uses?.[GOB]?.mind_spike).toBe(1);
  });
});

describe('spell attack rolls', () => {
  it('hits or misses against AC instead of always dealing damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // d20 = 9: +6 → 15 vs AC 15 hits
    const hit = cast(caster(), 'guiding_bolt', grid(pc()));
    expect(hit.target.hp).toBeLessThan(80);
    expect(hit.narrative).toMatch(/hit/);
    const miss = cast(caster(), 'guiding_bolt', grid(pc({ ac: 16 })));
    expect(miss.target.hp).toBe(80);
    expect(miss.narrative).toMatch(/miss/);
  });

  it('defaults the attack bonus to DC − 8 when the stat block lists none', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4); // d20 = 9: +6 (DC 14) → 15
    const e = caster({ spellAttackBonus: undefined });
    expect(cast(e, 'guiding_bolt', grid(pc())).target.hp).toBeLessThan(80);
  });

  it('rolls each Scorching Ray, one more ray per level above 2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const three = cast(caster(), 'scorching_ray', grid(pc()));
    expect(three.narrative.match(/Ray \d/g)).toHaveLength(3);
    const four = cast(caster({ spellLevels: { scorching_ray: 3 } }), 'scorching_ray', grid(pc()));
    expect(four.narrative.match(/Ray \d/g)).toHaveLength(4);
  });

  it('a hit with a rider applies it (Ray of Sickness → Poisoned)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const r = cast(caster(), 'ray_of_sickness', grid(pc()));
    expect(r.target.conditions).toContain('poisoned');
  });
});

describe('save riders and control areas', () => {
  it('a failed save against Phantasmal Killer also Frightens', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the save rolls a 1
    const r = cast(caster(), 'phantasmal_killer', grid(pc()));
    expect(r.target.hp).toBeLessThan(80);
    expect(r.target.conditions).toContain('frightened');
  });

  it('a no-damage area (Fear) reports the save without "0 damage"', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const st = grid(pc());
    const near = {
      ...st,
      entities: st.entities!.map((e) => (e.id === GOB ? { ...e, pos: { x: 4, y: 2 } } : e)),
    };
    const r = cast(caster(), 'fear', near);
    expect(r.narrative).toMatch(/fails\./);
    expect(r.narrative).not.toMatch(/0 damage|\{\{dmg\|0\}\}/);
    expect(r.target.conditions).toContain('frightened');
  });
});

describe('a spell that gets past Counterspell', () => {
  it('resolves in full — with the save — at the stat-block level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // the save succeeds
    const e = caster({ spells: ['mind_spike'], spellLevels: { mind_spike: 4 } });
    const seed: Seed = { ...seedWithEnemy, enemies: { [CORRIDOR_ID]: [e] } };
    const r = applyEnemySpellDamage(
      grid(pc()),
      { enemySpellId: 'mind_spike', intendedTargetPcId: 'pc-1', attackerEnemyId: GOB },
      ctx,
      seed
    );
    expect(r?.narrative).toMatch(/saves/);
    // Level 4 Mind Spike is 5d8; a successful save halves it (max 20).
    expect(80 - (r?.targetHp ?? 80)).toBeLessThanOrEqual(20);
  });
});
