// Valor Bard (2024 PHB) — wires Extra Attack at L6. Selectable
// subclass but Extra Attack wasn't honored before this PR.
// Bardic Inspiration enhancements (Combat Inspiration) deferred.

import { describe, expect, it } from 'vitest';
import { extraAttackCountForChar } from './multiclass.js';
import { makeChar } from '../test-fixtures.js';

describe('Valor Bard — Extra Attack at L6', () => {
  it('L5 Valor Bard: no extra attack (threshold is L6)', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 5,
      subclass: 'valor',
    });
    expect(extraAttackCountForChar(pc)).toBe(0);
  });

  it('L6 Valor Bard: 1 extra attack', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 6,
      subclass: 'valor',
    });
    expect(extraAttackCountForChar(pc)).toBe(1);
  });

  it('L6 Lore Bard: no extra attack (only Valor gets it)', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 6,
      subclass: 'lore',
    });
    expect(extraAttackCountForChar(pc)).toBe(0);
  });

  it('Bard 6 (Valor) / Fighter 5 multiclass: still just 1 extra (max not sum)', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      level: 11,
      subclass: 'valor',
      class_levels: { bard: 6, fighter: 5 },
    });
    // Both classes grant 1 extra; max = 1.
    expect(extraAttackCountForChar(pc)).toBe(1);
  });
});
