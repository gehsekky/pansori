// D-08 general level-up verification matrix (LVL-02 / success criterion #3).
//
// Proves the mid-campaign level-up path works for ANY class/subclass and ANY
// transition — NOT the Act II party hard-coded. The matrix is driven
// PARAMETRICALLY over a class set (the 4 party classes + one of each
// archetype: full caster, half caster, warlock, martial-with-mastery) with NO
// class-specific `if`/`switch` in the assertion body: each archetype declares
// its expectations as DATA, and a single shared assertion block consumes them.
//
// `rollDice` is mocked to a fixed value so the HP delta on each advance is
// deterministic and exactly assertable (hit-die roll + CON mod + riders).
//
// The known-caster spell pick is driven through the PUBLIC `takeAction`
// envelope (the same path the route uses), so the test exercises the real
// learn_spell handler end-to-end rather than a hand-built context.

import * as rulesEngine from '../../services/rulesEngine.js';
import type { GameState, Seed } from '../../types.js';
import { abilityMod, extraAttackCount } from '../../services/rulesEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass, generateChoices, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

// Fixed hit-die roll so each advance's HP delta is deterministic. Every
// `applyLevelUpForClass` HP roll becomes `max(1, FIXED_ROLL + conMod) + riders`.
const FIXED_ROLL = 5;

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Matrix Test',
  ship_name: 'Matrix Test',
  intro: '',
  seed_id: 'matrix',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function party(chars: ReturnType<typeof makeChar>[], over: Partial<GameState> = {}): GameState {
  return {
    ...makeState({ id: chars[0].id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: chars[0].id,
    ...over,
  };
}

// One advance via the engine's own level-up machinery, with rollDice pinned so
// the HP delta is exactly `max(1, FIXED_ROLL + conMod) + riders`.
function advance(char: ReturnType<typeof makeChar>, cls: string): { hpDelta: number } {
  const before = char.max_hp;
  const spy = vi.spyOn(rulesEngine, 'rollDice').mockReturnValue(FIXED_ROLL);
  applyLevelUpForClass(char, cls, ctx);
  spy.mockRestore();
  return { hpDelta: char.max_hp - before };
}

// ── The archetype matrix (DATA, not branches) ───────────────────────────────
interface Archetype {
  label: string;
  cls: string; // PascalCase class id
  hitDie: number;
  // The spellcasting/primary ability — also the value bumped at the ASI case.
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  // Exact L5 slot row to deep-equal, or null to only assert non-empty/empty.
  expectedSlotsAtL5: Record<number, number> | null;
  hasSlotsAtL5: boolean; // martials have no spell slots
  knownCaster: boolean; // gains a learn_spell pick on advance
  martialExtraAttack: boolean; // gains Extra Attack at L5
  // Per-advance HP rider beyond `max(1, roll + conMod)` — e.g. Draconic
  // Sorcerer's Draconic Resilience (+1 HP / sorcerer level).
  hpRider: number;
}

const MATRIX: Archetype[] = [
  // The 4 Act II party classes.
  {
    label: 'Fighter (party / martial-with-mastery)',
    cls: 'Fighter',
    hitDie: 10,
    ability: 'str',
    expectedSlotsAtL5: null,
    hasSlotsAtL5: false,
    knownCaster: false,
    martialExtraAttack: true,
    hpRider: 0,
  },
  {
    label: 'Wizard (party / full caster — spellbook known)',
    cls: 'Wizard',
    hitDie: 6,
    ability: 'int',
    expectedSlotsAtL5: { 1: 4, 2: 3, 3: 2 }, // canonical SRD L5 full-caster row
    hasSlotsAtL5: true,
    knownCaster: true,
    martialExtraAttack: false,
    hpRider: 0,
  },
  {
    label: 'Cleric (party / full caster — prepared)',
    cls: 'Cleric',
    hitDie: 8,
    ability: 'wis',
    expectedSlotsAtL5: { 1: 4, 2: 3, 3: 2 },
    hasSlotsAtL5: true,
    knownCaster: false, // prepared — accrues no spells_to_learn (Pitfall #3)
    martialExtraAttack: false,
    hpRider: 0,
  },
  {
    label: 'Rogue (party / martial-with-mastery)',
    cls: 'Rogue',
    hitDie: 8,
    ability: 'dex',
    expectedSlotsAtL5: null,
    hasSlotsAtL5: false,
    knownCaster: false,
    martialExtraAttack: false, // Rogue has no Extra Attack
    hpRider: 0,
  },
  // One of each remaining archetype.
  {
    label: 'Sorcerer (full caster — known)',
    cls: 'Sorcerer',
    hitDie: 6,
    ability: 'cha',
    expectedSlotsAtL5: { 1: 4, 2: 3, 3: 2 },
    hasSlotsAtL5: true,
    knownCaster: true,
    martialExtraAttack: false,
    // Sorcerer auto-takes Draconic at L3 → Draconic Resilience (+1 HP/sorc level).
    hpRider: 1,
  },
  {
    label: 'Paladin (half caster — prepared)',
    cls: 'Paladin',
    hitDie: 10,
    ability: 'cha',
    expectedSlotsAtL5: null, // half-caster row — assert non-empty, not exact
    hasSlotsAtL5: true,
    knownCaster: false, // prepared from list — no learn step
    martialExtraAttack: true, // Paladin gains Extra Attack at L5
    hpRider: 0,
  },
  {
    label: 'Warlock (pact / known caster)',
    cls: 'Warlock',
    hitDie: 8,
    ability: 'cha',
    expectedSlotsAtL5: null, // pact-magic row — assert non-empty, not exact
    hasSlotsAtL5: true,
    knownCaster: true,
    martialExtraAttack: false,
    hpRider: 0,
  },
];

// Build a character straight to `level` via the engine machinery, then return
// it ready for the next advance. Mirrors the creation route (startingLevel).
function buildTo(arch: Archetype, level: number): ReturnType<typeof makeChar> {
  const char = makeChar({
    id: 'pc',
    name: 'Subject',
    character_class: arch.cls,
    hit_die: arch.hitDie,
    // Generous, even stats: +2 for the primary ability so a CON bump on the ASI
    // case is observable, and CON 14 (+2) so the HP roll is comfortably positive.
    str: 14,
    dex: 14,
    con: 14,
    int: 14,
    wis: 14,
    cha: 14,
    [arch.ability]: 16,
    level: 1,
    class_levels: { [arch.cls.toLowerCase()]: 1 },
  });
  const spy = vi.spyOn(rulesEngine, 'rollDice').mockReturnValue(FIXED_ROLL);
  for (let lvl = 2; lvl <= level; lvl++) applyLevelUpForClass(char, arch.cls, ctx);
  spy.mockRestore();
  return char;
}

describe('mid-campaign level-up — general matrix (D-08)', () => {
  // The shared assertion body. No per-class `if`/`switch` — every branch keys
  // off DATA in the archetype entry, so the path is proven general (LVL-02).
  it.each(MATRIX)('$label: L4→L5 advance raises HP, slots, and per-archetype features', (arch) => {
    const char = buildTo(arch, 4); // built to L4 (the carry's starting point)
    expect(char.level).toBe(4);

    // (a) HP delta on the L4→L5 advance equals the mocked roll + CON mod (+riders).
    const conMod = abilityMod(char.con);
    const { hpDelta } = advance(char, arch.cls);
    expect(char.level).toBe(5); // headline L4→L5 transition
    const expectedHp = Math.max(1, FIXED_ROLL + conMod) + arch.hpRider;
    expect(hpDelta).toBe(expectedHp);

    // (b) spell_slots_max — exact SRD L5 row for full casters; non-empty for
    // other casters; empty for martials.
    const slots = char.spell_slots_max ?? {};
    if (arch.expectedSlotsAtL5) {
      expect(slots).toEqual(arch.expectedSlotsAtL5);
    } else if (arch.hasSlotsAtL5) {
      expect(Object.keys(slots).length).toBeGreaterThan(0);
    } else {
      expect(Object.keys(slots).length).toBe(0);
    }

    // (c)/(d) known casters owe a spell pick; prepared casters owe none (Pitfall #3).
    if (arch.knownCaster) {
      expect(char.spells_to_learn ?? 0).toBeGreaterThan(0);
    } else {
      expect(char.spells_to_learn ?? 0).toBe(0);
    }

    // (e) the martial L5 feature: subclass set (auto-granted at L3) and Extra
    // Attack where the class has it.
    if (arch.martialExtraAttack) {
      expect(extraAttackCount(arch.cls.toLowerCase(), 5)).toBe(1);
    }
    expect(char.subclass).toBeTruthy(); // every archetype auto-took its SRD subclass by L5
  });

  // Driven separately so the learn_spell handler runs through the real
  // takeAction path. Still parametric over the known-caster subset, no names.
  it.each(MATRIX.filter((a) => a.knownCaster))(
    '$label: a driven learn_spell pick grows spells_known and decrements the counter',
    async (arch) => {
      const char = buildTo(arch, 4);
      advance(char, arch.cls); // L4→L5 — now owes spell pick(s)
      expect(char.spells_to_learn ?? 0).toBeGreaterThan(0);

      // Isolate the spell step: `levelUpWorkFor` resolves ASI/mastery BEFORE
      // spells, so clear any pending picks left from prior advances (the L4 ASI)
      // — this test exercises the learn_spell branch specifically.
      char.asi_pending = false;
      char.weapon_mastery_pending = 0;

      const owedBefore = char.spells_to_learn ?? 0;
      const knownBefore = (char.spells_known ?? []).length;

      // Surface the eligible learn_spell choices the cascade offers.
      const st = party([char], { active_leveling: { characterId: char.id } });
      const choices = generateChoices(st, seed, ctx);
      const pick = choices.find((c) => c.action.type === 'learn_spell');
      expect(pick).toBeDefined();
      const action = pick!.action;
      expect(action.type).toBe('learn_spell');

      const r = await takeAction({ action, history: [], state: st, seed, context: ctx });
      const after = r.newState.characters[0];
      expect((after.spells_known ?? []).length).toBe(knownBefore + 1);
      expect(after.spells_to_learn ?? 0).toBe(owedBefore - 1);
    }
  );

  // The ASI case: separate the advance-roll HP from the CON-ASI retroactive
  // bump and assert each delta in order (Pitfall #4 — order matters).
  it('an ASI level (Fighter L3→L4) applies the advance-roll HP then the CON-ASI retroactive bump separately', async () => {
    // Build a Fighter to L3 (subclass auto-granted, no ASI yet).
    const fighter = buildTo({ ...MATRIX[0], ability: 'con' }, 3); // bump CON via the ASI later
    expect(fighter.level).toBe(3);
    expect(fighter.asi_pending).toBe(false);

    // Step 1 — the L3→L4 advance: HP grows by the rolled hit-die + CON mod only.
    const conModBeforeAsi = abilityMod(fighter.con);
    const { hpDelta: advanceHp } = advance(fighter, 'Fighter');
    expect(fighter.level).toBe(4);
    expect(fighter.asi_pending).toBe(true); // Fighter L4 milestone
    expect(advanceHp).toBe(Math.max(1, FIXED_ROLL + conModBeforeAsi));

    // Step 2 — the CON ASI: a SEPARATE retroactive HP bump of (modGain × level),
    // applied by handleApplyAsi (not by the advance roll).
    const hpBeforeAsi = fighter.max_hp;
    const conBeforeAsi = fighter.con;
    const st = party([fighter], { active_leveling: { characterId: fighter.id } });
    const r = await takeAction({
      action: { type: 'apply_asi', stat: 'con' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    const after = r.newState.characters[0];
    expect(after.asi_pending).toBe(false);
    expect(after.con).toBe(conBeforeAsi + 2);
    const modGain = abilityMod(after.con) - abilityMod(conBeforeAsi);
    expect(after.max_hp - hpBeforeAsi).toBe(modGain * after.level); // retroactive, per-level
  });
});
