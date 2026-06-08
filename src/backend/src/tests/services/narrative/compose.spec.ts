import type { Character, Context, GameState, LootItem } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  composeNow,
  enemyAttackFragmentEvent,
  renderAttackHit,
  renderAttackKill,
  renderAttackMiss,
  renderConditionApplied,
  renderEnemyAttackHit,
  renderEnemyAttackMiss,
  renderSave,
  renderSpellAttackHit,
  renderSpellAttackMiss,
  renderSpellAutoHit,
  renderSpellHeal,
  renderSpellMultiTarget,
  renderSpellSaveCondition,
  renderSpellSaveDamage,
  renderSpellUtility,
} from '../../../services/narrative/compose.js';
import { makeChar, makeEnemy, makeMinimalContext } from '../../../test-fixtures.js';
import type { ActionContext } from '../../../services/actions/types.js';
import { buildCombatHitNarrative } from '../../../services/gameEngine.js';
import { pcActor } from '../../../services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

// Compose-spec defaults: a level-5 fighter with elevated stats so the
// damage scenarios feel realistic. `fixtureCtx` builds an ActionContext
// fixture specific to composer tests (round=3 for round-stamped events,
// minimal Context with just the narrative pools the renderers read).
const fixtureChar = (overrides: Partial<Character> = {}): Character =>
  makeChar({
    name: 'Tester',
    level: 5,
    hp: 30,
    max_hp: 30,
    str: 16,
    dex: 12,
    con: 14,
    ...overrides,
  });

const fixtureEnemy = makeEnemy;

function fixtureCtx(charOverrides: Partial<Character> = {}): ActionContext {
  const char = fixtureChar(charOverrides);
  const st: GameState = {
    characters: [char],
    active_character_id: char.id,
    combat_log: [],
    round: 3,
    enemies_killed: [],
    loot_taken: [],
    visited_rooms: ['r1'],
    current_room: 'r1',
    combat_active: true,
  } as unknown as GameState;
  return {
    actor: pcActor(char, 0),
    st,
    context: makeMinimalContext(),
    narrative: '',
    fragments: [],
  } as unknown as ActionContext;
}

describe('renderAttackHit', () => {
  it('produces prose containing damage and atkNote', () => {
    const ctx = fixtureCtx();
    const {
      prose,
      events: [event],
    } = renderAttackHit(
      {
        kind: 'attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy(),
        weapon: null,
        damage: 8,
        damageType: 'physical',
        isCrit: false,
        toHit: 18,
        targetAc: 13,
        atkNote: '{{note|(d20 14+4 STR = 18 vs AC 13)}}',
        bonuses: [],
      },
      ctx
    );
    expect(prose).toContain('orc');
    expect(prose).toContain('{{dmg|8}}'); // buildCombatHitNarrative wraps damage in fmt.dmg
    expect(prose).toContain('(d20 14+4 STR = 18 vs AC 13)'); // atkNote inline
    expect(event.kind).toBe('attack_hit');
    if (event.kind === 'attack_hit') {
      expect(event.damage).toBe(8);
      expect(event.round).toBe(3);
    }
  });

  it('appends bonuses as fmt.note-wrapped tokens', () => {
    const ctx = fixtureCtx();
    const { prose } = renderAttackHit(
      {
        kind: 'attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy(),
        weapon: null,
        damage: 10,
        damageType: 'physical',
        isCrit: true,
        toHit: 25,
        targetAc: 13,
        atkNote: '',
        bonuses: [{ label: 'Sneak Attack 2d6: +7' }, { label: 'Rage: +2' }],
      },
      ctx
    );
    expect(prose).toContain('{{note|[Sneak Attack 2d6: +7]}}');
    expect(prose).toContain('{{note|[Rage: +2]}}');
  });

  it('renders crit prefix in main prose', () => {
    const ctx = fixtureCtx();
    const { prose } = renderAttackHit(
      {
        kind: 'attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy(),
        weapon: null,
        damage: 20,
        damageType: 'physical',
        isCrit: true,
        toHit: 20,
        targetAc: 13,
        atkNote: '',
      },
      ctx
    );
    expect(prose).toContain('Critical hit!');
  });

  it('emits CombatEvent with all snapshot fields populated', () => {
    const ctx = fixtureCtx();
    const {
      events: [event],
    } = renderAttackHit(
      {
        kind: 'attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy({ id: 'goblin-7', name: 'goblin' }),
        weapon: null,
        damage: 6,
        damageType: 'slashing',
        isCrit: false,
        toHit: 14,
        targetAc: 13,
        atkNote: '',
      },
      ctx
    );
    if (event.kind !== 'attack_hit') throw new Error('wrong event kind');
    expect(event.attackerId).toBe('pc-1');
    expect(event.targetId).toBe('goblin-7');
    expect(event.targetName).toBe('goblin');
    expect(event.damageType).toBe('slashing');
    expect(event.toHit).toBe(14);
    expect(event.targetAc).toBe(13);
  });
});

