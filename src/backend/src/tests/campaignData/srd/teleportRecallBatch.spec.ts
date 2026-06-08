// SRD spell batch — town teleportation + curse-breaking graduations:
//   Teleport (L7) / Teleportation Circle (L5) — a destination interstitial
//     listing the towns the party has VISITED; teleport_to relocates with no
//     travel time (the high-level answer to hour-per-click overland travel).
//   Word of Recall (L6) — cast in a town to designate the sanctuary; cast
//     anywhere else to return to it instantly.
//   Remove Curse (L3) — ends the Bestow Curse debuff and breaks the
//     attunement bond on cursed items (the item stays cursed).

import type { CampaignData, Character, GameState, Seed } from '../../../types.js';
import { describe, expect, it } from 'vitest';
import { generateChoices, takeAction } from '../../../services/gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as sandbox } from '../../fixtures/testContext.js';

const campaign: CampaignData = {
  world_name: 'Recall Test',
  intro: '',
  rooms: [],
  regions: [
    {
      id: 'reg1',
      name: 'The Vale',
      feetPerSquare: 5280,
      gridWidth: 8,
      gridHeight: 8,
      startPos: { x: 0, y: 0 },
      sites: [
        { id: 's_mill', name: 'Millhaven', pos: { x: 2, y: 0 }, kind: 'town', townId: 'millhaven' },
        { id: 's_oak', name: 'Oakvale', pos: { x: 6, y: 0 }, kind: 'town', townId: 'oakvale' },
      ],
    },
  ],
  towns: [
    {
      id: 'millhaven',
      name: 'Millhaven',
      onFirstEnter: 'Millhaven for the first time — flour dust and river mist.',
      onEnter: 'Millhaven again.',
      feetPerSquare: 25,
      gridWidth: 6,
      gridHeight: 6,
      startPos: { x: 1, y: 1 },
      venues: [],
    },
    {
      id: 'oakvale',
      name: 'Oakvale',
      feetPerSquare: 25,
      gridWidth: 6,
      gridHeight: 6,
      startPos: { x: 2, y: 2 },
      venues: [],
    },
  ],
};

const ctx = { ...sandbox, campaign: { ...sandbox.campaign, ...campaign } } as typeof sandbox;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Recall Test',
  ship_name: 'Recall Test',
  intro: '',
  seed_id: 'recall',
  rooms: [],
  enemies: {},
  loot: {},
  npcs: {},
};

function caster(over: Partial<Character> = {}): Character {
  return makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 17,
    int: 18,
    spells_known: ['teleport', 'teleportation_circle', 'word_of_recall', 'remove_curse'],
    prepared_spells: ['teleport', 'teleportation_circle', 'word_of_recall', 'remove_curse'],
    spell_slots_max: { 3: 2, 5: 2, 6: 2, 7: 2 },
    spell_slots_used: {},
    ...over,
  });
}

function regionalState(over: Partial<GameState> = {}): GameState {
  return {
    ...makeState({ id: 'pc-1' }, {}),
    characters: [caster()],
    active_character_id: 'pc-1',
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 4, y: 4 },
    visited_towns: ['millhaven', 'oakvale'],
    ...over,
  } as GameState;
}

const cast = (state: GameState, spellId: string, slotLevel: number) =>
  takeAction({
    action: { type: 'cast_spell', spellId, slotLevel },
    history: [],
    state,
    seed,
    context: ctx,
  });
const act = (state: GameState, action: Parameters<typeof takeAction>[0]['action']) =>
  takeAction({ action, history: [], state, seed, context: ctx });

describe('catalog flags', () => {
  it('the four spells carry their graduation flags', () => {
    expect(SRD_SPELLS.teleport.townTeleport).toBe(true);
    expect(SRD_SPELLS.teleportation_circle.townTeleport).toBe(true);
    expect(SRD_SPELLS.word_of_recall.recall).toBe(true);
    expect(SRD_SPELLS.remove_curse.removesCurses).toBe(true);
    expect(SRD_SPELLS.remove_curse.targetType).toBe('self_or_ally');
  });
});

