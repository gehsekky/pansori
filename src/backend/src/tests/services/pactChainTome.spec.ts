// SRD 5.2.1 Warlock — Pact of the Chain, Pact of the Tome, Repelling Blast and
// Eldritch Spear.
// - Chain: Find Familiar without a slot, with the special forms (Imp, Quasit,
//   ...); one familiar at a time; forgo one of your attacks so the familiar
//   attacks (within 5 ft of the target).
// - Tome: a Book of Shadows with 3 cantrips and 2 level-1 Rituals from any
//   list, always prepared.
// - Repelling Blast: an Eldritch Blast hit pushes a Large or smaller target 10 ft.
// - Eldritch Spear: Eldritch Blast range +30 ft per Warlock level.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { alwaysPreparedSpells } from '../../services/subclassSpells.js';
import { context as ctx } from '../fixtures/testContext.js';
import { tomeRitualOptions } from '../../services/invocations.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const warlock = (level: number, feats: string[], over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Warlock',
    level,
    class_levels: { warlock: level },
    cha: 16,
    feats,
    spells_known: ['eldritch_blast'],
    spell_slots_max: { 1: 2 },
    spell_slots_used: {},
    gold: 50,
    ...over,
  });

const seed = (traits: Partial<Enemy> = {}): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'CT',
    ship_name: 'CT',
    intro: '',
    seed_id: 'ct',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Brute',
          hp: 300,
          ac: 10,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          ...traits,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

// The Warlock at `pcPos`, the enemy at `enemyPos`, plus optional extra
// entities (a familiar), in combat on the Warlock's turn.
function combat(
  char: Character,
  pcPos: { x: number; y: number },
  enemyPos: { x: number; y: number },
  extra: Record<string, unknown>[] = []
): GameState {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        pos: pcPos,
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: enemyPos,
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
      ...extra,
    ],
  } as unknown as GameState;
}

const outOfCombat = (char: Character): GameState => ({
  ...makeState({ id: 'pc-1' }),
  characters: [char],
  active_character_id: 'pc-1',
});

const act = (state: GameState, action: Record<string, unknown>, s: Seed = baseSandboxSeed) =>
  takeAction({ action: action as never, history: [], state, seed: s, context: ctx });

const enemyEnt = (st: GameState) => st.entities?.find((e) => e.id === ENEMY);

describe('Pact of the Chain', () => {
  it('offers Find Familiar without a slot, special forms included', () => {
    const labels = generateChoices(
      outOfCombat(warlock(1, ['pact_of_the_chain'])),
      baseSandboxSeed,
      ctx
    ).map((c) => c.label);
    expect(labels).toContain('Pact of the Chain — cast Find Familiar: Imp (no slot)');
    expect(labels).toContain('Pact of the Chain — cast Find Familiar: Owl (no slot)');
  });

  it('casts it as an Imp, spending no slot; a recast replaces the familiar', async () => {
    const cast = (st: GameState, form: string) =>
      act(st, {
        type: 'cast_spell',
        spellId: 'find_familiar',
        slotLevel: 1,
        invocation: 'pact_of_the_chain',
        summonVariant: form,
      });
    const first = await cast(outOfCombat(warlock(1, ['pact_of_the_chain'])), 'Imp');
    const fams = first.newState.summoned_allies ?? [];
    expect(fams.map((a) => a.name)).toEqual(['Imp']);
    expect(fams[0].familiar).toBe(true);
    expect(first.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);

    const second = await cast(first.newState, 'Quasit');
    expect((second.newState.summoned_allies ?? []).map((a) => a.name)).toEqual(['Quasit']);
  });

  it('special forms need the pact', async () => {
    const r = await act(outOfCombat(warlock(1, [], { spells_known: ['find_familiar'] })), {
      type: 'cast_spell',
      spellId: 'find_familiar',
      slotLevel: 1,
      summonVariant: 'Imp',
    });
    expect((r.newState.summoned_allies ?? []).map((a) => a.name)).not.toContain('Imp');
  });

  const imp = (pos: { x: number; y: number }) => ({
    id: 'summon-imp',
    isEnemy: false,
    side: 'ally',
    summoned_by: 'pc-1',
    companionName: 'Imp',
    noAttack: true,
    toHit: 5,
    damage: '1d6+3',
    pos,
    hp: 21,
    maxHp: 21,
    conditions: [],
    condition_durations: {},
  });

  it('forgoing an attack lets the familiar attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const st = combat(warlock(1, ['pact_of_the_chain']), { x: 1, y: 4 }, { x: 4, y: 4 }, [
      imp({ x: 3, y: 4 }),
    ]);
    const offered = generateChoices(st, seed(), ctx).find(
      (c) => (c.action as { type: string }).type === 'familiar_attack'
    );
    expect(offered).toBeDefined();
    const r = await act(st, offered!.action as Record<string, unknown>, seed());
    expect(enemyEnt(r.newState)?.hp).toBeLessThan(300);
    expect(r.narrative).toMatch(/Imp strikes the Brute/);
    expect(r.newState.characters[0].turn_actions.familiar_attack_used).toBe(true);
    expect(r.newState.characters[0].turn_actions.action_used).toBe(true);
  });

  it('the familiar must be within 5 ft of the target', async () => {
    const st = combat(warlock(1, ['pact_of_the_chain']), { x: 1, y: 4 }, { x: 6, y: 4 }, [
      imp({ x: 2, y: 4 }),
    ]);
    const r = await act(st, { type: 'familiar_attack', targetEnemyId: ENEMY }, seed());
    expect(r.narrative).toMatch(/within 5 ft/);
    expect(enemyEnt(r.newState)?.hp).toBe(300);
  });
});

