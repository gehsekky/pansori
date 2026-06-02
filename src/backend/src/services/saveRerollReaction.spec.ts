// Interactive save-reroll reaction (SRD Fighter Indomitable / Bard Countercharm)
// on the enemy-attack onHitEffect condition-save path. A failed save lands the
// condition and opens a `save_reroll` pending_reaction; the player chooses
// whether to spend the reroll. Indomitable is a per-rest reroll (no Reaction);
// Countercharm spends the bard's Reaction. Accept rerolls (pre-rolled) and, on
// success, strips the condition; decline leaves it.

import type { Character, Enemy, GameState } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Auto-hit wraith that applies Frightened on a WIS save (DC 15).
const wraith = {
  id: 'wraith',
  name: 'Wraith',
  hp: 30,
  ac: 10,
  toHit: 100,
  damage: '1',
  damageType: 'necrotic',
  onHitEffect: { condition: 'frightened', ability: 'wis', dc: 15 },
} as unknown as Enemy;

function ctxFor(characters: Character[]): ActionContext {
  return {
    actor: enemyActor(wraith),
    context: ctx,
    st: { characters, entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

// Enemy attack roll, narrative pick(), original (failing) WIS save → then the
// deferred reroll draws from the 0.99 default and passes.
function pinFailingSave() {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
}

describe('Indomitable — opens a save_reroll window on a failed save', () => {
  it('a Fighter L9 failing a condition save can reroll via Indomitable', () => {
    pinFailingSave();
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 9,
      wis: 10,
      hp: 50,
      max_hp: 50,
    });
    const c = ctxFor([fighter]);
    handleEnemyAttack(c, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(c.enemySubAttack?.outcome).toBe('paused');
    const rx = c.st.pending_reaction;
    if (rx?.kind !== 'save_reroll') throw new Error('expected save_reroll');
    expect(rx.source).toBe('indomitable');
    expect(rx.reactorCharId).toBe('pc-1');
    expect(rx.condition).toBe('frightened');
    expect(c.st.characters[0].conditions).toContain('frightened'); // committed until decided
  });
});

// ─── Resolution (accept / decline) via takeAction → resolve_reaction ───────────

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Save Reroll Test',
  ship_name: 'Save Reroll Test',
  intro: '',
  seed_id: 'save-reroll-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: { ['entry_hall']: [] },
  loot: {},
  npcs: {},
};

const ent = (id: string, hp: number, enemy = false) => ({
  id,
  isEnemy: enemy,
  pos: { x: enemy ? 5 : 4, y: 5 },
  hp,
  maxHp: hp,
  conditions: [],
  condition_durations: {},
});

const buildPendingState = (opts: {
  source: 'indomitable' | 'countercharm';
  rerollSucceeds: boolean;
}): GameState => {
  // The frightened condition-holder.
  const holderClass = opts.source === 'indomitable' ? 'Fighter' : 'Cleric';
  const holder = makeChar({
    id: 'holder',
    character_class: holderClass,
    level: opts.source === 'indomitable' ? 9 : 5,
    hp: 40,
    max_hp: 40,
    conditions: ['frightened'],
    condition_durations: { frightened: 2 },
  });
  // For Countercharm the reactor is a separate bard; for Indomitable it's self.
  const bard =
    opts.source === 'countercharm'
      ? makeChar({ id: 'bard', character_class: 'Bard', level: 7, hp: 30, max_hp: 30 })
      : null;
  const reactorId = opts.source === 'indomitable' ? 'holder' : 'bard';
  const characters = bard ? [holder, bard] : [holder];
  return {
    ...makeState(),
    characters,
    active_character_id: reactorId,
    combat_active: true,
    initiative_order: [
      { id: 'holder', roll: 18, is_enemy: false },
      ...(bard ? [{ id: 'bard', roll: 15, is_enemy: false }] : []),
      { id: 'wraith-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: bard ? 2 : 1,
    entities: [ent('holder', 40), ...(bard ? [ent('bard', 30)] : []), ent('wraith-1', 30, true)],
    pending_reaction: {
      kind: 'save_reroll',
      attackerEnemyId: 'wraith-1',
      targetCharId: 'holder',
      reactorCharId: reactorId,
      reactorName: opts.source === 'indomitable' ? holder.name : bard!.name,
      source: opts.source,
      condition: 'frightened',
      saveAbility: 'wis',
      saveDc: 15,
      rerollSucceeds: opts.rerollSucceeds,
      resumeFromInitiativeIdx: bard ? 2 : 1,
      resumeFromMultiattackIdx: 1,
      narrativeSoFar: "[Wraith's turn]",
      eligibleCharIds: [reactorId],
    },
  };
};

const resolve = (state: GameState, accept: boolean) =>
  takeAction({
    action: { type: 'resolve_reaction', accept },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Indomitable — resolve the save_reroll window', () => {
  it('accept + successful reroll strips the condition and spends a use (no reaction)', async () => {
    const r = await resolve(
      buildPendingState({ source: 'indomitable', rerollSucceeds: true }),
      true
    );
    const holder = r.newState.characters.find((c) => c.id === 'holder')!;
    expect(holder.conditions).not.toContain('frightened');
    expect(holder.class_resource_uses?.indomitable).toBe(1);
    expect(holder.turn_actions.reaction_used).toBe(false); // Indomitable isn't a Reaction
    expect(r.newState.pending_reaction).toBeUndefined();
  });

  it('accept + failed reroll keeps the condition but still spends the use', async () => {
    const r = await resolve(
      buildPendingState({ source: 'indomitable', rerollSucceeds: false }),
      true
    );
    const holder = r.newState.characters.find((c) => c.id === 'holder')!;
    expect(holder.conditions).toContain('frightened');
    expect(holder.class_resource_uses?.indomitable).toBe(1);
  });

  it('decline keeps the condition and spends nothing', async () => {
    const r = await resolve(
      buildPendingState({ source: 'indomitable', rerollSucceeds: true }),
      false
    );
    const holder = r.newState.characters.find((c) => c.id === 'holder')!;
    expect(holder.conditions).toContain('frightened');
    expect(holder.class_resource_uses?.indomitable ?? 0).toBe(0);
  });
});

describe('Countercharm — resolve the save_reroll window', () => {
  it('accept + successful reroll strips the condition and spends the bard reaction', async () => {
    const r = await resolve(
      buildPendingState({ source: 'countercharm', rerollSucceeds: true }),
      true
    );
    const holder = r.newState.characters.find((c) => c.id === 'holder')!;
    const bard = r.newState.characters.find((c) => c.id === 'bard')!;
    expect(holder.conditions).not.toContain('frightened');
    expect(bard.turn_actions.reaction_used).toBe(true);
    expect(r.newState.pending_reaction).toBeUndefined();
  });

  it('decline leaves the ally frightened and the bard reaction intact', async () => {
    const r = await resolve(
      buildPendingState({ source: 'countercharm', rerollSucceeds: true }),
      false
    );
    const holder = r.newState.characters.find((c) => c.id === 'holder')!;
    const bard = r.newState.characters.find((c) => c.id === 'bard')!;
    expect(holder.conditions).toContain('frightened');
    expect(bard.turn_actions.reaction_used).toBe(false);
  });
});

// ─── Damage-save (Indomitable shrugs off a failed save-for-half) ───────────────

const fighterState = (pending: Record<string, unknown>): GameState => {
  const f = makeChar({ id: 'holder', character_class: 'Fighter', level: 9, hp: 20, max_hp: 40 });
  return {
    ...makeState(),
    characters: [f],
    active_character_id: 'holder',
    combat_active: true,
    initiative_order: [
      { id: 'holder', roll: 18, is_enemy: false },
      { id: 'wraith-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 1,
    entities: [ent('holder', 20), ent('wraith-1', 30, true)],
    pending_reaction: {
      kind: 'save_reroll',
      attackerEnemyId: 'wraith-1',
      targetCharId: 'holder',
      reactorCharId: 'holder',
      reactorName: f.name,
      source: 'indomitable',
      saveAbility: 'dex',
      saveDc: 15,
      resumeFromInitiativeIdx: 1,
      resumeFromMultiattackIdx: 0,
      narrativeSoFar: '',
      eligibleCharIds: ['holder'],
      ...pending,
    },
  } as unknown as GameState;
};

describe('Indomitable — damage-save refund', () => {
  it('accept + success refunds the failed-minus-saved damage and spends a use', async () => {
    const r = await resolve(fighterState({ damageRefund: 5, rerollSucceeds: true }), true);
    const f = r.newState.characters[0];
    expect(f.hp).toBe(25); // 20 + 5 refund
    expect(f.class_resource_uses?.indomitable).toBe(1);
  });

  it('decline keeps the full damage', async () => {
    const r = await resolve(fighterState({ damageRefund: 5, rerollSucceeds: true }), false);
    expect(r.newState.characters[0].hp).toBe(20);
  });
});

// ─── Concentration-save (Indomitable defers the break) ─────────────────────────

const concState = (rerollSucceeds: boolean): GameState => {
  const f = makeChar({
    id: 'holder',
    character_class: 'Fighter',
    level: 9,
    hp: 25,
    max_hp: 40,
    concentrating_on: { spellId: 'bless' },
  });
  return {
    ...makeState(),
    characters: [f],
    active_character_id: 'holder',
    combat_active: true,
    initiative_order: [
      { id: 'holder', roll: 18, is_enemy: false },
      { id: 'wraith-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 1,
    entities: [ent('holder', 25), ent('wraith-1', 30, true)],
    pending_reaction: {
      kind: 'save_reroll',
      attackerEnemyId: 'wraith-1',
      targetCharId: 'holder',
      reactorCharId: 'holder',
      reactorName: f.name,
      source: 'indomitable',
      concentrationSpellId: 'bless',
      saveAbility: 'con',
      saveDc: 12,
      rerollSucceeds,
      resumeFromInitiativeIdx: 1,
      resumeFromMultiattackIdx: 0,
      narrativeSoFar: '',
      eligibleCharIds: ['holder'],
    },
  } as unknown as GameState;
};

describe('Indomitable — concentration (deferred break)', () => {
  it('accept + success keeps concentration and spends a use', async () => {
    const r = await resolve(concState(true), true);
    const f = r.newState.characters[0];
    expect(f.concentrating_on?.spellId).toBe('bless'); // held
    expect(f.class_resource_uses?.indomitable).toBe(1);
  });

  it('accept + failed reroll breaks concentration (use still spent)', async () => {
    const r = await resolve(concState(false), true);
    const f = r.newState.characters[0];
    expect(f.concentrating_on).toBeFalsy(); // broke
    expect(f.class_resource_uses?.indomitable).toBe(1);
  });

  it('decline breaks the deferred concentration', async () => {
    const r = await resolve(concState(true), false);
    expect(r.newState.characters[0].concentrating_on).toBeFalsy();
  });
});