describe('renderAttackMiss', () => {
  it('fumble reason produces Natural 1 prose', () => {
    const ctx = fixtureCtx();
    const {
      prose,
      events: [event],
    } = renderAttackMiss(
      {
        kind: 'attack_miss',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy(),
        weaponLabel: 'your fists',
        toHit: 1,
        targetAc: 13,
        atkNote: '',
        reason: 'fumble',
      },
      ctx
    );
    expect(prose).toContain('Natural 1');
    expect(prose).toContain('a fumble');
    expect(prose).toContain('your fists');
    expect(event.kind).toBe('attack_miss');
  });

  it('normal miss picks from combatMiss pool with enemy substituted', () => {
    const ctx = fixtureCtx();
    const { prose } = renderAttackMiss(
      {
        kind: 'attack_miss',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy({ name: 'kobold' }),
        weaponLabel: 'your sword',
        toHit: 7,
        targetAc: 13,
        atkNote: '',
      },
      ctx
    );
    expect(prose).toContain('kobold');
    expect(prose).not.toContain('Natural 1');
  });

  it('appends bonuses as fmt.note-wrapped tokens', () => {
    const ctx = fixtureCtx();
    const { prose } = renderAttackMiss(
      {
        kind: 'attack_miss',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        target: fixtureEnemy(),
        weaponLabel: 'your sword',
        toHit: 7,
        targetAc: 13,
        atkNote: '',
        bonuses: [{ label: 'Graze: orc still takes 3 damage from the swing.' }],
      },
      ctx
    );
    expect(prose).toContain('{{note|[Graze: orc still takes 3 damage from the swing.]}}');
  });
});

describe('renderAttackKill', () => {
  it('returns killProse verbatim as prose', () => {
    const ctx = fixtureCtx();
    const {
      prose,
      events: [event],
    } = renderAttackKill(
      {
        kind: 'attack_kill',
        attackerId: 'pc-1',
        attackerName: 'Tester',
        victimId: 'orc-1',
        victimName: 'orc',
        xp: 50,
        killProse: ' Down it goes!',
      },
      ctx
    );
    expect(prose).toBe(' Down it goes!');
    expect(event.kind).toBe('kill');
    if (event.kind === 'kill') {
      expect(event.xp).toBe(50);
      expect(event.victimId).toBe('orc-1');
    }
  });
});

