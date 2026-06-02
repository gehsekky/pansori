// Deflect Attacks (SRD 5.2.1, Monk L3) is an INTERACTIVE reaction: when an
// attack dealing Bludgeoning/Piercing/Slashing damage hits the Monk, the engine
// pauses (deflect_attacks pending_reaction) and the player chooses whether to
// spend the Reaction. Accept reduces the damage by 1d10 + DEX + Monk level;
// decline takes the full hit. Mirrors the Uncanny Dodge reaction wiring.

import type { Character, Enemy, GameState } from '../types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { ActionContext } from './actions/types.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { enemyActor } from './actions/actor.js';
import { handleEnemyAttack } from './actions/enemyAttack.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// ─── Pause-open + controls (via handleEnemyAttack / resolveEnemySubAttack) ─────

// Auto-hit (toHit 100) flat-20 damage enemy. damageType varies per test.
const brute = (damageType: string) =>
  ({
    id: 'brute',
    name: 'Brute',
    hp: 50,
    ac: 10,
    toHit: 100,
    damage: '20',
    damageType,
  }) as unknown as Enemy;

function ctxFor(monk: Character, enemy: Enemy): ActionContext {
  return {
    actor: enemyActor(enemy),
    context: ctx,
    st: { characters: [monk], entities: [], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
}

const monk = (level: number, over = {}) =>
  makeChar({ id: 'pc-1', character_class: 'Monk', level, dex: 16, hp: 40, max_hp: 40, ...over });

const attack = {
  type: 'enemy_attack' as const,
  targetCharId: 'pc-1',
  advIdx: 0,
  multiattackIdx: 0,
};

const doneTargetHp = (c: ActionContext) => {
  if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
  return c.enemySubAttack.target.hp;
};

describe('Deflect Attacks — pause window opens on a B/P/S hit', () => {
  // Pin RNG so the auto-hit (toHit 100) resolves deterministically regardless
  // of sibling-spec spy bleed in a shared worker.
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));

  it('a Monk L3 hit by slashing pauses without committing damage', () => {
    const c = ctxFor(monk(3), brute('slashing'));
    handleEnemyAttack(c, attack);
    expect(c.enemySubAttack?.outcome).toBe('paused');
    expect(c.st.pending_reaction?.kind).toBe('deflect_attacks');
    // Full damage is NOT committed yet — it lives in the proposed snapshot.
    expect(c.st.characters[0].hp).toBe(40);
    expect(c.narrative).toContain('Deflect Attacks available');
  });

  it('does not open below L3 (control) — full damage commits', () => {
    const c = ctxFor(monk(2), brute('slashing'));
    handleEnemyAttack(c, attack);
    expect(doneTargetHp(c)).toBe(20); // full 20, no window
  });

  it('does not open for non-B/P/S damage (control)', () => {
    const c = ctxFor(monk(3), brute('fire'));
    handleEnemyAttack(c, attack);
    expect(doneTargetHp(c)).toBe(20); // fire isn't deflectable
  });

  it('does not open when the reaction is already spent (control)', () => {
    const c = ctxFor(
      monk(3, {
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: true,
          free_interaction_used: false,
        },
      }),
      brute('slashing')
    );
    handleEnemyAttack(c, attack);
    expect(doneTargetHp(c)).toBe(20); // no reaction left
  });
});

// ─── Accept / decline resolution (via takeAction → resolve_reaction) ───────────

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Deflect Test',
  ship_name: 'Deflect Test',
  intro: '',
  seed_id: 'deflect-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: { ['entry_hall']: [] },
  loot: {},
  npcs: {},
};

const buildPendingState = (proposedDamage: number): GameState => {
  const m = makeChar({
    id: 'pc-1',
    character_class: 'Monk',
    level: 3,
    dex: 16,
    hp: 40,
    max_hp: 40,
  });
  const proposedChar = { ...m, hp: Math.max(0, m.hp - proposedDamage) };
  const ent = (hp: number) => ({
    id: 'pc-1',
    isEnemy: false,
    pos: { x: 4, y: 5 },
    hp,
    maxHp: 40,
    conditions: [],
    condition_durations: {},
  });
  const goblinEnt = {
    id: 'brute-1',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 50,
    maxHp: 50,
    conditions: [],
    condition_durations: {},
  };
  return {
    ...makeState(),
    characters: [m],
    active_character_id: 'pc-1',
    combat_active: true,
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: 'brute-1', roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [ent(m.hp), goblinEnt],
    pending_reaction: {
      kind: 'deflect_attacks',
      attackerEnemyId: 'brute-1',
      targetCharId: 'pc-1',
      atkTotal: 25,
      proposedDamage,
      pendingFragment: {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'brute-1',
        attackerName: 'Brute',
        targetCharId: 'pc-1',
        targetName: m.name,
        damage: proposedDamage,
        damageType: 'slashing',
        atkTotal: 25,
        targetAc: 14,
        prose: `The Brute strikes ${m.name} for ${proposedDamage} damage.`,
      },
      pendingProposedChar: proposedChar,
      pendingProposedSt: {
        characters: [proposedChar],
        entities: [ent(proposedChar.hp), goblinEnt],
        round: 1,
      } as unknown as GameState,
      resumeFromInitiativeIdx: 1,
      resumeFromMultiattackIdx: 1,
      narrativeSoFar: "[Brute's turn]",
      eligibleCharIds: ['pc-1'],
    },
  };
};

describe('Deflect Attacks — accept reduces the damage', () => {
  it('reduces by 1d10 + DEX + Monk level and consumes the reaction', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d10 → 6; reduction = 6 + 3 + 3 = 12
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state: buildPendingState(20),
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    // 20 damage − 12 reduction = 8 lands. HP 40 → 32.
    expect(after.hp).toBe(32);
    expect(after.turn_actions.reaction_used).toBe(true);
    expect(result.narrative).toContain('Deflect Attacks');
    expect(result.newState.pending_reaction).toBeUndefined();
  });
});

describe('Deflect Attacks — decline takes the full hit', () => {
  it('commits the full-damage proposed snapshot', async () => {
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state: buildPendingState(20),
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.hp).toBe(20); // full 20
    expect(result.narrative).toMatch(/Deflect Attacks declined/);
    expect(result.newState.pending_reaction).toBeUndefined();
  });
});
