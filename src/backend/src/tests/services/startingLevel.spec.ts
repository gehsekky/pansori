// Campaign starting-level build: creating the party above L1 applies the normal
// level-up machinery (rolled HP, recomputed slots, subclass auto-granted at L3,
// features) and scales the caster's known/spellbook pool so it can actually cast
// at its level. Mirrors what the creation route does per character.

import {
  casterCreationLoadout,
  casterSpellOptionsByLevel,
  expandCasterSpellsForLevel,
  knownSpellTargetForLevel,
  maxSpellLevelForLevel,
} from '../../services/multiclass.js';
import { describe, expect, it } from 'vitest';
import { applyLevelUpForClass } from '../../services/gameEngine.js';
import { context as ctx } from '../fixtures/testContext.js';
import { makeChar } from '../../test-fixtures.js';

// Build a character straight to `level` the way the creation route does.
function buildToLevel(over: Parameters<typeof makeChar>[0], cls: string, level: number) {
  const char = makeChar({ ...over, level: 1, class_levels: { [cls.toLowerCase()]: 1 } });
  for (let lvl = 2; lvl <= level; lvl++) applyLevelUpForClass(char, cls, ctx);
  if (level > 1) expandCasterSpellsForLevel(char, level, ctx.spellTable ?? {});
  return char;
}

describe('starting-level build — martials', () => {
  it('a Fighter built to L3 is level 3, gains HP, and auto-takes its subclass', () => {
    const f = buildToLevel({ character_class: 'Fighter', hit_die: 10, con: 14 }, 'Fighter', 3);
    expect(f.level).toBe(3);
    expect(f.class_levels?.fighter).toBe(3);
    expect(f.subclass).toBe('champion'); // SRD subclass auto-granted at L3
    expect(f.max_hp).toBeGreaterThan(10); // grew over two level-ups
    expect(f.asi_pending).toBe(false); // ASI is L4 — none pending at L3
  });
});

describe('starting-level build — casters', () => {
  it('a Wizard built to L3 has L3 slots, its subclass, and L2 spells in the book', () => {
    // Seed a believable L1 spellbook: 6 level-1 wizard spells + the cantrips.
    const byL1 = casterSpellOptionsByLevel('Wizard', ctx.spellTable ?? {}, 1);
    const startBook = [...(byL1[0] ?? []).slice(0, 3), ...(byL1[1] ?? []).slice(0, 6)];
    const w = buildToLevel(
      { character_class: 'Wizard', hit_die: 6, int: 16, spells_known: startBook },
      'Wizard',
      3
    );
    expect(w.level).toBe(3);
    expect(w.subclass).toBe('evoker');
    expect(w.spell_slots_max).toEqual({ 1: 4, 2: 2 }); // canonical L3 full-caster table

    // The book gained castable level-2 spells (so the wizard can prepare them).
    const l2 = casterSpellOptionsByLevel('Wizard', ctx.spellTable ?? {}, 2)[2] ?? [];
    const cantrips = new Set(byL1[0] ?? []);
    const known = w.spells_known ?? [];
    expect(known.some((id) => l2.includes(id))).toBe(true);
    // Non-cantrip pool grew toward the L3 spellbook target.
    expect(known.filter((id) => !cantrips.has(id)).length).toBeGreaterThan(startBook.length - 3);
  });

  it('a Cleric built to L3 gets L3 slots but no spellbook top-up (prepares from the full list)', () => {
    const before = ['cure_wounds', 'bless'];
    const c = buildToLevel(
      { character_class: 'Cleric', hit_die: 8, wis: 16, spells_known: [...before] },
      'Cleric',
      3
    );
    expect(c.spell_slots_max).toEqual({ 1: 4, 2: 2 });
    expect(c.subclass).toBe('life');
    // Prepared-from-list caster: no known/spellbook gate, so no auto-fill.
    expect(c.spells_known).toEqual(before);
  });
});

describe('starting-level helpers', () => {
  it('maxSpellLevelForLevel follows the SRD odd-level progression', () => {
    expect(maxSpellLevelForLevel(1)).toBe(1);
    expect(maxSpellLevelForLevel(2)).toBe(1);
    expect(maxSpellLevelForLevel(3)).toBe(2);
    expect(maxSpellLevelForLevel(5)).toBe(3);
  });

  it('knownSpellTargetForLevel scales known casters and skips prepared-from-list ones', () => {
    expect(knownSpellTargetForLevel('Wizard', 3)).toBe(10);
    expect(knownSpellTargetForLevel('Sorcerer', 3)).toBe(4);
    expect(knownSpellTargetForLevel('Bard', 3)).toBe(6);
    expect(knownSpellTargetForLevel('Cleric', 3)).toBeNull();
    expect(knownSpellTargetForLevel('Fighter', 3)).toBeNull();
  });

  it('casterCreationLoadout at L1 matches the original cantrips + L1 picker', () => {
    const l = casterCreationLoadout('Wizard', 1, ctx.spellTable ?? {});
    expect(l).not.toBeNull();
    expect(l!.maxSpellLevel).toBe(1);
    expect(l!.spellCount).toBe(6); // the L1 spellbook
    expect(l!.spellOptions.every((id) => (ctx.spellTable ?? {})[id]?.level === 1)).toBe(true);
    expect(l!.defaultSpells).toHaveLength(6);
  });

  it('casterCreationLoadout at L3 scales the count + offers (and defaults to) level-2 spells', () => {
    const l = casterCreationLoadout('Wizard', 3, ctx.spellTable ?? {});
    expect(l!.maxSpellLevel).toBe(2);
    expect(l!.spellCount).toBe(10);
    // Options span both castable levels; the default loadout is complete and
    // already includes level-2 spells (so an untouched picker is valid + usable).
    const spellTable = ctx.spellTable ?? {};
    expect(l!.spellOptions.some((id) => spellTable[id]?.level === 2)).toBe(true);
    expect(l!.defaultSpells).toHaveLength(10);
    expect(l!.defaultSpells.some((id) => spellTable[id]?.level === 2)).toBe(true);
  });

  it('casterCreationLoadout returns null for non-casters', () => {
    expect(casterCreationLoadout('Fighter', 3, ctx.spellTable ?? {})).toBeNull();
  });
});
