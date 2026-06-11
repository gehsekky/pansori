// Post-combat "Continue" gate. endCombatState no longer snaps straight back to
// exploration — it sets combat_over_pending (when the party survived) so the FE
// shows a Continue prompt; generateChoices then offers ONLY Continue, and the
// `continue` action clears the flag to restore the normal choices.

import type { Context, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backfillRequiredPlotArmor,
  endCombatState,
  generateChoices,
  takeAction,
} from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Continue Gate Test',
  ship_name: 'Continue Gate Test',
  intro: '',
  seed_id: 'continue-gate',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

const inCombat = (over: Partial<GameState> = {}): GameState => ({
  ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
  characters: [makeChar({ id: 'pc-1', hp: 20, max_hp: 20 })],
  active_character_id: 'pc-1',
  ...over,
});

describe('endCombatState — post-combat gate', () => {
  it('sets combat_over_pending when the party survived', () => {
    const after = endCombatState(inCombat());
    expect(after.combat_active).toBe(false);
    expect(after.combat_over_pending).toBe(true);
  });

  it('does NOT gate when the whole party is dead (game-over wins)', () => {
    const dead = inCombat({
      characters: [makeChar({ id: 'pc-1', hp: 0, max_hp: 20, dead: true })],
    });
    const after = endCombatState(dead);
    expect(after.combat_over_pending).toBeFalsy();
  });

  const ents = [
    { id: 'pc-1', isEnemy: false, pos: { x: 1, y: 1 }, hp: 20 },
    { id: 'goblin', isEnemy: true, pos: { x: 3, y: 3 }, hp: 0 },
  ] as GameState['entities'];

  it('keeps the battlefield entities through the gate for a wilderness encounter', () => {
    // encounter_return marks a wilderness fight — its battlefield is the combat
    // grid, so it must survive the gate (the map already collapsed back to town).
    const after = endCombatState(
      inCombat({
        entities: ents,
        encounter_return: { level: 'town', town_id: 'town1', pos: { x: 2, y: 3 } },
      } as Partial<GameState>)
    );
    expect(after.combat_over_pending).toBe(true);
    expect(after.entities).toHaveLength(2); // battlefield kept for the gate
    expect(after.map_level).toBe('town'); // …but the underlying level collapsed
  });

  it('also keeps the battlefield for an authored-room fight (so the gate shows the field, not the exploration map)', () => {
    const after = endCombatState(inCombat({ entities: ents } as Partial<GameState>));
    expect(after.combat_over_pending).toBe(true);
    expect(after.entities).toHaveLength(2); // battlefield kept through the gate
  });

  it('drops the battlefield when the whole party is dead (game over, not a gate)', () => {
    const after = endCombatState(
      inCombat({
        entities: ents,
        characters: [makeChar({ id: 'pc-1', hp: 0, max_hp: 20, dead: true })],
      } as Partial<GameState>)
    );
    expect(after.combat_over_pending).toBeFalsy();
    expect(after.entities).toBeUndefined();
  });
});

describe('generateChoices — Continue gate', () => {
  it('offers only Continue while combat_over_pending is set', () => {
    const st = endCombatState(inCombat());
    const choices = generateChoices(st, seed, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action).toEqual({ type: 'continue' });
    expect(choices[0].kind).toBe('continue');
  });
});