describe('renderSpellAttackHit', () => {
  it('uses the pre-built castPrefix + atkNote + damage line', () => {
    const ctx = fixtureCtx();
    const {
      prose,
      events: [event],
    } = renderSpellAttackHit(
      {
        kind: 'spell_attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy({ name: 'imp' }),
        spellId: 'fire_bolt',
        spellName: 'Fire Bolt',
        castPrefix: 'Sage casts Fire Bolt',
        damage: 7,
        damageType: 'fire',
        isCrit: false,
        toHit: 18,
        targetAc: 13,
        atkNote: ' (spell attack 12+5=17 vs AC 13)',
      },
      ctx
    );
    expect(prose).toContain('Sage casts Fire Bolt');
    expect(prose).toContain('(spell attack 12+5=17 vs AC 13)');
    expect(prose).toContain('{{dmg|7}} fire damage!');
    expect(prose).not.toContain('Critical');
    expect(event.kind).toBe('attack_hit');
    if (event.kind === 'attack_hit') {
      expect(event.damage).toBe(7);
      expect(event.damageType).toBe('fire');
    }
  });

  it('renders crit prefix when isCrit', () => {
    const ctx = fixtureCtx();
    const { prose } = renderSpellAttackHit(
      {
        kind: 'spell_attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'fire_bolt',
        spellName: 'Fire Bolt',
        castPrefix: 'Sage casts Fire Bolt',
        damage: 14,
        damageType: 'fire',
        isCrit: true,
        toHit: 20,
        targetAc: 13,
        atkNote: '',
      },
      ctx
    );
    expect(prose).toContain('Critical spell hit!');
  });

  it('appends bonuses as fmt.note tokens (Agonizing Blast)', () => {
    const ctx = fixtureCtx();
    const { prose } = renderSpellAttackHit(
      {
        kind: 'spell_attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'eldritch_blast',
        spellName: 'Eldritch Blast',
        castPrefix: 'Sage casts Eldritch Blast',
        damage: 8,
        damageType: 'force',
        isCrit: false,
        toHit: 17,
        targetAc: 13,
        atkNote: '',
        bonuses: [{ label: 'Agonizing Blast: +3' }],
      },
      ctx
    );
    expect(prose).toContain('{{note|[Agonizing Blast: +3]}}');
  });

  it('falls back to "spell" damageType in event when fragment damageType is empty', () => {
    const ctx = fixtureCtx();
    const {
      events: [event],
    } = renderSpellAttackHit(
      {
        kind: 'spell_attack_hit',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'mystery',
        spellName: 'Mystery Bolt',
        castPrefix: 'Sage casts Mystery Bolt',
        damage: 5,
        damageType: '',
        isCrit: false,
        toHit: 15,
        targetAc: 13,
        atkNote: '',
      },
      ctx
    );
    if (event.kind === 'attack_hit') {
      expect(event.damageType).toBe('spell');
    }
  });
});

describe('renderSpellAttackMiss', () => {
  it('uses the pre-built castPrefix + " — MISS!" + atkNote', () => {
    const ctx = fixtureCtx();
    const {
      prose,
      events: [event],
    } = renderSpellAttackMiss(
      {
        kind: 'spell_attack_miss',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy({ name: 'imp' }),
        spellId: 'fire_bolt',
        spellName: 'Fire Bolt',
        castPrefix: 'Sage points at imp',
        toHit: 8,
        targetAc: 13,
        atkNote: ' (spell attack 3+5=8 vs AC 13)',
      },
      ctx
    );
    expect(prose).toContain('Sage points at imp');
    expect(prose).toContain('— MISS!');
    expect(prose).toContain('(spell attack 3+5=8 vs AC 13)');
    expect(event.kind).toBe('attack_miss');
  });
});

describe('renderSpellHeal', () => {
  it('renders self-heal prose with no events', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellHeal(
      {
        kind: 'spell_heal',
        castPrefix: 'Aria casts Cure Wounds',
        healed: 9,
        targetName: 'Aria',
        isSelf: true,
        targetNewHp: 18,
        targetMaxHp: 30,
      },
      ctx
    );
    expect(prose).toBe('Aria casts Cure Wounds — restores 9 HP to self (now 18/30).');
    expect(events).toHaveLength(0);
  });

  it('renders other-target heal with target name', () => {
    const ctx = fixtureCtx();
    const { prose } = renderSpellHeal(
      {
        kind: 'spell_heal',
        castPrefix: 'Aria touches Bjorn',
        healed: 12,
        targetName: 'Bjorn',
        isSelf: false,
        targetNewHp: 20,
        targetMaxHp: 24,
      },
      ctx
    );
    expect(prose).toBe('Aria touches Bjorn — restores 12 HP to Bjorn (now 20/24).');
  });

  it('appends Disciple of Life bonus as fmt.note', () => {
    const ctx = fixtureCtx();
    const { prose } = renderSpellHeal(
      {
        kind: 'spell_heal',
        castPrefix: 'Aria casts Healing Word',
        healed: 7,
        targetName: 'Bjorn',
        isSelf: false,
        targetNewHp: 15,
        targetMaxHp: 24,
        bonuses: [{ label: 'Disciple of Life: +3' }],
      },
      ctx
    );
    expect(prose).toContain('{{note|[Disciple of Life: +3]}}');
  });
});

describe('renderSpellUtility', () => {
  it('returns pre-built prose verbatim with no events', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellUtility(
      { kind: 'spell_utility', prose: 'You vanish in a puff of silver mist.' },
      ctx
    );
    expect(prose).toBe('You vanish in a puff of silver mist.');
    expect(events).toHaveLength(0);
  });
});

