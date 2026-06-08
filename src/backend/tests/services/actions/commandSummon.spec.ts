// RE-1 Phase 4.5 — RAW player-command for summoned creatures. The owner
// spends a bonus action to direct a summon's target; the ally-turn AI
// honors it via selectTarget (covered in selectTarget.spec.ts). Here we
// exercise the handler: it writes commanded_target_id, validates inputs,
// rejects non-PC actors, and leaves the turn open (no usedInitiative).

import type { Character, CombatEntity, Enemy, GameState, Seed } from '../../../src/types.js';
import { describe, expect, it } from 'vitest';
import { enemyActor, pcActor } from '../../../src/services/actions/actor.js';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import type { ActionContext } from '../../../src/services/actions/types.js';
import { handleCommandSummon } from '../../../src/services/actions/commandSummon.js';

const ent = (over: Partial<CombatEntity> & Pick<CombatEntity, 'id'>): CombatEntity => ({
  isEnemy: false,
  pos: { x: 0, y: 0 },
  hp: 10,
  maxHp: 10,
  conditions: [],
  condition_durations: {},
  ...over,
});

const skeleton = (over: Partial<CombatEntity> = {}): CombatEntity =>
  ent({
    id: 'summon-1',
    side: 'ally',
    summoned_by: 'pc-1',
    companionName: 'Skeleton',
    pos: { x: 2, y: 2 },
    ...over,
  });

const orc = (over: Partial<CombatEntity> = {}): CombatEntity =>
  ent({
    id: 'orc-1',
    isEnemy: true,
    side: 'enemy',
    hp: 15,
    maxHp: 15,
    pos: { x: 5, y: 5 },
    ...over,
  });

function ctxFor(char: Character, entities: CombatEntity[]): ActionContext {
  const st: GameState = { ...makeState({ id: 'pc-1' }), characters: [char], entities };
  return {
    char,
    actor: pcActor(char, 0),
    st,
    seed: { enemies: {} } as unknown as Seed,
    narrative: '',
    usedInitiative: false,
  } as unknown as ActionContext;
}

describe('handleCommandSummon', () => {
  it('records the commanded target on the summon without ending the turn', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(char, [ent({ id: 'pc-1' }), skeleton(), orc()]);
    const result = handleCommandSummon(ctx, {
      type: 'command_summon',
      summonId: 'summon-1',
      targetEnemyId: 'orc-1',
    });
    expect(result).toBeUndefined(); // void → dispatcher deducts the bonus action
    const sm = ctx.st.entities?.find((e) => e.id === 'summon-1');
    expect(sm?.commanded_target_id).toBe('orc-1');
    expect(ctx.narrative).toContain('commands Skeleton');
    expect(ctx.usedInitiative).toBe(false); // bonus action — the owner keeps their action
  });

  it('rejects a non-PC actor', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(char, [skeleton(), orc()]);
    ctx.actor = enemyActor({ id: 'orc-1', name: 'Orc' } as unknown as Enemy);
    expect(
      handleCommandSummon(ctx, {
        type: 'command_summon',
        summonId: 'summon-1',
        targetEnemyId: 'orc-1',
      })
    ).toMatchObject({ rejected: expect.stringContaining('PC') });
  });

  it("rejects a summon the PC doesn't own", () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(char, [skeleton({ summoned_by: 'someone-else' }), orc()]);
    expect(
      handleCommandSummon(ctx, {
        type: 'command_summon',
        summonId: 'summon-1',
        targetEnemyId: 'orc-1',
      })
    ).toMatchObject({ rejected: expect.any(String) });
  });

  it('rejects when the summon has fallen', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(char, [skeleton({ hp: 0 }), orc()]);
    expect(
      handleCommandSummon(ctx, {
        type: 'command_summon',
        summonId: 'summon-1',
        targetEnemyId: 'orc-1',
      })
    ).toMatchObject({ rejected: expect.stringContaining('fallen') });
  });

  it('rejects an invalid / dead target', () => {
    const char = makeChar({ id: 'pc-1' });
    const ctx = ctxFor(char, [skeleton(), orc({ hp: 0 })]);
    expect(
      handleCommandSummon(ctx, {
        type: 'command_summon',
        summonId: 'summon-1',
        targetEnemyId: 'orc-1',
      })
    ).toMatchObject({ rejected: expect.any(String) });
    // No target written when the command is rejected.
    expect(ctx.st.entities?.find((e) => e.id === 'summon-1')?.commanded_target_id).toBeUndefined();
  });
});
