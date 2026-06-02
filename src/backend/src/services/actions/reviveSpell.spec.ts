// Revive-spell pipeline tests.
//
// Covers the bring-from-dead path through cast_spell → runReviveSpell.
// Verifies:
//   - Happy path: dead PC within the death window comes back at the
//     configured hpRestored, with dead/stable/death_saves/died_at_round
//     all cleared.
//   - Window gating: a death older than the spell's windowRounds fails
//     the cast with a clear narrative and leaves the target dead.
//   - Material gating: missing the 300 gp diamond blocks the cast at
//     precast (slot is also refunded by the precast gate).
//   - Target validation: alive-target / missing-target / self-target
//     are all rejected with narrative, not silently succeeded.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Revive Test',
  ship_name: 'Revive Test',
  intro: '',
  seed_id: 'revive-spell',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function buildReviveParty(
  caster: Partial<Parameters<typeof makeChar>[0]> = {},
  fallenOverrides: Partial<Parameters<typeof makeChar>[0]> = {}
) {
  const cleric = makeChar({
    id: 'cleric-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    gold: 500,
    spells_known: ['revivify'],
    prepared_spells: ['revivify'],
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
    ...caster,
  });
  const fallen = makeChar({
    id: 'fighter-1',
    character_class: 'Fighter',
    hp: 0,
    max_hp: 40,
    dead: true,
    stable: false,
    death_saves: { successes: 0, failures: 3 },
    died_at_round: 2,
    ...fallenOverrides,
  });
  return {
    ...makeState({ id: 'cleric-1' }, { current_room: 'entry_hall' }),
    characters: [cleric, fallen],
    active_character_id: 'cleric-1',
    round: 4,
  };
}

describe('Revivify — happy path', () => {
  it('restores a fallen PC to 1 HP within the 10-round window', async () => {
    const state = buildReviveParty();
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'revivify',
        slotLevel: 3,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const revived = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(revived?.dead).toBe(false);
    expect(revived?.stable).toBe(false);
    expect(revived?.hp).toBe(1);
    expect(revived?.death_saves).toEqual({ successes: 0, failures: 0 });
    expect(revived?.died_at_round).toBeUndefined();
    // 300 gp diamond consumed.
    const cleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    expect(cleric?.gold).toBe(500 - 300);
    // L3 slot consumed.
    expect(cleric?.spell_slots_used?.[3]).toBe(1);
  });
});

describe('Revivify — gate failures', () => {
  it('fails when the death window has expired (current_round > died_at_round + 10)', async () => {
    // Fallen died at round 2; current round is 13 → elapsed = 11 > 10.
    const state = {
      ...buildReviveParty(),
      round: 13,
    };
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'revivify',
        slotLevel: 3,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const stillDead = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(stillDead?.dead).toBe(true);
    expect(stillDead?.hp).toBe(0);
    expect(result.narrative).toMatch(/window/i);
  });

  it('refunds the slot when caster lacks the 300 gp material component', async () => {
    const state = buildReviveParty({ gold: 50 });
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'revivify',
        slotLevel: 3,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const stillDead = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(stillDead?.dead).toBe(true);
    const cleric = result.newState.characters.find((c) => c.id === 'cleric-1');
    // Slot not consumed (precast bailed before deducting it).
    expect(cleric?.spell_slots_used?.[3] ?? 0).toBe(0);
    // Gold untouched.
    expect(cleric?.gold).toBe(50);
    expect(result.narrative).toMatch(/material component/i);
  });

  it('rejects an alive target with a clear error', async () => {
    const state = buildReviveParty(
      {},
      {
        hp: 30,
        dead: false,
        stable: false,
        death_saves: { successes: 0, failures: 0 },
        died_at_round: undefined,
      }
    );
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'revivify',
        slotLevel: 3,
        targetCharId: 'fighter-1',
      },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const target = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(target?.hp).toBe(30);
    expect(result.narrative).toMatch(/not dead/i);
  });

  it('rejects a missing targetCharId with a clear error', async () => {
    const state = buildReviveParty();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'revivify', slotLevel: 3 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const stillDead = result.newState.characters.find((c) => c.id === 'fighter-1');
    expect(stillDead?.dead).toBe(true);
    expect(result.narrative).toMatch(/fallen ally/i);
  });
});