describe('renderSpellSaveDamage', () => {
  it('emits attack_hit event when damage > 0 (save failed)', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellSaveDamage(
      {
        kind: 'spell_save_damage',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy({ id: 'orc-1', name: 'orc', ac: 13 }),
        spellId: 'fireball',
        spellName: 'Fireball',
        castPrefix: 'Sage casts Fireball',
        saveAbility: 'DEX',
        saveDC: 15,
        saveFailed: true,
        damage: 28,
        damageType: 'fire',
        halfOnSave: true,
      },
      ctx
    );
    expect(prose).toContain('Sage casts Fireball!');
    expect(prose).toContain('{{dc|DC 15}} DEX save');
    expect(prose).toContain('orc fails');
    expect(prose).toContain('{{dmg|28}} fire damage');
    expect(prose).not.toContain('(half damage)');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'attack_hit') {
      expect(events[0].damage).toBe(28);
      expect(events[0].damageType).toBe('fire');
    }
  });

  it('appends "(half damage)" when save succeeds and spell halves', () => {
    const ctx = fixtureCtx();
    const { prose } = renderSpellSaveDamage(
      {
        kind: 'spell_save_damage',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'fireball',
        spellName: 'Fireball',
        castPrefix: 'Sage casts Fireball',
        saveAbility: 'DEX',
        saveDC: 15,
        saveFailed: false,
        damage: 14,
        damageType: 'fire',
        halfOnSave: true,
      },
      ctx
    );
    expect(prose).toContain('orc succeeds');
    expect(prose).toContain('(half damage)');
  });

  it('emits no events when damage is 0', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellSaveDamage(
      {
        kind: 'spell_save_damage',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'sacred_flame',
        spellName: 'Sacred Flame',
        castPrefix: 'Sage casts Sacred Flame',
        saveAbility: 'DEX',
        saveDC: 13,
        saveFailed: false,
        damage: 0,
        damageType: 'radiant',
        halfOnSave: false,
      },
      ctx
    );
    expect(prose).toContain('No damage');
    expect(events).toHaveLength(0);
  });
});

describe('renderSpellSaveCondition', () => {
  it('renders save outcome without emitting events', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellSaveCondition(
      {
        kind: 'spell_save_condition',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy({ name: 'goblin' }),
        spellId: 'hold_person',
        spellName: 'Hold Person',
        castPrefix: 'Sage casts Hold Person',
        saveAbility: 'WIS',
        saveDC: 14,
        saveFailed: true,
      },
      ctx
    );
    expect(prose).toBe('Sage casts Hold Person! (DC 14 WIS save — goblin fails.)');
    expect(events).toHaveLength(0);
  });
});

describe('renderSpellAutoHit', () => {
  it('emits attack_hit event with toHit=0 (no attack roll)', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellAutoHit(
      {
        kind: 'spell_auto_hit',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        target: fixtureEnemy(),
        spellId: 'magic_missile',
        spellName: 'Magic Missile',
        castPrefix: 'Sage casts Magic Missile',
        damage: 12,
        damageType: 'force',
      },
      ctx
    );
    expect(prose).toContain('Auto-hit');
    expect(prose).toContain('{{dmg|12}} force damage');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'attack_hit') {
      expect(events[0].toHit).toBe(0);
      expect(events[0].damage).toBe(12);
    }
  });
});

