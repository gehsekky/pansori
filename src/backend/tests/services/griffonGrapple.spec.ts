// SRD Griffon — grapple-on-hit. The Griffon's Rend lands the Grappled
// condition on a Medium-or-smaller target on any hit (no save), with a fixed
// escape DC 14 from both front claws. This rides the auto-apply onHitEffect
// path (an onHitEffect with no `ability`/`dc` applies automatically) and stamps
// `grappled_by` + `grapple_escape_dc` on the struck PC's grid entity so
// `try_escape_grapple` rolls against the static DC instead of a contested
// check. The grapple persists until escape or the Griffon is incapacitated.
//
// With Math.random() pinned to 0.5: rollDice('1dN') = floor(0.5*N)+1, so a d20
// is 11 (a hit vs AC 10, not a crit) and 1d8+4 = 9 damage.

import type { Character, CombatEntity, Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enemyActor, pcActor } from '../../src/services/actions/actor.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { SRD_MONSTERS } from '../../src/campaignData/srd/monsters.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { handleEnemyAttack } from '../../src/services/actions/enemyAttack.js';
import { handleTryEscapeGrapple } from '../../src/services/actions/combatTactical.js';
import { makeChar } from '../../src/test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

function ent(o: Partial<CombatEntity>): CombatEntity {
  return {
    id: 'x',
    isEnemy: true,
    pos: { x: 5, y: 5 },
    hp: 30,
    maxHp: 30,
    conditions: [],
    condition_durations: {},
    ...o,
  };
}

const emptySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Griffon Test',
  ship_name: 'Griffon Test',
  intro: '',
  seed_id: 'gg',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Griffon catalog — Rend grapple', () => {
  it('the Griffon carries an auto-apply (no-save) grapple onHitEffect, escape DC 14', () => {
    expect(SRD_MONSTERS.griffon.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 14,
    });
    // No save to avoid it — the grapple lands on any hit.
    expect(SRD_MONSTERS.griffon.onHitEffect?.ability).toBeUndefined();
    expect(SRD_MONSTERS.griffon.onHitEffect?.dc).toBeUndefined();
  });
});

// Resolve one Griffon swing against a PC and return the proposed character and
// state. handleEnemyAttack stashes the resolved sub-attack and writes the
// proposed state onto ctx.st.
function strike(targetHp: number): { target: Character; st: GameState } {
  const griffon = { id: 'g1', ...SRD_MONSTERS.griffon } as unknown as Enemy;
  const target = makeChar({ id: 'pc', ac: 10, hp: targetHp, max_hp: targetHp });
  const attackerEnt = ent({ id: 'g1', pos: { x: 5, y: 6 } });
  const pcEnt = ent({
    id: 'pc',
    isEnemy: false,
    pos: { x: 5, y: 5 },
    hp: targetHp,
    maxHp: targetHp,
  });
  const c = {
    actor: enemyActor(griffon, attackerEnt),
    context: ctx,
    st: { characters: [target], entities: [pcEnt, attackerEnt], round: 1 },
    narrative: '',
  } as unknown as ActionContext;
  handleEnemyAttack(c, { type: 'enemy_attack', advIdx: 0, multiattackIdx: 0, targetCharId: 'pc' });
  if (c.enemySubAttack?.outcome !== 'done')
    throw new Error(`expected a resolved attack, got ${c.enemySubAttack?.outcome}`);
  return { target: c.enemySubAttack.target as Character, st: c.st };
}

describe('Griffon Rend — grapple on a hit', () => {
  it('grapples the PC and stamps the grappler + escape DC on its entity', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 → hits AC 10; 1d8+4 = 9
    const { target, st } = strike(40);
    expect(target.hp).toBe(31); // 40 − 9
    expect(target.conditions).toContain('grappled');
    // No duration entry — the grapple persists until escape / incapacitation,
    // not the per-turn condition tick.
    expect(target.condition_durations?.grappled).toBeUndefined();
    const pcEnt = st.entities?.find((e) => e.id === 'pc');
    expect(pcEnt?.grappled_by).toBe('g1');
    expect(pcEnt?.grapple_escape_dc).toBe(14);
  });

  it('does not grapple on a miss', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // d20 1 → misses AC 10
    const { target, st } = strike(40);
    expect(target.conditions).not.toContain('grappled');
    const pcEnt = st.entities?.find((e) => e.id === 'pc');
    expect(pcEnt?.grappled_by).toBeUndefined();
  });
});

// Build a ctx for a PC already grappled by the Griffon (escape DC 14 stamped).
function escapeCtx(): ActionContext {
  const char = makeChar({ id: 'pc', str: 14, dex: 10, conditions: ['grappled'] });
  const pcEnt = ent({
    id: 'pc',
    isEnemy: false,
    conditions: ['grappled'],
    grappled_by: 'g1',
    grapple_escape_dc: 14,
  });
  const griffonEnt = ent({ id: 'g1', isEnemy: true, pos: { x: 5, y: 6 } });
  return {
    actor: pcActor(char, 0),
    context: ctx,
    seed: emptySeed,
    st: { characters: [char], entities: [pcEnt, griffonEnt] },
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('try_escape_grapple vs a fixed monster escape DC', () => {
  it('escapes against DC 14 and clears the grapple stamps', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // d20 20 → 20 ≥ 14
    const c = escapeCtx();
    handleTryEscapeGrapple(c, { type: 'try_escape_grapple' });
    expect(c.usedInitiative).toBe(true);
    expect((c.actor as { char: Character }).char.conditions).not.toContain('grappled');
    const pcEnt = c.st.entities?.find((e) => e.id === 'pc');
    expect(pcEnt?.conditions).not.toContain('grappled');
    expect(pcEnt?.grappled_by).toBeUndefined();
    expect(pcEnt?.grapple_escape_dc).toBeUndefined();
    expect(c.narrative).toMatch(/break free.*DC 14/);
  });

  it('fails to escape on a low roll and stays grappled', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20 3 → 3 < 14
    const c = escapeCtx();
    handleTryEscapeGrapple(c, { type: 'try_escape_grapple' });
    expect((c.actor as { char: Character }).char.conditions).toContain('grappled');
    const pcEnt = c.st.entities?.find((e) => e.id === 'pc');
    expect(pcEnt?.grappled_by).toBe('g1');
    expect(pcEnt?.grapple_escape_dc).toBe(14);
    expect(c.narrative).toMatch(/cannot escape.*DC 14/);
  });
});
