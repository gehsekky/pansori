// Multiclass edge cases: the SRD skill/tool grants on multiclass ENTRY
// (Bard / Ranger / Rogue), and ASI spacing on PER-CLASS milestones (not total
// level). Armor/weapon entry grants are covered elsewhere; this guards the
// newly-added skill + tool grants and locks the per-class ASI gating.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass } from './gameEngine.js';
import { applyMulticlassProfGrants } from './multiclass.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { makeChar } from '../test-fixtures.js';

afterEach(() => vi.restoreAllMocks());

describe('applyMulticlassProfGrants — skill + tool grants on entry', () => {
  it('Rogue: grants light armor, a class skill, and Thieves’ Tools', () => {
    const char = makeChar({
      character_class: 'Fighter',
      skill_proficiencies: ['Athletics'],
      tool_proficiencies: [],
      armor_proficiencies: [],
    });
    const note = applyMulticlassProfGrants(char, 'rogue', ['Stealth', 'Acrobatics', 'Perception']);
    expect(char.armor_proficiencies).toContain('light');
    expect(char.skill_proficiencies).toContain('Stealth'); // first option not already known
    expect(char.tool_proficiencies).toContain("Thieves' Tools");
    expect(note).toMatch(/Thieves/);
  });

  it('Bard: grants a class skill + a musical instrument', () => {
    const char = makeChar({
      character_class: 'Fighter',
      skill_proficiencies: [],
      tool_proficiencies: [],
    });
    applyMulticlassProfGrants(char, 'bard', ['Persuasion', 'Performance']);
    expect(char.skill_proficiencies).toContain('Persuasion');
    expect(char.tool_proficiencies).toContain('Musical Instrument');
  });

  it('Ranger: grants a class skill but no tools', () => {
    const char = makeChar({
      character_class: 'Fighter',
      skill_proficiencies: [],
      tool_proficiencies: [],
    });
    applyMulticlassProfGrants(char, 'ranger', ['Survival', 'Nature']);
    expect(char.skill_proficiencies).toContain('Survival');
    expect(char.tool_proficiencies ?? []).toEqual([]);
  });

  it('picks the next option when the first is already known (no duplicate)', () => {
    const char = makeChar({ character_class: 'Fighter', skill_proficiencies: ['Stealth'] });
    applyMulticlassProfGrants(char, 'rogue', ['Stealth', 'Acrobatics']);
    expect(char.skill_proficiencies).toContain('Acrobatics');
    expect(char.skill_proficiencies.filter((s) => s === 'Stealth')).toHaveLength(1);
  });

  it('a class without skill/tool grants (Wizard) adds nothing', () => {
    const char = makeChar({ character_class: 'Fighter', skill_proficiencies: ['Athletics'] });
    expect(applyMulticlassProfGrants(char, 'wizard', ['Arcana'])).toBe('');
  });
});

describe('ASI spacing — per-class milestones, not total level', () => {
  it('fires at a class level of 4', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = makeChar({ character_class: 'Fighter', level: 3, class_levels: { fighter: 3 } });
    applyLevelUpForClass(f, 'fighter', ctx);
    expect(f.asi_pending).toBe(true);
  });

  it('does NOT fire at a non-milestone class level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = makeChar({ character_class: 'Fighter', level: 4, class_levels: { fighter: 4 } });
    applyLevelUpForClass(f, 'fighter', ctx); // → fighter 5, not a milestone
    expect(f.asi_pending).toBeFalsy();
  });

  it('keys on the SECOND class’s own level (Fighter5/Wizard3 → Wizard 4 fires)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Total level 8 already (Fighter 5 + Wizard 3) — a total-level scheme would
    // have mis-fired at 8; the per-class scheme fires when Wizard reaches 4.
    const mc = makeChar({
      character_class: 'Fighter',
      level: 8,
      class_levels: { fighter: 5, wizard: 3 },
    });
    applyLevelUpForClass(mc, 'wizard', ctx);
    expect(mc.class_levels?.wizard).toBe(4);
    expect(mc.asi_pending).toBe(true);
  });
});