describe('Teleport — the destination interstitial', () => {
  it('cast opens the interstitial; choices list ONLY visited towns + cancel', async () => {
    const r = await cast(regionalState(), 'teleport', 7);
    expect(r.newState.pending_teleport).toBe('teleport');
    expect(r.newState.characters[0].spell_slots_used?.[7]).toBe(1);
    const choices = generateChoices(r.newState, seed, ctx);
    expect(choices.map((c) => c.label)).toEqual([
      'Teleport → Millhaven',
      'Teleport → Oakvale',
      '✕ Let the spell dissipate',
    ]);
  });

  it('teleport_to relocates instantly: town state, host region, gate bookmark, enter hook', async () => {
    let r = await cast(regionalState(), 'teleport', 7);
    const before = r.newState.world_minute ?? 0;
    r = await act(r.newState, { type: 'teleport_to', townId: 'millhaven' });
    const st = r.newState;
    expect(st.pending_teleport).toBeUndefined();
    expect(st.map_level).toBe('town');
    expect(st.current_town_id).toBe('millhaven');
    expect(st.marker_pos).toEqual({ x: 1, y: 1 }); // the town's startPos
    expect(st.current_region_id).toBe('reg1');
    expect(st.region_marker_pos).toEqual({ x: 2, y: 0 }); // the hosting site cell
    expect(st.world_minute ?? 0).toBe(before); // no travel time
    // Already visited → the plain enter hook plays.
    expect(r.narrative).toContain('the party stands in Millhaven');
    expect(r.narrative).toContain('Millhaven again.');
  });

  it('rejects an unvisited destination; cancel clears the interstitial', async () => {
    let r = await cast(regionalState({ visited_towns: ['millhaven'] }), 'teleportation_circle', 5);
    const bad = await act(r.newState, { type: 'teleport_to', townId: 'oakvale' });
    expect(bad.narrative).toContain('knows no such place');
    expect(bad.newState.pending_teleport).toBe('teleportation_circle');
    r = await act(bad.newState, { type: 'cancel_teleport' });
    expect(r.newState.pending_teleport).toBeUndefined();
  });

  it('with no town ever visited, the cast fizzles BEFORE spending the slot', async () => {
    const r = await cast(regionalState({ visited_towns: [] }), 'teleport', 7);
    expect(r.narrative).toContain('visit a town first');
    expect(r.newState.characters[0].spell_slots_used?.[7] ?? 0).toBe(0);
    expect(r.newState.pending_teleport).toBeUndefined();
  });
});

describe('Word of Recall — designate, then return', () => {
  it('cast in a town designates it as the sanctuary', async () => {
    const inTown = regionalState({
      map_level: 'town',
      current_town_id: 'oakvale',
      marker_pos: { x: 2, y: 2 },
    });
    const r = await cast(inTown, 'word_of_recall', 6);
    expect(r.newState.recall_town_id).toBe('oakvale');
    expect(r.narrative).toContain('Oakvale is consecrated');
  });

  it('cast in the wild returns the party to the sanctuary instantly', async () => {
    const out = regionalState({ recall_town_id: 'oakvale' });
    const r = await cast(out, 'word_of_recall', 6);
    expect(r.newState.map_level).toBe('town');
    expect(r.newState.current_town_id).toBe('oakvale');
    expect(r.newState.marker_pos).toEqual({ x: 2, y: 2 });
    expect(r.narrative).toContain('the party stands in Oakvale');
  });

  it('no sanctuary and not in a town: fizzles before the slot is spent', async () => {
    const r = await cast(regionalState(), 'word_of_recall', 6);
    expect(r.narrative).toContain('no sanctuary');
    expect(r.newState.characters[0].spell_slots_used?.[6] ?? 0).toBe(0);
  });
});

describe('Remove Curse', () => {
  it('lifts the cursed condition and breaks cursed attunements (others kept)', async () => {
    const ring = {
      id: 'ring_of_clinging',
      name: 'Ring of Clinging',
      type: 'wondrous',
      cursed: true,
      instance_id: 'inst-cursed',
    };
    const cloak = {
      id: 'fine_cloak',
      name: 'Fine Cloak',
      type: 'wondrous',
      instance_id: 'inst-ok',
    };
    const afflicted = caster({
      conditions: ['cursed'],
      condition_durations: { cursed: 5 },
      inventory: [ring, cloak] as never,
      attuned_items: ['inst-cursed', 'inst-ok'],
    });
    const st = regionalState({ characters: [afflicted] });
    const r = await cast(st, 'remove_curse', 3);
    const pc = r.newState.characters[0];
    expect(pc.conditions).not.toContain('cursed');
    expect(pc.condition_durations?.cursed).toBeUndefined();
    // The cursed bond breaks; the un-cursed attunement survives.
    expect(pc.attuned_items).toEqual(['inst-ok']);
    expect(r.narrative).toContain('Ring of Clinging');
  });
});