describe('renderSpellMultiTarget', () => {
  it('emits one attack_hit per damaged target, none for zero-damage', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSpellMultiTarget(
      {
        kind: 'spell_multi_target',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        spellId: 'magic_missile',
        spellName: 'Magic Missile',
        castPrefix: 'Sage casts Magic Missile',
        damageType: 'force',
        hits: [
          { enemyId: 'goblin-1', enemyName: 'goblin', targetAc: 12, damage: 4, killed: false },
          { enemyId: 'kobold-2', enemyName: 'kobold', targetAc: 12, damage: 6, killed: true },
        ],
        totalDamage: 10,
        labels: ['dart 1 → goblin: 4.', 'dart 2 → kobold: 6 (killed).'],
      },
      ctx
    );
    expect(prose).toContain('Sage casts Magic Missile!');
    expect(prose).toContain('dart 1 → goblin: 4.');
    expect(prose).toContain('dart 2 → kobold: 6 (killed).');
    expect(prose).toContain('Total: 10 force.');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind)).toEqual(['attack_hit', 'attack_hit']);
  });

  it('skips event emission for hits with 0 damage', () => {
    const ctx = fixtureCtx();
    const { events } = renderSpellMultiTarget(
      {
        kind: 'spell_multi_target',
        attackerId: 'pc-1',
        attackerName: 'Sage',
        spellId: 'eldritch_blast',
        spellName: 'Eldritch Blast',
        castPrefix: 'Sage casts Eldritch Blast',
        damageType: 'force',
        hits: [
          { enemyId: 'g1', enemyName: 'goblin', targetAc: 12, damage: 0, killed: false },
          { enemyId: 'g2', enemyName: 'goblin2', targetAc: 12, damage: 8, killed: false },
        ],
        totalDamage: 8,
        labels: [],
      },
      ctx
    );
    expect(events).toHaveLength(1);
    if (events[0].kind === 'attack_hit') {
      expect(events[0].targetId).toBe('g2');
    }
  });
});

describe('renderSave', () => {
  it('emits a save event and passes prose through verbatim', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSave(
      {
        kind: 'save',
        characterId: 'orc-1',
        characterName: 'Orc',
        ability: 'con',
        roll: 17,
        dc: 14,
        success: true,
        vs: 'Stunning Strike',
        prose: 'Stunning Strike! CON save 17 vs DC 14 — Orc resists.',
      },
      ctx
    );
    expect(prose).toBe('Stunning Strike! CON save 17 vs DC 14 — Orc resists.');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'save') {
      expect(events[0].characterId).toBe('orc-1');
      expect(events[0].ability).toBe('con');
      expect(events[0].roll).toBe(17);
      expect(events[0].dc).toBe(14);
      expect(events[0].success).toBe(true);
      expect(events[0].vs).toBe('Stunning Strike');
      expect(events[0].round).toBe(3);
    }
  });

  it('handles save-failed branch (prose can be empty so a follow-up condition_applied owns the line)', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderSave(
      {
        kind: 'save',
        characterId: 'orc-1',
        characterName: 'Orc',
        ability: 'wis',
        roll: 5,
        dc: 14,
        success: false,
        vs: 'Goading Attack',
        prose: '', // failure path; condition_applied carries the prose
      },
      ctx
    );
    expect(prose).toBe('');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'save') {
      expect(events[0].success).toBe(false);
    }
  });
});

describe('renderConditionApplied', () => {
  it('appends prose verbatim and emits condition_applied event', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderConditionApplied(
      {
        kind: 'condition_applied',
        targetId: 'orc-1',
        targetName: 'orc',
        condition: 'prone',
        source: 'Cunning Strike: Trip',
        prose: ' [Cunning Strike — Trip: orc is prone!]',
      },
      ctx
    );
    expect(prose).toBe(' [Cunning Strike — Trip: orc is prone!]');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'condition_applied') {
      expect(events[0].targetId).toBe('orc-1');
      expect(events[0].condition).toBe('prone');
      expect(events[0].source).toBe('Cunning Strike: Trip');
      expect(events[0].round).toBe(3);
    }
  });
});

describe('renderEnemyAttackHit', () => {
  it('uses pre-built prose verbatim and emits attack_hit event', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderEnemyAttackHit(
      {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'orc-1',
        attackerName: 'Orc',
        targetCharId: 'pc-1',
        targetName: 'Tester',
        damage: 8,
        damageType: 'physical',
        atkTotal: 17,
        targetAc: 14,
        prose: 'The Orc strikes Tester for 8 damage. Tester takes 8 damage.',
      },
      ctx
    );
    expect(prose).toBe('The Orc strikes Tester for 8 damage. Tester takes 8 damage.');
    expect(events).toHaveLength(1);
    if (events[0].kind === 'attack_hit') {
      expect(events[0].attackerId).toBe('orc-1');
      expect(events[0].targetId).toBe('pc-1');
      expect(events[0].damage).toBe(8);
      expect(events[0].damageType).toBe('physical');
      expect(events[0].toHit).toBe(17);
      expect(events[0].targetAc).toBe(14);
      expect(events[0].isCrit).toBe(false);
    }
  });
});

