// Enemy AoE spells now apply their rider condition to PCs who fail the save
// (the mirror of the PC-side Sunburst/Weird rider). resolveEnemyAoeSpell stamps
// spell.condition on each failed, surviving party member.

import type { CombatEntity, Enemy, GameState, GridPos, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { resolveEnemySpell } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ROLL_12 = 0.55; // floor(0.55 * 20) + 1 = 12

const lich = { id: 'lich', name: 'Lich', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;

// A low-damage WIS-save "fear burst" so targets survive and only the save flips.
const fearBurst = (): Spell =>
  ({
    id: 'fear_burst',
    name: 'Fear Burst',
    damage: '5',
    savingThrow: 'wis',
    saveEffect: 'half',
    damageType: 'psychic',
    blastRadius: 20,
    aoeShape: 'sphere',
    condition: 'frightened',
    conditionDuration: 10,
  }) as unknown as Spell;

const ent = (id: string, pos: GridPos, isEnemy: boolean): CombatEntity =>
  ({ id, pos, isEnemy, hp: 99, maxHp: 99, conditions: [] }) as unknown as CombatEntity;

describe('resolveEnemyAoeSpell — rider condition on a failed save', () => {
  it('frightens a PC who fails (and records the source), but spares one who saves', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    const pc1 = makeChar({ id: 'pc1', wis: 10, hp: 30, max_hp: 30 }); // +0 → 12 < 14, fails
    const pc2 = makeChar({ id: 'pc2', wis: 20, hp: 30, max_hp: 30 }); // +5 → 17 ≥ 14, saves
    const st = {
      characters: [pc1, pc2],
      entities: [
        ent('lich', { x: 5, y: 5 }, true),
        ent('pc1', { x: 0, y: 0 }, false),
        ent('pc2', { x: 1, y: 0 }, false),
      ],
    } as unknown as GameState;

    const r = resolveEnemySpell({
      enemy: lich,
      spell: fearBurst(),
      target: pc1,
      st,
      narrative: '',
    });
    const out = (id: string) => r.st.characters.find((c) => c.id === id)!;
    expect(out('pc1').conditions).toContain('frightened');
    expect(out('pc1').condition_sources?.frightened).toBe('lich'); // source tracked
    expect(out('pc1').hp).toBeGreaterThan(0); // survived → condition lands
    expect(out('pc2').conditions).not.toContain('frightened'); // saved
  });

  it('does not apply the condition to a creature immune to it', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    const pc1 = makeChar({
      id: 'pc1',
      wis: 10,
      hp: 30,
      max_hp: 30,
      condition_immunities: ['frightened'],
    });
    const st = {
      characters: [pc1],
      entities: [ent('lich', { x: 5, y: 5 }, true), ent('pc1', { x: 0, y: 0 }, false)],
    } as unknown as GameState;
    const r = resolveEnemySpell({
      enemy: lich,
      spell: fearBurst(),
      target: pc1,
      st,
      narrative: '',
    });
    expect(r.st.characters[0].conditions).not.toContain('frightened');
  });
});
