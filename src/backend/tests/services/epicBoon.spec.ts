// RE — Epic Boon (SRD level-19 feature). At an ASI milestone of level 19+ the
// player may take an Epic Boon feat in place of the +2 ASI. generateChoices
// surfaces each qualifying boon as a `take_feat` choice with the +1 auto-
// targeted at the character's best eligible ability.

import type { GameState, Seed } from '../../src/types.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { generateChoices } from '../../src/services/gameEngine.js';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Epic Boon Test',
  ship_name: 'Epic Boon Test',
  intro: '',
  seed_id: 'epic-boon',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

// ASI / Epic-Boon choices surface inside the leveling pane now (active_leveling).
function stateFor(char: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [char],
    active_character_id: 'pc-1',
    active_leveling: { characterId: 'pc-1' },
  };
}

describe('Epic Boon — L19 ASI choice surface', () => {
  it('offers epic boons alongside the +2 ASI at level 19', () => {
    const char = makeChar({
      id: 'pc-1',
      level: 19,
      asi_pending: true,
      character_class: 'Fighter',
      spell_slots_max: {},
    });
    const choices = generateChoices(stateFor(char), seed, ctx);
    expect(choices.some((c) => c.label.includes('Ability Score Improvement'))).toBe(true);
    expect(choices.filter((c) => c.label.startsWith('Epic Boon:')).length).toBeGreaterThan(0);
    const truesight = choices.find((c) => c.label.includes('Boon of Truesight'));
    expect(truesight?.action).toMatchObject({ type: 'take_feat', featId: 'boon_truesight' });
    expect((truesight?.action as { abilityChoice?: string }).abilityChoice).toBeTruthy();
  });

  it('does not offer epic boons below level 19', () => {
    const char = makeChar({
      id: 'pc-1',
      level: 16,
      asi_pending: true,
      character_class: 'Fighter',
      spell_slots_max: {},
    });
    const choices = generateChoices(stateFor(char), seed, ctx);
    expect(choices.some((c) => c.label.startsWith('Epic Boon:'))).toBe(false);
  });

  it('auto-targets the +1 at the highest eligible ability', () => {
    const char = makeChar({
      id: 'pc-1',
      level: 19,
      asi_pending: true,
      character_class: 'Fighter',
      str: 14,
      dex: 20,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      spell_slots_max: {},
    });
    const choices = generateChoices(stateFor(char), seed, ctx);
    const truesight = choices.find((c) => c.label.includes('Boon of Truesight'));
    expect((truesight?.action as { abilityChoice?: string }).abilityChoice).toBe('dex');
    expect(truesight?.label).toMatch(/\+1 DEX/);
  });

  it('gates Boon of Spell Recall on having a spellcasting feature', () => {
    const fighter = makeChar({
      id: 'pc-1',
      level: 19,
      asi_pending: true,
      character_class: 'Fighter',
      spell_slots_max: {},
    });
    const wizard = makeChar({
      id: 'pc-1',
      level: 19,
      asi_pending: true,
      character_class: 'Wizard',
      spell_slots_max: { 1: 4, 2: 3 },
    });
    const fChoices = generateChoices(stateFor(fighter), seed, ctx);
    const wChoices = generateChoices(stateFor(wizard), seed, ctx);
    expect(fChoices.some((c) => c.label.includes('Spell Recall'))).toBe(false);
    expect(wChoices.some((c) => c.label.includes('Spell Recall'))).toBe(true);
  });
});