describe('renderEnemyAttackMiss', () => {
  it('uses pre-built prose verbatim and emits attack_miss event', () => {
    const ctx = fixtureCtx();
    const { prose, events } = renderEnemyAttackMiss(
      {
        kind: 'enemy_attack_miss',
        attackerEnemyId: 'orc-1',
        attackerName: 'Orc',
        targetCharId: 'pc-1',
        targetName: 'Tester',
        atkTotal: 9,
        targetAc: 14,
        prose: 'The Orc misses Tester wide.',
      },
      ctx
    );
    expect(prose).toBe('The Orc misses Tester wide.');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('attack_miss');
  });
});

describe('enemyAttackFragmentEvent', () => {
  it('builds an attack_hit CombatEvent from an enemy hit fragment', () => {
    const event = enemyAttackFragmentEvent(
      {
        kind: 'enemy_attack_hit',
        attackerEnemyId: 'goblin-1',
        attackerName: 'Goblin',
        targetCharId: 'pc-1',
        targetName: 'Tester',
        damage: 5,
        damageType: 'piercing',
        atkTotal: 16,
        targetAc: 13,
        prose: 'unused',
      },
      7
    );
    expect(event.kind).toBe('attack_hit');
    if (event.kind === 'attack_hit') {
      expect(event.damage).toBe(5);
      expect(event.damageType).toBe('piercing');
      expect(event.round).toBe(7);
    }
  });

  it('builds an attack_miss CombatEvent from an enemy miss fragment', () => {
    const event = enemyAttackFragmentEvent(
      {
        kind: 'enemy_attack_miss',
        attackerEnemyId: 'goblin-1',
        attackerName: 'Goblin',
        targetCharId: 'pc-1',
        targetName: 'Tester',
        atkTotal: 8,
        targetAc: 13,
        prose: 'unused',
      },
      7
    );
    expect(event.kind).toBe('attack_miss');
    expect(event.round).toBe(7);
  });
});

describe('composeNow', () => {
  it('appends prose to ctx.narrative and pushes event to ctx.st', () => {
    const ctx = fixtureCtx();
    ctx.narrative = 'Bjorn swings. ';
    composeNow(ctx, {
      kind: 'attack_kill',
      attackerId: 'pc-1',
      attackerName: 'Tester',
      victimId: 'orc-1',
      victimName: 'orc',
      xp: 50,
      killProse: ' The orc falls.',
    });
    expect(ctx.narrative).toBe('Bjorn swings.  The orc falls.');
    expect(ctx.st.combat_log).toHaveLength(1);
    expect(ctx.st.combat_log?.[0].kind).toBe('kill');
  });
});

describe('buildCombatHitNarrative — prose seams', () => {
  // A context whose pools mirror the live malgovia phrasing that surfaced the
  // bugs: a sentence-ending combatHit lead-in, a weapon, and a class style.
  const styledContext = (): Context =>
    ({
      narratives: {
        combatHit: { healthy: ['Your attack connects cleanly — {enemy} staggers.'] },
        weaponVerbs: { dagger: ['punches'] },
        classStyle: { Rogue: ['finding the weak point'] },
        enemyReactions: {},
      },
    }) as unknown as Context;

  const dagger = { id: 'dagger', name: 'Dagger' } as LootItem;

  it('does not emit a ",!" seam before the damage', () => {
    const char = fixtureChar({ character_class: 'Rogue' });
    const prose = buildCombatHitNarrative(makeEnemy(), dagger, 10, false, char, styledContext());
    expect(prose).not.toMatch(/,!/);
    // The style clause flows straight into the "!" that closes the sentence.
    expect(prose).toMatch(/finding the weak point! /);
  });

  it('capitalizes the weapon clause that starts a new sentence', () => {
    const char = fixtureChar({ character_class: 'Rogue' });
    const prose = buildCombatHitNarrative(makeEnemy(), dagger, 10, false, char, styledContext());
    expect(prose).toContain('staggers. Your Dagger punches');
    expect(prose).not.toContain('staggers. your Dagger');
  });

  it('capitalizes the unarmed fallback too', () => {
    const char = fixtureChar({ character_class: 'Rogue' });
    const prose = buildCombatHitNarrative(makeEnemy(), null, 6, false, char, styledContext());
    expect(prose).toContain('Your fists');
    expect(prose).not.toContain('your fists');
  });
});
