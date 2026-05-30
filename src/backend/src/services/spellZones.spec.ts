// RE-4 — persistent damage zones (Moonbeam, Flaming Sphere). A zone stamps grid
// cells on cast, ticks once immediately, then deals damage to hostiles standing
// in it on each round wrap, until the caster's concentration ends. Tests cover
// the footprint helper, the shared tick (save / no-save / out-of-zone / kill),
// the Moonbeam cast, and concentration cleanup.

import type { GameState, Seed, SpellZone } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyZoneTick,
  breakConcentration,
  generateChoices,
  takeAction,
  zoneCells,
} from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Spell Zone Test',
  ship_name: 'Spell Zone Test',
  intro: '',
  seed_id: 'zone',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {
    [ctx.startRoomId]: [
      { id: ENEMY, name: 'Ogre', hp: 100, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 8, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function combatState(enemyPos: { x: number; y: number }, enemyHp = 100): GameState {
  const druid = makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level: 5,
    wis: 18,
    spells_known: ['moonbeam'],
    prepared_spells: ['moonbeam'],
    spell_slots_max: { 1: 4, 2: 3 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [druid],
    active_character_id: 'pc-1',
    // PC-only initiative: an action-cost zone cast/move advances the turn, and
    // we don't want the enemy's counterattack (which could randomly break
    // concentration and tear down the zone) to make these tests flaky. The
    // round wrap — and thus the zone's round-wrap tick — still fires.
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: enemyPos,
        hp: enemyHp,
        maxHp: 100,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const zone = (over: Partial<SpellZone> = {}): SpellZone => ({
  id: 'z1',
  casterId: 'pc-1',
  spellId: 'moonbeam',
  name: 'Moonbeam',
  roomId: ctx.startRoomId,
  cells: [{ x: 5, y: 5 }],
  damage: '2d10',
  damageType: 'radiant',
  savingThrow: 'con',
  saveEffect: 'half',
  saveDC: 99, // unbeatably high → save always fails in these tests
  ...over,
});

describe('zoneCells footprint', () => {
  it('a 5-ft radius is the single center cell; 10-ft is a 3×3', () => {
    expect(zoneCells({ x: 3, y: 3 }, 5, 8, 8)).toHaveLength(1);
    expect(zoneCells({ x: 3, y: 3 }, 10, 8, 8)).toHaveLength(9);
  });

  it('clips the footprint to the grid bounds', () => {
    expect(zoneCells({ x: 0, y: 0 }, 10, 8, 8).length).toBeLessThan(9);
  });
});

describe('applyZoneTick', () => {
  it('damages an enemy standing in the zone (CON save for half)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save roll fails
    const res = applyZoneTick(combatState({ x: 5, y: 5 }), zone(), seed, ctx);
    expect(res.st.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });

  it('does not touch an enemy outside the zone cells', () => {
    const res = applyZoneTick(combatState({ x: 2, y: 2 }), zone(), seed, ctx);
    expect(res.st.entities?.find((e) => e.id === ENEMY)?.hp).toBe(100);
  });

  it('auto-damages (no save) when savingThrow is undefined', () => {
    const res = applyZoneTick(
      combatState({ x: 5, y: 5 }),
      zone({ savingThrow: undefined, saveEffect: undefined, damage: '4d4' }),
      seed,
      ctx
    );
    expect(res.st.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });

  it('resolves a kill (marks enemies_killed) when the tick drops the enemy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // max damage
    const res = applyZoneTick(combatState({ x: 5, y: 5 }, 3), zone(), seed, ctx);
    // The lone enemy dies → enemies_killed records it (and the room clears,
    // which ends combat and tears down entities — so we assert the kill marker).
    expect(res.st.enemies_killed).toContain(ENEMY);
  });
});

describe('Moonbeam — cast creates a concentration-linked zone and ticks once', () => {
  it('stamps spell_zones, links concentration, and damages the target on cast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy fails the on-cast save
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'moonbeam', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: combatState({ x: 2, y: 2 }), // enemy is where Moonbeam is centered
      seed,
      context: ctx,
    });
    expect(r.newState.spell_zones?.length).toBe(1);
    expect(r.newState.spell_zones?.[0].spellId).toBe('moonbeam');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('moonbeam');
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });
});

describe('Spirit Guardians — caster-following aura', () => {
  // combatState places the caster at (1,1); enemy near it should be hit even
  // though the zone's stored `cells` are stale, because a followsCaster zone
  // recomputes its footprint from the caster's current cell.
  const auraZone = (over: Partial<SpellZone> = {}): SpellZone =>
    zone({
      spellId: 'spirit_guardians',
      name: 'Spirit Guardians',
      cells: [{ x: 0, y: 0 }], // deliberately stale — should be ignored
      followsCaster: true,
      radiusFt: 15,
      damage: '3d8',
      ...over,
    });

  it('damages an enemy within the aura recomputed from the caster’s position', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save fails
    // Enemy at (3,3) is 2 squares from the caster at (1,1) → inside the 15-ft aura.
    const res = applyZoneTick(combatState({ x: 3, y: 3 }), auraZone(), seed, ctx);
    expect(res.st.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });

  it('a non-following zone with the same stale cells would miss that enemy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const res = applyZoneTick(
      combatState({ x: 3, y: 3 }),
      auraZone({ followsCaster: false }), // uses the stale [{0,0}] cells
      seed,
      ctx
    );
    expect(res.st.entities?.find((e) => e.id === ENEMY)?.hp).toBe(100);
  });

  it('cast stamps a caster-following, concentration-linked zone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const cleric = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      level: 5,
      wis: 18,
      spells_known: ['spirit_guardians'],
      prepared_spells: ['spirit_guardians'],
      spell_slots_max: { 1: 4, 2: 3, 3: 2 },
      spell_slots_used: {},
    });
    const st = combatState({ x: 2, y: 2 }); // enemy adjacent to caster at (1,1)
    st.characters = [cleric];
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'spirit_guardians',
        slotLevel: 3,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.spell_zones?.[0].followsCaster).toBe(true);
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('spirit_guardians');
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });
});

