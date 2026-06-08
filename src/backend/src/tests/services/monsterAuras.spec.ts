// SRD monster auras / emanations — Ghast Stench. A PC that starts its turn
// within the aura's radius makes the aura's save or suffers its effect
// (Stench: CON save DC 10 or Poisoned). `applyMonsterAuras` is the turn-start
// hook (wired into the PC turn advance, mirroring Holy Nimbus on the enemy
// side). The Ghast PC here is a Wizard (no CON save proficiency, CON 10) so a
// pinned d20 settles the save: 0.1 → 3 (a fail), 0.95 → 20 (a success).

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMonsterAuras, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

describe('Ghast Stench — catalog', () => {
  it('the Ghast template carries the Stench aura', () => {
    expect(SRD_MONSTERS.ghast.aura).toMatchObject({
      radiusFt: 5,
      save: { ability: 'con', dc: 10 },
      condition: 'poisoned',
    });
  });
});

// A Wizard (CON 10, no CON save proficiency) so the CON save is a bare d20.
function pc() {
  return makeChar({ id: 'pc', character_class: 'Wizard', level: 5, con: 10, hp: 30, max_hp: 30 });
}

// Seed carrying a real Ghast (with its Stench aura) under id 'g1'.
function seedWithGhast(): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Aura Test',
    ship_name: 'Aura Test',
    intro: '',
    seed_id: 'aura',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: [{ id: 'g1', ...SRD_MONSTERS.ghast } as Enemy] },
    loot: {},
    npcs: {},
  };
}

// PC at (5,5); ghast at `ghastPos`. (5,6) = 5 ft (in range); (5,8) = 15 ft (out).
function stateWith(ghastPos: { x: number; y: number }): GameState {
  return {
    characters: [pc()],
    enemies_killed: [],
    entities: [
      {
        id: 'pc',
        isEnemy: false,
        pos: { x: 5, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: 'g1',
        isEnemy: true,
        pos: ghastPos,
        hp: 36,
        maxHp: 36,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('applyMonsterAuras — Ghast Stench at turn start', () => {
  it('poisons a PC who starts its turn in range and fails the CON save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20 = 3 → fails DC 10
    const r = applyMonsterAuras(pc(), stateWith({ x: 5, y: 6 }), seedWithGhast(), ctx);
    expect(r.char.conditions).toContain('poisoned');
    expect(r.char.condition_durations.poisoned).toBe(1);
    expect(r.narrative).toMatch(/Stench/);
  });

  it('does not poison a PC who succeeds the save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // d20 = 20 → succeeds
    const r = applyMonsterAuras(pc(), stateWith({ x: 5, y: 6 }), seedWithGhast(), ctx);
    expect(r.char.conditions).not.toContain('poisoned');
    expect(r.narrative).toMatch(/resists/);
  });

  it('does not affect a PC outside the aura radius', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // would fail if it rolled
    const r = applyMonsterAuras(pc(), stateWith({ x: 5, y: 8 }), seedWithGhast(), ctx); // 15 ft
    expect(r.char.conditions).not.toContain('poisoned');
    expect(r.narrative).toBe('');
  });

  it('is a no-op when the nearby enemy has no aura', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const seed: Seed = {
      ...seedWithGhast(),
      enemies: {
        ['entry_hall']: [
          { id: 'g1', name: 'Goblin', hp: 7, ac: 13, damage: '1d6', toHit: 4, xp: 25 } as Enemy,
        ],
      },
    };
    const r = applyMonsterAuras(pc(), stateWith({ x: 5, y: 6 }), seed, ctx);
    expect(r.char.conditions).not.toContain('poisoned');
    expect(r.narrative).toBe('');
  });

  it('is a no-op for a downed PC', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const downed = makeChar({ id: 'pc', character_class: 'Wizard', con: 10, hp: 0, max_hp: 30 });
    const r = applyMonsterAuras(downed, stateWith({ x: 5, y: 6 }), seedWithGhast(), ctx);
    expect(r.char.conditions).not.toContain('poisoned');
  });
});

// Integration: the aura fires when a PC's turn begins (the turn-advance hook).
// A single PC Dodges (ending its turn) → the Ghast acts → the PC's new turn
// begins adjacent to the Ghast → Stench fires.
describe('Stench fires at the PC turn start (via takeAction)', () => {
  it('poisons the PC when its next turn begins adjacent to the Ghast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // Ghast misses (Dodge); CON save d20 3 → fails
    // Rogue: no CON save proficiency (CON 10) → the Stench save is a bare d20;
    // high AC + Dodge so the Ghast's intervening attack misses.
    const rogue = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 5,
      con: 10,
      dex: 16,
      ac: 16,
      hp: 40,
      max_hp: 40,
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [rogue],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 20, is_enemy: false },
        { id: 'g1', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'g1',
          isEnemy: true,
          pos: { x: 5, y: 6 },
          hp: 36,
          maxHp: 36,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'dodge' },
      history: [],
      state,
      seed: seedWithGhast(),
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).toContain('poisoned');
    expect(r.narrative).toMatch(/Stench/);
  });
});