describe('continue action', () => {
  it('clears combat_over_pending and restores the normal choices', async () => {
    const st = endCombatState(inCombat());
    expect(st.combat_over_pending).toBe(true);
    const r = await takeAction({
      action: { type: 'continue' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.combat_over_pending).toBe(false);
    // Back to normal exploration choices — no longer the single Continue gate.
    expect(r.choices.some((c) => c.action.type === 'continue')).toBe(false);
    expect(r.choices.length).toBeGreaterThan(0);
  });

  it('drops the kept battlefield entities when dismissing the gate', async () => {
    const st = endCombatState(
      inCombat({
        entities: [{ id: 'pc-1', isEnemy: false, pos: { x: 1, y: 1 }, hp: 20 }],
        encounter_return: { level: 'regional', pos: { x: 0, y: 0 } },
      } as Partial<GameState>)
    );
    expect(st.entities).toBeDefined(); // shown during the gate
    const r = await takeAction({
      action: { type: 'continue' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.entities).toBeUndefined(); // …cleared on Continue
  });
});

// Required-member plot armor — a campaign's locked pre-gen can fall in combat
// but is revived to 1 HP when combat ends, and a party that still holds one is
// never permanently wiped.
describe('endCombatState — required-member plot armor', () => {
  it('sets a revival_notice naming the revived member (folded into the action narrative)', () => {
    const after = endCombatState(
      inCombat({
        characters: [
          makeChar({
            id: 'req',
            name: 'Cassian Althion',
            hp: 0,
            max_hp: 20,
            dead: true,
            required: true,
          }),
          makeChar({ id: 'pc-2', hp: 6, max_hp: 12 }),
        ],
      })
    );
    expect(after.revival_notice).toContain('Cassian Althion');
    expect(after.revival_notice).toMatch(/breathing/i);
  });

  it('revives a fallen required member to 1 HP at combat end; non-required stay dead', () => {
    const after = endCombatState(
      inCombat({
        characters: [
          makeChar({
            id: 'req',
            hp: 0,
            max_hp: 20,
            dead: true,
            required: true,
            death_saves: { successes: 0, failures: 3 },
          }),
          makeChar({ id: 'pc-2', hp: 0, max_hp: 18, dead: true }), // not required → stays dead
          makeChar({ id: 'pc-3', hp: 5, max_hp: 12 }),
        ],
      })
    );
    const req = after.characters.find((c) => c.id === 'req')!;
    expect(req.dead).toBe(false);
    expect(req.hp).toBe(1);
    expect(req.death_saves).toEqual({ successes: 0, failures: 0 });
    expect(after.characters.find((c) => c.id === 'pc-2')!.dead).toBe(true);
  });

  it('also lifts a downed-but-alive required member off 0 HP and clears unconscious', () => {
    const after = endCombatState(
      inCombat({
        characters: [
          makeChar({
            id: 'req',
            hp: 0,
            max_hp: 20,
            dead: false,
            stable: true,
            required: true,
            conditions: ['unconscious'],
          }),
          makeChar({ id: 'pc-2', hp: 8, max_hp: 18 }),
        ],
      })
    );
    const req = after.characters.find((c) => c.id === 'req')!;
    expect(req.hp).toBe(1);
    expect(req.conditions).not.toContain('unconscious');
  });

  it('an all-down party that holds a required member is NOT wiped (revives + gates)', () => {
    const after = endCombatState(
      inCombat({
        characters: [
          makeChar({ id: 'req', hp: 0, max_hp: 20, dead: true, required: true }),
          makeChar({ id: 'pc-2', hp: 0, max_hp: 18, dead: true }), // stays dead
        ],
      })
    );
    expect(after.combat_over_pending).toBe(true); // survived via plot armor → Continue gate
    expect(after.characters.find((c) => c.id === 'req')!.dead).toBe(false);
    expect(after.characters.some((c) => !c.dead)).toBe(true);
  });

  it('a true wipe with NO required member is still a game-over', () => {
    const after = endCombatState(
      inCombat({
        characters: [makeChar({ id: 'pc-1', hp: 0, max_hp: 20, dead: true })],
      })
    );
    expect(after.combat_over_pending).toBeFalsy();
    expect(after.characters.every((c) => c.dead)).toBe(true);
  });
});

// Backfill upkeep — stamps `required` on pre-mechanic saves and enforces the
// "never dead out of combat" invariant (the per-action self-heal in takeAction).
describe('backfillRequiredPlotArmor', () => {
  const armorCtx = {
    campaign: { requiredMembers: [{ name: 'Cassian Althion', cls: 'Fighter' }] },
  } as unknown as Context;

  const cassian = (over: Partial<ReturnType<typeof makeChar>> = {}) =>
    makeChar({ id: 'cas', name: 'Cassian Althion', character_class: 'Fighter', ...over });

  it('backfills the required flag for a matching pre-mechanic character', () => {
    const st = { ...makeState({ id: 'cas' }), characters: [cassian()] } as GameState;
    const after = backfillRequiredPlotArmor(st, armorCtx);
    expect(after.characters[0].required).toBe(true);
  });

  it('revives a dead required member to 1 HP when OUT of combat', () => {
    const st = {
      ...makeState({ id: 'cas' }, { combat_active: false }),
      characters: [
        cassian({ hp: 0, max_hp: 23, dead: true, death_saves: { successes: 0, failures: 3 } }),
      ],
    } as GameState;
    const after = backfillRequiredPlotArmor(st, armorCtx);
    expect(after.characters[0].dead).toBe(false);
    expect(after.characters[0].hp).toBe(1);
    expect(after.characters[0].death_saves).toEqual({ successes: 0, failures: 0 });
  });

  it('does NOT revive a dead required member during combat (only flags them)', () => {
    const st = {
      ...makeState({ id: 'cas' }, { combat_active: true }),
      characters: [cassian({ hp: 0, max_hp: 23, dead: true })],
    } as GameState;
    const after = backfillRequiredPlotArmor(st, armorCtx);
    expect(after.characters[0].dead).toBe(true); // stays down mid-fight
    expect(after.characters[0].required).toBe(true);
  });

  it('leaves non-required members untouched', () => {
    const st = {
      ...makeState({ id: 'x' }, { combat_active: false }),
      characters: [
        makeChar({ id: 'x', name: 'Hireling', character_class: 'Rogue', hp: 0, dead: true }),
      ],
    } as GameState;
    const after = backfillRequiredPlotArmor(st, armorCtx);
    expect(after.characters[0].required).toBeFalsy();
    expect(after.characters[0].dead).toBe(true);
  });
});