describe('Call Lightning + Spike Growth — placed zones', () => {
  function druidWith(spellId: string, enemyPos: { x: number; y: number }): GameState {
    const druid = makeChar({
      id: 'pc-1',
      character_class: 'Druid',
      level: 5,
      wis: 18,
      spells_known: [spellId],
      prepared_spells: [spellId],
      spell_slots_max: { 1: 4, 2: 3, 3: 2 },
      spell_slots_used: {},
    });
    const st = combatState(enemyPos);
    st.characters = [druid];
    return st;
  }

  it('Call Lightning strikes the target point (DEX-save zone)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy fails its DEX save
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'call_lightning', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state: druidWith('call_lightning', { x: 2, y: 2 }),
      seed,
      context: ctx,
    });
    expect(r.newState.spell_zones?.[0].spellId).toBe('call_lightning');
    expect(r.newState.spell_zones?.[0].savingThrow).toBe('dex');
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });

  it('Spike Growth auto-damages hostiles in the field (no save)', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'spike_growth', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: druidWith('spike_growth', { x: 3, y: 3 }),
      seed,
      context: ctx,
    });
    const z = r.newState.spell_zones?.[0];
    expect(z?.spellId).toBe('spike_growth');
    expect(z?.savingThrow).toBeUndefined(); // automatic — no save
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });
});

describe('move_zone — repositioning placed zones', () => {
  const placedZone = (over: Partial<SpellZone>): SpellZone =>
    zone({ center: { x: 2, y: 2 }, cells: [{ x: 2, y: 2 }], radiusFt: 10, ...over });

  it('Flaming Sphere rolls (bonus action) onto an enemy and damages it there', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy fails its DEX save
    const st = combatState({ x: 4, y: 4 }, 100); // enemy 2 squares from the zone center
    st.spell_zones = [
      placedZone({
        spellId: 'flaming_sphere',
        name: 'Flaming Sphere',
        damageType: 'fire',
        savingThrow: 'dex',
      }),
    ];
    const r = await takeAction({
      action: { type: 'move_zone', zoneId: 'z1', to: { x: 4, y: 4 } },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.spell_zones?.[0].center).toEqual({ x: 4, y: 4 });
    expect(r.newState.characters[0].turn_actions.bonus_action_used).toBe(true);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(100);
  });

  it('Moonbeam re-aims as a Magic action and repositions the beam', async () => {
    // An action-cost move ends the PC's turn (usedInitiative) — the turn then
    // advances, so we assert the durable outcome: the zone moved to the new cell.
    const st = combatState({ x: 5, y: 5 });
    st.spell_zones = [placedZone({ spellId: 'moonbeam', radiusFt: 5 })];
    const r = await takeAction({
      action: { type: 'move_zone', zoneId: 'z1', to: { x: 4, y: 4 } },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.newState.spell_zones?.[0].center).toEqual({ x: 4, y: 4 });
  });

  it('rejects a move beyond the spell’s range (and leaves the zone in place)', async () => {
    const st = combatState({ x: 7, y: 7 });
    st.spell_zones = [
      placedZone({ spellId: 'flaming_sphere', center: { x: 0, y: 0 }, cells: [{ x: 0, y: 0 }] }),
    ];
    const r = await takeAction({
      action: { type: 'move_zone', zoneId: 'z1', to: { x: 7, y: 7 } }, // 35 ft > 30
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/at most 30 ft/i);
    expect(r.newState.spell_zones?.[0].center).toEqual({ x: 0, y: 0 });
  });

  it('rejects repositioning a stationary zone (Spike Growth)', async () => {
    const st = combatState({ x: 2, y: 2 });
    st.spell_zones = [placedZone({ spellId: 'spike_growth', savingThrow: undefined })];
    const r = await takeAction({
      action: { type: 'move_zone', zoneId: 'z1', to: { x: 2, y: 2 } },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/can't be repositioned/i);
  });

  it('generateChoices offers a move for a movable zone with an enemy in range', () => {
    const st = combatState({ x: 3, y: 3 });
    st.spell_zones = [placedZone({ spellId: 'flaming_sphere', name: 'Flaming Sphere' })];
    const offered = generateChoices(st, seed, ctx).filter((c) => c.action.type === 'move_zone');
    expect(offered.length).toBeGreaterThan(0);
  });
});

describe('breakConcentration clears the caster’s zones', () => {
  it('removes spell_zones owned by the caster', () => {
    const caster = makeChar({
      id: 'pc-1',
      concentrating_on: { spellId: 'moonbeam', rounds_left: 10 },
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [caster],
      spell_zones: [zone()],
    };
    const res = breakConcentration(caster, st, ctx);
    expect(res.st.spell_zones).toHaveLength(0);
  });
});
