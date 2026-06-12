// Combat-scoped condition cleanup. Round durations only tick on combat
// turns, so outside combat they FREEZE — the 2026-06 playtest had ghoul
// paralysis ride through two rooms of exploration into the next fight, and
// a mid-fight Hide leave a cleric Invisible in the post-adventure header.
// endCombatState clears minute-scale entries (≤ 10 rounds) at combat end;
// hour-scale spell buffs and 'permanent' conditions persist.

import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { GameState } from '../../types.js';
import { endCombatState } from '../../services/gameEngine.js';

const inCombat = (
  conditions: string[],
  condition_durations: Record<string, number>
): GameState => ({
  ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
  characters: [makeChar({ id: 'pc-1', hp: 20, max_hp: 20, conditions, condition_durations })],
  active_character_id: 'pc-1',
});

describe('endCombatState — combat-scoped conditions', () => {
  it('clears an inflicted condition with a frozen round duration (ghoul paralysis)', () => {
    const after = endCombatState(inCombat(['paralyzed'], { paralyzed: 1 }));
    expect(after.characters[0].conditions).not.toContain('paralyzed');
    expect(after.characters[0].condition_durations?.paralyzed).toBeUndefined();
  });

  it("clears Hide's Invisible (minute-scale duration entry)", () => {
    const after = endCombatState(inCombat(['invisible'], { invisible: 2 }));
    expect(after.characters[0].conditions).not.toContain('invisible');
  });

  it('keeps an hour-scale spell buff (Invisibility, 600 rounds)', () => {
    const after = endCombatState(inCombat(['invisible'], { invisible: 597 }));
    expect(after.characters[0].conditions).toContain('invisible');
    expect(after.characters[0].condition_durations?.invisible).toBe(597);
  });

  it("keeps 'permanent' conditions that carry no duration entry (unconscious)", () => {
    const after = endCombatState(inCombat(['unconscious'], {}));
    expect(after.characters[0].conditions).toContain('unconscious');
  });

  it('clears Hold Person paralysis at exactly the 10-round (1 minute) boundary', () => {
    const after = endCombatState(inCombat(['paralyzed'], { paralyzed: 10 }));
    expect(after.characters[0].conditions).not.toContain('paralyzed');
  });
});
