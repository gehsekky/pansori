// Option pickers (FE) — Polymorph's beast form + Greater Restoration's effect.
// The cast path honors the player-chosen option (action.beastForm /
// action.restorationEffect), falling back to its default when absent; the
// GameChoice carries a `pickOption` hint the FE turns into a dialog.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

// ── Polymorph ─────────────────────────────────────────────────────────────────
const polySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Poly Test',
  ship_name: 'Poly Test',
  intro: '',
  seed_id: 'poly',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: enemyId, name: 'Ogre', hp: 60, ac: 11, damage: '2d8+4', toHit: 6, wis: 7, xp: 100 },
    ],
  },
  loot: {},
  npcs: {},
};

function polyState(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    hp: 40,
    max_hp: 40,
    spells_known: ['polymorph'],
    prepared_spells: ['polymorph'],
    spell_slots_max: { 4: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Polymorph beast-form picker', () => {
  it('uses the chosen beast form HP + name', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // WIS save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'polymorph', slotLevel: 4, beastForm: 'dire_wolf' },
      history: [],
      state: polyState(),
      seed: polySeed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId);
    expect(ent?.conditions).toContain('polymorphed');
    expect(ent?.polymorph_state?.formName).toBe('Dire Wolf');
    expect(ent?.temp_hp).toBe(22);
  });

  it('defaults to Wolf (11 HP) when no beast form is chosen', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'polymorph', slotLevel: 4 },
      history: [],
      state: polyState(),
      seed: polySeed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === enemyId);
    expect(ent?.polymorph_state?.formName).toBe('Wolf');
    expect(ent?.temp_hp).toBe(11);
  });

  it('the Polymorph choice carries a beastForm option picker', () => {
    const choices = generateChoices(polyState(), polySeed, ctx);
    const poly = choices.find(
      (c) => c.action.type === 'cast_spell' && c.action.spellId === 'polymorph'
    );
    expect(poly?.pickOption?.param).toBe('beastForm');
    expect(poly?.pickOption?.options.map((o) => o.id)).toContain('dire_wolf');
  });
});

// ── Greater Restoration ─────────────────────────────────────────────────────
const grSeed: Seed = {
  context_id: ctx.id,
  world_name: 'GR Test',
  ship_name: 'GR Test',
  intro: '',
  seed_id: 'gr',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function grState(): GameState {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 9,
    wis: 18,
    gold: 200,
    conditions: ['charmed', 'poisoned'],
    exhaustion_level: 2,
    spells_known: ['greater_restoration'],
    prepared_spells: ['greater_restoration'],
    spell_slots_max: { 5: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
    characters: [cleric],
    active_character_id: 'pc-1',
  };
}

async function castGR(restorationEffect?: string) {
  return takeAction({
    action: { type: 'cast_spell', spellId: 'greater_restoration', slotLevel: 5, restorationEffect },
    history: [],
    state: grState(),
    seed: grSeed,
    context: ctx,
  });
}

describe('Greater Restoration effect picker', () => {
  it("'charmed' ends only Charmed (poisoned + exhaustion untouched)", async () => {
    const pc = (await castGR('charmed')).newState.characters[0];
    expect(pc.conditions).not.toContain('charmed');
    expect(pc.conditions).toContain('poisoned');
    expect(pc.exhaustion_level).toBe(2);
  });

  it("'exhaustion' reduces Exhaustion only (conditions untouched)", async () => {
    const pc = (await castGR('exhaustion')).newState.characters[0];
    expect(pc.exhaustion_level).toBe(1);
    expect(pc.conditions).toContain('charmed');
  });

  it('falls back to the default bundle when no effect is chosen', async () => {
    const pc = (await castGR()).newState.characters[0];
    expect(pc.conditions).not.toContain('charmed'); // default strips charmed/petrified/stunned
    expect(pc.exhaustion_level).toBe(1); // and reduces exhaustion
  });

  it('the Greater Restoration choice carries a restorationEffect option picker', () => {
    const choices = generateChoices(grState(), grSeed, ctx);
    const gr = choices.find(
      (c) => c.action.type === 'cast_spell' && c.action.spellId === 'greater_restoration'
    );
    expect(gr?.pickOption?.param).toBe('restorationEffect');
    expect(gr?.pickOption?.options.map((o) => o.id).sort()).toEqual(
      ['charmed', 'exhaustion', 'hp_max', 'petrified'].sort()
    );
  });
});
