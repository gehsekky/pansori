// Aberrant Mind Sorcerer (2024 PHB) — L3 Psionic Spells. RAW grants
// a fixed list of mind-affect spells; pansori's catalog uses the
// closest seeded analogs (vicious_mockery, charm_person, sleep)
// until psychic-flavored spells (Mind Sliver, Dissonant Whispers,
// Arms of Hadar) are added to the SRD seed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';
import { takeAction } from '../../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Aberrant Mind Test',
  ship_name: 'Aberrant Mind Test',
  intro: '',
  seed_id: 'aberrant-mind',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: [pc],
    active_character_id: pc.id,
  };
}

describe('Aberrant Mind Sorcerer — Psionic Spells', () => {
  it('grants the psionic spell selection on subclass select', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 3,
      spells_known: ['fire_bolt'],
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'aberrant_mind' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.subclass).toBe('aberrant_mind');
    expect(after?.spells_known).toContain('vicious_mockery');
    expect(after?.spells_known).toContain('charm_person');
    expect(after?.spells_known).toContain('sleep');
    // Original spells are preserved.
    expect(after?.spells_known).toContain('fire_bolt');
    expect(result.narrative).toMatch(/Psionic Spells/);
  });

  it('does NOT duplicate a spell the character already knows', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 3,
      spells_known: ['charm_person', 'sleep'],
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'aberrant_mind' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    // Only vicious_mockery is actually new.
    const occurrences = (after?.spells_known ?? []).filter((s) => s === 'charm_person').length;
    expect(occurrences).toBe(1);
    expect(after?.spells_known).toContain('vicious_mockery');
  });

  it('does NOT grant Psionic Spells when a non-Sorcerer picks aberrant_mind', async () => {
    // Defensive: aberrant_mind is a sorcerer subclass id; pansori's
    // subclass picker shouldn't surface it for other classes, but the
    // handler still gates so a hand-crafted action doesn't grant
    // free spells.
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 3,
      spells_known: ['fire_bolt'],
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'aberrant_mind' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.spells_known).not.toContain('vicious_mockery');
  });
});
