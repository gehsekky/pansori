// Enemy AoE spellcasting — `resolveEnemySpell` branches to the area path when
// the spell has a `blastRadius` and the grid is populated. Every party-side
// creature in the shape rolls its own save off ONE shared damage roll; the
// caster's own allies are spared (no friendly fire). Mirrors the PC `runAoeSpell`
// from the other side. All tests pin the save d20 = 12 (Math.random 0.55) so the
// only thing that flips a save is the target's ability modifier.

import type { CombatEntity, Enemy, GameState, GridPos, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, mockRandom } from '../../test-fixtures.js';
import { resolveEnemySpell } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ROLL_12 = 0.55; // floor(0.55 * 20) + 1 = 12

const mage = { id: 'mage', name: 'Mage', toHit: 6, spellSaveDC: 14 } as unknown as Enemy;

// Flat-20 sphere so the only RNG is each target's save d20.
const fireballish = (): Spell =>
  ({
    id: 'blast',
    name: 'Fireball',
    damage: '20',
    savingThrow: 'dex',
    saveEffect: 'half',
    damageType: 'fire',
    blastRadius: 20,
    aoeShape: 'sphere',
  }) as unknown as Spell;

const ent = (id: string, pos: GridPos, isEnemy: boolean): CombatEntity =>
  ({ id, pos, isEnemy, hp: 99, maxHp: 99, conditions: [] }) as unknown as CombatEntity;

describe('resolveEnemySpell — AoE branch', () => {
  it('hits every party-side creature in the sphere off one damage roll', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    // pc1 (DEX 10 → +0) fails the save; pc2 (DEX 20 → +5) saves for half;
    // pc3 sits outside the 20-ft radius and is untouched.
    const pc1 = makeChar({ id: 'pc1', dex: 10, hp: 30, max_hp: 30 });
    const pc2 = makeChar({ id: 'pc2', dex: 20, hp: 30, max_hp: 30 });
    const pc3 = makeChar({ id: 'pc3', dex: 10, hp: 30, max_hp: 30 });
    const st = {
      characters: [pc1, pc2, pc3],
      entities: [
        ent('mage', { x: 5, y: 5 }, true),
        ent('pc1', { x: 0, y: 0 }, false),
        ent('pc2', { x: 1, y: 0 }, false), // 5 ft away — in radius
        ent('pc3', { x: 9, y: 9 }, false), // far — out of radius
      ],
    } as unknown as GameState;

    const r = resolveEnemySpell({
      enemy: mage,
      spell: fireballish(),
      target: pc1,
      st,
      narrative: '',
    });

    const out = (id: string) => r.st.characters.find((c) => c.id === id)!.hp;
    expect(out('pc1')).toBe(10); // fail → full 20
    expect(out('pc2')).toBe(20); // save → half 10
    expect(out('pc3')).toBe(30); // out of radius → untouched
    // AoE casts resolve saves immediately — no interactive Indomitable window.
    expect(r.pendingSaveReroll).toBeUndefined();
    expect(r.narrative).toContain('unleashes Fireball');
  });

  it('spares the caster’s own allies caught in the blast (no friendly fire)', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    const pc1 = makeChar({ id: 'pc1', dex: 10, hp: 30, max_hp: 30 });
    const st = {
      characters: [pc1],
      entities: [
        ent('mage', { x: 0, y: 0 }, true),
        ent('ally-orc', { x: 1, y: 0 }, true), // enemy ally in the blast
        ent('pc1', { x: 1, y: 1 }, false),
      ],
    } as unknown as GameState;

    const r = resolveEnemySpell({
      enemy: mage,
      spell: fireballish(),
      target: pc1,
      st,
      narrative: '',
    });
    // The PC is hit; the orc ally isn't a character and takes nothing here.
    expect(r.st.characters.find((c) => c.id === 'pc1')!.hp).toBe(10);
    expect(r.narrative).not.toContain('ally-orc');
  });

  it('a cone extends from the caster toward the target', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    const coneSpell = {
      id: 'cold',
      name: 'Cone of Cold',
      damage: '16',
      savingThrow: 'con',
      saveEffect: 'half',
      damageType: 'cold',
      blastRadius: 60,
      aoeShape: 'cone',
    } as unknown as Spell;
    const pc1 = makeChar({ id: 'pc1', con: 10, hp: 40, max_hp: 40 });
    const st = {
      characters: [pc1],
      entities: [
        ent('mage', { x: 0, y: 0 }, true), // caster
        ent('pc1', { x: 3, y: 0 }, false), // straight out the cone axis
      ],
    } as unknown as GameState;
    const r = resolveEnemySpell({ enemy: mage, spell: coneSpell, target: pc1, st, narrative: '' });
    expect(r.st.characters.find((c) => c.id === 'pc1')!.hp).toBe(24); // fail → full 16
  });

  it('falls through to single-target when the grid has no positions', () => {
    mockRandom(...Array(12).fill(ROLL_12));
    const pc1 = makeChar({ id: 'pc1', dex: 10, hp: 30, max_hp: 30 });
    // entities present but neither caster nor target has an entry → no epicenter.
    const st = { characters: [pc1], entities: [] } as unknown as GameState;
    const r = resolveEnemySpell({
      enemy: mage,
      spell: fireballish(),
      target: pc1,
      st,
      narrative: '',
    });
    // Single-target path still applies the save-for-half to the lone target.
    expect(r.st.characters.find((c) => c.id === 'pc1')!.hp).toBe(10);
  });
});