describe('Pact of the Tome', () => {
  const feature = (st: GameState, featureId: string, option?: string) =>
    act(st, { type: 'use_class_feature', featureId, option });

  it('inscribes cantrips (any list) up to three, always prepared', async () => {
    let st = outOfCombat(warlock(1, ['pact_of_the_tome']));
    for (const id of ['fire_bolt', 'sacred_flame', 'guidance']) {
      st = (await feature(st, 'tome_add_cantrip', id)).newState;
    }
    const pc = st.characters[0];
    expect(pc.book_of_shadows?.cantrips).toEqual(['fire_bolt', 'sacred_flame', 'guidance']);
    expect(pc.spells_known).toEqual(expect.arrayContaining(['fire_bolt', 'sacred_flame']));
    expect(alwaysPreparedSpells(pc)).toContain('guidance');
    const fourth = await feature(st, 'tome_add_cantrip', 'light');
    expect(fourth.newState.characters[0].book_of_shadows?.cantrips).toHaveLength(3);
  });

  it('inscribes level-1 Rituals only, and rewriting clears the book', async () => {
    const ritual = tomeRitualOptions({ spells_known: [] }, ctx.spellTable ?? {})[0];
    expect(ritual.ritualCasting).toBe(true);
    const st = outOfCombat(warlock(1, ['pact_of_the_tome']));
    const notRitual = await feature(st, 'tome_add_ritual', 'magic_missile');
    expect(notRitual.newState.characters[0].book_of_shadows?.rituals ?? []).toEqual([]);
    const added = await feature(st, 'tome_add_ritual', ritual.id);
    expect(added.newState.characters[0].spells_known).toContain(ritual.id);
    const cleared = await feature(added.newState, 'tome_rewrite');
    expect(cleared.newState.characters[0].spells_known).not.toContain(ritual.id);
    expect(cleared.newState.characters[0].book_of_shadows?.rituals).toEqual([]);
  });
});

describe('Eldritch Blast invocations', () => {
  const blast = (st: GameState, s: Seed) =>
    act(
      st,
      { type: 'cast_spell', spellId: 'eldritch_blast', slotLevel: 0, targetEnemyId: ENEMY },
      s
    );

  it('Repelling Blast pushes a Large or smaller target 10 ft', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // hits, low enough not to crit
    const st = combat(warlock(2, ['repelling_blast']), { x: 1, y: 4 }, { x: 2, y: 4 });
    const r = await blast(st, seed({ size: 'large' }));
    expect(r.narrative).toMatch(/Repelling Blast: Brute pushed 10 ft/);
    // The Brute then starts its own turn 15 ft away (5 ft + the 10 ft push).
    expect(r.narrative).toMatch(/\(15 ft → /);
  });

  it('Repelling Blast cannot move a Huge target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const st = combat(warlock(2, ['repelling_blast']), { x: 1, y: 4 }, { x: 2, y: 4 });
    const r = await blast(st, seed({ size: 'huge' }));
    expect(r.narrative).toMatch(/Eldritch Blast/);
    expect(r.narrative).not.toMatch(/Repelling Blast/);
  });

  it('Eldritch Spear extends the range by 30 ft per Warlock level', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    // 150 ft away: beyond 120 ft, within 120 + 60 (Warlock 2).
    const far = (feats: string[]) => combat(warlock(2, feats), { x: 0, y: 4 }, { x: 30, y: 4 });
    const plain = await blast(far([]), seed());
    expect(plain.narrative).toMatch(/out of range/);
    const spear = await blast(far(['eldritch_spear']), seed());
    expect(spear.narrative).not.toMatch(/out of range/);
    expect(enemyEnt(spear.newState)?.hp).toBeLessThan(300);
  });
});
