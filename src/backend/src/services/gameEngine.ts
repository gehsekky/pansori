import {
  ADVANTAGE_CONDITIONS,
  DISADV_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
  FRESH_TURN,
  PLAYER_ADV_CONDITIONS,
  abilityMod,
  applyDamageMultiplier,
  cantripDamageDice,
  d,
  disarmTrap,
  extraAttackCount,
  hasArmorProficiency,
  hasWeaponProficiency,
  passivePerception,
  passivePerceptionDC,
  profBonus,
  rageDamageBonus,
  rageUsesMax,
  resolveEnemyAttack,
  resolveMysteryConsumable,
  resolveOffHandAttack,
  resolvePlayerAttack,
  resolveSaveWithAdvantage,
  resolveSpellAttack,
  rollConditionSave,
  rollCritical,
  rollDeathSave,
  rollDice,
  skillCheck,
  sneakAttackDice,
  spellSaveDC,
  spellSlotsForClassLevel,
  unarmedDamage,
  upcastDamage,
} from './rulesEngine.js';
import type {
  AbilityKey,
  BossPhase,
  Character,
  ChoiceDirection,
  CombatEntity,
  CombatEvent,
  Context,
  DeathSaves,
  Enemy,
  GameChoice,
  GameConsequence,
  GameState,
  GridPos,
  InventoryItem,
  LootItem,
  NpcAttitude,
  OnHitEffect,
  PlacedNpc,
  RoomObject,
  Seed,
  StructuredAction,
  Trap,
  TurnActions,
} from '../types.js';
import { type ActionContext, dispatchAction } from './actions/index.js';
import { BEAST_FORMS, SRD_SPECIES, availableBeastForms } from '../contexts/srd/index.js';
import {
  DEFAULT_SPEED_FEET,
  SQUARE_SIZE,
  coverBonus,
  distanceFeet,
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  findPath,
  inRange,
  isFlankingPosition,
  opportunityAttackTriggers,
  posEqual,
} from './gridEngine.js';
import { fmt, stripNarrativeTokens } from './narrativeFmt.js';
import { COMBAT_LOG_MAX } from '../types.js';
import { Engine } from 'json-rules-engine';
import { factionShopPrice } from './campaignEngine.js';
import { llmProvider } from './llmProvider.js';
import { randomUUID } from 'crypto';

// Append a CombatEvent to state.combat_log, trimming to COMBAT_LOG_MAX so the
// buffer doesn't grow unbounded across long sessions. Pure function — returns
// new state, doesn't mutate. Callers should reassign: `st = pushEvent(st, e)`.
function pushEvent(st: GameState, event: CombatEvent): GameState {
  const next = [...(st.combat_log ?? []), event];
  return { ...st, combat_log: next.slice(-COMBAT_LOG_MAX) };
}

// 2024 PHB Heroic Inspiration — read the pending flag and (if set) clear it
// on `char`. Returns whether inspiration was active so the caller can pass
// it as advantage to a d20 roll. Saves already integrate this through
// applyConditionSave; this helper exists for ability/skill checks.
function consumeInspirationForCheck(char: Character): boolean {
  if (!char.turn_actions?.inspiration_pending) return false;
  char.turn_actions = { ...char.turn_actions, inspiration_pending: false };
  char.inspiration = false;
  return true;
}

// 2024 PHB Bardic Inspiration on any d20. Saves already consume the die
// through `conditionSavingThrow`; this mirror lets skill/ability checks
// auto-spend the stashed die. Returns the rolled die value (0 if no die),
// and clears the die on `char` when consumed. The caller subtracts the
// roll from the target DC (or adds to the check total) before resolving.
function consumeBardicForCheck(char: Character): number {
  const die = char.bardic_inspiration_die;
  if (!die) return 0;
  const roll = rollDice(`1${die}`);
  char.bardic_inspiration_die = undefined;
  return roll;
}

// Cleric/Paladin/Druid prepared-spell cap: class level + spellcasting modifier
// (minimum 1). The casting stat is class-dependent (Cleric/Druid = WIS,
// Paladin = CHA); resolves through context.spellcastingAbility with a fall
// back to the class's primary stat.
export function preparedSpellsCap(char: Character, context: Context): number {
  const ability = (context.spellcastingAbility?.[char.character_class] ??
    context.classPrimaryStats[char.character_class] ??
    'wis') as AbilityKey;
  const score = (char[ability] ?? 10) as number;
  return Math.max(1, char.level + Math.max(0, Math.floor((score - 10) / 2)));
}

// ─── Boss-phase machinery ────────────────────────────────────────────────────
//
// Phase transitions modify the seed's runtime Enemy stats in-place. The seed
// is fresh on every request, so on entry we re-apply effects for phases
// 0..phase_index-1; on exit we check whether any boss's hp% has crossed a new
// threshold, apply that phase's effects, and emit a `phase_transition` event.
//
// Phases sort descending by hpPct (100% → 1%). `phase_index` is "how many
// phases have already fired", so phases[0..phase_index-1] are active and
// phases[phase_index] is the next one waiting.

function sortedPhases(phases: BossPhase[]): BossPhase[] {
  return [...phases].sort((a, b) => b.hpPct - a.hpPct);
}

function applyPhaseEffect(enemy: Enemy, effect: BossPhase['effects'][number]): Enemy {
  switch (effect.kind) {
    case 'set_multiattack':
      return { ...enemy, multiattack: effect.value };
    case 'set_damage':
      return { ...enemy, damage: effect.dice };
    case 'set_to_hit':
      return { ...enemy, toHit: effect.value };
    case 'set_ac':
      return { ...enemy, ac: effect.value };
    case 'set_on_hit_effect':
      return { ...enemy, onHitEffect: effect.effect };
    case 'add_resistance': {
      const prev = enemy.resistances ?? [];
      if (prev.includes(effect.damageType)) return enemy;
      return { ...enemy, resistances: [...prev, effect.damageType] };
    }
    case 'heal': {
      const max = enemy.maxHp ?? enemy.hp;
      return { ...enemy, hp: Math.min(max, enemy.hp + effect.amount) };
    }
  }
}

// Apply all effects up to `phaseIndex` (exclusive) onto the seed's enemy
// in-place. Called on every request entry so a re-fetched seed reflects the
// boss's accumulated phase changes.
function rehydrateBossPhases(seed: Seed, st: GameState): void {
  if (!st.entities) return;
  for (const ent of st.entities) {
    if (!ent.isEnemy) continue;
    const phaseIdx = ent.phase_index ?? 0;
    if (phaseIdx <= 0) continue;
    for (const [roomId, list] of Object.entries(seed.enemies ?? {})) {
      const idx = list.findIndex((e) => e.id === ent.id);
      if (idx < 0) continue;
      const enemy = list[idx];
      if (!enemy.phases?.length) continue;
      const phases = sortedPhases(enemy.phases);
      let next = enemy;
      for (let i = 0; i < Math.min(phaseIdx, phases.length); i++) {
        for (const eff of phases[i].effects) {
          next = applyPhaseEffect(next, eff);
        }
      }
      // Mutate in place so subsequent reads in this request see the new
      // stats. Other rooms' enemy arrays are untouched.
      seed.enemies[roomId] = [...list.slice(0, idx), next, ...list.slice(idx + 1)];
    }
  }
}

// Scan entities for any boss whose hp has dropped below the next-pending
// phase threshold; if so, increment phase_index, apply effects to the seed,
// and emit a `phase_transition` event. Returns the new state (entities may be
// updated to bump phase_index + reflect heal-effects that change hp).
function processBossPhaseTransitions(st: GameState, seed: Seed): GameState {
  if (!st.entities) return st;
  let updated = st;
  const newEntities = updated.entities!.map((ent) => ({ ...ent }));
  let anyChange = false;

  for (let i = 0; i < newEntities.length; i++) {
    const ent = newEntities[i];
    if (!ent.isEnemy || ent.hp <= 0) continue;

    let enemy: Enemy | undefined;
    let roomKey: string | undefined;
    let enemyIdx = -1;
    for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
      const idx = list.findIndex((e) => e.id === ent.id);
      if (idx >= 0) {
        enemy = list[idx];
        roomKey = rk;
        enemyIdx = idx;
        break;
      }
    }
    if (!enemy?.phases?.length || !roomKey || enemyIdx < 0) continue;

    const phases = sortedPhases(enemy.phases);
    const currentIdx = ent.phase_index ?? 0;
    if (currentIdx >= phases.length) continue;

    const maxHp = enemy.maxHp ?? ent.maxHp ?? ent.hp;
    const hpPct = (ent.hp / maxHp) * 100;
    const nextPhase = phases[currentIdx];
    if (hpPct > nextPhase.hpPct) continue;

    // Trigger the phase. Apply effects to the seed's enemy in place.
    let nextEnemy = enemy;
    for (const eff of nextPhase.effects) {
      nextEnemy = applyPhaseEffect(nextEnemy, eff);
    }
    seed.enemies[roomKey] = [
      ...seed.enemies[roomKey].slice(0, enemyIdx),
      nextEnemy,
      ...seed.enemies[roomKey].slice(enemyIdx + 1),
    ];

    // If the phase healed, mirror the hp back onto the entity so the UI
    // sees it. (effects array runs in order; heal is captured via
    // nextEnemy.hp - enemy.hp delta.)
    const healDelta = nextEnemy.hp - enemy.hp;
    if (healDelta > 0) {
      newEntities[i] = { ...ent, hp: Math.min(maxHp, ent.hp + healDelta) };
    }

    newEntities[i] = {
      ...newEntities[i],
      phase_index: currentIdx + 1,
    };
    anyChange = true;

    updated = pushEvent(
      { ...updated, entities: newEntities },
      {
        kind: 'phase_transition',
        bossId: ent.id,
        bossName: enemy.name,
        phaseName: nextPhase.name,
        narrative: nextPhase.narrative,
        round: updated.round ?? 1,
      }
    );
  }

  return anyChange ? { ...updated, entities: newEntities } : updated;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hpTier(char: Character): 'healthy' | 'hurt' | 'critical' {
  const pct = (char.hp ?? 0) / (char.max_hp || 1);
  if (pct > 0.66) return 'healthy';
  if (pct > 0.33) return 'hurt';
  return 'critical';
}

// Exhaustion 4: effective max HP is halved (PHB p.291)
function clampHpForExhaustion(hp: number, maxHp: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 4) return Math.min(hp, Math.floor(maxHp / 2));
  return hp;
}

// ─── Concentration helpers ────────────────────────────────────────────────────

// Initial round-budget for a concentration spell. Defaults to 10 (1 minute,
// the standard for Bless / Hold Person / Bane / etc.); a spell can declare
// longer durations (Spirit Guardians = 100, Hex = 600) via Spell.durationRounds.
function concentrationRoundsFor(spell: { durationRounds?: number } | undefined): number {
  return spell?.durationRounds ?? 10;
}

// Tick every PC's concentration timer down by one round and break any
// concentration whose timer just hit 0. Called on round wrap so the
// tick fires once per full initiative cycle (SRD 5.2.1 round = 6 sec).
// Returns { st, narrative } — narrative aggregates the auto-end notes
// for each PC whose spell timed out.
function tickConcentrationDurations(st: GameState): { st: GameState; narrative: string } {
  let narrative = '';
  let stOut = st;
  for (const c of st.characters) {
    if (!c.concentrating_on || c.dead) continue;
    const remaining = c.concentrating_on.rounds_left;
    if (remaining == null) continue; // legacy state without a counter — keep persisting
    if (remaining <= 1) {
      // Time's up — break concentration cleanly via the existing path
      // (handles bless-blessed cleanup, condition-link clearing, etc).
      const { char: nc, st: ns } = breakConcentration(c, stOut);
      stOut = {
        ...ns,
        characters: ns.characters.map((x) => (x.id === c.id ? nc : x)),
      };
      const spellName = c.concentrating_on.spellId;
      narrative += ` [${c.name}'s ${spellName} fades — concentration duration expired.]`;
    } else {
      // Decrement; carry the rest of the concentrating_on payload forward.
      stOut = {
        ...stOut,
        characters: stOut.characters.map((x) =>
          x.id === c.id
            ? {
                ...x,
                concentrating_on: { ...c.concentrating_on!, rounds_left: remaining - 1 },
              }
            : x
        ),
      };
    }
  }
  return { st: stOut, narrative };
}

function breakConcentration(char: Character, st: GameState): { char: Character; st: GameState } {
  if (!char.concentrating_on) return { char, st };
  const condition = char.concentrating_on.condition;
  const wasBless = char.concentrating_on.spellId === 'bless';
  let newChar: Character = { ...char, concentrating_on: null };
  // Strip the linked enemy condition (Hold Person etc.)
  let newSt: GameState =
    condition && st.entities
      ? {
          ...st,
          entities: st.entities.map((e) =>
            e.isEnemy ? { ...e, conditions: e.conditions.filter((c) => c !== condition) } : e
          ),
        }
      : st;
  // Bless (PHB p.219) — the buff is on ALLIES, not enemies. When the
  // caster's concentration drops, clear `blessed` from every PC whose
  // condition_sources.blessed pointed at this caster. The caster's
  // local ref is mutated too so callers writing it back to state don't
  // resurrect the cleared condition.
  if (wasBless) {
    newSt = {
      ...newSt,
      characters: newSt.characters.map((c) => {
        if ((c.condition_sources ?? {}).blessed !== char.id) return c;
        const { blessed: _drop, ...rest } = c.condition_sources ?? {};
        void _drop;
        return {
          ...c,
          conditions: (c.conditions ?? []).filter((x) => x !== 'blessed'),
          condition_sources: rest,
        };
      }),
    };
    if ((newChar.condition_sources ?? {}).blessed === char.id) {
      const { blessed: _drop2, ...rest2 } = newChar.condition_sources ?? {};
      void _drop2;
      newChar = {
        ...newChar,
        conditions: (newChar.conditions ?? []).filter((x) => x !== 'blessed'),
        condition_sources: rest2,
      };
    }
  }
  return { char: newChar, st: newSt };
}

function checkConcentration(
  char: Character,
  st: GameState,
  dmgTaken: number
): { char: Character; st: GameState; note: string } {
  if (!char.concentrating_on || dmgTaken <= 0) return { char, st, note: '' };
  // SRD 5.2.1 p.203 — Concentration DC is 10 or half damage taken, whichever
  // is higher; capped at 30. The cap basically only matters at >60 dmg.
  const dc = Math.min(30, Math.max(10, Math.floor(dmgTaken / 2)));
  const save = d(20) + abilityMod(char.con);
  if (save >= dc) return { char, st, note: ` [Concentration hold: ${save} vs DC ${dc}]` };
  const spellName = char.concentrating_on.spellId;
  const { char: nc, st: ns } = breakConcentration(char, st);
  return {
    char: nc,
    st: ns,
    note: ` [Concentration broken: ${save} vs DC ${dc} — ${spellName} ends!]`,
  };
}

function pickTiered(
  template: string[] | Record<string, string[]> | undefined,
  tier: string
): string {
  if (!template) return '';
  if (Array.isArray(template)) return pick(template);
  return pick(template[tier] || template['healthy'] || template[Object.keys(template)[0]] || ['']);
}

function buildCombatHitNarrative(
  enemy: Enemy,
  weaponItem: LootItem | null,
  damage: number,
  critical: boolean,
  char: Character,
  context: Context
): string {
  const tier = hpTier(char);
  const opening = pickTiered(context.narratives.combatHit, tier).replace(/{enemy}/g, enemy.name);
  const verbPool = context.narratives.weaponVerbs?.[weaponItem?.id ?? ''] ??
    context.narratives.weaponVerbs?.['unarmed'] ?? ['connects with'];
  const verb = pick(verbPool);
  const stylePool = context.narratives.classStyle?.[char.character_class];
  const style = stylePool ? `, ${pick(stylePool)},` : '';
  const reactionPool = context.narratives.enemyReactions?.[enemy.name];
  const reaction = reactionPool ? ` — ${pick(reactionPool)}` : '';
  const critNote = critical ? 'Critical hit! ' : '';
  const weaponLabel = weaponItem ? `your ${weaponItem.name}` : 'your fists';
  return `${opening} ${critNote}${weaponLabel} ${verb}${style}${reaction}! ${fmt.dmg(damage)} damage.`;
}

// 0 = uncapped. Every cap site is gated with `MAX_CHOICES && …` so a falsy
// value short-circuits the cap checks cleanly without dead-code cleanup.
const MAX_CHOICES = 0;

function getItemData(item: InventoryItem | undefined, context: Context): LootItem & InventoryItem {
  if (!item) return {} as LootItem & InventoryItem;
  const tableEntry = context.lootTable.find((i) => i.id === item.id) ?? ({} as LootItem);
  return { ...tableEntry, ...item };
}

function getWorldName(seed: Seed): string {
  return seed.world_name || seed.ship_name || 'the world';
}

// ─── Condition helpers ────────────────────────────────────────────────────────

function conditionSavingThrow(
  effect: OnHitEffect,
  char: Pick<
    Character,
    | 'str'
    | 'dex'
    | 'con'
    | 'int'
    | 'wis'
    | 'cha'
    | 'level'
    | 'character_class'
    | 'conditions'
    | 'turn_actions'
    | 'inspiration'
    | 'bardic_inspiration_die'
    | 'inventory'
    | 'species'
  >,
  context: Context
): {
  applied: boolean;
  inspirationConsumed: boolean;
  bardicInspirationConsumed: boolean;
  bardicRoll: number;
} {
  const proficient =
    context.classSavingThrows?.[char.character_class]?.includes(effect.ability) ?? false;
  // 2024 PHB — Heroic Inspiration can be spent on any d20 test. If the
  // player armed it via spend_inspiration, the save gets advantage and
  // the flag is consumed (the caller updates char accordingly).
  const inspirationActive = !!char.turn_actions?.inspiration_pending;
  // 2024 PHB Bardic Inspiration — if the saver carries a BI die, it can
  // be spent on this save (and is consumed regardless of outcome). We
  // roll it, then check if the d20 + mods + bi-roll meets the DC.
  const biDie = char.bardic_inspiration_die;
  const bardicRoll = biDie ? rollDice(`1${biDie}`) : 0;
  const dcAdjusted = effect.dc - bardicRoll;
  // 2024 PHB: heavy encumbrance imposes disadvantage on STR/DEX/CON saves
  // (and checks, and attacks). Apply here so onHit-effect saves account for it.
  const enc =
    (effect.ability === 'str' || effect.ability === 'dex' || effect.ability === 'con') &&
    isHeavilyEncumbered(char);
  // 2024 PHB species save advantages that key off the *condition being
  // applied* (not the save ability itself):
  //   Elf / Drow — Fey Ancestry, advantage on saves vs Charmed
  //   Halfling   — Brave, advantage on saves vs Frightened
  //   Dwarf      — Dwarven Resilience, advantage on saves vs Poisoned
  const speciesId = char.species ?? 'human';
  const speciesAdv =
    (effect.condition === 'charmed' && (speciesId === 'elf' || speciesId === 'drow')) ||
    (effect.condition === 'frightened' && speciesId === 'halfling') ||
    (effect.condition === 'poisoned' && speciesId === 'dwarf');
  const applied = rollConditionSave(
    effect.ability,
    char[effect.ability] ?? 10,
    dcAdjusted,
    proficient,
    char.level,
    0,
    char.conditions ?? [],
    inspirationActive || speciesAdv,
    enc
  );
  return {
    applied,
    inspirationConsumed: inspirationActive,
    bardicInspirationConsumed: !!biDie,
    bardicRoll,
  };
}

// ─── Enemy attack helper ──────────────────────────────────────────────────────

// SRD 5.2.1 p.17 — Massive Damage: when damage reduces a character to 0 HP
// and the leftover damage equals or exceeds their HP maximum, the character
// dies outright (no death saves).
function isMassiveDamageDeath(prevHp: number, damage: number, maxHp: number): boolean {
  if (prevHp <= 0) return false; // already at 0; further damage is just bookkeeping
  const remainder = damage - prevHp;
  return remainder >= maxHp;
}

function applyEnemyAttackNarrative(
  enemy: Enemy,
  char: Character,
  context: Context
): {
  hpLost: number;
  narrative: string;
  newConditions: string[];
  newDurations: Record<string, number>;
  updatedResourceUses?: Record<string, number>;
  newTempHp?: number;
  // Exposed so callers can detect reaction windows (Shield: total in [AC, AC+4]).
  atkTotal: number;
  hit: boolean;
  // True when the PC spent Heroic Inspiration on the save vs onHitEffect.
  // Caller should clear inspiration flags on the resulting Character.
  inspirationConsumed?: boolean;
  // True when the PC's stashed Bardic Inspiration die was consumed on the
  // save. Caller clears bardic_inspiration_die on the resulting Character.
  bardicConsumed?: boolean;
} {
  const isDodging = char.turn_actions?.dodging ?? false;
  const isReckless = char.turn_actions?.reckless ?? false;
  const hasAdvantage = char.conditions.some((c) => ADVANTAGE_CONDITIONS.has(c)) || isReckless;
  const hasDisadvantage = char.conditions.some((c) => ENEMY_DISADV_CONDITIONS.has(c)) || isDodging;
  const result = resolveEnemyAttack(enemy, char.ac, hasAdvantage, hasDisadvantage);
  const armorItem = char.equipped_armor
    ? char.inventory?.find((i) => i.id === char.equipped_armor)
    : null;

  if (result.hit) {
    // Rage resistance: halve physical damage while raging (PHB p.48)
    const isRaging = char.conditions.includes('raging');
    // Petrified: resistance to all damage (PHB p.291)
    const isPetrified = char.conditions.includes('petrified');
    // 2024 PHB Beast Form (Bear / Brown Bear) — physical damage resistance
    // while shifted into a physicalResistance form. Enemy attacks deal
    // half damage. (Pansori's enemy attacks are all physical for now;
    // this becomes type-checked once we tag enemy damageType broadly.)
    const beastForm =
      char.conditions.includes('wild_shaped') && char.wild_shape_form
        ? BEAST_FORMS[char.wild_shape_form]
        : undefined;
    const beastResist = !!beastForm?.physicalResistance;
    // 2024 PHB species resistance — Dwarves (poison), Dragonborn (ancestry
    // type, default fire), Tieflings (fire). Applies when the enemy's
    // attack carries a damageType matching the species's resistance list.
    const speciesData = char.species ? SRD_SPECIES[char.species] : undefined;
    const speciesResist =
      enemy.damageType && speciesData?.resistances?.includes(enemy.damageType) === true;
    const anyResist = isRaging || isPetrified || beastResist || speciesResist;
    let hpLost = anyResist ? Math.ceil(result.damage / 2) : result.damage;
    const rageNote = isRaging ? ` (Rage resistance: ${result.damage}→${hpLost})` : '';
    const petrNote = isPetrified ? ` (Petrified resistance: ${result.damage}→${hpLost})` : '';
    const beastNote =
      beastResist && !isRaging && !isPetrified
        ? ` (${beastForm?.name} resistance: ${result.damage}→${hpLost})`
        : '';
    const speciesNote =
      speciesResist && !isRaging && !isPetrified && !beastResist
        ? ` (${speciesData?.name} ${enemy.damageType} resistance: ${result.damage}→${hpLost})`
        : '';
    // Arcane Ward: Abjurer Wizard — absorb damage into ward HP before character HP
    let wardNote = '';
    const wardHp = char.class_resource_uses?.arcane_ward ?? 0;
    if (wardHp > 0 && char.subclass === 'abjurer') {
      const absorbed = Math.min(wardHp, hpLost);
      hpLost -= absorbed;
      char = {
        ...char,
        class_resource_uses: {
          ...(char.class_resource_uses ?? {}),
          arcane_ward: wardHp - absorbed,
        },
      };
      wardNote = ` (Arcane Ward absorbed ${absorbed} — ward HP: ${wardHp - absorbed})`;
    }
    // Temporary HP (SRD 5.2.1 p.17–18): absorb damage before regular HP.
    // Temp HP doesn't stack with itself; it decrements with damage and is
    // tracked on the character. Once depleted, remaining damage hits HP.
    let tempHpAbsorbed = 0;
    let newTempHp = char.temp_hp ?? 0;
    if (newTempHp > 0 && hpLost > 0) {
      tempHpAbsorbed = Math.min(newTempHp, hpLost);
      hpLost -= tempHpAbsorbed;
      newTempHp -= tempHpAbsorbed;
    }
    const tempHpNote =
      tempHpAbsorbed > 0 ? ` (Temp HP absorbed ${tempHpAbsorbed} — temp HP: ${newTempHp})` : '';
    // Exhaustion 4: effective max HP is halved — clamp current HP after taking damage
    const newHpAfterDmg = clampHpForExhaustion(
      Math.max(0, char.hp - hpLost),
      char.max_hp,
      char.exhaustion_level ?? 0
    );
    hpLost = char.hp - newHpAfterDmg; // recalculate actual HP lost after clamp

    let narrative = pick(context.narratives.enemyAttacks)
      .replace('{enemy}', enemy.name)
      .replace('{target}', char.name)
      .replace('{dmg}', fmt.dmg(hpLost));
    narrative += ` ${char.name} takes ${fmt.dmg(hpLost)} damage.`;
    narrative += rageNote + petrNote + beastNote + speciesNote + wardNote + tempHpNote;
    let updatedChar = { ...char };

    let inspirationConsumed = false;
    let bardicConsumed = false;
    if (enemy.onHitEffect) {
      const csResult = conditionSavingThrow(enemy.onHitEffect, char, context);
      if (csResult.inspirationConsumed) {
        inspirationConsumed = true;
        narrative += ` ✦ Heroic Inspiration spent on the save!`;
      }
      if (csResult.bardicInspirationConsumed) {
        bardicConsumed = true;
        narrative += ` ✦ Bardic Inspiration spent on the save (+${csResult.bardicRoll})!`;
      }
      if (csResult.applied) {
        // For Frightened, record the source enemy so movement restrictions
        // can check against it later. For Charmed, also stash the charmer
        // on `charmer_id` so the existing "cannot attack your charmer"
        // guard fires (gameEngine.ts ~3277).
        const sourceCond = enemy.onHitEffect.condition;
        const tracksSource = sourceCond === 'frightened' || sourceCond === 'charmed';
        updatedChar = inflictCondition(
          updatedChar,
          sourceCond,
          tracksSource ? enemy.id : undefined
        );
        if (sourceCond === 'charmed') {
          updatedChar = { ...updatedChar, charmer_id: enemy.id };
        }
        if (updatedChar.conditions.length > char.conditions.length) {
          narrative += ` ${char.name} is ${sourceCond}!`;
        }
      }
    }
    // Clear the inspiration flag on the char being returned so the caller
    // doesn't double-spend it on a later roll this turn.
    if (inspirationConsumed) {
      updatedChar = {
        ...updatedChar,
        inspiration: false,
        turn_actions: { ...updatedChar.turn_actions, inspiration_pending: false },
      };
    }
    if (bardicConsumed) {
      updatedChar = { ...updatedChar, bardic_inspiration_die: undefined };
    }
    return {
      hpLost,
      narrative,
      newTempHp,
      newConditions: updatedChar.conditions,
      newDurations: updatedChar.condition_durations,
      updatedResourceUses: char.class_resource_uses,
      atkTotal: result.total,
      hit: true,
      inspirationConsumed,
      bardicConsumed,
    };
  }
  if (armorItem) {
    return {
      hpLost: 0,
      narrative: pick(context.narratives.enemyDeflected)
        .replace('{enemy}', enemy.name)
        .replace('{target}', char.name)
        .replace('{armor}', armorItem.name),
      newConditions: [...char.conditions],
      newDurations: { ...(char.condition_durations ?? {}) },
      atkTotal: result.total,
      hit: false,
    };
  }
  // Variety pool for plain misses — repeated "you dodge at the last
  // second" reads oddly when the PC never actually took the Dodge action.
  // Picks per-call so a multi-attack round doesn't echo the same line.
  const missLines = [
    `The ${enemy.name} lunges — but you dodge at the last second!`,
    `The ${enemy.name}'s strike swings wide of the mark.`,
    `The ${enemy.name} attacks, but the blow glances off your guard.`,
    `The ${enemy.name} misjudges the distance — the swing finds only air.`,
    `You sidestep the ${enemy.name}'s strike at the last moment.`,
    `The ${enemy.name} attacks ${char.name} — and misses cleanly.`,
  ];
  return {
    hpLost: 0,
    narrative: pick(missLines),
    newConditions: [...char.conditions],
    newDurations: { ...(char.condition_durations ?? {}) },
    atkTotal: result.total,
    hit: false,
  };
}

// ─── Death save handler ───────────────────────────────────────────────────────

function processDeathSave(
  char: Character,
  enemy: Enemy | null | undefined,
  context: Context,
  worldName: string
): { narrative: string; newChar: Character; died: boolean; endedCombat: boolean } {
  const save = rollDeathSave(char.death_saves);
  const newChar = { ...char, death_saves: save.saves };
  let narrative = '';
  // No code path currently sets endedCombat = true. Kept as a return field for
  // callers' convenience and future death-related combat-ending hooks.
  const endedCombat = false;

  switch (save.result) {
    case 'regain_hp':
      // SRD 5.2.1 p.197 — rolling a 20 on a death save regains 1 HP and ends
      // the unconscious condition. It does NOT end the combat encounter;
      // remaining enemies keep fighting. Other conditions (frightened /
      // prone / grappled / etc.) persist — clearing every condition was a
      // legacy bug that erased fear from a downed-then-revived PC.
      newChar.hp = 1;
      newChar.death_saves = { successes: 0, failures: 0 };
      newChar.stable = false;
      newChar.conditions = (newChar.conditions ?? []).filter((c) => c !== 'unconscious');
      // Sync condition_durations to the trimmed list.
      if (newChar.condition_durations) {
        const { unconscious: _drop, ...restDur } = newChar.condition_durations;
        void _drop;
        newChar.condition_durations = restDur;
      }
      narrative = `Death Save — Natural ${fmt.roll(20)}! You surge back to ${fmt.hp(1)} HP, gasping but alive.`;
      return { narrative, newChar, died: false, endedCombat };

    case 'stable':
      newChar.stable = true;
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes). You stabilise. Unconscious but no longer dying. You need healing to act again.`;
      break;

    case 'success': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Clinging to life...';
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'double_failure': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'The darkness presses in...';
      narrative = `Death Save — Natural ${fmt.roll(1)}! Two failures (${save.saves.failures}/3). ${flavor}`;
      break;
    }

    case 'failure': {
      const pool = context.narratives.deathSaveStatus?.[save.saves.failures];
      const flavor = pool ? pick(pool) : 'Fading...';
      narrative = `Death Save — ${fmt.roll(save.roll)} (${save.saves.successes}/3 successes, ${save.saves.failures}/3 failures). ${flavor}`;
      break;
    }

    case 'dead':
      newChar.dead = true;
      narrative = pick(context.narratives.deathLines)
        .replace(/{name}/g, char.name)
        .replace('{enemy}', enemy?.name ?? 'your wounds')
        .replace(/{world}/g, worldName);
      return { narrative, newChar, died: true, endedCombat: false };
  }

  // While unconscious, a living enemy delivers automatic hits → 2 death save failures
  if (enemy && !newChar.dead) {
    const attackSaves = {
      successes: newChar.death_saves.successes,
      failures: Math.min(3, newChar.death_saves.failures + 2),
    };
    newChar.death_saves = attackSaves;
    narrative += ` The ${enemy.name} attacks your prone form — 2 death save failures (${attackSaves.failures}/3)!`;
    if (attackSaves.failures >= 3) {
      newChar.dead = true;
      narrative +=
        ' ' +
        pick(context.narratives.deathLines)
          .replace(/{name}/g, char.name)
          .replace('{enemy}', enemy.name)
          .replace(/{world}/g, worldName);
      return { narrative, newChar, died: true, endedCombat: false };
    }
  }

  return { narrative, newChar, died: false, endedCombat };
}

// ─── Condition duration helpers ───────────────────────────────────────────────

// How many rounds each on-hit condition lasts (cleared at start of victim's next turn).
// Conditions with no entry (exhaustion) are permanent until explicitly cleared.
const CONDITION_DURATION: Record<string, number> = {
  stunned: 1,
  paralyzed: 1,
  poisoned: 2,
  prone: 1,
  frightened: 2,
  blinded: 1,
  restrained: 1,
  incapacitated: 1,
  grappled: 1,
  invisible: 2,
};

function inflictCondition(char: Character, condition: string, sourceId?: string): Character {
  if (char.conditions.includes(condition)) {
    if (sourceId && condition === 'frightened') {
      return {
        ...char,
        condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId },
      };
    }
    return char;
  }
  const duration = CONDITION_DURATION[condition] ?? 1;
  return {
    ...char,
    conditions: [...char.conditions, condition],
    condition_durations: { ...(char.condition_durations ?? {}), [condition]: duration },
    // 2024 PHB Frightened (and a few others) track the source entity. Other
    // conditions ignore sourceId — it's free metadata when provided.
    ...(sourceId
      ? { condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId } }
      : {}),
  };
}

function tickConditions(char: Character): Character {
  const durations = char.condition_durations ?? {};
  if (!char.conditions.length) return char;

  const newDurations: Record<string, number> = {};
  const expired: string[] = [];

  for (const cond of char.conditions) {
    if (durations[cond] === undefined) {
      // No duration entry → permanent (only cleared by game logic)
      newDurations[cond] = durations[cond];
    } else {
      const remaining = durations[cond] - 1;
      if (remaining <= 0) {
        expired.push(cond);
      } else {
        newDurations[cond] = remaining;
      }
    }
  }

  const newConditions = char.conditions.filter((c) => !expired.includes(c));
  // Shield spell side-effect: AC bump applied on cast must be undone on expiry.
  const acDelta = expired.includes('shield_spell') ? -5 : 0;
  // Clear condition_sources entries for any expired condition.
  let newSources = char.condition_sources;
  if (expired.length > 0 && newSources) {
    newSources = { ...newSources };
    for (const c of expired) delete newSources[c];
  }
  return {
    ...char,
    ac: char.ac + acDelta,
    conditions: newConditions,
    condition_durations: newDurations,
    condition_sources: newSources,
  };
}

// SRD 5.2.1 p.178 (Variant Encumbrance) — speed reductions tied to carried weight.
// ≤ 5×STR: normal speed
// > 5×STR, ≤ 10×STR: -10 ft (encumbered)
// > 10×STR, ≤ 15×STR: -20 ft (heavily encumbered)
// > 15×STR: speed 0 (overloaded)
export function effectiveSpeed(char: Character): number {
  let base = char.speed ?? DEFAULT_SPEED_FEET;
  // 2024 PHB Goliath Large Form — +10 ft speed while the condition is active.
  if (char.conditions?.includes('large_form')) base += 10;
  const weight = charCarriedWeight(char);
  // 2024 PHB Goliath Powerful Build: count as one size larger for carrying
  // capacity. Mechanically: double the effective STR-based thresholds.
  const carryMult = char.species === 'goliath' ? 2 : 1;
  const str = char.str * carryMult;
  if (weight > str * 15) return 0;
  if (weight > str * 10) return Math.max(0, base - 20);
  if (weight > str * 5) return Math.max(0, base - 10);
  return base;
}

function charCarriedWeight(char: Pick<Character, 'inventory'>): number {
  return (char.inventory ?? []).reduce((sum, i) => {
    const w = (i as { weight?: number }).weight ?? 0;
    const count = (i as { count?: number }).count ?? 1;
    return sum + w * count;
  }, 0);
}

// 2024 PHB Variant Encumbrance — Heavily Encumbered (>10×STR) gives
// disadvantage on STR/DEX/CON ability checks, saving throws, AND attack
// rolls. Encumbered (>5×STR) only reduces speed; we ignore it for
// disadvantage purposes. Used in attack and skill/save resolution paths.
function isHeavilyEncumbered(char: Pick<Character, 'inventory' | 'str' | 'species'>): boolean {
  const w = charCarriedWeight(char);
  // Goliath Powerful Build: count as one size larger for carrying capacity.
  const carryMult = char.species === 'goliath' ? 2 : 1;
  return w > char.str * 10 * carryMult;
}

// ─── Enemy lookup helpers (multi-enemy per room) ──────────────────────────────

function getRoomEnemies(seed: Seed, roomId: string): Enemy[] {
  return seed.enemies?.[roomId] ?? [];
}

// A hostile NPC participates in combat as a regular enemy — same grid, same
// initiative, same machinery. We surface it as an Enemy on the fly so the
// combat path doesn't need a separate "duel" code branch.
function npcAsEnemy(npc: PlacedNpc): Enemy {
  return {
    id: `npc:${npc.roomId}`,
    name: npc.name,
    hp: npc.hp,
    ac: npc.ac,
    damage: npc.damage,
    toHit: npc.toHit,
    xp: npc.xp,
    dex: npc.dex,
  };
}

function getLivingRoomEnemies(state: GameState, seed: Seed, roomId: string): Enemy[] {
  const killed = state.enemies_killed ?? [];
  const base = getRoomEnemies(seed, roomId).filter((e) => !killed.includes(e.id));
  // Include a hostile-flipped NPC in this room as an enemy.
  const npc = seed.npcs?.[roomId];
  if (npc && state.npc_attitudes?.[roomId] === 'hostile' && !killed.includes(`npc:${roomId}`)) {
    base.push(npcAsEnemy(npc));
  }
  return base;
}

// SRD p.221 — lair actions. Fire one randomly-picked action per round on
// the round-wrap path. Only fires if a living enemy with `lair_actions`
// is in the current room. Returns updated state, narrative addendum,
// and a `fired` flag so callers can skip the narrative-prefix work when
// nothing happened.
function fireLairAction(
  st: GameState,
  seed: Seed,
  _context: Context
): { st: GameState; narrative: string; fired: boolean } {
  if (!st.combat_active) return { st, narrative: '', fired: false };
  const roomId = st.current_room;
  const livingEnemies = getLivingRoomEnemies(st, seed, roomId);
  const lairBoss = livingEnemies.find((e) => (e.lair_actions?.length ?? 0) > 0);
  if (!lairBoss?.lair_actions?.length) return { st, narrative: '', fired: false };
  const action = pick(lairBoss.lair_actions);
  if (action.kind === 'aoe_save_damage') {
    const dc = action.saveDC;
    const fullDmg = rollDice(action.dice);
    let narrative = ` 🌀 Lair action: ${action.name} — ${action.narrative}`;
    const updatedChars = st.characters.map((c) => {
      if (c.dead) return c;
      const scoreKey = action.savingThrow as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      const score = (c[scoreKey] ?? 10) as number;
      const saveFailed = rollConditionSave(
        scoreKey,
        score,
        dc,
        false,
        c.level,
        0,
        c.conditions ?? []
      );
      const dealt = saveFailed ? fullDmg : Math.floor(fullDmg / 2);
      const newHp = Math.max(0, c.hp - dealt);
      narrative += ` ${c.name}: ${scoreKey.toUpperCase()} save vs DC ${dc} — ${saveFailed ? 'fails' : 'succeeds (half)'} (${dealt} ${action.damageType}).`;
      return { ...c, hp: newHp };
    });
    return { st: { ...st, characters: updatedChars }, narrative, fired: true };
  }
  return { st, narrative: '', fired: false };
}

// SRD p.221 — legendary actions. Fire AT MOST ONE after another creature's
// turn ends. Spends `legendary_action_points` (refreshed on the legendary
// creature's own turn). Picks the lowest-cost available action and resolves
// its effect immediately against the nearest living PC.
function fireLegendaryAction(
  st: GameState,
  seed: Seed,
  context: Context
): { st: GameState; narrative: string; fired: boolean } {
  if (!st.combat_active) return { st, narrative: '', fired: false };
  const roomId = st.current_room;
  const livingEnemies = getLivingRoomEnemies(st, seed, roomId);
  const legendary = livingEnemies.find(
    (e) => (e.legendary_actions?.length ?? 0) > 0 && (e.legendary_action_points ?? 0) > 0
  );
  if (!legendary?.legendary_actions?.length) return { st, narrative: '', fired: false };
  const sorted = [...legendary.legendary_actions].sort((a, b) => a.cost - b.cost);
  const action = sorted.find((a) => a.cost <= (legendary.legendary_action_points ?? 0));
  if (!action) return { st, narrative: '', fired: false };

  // Spend the points by mutating the seed enemy entry. Mirrors the
  // phase-transition mutation pattern at processBossPhaseTransitions.
  for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
    const idx = list.findIndex((e) => e.id === legendary.id);
    if (idx >= 0) {
      const updated: Enemy = {
        ...list[idx],
        legendary_action_points: (list[idx].legendary_action_points ?? 0) - action.cost,
      };
      seed.enemies[rk] = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
      break;
    }
  }

  let narrative = ` ⚜️ Legendary action — ${legendary.name} uses ${action.name}.`;
  if (action.narrative) narrative += ` ${action.narrative}`;
  if (action.kind === 'extra_attack') {
    const nearestPcEnt = st.entities
      ?.filter((e) => !e.isEnemy && !e.isCompanion && e.hp > 0)
      .sort((a, b) => {
        const lairEnt = st.entities?.find((x) => x.id === legendary.id && x.isEnemy);
        if (!lairEnt) return 0;
        return distanceFeet(lairEnt.pos, a.pos) - distanceFeet(lairEnt.pos, b.pos);
      })[0];
    if (!nearestPcEnt) return { st, narrative, fired: true };
    const targetCharIdx = st.characters.findIndex((c) => c.id === nearestPcEnt.id && !c.dead);
    if (targetCharIdx < 0) return { st, narrative, fired: true };
    const target = st.characters[targetCharIdx];
    const atkResult = applyEnemyAttackNarrative(legendary, target, context);
    narrative += ` ${atkResult.narrative}`;
    // Apply hp/condition changes from the attack. We deliberately skip the
    // full reaction-window pause path (Shield etc.) for legendary actions —
    // they're meant to be a fast follow-up beat, and re-entering the
    // reaction loop mid-legendary would tangle the resume coords.
    const newHp = Math.max(0, target.hp - atkResult.hpLost);
    const updatedTarget: Character = {
      ...target,
      hp: newHp,
      temp_hp: atkResult.newTempHp ?? target.temp_hp,
      conditions: atkResult.newConditions,
      condition_durations: atkResult.newDurations,
    };
    st = {
      ...st,
      characters: st.characters.map((c, i) => (i === targetCharIdx ? updatedTarget : c)),
      entities: (st.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
    return { st, narrative, fired: true };
  }
  return { st, narrative, fired: true };
}

// Refresh a legendary creature's action-point pool. Called when their own
// initiative slot comes up (handled in the enemy turn loop).
function refreshLegendaryPool(seed: Seed, enemyId: string): void {
  for (const [rk, list] of Object.entries(seed.enemies ?? {})) {
    const idx = list.findIndex((e) => e.id === enemyId);
    if (idx >= 0) {
      const enemy = list[idx];
      if (!enemy.legendary_actions?.length) return;
      const pool = enemy.legendary_pool ?? 3;
      seed.enemies[rk] = [
        ...list.slice(0, idx),
        { ...enemy, legendary_action_points: pool },
        ...list.slice(idx + 1),
      ];
      return;
    }
  }
}

function getEnemyById(seed: Seed, enemyId: string): Enemy | null {
  for (const list of Object.values(seed.enemies ?? {})) {
    const found = list.find((e) => e.id === enemyId);
    if (found) return found;
  }
  // NPC-as-enemy lookup: id is `npc:${roomId}`.
  if (enemyId.startsWith('npc:')) {
    const roomId = enemyId.slice('npc:'.length);
    const npc = seed.npcs?.[roomId];
    if (npc) return npcAsEnemy(npc);
  }
  return null;
}

function hasLivingEnemy(state: GameState, seed: Seed, roomId: string): boolean {
  return getLivingRoomEnemies(state, seed, roomId).length > 0;
}

function isRoomCleared(state: GameState, seed: Seed, roomId: string): boolean {
  const all = getRoomEnemies(seed, roomId);
  if (all.length === 0) return true;
  const killed = state.enemies_killed ?? [];
  return all.every((e) => killed.includes(e.id));
}

// ─── Initiative helpers ───────────────────────────────────────────────────────

type InitEntry = { id: string; roll: number; is_enemy: boolean };

function buildInitiativeOrder(chars: Character[], enemies: Enemy[]): InitEntry[] {
  const entries: InitEntry[] = [
    ...chars
      .filter((c) => !c.dead)
      .map((c) => ({
        id: c.id,
        roll: rollDice('1d20') + abilityMod(c.dex),
        is_enemy: false,
      })),
    ...enemies.map((enemy) => ({
      id: enemy.id,
      roll: rollDice('1d20') + abilityMod(enemy.dex ?? 10),
      is_enemy: true,
    })),
  ];
  // Sort descending by roll; ties broken by dex (enemy.dex vs char.dex)
  entries.sort((a, b) => b.roll - a.roll);
  return entries;
}

function endCombatState(st: GameState): GameState {
  return {
    ...st,
    combat_active: false,
    initiative_order: [],
    initiative_idx: 0,
    entities: undefined,
    movement_used: undefined,
    characters: st.characters.map((c) => ({
      ...c,
      turn_actions: { ...FRESH_TURN },
      // Rage ends when combat ends (PHB p.48)
      conditions: c.conditions.filter((cond) => cond !== 'raging'),
      condition_durations: Object.fromEntries(
        Object.entries(c.condition_durations ?? {}).filter(([k]) => k !== 'raging')
      ),
    })),
  };
}

// Encounter XP distribution — 2024 PHB / SRD 5.2.1 (Gaining XP, p.260):
// the XP from a defeated creature is divided equally among all party
// members who participated. Pansori's participation model is "alive when
// the kill resolved" — a downed/unconscious PC (hp = 0, dead = false)
// still gets their share; only truly-dead PCs (`dead === true`) are
// excluded. Truncation via floor matches RAW (no fractional XP).
//
// Returns the share each PC received and an updated state with the share
// applied to every eligible character EXCEPT the killer. Callers keep
// their local mutable `char` reference and add the returned `share` to
// `char.xp` themselves — that preserves the downstream-read patterns the
// kill blocks use (level-up check, narrative composition, etc.) without
// requiring a refresh-from-state round trip.
function splitEncounterXp(
  st: GameState,
  killerId: string,
  totalXp: number
): { st: GameState; share: number } {
  if (totalXp <= 0) return { st, share: 0 };
  const eligibleCount = st.characters.filter((c) => !c.dead).length;
  if (eligibleCount === 0) return { st, share: 0 };
  const share = Math.floor(totalXp / eligibleCount);
  if (share <= 0) return { st, share: 0 };
  return {
    st: {
      ...st,
      characters: st.characters.map((c) =>
        !c.dead && c.id !== killerId ? { ...c, xp: (c.xp || 0) + share } : c
      ),
    },
    share,
  };
}

// Apply a level-up to one character if their XP threshold is met.
// Mutates `char` in place. Returns the level-up narrative (empty if none).
// 2024 PHB Dwarven Toughness adds +1 max HP at each level up.
function applyLevelUpFromXp(char: Character, context: Context): string {
  if (char.dead) return '';
  if ((char.xp ?? 0) < (char.level ?? 1) * 100) return '';
  // Was the PC unconscious/dying at the moment XP crossed the threshold?
  // Mechanical level-up still applies (XP doesn't care about HP state, and
  // the HP gain may even revive them) but the heroic-flavor narrative
  // ("you have reached level N!") reads bizarrely for a prone, dying PC.
  // We suppress the flavor and emit a single quiet line instead.
  const wasDowned =
    char.hp <= 0 ||
    (char.conditions ?? []).includes('unconscious') ||
    (char.death_saves?.failures ?? 0) > 0;
  char.level += 1;
  const dwarfLvlBonus = char.species === 'dwarf' ? 1 : 0;
  const hpRoll =
    Math.max(1, rollDice(`1d${char.hit_die ?? 8}`) + abilityMod(char.con)) + dwarfLvlBonus;
  char.max_hp += hpRoll;
  char.hp = Math.min(char.hp + hpRoll, char.max_hp);
  char.spell_slots_max = getSpellSlotsForLevel(char.character_class, char.level, context);
  let out: string;
  if (wasDowned) {
    out = ` ${char.name} reaches level ${char.level} (+${hpRoll} HP, while unconscious).`;
  } else {
    const levelUpLine = pick(context.narratives.levelUp)
      .replace(/{level}/g, String(char.level))
      .replace(/{name}/g, char.name);
    out = ` ${char.name}: ${levelUpLine} (+${hpRoll} HP)`;
  }
  if ([4, 8, 12, 16, 19].includes(char.level)) {
    char.asi_pending = true;
    out += ` Level ${char.level}: choose an Ability Score Improvement!`;
  }
  return out;
}

// Check + apply level-ups for the entire living party after a kill.
// `killer` is mutated in place (callers expect to read `char.level` etc.);
// other party members are read+mutated through `st.characters` references
// that `splitEncounterXp` already replaced with fresh objects.
function applyPartyLevelUps(st: GameState, killer: Character, context: Context): string {
  let out = '';
  out += applyLevelUpFromXp(killer, context);
  for (const c of st.characters) {
    if (c.id === killer.id || c.dead) continue;
    out += applyLevelUpFromXp(c, context);
  }
  return out;
}

// Post-LLM fact-preservation check. The system prompt instructs the model
// to keep all numbers, damage values, outcomes, and named entities — but
// compliance isn't free. If the enhanced output drops a critical token
// from the input (a multi-digit number, a state word like "killed" /
// "downed" / "miss" / "hit"), we fall back to the raw narrative so the
// player isn't shown prose that misrepresents engine state.
//
// We deliberately only check for *dropped* facts, not *added* embellishment
// (prose flourish is the whole point of the LLM pass). Single-digit numbers
// are skipped because they're often grammatical artifacts ("1 round", "2
// turns") rather than mechanical facts.
export function preservesCriticalFacts(input: string, output: string): boolean {
  // Numbers: any 2+ digit sequence in input must appear in output.
  const inputNumbers = input.match(/\b\d{2,}\b/g) ?? [];
  for (const n of inputNumbers) {
    if (!output.includes(n)) return false;
  }
  // Outcome words: presence is binary — if input says "killed", output must too.
  const outcomeWords = ['killed', 'downed', 'critical', 'CRIT'];
  for (const w of outcomeWords) {
    if (input.includes(w) && !output.toLowerCase().includes(w.toLowerCase())) return false;
  }
  return true;
}

// Fiend Warlock — Dark One's Blessing (PHB p.108): when you reduce a hostile
// creature to 0 HP, gain temp HP = CHA mod + warlock level (min 1).
function grantDarkOnesBlessing(char: Character): string {
  if (char.character_class.toLowerCase() !== 'warlock' || char.subclass !== 'fiend') return '';
  const grant = Math.max(1, char.level + abilityMod(char.cha));
  const prev = char.temp_hp ?? 0;
  if (grant > prev) char.temp_hp = grant;
  return ` 🔥 Dark One's Blessing: ${char.name} gains ${grant} temp HP.`;
}

// ─── Rest helper ──────────────────────────────────────────────────────────────

export function canRestInRoom(state: GameState, seed: Seed): boolean {
  const room = seed.rooms.find((r) => r.id === state.current_room);
  if (room?.canRest === false) return false;
  return !hasLivingEnemy(state, seed, state.current_room);
}

// ─── Trap helpers ─────────────────────────────────────────────────────────────

function getRoomTrap(roomId: string, seed: Seed, context: Context): Trap | null {
  // Traps are defined on Room objects inside the campaign or room pool
  const campaignRoom = context.campaign?.rooms?.find((r) => r.id === roomId);
  if (campaignRoom?.trap) return campaignRoom.trap;
  const seedRoom = seed.rooms?.find((r) => r.id === roomId);
  if (seedRoom?.trap) return seedRoom.trap;
  return null;
}

function trapSpent(state: GameState, roomId: string): boolean {
  return (
    (state.traps_triggered ?? []).includes(roomId) || (state.traps_disarmed ?? []).includes(roomId)
  );
}

function partyDetectsTrap(characters: Character[], trap: Trap): boolean {
  return characters.some((c) => {
    if (c.dead) return false;
    const proficient = c.skill_proficiencies?.includes('Perception') ?? false;
    return passivePerception(c.wis, c.level, proficient) >= trap.dc;
  });
}

// ─── Spell helpers ────────────────────────────────────────────────────────────

function getSpellSlotsForLevel(
  className: string,
  level: number,
  context: Context
): Record<number, number> {
  return context.classSpellSlots?.[className]?.[level - 1] ?? {};
}

// ─── Backward-compatibility normalizer ───────────────────────────────────────

// Backfill Character.owner_user_id for pre-multiplayer saves. New sessions
// set owner_user_id at character creation (every PC = host). Existing
// sessions stored before MP shipped have no owner field — every PC there
// gets the session's host user id. Called by routes/game.ts right after
// normalizeState; idempotent (only writes when the field is missing).
export function backfillOwnership(state: GameState, hostUserId: string): GameState {
  let mutated = false;
  const characters = state.characters.map((c) => {
    if (c.owner_user_id) return c;
    mutated = true;
    return { ...c, owner_user_id: hostUserId };
  });
  return mutated ? { ...state, characters } : state;
}

export function normalizeState(raw: Record<string, unknown>): GameState {
  // Already new format — patch any fields added after initial rollout
  if (Array.isArray((raw as unknown as GameState).characters)) {
    const gs = raw as unknown as GameState;
    return {
      ...gs,
      short_rested_rooms: gs.short_rested_rooms ?? [],
      long_rested: gs.long_rested ?? false,
      npc_attitudes: gs.npc_attitudes ?? {},
      npc_talked: gs.npc_talked ?? [],
      traps_triggered: gs.traps_triggered ?? [],
      traps_disarmed: gs.traps_disarmed ?? [],
      objects_searched: gs.objects_searched ?? [],
      seen_choices: gs.seen_choices ?? [],
      characters: gs.characters.map((c) => {
        const existingSlots = c.spell_slots_max ?? {};
        const slotsMax =
          Object.keys(existingSlots).length > 0
            ? existingSlots
            : spellSlotsForClassLevel(c.character_class, c.level ?? 1);
        return {
          ...c,
          hit_die: c.hit_die ?? 8,
          hit_dice_remaining: c.hit_dice_remaining ?? c.level ?? 1,
          condition_durations: c.condition_durations ?? {},
          class_resource_uses: c.class_resource_uses ?? {},
          asi_pending: c.asi_pending ?? false,
          exhaustion_level: c.exhaustion_level ?? 0,
          spell_slots_max: slotsMax,
          spell_slots_used: c.spell_slots_used ?? {},
          spells_known: c.spells_known ?? [],
          background_id: c.background_id ?? null,
          skill_proficiencies: c.skill_proficiencies ?? [],
          tool_proficiencies: c.tool_proficiencies ?? [],
          armor_proficiencies: c.armor_proficiencies ?? [],
          weapon_proficiencies: c.weapon_proficiencies ?? [],
          attuned_items: c.attuned_items ?? ([] as string[]),
        };
      }),
    };
  }

  const charId = randomUUID();
  const level = Number(raw.level ?? 1);
  const char: Character = {
    id: charId,
    name: String(raw.character_name ?? 'Hero'),
    character_class: String(raw.character_class ?? 'Adventurer'),
    portrait_url: (raw.portrait_url as string | null | undefined) ?? null,
    hp: Number(raw.hp ?? 20),
    max_hp: Number(raw.max_hp ?? 20),
    ac: Number(raw.ac ?? 10),
    str: Number(raw.str ?? 10),
    dex: Number(raw.dex ?? 10),
    con: Number(raw.con ?? 10),
    int: Number(raw.int ?? 10),
    wis: Number(raw.wis ?? 10),
    cha: Number(raw.cha ?? 10),
    xp: Number(raw.xp ?? 0),
    level,
    gold: Number(raw.gold ?? 5),
    inventory: (raw.inventory as InventoryItem[]) ?? [],
    equipped_weapon: (raw.equipped_weapon as string | null) ?? null,
    equipped_armor: (raw.equipped_armor as string | null) ?? null,
    equipped_shield: (raw.equipped_shield as string | null) ?? null,
    conditions: (raw.conditions as string[]) ?? [],
    condition_durations: (raw.condition_durations as Record<string, number>) ?? {},
    death_saves: (raw.death_saves as DeathSaves) ?? { successes: 0, failures: 0 },
    stable: Boolean(raw.stable),
    dead: Boolean(raw.dead),
    turn_actions: (raw.turn_actions as TurnActions) ?? { ...FRESH_TURN },
    initiative_roll: null,
    hit_die: 8,
    hit_dice_remaining: level,
    class_resource_uses: {},
    asi_pending: false,
    exhaustion_level: 0,
    spell_slots_max: {},
    spell_slots_used: {},
    spells_known: [],
    background_id: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    armor_proficiencies: [],
    weapon_proficiencies: [],
    attuned_items: [] as string[],
  };
  const oldRunLog = (raw.run_log as Array<{ action: string; narrative: string }>) ?? [];
  return {
    characters: [char],
    active_character_id: charId,
    current_room: String(raw.current_room ?? ''),
    visited_rooms: (raw.visited_rooms as string[]) ?? [],
    enemies_killed: (raw.enemies_killed as string[]) ?? [],
    loot_taken: (raw.loot_taken as string[]) ?? [],
    combat_active: Boolean(raw.combat_active),
    initiative_order: [],
    initiative_idx: 0,
    run_log: oldRunLog.map((e) => ({
      character_id: charId,
      action: e.action,
      narrative: e.narrative,
    })),
    room_log: (raw.room_log as string[]) ?? [],
    last_choices: undefined,
    short_rested_rooms: [],
    long_rested: false,
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: (raw.flags as Record<string, boolean | string | number>) ?? {},
  };
}

// ─── Arrival narrative ────────────────────────────────────────────────────────

export function buildArrivalNarrative(
  targetId: string,
  state: GameState,
  seed: Seed,
  context: Context
): string {
  const templates = context.narratives.roomArrival[targetId] || context.narratives.genericArrival;
  let text = pick(templates).replace(/{world}/g, getWorldName(seed));

  const exitNames = (seed.connections[targetId] ?? [])
    .map((id) => seed.rooms.find((r) => r.id === id)?.name)
    .filter((n): n is string => Boolean(n))
    .join(', ');
  if (exitNames) text += ` Exits: ${exitNames}.`;

  const livingHere = getLivingRoomEnemies(state, seed, targetId);
  if (livingHere.length > 0) {
    const parts = livingHere.map((enemy) => {
      const hp = state.entities?.find((e) => e.id === enemy.id && e.isEnemy)?.hp ?? enemy.hp;
      return `${enemy.name} (HP ${hp}, AC ${enemy.ac})`;
    });
    text += ` Hostile here: ${parts.join(', ')}.`;
  }
  // (Previously: an else-branch appended `alreadyDead` pool text on
  // revisits to cleared rooms. The pool only contains attack-rejection
  // flavor like "That foe is already defeated.", which read as a stale
  // error message rather than re-entry flavor — see Vale playthrough
  // log, 2026-05-21. Cleared rooms now just rely on exits + loot for
  // their narrative cues.)
  const newLoot = seed.loot?.[targetId];
  if (newLoot && !state.loot_taken.includes(targetId)) {
    text += ` You spot a ${newLoot.name} on the ground.`;
  }

  // Passive trap detection (5e DMG ch.5)
  const trap = getRoomTrap(targetId, seed, context);
  if (trap && !trapSpent(state, targetId)) {
    if (partyDetectsTrap(state.characters, trap)) {
      text += ' ' + trap.detectNarrative;
    }
    // If not detected, trap fires silently on next action — handled in takeAction
  }

  return text;
}

// ─── NPC helpers ─────────────────────────────────────────────────────────────

export function getNpcAttitude(state: GameState, npc: PlacedNpc): NpcAttitude {
  return state.npc_attitudes?.[npc.roomId] ?? npc.attitude;
}

export function npcIsKilled(state: GameState, roomId: string): boolean {
  return !!(
    state.npc_attitudes?.[roomId] === 'hostile' && state.enemies_killed?.includes(`npc:${roomId}`)
  );
}

// ─── Choice generation ────────────────────────────────────────────────────────

// Stable key for choice-dimming. Returns a string for choices the player
// benefits from seeing dimmed after one use; returns undefined for
// repeatable/transient choices (movement, combat verbs, inventory).
//
// Room-scoped action types (interact_object, examine, loot, talk_response)
// fold the current room id into the key so two physically distinct
// same-template objects (e.g. two crypts each with a "dirty_chest") get
// distinct keys. talk_response also includes the npc id from the active
// room so two NPCs sharing a response index don't collide.
export function seenKeyForAction(action: StructuredAction, state: GameState): string | undefined {
  const room = state.current_room;
  switch (action.type) {
    case 'talk_response':
      return `talk_response::${room}::${action.responseIdx}`;
    case 'interact_object':
      return `interact_object::${room}::${action.objectId}`;
    case 'accept_quest':
      return `accept_quest::${action.questId}`;
    case 'examine':
      return `examine::${room}`;
    case 'loot':
      return `loot::${room}`;
    default:
      return undefined;
  }
}

export function generateChoices(state: GameState, seed: Seed, context: Context): GameChoice[] {
  const char =
    state.characters.find((c) => c.id === state.active_character_id) ?? state.characters[0];
  if (!char) return [];

  if (char.dead) return [];

  // Reaction window — only offer reaction-resolution choices until the
  // player decides. Suppresses everything else (attacks, movement, etc.).
  const pending = state.pending_reaction;
  if (pending && pending.eligibleCharIds.includes(char.id)) {
    const enemyForLabel =
      seed.enemies?.[state.current_room]?.find((e) => e.id === pending.attackerEnemyId)?.name ??
      'attacker';
    if (pending.kind === 'shield') {
      return [
        {
          label: `Cast Shield (reaction, 1st-level slot) — +5 AC, ${enemyForLabel}'s attack (total ${pending.atkTotal} vs AC ${pending.targetAcAtAttack}) misses!`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — take the hit (${pending.pendingDamage} damage)`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'hellish_rebuke') {
      const dc = 8 + profBonus(char.level) + abilityMod(char.cha);
      const isTieflingInnate =
        char.species === 'tiefling' &&
        char.level >= 3 &&
        !char.class_resource_uses?.tiefling_rebuke_used;
      const costLabel = isTieflingInnate
        ? 'Infernal Legacy, 1/long rest'
        : 'reaction, 1st-level slot';
      return [
        {
          label: `Cast Hellish Rebuke (${costLabel}) — 2d10 fire on ${enemyForLabel} (DEX save DC ${dc} for half)`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — let the attack stand`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
    if (pending.kind === 'counterspell') {
      // Auto-counter when the slot level ≥ the enemy spell's level (which
      // for Counterspell-base means level ≤ 3). Higher-level enemy spells
      // need an ability check; we surface both label variants for clarity.
      const autoCounter = pending.enemySpellLevel <= 3;
      const cs = autoCounter
        ? `auto-counter`
        : `ability check vs DC ${10 + pending.enemySpellLevel}`;
      return [
        {
          label: `Cast Counterspell (reaction, 3rd-level slot) — interrupt ${enemyForLabel}'s ${pending.enemySpellName} (${cs})`,
          action: { type: 'resolve_reaction', accept: true },
        },
        {
          label: `Decline — let ${pending.enemySpellName} resolve`,
          action: { type: 'resolve_reaction', accept: false },
        },
      ];
    }
  }

  // Pending ASI: only show stat-boost choices until resolved
  if (char.asi_pending) {
    const statLabels: Record<string, string> = {
      str: 'STR',
      dex: 'DEX',
      con: 'CON',
      int: 'INT',
      wis: 'WIS',
      cha: 'CHA',
    };
    return (Object.keys(statLabels) as AbilityKey[]).map((stat) => ({
      label: `Ability Score Improvement: +2 ${statLabels[stat]} (currently ${char[stat]})`,
      action: { type: 'apply_asi' as const, stat },
    }));
  }

  const healItems = context.lootTable.filter((i) => i.heal);
  const healItem = char.inventory?.find((i) => healItems.find((h) => h.id === i.id));

  if (char.hp <= 0 && !char.stable)
    return [{ label: 'Roll death saving throw', action: { type: 'death_save' } }];
  if (char.hp <= 0 && char.stable)
    return [{ label: 'Use healing item', action: { type: 'use', itemId: healItem?.id ?? '' } }];

  // Surprised on round 1: entity cannot act (PHB p.189)
  if (state.combat_active && (state.surprised ?? []).includes(char.id)) {
    return [{ label: 'SURPRISED — cannot act this round (pass)', action: { type: 'pass' } }];
  }

  // Stunned / paralyzed / incapacitated / petrified: cannot take actions, bonus actions, reactions, or move
  const isIncapacitated = char.conditions.some((c) =>
    ['stunned', 'paralyzed', 'incapacitated', 'petrified'].includes(c)
  );
  if (isIncapacitated) {
    const cond = (
      char.conditions.find((c) =>
        ['stunned', 'paralyzed', 'incapacitated', 'petrified'].includes(c)
      ) ?? 'stunned'
    ).toUpperCase();
    return [{ label: `${cond} — cannot act this turn (pass)`, action: { type: 'pass' } }];
  }

  const choices: GameChoice[] = [];
  const roomId = state.current_room;
  const livingEnemies = getLivingRoomEnemies(state, seed, roomId).filter((e) => {
    const ent = state.entities?.find((ent) => ent.id === e.id && ent.isEnemy);
    return ent ? ent.hp > 0 : true;
  });
  const enemyAlive = livingEnemies.length > 0;
  const loot = seed.loot?.[roomId];
  const lootAvail = loot && !state.loot_taken?.includes(roomId);
  const adjacent = (seed.connections[roomId] || [])
    .map((id) => seed.rooms.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Trap: offer disarm if trap is detected (party passive Perception beat the DC) but not yet spent
  const roomTrap = getRoomTrap(roomId, seed, context);
  if (roomTrap && !trapSpent(state, roomId) && partyDetectsTrap(state.characters, roomTrap)) {
    choices.push({
      label: `Disarm Trap — DEX check (DC ${roomTrap.dc})`,
      action: { type: 'disarm_trap' },
    });
  }

  if (state.current_room === context.escapeRoomId && !enemyAlive) {
    choices.push({ label: context.escapeChoiceText, action: { type: 'escape' } });
  }
  // Attack is the Action (PHB p.192). Don't offer it once the action is spent —
  // an unintended click on a stale Attack choice would otherwise pass through
  // the post-action auto-advance and end the turn (e.g. an out-of-range
  // attempt that should be a no-op).
  if (enemyAlive && (!state.combat_active || !char.turn_actions.action_used)) {
    if (livingEnemies.length === 1) {
      choices.push({
        label: `Attack the ${livingEnemies[0].name}`,
        action: { type: 'attack', targetEnemyId: livingEnemies[0].id },
        kind: 'attack',
      });
    } else {
      // Disambiguate when there are multiple enemies of (possibly) the same name
      const nameCounts = livingEnemies.reduce<Record<string, number>>((acc, e) => {
        acc[e.name] = (acc[e.name] ?? 0) + 1;
        return acc;
      }, {});
      const seen: Record<string, number> = {};
      for (const en of livingEnemies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const suffix =
          nameCounts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
        const ent = state.entities?.find((e) => e.id === en.id && e.isEnemy);
        const hpNote = ent ? ` (HP ${ent.hp}/${ent.maxHp})` : '';
        choices.push({
          label: `Attack ${en.name}${suffix}${hpNote}`,
          action: { type: 'attack', targetEnemyId: en.id },
          kind: 'attack',
        });
      }
    }
  }
  // Loot is suppressed while a hostile is in the room — RAW: you don't get
  // to casually pocket items with a Crypt Ghoul watching. Engage or escape
  // first. Mirrors the same author intent already enforced on Move-between-
  // rooms at the bottom of generateChoices.
  if (lootAvail && !enemyAlive) {
    choices.push({ label: `Pick up the ${loot.name}`, action: { type: 'loot' } });
  }
  // SRD 5.2.1 p.204: drinking/administering a potion is a Bonus Action. In
  // combat, suppress the choice if the bonus action is already spent.
  const potionBonusAvailable = !state.combat_active || !char.turn_actions.bonus_action_used;
  if (healItem && potionBonusAvailable && (!MAX_CHOICES || choices.length < MAX_CHOICES)) {
    const injured = state.characters.filter((c) => !c.dead && c.hp < c.max_hp);
    if (injured.length > 0) {
      if (state.characters.filter((c) => !c.dead).length === 1) {
        // Solo party: simple label, no target needed
        choices.push({
          label: `Use ${healItem.name} (bonus action)`,
          action: { type: 'use', itemId: healItem.id },
          requiresBonusAction: state.combat_active || undefined,
        });
      } else {
        // Multi-character: one choice per injured party member
        for (const member of injured) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const selfNote = member.id === char.id ? ' (self)' : '';
          choices.push({
            label: `Use ${healItem.name} on ${member.name}${selfNote} (bonus action, HP ${member.hp}/${member.max_hp})`,
            action: { type: 'use', itemId: healItem.id, targetCharId: member.id },
            requiresBonusAction: state.combat_active || undefined,
          });
        }
      }
    }
  }
  // Rest choices — only when no alive enemy in room and room allows it
  if (!state.combat_active && canRestInRoom(state, seed)) {
    const alreadyShortRested = (state.short_rested_rooms ?? []).includes(roomId);
    if (!alreadyShortRested && char.hit_dice_remaining > 0 && char.hp < char.max_hp) {
      choices.push({
        label: `Short Rest — spend a hit die (d${char.hit_die ?? 8}), ${char.hit_dice_remaining} remaining`,
        action: { type: 'short_rest' },
      });
    }
    if (!(state.long_rested ?? false)) {
      choices.push({
        label: 'Long Rest — full recovery (once per session)',
        action: { type: 'long_rest' },
      });
    }
  }
  // Interactive object choices — once per object, collapsed into a single Interact action.
  // Out of combat: anyone can interact (consumes main action).
  // In combat: only Thief Rogue L3+ via Fast Hands (consumes bonus action).
  const currentRoom = seed.rooms.find((r) => r.id === roomId);
  const isThiefFastHands =
    char.character_class.toLowerCase() === 'rogue' && char.subclass === 'thief' && char.level >= 3;
  const canInteractObjects =
    currentRoom?.objects?.length &&
    (!enemyAlive ||
      (isThiefFastHands && state.combat_active && !char.turn_actions.bonus_action_used));
  if (canInteractObjects && currentRoom?.objects) {
    const useBonus = enemyAlive && isThiefFastHands;
    for (const obj of currentRoom.objects) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const searchKey = `${roomId}:${obj.id}`;
      const alreadySearched = (state.objects_searched ?? []).includes(searchKey);
      if (!alreadySearched) {
        choices.push({
          label: useBonus
            ? `Fast Hands: Interact with ${obj.name} — bonus action`
            : `Interact with ${obj.name}`,
          action: { type: 'interact_object', objectId: obj.id },
          requiresBonusAction: useBonus || undefined,
        });
      }
    }
  }

  // NPC choices — only for non-hostile NPCs. Hostile NPCs surface as enemies
  // via getLivingRoomEnemies and use the regular Attack choice above.
  const npc = seed.npcs?.[roomId];
  if (npc && !npcIsKilled(state, roomId) && !enemyAlive) {
    const attitude = getNpcAttitude(state, npc);
    // attitude is guaranteed non-hostile here (hostile NPCs would have set
    // enemyAlive = true via getLivingRoomEnemies).
    const giverQuests = (context.campaign?.quests ?? []).filter((q) => q.giverNpcId === npc.id);
    const progressById = new Map((state.quest_progress ?? []).map((p) => [p.questId, p] as const));
    const availableQuests = giverQuests.filter((q) => !progressById.has(q.id));
    const questNote = availableQuests.length > 0 ? ' [!]' : '';
    const dcNote = attitude === 'indifferent' ? ` (CHA check DC ${npc.persuasionDC ?? 12})` : '';
    choices.push({
      label: `Talk to ${npc.name}${dcNote}${questNote}`,
      action: { type: 'talk' },
    });
    // Dialogue responses become clickable once the party has greeted
    // the NPC. The `talk` handler surfaces "[1. X | 2. Y | 3. Z]" in
    // the narrative; without these matching choices the player saw
    // the prompt but had no button to click it. The numbered label
    // mirrors the inline hint so the player can match prompts to
    // actions at a glance.
    if (
      (state.npc_talked ?? []).includes(roomId) &&
      attitude !== 'indifferent' &&
      npc.responses?.length
    ) {
      for (let i = 0; i < npc.responses.length; i++) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const resp = npc.responses[i];
        // Stage-direction format: the button reads as the party
        // speaking TO the NPC, not the NPC saying it.
        choices.push({
          label: `<To ${npc.name}> ${resp.label}`,
          action: { type: 'talk_response', responseIdx: i },
        });
      }
    }
    // The explicit "Accept quest" choice is gone — quests auto-activate
    // when their first step matches (typically a talk_response in the
    // giver's room). The route handler surfaces "✦ Quest accepted —"
    // narrative when this fires. The `accept_quest` action handler is
    // retained for backward compatibility with stale FE caches.
    if (npc.shop?.length && attitude === 'friendly') {
      // Faction-aware pricing — if the NPC is tagged with a factionId and the
      // campaign defines that faction's shopPriceModifiers, the displayed and
      // charged price scales with the party's current rep with that faction.
      // (campaignEngine.factionShopPrice, PHB-style faction reputation.)
      const faction = npc.factionId
        ? context.campaign?.factions?.find((f) => f.id === npc.factionId)
        : undefined;
      const rep = npc.factionId ? (state.faction_rep?.[npc.factionId] ?? 0) : 0;
      for (const entry of npc.shop) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const item = context.lootTable.find((l) => l.id === entry.itemId);
        if (item) {
          const price = faction ? factionShopPrice(entry.price, rep, faction) : entry.price;
          const repNote =
            faction && price !== entry.price
              ? ` (${faction.name} ${price < entry.price ? 'discount' : 'markup'} from ${entry.price})`
              : '';
          choices.push({
            label: `Buy ${item.name} — ${price}cr${repNote}`,
            action: { type: 'buy', itemId: entry.itemId, price },
          });
        }
      }
    }
    // Initial attack triggers hostility + combat (handler flips attitude and
    // dispatches a regular Attack against the NPC-as-enemy).
    choices.push({ label: `Attack ${npc.name} (makes hostile)`, action: { type: 'attack_npc' } });
  }

  // ── Town/district navigation choices ──────────────────────────────────────
  // Emit travel choices for connected locations (out of combat only, and not
  // with a hostile in the current room — RAW egress rule).
  if (!state.combat_active && !enemyAlive && state.current_location_id) {
    const here = context.campaign?.locations?.find((l) => l.id === state.current_location_id);
    for (const connId of here?.connections ?? []) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const dest = context.campaign?.locations?.find((l) => l.id === connId);
      if (!dest) continue;
      choices.push({
        label: `Travel to ${dest.name}`,
        action: { type: 'travel', locationId: dest.id },
      });
    }
    // District navigation: when in a town and no specific district selected, list districts
    if (here?.districts?.length && !state.current_district_id) {
      for (const d of here.districts) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Enter ${d.name}`,
          action: { type: 'enter_district', districtId: d.id },
        });
      }
    }
  }
  // ── Combat action economy choices ─────────────────────────────────────────
  if (state.combat_active && !char.turn_actions.action_used) {
    // Dash
    choices.push({
      label: `Dash — double movement this turn (${effectiveSpeed(char)} extra ft)`,
      action: { type: 'dash' },
      kind: 'dash',
    });
    // Help — RAW (PHB p.192): to grant advantage on an ally's attack, an enemy
    // must be within 5 ft of the helper. Without grid entities this gate can't
    // be enforced, so we conservatively only show the choice when the helper
    // has an adjacent enemy.
    const helperEnt = state.entities?.find((e) => e.id === char.id);
    const hasAdjacentEnemy =
      helperEnt &&
      state.entities?.some((e) => e.isEnemy && e.hp > 0 && distanceFeet(helperEnt.pos, e.pos) <= 5);
    if (hasAdjacentEnemy) {
      const aliveAllies = state.characters.filter((c) => !c.dead && c.id !== char.id);
      for (const ally of aliveAllies) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Help ${ally.name} — give advantage on their next attack`,
          action: { type: 'help', targetId: ally.id },
        });
      }
    }
    // Ready
    if (enemyAlive) {
      choices.push({
        label: `Ready an action — set trigger and action to store`,
        action: {
          type: 'ready',
          trigger: 'enemy attacks',
          action: { type: 'attack', targetEnemyId: livingEnemies[0].id },
        },
        kind: 'ready',
      });
    }
  }

  // Use Reaction (trigger readied action) — shown when readied_action is set and reaction not yet used
  if (state.combat_active && !char.turn_actions.reaction_used && char.turn_actions.readied_action) {
    choices.push({
      label: `Trigger readied action: "${char.turn_actions.readied_action.trigger}"`,
      action: { type: 'use_reaction' },
    });
  }

  // ── Subclass selection ─────────────────────────────────────────────────────
  if (!char.subclass) {
    const cls = char.character_class.toLowerCase();
    const subclassLevels: Record<string, number> = {
      fighter: 3,
      rogue: 3,
      wizard: 2,
      cleric: 1,
      ranger: 3,
      paladin: 3,
      bard: 3,
      druid: 2,
      sorcerer: 1,
      warlock: 1,
      monk: 3,
      barbarian: 3,
    };
    const subclassChoices: Record<string, string[]> = {
      fighter: ['champion', 'battle_master'],
      rogue: ['thief', 'assassin'],
      wizard: ['evoker', 'abjurer'],
      cleric: ['life', 'war'],
      ranger: ['hunter', 'beastmaster'],
      paladin: ['devotion', 'vengeance'],
      bard: ['lore', 'valor'],
      sorcerer: ['draconic', 'wild_magic'],
      warlock: ['fiend', 'archfey'],
      druid: ['land', 'moon'],
      monk: ['open_hand', 'shadow'],
      barbarian: ['berserker', 'totem_warrior'],
    };
    const reqLevel = subclassLevels[cls] ?? 3;
    // RAW: subclass is acquired at level-up (a long-rest milestone), not as an
    // in-combat action. Gating to !combat_active keeps the pick from getting
    // caught in the post-action auto-advance and from looking like it costs
    // an action.
    if (!state.combat_active && char.level >= reqLevel && subclassChoices[cls]) {
      for (const sc of subclassChoices[cls]) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        choices.push({
          label: `Choose subclass: ${sc.replace(/_/g, ' ')}`,
          action: { type: 'select_subclass', subclass: sc },
        });
      }
    }
  }

  // ── Prepare spells (out of combat, prep-class only) ────────────────────────
  if (!state.combat_active) {
    const prepClasses = ['cleric', 'paladin', 'druid'];
    if (
      prepClasses.includes(char.character_class.toLowerCase()) &&
      (char.spells_known ?? []).length > 0
    ) {
      const cap = preparedSpellsCap(char, context);
      // Cantrips are always known, not prepared (PHB p.234) — exclude
      // them from the auto-prep list and from the cap math so the
      // player doesn't burn a prep slot on Sacred Flame.
      const known = (char.spells_known ?? []).filter(
        (id) => (context.spellTable?.[id]?.level ?? 0) > 0
      );
      // Clamp to the cap so the action always succeeds — picking which N
      // is a future UX, but auto-prep of the first N is far better than
      // a choice that always errors out.
      choices.push({
        label: `Prepare spells — ${Math.min(known.length, cap)} of ${known.length} known (max ${cap})`,
        action: { type: 'prepare_spells', spellIds: known.slice(0, cap) },
      });
    }
  }

  // Class feature bonus actions — shown only during combat while bonus action is still available
  if (state.combat_active && !char.turn_actions.bonus_action_used) {
    const features = context.classFeatures?.[char.character_class] ?? [];
    if (features.includes('rage') && !char.conditions.includes('raging')) {
      const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(char.level);
      if (rageUses > 0) {
        choices.push({
          label: `Rage — bonus action (${rageUses} use${rageUses === 1 ? '' : 's'} left)`,
          action: { type: 'use_class_feature', featureId: 'rage' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // Path of the Berserker — Frenzy (PHB p.49): while raging, make a
    // single melee weapon attack as a bonus action each turn. RAW also
    // imposes exhaustion when the rage ends; deferred to keep MVP scope.
    if (
      char.subclass === 'berserker' &&
      char.character_class.toLowerCase() === 'barbarian' &&
      char.conditions.includes('raging') &&
      enemyAlive
    ) {
      choices.push({
        label: `Frenzy — bonus melee attack (Berserker)`,
        action: { type: 'use_class_feature', featureId: 'frenzy_attack' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Fighter L9 — Tactical Master (2024 PHB). Pre-arm a mastery swap so the
    // next attack uses Push/Sap/Slow regardless of the weapon's actual
    // mastery. Available once per attack; cleared when the attack resolves.
    if (
      char.character_class.toLowerCase() === 'fighter' &&
      char.level >= 9 &&
      state.combat_active &&
      !char.turn_actions.tactical_master_mastery &&
      enemyAlive
    ) {
      for (const m of ['push', 'sap', 'slow'] as const) {
        choices.push({
          label: `Tactical Master — swap next attack's mastery to ${m.toUpperCase()}`,
          action: { type: 'use_class_feature', featureId: `tactical_master_${m}` },
          kind: 'class_feature',
        });
      }
    }

    // 2024 PHB Dragonborn — Breath Weapon. Action; 15-ft cone; DEX save
    // for half. Damage scales with level (1d10/2d10/3d10/4d10 at L1/5/11/17).
    // 1/short rest, tracked via class_resource_uses.breath_weapon_used.
    if (
      char.species === 'dragonborn' &&
      state.combat_active &&
      enemyAlive &&
      !char.class_resource_uses?.breath_weapon_used
    ) {
      const breathDice = char.level >= 17 ? 4 : char.level >= 11 ? 3 : char.level >= 5 ? 2 : 1;
      choices.push({
        label: `Breath Weapon — 15-ft cone, ${breathDice}d10 fire, DEX save (1/short rest)`,
        action: { type: 'use_class_feature', featureId: 'breath_weapon' },
        kind: 'class_feature',
      });
    }

    // 2024 PHB Goliath — Large Form. Bonus action; become Large for ~10
    // rounds (1 min RAW), +10 ft speed and advantage on STR ability checks
    // while active. 1/short rest. Tracked via `large_form` condition.
    if (
      char.species === 'goliath' &&
      state.combat_active &&
      !char.class_resource_uses?.large_form_used &&
      !char.conditions.includes('large_form') &&
      !char.turn_actions.bonus_action_used
    ) {
      choices.push({
        label: 'Large Form — become Large for 10 rounds: +10 ft speed, adv on STR (1/short rest)',
        action: { type: 'use_class_feature', featureId: 'large_form' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // 2024 PHB Orc — Adrenaline Rush. Bonus action: take the Dash action
    // (refund full speed worth of movement) and gain temp HP equal to your
    // proficiency bonus. 1/short rest.
    if (
      char.species === 'orc' &&
      state.combat_active &&
      !char.class_resource_uses?.adrenaline_rush_used &&
      !char.turn_actions.bonus_action_used
    ) {
      const tempHpGrant = profBonus(char.level);
      choices.push({
        label: `Adrenaline Rush — bonus action Dash + ${tempHpGrant} temp HP (1/short rest)`,
        action: { type: 'use_class_feature', featureId: 'adrenaline_rush' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // Fighter: Second Wind (bonus action). 2024 PHB has multi-use scaling:
    // 2 uses at L1, 3 at L4, 4 at L10. All recover on a short or long rest.
    if (char.character_class.toLowerCase() === 'fighter') {
      const secondWindMax = char.level >= 10 ? 4 : char.level >= 4 ? 3 : 2;
      const secondWindUsed = char.class_resource_uses?.second_wind ?? 0;
      const secondWindLeft = secondWindMax - secondWindUsed;
      if (secondWindLeft > 0) {
        choices.push({
          label: `Second Wind — bonus action: heal 1d10+${char.level} HP (${secondWindLeft}/${secondWindMax} left)`,
          action: { type: 'use_class_feature', featureId: 'second_wind' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // Rogue L2+: Cunning Action (bonus action options)
    if (char.character_class.toLowerCase() === 'rogue' && char.level >= 2) {
      choices.push({
        label: 'Cunning Action: Dash — extra movement as bonus action',
        action: { type: 'use_class_feature', featureId: 'cunning_action_dash' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
      choices.push({
        label: 'Cunning Action: Disengage — no OA this turn as bonus action',
        action: { type: 'use_class_feature', featureId: 'cunning_action_disengage' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
      choices.push({
        label: 'Cunning Action: Hide — stealth check as bonus action',
        action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
        kind: 'class_feature',
        requiresBonusAction: true,
      });
    }

    // 2024 PHB Rogue L5+: Cunning Strike. Pre-commit an effect that fires
    // on the next Sneak Attack hit. Each effect costs 1 SA die (subtracted
    // from the SA damage roll). Setting a Cunning Strike is free — no
    // action cost.
    if (
      char.character_class.toLowerCase() === 'rogue' &&
      char.level >= 5 &&
      !char.turn_actions.action_used &&
      !char.turn_actions.cunning_strike_pending &&
      enemyAlive
    ) {
      choices.push({
        label: 'Cunning Strike: Trip — DEX save or prone on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_trip' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Poison — CON save or poisoned on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_poison' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Withdraw — move half speed without OAs on hit (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_withdraw' },
        kind: 'class_feature',
      });
      choices.push({
        label: 'Cunning Strike: Disarm — drop target damage by ~2 on Sneak Attack (costs 1 SA die)',
        action: { type: 'use_class_feature', featureId: 'cunning_strike_disarm' },
        kind: 'class_feature',
      });
    }

    // Bard: Bardic Inspiration (bonus action)
    if (char.character_class.toLowerCase() === 'bard') {
      const biUses =
        char.class_resource_uses?.bardic_inspiration ??
        Math.max(1, Math.floor(((char.cha ?? 10) - 10) / 2));
      const inspDie =
        char.level >= 15 ? 'd12' : char.level >= 10 ? 'd10' : char.level >= 5 ? 'd8' : 'd6';
      if (biUses > 0) {
        choices.push({
          label: `Bardic Inspiration — give ally a ${inspDie} die (${biUses} left)`,
          action: { type: 'use_class_feature', featureId: 'bardic_inspiration' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }
  }

  // Fighter: Action Surge — shown in combat when not yet used
  if (
    state.combat_active &&
    char.character_class.toLowerCase() === 'fighter' &&
    char.level >= 2 &&
    !char.class_resource_uses?.action_surge
  ) {
    choices.push({
      label: `Action Surge — gain one extra action this turn`,
      action: { type: 'use_class_feature', featureId: 'action_surge' },
      kind: 'class_feature',
    });
  }

  // Barbarian: Reckless Attack (PHB p.49) — RAW costs nothing; it's a free
  // declaration made before the first attack on your turn. Advantage on STR
  // melee, but enemies have advantage attacking you until your next turn.
  // Must be available regardless of bonus-action state.
  if (
    state.combat_active &&
    char.character_class.toLowerCase() === 'barbarian' &&
    char.level >= 2 &&
    !char.turn_actions.reckless &&
    !char.turn_actions.action_used
  ) {
    choices.push({
      label:
        'Reckless Attack — advantage on STR melee this turn (enemies get advantage vs you too)',
      action: { type: 'use_class_feature', featureId: 'reckless_attack' },
      kind: 'class_feature',
    });
  }

  // ── Monk choices ────────────────────────────────────────────────────────────
  // 2024 PHB renames Ki Points to Discipline Points; the internal storage
  // key stays `ki_points` so existing tests + state continue to work, but
  // UI labels say "DP" so the player sees 2024 terminology.
  if (char.character_class.toLowerCase() === 'monk') {
    const kiLeft = char.class_resource_uses?.ki_points ?? char.level;
    const monkFreeAvailable = char.level >= 2 && !char.turn_actions.monk_free_used;
    if (state.combat_active && char.level >= 2) {
      if (kiLeft > 0 && char.turn_actions.action_used && !char.turn_actions.bonus_action_used) {
        choices.push({
          label: `Flurry of Blows — 2 unarmed strikes (1 DP, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
      if (!char.turn_actions.bonus_action_used) {
        // Patient Defense (2024) — Dodge as bonus action. Free 1/turn at
        // L2+, or spend 1 DP for the free option + advantage on the next
        // DEX save before your next turn.
        if (monkFreeAvailable) {
          choices.push({
            label: 'Patient Defense — Dodge (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'patient_defense_free' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          // Step of the Wind: pick one effect for free.
          choices.push({
            label: 'Step of the Wind: Dash (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'step_of_wind_free_dash' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          choices.push({
            label: 'Step of the Wind: Disengage (free, 1/turn)',
            action: { type: 'use_class_feature', featureId: 'step_of_wind_free_disengage' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
        }
        if (kiLeft > 0) {
          choices.push({
            label: `Patient Defense (1 DP) — Dodge + advantage on next DEX save (${kiLeft} left)`,
            action: { type: 'use_class_feature', featureId: 'patient_defense_dp' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
          // Step of the Wind for 1 DP — Dash AND Disengage (both effects).
          choices.push({
            label: `Step of the Wind (1 DP) — Dash + Disengage (${kiLeft} left)`,
            action: { type: 'use_class_feature', featureId: 'step_of_wind_dash' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
        }
      }
      if (
        state.combat_active &&
        char.level >= 5 &&
        enemyAlive &&
        kiLeft > 0 &&
        !char.turn_actions.monk_stunning_strike_used
      ) {
        choices.push({
          label: `Stunning Strike — once/turn after a hit, CON save DC ${8 + profBonus(char.level) + abilityMod(char.wis ?? 10)} (1 DP, ${kiLeft} left)`,
          action: { type: 'use_class_feature', featureId: 'stunning_strike' },
          kind: 'class_feature',
        });
      }
      // Way of Shadow (PHB p.80) — Shadow Arts. Step into the dark and gain
      // invisibility (attacks against you have disadvantage). Costs 2 ki and
      // your action. Lasts 3 rounds via condition_durations.
      if (
        char.subclass === 'shadow' &&
        kiLeft >= 2 &&
        !char.turn_actions.action_used &&
        !char.conditions.includes('invisible')
      ) {
        choices.push({
          label: `Shadow Arts — vanish into shadows (2 ki, invisible for 3 rounds, ${kiLeft} ki left)`,
          action: { type: 'use_class_feature', featureId: 'shadow_arts' },
          kind: 'class_feature',
        });
      }
    }
  }

  // ── Druid: Wild Shape ───────────────────────────────────────────────────────
  if (char.character_class.toLowerCase() === 'druid') {
    const wsUses = char.class_resource_uses?.wild_shape ?? 2;
    // Circle of the Moon (PHB p.69) — Combat Wild Shape: use as a bonus
    // action instead of action.
    const isMoon = char.subclass === 'moon';
    const wsAvailable =
      !char.conditions.includes('wild_shaped') &&
      wsUses > 0 &&
      (isMoon
        ? !char.turn_actions.bonus_action_used
        : !state.combat_active || !char.turn_actions.action_used);
    if (wsAvailable) {
      // 2024 PHB Beast Forms — surface one choice per accessible form. The
      // form's stat block replaces the druid's attack while shifted (see
      // BEAST_FORMS in contexts/srd/beast_forms.ts).
      const forms = availableBeastForms(char.level, isMoon);
      for (const form of forms) {
        choices.push({
          label: `Wild Shape: ${form.name} (CR ${form.cr})${isMoon ? ' (bonus action)' : ''} — ${form.descriptor}`,
          action: { type: 'use_class_feature', featureId: `wild_shape_${form.id}` },
          kind: 'class_feature',
          requiresBonusAction: isMoon || undefined,
        });
      }
    }
    if (char.conditions.includes('wild_shaped')) {
      choices.push({
        label: `Dismiss Wild Shape — return to normal form`,
        action: { type: 'use_class_feature', featureId: 'dismiss_wild_shape' },
        kind: 'class_feature',
      });
      // Circle of the Moon — spend a spell slot while shifted to heal 1d8
      // per slot level. Bonus action per PHB p.69 ("By spending a spell
      // slot, ... You can choose to take this bonus action only while...").
      if (isMoon && !char.turn_actions.bonus_action_used) {
        const slotsMax = char.spell_slots_max ?? {};
        const slotsUsed = char.spell_slots_used ?? {};
        const hasSlot = Object.entries(slotsMax).some(([lvl, max]) => {
          const lvlN = Number(lvl);
          return lvlN >= 1 && (max ?? 0) > (slotsUsed[lvlN] ?? 0);
        });
        if (hasSlot && char.hp < char.max_hp) {
          choices.push({
            label: `Moon Healing — spend a spell slot to heal 1d8/slot level (bonus action)`,
            action: { type: 'use_class_feature', featureId: 'moon_healing' },
            kind: 'class_feature',
            requiresBonusAction: true,
          });
        }
      }
    }
  }

  // ── Sorcerer: Metamagic ─────────────────────────────────────────────────────
  if (char.character_class.toLowerCase() === 'sorcerer' && char.level >= 3) {
    const spLeft = char.class_resource_uses?.sorcery_points ?? char.level;
    if (spLeft >= 1)
      choices.push({
        label: `Metamagic: Twinned Spell — next spell hits 2 targets (1 SP, ${spLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'metamagic_twinned' },
        kind: 'class_feature',
      });
    if (spLeft >= 2 && !char.turn_actions.bonus_action_used)
      choices.push({
        label: `Metamagic: Quickened Spell — cast as bonus action (2 SP, ${spLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'metamagic_quickened' },
        kind: 'class_feature',
      });
    if (spLeft >= 1)
      choices.push({
        label: `Metamagic: Empowered Spell — reroll up to ${abilityMod(char.cha ?? 10)} damage dice (1 SP, ${spLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'metamagic_empowered' },
        kind: 'class_feature',
      });
  }

  // ── Warlock: Invocations ─────────────────────────────────────────────────────
  // RAW (PHB p.107): invocations are learned at level-up, not chosen mid-fight.
  // Gate to out-of-combat so this surfaces as a downtime/level-up decision.
  if (!state.combat_active && char.character_class.toLowerCase() === 'warlock' && char.level >= 2) {
    if (!(char.feats ?? []).includes('agonizing_blast'))
      choices.push({
        label: `Learn Invocation: Agonizing Blast — +CHA to Eldritch Blast`,
        action: { type: 'use_class_feature', featureId: 'agonizing_blast' },
        kind: 'class_feature',
      });
    if (!(char.feats ?? []).includes('devils_sight'))
      choices.push({
        label: `Learn Invocation: Devil's Sight — see in magical darkness`,
        action: { type: 'use_class_feature', featureId: 'devils_sight' },
        kind: 'class_feature',
      });
  }

  // ── Subclass active features ────────────────────────────────────────────────
  if (state.combat_active && enemyAlive && char.subclass) {
    const cls = char.character_class.toLowerCase();
    const cdLeft = char.class_resource_uses?.channel_divinity ?? 1;

    // Battle Master: maneuver choices (in combat, superiority dice remaining)
    if (char.subclass === 'battle_master') {
      const sdLeft = char.class_resource_uses?.superiority_dice ?? 4;
      if (sdLeft > 0) {
        choices.push({
          label: `Maneuver: Trip Attack — +1d8 dmg, STR save or prone (${sdLeft} dice left)`,
          action: { type: 'use_class_feature', featureId: 'maneuver_trip' },
          kind: 'class_feature',
        });
        choices.push({
          label: `Maneuver: Goading Attack — +1d8 dmg, WIS save or disadvantage vs others (${sdLeft} dice left)`,
          action: { type: 'use_class_feature', featureId: 'maneuver_goading' },
          kind: 'class_feature',
        });
      }
    }

    // Lore Bard: Cutting Words (reaction, costs Bardic Inspiration)
    if (char.subclass === 'lore' && cls === 'bard' && !char.turn_actions.reaction_used) {
      const biLeft2 = char.class_resource_uses?.bardic_inspiration ?? abilityMod(char.cha ?? 10);
      if (biLeft2 > 0)
        choices.push({
          label: `Cutting Words — subtract Inspiration die from enemy roll (reaction, ${biLeft2} left)`,
          action: { type: 'use_class_feature', featureId: 'cutting_words' },
          kind: 'class_feature',
        });
    }

    // 2024 PHB Cleric universal Channel Divinity options — available to
    // every Cleric regardless of subclass.
    if (cls === 'cleric' && cdLeft > 0 && state.combat_active && enemyAlive) {
      choices.push({
        label: `Divine Spark — 1d8+${abilityMod(char.wis)} radiant damage or heal (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'divine_spark' },
        kind: 'class_feature',
      });
      choices.push({
        label: `Turn Undead — undead in 30 ft, WIS save or flee (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'turn_undead' },
        kind: 'class_feature',
      });
    }
    // 2024 PHB Cleric L5: Sear Undead replaces Destroy Undead. AoE radiant
    // damage to all undead in 30 ft, WIS save halves.
    if (cls === 'cleric' && char.level >= 5 && cdLeft > 0 && state.combat_active && enemyAlive) {
      choices.push({
        label: `Sear Undead — all undead in 30 ft take ${char.level}d8 radiant, WIS save halves (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'sear_undead' },
        kind: 'class_feature',
      });
    }

    // Life Cleric: Preserve Life (Channel Divinity, out-of-combat heal)
    if (char.subclass === 'life' && cls === 'cleric' && cdLeft > 0) {
      choices.push({
        label: `Preserve Life — distribute ${5 * char.level} HP among wounded allies (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'preserve_life' },
        kind: 'class_feature',
      });
    }

    // War Cleric: Guided Strike (Channel Divinity, +10 to next attack)
    if (char.subclass === 'war' && cls === 'cleric' && cdLeft > 0) {
      choices.push({
        label: `Guided Strike — +10 to next attack roll (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'guided_strike' },
        kind: 'class_feature',
      });
    }

    // Devotion Paladin: Sacred Weapon (Channel Divinity)
    if (
      char.subclass === 'devotion' &&
      cls === 'paladin' &&
      cdLeft > 0 &&
      !char.class_resource_uses?.sacred_weapon_active
    ) {
      choices.push({
        label: `Sacred Weapon — +${abilityMod(char.cha ?? 10)} to attack rolls for 10 rounds (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'sacred_weapon' },
        kind: 'class_feature',
      });
    }

    // Vengeance Paladin: Vow of Enmity & Abjure Enemy (Channel Divinity)
    if (char.subclass === 'vengeance' && cls === 'paladin' && cdLeft > 0) {
      choices.push({
        label: `Vow of Enmity — advantage vs target for 1 min (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'vow_of_enmity' },
        kind: 'class_feature',
      });
      choices.push({
        label: `Abjure Enemy — frighten target, WIS save DC ${8 + profBonus(char.level) + abilityMod(char.cha ?? 10)} (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'abjure_enemy' },
        kind: 'class_feature',
      });
    }

    // Hunter Ranger: Colossus Slayer
    if (
      char.subclass === 'hunter' &&
      cls === 'ranger' &&
      !char.class_resource_uses?.colossus_slayer_used
    ) {
      choices.push({
        label: `Colossus Slayer — +1d8 on first hit vs bloodied target`,
        action: { type: 'use_class_feature', featureId: 'colossus_slayer' },
        kind: 'class_feature',
      });
    }

    // Beastmaster Ranger: Command Animal Companion (bonus action, PHB p.93).
    // The companion bites the nearest living enemy from its grid position.
    if (
      char.subclass === 'beastmaster' &&
      cls === 'ranger' &&
      char.level >= 3 &&
      !char.turn_actions.bonus_action_used
    ) {
      const companion = state.entities?.find(
        (e) => e.isCompanion && e.companionOwnerId === char.id && e.hp > 0
      );
      if (companion) {
        choices.push({
          label: `Command ${companion.companionName ?? 'companion'} to attack (bonus action)`,
          action: { type: 'use_class_feature', featureId: 'command_companion' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // Abjurer Wizard: Arcane Ward (create when not active)
    if (char.subclass === 'abjurer' && cls === 'wizard' && !char.class_resource_uses?.arcane_ward) {
      choices.push({
        label: `Arcane Ward — create ${2 * char.level} HP damage shield`,
        action: { type: 'use_class_feature', featureId: 'arcane_ward' },
        kind: 'class_feature',
      });
    }

    // Archfey Warlock: Fey Presence (PHB p.109) — 1/short rest, all creatures
    // in a 10-ft cube within 10 ft make a WIS save or are frightened until
    // end of your next turn.
    if (
      char.subclass === 'archfey' &&
      cls === 'warlock' &&
      !char.class_resource_uses?.fey_presence_used
    ) {
      choices.push({
        label: `Fey Presence — frighten enemies in 10 ft, WIS save DC ${8 + profBonus(char.level) + abilityMod(char.cha ?? 10)} (1/short rest)`,
        action: { type: 'use_class_feature', featureId: 'fey_presence' },
        kind: 'class_feature',
      });
    }
  }

  // Spell choices
  if (context.spellTable && (char.spells_known ?? []).length > 0) {
    const slots = char.spell_slots_max ?? {};
    const slotsUsed = char.spell_slots_used ?? {};
    // Prep classes (Cleric / Paladin / Druid) only cast spells in their
    // `prepared_spells` list — mirrors the runtime check at the cast site.
    // Cantrips are always castable (level 0). Surfacing unprepared spells
    // creates a UX trap: the player clicks "Cast Healing Word", gets a
    // "not prepared" rejection, and burns the action without effect (the
    // engine bails before the slot is spent, but the choice list keeps
    // showing the unprepared spell every turn).
    const prepClasses = new Set(['cleric', 'paladin', 'druid']);
    const enforcePrep = prepClasses.has(char.character_class.toLowerCase());
    const preparedSet = new Set(char.prepared_spells ?? []);
    for (const spellId of char.spells_known) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const spell = context.spellTable[spellId];
      if (!spell) continue;

      // Prep gate: filter unprepared level-1+ spells out of the cast menu
      // for prep classes. If `prepared_spells` is empty (legacy state /
      // pre-prep flow), fall back to surfacing everything so the player
      // isn't left without options.
      if (enforcePrep && spell.level > 0 && preparedSet.size > 0 && !preparedSet.has(spellId)) {
        continue;
      }

      // Reaction-cast spells (e.g. Shield) only fire from a pending_reaction
      // window — don't surface them in the regular cast menu.
      if (spell.castTime === 'reaction') continue;
      const isBonusAction = spell.castTime === 'bonus_action';
      const actionBlocked = !isBonusAction && char.turn_actions.action_used;
      const bonusBlocked = isBonusAction && char.turn_actions.bonus_action_used;
      if (actionBlocked || bonusBlocked) continue;

      // Restrict offensive/condition spells to when an enemy is alive; heal spells when injured
      const isOffensive = !!(spell.damage || spell.condition);
      const isHeal = !!spell.heal;
      if (isOffensive && !enemyAlive) continue;
      if (isHeal) {
        const injured = state.characters.filter((c) => !c.dead && c.hp < c.max_hp);
        if (injured.length === 0) continue;
      }

      // Optional AoE preview metadata for the grid renderer.
      const aoePreview = spell.blastRadius
        ? {
            shape: ((spell as { aoeShape?: 'sphere' | 'cone' | 'cube' | 'line' }).aoeShape ??
              'sphere') as 'sphere' | 'cone' | 'cube' | 'line',
            radiusFt: spell.blastRadius,
            rangeKind: spell.rangeKind,
          }
        : undefined;

      // For single-target offensive spells with 2+ living enemies, emit
      // one cast choice per enemy so the caster picks their target — RAW
      // (Guiding Bolt, Sacred Flame, Fire Bolt, Inflict Wounds, etc. all
      // say "a creature of your choice"). Mirrors the Attack-per-enemy
      // loop. Exclusions:
      //   - AoE spells (`blastRadius`): a single origin choice is still
      //     emitted; per-origin picker is a separate follow-up.
      //   - Spells with their own multi-target variants below (magic_missile;
      //     eldritch_blast at L5+ multi-beam): they emit focus-fire and
      //     spread choices in dedicated blocks — don't duplicate here.
      const enemyDisambig = (() => {
        const counts: Record<string, number> = {};
        for (const e of livingEnemies) counts[e.name] = (counts[e.name] ?? 0) + 1;
        const seen: Record<string, number> = {};
        return (en: { name: string }) =>
          counts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
      })();
      const hasOwnMultiTargetVariants =
        spellId === 'magic_missile' || (spellId === 'eldritch_blast' && char.level >= 5);
      const emitPerEnemy =
        isOffensive &&
        !spell.blastRadius &&
        !hasOwnMultiTargetVariants &&
        livingEnemies.length >= 2;

      if (spell.level === 0) {
        // Cantrip: no slot needed
        const slotNote = isBonusAction ? ', bonus action' : '';
        if (emitPerEnemy) {
          // One choice per living enemy. `enemyDisambig` is consumed in
          // declaration order across calls so #1/#2 stay stable.
          for (const en of livingEnemies) {
            if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
            const suffix = enemyDisambig(en);
            choices.push({
              label: `Cast ${spell.name} (cantrip${slotNote}) → ${en.name}${suffix}`,
              action: { type: 'cast_spell', spellId, slotLevel: 0, targetEnemyId: en.id },
              requiresBonusAction: isBonusAction || undefined,
              aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: en.id } : undefined,
              kind: 'cast_spell',
            });
          }
        } else {
          const targetId = isOffensive ? livingEnemies[0]?.id : undefined;
          choices.push({
            label: `Cast ${spell.name} (cantrip${slotNote})`,
            action: { type: 'cast_spell', spellId, slotLevel: 0, targetEnemyId: targetId },
            requiresBonusAction: isBonusAction || undefined,
            aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: targetId } : undefined,
            kind: 'cast_spell',
          });
        }
      } else {
        // Leveled spell: emit one choice per available slot level (base + upcasts)
        const baseLevel = spell.level ?? 1;
        const maxSlotLevel = Math.max(
          ...Object.keys(slots)
            .map(Number)
            .filter((l) => l >= baseLevel)
        );
        let emittedAny = false;
        for (let sl = baseLevel; sl <= maxSlotLevel; sl++) {
          const avail = (slots[sl] ?? 0) - (slotsUsed[sl] ?? 0);
          if (avail <= 0) continue;
          emittedAny = true;
          const isUpcast = sl > baseLevel;
          const upcastPart =
            isUpcast && spell.upcastBonus ? ` — upcast +${sl - baseLevel}${spell.upcastBonus}` : '';
          const slotNote = isBonusAction ? ', bonus action' : '';
          if (emitPerEnemy) {
            // Per-enemy basic choices at this slot level. `enemyDisambig`
            // is reset per slot below to keep #1/#2 numbering stable
            // within each slot's choice batch.
            const slotDisambig = (() => {
              const counts: Record<string, number> = {};
              for (const e of livingEnemies) counts[e.name] = (counts[e.name] ?? 0) + 1;
              const seen: Record<string, number> = {};
              return (en: { name: string }) =>
                counts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
            })();
            for (const en of livingEnemies) {
              if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
              const suffix = slotDisambig(en);
              choices.push({
                label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${sl}th slot`}${slotNote}${upcastPart}) → ${en.name}${suffix}`,
                action: { type: 'cast_spell', spellId, slotLevel: sl, targetEnemyId: en.id },
                requiresBonusAction: isBonusAction || undefined,
                aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: en.id } : undefined,
                kind: 'cast_spell',
              });
            }
          } else {
            const targetId = isOffensive ? livingEnemies[0]?.id : undefined;
            choices.push({
              label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${sl}th slot`}${slotNote}${upcastPart} — ${avail} slot${avail === 1 ? '' : 's'} left)`,
              action: { type: 'cast_spell', spellId, slotLevel: sl, targetEnemyId: targetId },
              requiresBonusAction: isBonusAction || undefined,
              aoePreview: aoePreview ? { ...aoePreview, targetEnemyId: targetId } : undefined,
              kind: 'cast_spell',
            });
          }
          // 2024 PHB Magic Missile multi-target: when there are 2+ living
          // enemies, emit a focus-fire choice per enemy + one "spread evenly"
          // choice that distributes darts across all targets.
          if (spellId === 'magic_missile' && livingEnemies.length >= 2) {
            const dartCount = 2 + sl; // 3 at L1 slot, 4 at L2, etc.
            for (const e of livingEnemies) {
              choices.push({
                label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${sl}th slot`}) — focus fire ${dartCount} darts → ${e.name}`,
                action: {
                  type: 'cast_spell',
                  spellId,
                  slotLevel: sl,
                  targetEnemyId: e.id,
                  targetEnemyIds: Array(dartCount).fill(e.id),
                },
                kind: 'cast_spell',
              });
            }
            // Spread evenly across the first min(darts, enemies) targets,
            // round-robin so extras pile on the earliest.
            const spread: string[] = [];
            for (let i = 0; i < dartCount; i++) {
              spread.push(livingEnemies[i % livingEnemies.length].id);
            }
            const names = livingEnemies
              .slice(0, Math.min(dartCount, livingEnemies.length))
              .map((e) => e.name)
              .join(', ');
            choices.push({
              label: `Cast ${spell.name} (${sl === baseLevel ? `Lvl ${sl}` : `${sl}th slot`}) — spread ${dartCount} darts across ${names}`,
              action: {
                type: 'cast_spell',
                spellId,
                slotLevel: sl,
                targetEnemyId: livingEnemies[0].id,
                targetEnemyIds: spread,
              },
              kind: 'cast_spell',
            });
          }
        }
        if (!emittedAny) continue;
      }
      // 2024 PHB Eldritch Blast multi-beam (L5+ — 2 beams; L11+ 3; L17+ 4).
      // Emit per-target focus-fire + a spread variant when multiple enemies
      // are alive. Cantrip path handled separately above (only adds extras
      // when level + multi-enemy conditions are met).
      if (spellId === 'eldritch_blast' && char.level >= 5 && livingEnemies.length >= 2) {
        const beamCount = char.level >= 17 ? 4 : char.level >= 11 ? 3 : 2;
        for (const e of livingEnemies) {
          choices.push({
            label: `Cast ${spell.name} (cantrip) — focus fire ${beamCount} beams → ${e.name}`,
            action: {
              type: 'cast_spell',
              spellId,
              slotLevel: 0,
              targetEnemyId: e.id,
              targetEnemyIds: Array(beamCount).fill(e.id),
            },
            kind: 'cast_spell',
          });
        }
        const spread: string[] = [];
        for (let i = 0; i < beamCount; i++) {
          spread.push(livingEnemies[i % livingEnemies.length].id);
        }
        const names = livingEnemies
          .slice(0, Math.min(beamCount, livingEnemies.length))
          .map((e) => e.name)
          .join(', ');
        choices.push({
          label: `Cast ${spell.name} (cantrip) — spread ${beamCount} beams across ${names}`,
          action: {
            type: 'cast_spell',
            spellId,
            slotLevel: 0,
            targetEnemyId: livingEnemies[0].id,
            targetEnemyIds: spread,
          },
          kind: 'cast_spell',
        });
      }
    }
  }

  // Two-weapon fighting bonus action: both weapons must be light
  if (
    state.combat_active &&
    char.turn_actions.action_used &&
    !char.turn_actions.bonus_action_used
  ) {
    const equippedWpnItem = char.equipped_weapon
      ? context.lootTable.find(
          (l) => l.id === char.inventory.find((i) => i.instance_id === char.equipped_weapon)?.id
        )
      : null;
    if (equippedWpnItem?.light) {
      const offhandItem = char.inventory
        .filter((i) => i.instance_id !== char.equipped_weapon)
        .map((i) => context.lootTable.find((l) => l.id === i.id))
        .find((l) => l?.light && l.slot === 'weapon');
      if (offhandItem) {
        choices.push({
          label: `Two-weapon attack — off-hand ${offhandItem.name} (no ability mod to damage)`,
          action: { type: 'two_weapon_attack', targetEnemyId: livingEnemies[0]?.id },
          requiresBonusAction: true,
          kind: 'two_weapon_attack',
        });
      }
    }
  }

  // Try to escape grapple — SRD 5.2.1 p.16, contested Athletics or Acrobatics
  if (
    state.combat_active &&
    !char.turn_actions.action_used &&
    char.conditions.includes('grappled')
  ) {
    choices.push({
      label: 'Try to escape grapple — Athletics or Acrobatics vs grappler',
      action: { type: 'try_escape_grapple' },
    });
  }

  // Spend Heroic Inspiration on the next d20 (2024 PHB) — one-shot
  // advantage on any d20 test (attack, save, or ability check).
  // Available in or out of combat once the char has it stored and hasn't
  // already queued it this turn.
  if (char.inspiration && !char.turn_actions.inspiration_pending) {
    choices.push({
      label: '✦ Spend Heroic Inspiration — advantage on your next d20 (attack, save, or check)',
      action: { type: 'spend_inspiration' },
    });
  }

  // Stand up from prone — SRD 5.2.1 p.187: costs half the creature's speed.
  if (state.combat_active && char.conditions.includes('prone')) {
    const speedFt = effectiveSpeed(char);
    const standCost = Math.floor(speedFt / 2);
    const usedFt = (state.movement_used ?? {})[char.id] ?? 0;
    if (speedFt - usedFt >= standCost) {
      choices.push({
        label: `Stand up — costs ${standCost} ft of movement`,
        action: { type: 'stand_up' },
      });
    }
  }

  // Grapple/Shove choices — one per living enemy
  if (enemyAlive && !char.turn_actions.action_used) {
    const nameCounts = livingEnemies.reduce<Record<string, number>>((acc, e) => {
      acc[e.name] = (acc[e.name] ?? 0) + 1;
      return acc;
    }, {});
    const seen: Record<string, number> = {};
    for (const en of livingEnemies) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      const suffix =
        nameCounts[en.name] > 1 ? ` #${(seen[en.name] = (seen[en.name] ?? 0) + 1)}` : '';
      choices.push({
        label: `Grapple the ${en.name}${suffix} — STR vs STR/DEX contest`,
        action: { type: 'grapple', targetEnemyId: en.id },
        kind: 'grapple',
      });
      choices.push({
        label: `Shove the ${en.name}${suffix} — STR vs STR/DEX contest (knocks prone)`,
        action: { type: 'shove', targetEnemyId: en.id },
        kind: 'shove',
      });
    }
  }

  // Dodge / Disengage — available in combat when action not yet used
  if (state.combat_active && !char.turn_actions.action_used) {
    choices.push({
      label: 'Dodge — attacks against you have disadvantage until your next turn',
      action: { type: 'dodge' },
      kind: 'dodge',
    });
    choices.push({
      label: 'Disengage — move without triggering opportunity attacks',
      action: { type: 'disengage' },
      kind: 'disengage',
    });
  }

  // Attune choices — out of combat, for unnattuned items that require attunement
  if (!state.combat_active) {
    const attuned = char.attuned_items ?? [];
    if (attuned.length < 3) {
      for (const invItem of char.inventory) {
        if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
        const lootItem = context.lootTable.find((l) => l.id === invItem.id);
        if (lootItem?.requiresAttunement && !attuned.includes(invItem.instance_id)) {
          choices.push({
            label: `Attune to ${invItem.name}`,
            action: { type: 'attune', instanceId: invItem.instance_id },
          });
        }
      }
    }
  }

  // End turn: available in combat after the character's action is used
  // (auto-advance fires when no bonus choices exist, but this allows explicit forfeiture)
  if (state.combat_active && char.turn_actions.action_used) {
    choices.push({ label: 'End turn', action: { type: 'end_turn' } });
  }
  const isImmobilized = char.conditions.some((c) => ['grappled', 'restrained'].includes(c));

  // Grid movement choices — shown in combat when entities are tracked on the grid
  if (state.entities && state.combat_active && !isImmobilized) {
    const charEntity = state.entities.find((e) => e.id === char.id);
    if (charEntity) {
      const speedFt = effectiveSpeed(char);
      const usedFt = (state.movement_used ?? {})[char.id] ?? 0;
      const remaining = speedFt - usedFt;
      const gw = context.gridWidth ?? 10;
      const gh = context.gridHeight ?? 10;
      // Dead entities (corpses) don't block movement — walk over them.
      const occupied = new Set(
        state.entities
          .filter((e) => e.id !== char.id && e.hp > 0)
          .map((e) => `${e.pos.x},${e.pos.y}`)
      );
      const DIRS: Array<{ label: ChoiceDirection; dx: number; dy: number }> = [
        { label: 'N', dx: 0, dy: -1 },
        { label: 'NE', dx: 1, dy: -1 },
        { label: 'E', dx: 1, dy: 0 },
        { label: 'SE', dx: 1, dy: 1 },
        { label: 'S', dx: 0, dy: 1 },
        { label: 'SW', dx: -1, dy: 1 },
        { label: 'W', dx: -1, dy: 0 },
        { label: 'NW', dx: -1, dy: -1 },
      ];
      if (remaining > 0) {
        for (const dir of DIRS) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          const nx = charEntity.pos.x + dir.dx;
          const ny = charEntity.pos.y + dir.dy;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          if (occupied.has(`${nx},${ny}`)) continue;
          choices.push({
            label: `Move ${dir.label} → (${nx},${ny}) [${remaining - 5}ft left]`,
            action: { type: 'grid_move', entityId: char.id, to: { x: nx, y: ny } },
            kind: 'grid_move',
            direction: dir.label,
          });
        }
      }
    }
  } else if (!state.entities) {
    if (!isImmobilized) {
      // Out-of-combat room exits. SRD 5.2.1: there is no "Dash past" — a hostile
      // creature in the room means engage (Attack) or evade (Sneak via Stealth);
      // strolling past is not a RAW choice.
      if (!enemyAlive) {
        for (const adj of adjacent) {
          if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
          choices.push({ label: `Move to ${adj.name}`, action: { type: 'move', roomId: adj.id } });
        }
      }
    } else {
      const blocker = char.conditions.find((c) => ['grappled', 'restrained'].includes(c))!;
      choices.push({ label: `${blocker.toUpperCase()} — cannot move`, action: { type: 'pass' } });
    }
  }

  // Room exits are always available when not in active combat (grid or not)
  if (!state.combat_active && !isImmobilized && state.entities) {
    for (const adj of adjacent) {
      if (MAX_CHOICES && choices.length >= MAX_CHOICES) break;
      choices.push({ label: `Move to ${adj.name}`, action: { type: 'move', roomId: adj.id } });
    }
  }
  const sliced = MAX_CHOICES ? choices.slice(0, MAX_CHOICES) : choices;
  // Stamp seenKey on each choice (undefined for kinds not worth dimming).
  // Centralizing the stamp here means each emit site doesn't need to know
  // its own disambiguation rules.
  return sliced.map((c) => {
    const k = seenKeyForAction(c.action, state);
    return k ? { ...c, seenKey: k } : c;
  });
}

// ─── Script engine: rule evaluation ──────────────────────────────────────────

export async function runRules(
  state: GameState,
  context: Context,
  action: StructuredAction,
  prevRoomId: string,
  seed: Seed
): Promise<{ state: GameState; extraNarrative: string }> {
  const rules = context.rules;
  if (!rules?.length) return { state, extraNarrative: '' };

  const activeChar =
    state.characters.find((c) => c.id === state.active_character_id) ?? state.characters[0];
  if (!activeChar) return { state, extraNarrative: '' };

  // Filter out once-rules that have already fired
  const eligibleRules = rules.filter((r) => !r.once || !state.flags[`rule_fired_${r.name}`]);
  if (!eligibleRules.length) return { state, extraNarrative: '' };

  // Flags are spread as top-level facts so rules can reference them directly
  // (e.g. { fact: 'boss_defeated', operator: 'equal', value: true }).
  // Named facts below take precedence over any same-named flag.
  const facts: Record<string, unknown> = {
    ...state.flags,
    action: action.type,
    room_id: state.current_room,
    prev_room_id: prevRoomId,
    visited_rooms: state.visited_rooms,
    enemies_killed: state.enemies_killed,
    loot_taken: state.loot_taken,
    combat_active: state.combat_active,
    flags: state.flags,
    active_hp: activeChar.hp,
    active_max_hp: activeChar.max_hp,
    active_level: activeChar.level,
    active_class: activeChar.character_class,
    active_conditions: activeChar.conditions,
  };

  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const rule of eligibleRules) {
    engine.addRule({
      name: rule.name,
      priority: rule.priority ?? 1,
      conditions: rule.conditions as Parameters<typeof engine.addRule>[0]['conditions'],
      event: { type: rule.name },
    });
  }

  const { events } = await engine.run(facts as Parameters<typeof engine.run>[0]);
  const firedNames = new Set(events.map((e) => e.type));

  if (!firedNames.size) return { state, extraNarrative: '' };

  // Apply consequences for each fired rule in declaration order
  let st = state;
  const narrativeParts: string[] = [];

  for (const rule of eligibleRules) {
    if (!firedNames.has(rule.name)) continue;

    for (const c of rule.consequences) {
      st = applyConsequence(c, st, seed, activeChar.id, narrativeParts, context);
    }

    if (rule.once) {
      st = { ...st, flags: { ...st.flags, [`rule_fired_${rule.name}`]: true } };
    }
  }

  return { state: st, extraNarrative: narrativeParts.join(' ') };
}

export function applyConsequence(
  c: GameConsequence,
  st: GameState,
  seed: Seed,
  activeCharId: string,
  narrativeParts: string[],
  // Optional: when supplied, `give_xp` triggers immediate level-ups via
  // `applyLevelUpFromXp`. Older call sites that don't pass it still
  // award the XP — the level-up will fire on the next kill grant.
  context?: Context
): GameState {
  switch (c.type) {
    case 'add_narrative':
      narrativeParts.push(c.text);
      return st;

    case 'set_flag':
      return { ...st, flags: { ...st.flags, [c.key]: c.value } };

    case 'give_item': {
      const targetId = c.characterId ?? activeCharId;
      const lootEntry = seed.loot?.[c.itemId] ?? null;
      if (!lootEntry) return st;
      const newItem = { ...lootEntry, instance_id: randomUUID() };
      const characters = st.characters.map((ch) =>
        ch.id === targetId ? { ...ch, inventory: [...ch.inventory, newItem] } : ch
      );
      return { ...st, characters };
    }

    case 'modify_hp': {
      const targetId = c.characterId ?? activeCharId;
      const characters = st.characters.map((ch) => {
        if (ch.id !== targetId) return ch;
        const newHp = Math.max(0, Math.min(ch.max_hp, ch.hp + c.amount));
        return { ...ch, hp: newHp };
      });
      return { ...st, characters };
    }

    case 'unlock_room': {
      // Mark the room as already visited so it appears on the map without being locked
      if (st.visited_rooms.includes(c.roomId)) return st;
      return { ...st, visited_rooms: [...st.visited_rooms, c.roomId] };
    }

    case 'spawn_enemy': {
      // Look up the enemy template by its instance id (searched across all rooms).
      // Note: this consequence only adds a grid entity; it does not add to seed.enemies
      // (seeds are treated as immutable for the duration of an action).
      const template = getEnemyById(seed, c.enemyId);
      if (!template) return st;
      if (st.entities) {
        const spawnedEntity: import('../types.js').CombatEntity = {
          id: `${c.enemyId}@${c.roomId}#${Date.now()}`,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: template.hp,
          maxHp: template.hp,
          conditions: [],
          condition_durations: {},
        };
        return { ...st, entities: [...st.entities, spawnedEntity] };
      }
      return st;
    }

    case 'set_escape':
      // Handled by takeAction's escaped flag; we signal via a flag that
      // the route can check after runRules returns.
      return { ...st, flags: { ...st.flags, _rule_escape: true } };

    case 'give_gold': {
      // Gold lands on the active character. Surfaced in narrative so
      // the player sees the reward immediately ("+150 gold").
      const characters = st.characters.map((ch) =>
        ch.id === activeCharId ? { ...ch, gold: (ch.gold ?? 0) + c.amount } : ch
      );
      narrativeParts.push(`+${c.amount} gold.`);
      return { ...st, characters };
    }

    case 'give_xp': {
      // Quest XP — split the amount evenly across all living party
      // members (rounded down). Mirrors how `splitEncounterXp` shares
      // kill XP, but every eligible PC gets a share (no killer carve-out).
      // When context is provided, also trigger immediate level-ups so
      // the player sees the level bump on quest turn-in instead of
      // having to wait for the next kill.
      if (c.amount <= 0) return st;
      const living = st.characters.filter((ch) => !ch.dead);
      const eligibleCount = living.length;
      if (eligibleCount === 0) return st;
      const share = Math.floor(c.amount / eligibleCount);
      if (share <= 0) {
        narrativeParts.push(`+${c.amount} XP awarded but party too large for a share.`);
        return st;
      }
      // Apply XP to a mutable clone so applyLevelUpFromXp (which mutates
      // its argument) can run on each living PC without losing the XP write.
      const livingIds = new Set(living.map((ch) => ch.id));
      let levelUpNote = '';
      const characters = st.characters.map((ch) => {
        if (!livingIds.has(ch.id)) return ch;
        const next: Character = { ...ch, xp: (ch.xp || 0) + share };
        if (context) {
          levelUpNote += applyLevelUpFromXp(next, context);
        }
        return next;
      });
      // Show the authored total + per-PC share so the player can see
      // the quest's reward magnitude and what each PC actually got.
      // Solo parties collapse to just the total (each = total).
      narrativeParts.push(
        eligibleCount > 1 ? `+${c.amount} XP (+${share} each).` : `+${c.amount} XP.`
      );
      if (levelUpNote) narrativeParts.push(levelUpNote.trim());
      return { ...st, characters };
    }

    case 'set_faction_rep': {
      const cur = st.faction_rep?.[c.factionId] ?? 0;
      const next = cur + c.delta;
      narrativeParts.push(`${c.delta >= 0 ? '+' : ''}${c.delta} reputation with ${c.factionId}.`);
      return { ...st, faction_rep: { ...(st.faction_rep ?? {}), [c.factionId]: next } };
    }

    case 'set_npc_attitude': {
      // npcId is the npc's authored id (e.g. 'npc_aldric'); npc_attitudes
      // is keyed by roomId since each room can host at most one NPC.
      const targetRoomId = Object.entries(seed.npcs ?? {}).find(([, n]) => n.id === c.npcId)?.[0];
      if (!targetRoomId) return st;
      return {
        ...st,
        npc_attitudes: { ...(st.npc_attitudes ?? {}), [targetRoomId]: c.attitude },
      };
    }

    case 'advance_quest': {
      const progress = st.quest_progress ?? [];
      const existing = progress.find((p) => p.questId === c.questId);
      if (existing) {
        if (existing.completedSteps.includes(c.stepId)) return st;
        return {
          ...st,
          quest_progress: progress.map((p) =>
            p.questId === c.questId ? { ...p, completedSteps: [...p.completedSteps, c.stepId] } : p
          ),
        };
      }
      // Quest not yet accepted — start it active with this step done
      return {
        ...st,
        quest_progress: [
          ...progress,
          { questId: c.questId, status: 'active', completedSteps: [c.stepId] },
        ],
      };
    }

    case 'travel_to':
      // Update the location pointer; preserves room_id (caller picks
      // a destination room separately if needed).
      return { ...st, current_location_id: c.locationId, current_district_id: undefined };

    case 'consume_item': {
      // Remove ONE instance of itemId from whichever party member has
      // it. Quest turn-ins (Guild Ledger, Moonstone Amulet, etc.) use
      // this so the item leaves the player's pack at completion.
      let removed = false;
      const characters = st.characters.map((ch) => {
        if (removed) return ch;
        const idx = ch.inventory.findIndex((i) => i.id === c.itemId);
        if (idx < 0) return ch;
        removed = true;
        return { ...ch, inventory: ch.inventory.filter((_, i) => i !== idx) };
      });
      return { ...st, characters };
    }

    default:
      return st;
  }
}

// ─── Enemy turn auto-resolve (with reaction-window support) ───────────────────

// PHB p.190: reactions interrupt the attacker's resolve. When an enemy's
// attack lands within Shield's window ([AC, AC+4]) on a defender who has
// Shield prepared + a 1st-level slot + an unused reaction, this helper sets
// `st.pending_reaction` and returns `paused: true` so the engine can yield
// control to the player. Calling again from `resolve_reaction` resumes the
// loop from the saved coordinates.
//
// Eligibility for Shield is checked at the per-sub-attack level. Multiattacks
// pause mid-burst; remaining sub-attacks resume after the decision.
// Shared eligibility check: target alive + has an unused reaction + knows
// the spell + has a level-1+ slot + the spell exists in this campaign's
// spell table. Each reaction adds its own trigger predicate on top.
function knowsSpellWithSlot(target: Character, spellId: string, context: Context): boolean {
  if (target.dead || target.hp <= 0) return false;
  if (target.turn_actions?.reaction_used) return false;
  const knows =
    (target.prepared_spells ?? []).includes(spellId) ||
    (target.spells_known ?? []).includes(spellId);
  if (!knows) return false;
  const slotsMax = target.spell_slots_max ?? {};
  const slotsUsed = target.spell_slots_used ?? {};
  const hasL1Slot = Object.entries(slotsMax).some(([lvl, max]) => {
    const lvlN = Number(lvl);
    return lvlN >= 1 && (max ?? 0) > (slotsUsed[lvlN] ?? 0);
  });
  if (!hasL1Slot) return false;
  if (!context.spellTable?.[spellId]) return false;
  return true;
}

function isShieldEligible(
  target: Character,
  atkTotal: number,
  targetAc: number,
  context: Context
): boolean {
  if (!knowsSpellWithSlot(target, 'shield', context)) return false;
  // Outside the [AC, AC+4] window, +5 AC from Shield wouldn't change the result.
  if (atkTotal < targetAc || atkTotal > targetAc + 4) return false;
  return true;
}

// Hellish Rebuke (PHB p.252) — triggers AFTER damage applies. Requires the
// PC to be conscious (target.hp > 0 after the hit), within 60 ft of the
// attacker (we have grid positions), and Warlock-only since that's the spell
// list it appears on. Multi-class isn't modeled, so the class check is exact.
function isHellishRebukeEligible(
  target: Character,
  targetPos: { x: number; y: number } | undefined,
  attackerPos: { x: number; y: number } | undefined,
  context: Context
): boolean {
  // 2024 PHB: Warlocks cast it from their spell list; Tieflings L3+ get it
  // as a racial Innate spell (1/long rest, no slot cost).
  const isWarlock =
    target.character_class.toLowerCase() === 'warlock' &&
    knowsSpellWithSlot(target, 'hellish_rebuke', context);
  const isTieflingInnate =
    target.species === 'tiefling' &&
    target.level >= 3 &&
    !target.class_resource_uses?.tiefling_rebuke_used &&
    !!context.spellTable?.['hellish_rebuke'];
  if (!isWarlock && !isTieflingInnate) return false;
  if (!targetPos || !attackerPos) return false;
  if (distanceFeet(targetPos, attackerPos) > 60) return false;
  return true;
}

// Resolve a pending enemy spell's damage on its intended target. Used by
// the Counterspell decline path (and by counterspell-failed-check). Returns
// undefined if there's nothing to apply (spell has no damage, target dead).
function applyEnemySpellDamage(
  st: GameState,
  rx: { enemySpellId: string; intendedTargetPcId: string },
  context: Context
):
  | { st: GameState; targetHp: number; targetName: string; dmgRoll: number; damageType: string }
  | undefined {
  const tgtIdx = st.characters.findIndex((c) => c.id === rx.intendedTargetPcId);
  if (tgtIdx < 0) return undefined;
  const spell = context.spellTable?.[rx.enemySpellId];
  if (!spell?.damage) return undefined;
  const dmgRoll = rollDice(spell.damage);
  const tgt = st.characters[tgtIdx];
  const newHp = Math.max(0, tgt.hp - dmgRoll);
  const newSt: GameState = {
    ...st,
    characters: st.characters.map((c, i) => (i === tgtIdx ? { ...c, hp: newHp } : c)),
    entities: st.entities?.map((e) => (e.id === tgt.id && !e.isEnemy ? { ...e, hp: newHp } : e)),
  };
  return {
    st: newSt,
    targetHp: newHp,
    targetName: tgt.name,
    dmgRoll,
    damageType: spell.damageType ?? 'damage',
  };
}

// Counterspell (PHB p.234) — triggers when a creature within 60 ft is
// casting a spell. Requires Counterspell prepared/known + a 3rd-level slot
// (since the spell itself is 3rd level — slots ≥ spell level only).
function isCounterspellEligible(
  reactor: Character,
  reactorPos: { x: number; y: number } | undefined,
  casterPos: { x: number; y: number } | undefined,
  context: Context
): boolean {
  if (reactor.dead || reactor.hp <= 0) return false;
  if (reactor.turn_actions?.reaction_used) return false;
  const knows =
    (reactor.prepared_spells ?? []).includes('counterspell') ||
    (reactor.spells_known ?? []).includes('counterspell');
  if (!knows) return false;
  // Need a level-3+ slot to cast counterspell at its base level.
  const slotsMax = reactor.spell_slots_max ?? {};
  const slotsUsed = reactor.spell_slots_used ?? {};
  const hasL3Slot = Object.entries(slotsMax).some(([lvl, max]) => {
    const lvlN = Number(lvl);
    return lvlN >= 3 && (max ?? 0) > (slotsUsed[lvlN] ?? 0);
  });
  if (!hasL3Slot) return false;
  if (!context.spellTable?.counterspell) return false;
  if (!reactorPos || !casterPos) return false;
  if (distanceFeet(reactorPos, casterPos) > 60) return false;
  return true;
}

interface EnemyTurnResult {
  st: GameState;
  narrative: string;
  exitAdvIdx: number;
  roundWrapped: boolean;
  paused: boolean;
}

// Tactical-grid approach planner for an enemy that wants to melee `targetPos`.
// Returns the destination square (within `reachFt` of target, unoccupied) and
// the truncated step path the enemy will walk this turn. Walks up to
// `speedFt`; if the closest in-reach square is farther than that, the enemy
// covers as much of the path as movement allows and `reached` is false.
// Returns null when no path exists to any in-reach square (e.g. fully boxed
// in by allies).
function planEnemyApproach(args: {
  st: GameState;
  enemyId: string;
  enemyPos: GridPos;
  targetPos: GridPos;
  reachFt: number;
  speedFt: number;
  context: Context;
  roomId: string;
  roomObstacles?: GridPos[];
}): { newPos: GridPos; pathSquares: GridPos[]; reached: boolean } | null {
  const locationGrid = args.context.campaign?.locations?.find((l) =>
    l.rooms?.some((r) => r.id === args.roomId)
  );
  const gridW = locationGrid?.gridWidth ?? args.context.gridWidth ?? 10;
  const gridH = locationGrid?.gridHeight ?? args.context.gridHeight ?? 10;
  const blocked = [
    ...(args.st.entities ?? []).filter((e) => e.id !== args.enemyId && e.hp > 0).map((e) => e.pos),
    ...(args.roomObstacles ?? []),
  ];
  const reachSquares = Math.max(1, Math.floor(args.reachFt / SQUARE_SIZE));
  // Candidate end squares: any unoccupied square within reachSquares (Chebyshev)
  // of the target.
  const candidates: GridPos[] = [];
  for (let dx = -reachSquares; dx <= reachSquares; dx++) {
    for (let dy = -reachSquares; dy <= reachSquares; dy++) {
      if (dx === 0 && dy === 0) continue;
      const cand = { x: args.targetPos.x + dx, y: args.targetPos.y + dy };
      if (cand.x < 0 || cand.x >= gridW || cand.y < 0 || cand.y >= gridH) continue;
      if (blocked.some((b) => posEqual(b, cand))) continue;
      candidates.push(cand);
    }
  }
  // Prefer the candidate closest to the enemy's current position so the path
  // is minimal — the enemy moves only as far as needed.
  candidates.sort(
    (a, b) =>
      Math.max(Math.abs(args.enemyPos.x - a.x), Math.abs(args.enemyPos.y - a.y)) -
      Math.max(Math.abs(args.enemyPos.x - b.x), Math.abs(args.enemyPos.y - b.y))
  );
  const maxSquares = Math.max(0, Math.floor(args.speedFt / SQUARE_SIZE));
  for (const dest of candidates) {
    const path = findPath(args.enemyPos, dest, blocked, gridW, gridH);
    if (path && path.length > 0) {
      const truncated = path.slice(0, maxSquares);
      if (truncated.length === 0) {
        // Speed 0 — no movement at all.
        return { newPos: args.enemyPos, pathSquares: [], reached: false };
      }
      const newPos = truncated[truncated.length - 1];
      const reached =
        Math.max(Math.abs(newPos.x - args.targetPos.x), Math.abs(newPos.y - args.targetPos.y)) <=
        reachSquares;
      return { newPos, pathSquares: truncated, reached };
    }
  }
  return null;
}

// Resolves opportunity attacks PCs make against an enemy who walked out of
// their melee threat zone (SRD 5.2.1 p.191). Mirrors the PC-side OA loop in
// the grid_move handler: auto-fires for any PC with a reaction available and
// a melee weapon (or unarmed) in hand, consumes the PC's reaction, applies
// damage to the enemy entity, and marks the enemy killed if it hits 0 HP.
// Returns early as soon as the enemy is killed so subsequent PCs don't get
// to attack a corpse.
function applyPcOpportunityAttacks(args: {
  st: GameState;
  enemyId: string;
  oaTargets: CombatEntity[]; // PC entities whose threat zone was broken
  enemyAc: number;
  enemyName: string;
  context: Context;
}): { st: GameState; enemyKilled: boolean; narrative: string } {
  let st = args.st;
  let enemyHpNow = st.entities?.find((e) => e.id === args.enemyId && e.isEnemy)?.hp ?? 0;
  let enemyKilled = false;
  let narrative = '';
  for (const pcEnt of args.oaTargets) {
    if (enemyKilled) break;
    const pcIdx = st.characters.findIndex((c) => c.id === pcEnt.id);
    if (pcIdx < 0) continue;
    const pc = st.characters[pcIdx];
    if (pc.dead || pc.stable || pc.hp <= 0) continue;
    if (pc.turn_actions?.reaction_used) continue;
    // Incapacitated PCs can't take reactions.
    if (
      pc.conditions?.some((c) =>
        ['incapacitated', 'paralyzed', 'stunned', 'unconscious'].includes(c)
      )
    )
      continue;
    // OA can only be made with a melee weapon (PHB p.190). Ranged-only weapons
    // don't qualify; thrown melee weapons (handaxe, dagger) do because they
    // have a melee profile too.
    const weaponInstance = pc.equipped_weapon
      ? pc.inventory?.find((i) => i.instance_id === pc.equipped_weapon)
      : null;
    const weaponItem = weaponInstance
      ? args.context.lootTable.find((l) => l.id === weaponInstance.id)
      : null;
    if (weaponItem?.range === 'ranged' && !weaponItem.thrown) continue;
    const weaponProficient = hasWeaponProficiency(
      pc.weapon_proficiencies ?? [],
      weaponItem?.weaponType
    );
    const atk = resolvePlayerAttack(
      { str: pc.str, dex: pc.dex, level: pc.level },
      weaponItem?.damage ?? null,
      args.enemyAc,
      weaponItem?.finesse ?? false,
      false,
      false,
      weaponProficient,
      false,
      20,
      0,
      pc.species === 'halfling'
    );
    // Reaction consumed regardless of hit/miss.
    st = {
      ...st,
      characters: st.characters.map((c, i) =>
        i === pcIdx ? { ...c, turn_actions: { ...c.turn_actions, reaction_used: true } } : c
      ),
    };
    if (atk.hit) {
      enemyHpNow = Math.max(0, enemyHpNow - atk.damage);
      narrative += ` ⚔ ${pc.name} opportunity attack hits ${args.enemyName} for ${fmt.dmg(atk.damage)}!`;
      st = {
        ...st,
        entities: (st.entities ?? []).map((e) =>
          e.id === args.enemyId && e.isEnemy ? { ...e, hp: enemyHpNow } : e
        ),
      };
      if (enemyHpNow <= 0) {
        enemyKilled = true;
        st = {
          ...st,
          enemies_killed: [...st.enemies_killed, args.enemyId],
        };
        narrative += ` ${args.enemyName} drops!`;
      }
    } else {
      narrative += ` ⚔ ${pc.name} opportunity attack misses ${args.enemyName}.`;
    }
  }
  return { st, enemyKilled, narrative };
}

function runEnemyTurns(args: {
  st: GameState;
  seed: Seed;
  context: Context;
  worldName: string;
  startAdvIdx: number;
  startMultiattackIdx: number; // 0 = haven't started; N = N sub-attacks already done
  startRoundWrapped: boolean;
  initialCurrentIdx: number; // anchor for the safety "loop back to start" break
}): EnemyTurnResult {
  let st = args.st;
  let narrative = '';
  let advIdx = args.startAdvIdx;
  let roundWrapped = args.startRoundWrapped;
  const orderLen = st.initiative_order.length;
  let resumeMi = args.startMultiattackIdx;
  // Static obstacles in the current room — pathfinding for enemy approach
  // must route around these the same way PC movement does.
  const roomObstacleCells = args.seed.rooms.find((r) => r.id === st.current_room)?.obstacles ?? [];

  while (
    st.combat_active &&
    st.initiative_order[advIdx] &&
    (st.initiative_order[advIdx].is_enemy ||
      (st.characters.find((c) => c.id === st.initiative_order[advIdx].id)?.dead ?? false))
  ) {
    const eEntry = st.initiative_order[advIdx];
    const rm = getEnemyById(args.seed, eEntry.id);
    if (rm && !st.enemies_killed.includes(eEntry.id)) {
      // Surprised creatures skip their first turn entirely (2014 PHB
      // p.189 — Pansori's chosen surprise model; PC-side handling mirrors
      // this at the `Surprised — cannot act this round` choice). The
      // `surprised` array is cleared on round-wrap so the skip only
      // applies in round 1.
      if ((st.surprised ?? []).includes(eEntry.id)) {
        narrative += `\n\n[${rm.name} is surprised and loses their turn!]`;
        resumeMi = 0;
        const prevAdvIdxSurprise = advIdx;
        advIdx = (advIdx + 1) % orderLen;
        if (advIdx === 0 && prevAdvIdxSurprise !== 0) roundWrapped = true;
        if (advIdx === args.initialCurrentIdx) break;
        continue;
      }
      // SRD p.221 — legendary action pool refreshes at the start of the
      // legendary creature's own turn.
      if (rm.legendary_actions?.length) refreshLegendaryPool(args.seed, rm.id);
      const eEnt = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
      const nearestPcEntity = st.entities
        ?.filter((e) => !e.isEnemy && !e.isCompanion && e.hp > 0)
        .sort((a, b) => {
          if (!eEnt) return 0;
          return distanceFeet(eEnt.pos, a.pos) - distanceFeet(eEnt.pos, b.pos);
        })[0];
      const targetCharIdx = st.characters.findIndex((c) => c.id === nearestPcEntity?.id && !c.dead);
      if (targetCharIdx >= 0) {
        let target = st.characters[targetCharIdx];
        // 2024 PHB Hide DC tracking — when the target is invisible + has
        // recorded hide_dc, the enemy first tries passive Perception. If
        // that fails, they fall back to an active Search action (d20 + WIS
        // mod) — which replaces this turn's attack. Result:
        //   passive ≥ hide_dc       → spotted, attack proceeds normally
        //   passive < dc, active ≥  → spotted next turn, no attack this round
        //   passive < dc, active <  → PC stays hidden, no attack this round
        // This makes Hide actually deny enemy attacks instead of just
        // imposing disadvantage on a guaranteed swing.
        let hideBlockedAttack = false;
        if (target.conditions?.includes('invisible') && (target.hide_dc ?? 0) > 0) {
          const enemyWis = (rm as unknown as Record<string, number>)?.wis ?? 10;
          const passivePer = 10 + abilityMod(enemyWis);
          if (passivePer >= target.hide_dc!) {
            narrative += ` ${rm.name} spots ${target.name} (passive Perception ${passivePer} vs hide DC ${target.hide_dc}).`;
            target = {
              ...target,
              conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
              hide_dc: undefined,
            };
            st = {
              ...st,
              characters: st.characters.map((c, i) => (i === targetCharIdx ? target : c)),
            };
          } else {
            // Active Search instead of attacking.
            const activeSearch = rollDice('1d20') + abilityMod(enemyWis);
            if (activeSearch >= target.hide_dc!) {
              narrative += ` ${rm.name} actively searches and locates ${target.name}! (Search ${activeSearch} vs hide DC ${target.hide_dc}; attack forfeited this turn.)`;
              target = {
                ...target,
                conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
                hide_dc: undefined,
              };
              st = {
                ...st,
                characters: st.characters.map((c, i) => (i === targetCharIdx ? target : c)),
              };
            } else {
              narrative += ` ${rm.name} searches the room but cannot find ${target.name}. (Search ${activeSearch} vs hide DC ${target.hide_dc}; turn lost.)`;
            }
            hideBlockedAttack = true;
          }
        }
        if (hideBlockedAttack) {
          // End this enemy's turn — they used their action to Search.
          const prevAdvIdxHide = advIdx;
          advIdx = (advIdx + 1) % orderLen;
          if (advIdx === 0 && prevAdvIdxHide !== 0) roundWrapped = true;
          if (advIdx === args.initialCurrentIdx) break;
          continue;
        }
        if (!target.dead && target.hp > 0) {
          // ── Spell-cast intent ──────────────────────────────────────────────
          // If this enemy has a spell list and rolls under castChance, they
          // cast instead of melee-attacking this turn. resumeMi > 0 means we
          // already started a multi-attack last time — skip the cast check
          // on resume to avoid re-deciding mid-burst.
          if (
            resumeMi === 0 &&
            rm.spells &&
            rm.spells.length > 0 &&
            (rm.castChance ?? 0) > 0 &&
            Math.random() < (rm.castChance ?? 0)
          ) {
            const spellId = pick(rm.spells);
            const spell = args.context.spellTable?.[spellId];
            if (spell && spell.damage) {
              // Counterspell eligibility — check all party PCs.
              const reactor = st.characters.find((c) =>
                isCounterspellEligible(
                  c,
                  st.entities?.find((e) => e.id === c.id)?.pos,
                  eEnt?.pos,
                  args.context
                )
              );
              if (reactor) {
                st = {
                  ...st,
                  pending_reaction: {
                    kind: 'counterspell',
                    attackerEnemyId: eEntry.id,
                    targetCharId: reactor.id,
                    intendedTargetPcId: target.id,
                    enemySpellId: spellId,
                    enemySpellLevel: spell.level,
                    enemySpellName: spell.name,
                    // Counterspell collapses the WHOLE enemy turn — there's
                    // no further sub-attack to resume to. Point past this
                    // enemy so the loop continues with the next initiative slot.
                    resumeFromInitiativeIdx: (advIdx + 1) % orderLen,
                    resumeFromMultiattackIdx: 0,
                    narrativeSoFar: narrative,
                    eligibleCharIds: [reactor.id],
                  },
                  active_character_id: reactor.id,
                };
                narrative += ` ✨ ${rm.name} begins casting ${spell.name}! Counterspell available.`;
                return {
                  st,
                  narrative,
                  exitAdvIdx: advIdx,
                  roundWrapped,
                  paused: true,
                };
              }
              // No counterspeller — resolve the spell now and skip multi-attack.
              const dmgRoll = rollDice(spell.damage);
              if (spell.savingThrow) {
                const saveScore = (target[spell.savingThrow] ?? 10) as number;
                const dc = rm.spellSaveDC ?? 8 + Math.floor((rm.toHit + 5) / 2);
                const save = rollDice('1d20') + abilityMod(saveScore);
                const saved = save >= dc;
                const dmg =
                  saved && spell.saveEffect === 'half'
                    ? Math.floor(dmgRoll / 2)
                    : saved && spell.saveEffect === 'negates'
                      ? 0
                      : dmgRoll;
                target = { ...target, hp: Math.max(0, target.hp - dmg) };
                narrative += ` ${rm.name} casts ${spell.name}! ${target.name} ${fmt.save(spell.savingThrow.toUpperCase(), save)} vs ${fmt.dc(dc)} — ${saved ? 'saves' : 'fails'}, ${fmt.dmg(dmg)} ${spell.damageType ?? 'damage'}.`;
              } else {
                target = { ...target, hp: Math.max(0, target.hp - dmgRoll) };
                narrative += ` ${rm.name} casts ${spell.name}! ${target.name} takes ${fmt.dmg(dmgRoll)} ${spell.damageType ?? 'damage'}.`;
              }
              st = {
                ...st,
                characters: st.characters.map((c, i) => (i === targetCharIdx ? target : c)),
                entities: st.entities?.map((e) =>
                  e.id === target.id && !e.isEnemy ? { ...e, hp: target.hp } : e
                ),
              };
              // Skip the multi-attack — spell IS the action this turn.
              resumeMi = 0;
              const prevAdvIdx2 = advIdx;
              advIdx = (advIdx + 1) % orderLen;
              if (advIdx === 0 && prevAdvIdx2 !== 0) roundWrapped = true;
              if (advIdx === args.initialCurrentIdx) break;
              continue;
            }
          }

          // ── Tactical movement step ─────────────────────────────────────────
          // SRD 5.2.1 p.190 — an enemy that wants to melee must be within its
          // reach. Walk along the grid up to `speedFt` toward an in-reach
          // square next to the target. PCs whose threat zone is broken get
          // opportunity attacks. If we can't close to reach this turn (or an
          // OA drops the enemy), skip the attack entirely. Skipped when
          // resuming mid-multiattack (resumeMi > 0) since the move already
          // happened on the first sub-attack of this turn. Grappled/restrained
          // enemies have effective speed 0 and won't move.
          const reachFt = rm.attackReachFt ?? 5;
          const baseSpeedFt = rm.speedFt ?? DEFAULT_SPEED_FEET;
          const enemyEntPreMove = st.entities?.find((e) => e.id === eEntry.id && e.isEnemy);
          const targetEntPreMove = st.entities?.find((e) => e.id === target.id);
          const enemyImmobile =
            enemyEntPreMove?.conditions?.some((c) => c === 'grappled' || c === 'restrained') ??
            false;
          const effectiveEnemySpeedFt = enemyImmobile ? 0 : baseSpeedFt;
          const needsToMove =
            !!enemyEntPreMove &&
            !!targetEntPreMove &&
            distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos) > reachFt;
          if (resumeMi === 0 && needsToMove && enemyEntPreMove && targetEntPreMove) {
            narrative += `\n\n[${rm.name}'s turn]`;
            const plan = planEnemyApproach({
              st,
              enemyId: eEntry.id,
              enemyPos: enemyEntPreMove.pos,
              targetPos: targetEntPreMove.pos,
              reachFt,
              speedFt: effectiveEnemySpeedFt,
              context: args.context,
              roomId: st.current_room,
              roomObstacles: roomObstacleCells,
            });
            const distBefore = distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos);
            if (!plan || plan.pathSquares.length === 0) {
              narrative += enemyImmobile
                ? ` ${rm.name} is held in place (${enemyEntPreMove.conditions.includes('restrained') ? 'restrained' : 'grappled'}) and can't reach ${target.name} this turn.`
                : ` ${rm.name} can't find a path to ${target.name} this turn.`;
              resumeMi = 0;
              const prevAdvIdxMove = advIdx;
              advIdx = (advIdx + 1) % orderLen;
              if (advIdx === 0 && prevAdvIdxMove !== 0) roundWrapped = true;
              if (advIdx === args.initialCurrentIdx) break;
              continue;
            }
            // Apply PC opportunity attacks from squares the enemy is leaving.
            const oaTriggers = opportunityAttackTriggers(
              enemyEntPreMove.pos,
              plan.newPos,
              st.entities ?? [],
              true
            );
            const oaRes = applyPcOpportunityAttacks({
              st,
              enemyId: eEntry.id,
              oaTargets: oaTriggers,
              enemyAc: rm.ac,
              enemyName: rm.name,
              context: args.context,
            });
            st = oaRes.st;
            const stepsFt = plan.pathSquares.length * SQUARE_SIZE;
            narrative += ` ${rm.name} closes ${stepsFt} ft toward ${target.name} (${distBefore} ft → ${distanceFeet(plan.newPos, targetEntPreMove.pos)} ft).${oaRes.narrative}`;
            if (oaRes.enemyKilled) {
              resumeMi = 0;
              const prevAdvIdxOa = advIdx;
              advIdx = (advIdx + 1) % orderLen;
              if (advIdx === 0 && prevAdvIdxOa !== 0) roundWrapped = true;
              if (advIdx === args.initialCurrentIdx) break;
              continue;
            }
            // Commit the new enemy position.
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === eEntry.id ? { ...e, pos: plan.newPos } : e
              ),
            };
            if (!plan.reached) {
              narrative += ` ${rm.name} is still out of reach — no attack this round.`;
              resumeMi = 0;
              const prevAdvIdxStill = advIdx;
              advIdx = (advIdx + 1) % orderLen;
              if (advIdx === 0 && prevAdvIdxStill !== 0) roundWrapped = true;
              if (advIdx === args.initialCurrentIdx) break;
              continue;
            }
          }
          // If we already moved we've printed the turn header; otherwise print
          // it now so multi-attack resume narratives don't double up.
          const movementHeaderPrinted = resumeMi === 0 && needsToMove;
          const attackCount = rm.multiattack ?? 1;
          if (resumeMi === 0 && !movementHeaderPrinted) {
            narrative += `\n\n[${rm.name}'s turn]`;
          }
          let massiveDeath = false;
          for (let mi = resumeMi; mi < attackCount && target.hp > 0; mi++) {
            const atkResult = applyEnemyAttackNarrative(rm, target, args.context);
            // Shield reaction window — pause the loop if the defender can
            // negate this hit. The d20 has already been rolled; on resume
            // the saved damage/narrative either fires (decline) or is
            // discarded (accept).
            if (
              atkResult.hit &&
              isShieldEligible(target, atkResult.atkTotal, target.ac, args.context)
            ) {
              st = {
                ...st,
                pending_reaction: {
                  kind: 'shield',
                  attackerEnemyId: eEntry.id,
                  targetCharId: target.id,
                  atkTotal: atkResult.atkTotal,
                  targetAcAtAttack: target.ac,
                  pendingDamage: atkResult.hpLost,
                  pendingNarrative: atkResult.narrative,
                  resumeFromInitiativeIdx: advIdx,
                  resumeFromMultiattackIdx: mi + 1,
                  narrativeSoFar: narrative,
                  eligibleCharIds: [target.id],
                },
                // Put the reactor in the driver's seat so the frontend prompts them.
                active_character_id: target.id,
              };
              narrative += ` ⚡ ${rm.name} strikes ${target.name} — total ${fmt.roll(atkResult.atkTotal)} vs ${fmt.ac(target.ac)}. Shield available!`;
              return {
                st,
                narrative,
                exitAdvIdx: advIdx,
                roundWrapped,
                paused: true,
              };
            }
            const prevHp = target.hp;
            let proposedHp = Math.max(0, target.hp - atkResult.hpLost);
            // 2024 PHB Orc Relentless Endurance — when reduced to 0 HP
            // (and not killed outright by massive damage), the Orc drops
            // to 1 HP instead. 1/long rest, tracked via class_resource_uses.
            const orcReUsed = target.class_resource_uses?.relentless_endurance_used === 1;
            let orcSaveFired = false;
            if (
              target.species === 'orc' &&
              !orcReUsed &&
              prevHp > 0 &&
              proposedHp === 0 &&
              !isMassiveDamageDeath(prevHp, atkResult.hpLost, target.max_hp)
            ) {
              proposedHp = 1;
              orcSaveFired = true;
            }
            target = {
              ...target,
              hp: proposedHp,
              temp_hp: atkResult.newTempHp ?? target.temp_hp,
              conditions: atkResult.newConditions,
              condition_durations: atkResult.newDurations,
              class_resource_uses: orcSaveFired
                ? {
                    ...(atkResult.updatedResourceUses ?? target.class_resource_uses ?? {}),
                    relentless_endurance_used: 1,
                  }
                : (atkResult.updatedResourceUses ?? target.class_resource_uses),
              // 2024 PHB Heroic Inspiration: if the target spent it on the
              // save vs onHitEffect, clear the flags so it can't be re-spent.
              inspiration: atkResult.inspirationConsumed ? false : target.inspiration,
              turn_actions: atkResult.inspirationConsumed
                ? { ...target.turn_actions, inspiration_pending: false }
                : target.turn_actions,
              // 2024 PHB Bardic Inspiration: similar — clear if spent.
              bardic_inspiration_die: atkResult.bardicConsumed
                ? undefined
                : target.bardic_inspiration_die,
            };
            if (orcSaveFired) {
              narrative += ` 🪓 Relentless Endurance! ${target.name} stays standing at ${fmt.hp(1)} HP.`;
            }
            const concAtk = checkConcentration(target, st, atkResult.hpLost);
            target = concAtk.char;
            st = concAtk.st;
            narrative += ` ${atkResult.narrative}${concAtk.note}`;
            // Emit a structured event for the enemy's attack outcome so the
            // frontend combat log can render it separately from the prose.
            if (atkResult.hit) {
              st = pushEvent(st, {
                kind: 'attack_hit',
                attackerId: eEntry.id,
                attackerName: rm.name,
                targetId: target.id,
                targetName: target.name,
                damage: atkResult.hpLost,
                damageType: 'physical',
                isCrit: false,
                toHit: atkResult.atkTotal,
                targetAc: target.ac,
                round: st.round ?? 1,
              });
            } else {
              st = pushEvent(st, {
                kind: 'attack_miss',
                attackerId: eEntry.id,
                attackerName: rm.name,
                targetId: target.id,
                targetName: target.name,
                toHit: atkResult.atkTotal,
                targetAc: target.ac,
                round: st.round ?? 1,
              });
            }
            if (isMassiveDamageDeath(prevHp, atkResult.hpLost, target.max_hp)) {
              target = { ...target, dead: true, stable: false };
              narrative += ` MASSIVE DAMAGE — ${target.name} is killed outright!`;
              massiveDeath = true;
              break;
            }

            // Hellish Rebuke (PHB p.252) — triggers AFTER damage applies.
            // The damage is already on the books in `target`; if the player
            // accepts, the resolve path deals damage back to the attacker.
            // Commit the new target HP to state BEFORE pausing so the
            // resumed run sees the correct HP.
            if (atkResult.hit && atkResult.hpLost > 0 && target.hp > 0) {
              const myPos = st.entities?.find((e) => e.id === target.id)?.pos;
              if (isHellishRebukeEligible(target, myPos, eEnt?.pos, args.context)) {
                st = {
                  ...st,
                  characters: st.characters.map((c, i) => (i === targetCharIdx ? target : c)),
                  entities: st.entities?.map((e) =>
                    e.id === target.id && !e.isEnemy ? { ...e, hp: target.hp } : e
                  ),
                  pending_reaction: {
                    kind: 'hellish_rebuke',
                    attackerEnemyId: eEntry.id,
                    targetCharId: target.id,
                    resumeFromInitiativeIdx: advIdx,
                    resumeFromMultiattackIdx: mi + 1,
                    narrativeSoFar: narrative,
                    eligibleCharIds: [target.id],
                  },
                  active_character_id: target.id,
                };
                narrative += ` 🔥 ${target.name} could retaliate with Hellish Rebuke!`;
                return {
                  st,
                  narrative,
                  exitAdvIdx: advIdx,
                  roundWrapped,
                  paused: true,
                };
              }
            }
          }

          if (target.hp <= 0 && !target.dead && !massiveDeath) {
            const {
              narrative: dsNarr,
              newChar: newTarget,
              endedCombat,
            } = processDeathSave(
              { ...target, death_saves: target.death_saves ?? { successes: 0, failures: 0 } },
              rm,
              args.context,
              args.worldName
            );
            target = newTarget;
            narrative += ' ' + dsNarr;
            if (endedCombat) st = endCombatState(st);
          } else if (massiveDeath) {
            const allDead = st.characters.every((c, i) => (i === targetCharIdx ? true : c.dead));
            if (allDead) st = endCombatState(st);
          }
          st = {
            ...st,
            characters: st.characters.map((c, i) => (i === targetCharIdx ? target : c)),
          };
          if (st.entities) {
            st = {
              ...st,
              entities: st.entities.map((e) =>
                e.id === target.id && !e.isEnemy ? { ...e, hp: target.hp } : e
              ),
            };
          }
        }
      }
    }

    // Reset resumeMi after the first iteration; subsequent enemies start fresh.
    resumeMi = 0;
    const prevAdvIdx = advIdx;
    advIdx = (advIdx + 1) % orderLen;
    if (advIdx === 0 && prevAdvIdx !== 0) roundWrapped = true;
    if (advIdx === args.initialCurrentIdx) break;
  }

  return { st, narrative, exitAdvIdx: advIdx, roundWrapped, paused: false };
}

// ─── Main action handler ──────────────────────────────────────────────────────

export async function takeAction({
  action,
  history = [],
  state,
  seed: seedArg,
  context,
}: {
  action: StructuredAction;
  history: unknown[];
  state: GameState;
  seed: Seed;
  context: Context;
}) {
  void history;

  const prevRoomId = state.current_room;
  // Allow mutation in travel case (rebinding local variable only)
  let seed = seedArg;

  // Resolve and clone the active character
  const charIdx = state.characters.findIndex((c) => c.id === state.active_character_id);
  const safeIdx = charIdx >= 0 ? charIdx : 0;
  let char: Character = { ...state.characters[safeIdx] };

  // Clone world state
  let st: GameState = {
    ...state,
    enemies_killed: state.enemies_killed || [],
    loot_taken: state.loot_taken || [],
    combat_active: state.combat_active ?? false,
    initiative_order: state.initiative_order ?? [],
    initiative_idx: state.initiative_idx ?? 0,
    room_log: state.room_log ?? [],
    short_rested_rooms: state.short_rested_rooms ?? [],
    long_rested: state.long_rested ?? false,
    npc_attitudes: state.npc_attitudes ?? {},
    npc_talked: state.npc_talked ?? [],
    objects_searched: state.objects_searched ?? [],
    flags: state.flags ?? {},
  };

  // Re-apply boss phase effects to the seed (fresh from DB each request) so
  // any boss whose phase_index > 0 has the current statline before resolving
  // the player's action.
  rehydrateBossPhases(seed, st);

  // Ensure character fields have safe defaults
  char = {
    ...char,
    conditions: char.conditions ?? [],
    condition_durations: char.condition_durations ?? {},
    death_saves: char.death_saves ?? { successes: 0, failures: 0 },
    stable: char.stable ?? false,
    dead: char.dead ?? false,
    turn_actions: char.turn_actions ?? { ...FRESH_TURN },
    inventory: char.inventory ?? [],
    hit_die: char.hit_die ?? 8,
    hit_dice_remaining: char.hit_dice_remaining ?? char.level ?? 1,
    class_resource_uses: char.class_resource_uses ?? {},
    asi_pending: char.asi_pending ?? false,
    exhaustion_level: char.exhaustion_level ?? 0,
    spell_slots_max: char.spell_slots_max ?? {},
    spell_slots_used: char.spell_slots_used ?? {},
    spells_known: char.spells_known ?? [],
    background_id: char.background_id ?? null,
    skill_proficiencies: char.skill_proficiencies ?? [],
    tool_proficiencies: char.tool_proficiencies ?? [],
    armor_proficiencies: char.armor_proficiencies ?? [],
    weapon_proficiencies: char.weapon_proficiencies ?? [],
    attuned_items: char.attuned_items ?? [],
  };

  const worldName = getWorldName(seed);
  const roomId = st.current_room;
  // Static obstacle cells (columns, walls, debris) in the current room.
  // Combined with entity positions when computing cover bonuses below so
  // the grid feels tactically real.
  const roomObstacleCells = seed.rooms.find((r) => r.id === roomId)?.obstacles ?? [];
  // Living enemies in this room (multi-enemy support). For legacy narrative use,
  // `enemy` is the first living enemy; resolution code should target a specific
  // enemy via `action.targetEnemyId`.
  const livingEnemiesInRoom = getLivingRoomEnemies(st, seed, roomId).filter((e) => {
    const ent = st.entities?.find((ent) => ent.id === e.id && ent.isEnemy);
    return ent ? ent.hp > 0 : true;
  });
  const enemy: Enemy | undefined = livingEnemiesInRoom[0];
  const enemyAlive = livingEnemiesInRoom.length > 0;
  const loot = seed.loot?.[roomId];
  const lootAvail = loot && !st.loot_taken.includes(roomId);
  const adjacent = (seed.connections[roomId] || [])
    .map((id) => seed.rooms.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  let narrative = '';
  let escaped = false;
  // Track whether initiative was used this action (determines active_character advancement)
  let usedInitiative = false;

  // ── Undetected trap fires on first action in room ─────────────────────────
  // (Detected traps offer a 'disarm_trap' choice instead; this handles the case
  //  where no character's passive Perception beat the trap DC.)
  if (action.type !== 'disarm_trap' && action.type !== 'move') {
    const hiddenTrap = getRoomTrap(roomId, seed, context);
    if (hiddenTrap && !trapSpent(st, roomId) && !partyDetectsTrap(st.characters, hiddenTrap)) {
      st.traps_triggered = [...(st.traps_triggered ?? []), roomId];
      const trapDmg = rollDice(hiddenTrap.damage);
      char.hp = Math.max(0, char.hp - trapDmg);
      narrative +=
        hiddenTrap.triggerNarrative
          .replace(/{name}/g, char.name)
          .replace(/{dmg}/g, String(trapDmg)) + ' ';
      if (hiddenTrap.condition && char.hp > 0) {
        char.conditions = [...new Set([...char.conditions, hiddenTrap.condition])];
        if (hiddenTrap.conditionDuration)
          char.condition_durations = {
            ...char.condition_durations,
            [hiddenTrap.condition]: hiddenTrap.conditionDuration,
          };
      }
      commitChar();
    }
  }

  // Helper: write char back to st, and sync HP into grid entity if present
  function commitChar() {
    const updatedChars = st.characters.map((c, i) => (i === safeIdx ? char : c));
    let updatedEntities = st.entities;
    if (updatedEntities) {
      updatedEntities = updatedEntities.map((e) =>
        e.id === char.id && !e.isEnemy ? { ...e, hp: char.hp, conditions: char.conditions } : e
      );
    }
    st = { ...st, characters: updatedChars, entities: updatedEntities };
  }

  // ── Death saves override all actions when HP = 0 ───────────────────────────
  if (char.hp <= 0 && !char.dead) {
    if (char.stable) {
      if (action.type === 'use') {
        const held = char.inventory?.find((i) => i.id === action.itemId);
        if (held) {
          const itemData = getItemData(held, context);
          if (itemData.heal) {
            const healed = rollDice(itemData.heal);
            const firstIdx = char.inventory.findIndex((i) => i.id === held.id);
            char.hp = Math.min(char.max_hp, 1 + healed);
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            char.stable = false;
            narrative = `Barely conscious, you manage to use the ${held.name} — you recover ${fmt.hp(healed)} HP and pull yourself up (now ${fmt.hp(char.hp, char.max_hp)}).`;
          } else {
            narrative = `You are stable but unconscious. Only a healing item can restore you.`;
          }
        } else {
          narrative = `You are stable but unconscious. Only a healing item can restore you.`;
        }
      } else {
        narrative = `You are stable but unconscious. You need a healing item to regain consciousness.`;
      }
    } else {
      const {
        narrative: dsNarr,
        newChar,
        died,
        endedCombat,
      } = processDeathSave(char, enemyAlive ? enemy : null, context, worldName);
      narrative = dsNarr;
      char = newChar;
      if (endedCombat) st = endCombatState(st);
      if (died) {
        commitChar();
        const allDead = st.characters.every((c) => c.dead);
        st.run_log = [
          ...(st.run_log || []),
          { character_id: char.id, action: action.type, narrative },
        ];
        // Multi-PC parties: when one PC dies on their death save, the
        // remaining living PCs continue. Advance active_character_id off
        // the corpse and surface choices for the next living PC so the
        // run isn't soft-locked. (Solo party / TPK: allDead is true and
        // there's nothing to advance to — the front-end shows the
        // game-over screen.)
        if (!allDead) {
          const livingAfterDeath = st.characters.filter((c) => !c.dead);
          if (livingAfterDeath.length > 0) {
            st.active_character_id = livingAfterDeath[0].id;
          }
          st.last_choices = generateChoices(st, seed, context);
          return {
            narrative,
            choices: st.last_choices,
            newState: st,
            escaped: false,
            dead: false,
          };
        }
        return { narrative, choices: [], newState: st, escaped: false, dead: allDead };
      }
    }
    commitChar();
    // Advance to next living character round-robin (death save = passive, not a true turn)
    const living = st.characters.filter((c) => !c.dead);
    if (living.length > 0) {
      const idx = living.findIndex((c) => c.id === char.id);
      st.active_character_id = living[(idx + 1) % living.length].id;
    }
    st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    st.last_choices = generateChoices(st, seed, context);
    return { narrative, choices: st.last_choices, newState: st, escaped: false, dead: false };
  }

  // Exhaustion level 6 = death (PHB p.291)
  if ((char.exhaustion_level ?? 0) >= 6 && !char.dead) {
    char.dead = true;
    narrative = `${char.name} succumbs to exhaustion (level 6) and dies.`;
    commitChar();
    st.run_log = [...(st.run_log || []), { character_id: char.id, action: action.type, narrative }];
    const allDeadExhaustion = st.characters.every((c) => c.dead);
    st.last_choices = generateChoices(st, seed, context);
    return {
      narrative,
      choices: st.last_choices,
      newState: st,
      escaped: false,
      dead: allDeadExhaustion,
    };
  }

  // Action handlers extracted into services/actions/* receive this ctx and
  // mutate its fields in place. When `dispatchAction` returns true, the
  // handler ran — we sync the working-state fields back into the local
  // bindings and skip the legacy inline switch. When it returns false
  // (no handler registered for this action type yet), the inline switch
  // below handles it. PRs land one handler at a time until the switch
  // empties out.
  const ctx: ActionContext = {
    context,
    state,
    worldName,
    safeIdx,
    prevRoomId,
    roomId,
    roomObstacleCells,
    livingEnemiesInRoom,
    enemy,
    enemyAlive,
    loot,
    lootAvail,
    adjacent,
    seed,
    st,
    char,
    narrative,
    escaped,
    usedInitiative,
    commitChar() {
      const updatedChars = this.st.characters.map((c, i) => (i === this.safeIdx ? this.char : c));
      let updatedEntities = this.st.entities;
      if (updatedEntities) {
        updatedEntities = updatedEntities.map((e) =>
          e.id === this.char.id && !e.isEnemy
            ? { ...e, hp: this.char.hp, conditions: this.char.conditions }
            : e
        );
      }
      this.st = { ...this.st, characters: updatedChars, entities: updatedEntities };
    },
  };

  const handled = await dispatchAction(ctx, action);
  if (handled) {
    seed = ctx.seed;
    st = ctx.st;
    char = ctx.char;
    narrative = ctx.narrative;
    escaped = ctx.escaped;
    usedInitiative = ctx.usedInitiative;
  }

  if (!handled)
    switch (action.type) {
      case 'move': {
        const target = seed.rooms.find((r) => r.id === action.roomId);
        if (!target || !adjacent.find((r) => r.id === target.id)) {
          narrative = 'The path loops back on itself. You cannot get there from here.';
          break;
        }
        // Grappled / restrained: speed reduced to 0 — cannot move
        const immobilizer = char.conditions.find((c) => ['grappled', 'restrained'].includes(c));
        if (immobilizer) {
          narrative = `You are ${immobilizer} and cannot move.`;
          break;
        }
        if (st.combat_active) {
          narrative = `You cannot flee while in grid combat. Use Disengage and move on the grid.`;
          break;
        }
        // Hostile present — engage or escape, don't stroll past.
        if (enemyAlive) {
          narrative =
            'A hostile is in this room — engage it or attempt to escape before moving on.';
          break;
        }
        st.current_room = target.id;
        if (!st.visited_rooms.includes(target.id)) {
          st.visited_rooms = [...st.visited_rooms, target.id];
        }
        narrative += buildArrivalNarrative(
          target.id,
          { ...st, characters: st.characters.map((c, i) => (i === safeIdx ? char : c)) },
          seed,
          context
        );
        break;
      }

      case 'attack': {
        if (!enemy) {
          narrative = pick(context.narratives.noEnemy);
          break;
        }
        if (!enemyAlive) {
          narrative = pick(context.narratives.alreadyDead);
          break;
        }

        // Resolve targeted enemy: explicit targetEnemyId wins; fallback to first living
        const targetEnemyId: string =
          (action as { type: 'attack'; targetEnemyId?: string }).targetEnemyId ?? enemy.id;
        const target: Enemy = livingEnemiesInRoom.find((e) => e.id === targetEnemyId) ?? enemy;
        const targetId = target.id;

        // Grid range check — only applies when combat entities are tracked on the grid
        if (st.entities) {
          const charEntity = st.entities.find((e) => e.id === char.id);
          const enemyEntity = st.entities.find((e) => e.id === targetId && e.isEnemy);
          if (charEntity && enemyEntity) {
            const equippedWeaponItem = char.equipped_weapon
              ? getItemData(
                  char.inventory?.find(
                    (i) => i.instance_id === char.equipped_weapon
                  ) as InventoryItem,
                  context
                )
              : null;
            if (!inRange(charEntity.pos, enemyEntity.pos, equippedWeaponItem)) {
              narrative = `Out of range. Move closer before attacking.`;
              break;
            }
          }
        }

        // Charmed: cannot attack the charmer
        if (
          char.conditions.includes('charmed') &&
          char.charmer_id &&
          char.charmer_id === targetId
        ) {
          narrative = `You are charmed by the ${target.name} and cannot bring yourself to attack them.`;
          break;
        }

        // Incapacitation is handled upstream in generateChoices (pass action); guard here as a safety net
        if (char.conditions.includes('paralyzed') || char.conditions.includes('stunned')) {
          narrative = `You cannot act while ${char.conditions.find((c) => c === 'stunned' || c === 'paralyzed')}.`;
          usedInitiative = true;
          break;
        }

        const weaponItem = char.equipped_weapon
          ? getItemData(
              char.inventory?.find((i) => i.instance_id === char.equipped_weapon) as InventoryItem,
              context
            )
          : null;
        let weaponDamage = weaponItem?.damage ?? null;
        // 2024 PHB Beast Forms — while shifted, the form's natural attack
        // damage replaces the equipped weapon's. The druid's own to-hit
        // (STR/DEX + prof) still applies — the form's RAW attack bonus is
        // similar in magnitude so the engine's calculated to-hit is a
        // reasonable proxy. (Future: a separate override path if we model
        // beast STR/DEX explicitly.)
        if (char.conditions.includes('wild_shaped') && char.wild_shape_form) {
          const form = BEAST_FORMS[char.wild_shape_form];
          if (form) weaponDamage = form.attackDamage;
        }
        // Versatile: use two-handed damage when no shield is equipped.
        // 2024 PHB Flex mastery (longsword, battleaxe, warhammer) lets a
        // trained wielder use the versatile die EVEN with a shield equipped.
        const hasFlexMastery =
          weaponItem?.mastery === 'flex' && (char.weapon_masteries ?? []).includes(weaponItem.id);
        const isVersatile = !!(
          weaponItem?.versatileDamage &&
          (!char.equipped_shield || hasFlexMastery)
        );
        if (isVersatile) {
          weaponDamage = weaponItem!.versatileDamage!;
        }
        const weaponLabel = weaponItem ? `Your ${weaponItem.name}` : 'Your fists';

        // ── Ammunition check (PHB p.146) ──────────────────────────────────────
        if (weaponItem?.range === 'ranged' && !weaponItem.thrown) {
          // Determine ammo type — convention: arrows for bows, bolts for crossbows, bullets for slings
          const ammoTypes: Record<string, string[]> = {
            bow: ['arrow', 'arrows'],
            crossbow: ['bolt', 'bolts'],
            sling: ['bullet', 'bullets', 'sling_bullet'],
          };
          const wepKey = Object.keys(ammoTypes).find((k) => weaponItem.id.includes(k)) ?? 'arrow';
          const ammoIds = ammoTypes[wepKey] ?? ['arrow', 'arrows'];
          const ammoIdx = char.inventory.findIndex((i) => ammoIds.some((a) => i.id.includes(a)));
          if (ammoIdx === -1) {
            narrative = `You have no ammunition for your ${weaponItem.name}.`;
            break;
          }
          const ammoItem = char.inventory[ammoIdx];
          const ammoCount = (ammoItem.count as number | undefined) ?? 1;
          if (ammoCount <= 1) {
            char.inventory = char.inventory.filter((_, i) => i !== ammoIdx);
          } else {
            char.inventory = char.inventory.map((item, i) =>
              i === ammoIdx ? { ...item, count: ammoCount - 1 } : item
            );
          }
        }

        // ── Start combat on first attack — roll initiative for all ─────────────
        if (!st.combat_active) {
          const enemiesForInit = livingEnemiesInRoom;
          const order = buildInitiativeOrder(st.characters, enemiesForInit);
          st.combat_active = true;

          // Assign initiative_roll to each character in the order
          const updatedCharsForInit = st.characters.map((c) => {
            const entry = order.find((e) => e.id === c.id);
            return entry ? { ...c, initiative_roll: entry.roll } : c;
          });
          st = { ...st, characters: updatedCharsForInit, initiative_order: order };

          // Refresh char from updated characters array
          const freshChar = updatedCharsForInit.find((c) => c.id === char.id);
          if (freshChar) char = { ...freshChar };
          char.turn_actions = { ...FRESH_TURN };

          // ── Initialize grid entities at combat start ────────────────────────
          if (!st.entities) {
            const gw = context.gridWidth ?? 8;
            const gh = context.gridHeight ?? 8;
            const pcEntities: CombatEntity[] = st.characters.map((c, ci) => ({
              id: c.id,
              isEnemy: false,
              pos: { x: 1 + ci, y: 1 },
              hp: c.hp,
              maxHp: c.max_hp,
              conditions: c.conditions,
              condition_durations: c.condition_durations,
            }));
            // Beastmaster Ranger L3+ enters combat with an animal companion
            // (Wolf, MM stats: HP 11, AC 13, +4 to hit, 2d4+2 bite). PHB p.93.
            const companionEntities: CombatEntity[] = st.characters
              .filter(
                (c) =>
                  !c.dead &&
                  c.character_class.toLowerCase() === 'ranger' &&
                  c.subclass === 'beastmaster' &&
                  c.level >= 3
              )
              .map((c, ci) => ({
                id: `${c.id}:companion`,
                isEnemy: false,
                isCompanion: true,
                companionOwnerId: c.id,
                companionName: 'Wolf',
                pos: { x: 1 + ci, y: 2 },
                hp: 11,
                maxHp: 11,
                ac: 13,
                toHit: 4,
                damage: '2d4+2',
                conditions: [],
                condition_durations: {},
              }));
            // One grid entity per living enemy, spaced out along the far edge
            const enemyEntities: CombatEntity[] = enemiesForInit.map((en, ei) => ({
              id: en.id,
              isEnemy: true,
              pos: { x: Math.max(0, gw - 2 - ei), y: Math.max(0, gh - 2) },
              hp: en.hp,
              maxHp: en.hp,
              conditions: [],
              condition_durations: {},
            }));
            st = {
              ...st,
              entities: [...pcEntities, ...companionEntities, ...enemyEntities],
              movement_used: {},
            };
          }

          // ── Surprise check (PHB p.189) ────────────────────────────────────
          // If the party averages a higher Stealth than the highest passive Perception
          // among the enemies, all enemies are surprised for round 1.
          const partyAvgStealth = Math.round(
            st.characters
              .filter((c) => !c.dead)
              .reduce((sum, c) => {
                const prof = c.skill_proficiencies?.includes('Stealth') ?? false;
                return sum + rollDice('1d20') + abilityMod(c.dex) + (prof ? profBonus(c.level) : 0);
              }, 0) / Math.max(1, st.characters.filter((c) => !c.dead).length)
          );
          const enemyPassivePerc = Math.max(
            ...enemiesForInit.map((e) => 10 + abilityMod(e.wis ?? 10))
          );
          if (partyAvgStealth > enemyPassivePerc) {
            st = { ...st, surprised: enemiesForInit.map((e) => e.id) };
          }

          const orderText = order
            .map((e) => {
              const name = e.is_enemy
                ? (enemiesForInit.find((en) => en.id === e.id)?.name ?? 'Enemy')
                : (st.characters.find((c) => c.id === e.id)?.name ?? 'Hero');
              return `${name}(${e.roll})`;
            })
            .join(' → ');
          const surpriseLabel =
            enemiesForInit.length === 1
              ? `The ${enemiesForInit[0].name} is SURPRISED!`
              : `${enemiesForInit.map((e) => e.name).join(', ')} are SURPRISED!`;
          const surpriseNote = st.surprised?.length ? ` ${surpriseLabel}` : '';
          const combatPrefix = context.narratives.combatStart
            ? pick(context.narratives.combatStart).replace(/{enemy}/g, target.name) + ' '
            : 'Combat begins! ';
          narrative = `${combatPrefix}Initiative: ${orderText}.${surpriseNote} `;

          // Find this character's position in the initiative order
          const myInitIdx = order.findIndex((e) => e.id === char.id);
          st.initiative_idx = myInitIdx >= 0 ? myInitIdx : 0;

          const myRoll = order.find((e) => e.id === char.id)?.roll ?? 0;
          // The triggering PC's attack runs immediately — they had the
          // element of surprise on the encounter even if their initiative
          // wasn't highest. After this opening swing, play returns to the
          // initiative order at the slot just past them (handled by the
          // post-attack initiative advance). Honest framing avoids the
          // misleading "X acts (initiative N)!" line when N wasn't first.
          const isHighestInit = myInitIdx === 0;
          narrative += isHighestInit
            ? `${char.name} acts first (initiative ${myRoll})! `
            : `${char.name} strikes with the opening blow (initiative ${myRoll})! `;
        }

        // ── Resolve the player's attack ────────────────────────────────────────
        // Armor proficiency check (PHB p.144): non-proficient armor → disadv on STR/DEX attack rolls
        const equippedArmorLootItem = char.equipped_armor
          ? context.lootTable.find(
              (l) => l.id === char.inventory?.find((i) => i.instance_id === char.equipped_armor)?.id
            )
          : null;
        const armorProficient = hasArmorProficiency(
          char.armor_proficiencies ?? [],
          equippedArmorLootItem?.armorCategory
        );
        // Weapon proficiency check (PHB p.147): non-proficient weapon → no profBonus (passed to resolvePlayerAttack)
        const weaponProficient = hasWeaponProficiency(
          char.weapon_proficiencies ?? [],
          weaponItem?.weaponType
        );

        const rangedInMelee = weaponItem?.range === 'ranged';
        const conditionDisadv = char.conditions.some((c) => DISADV_CONDITIONS.has(c));
        const exhaustionDisadv = (char.exhaustion_level ?? 0) >= 3; // exhaustion 3+: disadv on attack rolls
        const heavyEncumberedDisadv = isHeavilyEncumbered(char); // 2024 PHB variant encumbrance
        // SRD 5.2.1 p.90 — Small species (Halfling, Gnome) have disadvantage
        // when attacking with a Heavy weapon.
        const smallSpecies = char.species ? SRD_SPECIES[char.species]?.size === 'small' : false;
        const heavyWeaponSmallDisadv = !!(weaponItem?.heavy && smallSpecies);
        const conditionAdv = char.conditions.some((c) => PLAYER_ADV_CONDITIONS.has(c));
        const enemyEntity2 = st.entities?.find((e) => e.id === targetId && e.isEnemy);
        const enemyGrappled = enemyEntity2?.conditions.includes('grappled') ?? false;
        const enemyProne = enemyEntity2?.conditions.includes('prone') ?? false;
        const enemyParalyzed = enemyEntity2?.conditions.includes('paralyzed') ?? false;
        // Unconscious: auto-crit when attacker is within 5ft
        const enemyUnconscious = enemyEntity2?.conditions.includes('unconscious') ?? false;
        // Prone: melee attacks have advantage, ranged attacks have disadvantage
        const proneAdv = enemyProne && weaponItem?.range !== 'ranged';
        const proneDisadv = enemyProne && weaponItem?.range === 'ranged';
        // Thrown weapon beyond normal range: disadvantage (PHB p.147)
        let thrownLongRangeDisadv = false;
        if (weaponItem?.thrown && st.entities) {
          const charEnt = st.entities.find((e) => e.id === char.id);
          const enemyEnt = st.entities.find((e) => e.id === targetId && e.isEnemy);
          if (charEnt && enemyEnt) {
            const dist = distanceFeet(charEnt.pos, enemyEnt.pos);
            if (dist > weaponItem.thrown.normalRange) thrownLongRangeDisadv = true;
          }
        }

        // Cover bonus: raise enemy's effective AC from obstacles between attacker and target
        let coverAcBonus = 0;
        let flankingAdv = false;
        if (st.entities) {
          const charEntity = st.entities.find((e) => e.id === char.id);
          const enemyEntity = st.entities.find((e) => e.id === targetId && e.isEnemy);
          if (charEntity && enemyEntity) {
            const obstacles = [
              ...st.entities.filter((e) => e.id !== char.id && e.id !== targetId).map((e) => e.pos),
              ...roomObstacleCells,
            ];
            coverAcBonus = coverBonus(charEntity.pos, enemyEntity.pos, obstacles);
            // Flanking (PHB optional): ally on opposite side of enemy grants advantage
            const flankingAlly = st.entities.find(
              (e) =>
                !e.isEnemy &&
                e.id !== char.id &&
                isFlankingPosition(charEntity.pos, e.pos, enemyEntity.pos)
            );
            if (flankingAlly) flankingAdv = true;
          }
        }

        // Help action advantage: another character used Help targeting this one
        const helpAdv = st.help_target_id === char.id;
        if (helpAdv) st = { ...st, help_target_id: undefined };

        // Assassin: advantage vs creatures who haven't acted (surprised list or first round)
        const assassinAdv =
          char.subclass === 'assassin' &&
          char.character_class.toLowerCase() === 'rogue' &&
          ((st.surprised ?? []).includes(targetId) || (st.round ?? 1) === 1);

        // Vow of Enmity: advantage vs the vow target
        const vowAdv = st.vow_of_enmity_target === targetId;

        // Reckless Attack (Barbarian L2+): advantage on melee weapon attacks
        const recklessAdv = !!char.turn_actions.reckless && weaponItem?.range !== 'ranged';

        // 2024 PHB Beast Form Pack Tactics — Wolf and Dire Wolf forms grant
        // advantage when an ally is within 5 ft of the target.
        let packTacticsAdv = false;
        if (char.conditions.includes('wild_shaped') && char.wild_shape_form) {
          const form = BEAST_FORMS[char.wild_shape_form];
          if (form?.packTactics && st.entities) {
            const targetEnt = st.entities.find((e) => e.id === targetId && e.isEnemy);
            if (targetEnt) {
              packTacticsAdv = st.entities.some(
                (e) =>
                  !e.isEnemy &&
                  e.id !== char.id &&
                  e.hp > 0 &&
                  Math.max(
                    Math.abs(e.pos.x - targetEnt.pos.x),
                    Math.abs(e.pos.y - targetEnt.pos.y)
                  ) <= 1
              );
            }
          }
        }

        // 2024 PHB Vex weapon mastery — previous hit with a Vex weapon by this
        // char on this target grants advantage on the next attack. Consume the
        // tag immediately (RAW: lasts until end of your next turn, but for our
        // single-attack action model, one-shot is closer to what players
        // expect).
        const vexTag = `vexed_by_${char.id}`;
        const vexAdv = !!st.entities?.find(
          (e) => e.id === targetId && e.isEnemy && e.conditions.includes(vexTag)
        );
        if (vexAdv) {
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy
                ? { ...e, conditions: e.conditions.filter((c) => c !== vexTag) }
                : e
            ),
          };
        }

        // 2024 PHB Fighter L13 Studied Attacks — same shape as Vex but seeded
        // by a *miss* on a prior turn (mark applied in the miss branch above).
        const studyTag = `studied_by_${char.id}`;
        const studyAdv = !!st.entities?.find(
          (e) => e.id === targetId && e.isEnemy && e.conditions.includes(studyTag)
        );
        if (studyAdv) {
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy
                ? { ...e, conditions: e.conditions.filter((c) => c !== studyTag) }
                : e
            ),
          };
        }

        // Path of the Totem Warrior — Wolf (PHB p.51): "While raging, your
        // allies have advantage on melee attack rolls against any creature
        // within 5 feet of you that is hostile to you." Find any Wolf-totem
        // barbarian in the party who's raging and adjacent to the target.
        const wolfAdv =
          weaponItem?.range !== 'ranged' &&
          !!st.entities &&
          st.characters.some((ally) => {
            if (ally.id === char.id) return false;
            if (ally.dead || ally.hp <= 0) return false;
            if (ally.subclass !== 'totem_warrior') return false;
            if (ally.character_class.toLowerCase() !== 'barbarian') return false;
            if (!ally.conditions.includes('raging')) return false;
            const allyEnt = st.entities?.find((e) => e.id === ally.id);
            const targetEnt = st.entities?.find((e) => e.id === targetId && e.isEnemy);
            if (!allyEnt || !targetEnt) return false;
            return distanceFeet(allyEnt.pos, targetEnt.pos) <= 5;
          });

        const disadvantage =
          rangedInMelee ||
          conditionDisadv ||
          exhaustionDisadv ||
          heavyEncumberedDisadv ||
          heavyWeaponSmallDisadv ||
          !armorProficient ||
          proneDisadv ||
          thrownLongRangeDisadv;
        // Heroic Inspiration spent this turn — grants advantage on the next
        // attack roll, then both the pending flag and char.inspiration clear.
        const inspirationAdv = !!char.turn_actions.inspiration_pending;
        if (inspirationAdv) {
          char.turn_actions = { ...char.turn_actions, inspiration_pending: false };
          char.inspiration = false;
        }
        const advantage =
          conditionAdv ||
          enemyGrappled ||
          proneAdv ||
          enemyParalyzed ||
          flankingAdv ||
          helpAdv ||
          assassinAdv ||
          vowAdv ||
          recklessAdv ||
          inspirationAdv ||
          wolfAdv ||
          vexAdv ||
          studyAdv ||
          packTacticsAdv;
        const disadvReasons = [
          rangedInMelee ? 'ranged in melee' : '',
          conditionDisadv ? char.conditions.filter((c) => DISADV_CONDITIONS.has(c)).join(', ') : '',
          exhaustionDisadv ? 'exhaustion' : '',
          heavyEncumberedDisadv ? 'heavily encumbered' : '',
          heavyWeaponSmallDisadv ? 'heavy weapon — Small creature' : '',
          !armorProficient ? `not proficient with ${equippedArmorLootItem?.name ?? 'armor'}` : '',
          proneDisadv ? 'prone (ranged)' : '',
          thrownLongRangeDisadv ? 'thrown beyond normal range' : '',
        ]
          .filter(Boolean)
          .join(', ');
        const disadvNote = disadvReasons
          ? ` (disadvantage — ${disadvReasons})`
          : advantage && !disadvantage
            ? ' (advantage)'
            : '';
        const noProfNote = !weaponProficient ? ` [no weapon proficiency — prof bonus omitted]` : '';

        const features = context.classFeatures?.[char.character_class] ?? [];
        const isRaging = char.conditions.includes('raging');

        // Champion: Improved Critical — crit on 19–20 at level 3+
        const critThresh =
          char.subclass === 'champion' &&
          char.character_class.toLowerCase() === 'fighter' &&
          char.level >= 3
            ? 19
            : 20;
        // Sacred Weapon: +CHA mod to attack rolls
        const sacredWeaponBonus =
          (char.class_resource_uses?.sacred_weapon_active ?? 0) > 0 ? abilityMod(char.cha) : 0;
        // Guided Strike: +10 to attack roll (War Cleric Channel Divinity)
        const guidedStrikeBonus = st.guided_strike_active ? 10 : 0;
        const totalAttackBonus = sacredWeaponBonus + guidedStrikeBonus;
        if (guidedStrikeBonus) st = { ...st, guided_strike_active: false };

        // Helper that resolves one attack roll and applies it to enemy HP / narrative.
        // Returns true if the enemy was killed (so the caller can break early).
        const resolveOneAttack = (label: string): boolean => {
          const effectiveEnemyAc = target.ac + coverAcBonus;
          // Assassin auto-crit on surprised target (PHB p.97)
          const assassinAutoCrit =
            char.subclass === 'assassin' && (st.surprised ?? []).includes(targetId);
          const atk = resolvePlayerAttack(
            { str: char.str, dex: char.dex, level: char.level },
            weaponDamage,
            effectiveEnemyAc,
            weaponItem?.finesse ?? false,
            disadvantage,
            advantage,
            weaponProficient,
            weaponItem?.range === 'ranged',
            critThresh,
            totalAttackBonus,
            char.species === 'halfling'
          );
          // Bardic Inspiration consumption on attack roll (2024 PHB p.52).
          // If the wielder has a stashed BI die, roll it and add to the to-hit
          // total. If that turns a miss into a hit, atk.hit flips to true AND
          // we need to roll damage (resolvePlayerAttack returned damage=0 on
          // the original miss; flipping hit without rolling damage produced
          // {{dmg|0}} hit narratives).
          let biNote = '';
          if (char.bardic_inspiration_die && !atk.fumble) {
            const biRoll = rollDice(`1${char.bardic_inspiration_die}`);
            atk.total += biRoll;
            const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
            if (!atk.hit && newHit) {
              atk.hit = true;
              atk.damage = Math.max(1, rollDice(weaponDamage ?? '1d4') + atk.atkMod);
            }
            biNote = ` ✦ Bardic Inspiration: +${biRoll} (${char.bardic_inspiration_die})`;
            char.bardic_inspiration_die = undefined;
          }
          // Bless (PHB p.219): blessed creatures add +1d4 to attack rolls.
          // Doesn't consume; the buff lasts until the caster's concentration
          // drops. Surfaced in atkNote alongside Bardic Inspiration. Same
          // miss-to-hit damage-roll concern as BI above.
          let blessNote = '';
          if ((char.conditions ?? []).includes('blessed') && !atk.fumble) {
            const blessRoll = rollDice('1d4');
            atk.total += blessRoll;
            const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
            if (!atk.hit && newHit) {
              atk.hit = true;
              atk.damage = Math.max(1, rollDice(weaponDamage ?? '1d4') + atk.atkMod);
            }
            blessNote = ` ✦ Bless: +${blessRoll} (1d4)`;
          }
          // Unconscious or Assassin-surprised: force crit on hit
          const autoCritCheck =
            (enemyUnconscious &&
              (!st.entities ||
                (() => {
                  const charEnt = st.entities?.find((e) => e.id === char.id);
                  const enmEnt = st.entities?.find((e) => e.id === targetId);
                  return charEnt && enmEnt
                    ? posEqual(
                        { x: charEnt.pos.x, y: charEnt.pos.y },
                        { x: enmEnt.pos.x, y: enmEnt.pos.y }
                      ) ||
                        Math.max(
                          Math.abs(charEnt.pos.x - enmEnt.pos.x),
                          Math.abs(charEnt.pos.y - enmEnt.pos.y)
                        ) <= 1
                    : true;
                })())) ||
            assassinAutoCrit;
          const isCrit = atk.critical || (autoCritCheck && atk.hit);
          const baseHit = weaponDamage
            ? isCrit && !atk.critical
              ? Math.max(1, rollCritical(weaponDamage) + atk.atkMod)
              : atk.damage
            : Math.max(1, unarmedDamage(char.str));
          const versatileNote = isVersatile ? ' (versatile)' : '';
          const coverNote = coverAcBonus > 0 ? ` +${coverAcBonus} cover` : '';
          const bonusNote = totalAttackBonus > 0 ? ` +${totalAttackBonus} bonus` : '';
          const atkNote =
            ' ' +
            fmt.note(
              `(${label}d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof${bonusNote} = ${atk.total} vs AC ${effectiveEnemyAc}${coverNote}${disadvNote}${versatileNote})${noProfNote}${biNote}${blessNote}`
            );

          if (atk.fumble) {
            // 2024 PHB — a Nat 1 on a d20 grants Heroic Inspiration. Failure
            // becomes the seed of next turn's success.
            let inspirationNote = '';
            if (!char.inspiration) {
              char.inspiration = true;
              inspirationNote = ` ✦ Heroic Inspiration granted (${char.name}).`;
            }
            narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide.${atkNote}${inspirationNote} `;
            st = pushEvent(st, {
              kind: 'attack_miss',
              attackerId: char.id,
              attackerName: char.name,
              targetId,
              targetName: target.name,
              toHit: atk.total,
              targetAc: target.ac,
              round: st.round ?? 1,
            });
            return false;
          }
          if (!atk.hit) {
            narrative += pickTiered(context.narratives.combatMiss, hpTier(char)).replace(
              /{enemy}/g,
              target.name
            );
            narrative += atkNote + ' ';
            st = pushEvent(st, {
              kind: 'attack_miss',
              attackerId: char.id,
              attackerName: char.name,
              targetId,
              targetName: target.name,
              toHit: atk.total,
              targetAc: target.ac,
              round: st.round ?? 1,
            });
            // 2024 PHB Fighter L13 — Studied Attacks. On miss, mark the target
            // so this Fighter's next attack against them has advantage. Stored
            // as a per-character tag so multiple Fighters can stack independently.
            if (char.character_class.toLowerCase() === 'fighter' && char.level >= 13) {
              const studyTag = `studied_by_${char.id}`;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === targetId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== studyTag), studyTag],
                      }
                    : e
                ),
              };
              narrative += ` [Studied Attacks: advantage on next attack vs ${target.name}]`;
            }
            // 2024 PHB Graze weapon mastery (greatsword, glaive) — even on a
            // miss, deal STR mod damage (DEX for Finesse weapons). Floor at 0.
            if (
              weaponItem?.mastery === 'graze' &&
              (char.weapon_masteries ?? []).includes(weaponItem.id)
            ) {
              const grazeMod = weaponItem.finesse ? abilityMod(char.dex) : abilityMod(char.str);
              const grazeDmg = Math.max(0, grazeMod);
              if (grazeDmg > 0) {
                const grazedHp = Math.max(0, target.hp - grazeDmg);
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === targetId && e.isEnemy ? { ...e, hp: grazedHp } : e
                  ),
                };
                narrative += `[Graze: ${target.name} still takes ${fmt.dmg(grazeDmg)} damage from the swing.] `;
              }
            }
            return false;
          }

          // ── Hit ──────────────────────────────────────────────────────────────
          // Sneak Attack (SRD 5.2.1 — Rogue): once per turn, on a hit, with
          // either advantage on the attack OR an ally within 5 ft of the
          // target (and you don't have disadvantage). Weapon must be Finesse
          // or Ranged.
          let sneakDmg = 0;
          if (features.includes('sneak_attack')) {
            const isFinesseOrRanged =
              (weaponItem?.finesse ?? false) || weaponItem?.range === 'ranged';
            // "Ally within 5 ft of target" via grid (Chebyshev distance ≤ 1).
            // When no grid is active, fall back to "any living ally" (the
            // previous looser check).
            let allyAdjacent = false;
            if (st.entities) {
              const targetEnt = st.entities.find((e) => e.id === targetId && e.isEnemy);
              if (targetEnt) {
                allyAdjacent = st.entities.some(
                  (e) =>
                    !e.isEnemy &&
                    e.id !== char.id &&
                    e.hp > 0 &&
                    Math.max(
                      Math.abs(e.pos.x - targetEnt.pos.x),
                      Math.abs(e.pos.y - targetEnt.pos.y)
                    ) <= 1
                );
              }
            } else {
              allyAdjacent = st.characters.some((c) => !c.dead && c.id !== char.id);
            }
            const hasAdv = advantage && !disadvantage;
            const triggers = (hasAdv || allyAdjacent) && !disadvantage;
            if (isFinesseOrRanged && triggers) {
              const saExpr = sneakAttackDice(char.level);
              sneakDmg = isCrit ? rollCritical(saExpr) : rollDice(saExpr);
              // 2024 PHB Cunning Strike: if the player pre-committed an
              // effect, subtract one die from the SA roll (average 3.5 on
              // 1d6) and stage the effect for application after the hit
              // resolves and damage is committed.
              if (char.turn_actions.cunning_strike_pending) {
                sneakDmg = Math.max(0, sneakDmg - rollDice('1d6'));
              }
            }
          }

          // Rage damage bonus: STR-based attacks only (PHB p.48)
          const rageBonus =
            features.includes('rage') && isRaging && atk.atkStat === 'STR'
              ? rageDamageBonus(char.level)
              : 0;

          const rawDmg = baseHit + sneakDmg + rageBonus;
          const { damage: finalDmg, note: dmgNote } = applyDamageMultiplier(
            rawDmg,
            weaponItem?.damageType,
            target
          );
          const enemyEnt = st.entities?.find((e) => e.id === targetId && e.isEnemy);
          const curEnemyHp = enemyEnt?.hp ?? 0;
          const newEnemyHp = curEnemyHp - finalDmg;

          narrative += buildCombatHitNarrative(target, weaponItem, finalDmg, isCrit, char, context);
          narrative += atkNote;
          if (isCrit && assassinAutoCrit)
            narrative += ` [Assassinate — auto-crit on surprised target!]`;
          if (sacredWeaponBonus > 0) narrative += ` [Sacred Weapon: +${sacredWeaponBonus} to hit]`;
          if (sneakDmg > 0) {
            // Crits double the Sneak Attack die count too (SRD 5.2.1 crit
            // rule applies to ALL dice rolled for the attack, including
            // Sneak Attack). Show the doubled expression on crits so
            // "1d6: +9" doesn't read as an impossible roll.
            const saExpr = sneakAttackDice(char.level);
            const saLabel = isCrit ? `${parseInt(saExpr) * 2}d6 (crit)` : saExpr;
            narrative += ` [Sneak Attack ${saLabel}: +${sneakDmg}]`;
          }
          if (rageBonus > 0) narrative += ` [Rage: +${rageBonus}]`;
          if (dmgNote) narrative += dmgNote;

          st = pushEvent(st, {
            kind: 'attack_hit',
            attackerId: char.id,
            attackerName: char.name,
            targetId,
            targetName: target.name,
            damage: finalDmg,
            damageType: weaponItem?.damageType ?? 'physical',
            isCrit,
            toHit: atk.total,
            targetAc: target.ac,
            round: st.round ?? 1,
          });

          // ── 2024 PHB Cunning Strike effect application ───────────────────────
          // If the Rogue pre-committed an effect AND Sneak Attack damage
          // was rolled (i.e. SA triggered on this hit), apply the effect.
          if (char.turn_actions.cunning_strike_pending && sneakDmg > 0 && newEnemyHp > 0) {
            const csEffect = char.turn_actions.cunning_strike_pending;
            const csDc = 8 + profBonus(char.level) + abilityMod(char.dex);
            char.turn_actions = { ...char.turn_actions, cunning_strike_pending: undefined };
            if (csEffect === 'trip') {
              const enemyDex = (target.dex ?? 10) as number;
              const dexSave = rollDice('1d20') + abilityMod(enemyDex);
              if (dexSave < csDc) {
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === targetId && e.isEnemy
                      ? {
                          ...e,
                          conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                        }
                      : e
                  ),
                };
                st = pushEvent(st, {
                  kind: 'condition_applied',
                  targetId,
                  targetName: target.name,
                  condition: 'prone',
                  source: 'Cunning Strike: Trip',
                  round: st.round ?? 1,
                });
                narrative += ` [Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — ${target.name} is prone!]`;
              } else {
                narrative += ` [Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — resists]`;
              }
            } else if (csEffect === 'poison') {
              const enemyCon = (target.con ?? 10) as number;
              const conSave = rollDice('1d20') + abilityMod(enemyCon);
              if (target.condition_immunities?.includes('poisoned')) {
                narrative += ` [Cunning Strike — Poison: ${target.name} is immune]`;
              } else if (conSave < csDc) {
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === targetId && e.isEnemy
                      ? {
                          ...e,
                          conditions: [...e.conditions.filter((c) => c !== 'poisoned'), 'poisoned'],
                        }
                      : e
                  ),
                };
                st = pushEvent(st, {
                  kind: 'condition_applied',
                  targetId,
                  targetName: target.name,
                  condition: 'poisoned',
                  source: 'Cunning Strike: Poison',
                  round: st.round ?? 1,
                });
                narrative += ` [Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — ${target.name} is poisoned!]`;
              } else {
                narrative += ` [Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — resists]`;
              }
            } else if (csEffect === 'withdraw') {
              // Move half speed without provoking OAs this turn — represented
              // by the existing `disengaged` flag, which suppresses OAs.
              char.turn_actions = { ...char.turn_actions, disengaged: true };
              narrative += ` [Cunning Strike — Withdraw: ${char.name} disengages without provoking OAs]`;
            } else if (csEffect === 'disarm') {
              // Pansori enemies don't carry weapons as separate items — model
              // disarm as a `disarmed` condition the damage handler will read
              // later. For now just narrate + apply the condition.
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === targetId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== 'disarmed'), 'disarmed'],
                      }
                    : e
                ),
              };
              st = pushEvent(st, {
                kind: 'condition_applied',
                targetId,
                targetName: target.name,
                condition: 'disarmed',
                source: 'Cunning Strike: Disarm',
                round: st.round ?? 1,
              });
              narrative += ` [Cunning Strike — Disarm: ${target.name} drops their weapon!]`;
            }
          }

          // ── 2024 PHB Weapon Mastery on hit ────────────────────────────────────
          // Apply the weapon's mastery property IF the PC has mastered this
          // weapon. Mastery effects are post-damage so they don't change
          // whether the hit lands.
          if (
            weaponItem?.mastery &&
            newEnemyHp > 0 &&
            (char.weapon_masteries ?? []).includes(weaponItem.id)
          ) {
            // 2024 PHB Fighter L9 Tactical Master — pre-armed swap wins over
            // the weapon's printed mastery for this one attack. Clear the
            // flag so it doesn't carry into the next swing.
            let mastery = weaponItem.mastery;
            if (char.turn_actions.tactical_master_mastery) {
              mastery = char.turn_actions.tactical_master_mastery;
              char.turn_actions = { ...char.turn_actions, tactical_master_mastery: undefined };
              narrative += ` [Tactical Master: applying ${mastery.toUpperCase()}]`;
            }
            const weaponDc = 8 + profBonus(char.level) + abilityMod(char.str);
            if (mastery === 'vex') {
              // Mark target so this PC's next attack against them has adv.
              // Stored as a condition with the char.id suffix so multiple PCs
              // can vex independently.
              const tag = `vexed_by_${char.id}`;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === targetId && e.isEnemy
                    ? { ...e, conditions: [...e.conditions.filter((c) => c !== tag), tag] }
                    : e
                ),
              };
              narrative += ` [Vex: advantage on your next attack vs ${target.name}]`;
            } else if (mastery === 'topple') {
              const enemyCon = (target.con ?? 10) as number;
              const conSave = rollDice('1d20') + abilityMod(enemyCon);
              if (conSave < weaponDc) {
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === targetId && e.isEnemy
                      ? {
                          ...e,
                          conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                        }
                      : e
                  ),
                };
                st = pushEvent(st, {
                  kind: 'condition_applied',
                  targetId,
                  targetName: target.name,
                  condition: 'prone',
                  source: 'Topple (weapon mastery)',
                  round: st.round ?? 1,
                });
                narrative += ` [Topple: CON ${conSave} vs DC ${weaponDc} — ${target.name} is prone!]`;
              } else {
                narrative += ` [Topple: CON ${conSave} vs DC ${weaponDc} — resists]`;
              }
            } else if (mastery === 'push') {
              // Move target 10 ft (2 grid squares) directly away from the attacker.
              const charEnt = st.entities?.find((e) => e.id === char.id);
              const targetEnt = st.entities?.find((e) => e.id === targetId && e.isEnemy);
              if (charEnt && targetEnt) {
                const dx = Math.sign(targetEnt.pos.x - charEnt.pos.x);
                const dy = Math.sign(targetEnt.pos.y - charEnt.pos.y);
                const newPos = { x: targetEnt.pos.x + dx * 2, y: targetEnt.pos.y + dy * 2 };
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === targetId && e.isEnemy ? { ...e, pos: newPos } : e
                  ),
                };
                narrative += ` [Push: ${target.name} shoved 10 ft back]`;
              }
            } else if (mastery === 'sap') {
              // Disadvantage on target's next attack — tag with sapped_<charId>
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === targetId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== 'sapped'), 'sapped'],
                      }
                    : e
                ),
              };
              narrative += ` [Sap: ${target.name} has disadvantage on its next attack]`;
            } else if (mastery === 'slow') {
              // Speed -10 ft until your next turn. Store as slowed_until_next_turn.
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === targetId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== 'slowed'), 'slowed'],
                      }
                    : e
                ),
              };
              narrative += ` [Slow: ${target.name}'s speed -10 ft]`;
            } else if (mastery === 'cleave') {
              // 2024 PHB Cleave (greataxe, halberd) — on a hit, a second enemy
              // within 5 ft of the target takes the weapon's damage die (no
              // ability mod). Requires the grid to identify a neighbour.
              const targetEnt = st.entities?.find((e) => e.id === targetId && e.isEnemy);
              if (targetEnt && weaponItem.damage) {
                const cleaveTarget = (st.entities ?? []).find(
                  (e) =>
                    e.isEnemy &&
                    e.hp > 0 &&
                    e.id !== targetId &&
                    Math.max(
                      Math.abs(e.pos.x - targetEnt.pos.x),
                      Math.abs(e.pos.y - targetEnt.pos.y)
                    ) <= 1
                );
                if (cleaveTarget) {
                  const cleaveDmg = rollDice(weaponItem.damage);
                  const cleaveNewHp = Math.max(0, cleaveTarget.hp - cleaveDmg);
                  st = {
                    ...st,
                    entities: (st.entities ?? []).map((e) =>
                      e.id === cleaveTarget.id ? { ...e, hp: cleaveNewHp } : e
                    ),
                  };
                  const cleaveName = getEnemyById(seed, cleaveTarget.id)?.name ?? cleaveTarget.id;
                  narrative += ` ${fmt.note(`[Cleave: ${cleaveName} also takes ${cleaveDmg} damage!${cleaveNewHp <= 0 ? ' (killed)' : ''}]`)}`;
                  if (cleaveNewHp <= 0) {
                    const cleaveXp = getEnemyById(seed, cleaveTarget.id)?.xp ?? 0;
                    const cleaveSplit = splitEncounterXp(st, char.id, cleaveXp);
                    st = cleaveSplit.st;
                    char.xp = (char.xp || 0) + cleaveSplit.share;
                    narrative += applyPartyLevelUps(st, char, context);
                  }
                }
              }
            }
          }

          if (newEnemyHp <= 0) {
            const xpGain = target.xp ?? 10 + (target.hp || 8);
            const killSplit = splitEncounterXp(st, char.id, xpGain);
            st = killSplit.st;
            const xpShare = killSplit.share;
            char.xp = (char.xp || 0) + xpShare;
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === targetId && e.isEnemy ? { ...e, hp: 0 } : e
              ),
            };
            st.enemies_killed = [...st.enemies_killed, targetId];
            narrative += grantDarkOnesBlessing(char);
            // Only end combat once every enemy in the room is down
            if (isRoomCleared(st, seed, roomId)) {
              st = endCombatState(st);
              char.conditions = char.conditions.filter((c) => c !== 'raging');
            }
            st = pushEvent(st, {
              kind: 'kill',
              attackerId: char.id,
              attackerName: char.name,
              victimId: targetId,
              victimName: target.name,
              xp: xpShare,
              round: st.round ?? 1,
            });
            narrative +=
              ' ' +
              pick(context.narratives.killShot)
                .replace('{enemy}', target.name)
                .replace('{xp}', String(xpShare));
            narrative += applyPartyLevelUps(st, char, context);
            usedInitiative = true;
            return true;
          }
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy ? { ...e, hp: newEnemyHp } : e
            ),
          };
          narrative += ` The ${target.name} has ${fmt.hp(newEnemyHp)} HP remaining. `;
          return false;
        };

        // ── First attack ─────────────────────────────────────────────────────
        const killed = resolveOneAttack('');
        if (!killed) {
          // ── Extra Attack (Fighter/Warrior level 5+) ───────────────────────
          // SRD 5.2.1 p.90 "Loading": a Loading weapon fires only once per
          // Action/Bonus/Reaction regardless of Extra Attack — so Fighter L5
          // with a hand crossbow still gets just one shot per action.
          const extraCount =
            features.includes('extra_attack') && !weaponItem?.loading
              ? extraAttackCount(char.character_class, char.level)
              : 0;
          for (let ei = 0; ei < extraCount; ei++) {
            if ((st.entities?.find((e) => e.id === targetId && e.isEnemy)?.hp ?? 0) <= 0) break;
            const killedExtra = resolveOneAttack(`Attack ${ei + 2} — `);
            if (killedExtra) break;
          }
        }

        // Action consumed. Initiative advances unless a bonus-action choice is available
        // (checked after commitChar — see auto-advance block below the switch).
        char.turn_actions = { ...char.turn_actions, action_used: true };
        break;
      }

      case 'loot': {
        if (!loot) {
          narrative = pick(context.narratives.noLoot);
          break;
        }
        if (!lootAvail) {
          narrative = pick(context.narratives.alreadyLooted);
          break;
        }
        // Hostile in the room — engage or escape, don't pocket items in plain
        // sight. Defense for stale FE caches that might still show the choice.
        if (enemyAlive) {
          narrative = 'A hostile is watching — you cannot loot until the room is clear.';
          break;
        }
        char.inventory = [...(char.inventory || []), { ...loot, instance_id: randomUUID() }];
        // Track BOTH the roomId (for the lootAvail "already looted" gate) and
        // the item id (so quest conditions like `loot_taken contains 'guild_ledger'`
        // resolve correctly regardless of which room or container the item came
        // from).
        st.loot_taken = [...st.loot_taken, roomId, loot.id];
        narrative = pick(context.narratives.lootPickedUp).replace(/{item}/g, loot.name);
        // SRD 5.2.1 p.136 — magic items are unidentified on pickup until you
        // spend a short rest examining them, OR a character with Arcana /
        // Investigation skill IDs them on sight. Mundane quest items (the
        // Guild Ledger, the cult idol, a locket) aren't magical and should
        // never be flagged "unidentified" — gate on `requiresAttunement` as
        // the proxy for "this is a real magic item."
        const isMagicMisc = loot.type === 'misc' && !!loot.requiresAttunement;
        const hasIdentify =
          context.classSkills[char.character_class]?.some((s) =>
            ['arcana', 'investigation'].includes(s)
          ) ?? false;
        if (isMagicMisc && !hasIdentify) {
          narrative += ` [${loot.name}: unidentified]`;
        } else {
          narrative += ` [${loot.name}: ${loot.desc}]`;
          if (hasIdentify && isMagicMisc) {
            narrative += ' Your expertise lets you identify it immediately.';
          }
        }
        break;
      }

      case 'use': {
        const held = char.inventory?.find((i) => i.id === action.itemId);
        if (!held) {
          narrative = "You search your pack — you don't have that.";
          break;
        }
        const itemData = getItemData(held, context);
        const firstIdx = char.inventory.findIndex((i) => i.id === held.id);

        if (itemData.slot === 'weapon') {
          narrative = `The ${held.name} is ready. Use "attack" to strike, or "equip" to make it your active weapon.`;
        } else if (itemData.slot === 'armor') {
          narrative = `The ${held.name} offers protection. Use "equip" to don it for a +${itemData.ac_bonus || 0} AC bonus.`;
        } else if (itemData.type === 'consumable') {
          if (itemData.heal) {
            const hasMedicine =
              context.classSkills[char.character_class]?.includes('medicine') ?? false;
            const healBonus = hasMedicine ? profBonus(char.level) : 0;
            const healed = rollDice(itemData.heal) + healBonus;
            const bonusNote = healBonus > 0 ? ` (+${healBonus} medicine)` : '';

            // Resolve heal target — may be a different party member
            const targetId = 'targetCharId' in action ? action.targetCharId : undefined;
            const targetIdx = targetId
              ? st.characters.findIndex((c) => c.id === targetId)
              : safeIdx;
            const isSelf = !targetId || targetIdx === safeIdx;

            if (!isSelf && targetIdx >= 0) {
              const target = st.characters[targetIdx];
              const newHp = Math.min(target.max_hp, target.hp + healed);
              st = {
                ...st,
                characters: st.characters.map((c, i) =>
                  i === targetIdx ? { ...c, hp: newHp } : c
                ),
                // Sync the grid entity HP too so the battlefield renderer
                // doesn't lag behind character state — a healed-back-up PC
                // would otherwise still render as a faded skull until the
                // next turn flushed the entities. Same fix on the self
                // branch below.
                entities: (st.entities ?? []).map((e) =>
                  e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
                ),
              };
              char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
              narrative = `${char.name} uses the ${held.name} on ${target.name} — ${fmt.hp(healed)} HP restored${bonusNote} (now ${fmt.hp(newHp, target.max_hp)}).`;
            } else {
              char.hp = Math.min(char.max_hp, char.hp + healed);
              char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === char.id && !e.isEnemy ? { ...e, hp: char.hp } : e
                ),
              };
              narrative = `You use the ${held.name} and recover ${fmt.hp(healed)} HP${bonusNote} (now ${fmt.hp(char.hp, char.max_hp)}).`;
            }
          } else if (itemData.effect === 'con_advantage') {
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            const { roll1, roll2, best } = resolveSaveWithAdvantage(char.con);
            narrative = `You use the ${held.name}. CON save with advantage: rolled ${roll1} and ${roll2} — keeping the ${best}. You feel steadier.`;
          } else if (itemData.effect === 'mystery') {
            char.inventory = char.inventory.filter((_, i) => i !== firstIdx);
            const { result, value } = resolveMysteryConsumable();
            if (result === 'heal') {
              char.hp = Math.min(char.max_hp, char.hp + value);
              narrative = `You use the ${held.name}. It tastes of regret and eucalyptus — but you feel better? +${fmt.hp(value)} HP.`;
            } else if (result === 'hurt') {
              char.hp = Math.max(1, char.hp - value);
              narrative = `You use the ${held.name}. Immediate. Searing. Regret. -${fmt.hp(value)} HP.`;
            } else {
              narrative = `You use the ${held.name}. Nothing happens. You stand there feeling foolish.`;
            }
          } else {
            narrative = `You use the ${held.name}. Something may have happened.`;
          }
        } else {
          narrative = itemData.useNarrative || `You examine the ${held.name}. Might come in handy.`;
        }
        // SRD 5.2.1 p.204 (Using a Potion): "Drinking a potion or administering
        // it to another creature requires a Bonus Action." Other consumables
        // (scrolls, food, etc.) and item examinations remain a full action.
        if (st.combat_active) {
          const isPotionLike =
            itemData.type === 'consumable' &&
            (itemData.heal != null ||
              itemData.effect === 'con_advantage' ||
              itemData.effect === 'mystery');
          if (isPotionLike) {
            char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          } else {
            char.turn_actions = { ...char.turn_actions, action_used: true };
          }
        }
        break;
      }

      case 'sneak': {
        if (!enemyAlive) {
          narrative = 'Nothing to sneak past. You move freely.';
          break;
        }
        const sneakDC = passivePerceptionDC(enemy.wis ?? 10);
        // SRD p.6 — group ability check: every participant rolls; the group
        // succeeds if at least half of them pass. Solo parties collapse to
        // single-PC behavior. Only the active PC auto-spends Inspiration /
        // Bardic Inspiration; passive party members keep their resources.
        // Swap the active PC's slot for our local `char` ref so the resource
        // mutations apply to the same object that gets written back to state.
        const livingParty = st.characters
          .filter((c) => !c.dead)
          .map((c) => (c.id === char.id ? char : c));
        const rolls = livingParty.map((member) => {
          const isActive = member.id === char.id;
          const proficient =
            context.classSkills[member.character_class]?.includes('stealth') ?? false;
          const exhaustionDisadv1 = (member.exhaustion_level ?? 0) >= 1;
          const checkDisadv = exhaustionDisadv1 || isHeavilyEncumbered(member);
          const inspAdv = isActive ? consumeInspirationForCheck(member) : false;
          const bardicRoll = isActive ? consumeBardicForCheck(member) : 0;
          const check = skillCheck(
            member.dex,
            sneakDC - bardicRoll,
            proficient,
            member.level,
            checkDisadv,
            false,
            false,
            inspAdv,
            member.species === 'halfling'
          );
          return { name: member.name, check, mod: abilityMod(member.dex) };
        });
        const successes = rolls.filter((r) => r.check.success).length;
        const groupPasses = 2 * successes >= livingParty.length;
        const detailLines = rolls
          .map(
            (r) =>
              `${r.name}: ${r.check.roll}+${r.mod}=${r.check.total} ${r.check.success ? '✓' : '✗'}`
          )
          .join('; ');
        const groupNote =
          livingParty.length > 1
            ? ` Group check: ${successes}/${livingParty.length} pass${groupPasses ? '' : ' — group fails'}.`
            : '';
        if (groupPasses) {
          narrative = pick(context.narratives.sneakSuccess).replace('{enemy}', enemy.name);
          narrative += `${groupNote} (DC ${sneakDC}; ${detailLines})`;
          if (adjacent.length > 0) {
            const target = adjacent[0];
            if (st.combat_active) {
              st = endCombatState(st);
              char.conditions = [];
            }
            st.current_room = target.id;
            if (!st.visited_rooms.includes(target.id)) {
              st.visited_rooms = [...st.visited_rooms, target.id];
            }
            narrative +=
              ' ' +
              buildArrivalNarrative(
                target.id,
                { ...st, characters: st.characters.map((c, i) => (i === safeIdx ? char : c)) },
                seed,
                context
              );
          }
        } else {
          narrative = `The party fails to slip past the ${enemy?.name ?? 'enemy'}.${groupNote} (DC ${sneakDC}; ${detailLines})`;
        }
        // Sneak always consumes the action and ends the combat turn
        char.turn_actions = { ...char.turn_actions, action_used: true };
        if (st.combat_active) usedInitiative = true;
        break;
      }

      // ── NPC: attack_npc ──────────────────────────────────────────────────────
      // This action is the *trigger* that flips a non-hostile NPC hostile. After
      // flipping, the NPC participates in grid combat as a regular enemy (via
      // getLivingRoomEnemies + getEnemyById's npc: lookup). We immediately
      // dispatch the regular Attack action against `npc:${roomId}` so the player
      // doesn't waste a turn just changing attitude — the combat init runs and
      // the attack resolves in the same response.
      case 'attack_npc': {
        const npc = seed.npcs?.[roomId];
        if (!npc) {
          narrative = 'There is no one to attack here.';
          break;
        }
        if (npcIsKilled(st, roomId)) {
          narrative = 'Already dead.';
          break;
        }
        // Flip to hostile so getLivingRoomEnemies surfaces this NPC as an enemy.
        st = { ...st, npc_attitudes: { ...st.npc_attitudes, [roomId]: 'hostile' } };
        // Commit char back into state before the recursive dispatch.
        commitChar();
        return await takeAction({
          action: { type: 'attack', targetEnemyId: `npc:${roomId}` },
          history,
          state: st,
          seed,
          context,
        });
      }

      case 'disarm_trap': {
        const trap = getRoomTrap(roomId, seed, context);
        if (!trap || trapSpent(st, roomId)) {
          narrative = 'There is no trap here to disarm.';
          break;
        }
        // Must have detected it (passive Perception) to attempt disarm
        if (!partyDetectsTrap(st.characters, trap)) {
          narrative = 'You have not located the trap.';
          break;
        }
        const hasToolProf =
          char.tool_proficiencies?.some(
            (t) => t.toLowerCase().includes('thieves') || t.toLowerCase().includes('hacking')
          ) ?? false;
        // Exhaustion 1+: disadvantage on ability checks (disarmTrap uses DEX)
        // disarmTrap does not support disadvantage natively; apply by calling twice and taking lower
        const exhaustionDisadv1Trap = (char.exhaustion_level ?? 0) >= 1;
        const trapAttempt1 = disarmTrap(char.dex, char.level, hasToolProf);
        const trapAttempt2 = exhaustionDisadv1Trap
          ? disarmTrap(char.dex, char.level, hasToolProf)
          : trapAttempt1;
        const { roll, total } =
          trapAttempt1.total <= trapAttempt2.total ? trapAttempt1 : trapAttempt2;
        const profNote = hasToolProf ? ` (tool proficiency)` : '';
        if (total >= trap.dc) {
          st.traps_disarmed = [...(st.traps_disarmed ?? []), roomId];
          narrative = `${trap.disarmSuccess} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc})`;
        } else {
          // Disarm failure — trap triggers
          st.traps_triggered = [...(st.traps_triggered ?? []), roomId];
          const trapDmg = rollDice(trap.damage);
          char.hp = Math.max(0, char.hp - trapDmg);
          let failNarr = `${trap.disarmFail} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc}). `;
          failNarr += trap.triggerNarrative
            .replace(/{name}/g, char.name)
            .replace(/{dmg}/g, String(trapDmg));
          narrative = failNarr;
          if (trap.condition && char.hp > 0) {
            char.conditions = [...new Set([...char.conditions, trap.condition])];
            if (trap.conditionDuration)
              char.condition_durations = {
                ...char.condition_durations,
                [trap.condition]: trap.conditionDuration,
              };
          }
        }
        char.turn_actions = { ...char.turn_actions, action_used: true };
        break;
      }

      case 'cast_spell': {
        const { spellId, slotLevel } = action;
        const isRitualCast =
          (action as { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean })
            .ritual ?? false;
        const spell = context.spellTable?.[spellId];
        if (!spell) {
          narrative = `Unknown spell: ${spellId}.`;
          break;
        }

        // PHB p.144: cannot cast spells while wearing armor you are not proficient with
        const spellArmorItem = char.equipped_armor
          ? context.lootTable.find(
              (l) => l.id === char.inventory?.find((i) => i.instance_id === char.equipped_armor)?.id
            )
          : null;
        if (
          spellArmorItem &&
          !hasArmorProficiency(char.armor_proficiencies ?? [], spellArmorItem.armorCategory)
        ) {
          narrative = `You cannot cast spells while wearing ${spellArmorItem.name} — you are not proficient with ${spellArmorItem.armorCategory ?? 'this'} armor.`;
          break;
        }

        // Deafened: cannot cast spells with verbal components
        if (char.conditions.includes('deafened') && (spell as { verbal?: boolean }).verbal) {
          narrative = `You cannot cast ${spell.name} while deafened — it requires a verbal component.`;
          break;
        }

        // Ritual casting: no slot cost, only out of combat
        if (isRitualCast) {
          if (!(spell as { ritualCasting?: boolean }).ritualCasting) {
            narrative = `${spell.name} cannot be cast as a ritual.`;
            break;
          }
          if (st.combat_active) {
            narrative = `Ritual casting takes 10 minutes — not usable in combat.`;
            break;
          }
          // No slot consumed for ritual casting
        }

        // Spell preparation check (Cleric, Paladin, Druid)
        const prepClasses = ['cleric', 'paladin', 'druid'];
        if (
          prepClasses.includes(char.character_class.toLowerCase()) &&
          spell.level > 0 &&
          !isRitualCast
        ) {
          const prepared = char.prepared_spells ?? [];
          if (prepared.length > 0 && !prepared.includes(spellId)) {
            // Reachable only as a safety net — the choice generator now
            // filters unprepared spells out of the cast menu (see the
            // prepClasses block in generateChoices). Prep is a long-rest
            // action, so the message no longer suggests mid-combat prep.
            narrative = `${spell.name} is not prepared. Prepare it on a long rest.`;
            break;
          }
        }

        // Break existing concentration if this spell also requires concentration (PHB p.203)
        if (spell.concentration && char.concentrating_on) {
          const { char: nc, st: ns } = breakConcentration(char, st);
          char = nc;
          st = ns;
        }

        // Expend a slot for non-cantrips (unless ritual)
        if (spell.level > 0 && !isRitualCast) {
          if (slotLevel < spell.level) {
            narrative = `${spell.name} requires at least a level-${spell.level} slot.`;
            break;
          }
          const slotsMax = (char.spell_slots_max ?? {})[slotLevel] ?? 0;
          const slotsUsed = (char.spell_slots_used ?? {})[slotLevel] ?? 0;
          if (slotsUsed >= slotsMax) {
            narrative = `No level-${slotLevel} spell slots remaining (recovered on long rest).`;
            break;
          }
          char.spell_slots_used = { ...(char.spell_slots_used ?? {}), [slotLevel]: slotsUsed + 1 };
        }

        // 2024 PHB / SRD 5.2.1 — costly material components (Identify's 100 gp
        // pearl, Revivify's 300 gp diamond, etc.) are consumed on cast. Block
        // the cast if the caster can't afford it; deduct from gold otherwise.
        if (spell.materialCost && spell.materialCost > 0) {
          if ((char.gold ?? 0) < spell.materialCost) {
            narrative = `${spell.name} requires a ${spell.materialCost} gp material component you don't have.`;
            break;
          }
          char.gold = (char.gold ?? 0) - spell.materialCost;
          narrative = `${char.name} expends a ${spell.materialCost} gp component. `;
        }

        // SRD 5.2.1 p.67 (Quickened Spell): after consuming Quickened, can't
        // cast a level 1+ spell on the same turn EXCEPT the quickened cast
        // itself (which is the spell that got "modified"). We detect the
        // quickened cast via st.metamagic_active === 'quickened' being still
        // active at the start of resolution.
        const isQuickenedCast = st.metamagic_active === 'quickened';
        if (
          spell.level > 0 &&
          !isRitualCast &&
          char.turn_actions.quickened_used &&
          !isQuickenedCast
        ) {
          narrative =
            'You used Quickened Spell this turn — you cannot cast another level 1+ spell.';
          break;
        }

        // Mark action economy
        if (spell.castTime === 'bonus_action') {
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
        } else {
          char.turn_actions = { ...char.turn_actions, action_used: true };
        }
        // Track that a leveled spell was cast this turn (for the Quickened
        // activation check on a subsequent metamagic invocation).
        if (spell.level > 0 && !isRitualCast) {
          char.turn_actions = { ...char.turn_actions, leveled_spell_cast: true };
        }
        // Sorcerer · Wild Magic Surge (PHB p.103) — 1-in-20 chance after each
        // leveled spell to trigger a chaotic effect. RAW rolls 1d20 and on a 1
        // rolls a result on the Wild Magic table (d100). We use a small
        // curated table appropriate to our engine's mechanics.
        if (
          spell.level > 0 &&
          !isRitualCast &&
          char.character_class.toLowerCase() === 'sorcerer' &&
          char.subclass === 'wild_magic' &&
          d(20) === 1
        ) {
          const surge = pick([
            'You glow with a soft blue light for 1 minute (visible from 30 ft).',
            'A poof of harmless multicolored smoke envelops you.',
            `You regain 2d4 (${rollDice('2d4')}) hit points (Wild Magic Surge).`,
            'Your hair (or scales, where applicable) turns vivid pink until your next long rest.',
            'You feel a momentary disorientation — disadvantage on your next attack.',
          ]);
          // Apply mechanical effects where possible.
          if (surge.startsWith('You regain')) {
            const heal = rollDice('2d4');
            char.hp = Math.min(char.max_hp, char.hp + heal);
          }
          narrative += ` 🌀 WILD MAGIC SURGE: ${surge}`;
        }

        const castingAbility = (context.spellcastingAbility?.[char.character_class] ??
          context.classPrimaryStats[char.character_class] ??
          'int') as AbilityKey;
        const castingScore = char[castingAbility] ?? 10;
        const slotNote = spell.level > 0 ? ` (level-${slotLevel} slot)` : ' (cantrip)';

        // ── Heal spells ────────────────────────────────────────────────────────
        if (spell.heal) {
          const healMod = Math.max(0, Math.floor((castingScore - 10) / 2));
          const baseHealed = rollDice(spell.heal) + healMod;
          // Life Cleric: Disciple of Life — healing spells restore extra 2 + spell level HP
          const discipleBonus =
            char.subclass === 'life' && char.character_class.toLowerCase() === 'cleric'
              ? 2 + (spell.level ?? 1)
              : 0;
          const healed = baseHealed + discipleBonus;
          // Target the most injured party member (excluding the caster, unless only one)
          const injured = st.characters.filter(
            (c) => !c.dead && c.hp < c.max_hp && c.id !== char.id
          );
          const target =
            injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : char;
          const isSelf = target.id === char.id;
          const discipleNote = discipleBonus > 0 ? ` [Disciple of Life: +${discipleBonus}]` : '';
          if (isSelf) {
            char.hp = Math.min(char.max_hp, char.hp + healed);
            narrative = `${char.name} casts ${spell.name}${slotNote} — restores ${healed} HP to self (now ${char.hp}/${char.max_hp}).${discipleNote}`;
          } else {
            const newHp = Math.min(target.max_hp, target.hp + healed);
            st = {
              ...st,
              characters: st.characters.map((c) => (c.id === target.id ? { ...c, hp: newHp } : c)),
              // Sync the grid entity HP so the battlefield reflects the heal
              // immediately — `commitChar()` only syncs the caster's entity,
              // not the target's, so without this the healed ally would
              // still render as a faded skull until the next state update.
              entities: (st.entities ?? []).map((e) =>
                e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
              ),
            };
            narrative = `${char.name} casts ${spell.name}${slotNote} — restores ${healed} HP to ${target.name} (now ${newHp}/${target.max_hp}).${discipleNote}`;
          }
          break;
        }

        // ── Utility spells (no damage, no save, no heal) ───────────────────────
        if (!spell.damage && !spell.savingThrow && !spell.attackRoll && !spell.condition) {
          narrative = spell.narrative
            ? spell.narrative.replace('{name}', char.name)
            : `${char.name} casts ${spell.name}${slotNote}.`;
          // Bless (PHB p.219) — caster picks up to 3 creatures (RAW). Pansori
          // simplifies: caster + first 2 living non-caster party members are
          // blessed. Each gets +1d4 to attack rolls (saves are a follow-up).
          // Concentration links the buff to the caster — `blessed` clears
          // from all linked PCs when the Cleric's concentration drops.
          if (spell.id === 'bless') {
            // Mark caster as concentrating on bless. The runtime-mutated
            // `char` reference is what gets written back to state.
            char.concentrating_on = {
              spellId: 'bless',
              rounds_left: concentrationRoundsFor(spell),
            };
            // Pick the targets: caster (always) + up to 2 living allies.
            const blessTargets: string[] = [char.id];
            for (const c of st.characters) {
              if (blessTargets.length >= 3) break;
              if (c.id === char.id || c.dead) continue;
              blessTargets.push(c.id);
            }
            const targetSet = new Set(blessTargets);
            st = {
              ...st,
              characters: st.characters.map((c) => {
                // The caster is mutated in place — don't overwrite our `char`
                // ref with a spread (it'd silently drop the concentrating_on
                // we just set). Skip; the post-cast state writeback handles it.
                if (c.id === char.id) return c;
                if (!targetSet.has(c.id) || (c.conditions ?? []).includes('blessed')) {
                  return c;
                }
                return {
                  ...c,
                  conditions: [...(c.conditions ?? []), 'blessed'],
                  condition_sources: {
                    ...(c.condition_sources ?? {}),
                    blessed: char.id,
                  },
                };
              }),
            };
            // Apply blessed to the caster's local ref too.
            if (!(char.conditions ?? []).includes('blessed')) {
              char.conditions = [...(char.conditions ?? []), 'blessed'];
              char.condition_sources = {
                ...(char.condition_sources ?? {}),
                blessed: char.id,
              };
            }
            // Look up names for the narrative addendum.
            const blessedNames = blessTargets
              .map((id) => st.characters.find((c) => c.id === id)?.name ?? id)
              .join(', ');
            narrative += ` Blessed: ${blessedNames}.`;
          }
          break;
        }

        // ── Offensive spells — need a living enemy ─────────────────────────────
        if (!enemy || !enemyAlive) {
          narrative = pick(context.narratives.noEnemy);
          break;
        }

        // Resolve targeted enemy: explicit targetEnemyId wins; fallback to first living
        const spellTargetId: string =
          (action as { type: 'cast_spell'; targetEnemyId?: string }).targetEnemyId ?? enemy.id;
        const spellTarget: Enemy = livingEnemiesInRoom.find((e) => e.id === spellTargetId) ?? enemy;

        // SRD 5.2.1 — enforce spell range against the grid when entities exist.
        // 'self' spells need no target check (they originate from the caster).
        // 'touch' = adjacent only (≤ 1 grid square / 5 ft).
        // 'ranged' = up to spell.rangeFt feet of grid distance.
        if (st.entities && spell.rangeKind && spell.rangeKind !== 'self') {
          const casterEnt = st.entities.find((e) => e.id === char.id);
          const targetEnt = st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
          if (casterEnt && targetEnt) {
            const distFt = distanceFeet(casterEnt.pos, targetEnt.pos);
            const maxFt = spell.rangeKind === 'touch' ? 5 : (spell.rangeFt ?? 0);
            if (distFt > maxFt) {
              narrative =
                spell.rangeKind === 'touch'
                  ? `${spell.name} requires a touch — the ${spellTarget.name} is ${distFt} ft away.`
                  : `${spell.name} is out of range (${distFt} ft to target, max ${maxFt} ft).`;
              // Refund the slot we just spent
              if (spell.level > 0 && !isRitualCast) {
                const slotsUsedRefund = char.spell_slots_used?.[slotLevel] ?? 1;
                char.spell_slots_used = {
                  ...(char.spell_slots_used ?? {}),
                  [slotLevel]: Math.max(0, slotsUsedRefund - 1),
                };
              }
              // Refund the action economy too
              if (spell.castTime === 'bonus_action') {
                char.turn_actions = { ...char.turn_actions, bonus_action_used: false };
              } else {
                char.turn_actions = { ...char.turn_actions, action_used: false };
              }
              if (spell.level > 0 && !isRitualCast) {
                char.turn_actions = { ...char.turn_actions, leveled_spell_cast: false };
              }
              break;
            }
          }
        }

        const dc = spellSaveDC(char.level, castingScore);
        let spellDmg = 0;
        let spellHit = true;

        // 2024 PHB Magic Missile / Eldritch Blast multi-target.
        // Action payload `targetEnemyIds` lists one entry per dart/beam
        // (duplicates = multiple on same target). Resolves each independently,
        // then short-circuits the single-target damage path.
        const castAction = action as { type: 'cast_spell'; targetEnemyIds?: string[] };
        const multiTargets = castAction.targetEnemyIds;
        if (
          multiTargets &&
          multiTargets.length > 1 &&
          (spell.id === 'magic_missile' || spell.id === 'eldritch_blast')
        ) {
          const perShot = spell.id === 'magic_missile' ? '1d4+1' : '1d10';
          const agonizingBonusPerBeam =
            spell.id === 'eldritch_blast' && (char.feats ?? []).includes('agonizing_blast')
              ? Math.max(0, abilityMod(char.cha))
              : 0;
          let totalDealt = 0;
          const lines: string[] = [];
          for (let i = 0; i < multiTargets.length; i++) {
            const tid = multiTargets[i];
            const tgtEnemy = livingEnemiesInRoom.find((e) => e.id === tid);
            const tgtEnt = st.entities?.find((e) => e.id === tid && e.isEnemy);
            if (!tgtEnemy || !tgtEnt || tgtEnt.hp <= 0) {
              lines.push(`${i + 1}: ${tgtEnemy?.name ?? tid} — already down, fizzles.`);
              continue;
            }
            if (spell.id === 'eldritch_blast') {
              // Each beam rolls its own attack vs the target's AC.
              const atkE = resolveSpellAttack(char.level, castingScore, tgtEnemy.ac);
              if (!atkE.hit) {
                lines.push(
                  `${i + 1}: ${tgtEnemy.name} — MISS (${atkE.total} vs AC ${tgtEnemy.ac}).`
                );
                continue;
              }
              const dmgRoll = atkE.critical
                ? rollCritical(perShot) + agonizingBonusPerBeam
                : rollDice(perShot) + agonizingBonusPerBeam;
              const { damage: effDmg, note } = applyDamageMultiplier(
                dmgRoll,
                spell.damageType,
                tgtEnemy
              );
              const newHp = Math.max(0, tgtEnt.hp - effDmg);
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
                ),
              };
              totalDealt += effDmg;
              lines.push(
                `${i + 1}: ${tgtEnemy.name} — HIT ${effDmg}${atkE.critical ? ' CRIT' : ''}${note ?? ''}${newHp <= 0 ? ' (killed)' : ''}.`
              );
              if (newHp <= 0) {
                const split = splitEncounterXp(st, char.id, tgtEnemy.xp ?? 0);
                st = split.st;
                char.xp = (char.xp || 0) + split.share;
                st.enemies_killed = [...(st.enemies_killed ?? []), tid];
              }
            } else {
              // Magic Missile — auto-hit, no attack roll.
              const dmgRoll = rollDice(perShot);
              const { damage: effDmg, note } = applyDamageMultiplier(
                dmgRoll,
                spell.damageType,
                tgtEnemy
              );
              const newHp = Math.max(0, tgtEnt.hp - effDmg);
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
                ),
              };
              totalDealt += effDmg;
              lines.push(
                `dart ${i + 1} → ${tgtEnemy.name}: ${effDmg}${note ?? ''}${newHp <= 0 ? ' (killed)' : ''}.`
              );
              if (newHp <= 0) {
                const split = splitEncounterXp(st, char.id, tgtEnemy.xp ?? 0);
                st = split.st;
                char.xp = (char.xp || 0) + split.share;
                st.enemies_killed = [...(st.enemies_killed ?? []), tid];
              }
            }
          }
          if (isRoomCleared(st, seed, roomId)) {
            st = endCombatState(st);
          }
          narrative = `${char.name} casts ${spell.name}${slotNote}! ${lines.join(' ')} Total: ${totalDealt} ${spell.damageType ?? 'damage'}.`;
          narrative += applyPartyLevelUps(st, char, context);
          usedInitiative = true;
          spellDmg = 0; // Already applied per-target; skip the single-target block below.
          spellHit = false; // Suppress the single-target damage application.
          break;
        }

        if (spell.attackRoll) {
          // ── Spell attack roll ──────────────────────────────────────────────
          const atk = resolveSpellAttack(char.level, castingScore, spellTarget.ac);
          spellHit = atk.hit;
          const atkNote = ` (spell attack ${atk.roll}+${atk.bonus}=${atk.total} vs AC ${spellTarget.ac})`;
          if (!spellHit) {
            narrative = `${char.name} casts ${spell.name}${slotNote} — MISS!${atkNote}`;
            break;
          }
          const atkDmgExpr =
            spell.level === 0
              ? cantripDamageDice(spell, char.level)
              : upcastDamage(spell, slotLevel);
          spellDmg = atk.critical
            ? rollCritical(atkDmgExpr || null)
            : rollDice(atkDmgExpr || '1d4');
          // Agonizing Blast: Warlock invocation — add CHA mod to Eldritch Blast damage
          const agonizingBonus =
            spell.id === 'eldritch_blast' && (char.feats ?? []).includes('agonizing_blast')
              ? Math.max(0, abilityMod(char.cha))
              : 0;
          spellDmg += agonizingBonus;
          narrative = `${char.name} casts ${spell.name}${slotNote}!${atkNote} `;
          if (atk.critical) narrative += 'Critical spell hit! ';
          narrative += `${fmt.dmg(spellDmg)} ${spell.damageType ?? ''} damage!`;
          if (agonizingBonus > 0) narrative += ` [Agonizing Blast: +${agonizingBonus}]`;
        } else if (spell.savingThrow) {
          // ── Saving throw spell ─────────────────────────────────────────────
          const saveAbility = spell.savingThrow;
          const enemyScore = (spellTarget as unknown as Record<string, number>)[saveAbility] ?? 10;
          // Cover bonus to DEX saves (SRD 5.2.1 p.15): the spell originates from
          // the caster, so half/three-quarters cover between caster→target
          // applies to the target's DEX save against the spell. Other abilities
          // are unaffected.
          let saveCoverDexBonus = 0;
          if (saveAbility === 'dex' && st.entities) {
            const casterEntSave = st.entities.find((e) => e.id === char.id);
            const targetEntSave = st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
            if (casterEntSave && targetEntSave) {
              const obstaclesSave = [
                ...st.entities
                  .filter((e) => e.id !== char.id && e.id !== spellTargetId)
                  .map((e) => e.pos),
                ...roomObstacleCells,
              ];
              saveCoverDexBonus = coverBonus(casterEntSave.pos, targetEntSave.pos, obstaclesSave);
            }
          }
          const targetEntForCond = st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
          const saveFailed = rollConditionSave(
            saveAbility,
            enemyScore,
            dc,
            false,
            char.level,
            saveCoverDexBonus,
            targetEntForCond?.conditions ?? []
          );
          const saveLabel = saveAbility.toUpperCase();

          if (spell.damage) {
            const saveDmgExpr =
              spell.level === 0
                ? cantripDamageDice(spell, char.level)
                : upcastDamage(spell, slotLevel);
            const fullDmg = rollDice(saveDmgExpr || spell.damage);
            spellDmg = saveFailed
              ? fullDmg
              : spell.saveEffect === 'half'
                ? Math.floor(fullDmg / 2)
                : 0;
            const saveVerb = saveFailed ? 'fails' : 'succeeds';
            narrative = `${char.name} casts ${spell.name}${slotNote}! (${fmt.dc(dc)} ${saveLabel} save — ${spellTarget.name} ${saveVerb}.) `;
            narrative +=
              spellDmg > 0
                ? `${fmt.dmg(spellDmg)} ${spell.damageType ?? ''} damage!`
                : 'No damage.';
            if (!saveFailed && spell.saveEffect === 'half') narrative += ' (half damage)';
          } else {
            narrative = `${char.name} casts ${spell.name}${slotNote}! (DC ${dc} ${saveLabel} save — `;
            narrative += saveFailed
              ? `${spellTarget.name} fails.)`
              : `${spellTarget.name} succeeds.)`;
          }

          if (spell.condition && saveFailed) {
            if (spellTarget.condition_immunities?.includes(spell.condition)) {
              narrative += ` [${spellTarget.name} is immune to ${spell.condition}]`;
            } else {
              const condToApply = spell.condition!;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === spellTargetId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== condToApply), condToApply],
                      }
                    : e
                ),
              };
              st = pushEvent(st, {
                kind: 'condition_applied',
                targetId: spellTargetId,
                targetName: spellTarget.name,
                condition: condToApply,
                source: spell.name,
                round: st.round ?? 1,
              });
              narrative += ` The ${spellTarget.name} is ${condToApply}!`;
              if (spell.concentration) {
                char.concentrating_on = {
                  spellId,
                  condition: condToApply,
                  rounds_left: concentrationRoundsFor(spell),
                };
              }
            }
            const { damage: effCondDmg, note: condDmgNote } = applyDamageMultiplier(
              spellDmg,
              spell.damageType,
              spellTarget
            );
            if (condDmgNote) narrative += condDmgNote;
            const enemyEntCond = st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
            const curHpCond = enemyEntCond?.hp ?? 0;
            const newEnemyHp = curHpCond - effCondDmg;
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === spellTargetId && e.isEnemy ? { ...e, hp: Math.max(0, newEnemyHp) } : e
              ),
            };
            if (newEnemyHp <= 0) {
              const xpGain = spellTarget.xp ?? 10;
              const split = splitEncounterXp(st, char.id, xpGain);
              st = split.st;
              const xpShare = split.share;
              char.xp = (char.xp || 0) + xpShare;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
                ),
              };
              st.enemies_killed = [...st.enemies_killed, spellTargetId];
              char.concentrating_on = null;
              narrative += grantDarkOnesBlessing(char);
              if (isRoomCleared(st, seed, roomId)) {
                st = endCombatState(st);
              }
              narrative +=
                ' ' +
                pick(context.narratives.killShot)
                  .replace('{enemy}', spellTarget.name)
                  .replace('{xp}', String(xpShare));
              narrative += applyPartyLevelUps(st, char, context);
            }
            usedInitiative = true;
            break;
          }
        } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
          // ── Auto-hit (Magic Missile style) ─────────────────────────────────
          const autoHitExpr =
            spell.level === 0
              ? cantripDamageDice(spell, char.level)
              : upcastDamage(spell, slotLevel);
          spellDmg = rollDice(autoHitExpr || spell.damage);
          narrative = `${char.name} casts ${spell.name}${slotNote}! Auto-hit — ${fmt.dmg(spellDmg)} ${spell.damageType ?? ''} damage!`;
        }

        // ── AOE spells on grid ────────────────────────────────────────────────
        // If the spell has a blastRadius and grid entities exist, resolve against all
        // entities in the blast instead of the single-target path. Default shape is
        // sphere (radius from target square); cone/cube/line emanate from caster
        // toward the target square per SRD 5.2.1 p.193.
        const aoeBR = (spell as { blastRadius?: number }).blastRadius;
        const aoeShape =
          (spell as { aoeShape?: 'sphere' | 'cone' | 'cube' | 'line' }).aoeShape ?? 'sphere';
        if (aoeBR && st.entities && spell.savingThrow && spellDmg >= 0) {
          const epicenter =
            st.entities.find((e) => e.id === enemy.id && e.isEnemy)?.pos ??
            st.entities.find((e) => e.isEnemy)?.pos;
          const casterPos = st.entities.find((e) => e.id === char.id)?.pos;
          if (epicenter) {
            const blastTargets =
              aoeShape === 'sphere'
                ? entitiesInBlast(epicenter, aoeBR, st.entities)
                : aoeShape === 'cone' && casterPos
                  ? entitiesInCone(casterPos, epicenter, aoeBR, st.entities)
                  : aoeShape === 'cube' && casterPos
                    ? entitiesInCube(casterPos, epicenter, aoeBR, st.entities)
                    : aoeShape === 'line' && casterPos
                      ? entitiesInLine(casterPos, epicenter, aoeBR, st.entities)
                      : entitiesInBlast(epicenter, aoeBR, st.entities);
            const isEvoker = char.subclass === 'evoker';
            narrative += ` [AOE ${aoeBR}ft ${aoeShape}]`;
            for (const target of blastTargets) {
              if (target.id === char.id) continue;
              const targetEnemy = target.isEnemy ? getEnemyById(seed, target.id) : null;
              const targetChar = !target.isEnemy
                ? st.characters.find((c) => c.id === target.id)
                : null;

              if (target.isEnemy && targetEnemy) {
                const tScore =
                  (targetEnemy as unknown as Record<string, number>)[spell.savingThrow] ?? 10;
                // Cover bonus on DEX saves (SRD 5.2.1 p.15): obstacles between
                // the blast epicenter and this target give +2 (half) / +5
                // (three-quarters) to the DEX save.
                let tCover = 0;
                if (spell.savingThrow === 'dex' && st.entities) {
                  const obstaclesAoe = [
                    ...st.entities
                      .filter((e) => e.id !== target.id && !posEqual(e.pos, epicenter))
                      .map((e) => e.pos),
                    ...roomObstacleCells,
                  ];
                  tCover = coverBonus(epicenter, target.pos, obstaclesAoe);
                }
                const targetEntCond =
                  st.entities?.find((e) => e.id === target.id && e.isEnemy)?.conditions ?? [];
                const tFailed = rollConditionSave(
                  spell.savingThrow,
                  tScore,
                  dc,
                  false,
                  char.level,
                  tCover,
                  targetEntCond
                );
                const baseDmg = rollDice(upcastDamage(spell, slotLevel) || (spell.damage ?? '0'));
                const effDmg = tFailed
                  ? baseDmg
                  : spell.saveEffect === 'half'
                    ? Math.floor(baseDmg / 2)
                    : 0;
                const { damage: resDmg } = applyDamageMultiplier(
                  effDmg,
                  spell.damageType,
                  targetEnemy
                );
                const curHp = st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
                const newHp = curHp - resDmg;
                st = {
                  ...st,
                  entities: (st.entities ?? []).map((e) =>
                    e.id === target.id && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
                  ),
                };
                narrative += ` ${targetEnemy.name}: ${tFailed ? 'fails' : 'succeeds'} save — ${resDmg} dmg${newHp <= 0 ? ' (killed)' : ''}.`;
                if (newHp <= 0) {
                  const split = splitEncounterXp(st, char.id, targetEnemy.xp ?? 10);
                  st = split.st;
                  char.xp = (char.xp || 0) + split.share;
                  st = {
                    ...st,
                    entities: (st.entities ?? []).map((e) =>
                      e.id === target.id && e.isEnemy ? { ...e, hp: 0 } : e
                    ),
                  };
                  st.enemies_killed = [...st.enemies_killed, target.id];
                  narrative += grantDarkOnesBlessing(char);
                  narrative += applyPartyLevelUps(st, char, context);
                  if (isRoomCleared(st, seed, roomId)) {
                    st = endCombatState(st);
                  }
                }
              } else if (targetChar && !target.isEnemy) {
                // Allies in blast: Evoker Sculpt Spells lets them auto-succeed (PHB p.117)
                const autoSucceed = isEvoker;
                if (!autoSucceed && spell.saveEffect !== 'negates') {
                  const allyScore =
                    (targetChar[spell.savingThrow as keyof Character] as number) ?? 10;
                  let allyCover = 0;
                  if (spell.savingThrow === 'dex' && st.entities) {
                    const obstaclesAllyAoe = [
                      ...st.entities
                        .filter((e) => e.id !== target.id && !posEqual(e.pos, epicenter))
                        .map((e) => e.pos),
                      ...roomObstacleCells,
                    ];
                    allyCover = coverBonus(epicenter, target.pos, obstaclesAllyAoe);
                  }
                  const allyFailed = rollConditionSave(
                    spell.savingThrow,
                    allyScore,
                    dc,
                    false,
                    char.level,
                    allyCover,
                    targetChar.conditions ?? []
                  );
                  const baseDmg = rollDice(upcastDamage(spell, slotLevel) || (spell.damage ?? '0'));
                  const effDmg = allyFailed
                    ? baseDmg
                    : spell.saveEffect === 'half'
                      ? Math.floor(baseDmg / 2)
                      : 0;
                  if (effDmg > 0) {
                    const newAllyHp = Math.max(0, targetChar.hp - effDmg);
                    st = {
                      ...st,
                      characters: st.characters.map((c) =>
                        c.id === targetChar.id ? { ...c, hp: newAllyHp } : c
                      ),
                    };
                    narrative += ` ${targetChar.name}: ${allyFailed ? 'fails' : 'succeeds'} save — ${effDmg} dmg.`;
                  }
                } else if (autoSucceed) {
                  narrative += ` ${targetChar.name}: auto-succeeds (Sculpt Spells).`;
                }
              }
            }
            usedInitiative = true;
            break;
          }
        }

        // Apply damage to single enemy target
        if (spellDmg > 0 || spellHit) {
          const { damage: effSpellDmg, note: spellDmgNote } = applyDamageMultiplier(
            spellDmg,
            spell.damageType,
            spellTarget
          );
          if (spellDmgNote) narrative += spellDmgNote;
          spellDmg = effSpellDmg;
          const enemyEntSpell = st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
          const curEnemyHpSpell = enemyEntSpell?.hp ?? 0;
          const newEnemyHpSpell = curEnemyHpSpell - spellDmg;
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === spellTargetId && e.isEnemy ? { ...e, hp: newEnemyHpSpell } : e
            ),
          };
          if (newEnemyHpSpell <= 0) {
            const xpGain = spellTarget.xp ?? 10;
            const split = splitEncounterXp(st, char.id, xpGain);
            st = split.st;
            const xpShare = split.share;
            char.xp = (char.xp || 0) + xpShare;
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
              ),
            };
            st.enemies_killed = [...st.enemies_killed, spellTargetId];
            narrative += grantDarkOnesBlessing(char);
            if (isRoomCleared(st, seed, roomId)) {
              st = endCombatState(st);
            }
            narrative +=
              ' ' +
              pick(context.narratives.killShot)
                .replace('{enemy}', spellTarget.name)
                .replace('{xp}', String(xpShare));
            narrative += applyPartyLevelUps(st, char, context);
          } else {
            narrative += ` The ${spellTarget.name} has ${fmt.hp(newEnemyHpSpell)} HP remaining.`;
          }
        }

        usedInitiative = true;
        break;
      }

      case 'use_class_feature': {
        const features = context.classFeatures?.[char.character_class] ?? [];
        const fid = action.featureId;
        const dispatchKey = [char.character_class, char.subclass, fid].filter(Boolean).join('_');

        // ── Rage (Barbarian bonus action) ──────────────────────────────────────
        if (fid === 'rage') {
          if (!features.includes('rage')) {
            narrative = `${char.character_class} does not have Rage.`;
            break;
          }
          if (char.conditions.includes('raging')) {
            narrative = 'You are already raging!';
            break;
          }
          const rageUses = char.class_resource_uses?.rage_uses ?? rageUsesMax(char.level);
          if (rageUses <= 0) {
            narrative = 'No rage uses remaining. They recover on a long rest.';
            break;
          }
          char.conditions = [...char.conditions, 'raging'];
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            rage_uses: rageUses - 1,
          };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          narrative = `${char.name} RAGES! +${rageDamageBonus(char.level)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
        }

        // ── Action Surge (Fighter) ─────────────────────────────────────────────
        else if (fid === 'action_surge') {
          if (char.character_class.toLowerCase() !== 'fighter') {
            narrative = 'Only Fighters have Action Surge.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Action Surge requires Fighter level 2.';
            break;
          }
          if ((char.class_resource_uses?.action_surge ?? 0) >= 1) {
            narrative = 'Action Surge already used this rest.';
            break;
          }
          char.class_resource_uses = { ...(char.class_resource_uses ?? {}), action_surge: 1 };
          char.turn_actions = { ...char.turn_actions, action_used: false };
          narrative = `${char.name} uses Action Surge — one additional action this turn!`;
        }

        // ── Second Wind (Fighter bonus action) ────────────────────────────────
        // 2024 PHB: 2 uses at L1, 3 at L4, 4 at L10. Recovers on short rest.
        // 2024 PHB Fighter L9 — Tactical Master mastery swap. Pre-arms the next
        // attack to apply the chosen mastery (Push/Sap/Slow) instead of the
        // weapon's printed one. No action cost; consumes the slot in
        // `turn_actions` so a Fighter can't stack multiple swaps in one turn.
        else if (
          fid === 'tactical_master_push' ||
          fid === 'tactical_master_sap' ||
          fid === 'tactical_master_slow'
        ) {
          if (char.character_class.toLowerCase() !== 'fighter') {
            narrative = 'Only Fighters have Tactical Master.';
            break;
          }
          if (char.level < 9) {
            narrative = 'Tactical Master requires Fighter level 9.';
            break;
          }
          if (char.turn_actions.tactical_master_mastery) {
            narrative = 'Tactical Master already queued this turn.';
            break;
          }
          const m = fid.replace('tactical_master_', '') as 'push' | 'sap' | 'slow';
          char.turn_actions = { ...char.turn_actions, tactical_master_mastery: m };
          narrative = `${char.name} — Tactical Master: next attack will use ${m.toUpperCase()} mastery.`;
        } else if (fid === 'second_wind') {
          if (char.character_class.toLowerCase() !== 'fighter') {
            narrative = 'Only Fighters have Second Wind.';
            break;
          }
          const swMax = char.level >= 10 ? 4 : char.level >= 4 ? 3 : 2;
          const swUsed = char.class_resource_uses?.second_wind ?? 0;
          if (swUsed >= swMax) {
            narrative = `Second Wind exhausted (${swMax}/${swMax} used). Recovers on a short or long rest.`;
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const swHeal = rollDice('1d10') + char.level;
          char.hp = Math.min(char.max_hp, char.hp + swHeal);
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            second_wind: swUsed + 1,
          };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          narrative = `${char.name} uses Second Wind — healed ${swHeal} HP (now ${char.hp}/${char.max_hp}). (${swMax - swUsed - 1}/${swMax} remaining)`;
        }

        // ── Bardic Inspiration (Bard bonus action) ────────────────────────────
        else if (fid === 'bardic_inspiration') {
          if (char.character_class.toLowerCase() !== 'bard') {
            narrative = 'Only Bards have Bardic Inspiration.';
            break;
          }
          const biUses =
            char.class_resource_uses?.bardic_inspiration ??
            Math.max(1, Math.floor((char.cha - 10) / 2));
          if (biUses <= 0) {
            narrative = 'No Bardic Inspiration uses remaining.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          // Pick an ally to grant the die to. Currently auto-picks the first
          // non-self living party member; a future PR can add a target picker.
          const ally = st.characters.find((c) => c.id !== char.id && !c.dead && c.hp > 0);
          if (!ally) {
            narrative = 'No ally to inspire.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            bardic_inspiration: biUses - 1,
          };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          const inspDie =
            char.level >= 15 ? 'd12' : char.level >= 10 ? 'd10' : char.level >= 5 ? 'd8' : 'd6';
          st = {
            ...st,
            characters: st.characters.map((c) =>
              c.id === ally.id ? { ...c, bardic_inspiration_die: inspDie } : c
            ),
          };
          narrative = `${char.name} grants Bardic Inspiration (${inspDie}) to ${ally.name}! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
        }

        // ── Reckless Attack (Barbarian L2+) — free toggle, no action cost ──────
        else if (fid === 'reckless_attack') {
          if (char.character_class.toLowerCase() !== 'barbarian') {
            narrative = 'Only Barbarians have Reckless Attack.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Reckless Attack requires Barbarian level 2.';
            break;
          }
          if (char.turn_actions.reckless) {
            narrative = 'You are already attacking recklessly this turn.';
            break;
          }
          char.turn_actions = { ...char.turn_actions, reckless: true };
          narrative = `${char.name} attacks recklessly! Advantage on STR melee attacks this turn — but enemies have advantage against you until your next turn.`;
        }

        // ── Cunning Action: Dash (Rogue L2+ bonus action) ─────────────────────
        else if (fid === 'cunning_action_dash') {
          if (char.character_class.toLowerCase() !== 'rogue') {
            narrative = 'Only Rogues have Cunning Action.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Cunning Action requires Rogue level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const caSpeed = effectiveSpeed(char);
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          st = {
            ...st,
            movement_used: {
              ...(st.movement_used ?? {}),
              [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - caSpeed),
            },
          };
          narrative = `${char.name} uses Cunning Action: Dash — +${caSpeed} ft movement this turn.`;
        }

        // ── Cunning Action: Disengage (Rogue L2+ bonus action) ────────────────
        else if (fid === 'cunning_action_disengage') {
          if (char.character_class.toLowerCase() !== 'rogue') {
            narrative = 'Only Rogues have Cunning Action.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Cunning Action requires Rogue level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true, disengaged: true };
          narrative = `${char.name} uses Cunning Action: Disengage — no opportunity attacks when moving this turn.`;
        }

        // ── Cunning Action: Hide (Rogue L2+ bonus action) ─────────────────────
        else if (fid === 'cunning_action_hide') {
          if (char.character_class.toLowerCase() !== 'rogue') {
            narrative = 'Only Rogues have Cunning Action.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Cunning Action requires Rogue level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const sneakHideDC = enemyAlive ? passivePerceptionDC(enemy!.wis ?? 10) : 10;
          const hideProf = char.skill_proficiencies?.includes('Stealth') ?? false;
          const inspAdvHide = consumeInspirationForCheck(char);
          const bardicHideRoll = consumeBardicForCheck(char);
          const hideCheck = skillCheck(
            char.dex,
            sneakHideDC - bardicHideRoll,
            hideProf,
            char.level,
            isHeavilyEncumbered(char), // 2024 PHB: heavy encumbrance → disadv on DEX checks
            false,
            false,
            inspAdvHide,
            char.species === 'halfling'
          );
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          if (hideCheck.success) {
            // 2024 PHB: store the Stealth total as the hide DC. Enemies must
            // beat this with a Perception/Search check (or passive Perception)
            // to detect the hider before targeting them.
            char = inflictCondition(char, 'invisible');
            char.hide_dc = hideCheck.total;
            narrative = `${char.name} hides! (Stealth ${hideCheck.total} vs DC ${sneakHideDC} — success.) Hide DC = ${hideCheck.total}.`;
          } else {
            char.hide_dc = undefined;
            narrative = `${char.name} tries to hide but fails. (Stealth ${hideCheck.total} vs DC ${sneakHideDC})`;
          }
        }

        // ── 2024 PHB Rogue Cunning Strike (L5+) ──────────────────────────────
        // Pre-commits an effect that fires on the next Sneak Attack. No
        // action cost; the SA-die cost is paid in the attack handler.
        else if (fid.startsWith('cunning_strike_')) {
          if (char.character_class.toLowerCase() !== 'rogue') {
            narrative = 'Only Rogues have Cunning Strike.';
            break;
          }
          if (char.level < 5) {
            narrative = 'Cunning Strike requires Rogue level 5.';
            break;
          }
          const effect = fid.replace('cunning_strike_', '') as
            | 'trip'
            | 'poison'
            | 'withdraw'
            | 'disarm';
          char.turn_actions = { ...char.turn_actions, cunning_strike_pending: effect };
          narrative = `${char.name} readies a Cunning Strike (${effect}) on the next Sneak Attack.`;
        }

        // ── Battle Master: Maneuver (Fighter L3+ subclass) ────────────────────
        else if (dispatchKey.includes('battle_master') && fid.startsWith('maneuver_')) {
          const sdPool = char.class_resource_uses?.superiority_dice ?? 4;
          if (sdPool <= 0) {
            narrative = 'No superiority dice remaining (recover on short rest).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            superiority_dice: sdPool - 1,
          };
          const sdRoll = rollDice('1d8');
          if (fid === 'maneuver_trip') {
            const tripSave =
              rollDice('1d20') +
              abilityMod((enemy as unknown as Record<string, number>)['str'] ?? 10);
            const tripDC = 8 + profBonus(char.level) + abilityMod(char.str);
            if (tripSave < tripDC) {
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === roomId && e.isEnemy
                    ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'] }
                    : e
                ),
              };
              narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${enemy!.name} knocked prone! (STR save ${tripSave} vs DC ${tripDC})`;
            } else {
              narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${enemy!.name} resists the trip. (STR save ${tripSave} vs DC ${tripDC})`;
            }
          } else if (fid === 'maneuver_goading') {
            const goadSave =
              rollDice('1d20') +
              abilityMod((enemy as unknown as Record<string, number>)['wis'] ?? 10);
            const goadDC = 8 + profBonus(char.level) + abilityMod(char.cha);
            const goadSuccess = goadSave >= goadDC;
            st = pushEvent(st, {
              kind: 'save',
              characterId: enemy!.id,
              characterName: enemy!.name,
              ability: 'wis',
              roll: goadSave,
              dc: goadDC,
              success: goadSuccess,
              vs: 'Goading Attack',
              round: st.round ?? 1,
            });
            if (!goadSuccess) {
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === roomId && e.isEnemy
                    ? {
                        ...e,
                        conditions: [...e.conditions.filter((c) => c !== 'goaded'), 'goaded'],
                      }
                    : e
                ),
              };
              st = pushEvent(st, {
                kind: 'condition_applied',
                targetId: enemy!.id,
                targetName: enemy!.name,
                condition: 'goaded',
                source: 'Goading Attack',
                round: st.round ?? 1,
              });
              narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${enemy!.name} goaded (disadvantage vs others)! (WIS save ${goadSave} vs DC ${goadDC})`;
            } else {
              narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${enemy!.name} resists. (WIS save ${goadSave} vs DC ${goadDC})`;
            }
          } else {
            // Generic maneuver: deal extra die damage
            narrative = `Maneuver — +${sdRoll} superiority die damage! (${sdPool - 1} dice remaining)`;
          }
        }

        // ── Monk: Flurry of Blows (2 unarmed strikes, 1 ki, bonus action) ────────
        else if (fid === 'flurry_of_blows') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'monk') {
            narrative = 'Only Monks have Flurry of Blows.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Flurry of Blows requires Monk level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          if (!char.turn_actions.action_used) {
            narrative = 'You must use your Attack action before using Flurry of Blows.';
            break;
          }
          const kiPool = char.class_resource_uses?.ki_points ?? char.level;
          if (kiPool <= 0) {
            narrative = 'No ki points remaining (recover on short rest).';
            break;
          }
          char.class_resource_uses = { ...(char.class_resource_uses ?? {}), ki_points: kiPool - 1 };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          // 2024 PHB Martial Arts die: 1d6 (L1) → 1d8 (L5) → 1d10 (L11) → 1d12 (L17).
          // Was 1d4/6/8/10 in 2014; 2024 bumps every tier by one die size.
          const martialDie =
            char.level >= 17 ? 12 : char.level >= 11 ? 10 : char.level >= 5 ? 8 : 6;
          const isOpenHand = char.subclass === 'open_hand';
          const monkDc = 8 + profBonus(char.level) + abilityMod(char.wis);
          let flurryNarrative = `${char.name} — Flurry of Blows (${kiPool - 1} ki remaining)!`;
          for (let i = 0; i < 2; i++) {
            const flurryTarget = st.entities?.find((e) => e.id === roomId && e.isEnemy);
            if (!enemyAlive || !flurryTarget) break;
            const toHit = rollDice('1d20') + abilityMod(char.dex) + profBonus(char.level);
            if (toHit >= (enemy?.ac ?? 10)) {
              const dmg = Math.max(1, rollDice(`1d${martialDie}`) + abilityMod(char.dex));
              const curHp = st.entities?.find((e) => e.id === roomId && e.isEnemy)?.hp ?? 0;
              const newHp = curHp - dmg;
              st = {
                ...st,
                entities: (st.entities ?? []).map((e) =>
                  e.id === roomId && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
                ),
              };
              flurryNarrative += ` Strike ${i + 1}: hit (${toHit}) — ${dmg} bludgeoning.${newHp <= 0 ? ' (killed)' : ''}`;
              // Way of the Open Hand (PHB p.79) — Open Hand Technique. Each
              // Flurry hit forces the target to make a DEX save (Monk DC) or
              // be knocked prone. (RAW lets the player choose between prone /
              // push 15 ft / no reactions; prone is the most universally
              // valuable for the engine's combat model so we auto-pick it.)
              if (isOpenHand && newHp > 0) {
                const enemyDex = (enemy?.dex ?? 10) as number;
                const dexSave = rollDice('1d20') + abilityMod(enemyDex);
                const dexSuccess = dexSave >= monkDc;
                st = pushEvent(st, {
                  kind: 'save',
                  characterId: enemy?.id ?? roomId,
                  characterName: enemy?.name ?? 'target',
                  ability: 'dex',
                  roll: dexSave,
                  dc: monkDc,
                  success: dexSuccess,
                  vs: 'Open Hand Technique',
                  round: st.round ?? 1,
                });
                if (!dexSuccess) {
                  st = {
                    ...st,
                    entities: (st.entities ?? []).map((e) =>
                      e.id === roomId && e.isEnemy
                        ? {
                            ...e,
                            conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                          }
                        : e
                    ),
                  };
                  st = pushEvent(st, {
                    kind: 'condition_applied',
                    targetId: enemy?.id ?? roomId,
                    targetName: enemy?.name ?? 'target',
                    condition: 'prone',
                    source: 'Open Hand Technique',
                    round: st.round ?? 1,
                  });
                  flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — prone!`;
                } else {
                  flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — resists.`;
                }
              }
              if (newHp <= 0) {
                const split = splitEncounterXp(st, char.id, enemy?.xp ?? 10);
                st = split.st;
                char.xp = (char.xp || 0) + split.share;
                flurryNarrative += applyPartyLevelUps(st, char, context);
                st.enemies_killed = [...st.enemies_killed, roomId];
                st = endCombatState(st);
                break;
              }
            } else {
              flurryNarrative += ` Strike ${i + 1}: miss (${toHit}).`;
            }
          }
          narrative = flurryNarrative;
        }

        // ── Monk: Step of the Wind (Dash or Disengage, 1 ki, bonus action) ───────
        // 2024 PHB Patient Defense — Dodge as a bonus action. Free 1/turn at
        // L2+; spending 1 DP also grants advantage on the next DEX save before
        // your next turn.
        else if (fid === 'patient_defense_free' || fid === 'patient_defense_dp') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'monk') {
            narrative = 'Only Monks have Patient Defense.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Patient Defense requires Monk level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const isFree = fid === 'patient_defense_free';
          if (isFree && char.turn_actions.monk_free_used) {
            narrative = "You've already used your free monk bonus action this turn.";
            break;
          }
          const kiPoolPD = char.class_resource_uses?.ki_points ?? char.level;
          if (!isFree && kiPoolPD <= 0) {
            narrative = 'No Discipline Points remaining (recover on short rest).';
            break;
          }
          if (!isFree) {
            char.class_resource_uses = {
              ...(char.class_resource_uses ?? {}),
              ki_points: kiPoolPD - 1,
            };
          }
          char.turn_actions = {
            ...char.turn_actions,
            bonus_action_used: true,
            dodging: true,
            ...(isFree ? { monk_free_used: true } : {}),
          };
          narrative = isFree
            ? `${char.name} — Patient Defense (free): assumes a defensive stance. Attacks against have disadvantage until next turn.`
            : `${char.name} — Patient Defense (1 DP): defensive stance + advantage on next DEX save. (${kiPoolPD - 1} DP remaining)`;
        }

        // 2024 PHB Step of the Wind — free 1/turn variants (single effect) +
        // 1-DP variant (Dash AND Disengage).
        else if (fid === 'step_of_wind_free_dash' || fid === 'step_of_wind_free_disengage') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'monk') {
            narrative = 'Only Monks have Step of the Wind.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Step of the Wind requires Monk level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          if (char.turn_actions.monk_free_used) {
            narrative = "You've already used your free monk bonus action this turn.";
            break;
          }
          char.turn_actions = {
            ...char.turn_actions,
            bonus_action_used: true,
            monk_free_used: true,
          };
          if (fid === 'step_of_wind_free_dash') {
            const sw = effectiveSpeed(char);
            st = {
              ...st,
              movement_used: {
                ...(st.movement_used ?? {}),
                [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - sw),
              },
            };
            narrative = `${char.name} — Step of the Wind: Dash (free)! +${sw} ft movement.`;
          } else {
            char.turn_actions = { ...char.turn_actions, disengaged: true };
            narrative = `${char.name} — Step of the Wind: Disengage (free)! No opportunity attacks when moving.`;
          }
        } else if (fid === 'step_of_wind_dash' || fid === 'step_of_wind_disengage') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'monk') {
            narrative = 'Only Monks have Step of the Wind.';
            break;
          }
          if (char.level < 2) {
            narrative = 'Step of the Wind requires Monk level 2.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const kiPool2 = char.class_resource_uses?.ki_points ?? char.level;
          if (kiPool2 <= 0) {
            narrative = 'No Discipline Points remaining (recover on short rest).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            ki_points: kiPool2 - 1,
          };
          // 2024 PHB: spending 1 DP gives BOTH Dash and Disengage. The legacy
          // `step_of_wind_disengage` id is kept for back-compat but now also
          // dashes. `step_of_wind_dash` does the same.
          char.turn_actions = {
            ...char.turn_actions,
            bonus_action_used: true,
            disengaged: true,
          };
          const stwSpeed = effectiveSpeed(char);
          st = {
            ...st,
            movement_used: {
              ...(st.movement_used ?? {}),
              [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - stwSpeed),
            },
          };
          narrative = `${char.name} — Step of the Wind (1 DP): Dash +${stwSpeed} ft AND Disengage. (${kiPool2 - 1} DP remaining)`;
        }

        // ── Monk: Stunning Strike (1 ki, after a hit) ────────────────────────────
        else if (fid === 'stunning_strike') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'monk') {
            narrative = 'Only Monks have Stunning Strike.';
            break;
          }
          if (char.level < 5) {
            narrative = 'Stunning Strike requires Monk level 5.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No living target.';
            break;
          }
          // 2024 PHB: Stunning Strike is once per turn (was per-hit in 2014).
          if (char.turn_actions.monk_stunning_strike_used) {
            narrative = 'Stunning Strike already used this turn.';
            break;
          }
          const kiPool3 = char.class_resource_uses?.ki_points ?? char.level;
          if (kiPool3 <= 0) {
            narrative = 'No Discipline Points remaining (recover on short rest).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            ki_points: kiPool3 - 1,
          };
          char.turn_actions = { ...char.turn_actions, monk_stunning_strike_used: true };
          const stunDC = 8 + profBonus(char.level) + abilityMod(char.wis);
          const conSave =
            rollDice('1d20') +
            abilityMod((enemy as unknown as Record<string, number>)['con'] ?? 10);
          const stunSuccess = conSave >= stunDC;
          st = pushEvent(st, {
            kind: 'save',
            characterId: enemy.id,
            characterName: enemy.name,
            ability: 'con',
            roll: conSave,
            dc: stunDC,
            success: stunSuccess,
            vs: 'Stunning Strike',
            round: st.round ?? 1,
          });
          if (!stunSuccess) {
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === roomId && e.isEnemy
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'stunned'), 'stunned'],
                    }
                  : e
              ),
            };
            st = pushEvent(st, {
              kind: 'condition_applied',
              targetId: enemy.id,
              targetName: enemy.name,
              condition: 'stunned',
              source: 'Stunning Strike',
              round: st.round ?? 1,
            });
            narrative = `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${enemy.name} is stunned until the end of your next turn! (${kiPool3 - 1} ki remaining)`;
          } else {
            narrative = `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${enemy.name} resists. (${kiPool3 - 1} ki remaining)`;
          }
        }

        // ── Way of Shadow: Shadow Arts (PHB p.80) ────────────────────────────────
        // The L3 Shadow Monk learns to cast shadow-aligned spells via ki. Our
        // model collapses the cantrip/spell list into a single 2-ki action
        // that grants the `invisible` condition for 3 rounds — represents
        // "step into magical darkness" tactically.
        else if (fid === 'shadow_arts') {
          if (char.subclass !== 'shadow' || char.character_class.toLowerCase() !== 'monk') {
            narrative = 'Only Way of Shadow Monks have Shadow Arts.';
            break;
          }
          if (char.level < 3) {
            narrative = 'Shadow Arts requires Monk level 3.';
            break;
          }
          const kiSa = char.class_resource_uses?.ki_points ?? char.level;
          if (kiSa < 2) {
            narrative = 'Need 2 ki points for Shadow Arts.';
            break;
          }
          char.class_resource_uses = { ...(char.class_resource_uses ?? {}), ki_points: kiSa - 2 };
          char.conditions = [...char.conditions.filter((c) => c !== 'invisible'), 'invisible'];
          char.condition_durations = {
            ...(char.condition_durations ?? {}),
            invisible: 3,
          };
          char.turn_actions = { ...char.turn_actions, action_used: true };
          usedInitiative = true;
          narrative = `🌑 ${char.name} weaves Shadow Arts — invisible for 3 rounds. (${kiSa - 2} ki remaining)`;
        }

        // ── Path of the Berserker — Frenzy (PHB p.49) ────────────────────────────
        // While raging, make a single melee weapon attack as a bonus action.
        // Damage uses the equipped weapon's die + STR mod + rage bonus, matching
        // the regular attack handler's pattern but in a self-contained roll.
        // RAW: when rage ends, you suffer one level of exhaustion. Deferred —
        // tracking "rage ended after Frenzy used this round" needs more state.
        else if (fid === 'frenzy_attack') {
          if (char.subclass !== 'berserker' || char.character_class.toLowerCase() !== 'barbarian') {
            narrative = 'Only Berserker Barbarians have Frenzy.';
            break;
          }
          if (!char.conditions.includes('raging')) {
            narrative = 'You must be raging to use Frenzy.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No enemy to Frenzy attack.';
            break;
          }
          const frWeapon = char.equipped_weapon
            ? getItemData(
                char.inventory?.find(
                  (i) => i.instance_id === char.equipped_weapon
                ) as InventoryItem,
                context
              )
            : null;
          if (frWeapon?.range === 'ranged') {
            narrative = 'Frenzy requires a melee weapon.';
            break;
          }
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          const frTarget = livingEnemiesInRoom[0] ?? enemy;
          const frToHit = rollDice('1d20') + abilityMod(char.str) + profBonus(char.level);
          if (frToHit >= (frTarget.ac ?? 10)) {
            const dmgDice = frWeapon?.damage ?? '1d4';
            const frDmg = Math.max(
              1,
              rollDice(dmgDice) + abilityMod(char.str) + rageDamageBonus(char.level)
            );
            const curHp = st.entities?.find((e) => e.id === frTarget.id && e.isEnemy)?.hp ?? 0;
            const newHp = Math.max(0, curHp - frDmg);
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === frTarget.id && e.isEnemy ? { ...e, hp: newHp } : e
              ),
            };
            narrative = `💢 ${char.name} — Frenzy! (${frToHit} hits AC ${frTarget.ac}) ${frDmg} ${frWeapon?.damageType ?? 'bludgeoning'}${newHp <= 0 ? ` — ${frTarget.name} falls!` : ''}`;
            if (newHp <= 0) {
              const split = splitEncounterXp(st, char.id, frTarget.xp ?? 10);
              st = split.st;
              char.xp = (char.xp || 0) + split.share;
              narrative += applyPartyLevelUps(st, char, context);
              st.enemies_killed = [...st.enemies_killed, frTarget.id];
              if (isRoomCleared(st, seed, roomId)) {
                st = endCombatState(st);
                char.conditions = char.conditions.filter((c) => c !== 'raging');
              }
            }
          } else {
            narrative = `💢 ${char.name} — Frenzy! (${frToHit} vs AC ${frTarget.ac}) — miss.`;
          }
        }

        // ── Druid: Wild Shape ────────────────────────────────────────────────────
        else if (fid === 'wild_shape' || fid.startsWith('wild_shape_')) {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'druid') {
            narrative = 'Only Druids have Wild Shape.';
            break;
          }
          if (char.conditions.includes('wild_shaped')) {
            narrative =
              'You are already in Wild Shape. Attack or use Dismiss Wild Shape to end it.';
            break;
          }
          const wsUses = char.class_resource_uses?.wild_shape ?? 2;
          if (wsUses <= 0) {
            narrative = 'No Wild Shape uses remaining (recover on short rest).';
            break;
          }
          // Determine the form: 2024 PHB ships a Beast Forms catalog the
          // druid picks from. The choice generator surfaces one option per
          // form via `wild_shape_<formId>`. If just 'wild_shape' is invoked
          // (legacy/test), fall back to the lowest-CR form the druid can
          // access.
          const isMoon = char.subclass === 'moon';
          const formId = fid === 'wild_shape' ? '' : fid.replace('wild_shape_', '');
          const form = formId
            ? BEAST_FORMS[formId]
            : Object.values(BEAST_FORMS).find((f) => f.cr === 0);
          if (!form) {
            narrative = `Unknown beast form: ${formId}.`;
            break;
          }
          // Gate by CR access table.
          const maxCR = isMoon
            ? Math.max(1, Math.floor(char.level / 3))
            : char.level >= 8
              ? 1
              : char.level >= 4
                ? 0.5
                : 0.25;
          if (form.cr > maxCR) {
            narrative = `${form.name} requires a higher-CR form access (you can access CR ≤ ${maxCR}).`;
            break;
          }
          // 2024 PHB temp HP: base 2 × level, Moon 3 × level.
          const tempHp = (isMoon ? 3 : 2) * char.level;
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            wild_shape: wsUses - 1,
          };
          char.conditions = [...char.conditions, 'wild_shaped'];
          char.wild_shape_form = form.id;
          char.hp = char.hp + tempHp;
          if (st.combat_active) {
            char.turn_actions = isMoon
              ? { ...char.turn_actions, bonus_action_used: true }
              : { ...char.turn_actions, action_used: true };
            if (isMoon) usedInitiative = false;
            else usedInitiative = true;
          }
          const traits = [
            form.packTactics ? 'Pack Tactics' : '',
            form.physicalResistance ? 'Physical Resistance' : '',
            form.flying ? 'Flying' : '',
            form.climbing ? 'Climb' : '',
          ]
            .filter(Boolean)
            .join(', ');
          const traitNote = traits ? ` Traits: ${traits}.` : '';
          narrative = `🐾 ${char.name} transforms into a ${form.name}!${isMoon ? ' (bonus action)' : ''} +${tempHp} temp HP. ${form.descriptor}.${traitNote} (${wsUses - 1} uses remaining)`;
        }

        // ── Druid: Dismiss Wild Shape ────────────────────────────────────────────
        else if (fid === 'dismiss_wild_shape') {
          if (!char.conditions.includes('wild_shaped')) {
            narrative = 'You are not in Wild Shape.';
            break;
          }
          char.wild_shape_form = undefined;
          char.conditions = char.conditions.filter((c) => c !== 'wild_shaped');
          narrative = `${char.name} reverts to their normal form.`;
        }

        // ── Circle of the Moon: Moon Healing (PHB p.69) ──────────────────────────
        // While shifted, spend a spell slot as a bonus action to heal 1d8 per
        // slot level. Limited to combat-active scenarios in practice (it's a
        // bonus action; outside combat the regular cure_wounds path is better).
        else if (fid === 'moon_healing') {
          if (char.subclass !== 'moon' || char.character_class.toLowerCase() !== 'druid') {
            narrative = 'Only Circle of the Moon Druids have Moon Healing.';
            break;
          }
          if (!char.conditions.includes('wild_shaped')) {
            narrative = 'You must be in Wild Shape to use Moon Healing.';
            break;
          }
          const mhSlotsMax = char.spell_slots_max ?? {};
          const mhSlotsUsed = char.spell_slots_used ?? {};
          const mhSlotLvl = Object.keys(mhSlotsMax)
            .map(Number)
            .filter((n) => n >= 1 && (mhSlotsMax[n] ?? 0) > (mhSlotsUsed[n] ?? 0))
            .sort((a, b) => a - b)[0];
          if (mhSlotLvl === undefined) {
            narrative = 'No spell slot available for Moon Healing.';
            break;
          }
          const heal = rollDice(`${mhSlotLvl}d8`);
          char.spell_slots_used = {
            ...mhSlotsUsed,
            [mhSlotLvl]: (mhSlotsUsed[mhSlotLvl] ?? 0) + 1,
          };
          char.hp = Math.min(char.max_hp, char.hp + heal);
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          narrative = `🌙 ${char.name} channels lunar energy — heals ${heal} HP (now ${char.hp}/${char.max_hp}). Spent lvl ${mhSlotLvl} slot.`;
        }

        // ── Sorcerer: Metamagic — Twinned Spell (1 sorcery point) ────────────────
        else if (fid === 'metamagic_twinned') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'sorcerer') {
            narrative = 'Only Sorcerers have Metamagic.';
            break;
          }
          const spPool = char.class_resource_uses?.sorcery_points ?? char.level;
          if (spPool < 1) {
            narrative = 'Not enough sorcery points (need 1).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            sorcery_points: spPool - 1,
          };
          st = { ...st, metamagic_active: 'twinned' };
          narrative = `${char.name} — Metamagic: Twinned Spell! Your next spell will target a second creature. (${spPool - 1} sorcery points remaining)`;
        }

        // ── Sorcerer: Metamagic — Quickened Spell (2 sorcery points) ─────────────
        else if (fid === 'metamagic_quickened') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'sorcerer') {
            narrative = 'Only Sorcerers have Metamagic.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          // SRD 5.2.1 p.67: can't activate Quickened if you've already cast a
          // level 1+ spell this turn.
          if (char.turn_actions.leveled_spell_cast) {
            narrative =
              'You have already cast a level 1+ spell this turn — Quickened Spell cannot be used.';
            break;
          }
          const spPool2 = char.class_resource_uses?.sorcery_points ?? char.level;
          if (spPool2 < 2) {
            narrative = 'Not enough sorcery points (need 2).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            sorcery_points: spPool2 - 2,
          };
          char.turn_actions = {
            ...char.turn_actions,
            bonus_action_used: true,
            action_used: false,
            quickened_used: true,
          };
          st = { ...st, metamagic_active: 'quickened' };
          narrative = `${char.name} — Metamagic: Quickened Spell! Cast your next spell as a bonus action. (${spPool2 - 2} sorcery points remaining)`;
        }

        // ── Sorcerer: Metamagic — Empowered Spell (1 sorcery point) ──────────────
        else if (fid === 'metamagic_empowered') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'sorcerer') {
            narrative = 'Only Sorcerers have Metamagic.';
            break;
          }
          const spPool3 = char.class_resource_uses?.sorcery_points ?? char.level;
          if (spPool3 < 1) {
            narrative = 'Not enough sorcery points (need 1).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            sorcery_points: spPool3 - 1,
          };
          st = { ...st, metamagic_active: 'empowered' };
          narrative = `${char.name} — Metamagic: Empowered Spell! You may reroll up to ${abilityMod(char.cha)} damage dice on your next spell. (${spPool3 - 1} sorcery points remaining)`;
        }

        // ── Warlock: Agonizing Blast invocation (passive — toggled on/off) ────────
        else if (fid === 'agonizing_blast') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'warlock') {
            narrative = 'Only Warlocks can take Agonizing Blast.';
            break;
          }
          const hasIt = char.feats?.includes('agonizing_blast') ?? false;
          if (hasIt) {
            narrative = 'You already have the Agonizing Blast invocation.';
            break;
          }
          char.feats = [...(char.feats ?? []), 'agonizing_blast'];
          narrative = `${char.name} gains the Agonizing Blast invocation — Eldritch Blast now adds +${abilityMod(char.cha)} force damage per beam.`;
        }

        // ── Warlock: Devil's Sight invocation ────────────────────────────────────
        else if (fid === 'devils_sight') {
          const cls = char.character_class.toLowerCase();
          if (cls !== 'warlock') {
            narrative = "Only Warlocks can take Devil's Sight.";
            break;
          }
          const hasIt2 = char.feats?.includes('devils_sight') ?? false;
          if (hasIt2) {
            narrative = "You already have the Devil's Sight invocation.";
            break;
          }
          char.feats = [...(char.feats ?? []), 'devils_sight'];
          narrative = `${char.name} gains Devil's Sight — you can see normally in magical darkness.`;
        }

        // ── Champion Fighter: Remarkable Athlete ────────────────────────────────
        else if (fid === 'remarkable_athlete') {
          narrative = `${char.name} — Remarkable Athlete: add +${Math.ceil(profBonus(char.level) / 2)} to uninvested STR/DEX/CON checks (passive).`;
        }

        // ── Abjurer Wizard: Arcane Ward ──────────────────────────────────────────
        else if (fid === 'arcane_ward') {
          if (char.subclass !== 'abjurer') {
            narrative = 'Only Abjurer Wizards have Arcane Ward.';
            break;
          }
          const wardHp = 2 * char.level;
          char.class_resource_uses = { ...(char.class_resource_uses ?? {}), arcane_ward: wardHp };
          narrative = `${char.name} creates an Arcane Ward with ${wardHp} HP. It absorbs damage before your HP is reduced.`;
        }

        // ── 2024 PHB Cleric: Divine Spark (universal Channel Divinity) ───────────
        // Action. Spend CD to deal 1d8 + WIS mod radiant damage to a target OR
        // heal a target ally the same amount. Default: damage the current enemy.
        else if (fid === 'divine_spark') {
          if (char.character_class.toLowerCase() !== 'cleric') {
            narrative = 'Only Clerics have Divine Spark.';
            break;
          }
          const cdUsesDS = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesDS <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No living target.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesDS - 1,
          };
          const dsRoll = rollDice('1d8') + abilityMod(char.wis);
          // Read the CURRENT entity HP, not the seed's template HP — otherwise
          // Divine Spark resets the target to (full_hp - damage) and wipes
          // every prior turn's accumulated damage. (Vale playthrough log,
          // 2026-05-21: Ghoul jumped from 19 → 37 mid-combat after DS.)
          const enemyEntForDs = st.entities?.find((e) => e.id === enemy.id && e.isEnemy);
          const currentDsHp = enemyEntForDs?.hp ?? enemy.hp;
          const dsHp = Math.max(0, currentDsHp - dsRoll);
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === enemy.id && e.isEnemy ? { ...e, hp: dsHp } : e
            ),
          };
          st = pushEvent(st, {
            kind: 'attack_hit',
            attackerId: char.id,
            attackerName: char.name,
            targetId: enemy.id,
            targetName: enemy.name,
            damage: dsRoll,
            damageType: 'radiant',
            isCrit: false,
            toHit: 0,
            targetAc: enemy.ac,
            round: st.round ?? 1,
          });
          narrative = `✦ Divine Spark! ${enemy.name} takes ${fmt.dmg(dsRoll)} radiant damage. (${cdUsesDS - 1} Channel Divinity remaining)`;
          if (dsHp <= 0) {
            const split = splitEncounterXp(st, char.id, enemy.xp ?? 0);
            st = split.st;
            char.xp = (char.xp || 0) + split.share;
            narrative += ` ${enemy.name} is destroyed.`;
            narrative += applyPartyLevelUps(st, char, context);
          }
          usedInitiative = true;
        }

        // ── 2024 PHB Cleric: Turn Undead (universal Channel Divinity) ────────────
        // Magic Action (full action), per 2024 PHB p.74. All undead within 30 ft
        // must make a WIS save or be frightened of the cleric for 1 minute. They
        // can't willingly move closer; if affected they must Dash away when
        // possible. We model with the existing `frightened` condition.
        else if (fid === 'turn_undead') {
          if (char.character_class.toLowerCase() !== 'cleric') {
            narrative = 'Only Clerics have Turn Undead.';
            break;
          }
          const cdUsesTU = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesTU <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          if (char.turn_actions.action_used) {
            narrative = 'Action already used this turn.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesTU - 1,
          };
          char.turn_actions = { ...char.turn_actions, action_used: true };
          const tuDC = 8 + profBonus(char.level) + abilityMod(char.wis);
          const selfEntTU = st.entities?.find((e) => e.id === char.id);
          // Identify undead enemies. Convention: enemy name contains "skeleton",
          // "ghoul", "shadow", "zombie", "lich", "wraith", "undead" — RAW would
          // check creature type but our enemy templates don't carry that yet.
          const undeadKeywords = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
          const turnedIds: string[] = [];
          const lines: string[] = [];
          for (const e of st.entities ?? []) {
            if (!e.isEnemy || e.hp <= 0) continue;
            if (!selfEntTU) continue;
            const dist = Math.max(
              Math.abs(e.pos.x - selfEntTU.pos.x),
              Math.abs(e.pos.y - selfEntTU.pos.y)
            );
            if (dist > 6) continue; // 30 ft = 6 squares
            const enemyData = getEnemyById(seed, e.id);
            if (!enemyData || !undeadKeywords.test(enemyData.name)) continue;
            const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
            const save = rollDice('1d20') + abilityMod(wisScore);
            if (save < tuDC) {
              turnedIds.push(e.id);
              lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — turned!`);
              st = pushEvent(st, {
                kind: 'condition_applied',
                targetId: e.id,
                targetName: enemyData.name,
                condition: 'frightened',
                source: 'Turn Undead',
                round: st.round ?? 1,
              });
            } else {
              lines.push(`${enemyData.name}: WIS ${save} vs DC ${tuDC} — resists.`);
            }
          }
          if (turnedIds.length > 0) {
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                turnedIds.includes(e.id)
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
                    }
                  : e
              ),
            };
          }
          narrative =
            lines.length > 0
              ? `✦ Turn Undead! ${lines.join(' ')} (${cdUsesTU - 1} Channel Divinity remaining)`
              : `Turn Undead — no undead within 30 ft. (${cdUsesTU - 1} Channel Divinity remaining)`;
        }

        // ── 2024 PHB Cleric L5: Sear Undead ──────────────────────────────────────
        // Action. Replaces 2014 Destroy Undead. AoE radiant: each undead in 30 ft
        // takes Nd8 (N = cleric level) radiant damage; WIS save halves.
        // 2024 PHB Orc — Adrenaline Rush. Bonus action: gain the Dash action
        // (refunds full speed of movement this turn) and gain temp HP equal
        // to proficiency bonus. 1/short rest.
        else if (fid === 'adrenaline_rush') {
          if (char.species !== 'orc') {
            narrative = 'Only Orcs have Adrenaline Rush.';
            break;
          }
          if (char.class_resource_uses?.adrenaline_rush_used === 1) {
            narrative = 'Adrenaline Rush already used this short rest.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const arSpeed = effectiveSpeed(char);
          st = {
            ...st,
            movement_used: {
              ...(st.movement_used ?? {}),
              [char.id]: Math.max(0, (st.movement_used?.[char.id] ?? 0) - arSpeed),
            },
          };
          const arTemp = profBonus(char.level);
          const newTemp = Math.max(char.temp_hp ?? 0, arTemp);
          char.temp_hp = newTemp;
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            adrenaline_rush_used: 1,
          };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          narrative = `🪓 ${char.name} — Adrenaline Rush! +${arSpeed} ft movement (Dash) and ${arTemp} temp HP.`;
          usedInitiative = true;
        }

        // 2024 PHB Goliath — Large Form. Bonus action; the Goliath grows to
        // Large size for ~10 rounds (1 min RAW). Gains +10 ft speed (via
        // condition wired in `effectiveSpeed`) and is treated as Large for
        // any size-dependent interactions. 1/short rest.
        else if (fid === 'large_form') {
          if (char.species !== 'goliath') {
            narrative = 'Only Goliaths have Large Form.';
            break;
          }
          if (char.class_resource_uses?.large_form_used === 1) {
            narrative = 'Large Form already used this short rest.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            large_form_used: 1,
          };
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          char = inflictCondition(char, 'large_form');
          if (!char.condition_durations) char.condition_durations = {};
          char.condition_durations = { ...char.condition_durations, large_form: 10 };
          narrative = `🗿 ${char.name} swells to Large size! +10 ft speed and advantage on STR checks for 10 rounds.`;
          usedInitiative = true;
        }

        // 2024 PHB Dragonborn — Breath Weapon. Cone of damage emanating from
        // the dragonborn in the direction of the currently-targeted enemy.
        // DEX save for half; damage scales with level. 1/short rest.
        else if (fid === 'breath_weapon') {
          if (char.species !== 'dragonborn') {
            narrative = 'Only Dragonborn have a Breath Weapon.';
            break;
          }
          if (char.class_resource_uses?.breath_weapon_used === 1) {
            narrative = 'Breath Weapon already used — recovers on a short rest.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No living target to direct your breath at.';
            break;
          }
          const selfEntBW = st.entities?.find((e) => e.id === char.id);
          const targetEntBW = st.entities?.find((e) => e.id === enemy.id && e.isEnemy);
          if (!selfEntBW || !targetEntBW) {
            narrative = 'Breath Weapon needs a grid position to project the cone.';
            break;
          }
          const bwDice = char.level >= 17 ? 4 : char.level >= 11 ? 3 : char.level >= 5 ? 2 : 1;
          const bwDC = 8 + profBonus(char.level) + abilityMod(char.con);
          const bwDmgType = SRD_SPECIES.dragonborn?.resistances?.[0] ?? 'fire';
          const cone = entitiesInCone(selfEntBW.pos, targetEntBW.pos, 15, st.entities ?? []);
          const lines: string[] = [];
          let updatedEntities = st.entities ?? [];
          for (const ent of cone) {
            if (!ent.isEnemy || ent.hp <= 0) continue;
            const enemyData = getEnemyById(seed, ent.id);
            if (!enemyData) continue;
            const dexScore = enemyData.dex ?? 10;
            const save = rollDice('1d20') + abilityMod(dexScore);
            const fullDmg = rollDice(`${bwDice}d10`);
            const { damage: typedDmg, note } = applyDamageMultiplier(fullDmg, bwDmgType, enemyData);
            const dmg = save >= bwDC ? Math.floor(typedDmg / 2) : typedDmg;
            updatedEntities = updatedEntities.map((e) =>
              e.id === ent.id ? { ...e, hp: Math.max(0, e.hp - dmg) } : e
            );
            lines.push(
              `${enemyData.name}: DEX ${save} vs DC ${bwDC} — ${dmg} ${bwDmgType}${save >= bwDC ? ' (half)' : ''}${note ?? ''}`
            );
          }
          st = {
            ...st,
            entities: updatedEntities,
          };
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            breath_weapon_used: 1,
          };
          narrative =
            lines.length > 0
              ? `🐲 ${char.name}'s Breath Weapon (${bwDice}d10 ${bwDmgType}, 15-ft cone)! ${lines.join(' · ')}`
              : `${char.name} exhales a cone of ${bwDmgType} but no enemies are caught in it.`;
          usedInitiative = true;
          // Combat may have ended if everyone in the cone dropped.
          if (isRoomCleared(st, seed, roomId)) {
            st = endCombatState(st);
          }
        } else if (fid === 'sear_undead') {
          if (char.character_class.toLowerCase() !== 'cleric') {
            narrative = 'Only Clerics have Sear Undead.';
            break;
          }
          if (char.level < 5) {
            narrative = 'Sear Undead requires Cleric level 5.';
            break;
          }
          const cdUsesSU = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesSU <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesSU - 1,
          };
          const suDC = 8 + profBonus(char.level) + abilityMod(char.wis);
          const selfEntSU = st.entities?.find((e) => e.id === char.id);
          const undeadRegex = /skeleton|ghoul|shadow|zombie|lich|wraith|undead|crypt/i;
          const lines: string[] = [];
          const newEntities = (st.entities ?? []).map((e) => {
            if (!e.isEnemy || e.hp <= 0 || !selfEntSU) return e;
            const dist = Math.max(
              Math.abs(e.pos.x - selfEntSU.pos.x),
              Math.abs(e.pos.y - selfEntSU.pos.y)
            );
            if (dist > 6) return e;
            const enemyData = getEnemyById(seed, e.id);
            if (!enemyData || !undeadRegex.test(enemyData.name)) return e;
            const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
            const save = rollDice('1d20') + abilityMod(wisScore);
            const fullDmg = rollDice(`${char.level}d8`);
            const dmg = save >= suDC ? Math.floor(fullDmg / 2) : fullDmg;
            lines.push(
              `${enemyData.name}: WIS ${save} vs DC ${suDC} — ${dmg} radiant${save >= suDC ? ' (half)' : ''}`
            );
            return { ...e, hp: Math.max(0, e.hp - dmg) };
          });
          st = { ...st, entities: newEntities };
          narrative =
            lines.length > 0
              ? `☀️ Sear Undead! ${lines.join(' · ')} (${cdUsesSU - 1} Channel Divinity remaining)`
              : `Sear Undead — no undead within 30 ft. (${cdUsesSU - 1} Channel Divinity remaining)`;
          usedInitiative = true;
        }

        // ── Life Cleric: Preserve Life (Channel Divinity) ────────────────────────
        else if (fid === 'preserve_life') {
          if (char.subclass !== 'life') {
            narrative = 'Only Life Clerics have Preserve Life.';
            break;
          }
          const cdUses = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUses <= 0) {
            narrative = 'No Channel Divinity uses remaining (recover on short rest).';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUses - 1,
          };
          const poolHp = 5 * char.level;
          const woundedAllies = st.characters.filter(
            (c) => !c.dead && c.hp < c.max_hp && c.id !== char.id
          );
          let preserved = 0;
          let remaining = poolHp;
          const healedIds = new Map<string, number>(); // id → new hp
          const updatedChars = st.characters.map((c) => {
            if (!c.dead && c.hp < c.max_hp && c.id !== char.id && remaining > 0) {
              const half = Math.floor(c.max_hp / 2);
              if (c.hp >= half) return c;
              const heal = Math.min(remaining, half - c.hp);
              preserved += heal;
              remaining -= heal;
              const newHp = c.hp + heal;
              healedIds.set(c.id, newHp);
              return { ...c, hp: newHp };
            }
            return c;
          });
          st = {
            ...st,
            characters: updatedChars,
            // Sync grid entity HP for every PC who got healed so the
            // battlefield reflects the heal immediately. commitChar()
            // only updates the caster's entity, not the targets'.
            entities: (st.entities ?? []).map((e) =>
              !e.isEnemy && healedIds.has(e.id) ? { ...e, hp: healedIds.get(e.id)! } : e
            ),
          };
          // RAW: Preserve Life can't raise a creature above half its HP max.
          // When every wounded ally is already above half, the channel
          // divinity gets spent but heals nothing — surface that gate so
          // the player doesn't think the feature is broken.
          const eligibleCount = woundedAllies.filter((c) => c.hp < Math.floor(c.max_hp / 2)).length;
          if (preserved === 0) {
            const reason =
              woundedAllies.length === 0
                ? 'no wounded allies in range'
                : eligibleCount === 0
                  ? 'every wounded ally is already above half HP'
                  : 'no eligible target';
            narrative = `${char.name} — Preserve Life! No HP distributed (${reason}). (${cdUses - 1} Channel Divinity remaining)`;
          } else {
            narrative = `${char.name} — Preserve Life! Distributed ${preserved} HP among ${eligibleCount} eligible ally${eligibleCount === 1 ? '' : 'ies'} (pool: ${poolHp}). (${cdUses - 1} Channel Divinity remaining)`;
          }
        }

        // ── War Cleric: Guided Strike (Channel Divinity) ─────────────────────────
        else if (fid === 'guided_strike') {
          if (char.subclass !== 'war') {
            narrative = 'Only War Clerics have Guided Strike.';
            break;
          }
          const cdUsesWar = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesWar <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesWar - 1,
          };
          st = { ...st, guided_strike_active: true };
          narrative = `${char.name} — Guided Strike! Your next attack roll gains +10. (${cdUsesWar - 1} Channel Divinity remaining)`;
        }

        // ── Hunter Ranger: Hunter's Prey — Colossus Slayer ───────────────────────
        else if (fid === 'colossus_slayer') {
          if (char.subclass !== 'hunter') {
            narrative = 'Only Hunter Rangers have Colossus Slayer.';
            break;
          }
          const csTarget = st.entities?.find((e) => e.id === roomId && e.isEnemy);
          if (!enemyAlive || !csTarget) {
            narrative = 'No living target.';
            break;
          }
          const enemyMaxHp =
            (enemy as unknown as Record<string, number>)['max_hp'] ?? csTarget.hp * 2;
          if (csTarget.hp >= enemyMaxHp) {
            narrative = 'Colossus Slayer only triggers on a bloodied (below max HP) target.';
            break;
          }
          if ((char.class_resource_uses?.colossus_slayer_used ?? 0) >= 1) {
            narrative = 'Colossus Slayer already triggered this turn.';
            break;
          }
          const csDmg = rollDice('1d8');
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            colossus_slayer_used: 1,
          };
          const csHp = (st.entities?.find((e) => e.id === roomId && e.isEnemy)?.hp ?? 0) - csDmg;
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === roomId && e.isEnemy ? { ...e, hp: Math.max(0, csHp) } : e
            ),
          };
          narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(Math.max(0, csHp))} HP remaining`}).`;
          if (csHp <= 0) {
            st.enemies_killed = [...st.enemies_killed, roomId];
            st = endCombatState(st);
          }
        }

        // ── Beastmaster Ranger: command animal companion (bonus action, PHB p.93)
        else if (fid === 'command_companion') {
          if (char.subclass !== 'beastmaster' || char.character_class.toLowerCase() !== 'ranger') {
            narrative = 'Only Beastmaster Rangers can command an animal companion.';
            break;
          }
          if (char.level < 3) {
            narrative = 'Animal Companion unlocks at Ranger level 3.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          const comp = st.entities?.find(
            (e) => e.isCompanion && e.companionOwnerId === char.id && e.hp > 0
          );
          if (!comp) {
            narrative = 'Your animal companion is unavailable.';
            break;
          }
          // Pick the nearest living enemy as the target
          const targetEnt = (st.entities ?? [])
            .filter((e) => e.isEnemy && e.hp > 0)
            .sort((a, b) => distanceFeet(comp.pos, a.pos) - distanceFeet(comp.pos, b.pos))[0];
          if (!targetEnt) {
            narrative = 'No living enemy in sight for the companion.';
            break;
          }
          const targetEnemy = getEnemyById(seed, targetEnt.id);
          if (!targetEnemy) {
            narrative = "Companion's target is unreachable.";
            break;
          }
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
          usedInitiative = true;
          // Resolve the companion's bite attack against the target's AC
          const toHit = comp.toHit ?? 4;
          const dmgDice = comp.damage ?? '2d4+2';
          const compName = comp.companionName ?? 'companion';
          const attackRoll = rollDice('1d20');
          const total = attackRoll + toHit;
          if (attackRoll === 1) {
            narrative = `${compName} lunges but misses wildly! (d20:1+${toHit}=${total} vs AC ${targetEnemy.ac})`;
          } else if (attackRoll === 20 || total >= targetEnemy.ac) {
            const isCrit = attackRoll === 20;
            const dmg = isCrit ? rollCritical(dmgDice) : rollDice(dmgDice);
            const { damage: finalDmg, note } = applyDamageMultiplier(dmg, 'piercing', targetEnemy);
            const curHp = targetEnt.hp;
            const newHp = Math.max(0, curHp - finalDmg);
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === targetEnt.id && e.isEnemy ? { ...e, hp: newHp } : e
              ),
            };
            narrative = `${compName} bites the ${targetEnemy.name}! ${finalDmg} piercing damage${isCrit ? ' (CRIT)' : ''} (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})${note}`;
            if (newHp <= 0) {
              st.enemies_killed = [...st.enemies_killed, targetEnt.id];
              narrative += ` ${targetEnemy.name} falls!`;
              const xpGain = targetEnemy.xp ?? 10;
              const split = splitEncounterXp(st, char.id, xpGain);
              st = split.st;
              char.xp = (char.xp || 0) + split.share;
              narrative += applyPartyLevelUps(st, char, context);
              if (isRoomCleared(st, seed, roomId)) {
                st = endCombatState(st);
              }
            }
          } else {
            narrative = `${compName} bites at the ${targetEnemy.name} but misses. (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})`;
          }
        }

        // ── Devotion Paladin: Sacred Weapon (Channel Divinity) ───────────────────
        else if (fid === 'sacred_weapon') {
          if (char.subclass !== 'devotion') {
            narrative = 'Only Devotion Paladins have Sacred Weapon.';
            break;
          }
          const cdUsesDev = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesDev <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesDev - 1,
            sacred_weapon_active: 1,
          };
          const chaMod = abilityMod(char.cha);
          narrative = `${char.name} — Sacred Weapon! +${chaMod} to attack rolls for 1 minute (10 rounds). Your weapon gleams with divine light. (${cdUsesDev - 1} Channel Divinity remaining)`;
        }

        // ── Vengeance Paladin: Vow of Enmity (Channel Divinity) ──────────────────
        else if (fid === 'vow_of_enmity') {
          if (char.subclass !== 'vengeance') {
            narrative = 'Only Vengeance Paladins have Vow of Enmity.';
            break;
          }
          const cdUsesVen = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesVen <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesVen - 1,
          };
          st = { ...st, vow_of_enmity_target: roomId };
          narrative = `${char.name} — Vow of Enmity! You have advantage on all attack rolls against ${enemy?.name ?? 'your target'} for 1 minute. (${cdUsesVen - 1} Channel Divinity remaining)`;
        }

        // ── Vengeance Paladin: Abjure Enemy (Channel Divinity) ───────────────────
        else if (fid === 'abjure_enemy') {
          if (char.subclass !== 'vengeance') {
            narrative = 'Only Vengeance Paladins have Abjure Enemy.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No living target.';
            break;
          }
          const cdUsesVen2 = char.class_resource_uses?.channel_divinity ?? 1;
          if (cdUsesVen2 <= 0) {
            narrative = 'No Channel Divinity uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            channel_divinity: cdUsesVen2 - 1,
          };
          const wisSave =
            rollDice('1d20') +
            abilityMod((enemy as unknown as Record<string, number>)['wis'] ?? 10);
          const frightenDC = 8 + profBonus(char.level) + abilityMod(char.cha);
          const abjureSuccess = wisSave >= frightenDC;
          st = pushEvent(st, {
            kind: 'save',
            characterId: enemy.id,
            characterName: enemy.name,
            ability: 'wis',
            roll: wisSave,
            dc: frightenDC,
            success: abjureSuccess,
            vs: 'Abjure Enemy',
            round: st.round ?? 1,
          });
          if (!abjureSuccess) {
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                e.id === roomId && e.isEnemy
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
                    }
                  : e
              ),
            };
            st = pushEvent(st, {
              kind: 'condition_applied',
              targetId: enemy.id,
              targetName: enemy.name,
              condition: 'frightened',
              source: 'Abjure Enemy',
              round: st.round ?? 1,
            });
            narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${enemy.name} is frightened! (${cdUsesVen2 - 1} Channel Divinity remaining)`;
          } else {
            narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${enemy.name} resists. (${cdUsesVen2 - 1} Channel Divinity remaining)`;
          }
          usedInitiative = true;
        }

        // ── Lore Bard: Cutting Words (reaction) ──────────────────────────────────
        else if (fid === 'cutting_words') {
          if (char.subclass !== 'lore') {
            narrative = 'Only Lore Bards have Cutting Words.';
            break;
          }
          if (char.turn_actions.reaction_used) {
            narrative = 'Reaction already used this turn.';
            break;
          }
          if (!enemyAlive || !enemy) {
            narrative = 'No living target.';
            break;
          }
          const biLeft = char.class_resource_uses?.bardic_inspiration ?? abilityMod(char.cha);
          if (biLeft <= 0) {
            narrative = 'No Bardic Inspiration uses remaining.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            bardic_inspiration: biLeft - 1,
          };
          char.turn_actions = { ...char.turn_actions, reaction_used: true };
          const cuttingDie =
            char.level >= 15 ? 12 : char.level >= 10 ? 10 : char.level >= 5 ? 8 : 6;
          const cuttingRoll = rollDice(`1d${cuttingDie}`);
          narrative = `${char.name} — Cutting Words! Subtract ${cuttingRoll} from ${enemy.name}'s next attack roll or ability check this round. (${biLeft - 1} Bardic Inspiration remaining)`;
          st = { ...st, cutting_words_penalty: cuttingRoll };
        }

        // ── Archfey Warlock: Fey Presence (PHB p.109) ────────────────────────────
        else if (fid === 'fey_presence') {
          if (char.subclass !== 'archfey' || char.character_class.toLowerCase() !== 'warlock') {
            narrative = 'Only Archfey Warlocks have Fey Presence.';
            break;
          }
          if (char.class_resource_uses?.fey_presence_used) {
            narrative = 'Fey Presence already used — recovers on a short rest.';
            break;
          }
          const selfEnt = st.entities?.find((e) => e.id === char.id);
          if (!selfEnt) {
            narrative = 'Fey Presence requires a grid position.';
            break;
          }
          const dc = 8 + profBonus(char.level) + abilityMod(char.cha);
          const inRangeEnemies = (st.entities ?? []).filter(
            (e) => e.isEnemy && e.hp > 0 && distanceFeet(e.pos, selfEnt.pos) <= 10
          );
          if (inRangeEnemies.length === 0) {
            narrative = 'No enemies within 10 ft to ensnare with Fey Presence.';
            break;
          }
          char.class_resource_uses = {
            ...(char.class_resource_uses ?? {}),
            fey_presence_used: 1,
          };
          const lines: string[] = [];
          const frightenedIds = new Set<string>();
          for (const e of inRangeEnemies) {
            const enemyData = getEnemyById(seed, e.id);
            const targetName = enemyData?.name ?? e.id;
            const wisScore = (enemyData as unknown as Record<string, number>)?.wis ?? 10;
            const save = rollDice('1d20') + abilityMod(wisScore);
            const feySuccess = save >= dc;
            st = pushEvent(st, {
              kind: 'save',
              characterId: e.id,
              characterName: targetName,
              ability: 'wis',
              roll: save,
              dc,
              success: feySuccess,
              vs: 'Fey Presence',
              round: st.round ?? 1,
            });
            if (!feySuccess) {
              frightenedIds.add(e.id);
              lines.push(`${targetName}: WIS ${save} vs DC ${dc} — frightened!`);
              st = pushEvent(st, {
                kind: 'condition_applied',
                targetId: e.id,
                targetName,
                condition: 'frightened',
                source: 'Fey Presence',
                round: st.round ?? 1,
              });
            } else {
              lines.push(`${targetName}: WIS ${save} vs DC ${dc} — resists.`);
            }
          }
          if (frightenedIds.size > 0) {
            st = {
              ...st,
              entities: (st.entities ?? []).map((e) =>
                frightenedIds.has(e.id)
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
                    }
                  : e
              ),
            };
          }
          narrative = `🌿 Fey Presence! ${char.name} radiates fey magic. ${lines.join(' ')}`;
          usedInitiative = true;
        }

        // ── Unknown feature fallthrough ────────────────────────────────────────
        else {
          narrative = `Unknown class feature: ${fid}.`;
        }
        break;
      }

      case 'interact_object': {
        const currentSeedRoom = seed.rooms.find((r) => r.id === roomId);
        const obj: RoomObject | undefined = currentSeedRoom?.objects?.find(
          (o) => o.id === action.objectId
        );
        if (!obj) {
          narrative = 'There is nothing like that here.';
          break;
        }

        const searchKey = `${roomId}:${obj.id}`;
        if ((st.objects_searched ?? []).includes(searchKey)) {
          narrative = `You have already searched the ${obj.name}.`;
          break;
        }

        // Thief Fast Hands (PHB p.97): in combat, interaction is a bonus action.
        // Out of combat, it's a free interaction (existing behavior).
        if (st.combat_active) {
          const fastHandsEligible =
            char.character_class.toLowerCase() === 'rogue' &&
            char.subclass === 'thief' &&
            char.level >= 3;
          if (!fastHandsEligible) {
            narrative = 'You cannot interact with objects during combat.';
            break;
          }
          if (char.turn_actions.bonus_action_used) {
            narrative = 'Bonus action already used this turn.';
            break;
          }
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
        }

        // Flavor objects (no DC, no loot) are one-shot — repeating adds
        // nothing. Mark searched immediately so they drop out of the
        // choice list.
        if (!obj.searchable || !obj.lootIds?.length) {
          st = { ...st, objects_searched: [...(st.objects_searched ?? []), searchKey] };
          narrative = obj.interactText;
          break;
        }

        const proficient =
          char.skill_proficiencies?.some(
            (s) => s.toLowerCase() === 'investigation' || s.toLowerCase() === 'perception'
          ) ?? false;
        // Search is INT (Investigation) — heavy encumbrance doesn't affect INT
        // per 2024 RAW (only STR/DEX/CON), so we only honour exhaustion.
        const exhaustionDisadv1 = (char.exhaustion_level ?? 0) >= 1;
        const inspAdvSearch = consumeInspirationForCheck(char);
        const bardicSearchRoll = consumeBardicForCheck(char);
        const check = skillCheck(
          char.int,
          (obj.searchDC ?? 12) - bardicSearchRoll,
          proficient,
          char.level,
          exhaustionDisadv1,
          false,
          false,
          inspAdvSearch,
          char.species === 'halfling'
        );

        if (check.success) {
          const gained: string[] = [];
          const gainedIds: string[] = [];
          for (const lootId of obj.lootIds) {
            const item = context.lootTable.find((l) => l.id === lootId);
            if (item) {
              char.inventory = [...(char.inventory ?? []), { ...item, instance_id: randomUUID() }];
              gained.push(item.name);
              gainedIds.push(item.id);
            }
          }
          // Mirror the floor-loot flow: record item ids in loot_taken so quest
          // conditions (`loot_taken contains 'shadow_evidence'`) fire whether
          // the player picked it up from the floor or from a container.
          if (gainedIds.length) {
            st = { ...st, loot_taken: [...(st.loot_taken ?? []), ...gainedIds] };
          }
          // Mark searched only on success — a failed Investigation leaves
          // the choice alive so the player can retry (each retry costs
          // one turn). Matches 5e: a lock/search check is normally
          // re-attemptable. The seenKey written by takeAction still dims
          // the button so the player sees they've tried it.
          st = { ...st, objects_searched: [...(st.objects_searched ?? []), searchKey] };
          const foundDesc = obj.foundText ?? `You find: ${gained.join(', ')}.`;
          narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(char.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — success!) ${foundDesc}`;
        } else {
          narrative = `${obj.interactText} (Investigation: ${check.roll}+${abilityMod(char.int)}=${check.total} vs DC ${obj.searchDC ?? 12} — fail.) ${obj.emptyText ?? 'You can try again.'}`;
        }
        break;
      }

      case 'two_weapon_attack': {
        if (!st.combat_active) {
          narrative = 'No enemy to attack.';
          break;
        }
        // Find the off-hand light weapon in inventory
        const mainWpnInstanceId = char.equipped_weapon;
        const offhandInvItem = char.inventory
          .filter((i) => i.instance_id !== mainWpnInstanceId)
          .find((i) => {
            const l = context.lootTable.find((ll) => ll.id === i.id);
            return l?.light && l.slot === 'weapon';
          });
        if (!offhandInvItem) {
          narrative = 'No light off-hand weapon found.';
          break;
        }
        const offhandLoot = context.lootTable.find((l) => l.id === offhandInvItem.id)!;
        // 2024 PHB Nick mastery (dagger, light hammer, sickle, scimitar) — when
        // the off-hand weapon has Nick + the wielder is trained in it, the
        // two-weapon extra attack is part of the Attack action instead of a
        // bonus action. Frees the bonus action for Cunning Action / Rage / etc.
        const nickFree =
          offhandLoot.mastery === 'nick' &&
          (char.weapon_masteries ?? []).includes(offhandLoot.id) &&
          char.turn_actions.action_used;
        if (!nickFree && char.turn_actions.bonus_action_used) {
          narrative = 'Bonus action already used this turn.';
          break;
        }
        const offhandProficient = hasWeaponProficiency(
          char.weapon_proficiencies ?? [],
          offhandLoot.weaponType
        );
        const twfTargetId: string =
          (action as { type: 'two_weapon_attack'; targetEnemyId?: string }).targetEnemyId ??
          enemy?.id ??
          '';
        const enemyInRoom = livingEnemiesInRoom.find((e) => e.id === twfTargetId) ?? enemy;
        if (!enemyInRoom) {
          narrative = 'No enemy here.';
          break;
        }
        const twfTargetEntityId = enemyInRoom.id;
        const condDisadvTwf = char.conditions.some((c) => DISADV_CONDITIONS.has(c));
        const armorLootItemTwf = char.equipped_armor
          ? context.lootTable.find(
              (l) => l.id === char.inventory.find((i) => i.instance_id === char.equipped_armor)?.id
            )
          : null;
        const armorProfTwf = hasArmorProficiency(
          char.armor_proficiencies ?? [],
          armorLootItemTwf?.armorCategory
        );
        const disadvTwf = condDisadvTwf || !armorProfTwf;
        const atk = resolveOffHandAttack(
          { str: char.str, dex: char.dex, level: char.level },
          offhandLoot.damage,
          enemyInRoom.ac,
          offhandLoot.finesse ?? false,
          disadvTwf,
          false,
          offhandProficient,
          offhandLoot.range === 'ranged'
        );
        // Nick: don't consume the bonus action; it stays available this turn.
        if (!nickFree) {
          char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
        }
        usedInitiative = true;
        if (atk.fumble) {
          narrative = `Off-hand fumble! The ${offhandLoot.name} slips from your grip. (d20: 1)`;
          break;
        }
        if (!atk.hit) {
          narrative = `Off-hand attack with ${offhandLoot.name} misses. (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac})`;
          break;
        }
        const entTwf = st.entities?.find((e) => e.id === twfTargetEntityId && e.isEnemy);
        const curHpTwf = entTwf?.hp ?? 0;
        const newHpTwf = curHpTwf - atk.damage;
        st = {
          ...st,
          entities: (st.entities ?? []).map((e) =>
            e.id === twfTargetEntityId && e.isEnemy ? { ...e, hp: newHpTwf } : e
          ),
        };
        narrative = `Off-hand strike with ${offhandLoot.name}! ${atk.damage} damage${atk.critical ? ' (CRITICAL!)' : ''} (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac}, no ability mod to damage).`;
        if (newHpTwf <= 0) {
          const xpGainTwf = enemyInRoom.xp ?? 10;
          const split = splitEncounterXp(st, char.id, xpGainTwf);
          st = split.st;
          char.xp = (char.xp || 0) + split.share;
          narrative += ` The ${enemyInRoom.name} falls!`;
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === twfTargetEntityId && e.isEnemy ? { ...e, hp: 0 } : e
            ),
          };
          st.enemies_killed = [...(st.enemies_killed || []), twfTargetEntityId];
          narrative += grantDarkOnesBlessing(char);
          narrative += applyPartyLevelUps(st, char, context);
          if (st.combat_active && isRoomCleared(st, seed, roomId)) st = endCombatState(st);
        }
        break;
      }

      case 'grapple': {
        if (!enemyAlive || !enemy) {
          narrative = 'No enemy to grapple.';
          break;
        }
        const grappleTargetId =
          (action as { type: 'grapple'; targetEnemyId?: string }).targetEnemyId ?? enemy.id;
        const grappleTarget = livingEnemiesInRoom.find((e) => e.id === grappleTargetId) ?? enemy;
        // SRD 5.2.1 p.195 / 2024 PHB "Unarmed Strike: Grapple" — requires the
        // target within 5 ft (unarmed strike reach). No action is spent if the
        // attempt fails this prerequisite.
        if (st.entities) {
          const myEnt = st.entities.find((e) => e.id === char.id);
          const tgtEnt = st.entities.find((e) => e.id === grappleTarget.id && e.isEnemy);
          if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
            narrative = `Out of reach — Grapple needs the target within 5 ft. Move closer first.`;
            break;
          }
        }
        if (grappleTarget.condition_immunities?.includes('grappled')) {
          narrative = `The ${grappleTarget.name} cannot be grappled (condition immunity).`;
          char.turn_actions = { ...char.turn_actions, action_used: true };
          usedInitiative = true;
          break;
        }
        // Contested Athletics: player STR check vs enemy STR or DEX (whichever higher)
        const athProfGrapple = (context.classSkills[char.character_class] ?? []).includes(
          'athletics'
        );
        const playerRollGrapple =
          d(20) + abilityMod(char.str) + (athProfGrapple ? profBonus(char.level) : 0);
        const enemyStrGrapple = abilityMod(grappleTarget.toHit); // toHit is a rough proxy for STR/DEX mod
        const enemyDexGrapple = abilityMod(grappleTarget.dex ?? 10);
        const enemyRollGrapple = d(20) + Math.max(enemyStrGrapple, enemyDexGrapple);
        char.turn_actions = { ...char.turn_actions, action_used: true };
        usedInitiative = true;
        if (playerRollGrapple > enemyRollGrapple) {
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === grappleTarget.id && e.isEnemy
                ? {
                    ...e,
                    conditions: [...e.conditions.filter((c) => c !== 'grappled'), 'grappled'],
                    grappled_by: char.id,
                  }
                : e
            ),
          };
          st = pushEvent(st, {
            kind: 'condition_applied',
            targetId: grappleTarget.id,
            targetName: grappleTarget.name,
            condition: 'grappled',
            source: 'Grapple',
            round: st.round ?? 1,
          });
          narrative = `You grapple the ${grappleTarget.name}! (${playerRollGrapple} vs ${enemyRollGrapple}) They are GRAPPLED — speed 0, your attacks have advantage.`;
        } else {
          narrative = `The ${grappleTarget.name} breaks free of your grapple attempt. (${playerRollGrapple} vs ${enemyRollGrapple})`;
        }
        break;
      }

      // SRD 5.2.1 p.16 — A grappled creature can use its action on its turn to make
      // a Strength (Athletics) or Dexterity (Acrobatics) check contested by the
      // grappler's Strength (Athletics) check; success ends the grappled condition.
      case 'try_escape_grapple': {
        const myEntity = st.entities?.find((e) => e.id === char.id);
        const grapplerId = myEntity?.grappled_by;
        if (!char.conditions.includes('grappled') && !myEntity?.conditions.includes('grappled')) {
          narrative = 'You are not grappled.';
          break;
        }
        if (!grapplerId) {
          // No tracked grappler — just drop the condition (shouldn't happen, but be lenient)
          char = { ...char, conditions: char.conditions.filter((c) => c !== 'grappled') };
          narrative = 'You break free of the grapple.';
          char.turn_actions = { ...char.turn_actions, action_used: true };
          usedInitiative = true;
          break;
        }
        const grappler = st.entities?.find((e) => e.id === grapplerId);
        const grapplerEnemy = grappler?.isEnemy ? getEnemyById(seed, grapplerId) : null;
        const grapplerStrMod = grapplerEnemy ? abilityMod(grapplerEnemy.toHit) : 0;
        const grapplerRoll = d(20) + grapplerStrMod;

        // Player picks the better of Athletics (STR) or Acrobatics (DEX)
        const athProf = (context.classSkills[char.character_class] ?? []).includes('athletics');
        const acrProf = (context.classSkills[char.character_class] ?? []).includes('acrobatics');
        const athRoll = d(20) + abilityMod(char.str) + (athProf ? profBonus(char.level) : 0);
        const acrRoll = d(20) + abilityMod(char.dex) + (acrProf ? profBonus(char.level) : 0);
        const myRoll = Math.max(athRoll, acrRoll);
        const skillUsed = athRoll >= acrRoll ? 'Athletics' : 'Acrobatics';

        char.turn_actions = { ...char.turn_actions, action_used: true };
        usedInitiative = true;

        if (myRoll > grapplerRoll) {
          char = { ...char, conditions: char.conditions.filter((c) => c !== 'grappled') };
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === char.id
                ? {
                    ...e,
                    conditions: e.conditions.filter((c) => c !== 'grappled'),
                    grappled_by: undefined,
                  }
                : e
            ),
          };
          narrative = `You break free of the grapple! (${skillUsed} ${myRoll} vs ${grapplerRoll})`;
        } else {
          narrative = `You strain against the grapple but cannot escape. (${skillUsed} ${myRoll} vs ${grapplerRoll})`;
        }
        break;
      }

      // SRD 5.2.1 p.187 — standing up from prone costs half the creature's speed.
      // 2024 PHB — declare you'll spend your Heroic Inspiration on the next
      // attack this turn. Doesn't cost an action; the flag clears when the
      // attack handler resolves the d20.
      case 'shove': {
        if (!enemyAlive || !enemy) {
          narrative = 'No enemy to shove.';
          break;
        }
        const shoveTargetId =
          (action as { type: 'shove'; targetEnemyId?: string }).targetEnemyId ?? enemy.id;
        const shoveTarget = livingEnemiesInRoom.find((e) => e.id === shoveTargetId) ?? enemy;
        // SRD 5.2.1 p.195 / 2024 PHB "Unarmed Strike: Shove" — requires the
        // target within 5 ft. No action is spent if the prerequisite fails.
        if (st.entities) {
          const myEnt = st.entities.find((e) => e.id === char.id);
          const tgtEnt = st.entities.find((e) => e.id === shoveTarget.id && e.isEnemy);
          if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
            narrative = `Out of reach — Shove needs the target within 5 ft. Move closer first.`;
            break;
          }
        }
        if (shoveTarget.condition_immunities?.includes('prone')) {
          narrative = `The ${shoveTarget.name} cannot be knocked prone (condition immunity).`;
          char.turn_actions = { ...char.turn_actions, action_used: true };
          usedInitiative = true;
          break;
        }
        const athProfShove = (context.classSkills[char.character_class] ?? []).includes(
          'athletics'
        );
        const playerRollShove =
          d(20) + abilityMod(char.str) + (athProfShove ? profBonus(char.level) : 0);
        const enemyStrShove = abilityMod(shoveTarget.toHit);
        const enemyDexShove = abilityMod(shoveTarget.dex ?? 10);
        const enemyRollShove = d(20) + Math.max(enemyStrShove, enemyDexShove);
        char.turn_actions = { ...char.turn_actions, action_used: true };
        usedInitiative = true;
        if (playerRollShove > enemyRollShove) {
          st = {
            ...st,
            entities: (st.entities ?? []).map((e) =>
              e.id === shoveTarget.id && e.isEnemy
                ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'] }
                : e
            ),
          };
          st = pushEvent(st, {
            kind: 'condition_applied',
            targetId: shoveTarget.id,
            targetName: shoveTarget.name,
            condition: 'prone',
            source: 'Shove',
            round: st.round ?? 1,
          });
          narrative = `You shove the ${shoveTarget.name} to the ground! (${playerRollShove} vs ${enemyRollShove}) They are PRONE — melee attacks against them have advantage, ranged attacks have disadvantage.`;
        } else {
          narrative = `The ${shoveTarget.name} resists your shove. (${playerRollShove} vs ${enemyRollShove})`;
        }
        break;
      }

      // ── Grid movement ────────────────────────────────────────────────────────
      case 'grid_move': {
        if (!st.entities) {
          narrative = 'Grid combat is not active.';
          break;
        }
        const gridAction = action as {
          type: 'grid_move';
          entityId: string;
          to: { x: number; y: number };
        };
        if (gridAction.entityId !== char.id) {
          narrative = 'You can only move your own character.';
          break;
        }

        const charEntity = st.entities.find((e) => e.id === char.id);
        if (!charEntity) {
          narrative = 'Your character is not on the grid.';
          break;
        }

        // SRD 5.2.1 p.16 — grappled and restrained reduce speed to 0.
        if (char.conditions.some((c) => c === 'grappled' || c === 'restrained')) {
          const which = char.conditions.includes('restrained') ? 'RESTRAINED' : 'GRAPPLED';
          narrative = `You are ${which} — your speed is 0.`;
          break;
        }

        // 2024 PHB Frightened — can't willingly move closer to the source of
        // your fear. Check distance against the tracked fear-source entity;
        // reject the move if it would decrease the distance.
        if (char.conditions.includes('frightened') && char.condition_sources?.frightened) {
          const fearSourceId = char.condition_sources.frightened;
          const fearSourceEnt = st.entities.find((e) => e.id === fearSourceId);
          if (fearSourceEnt && fearSourceEnt.hp > 0) {
            const charEnt2 = st.entities.find((e) => e.id === char.id);
            if (charEnt2) {
              const currentDist = Math.max(
                Math.abs(charEnt2.pos.x - fearSourceEnt.pos.x),
                Math.abs(charEnt2.pos.y - fearSourceEnt.pos.y)
              );
              const newDist = Math.max(
                Math.abs(gridAction.to.x - fearSourceEnt.pos.x),
                Math.abs(gridAction.to.y - fearSourceEnt.pos.y)
              );
              if (newDist < currentDist) {
                const fearName =
                  getEnemyById(seed, fearSourceId)?.name ?? 'the source of your fear';
                narrative = `You are FRIGHTENED — you can't willingly move closer to ${fearName}.`;
                break;
              }
            }
          }
        }

        const locationGrid = context.campaign?.locations?.find((l) =>
          l.rooms?.some((r) => r.id === roomId)
        );
        const gridW = locationGrid?.gridWidth ?? context.gridWidth ?? 10;
        const gridH = locationGrid?.gridHeight ?? context.gridHeight ?? 10;
        // Dead entities (hp ≤ 0) still appear in state.entities for narrative
        // continuity but don't block movement — you walk over the corpse. This
        // also matches the frontend's `isReachable` (filters on hp > 0), so the
        // click-to-move targets and the BFS pathfinder agree on what's blocked.
        // Static room obstacles (columns/walls/debris) block movement too.
        const currentRoomForMove = seed.rooms.find((r) => r.id === roomId);
        const roomObstaclesForMove = currentRoomForMove?.obstacles ?? [];
        const blocked = [
          ...st.entities.filter((e) => e.id !== char.id && e.hp > 0).map((e) => e.pos),
          ...roomObstaclesForMove,
        ];

        const path = findPath(charEntity.pos, gridAction.to, blocked, gridW, gridH);
        if (!path) {
          narrative = 'No path to that square.';
          break;
        }

        // Terrain-aware movement cost: difficult terrain squares cost 2× movement
        const currentSeedRoomGrid = seed.rooms.find((r) => r.id === roomId);
        const difficultTerrain = currentSeedRoomGrid?.difficultTerrain ?? [];
        const costFeet = path.reduce((acc, pos) => {
          const isDifficult = difficultTerrain.some((dt) => posEqual(dt, pos));
          return acc + (isDifficult ? SQUARE_SIZE * 2 : SQUARE_SIZE);
        }, 0);

        const speedFt = effectiveSpeed(char);
        const usedFt = st.movement_used?.[char.id] ?? 0;
        if (usedFt + costFeet > speedFt) {
          narrative = `Not enough movement. (${speedFt - usedFt} ft remaining, ${costFeet} ft needed${difficultTerrain.length ? ' — difficult terrain' : ''})`;
          break;
        }

        // Check for opportunity attacks from enemies being left behind
        const oaTargets = opportunityAttackTriggers(
          charEntity.pos,
          gridAction.to,
          st.entities,
          false
        );
        let oaNarrative = '';
        for (const oaEntity of oaTargets) {
          const oaEnemy = getEnemyById(seed, oaEntity.id);
          if (
            oaEnemy &&
            !st.enemies_killed.includes(oaEntity.id) &&
            !char.turn_actions?.disengaged
          ) {
            const oaResult = resolveEnemyAttack(oaEnemy, char.ac);
            if (oaResult.hit) {
              const dmg = oaResult.damage;
              char.hp = Math.max(0, char.hp - dmg);
              const concResult = checkConcentration(char, st, dmg);
              char = concResult.char;
              st = concResult.st;
              oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: ${dmg} damage!${concResult.note}]`;
            } else {
              oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: missed!]`;
            }
          }
        }

        // Apply movement
        const updatedEntities: CombatEntity[] = st.entities!.map((e) =>
          e.id === char.id ? { ...e, pos: gridAction.to } : e
        );
        st = {
          ...st,
          entities: updatedEntities,
          movement_used: { ...st.movement_used, [char.id]: usedFt + costFeet },
        };

        narrative = `${char.name} moves to (${gridAction.to.x}, ${gridAction.to.y}).${oaNarrative}`;
        break;
      }

      // ── Travel between locations ──────────────────────────────────────────────
      // ── Use Reaction (trigger readied action) ─────────────────────────────────
      case 'use_reaction': {
        if (char.turn_actions.reaction_used) {
          narrative = 'You have already used your reaction this turn.';
          break;
        }
        const readied = char.turn_actions.readied_action;
        if (!readied) {
          narrative = 'You have no readied action.';
          break;
        }
        char.turn_actions = {
          ...char.turn_actions,
          reaction_used: true,
          readied_action: undefined,
        };
        narrative = `${char.name} triggers their readied action! `;
        // Recursively resolve the stored action
        const reactionResult = await takeAction({
          action: readied.action,
          history: [],
          state: { ...st, characters: st.characters.map((c, i) => (i === safeIdx ? char : c)) },
          seed,
          context,
        });
        narrative += reactionResult.narrative;
        st = reactionResult.newState;
        char = st.characters.find((c) => c.id === char.id) ?? char;
        break;
      }

      // ── Select subclass ───────────────────────────────────────────────────────
      // ── Resolve pending reaction (Shield window for now) ──────────────────────
      case 'resolve_reaction': {
        const rxAction = action as { type: 'resolve_reaction'; accept: boolean };
        const rx = st.pending_reaction;
        if (!rx) {
          narrative = 'No reaction pending.';
          break;
        }
        if (char.id !== rx.targetCharId) {
          narrative = 'This reaction belongs to another character.';
          break;
        }
        if (rx.kind === 'shield') {
          if (rxAction.accept) {
            // Consume L1 slot (lowest available) and reaction.
            const slotsMax = char.spell_slots_max ?? {};
            const slotsUsed = char.spell_slots_used ?? {};
            const lvl = Object.keys(slotsMax)
              .map(Number)
              .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
              .sort((a, b) => a - b)[0];
            if (lvl === undefined) {
              narrative = 'No spell slot available to cast Shield.';
              // Fall through to declined-hit path
              narrative += ` ${rx.pendingNarrative}`;
              const declinedTarget = {
                ...char,
                hp: Math.max(0, char.hp - rx.pendingDamage),
              };
              st = {
                ...st,
                characters: st.characters.map((c) => (c.id === char.id ? declinedTarget : c)),
                pending_reaction: undefined,
              };
              char = declinedTarget;
            } else {
              char.spell_slots_used = {
                ...slotsUsed,
                [lvl]: (slotsUsed[lvl] ?? 0) + 1,
              };
              char.turn_actions = { ...char.turn_actions, reaction_used: true };
              narrative = `🛡️ ${char.name} casts SHIELD as a reaction (lvl ${lvl} slot)! +5 AC until the start of their next turn — ${rx.pendingNarrative.split('.')[0]} bounces off the shimmering barrier.`;
              // Track Shield active and bump AC by 5 for the duration. tickConditions
              // removes the bump when the condition expires (next turn start).
              char.conditions = [
                ...char.conditions.filter((c) => c !== 'shield_spell'),
                'shield_spell',
              ];
              char.condition_durations = {
                ...(char.condition_durations ?? {}),
                shield_spell: 1,
              };
              char.ac = char.ac + 5;
              st = {
                ...st,
                characters: st.characters.map((c) => (c.id === char.id ? char : c)),
                pending_reaction: undefined,
              };
            }
          } else {
            // Decline — apply the pending damage and narrative.
            const newHp = Math.max(0, char.hp - rx.pendingDamage);
            char = { ...char, hp: newHp };
            narrative = `${rx.pendingNarrative} (Shield declined.)`;
            st = {
              ...st,
              characters: st.characters.map((c) => (c.id === char.id ? char : c)),
              pending_reaction: undefined,
            };
            if (st.entities) {
              st = {
                ...st,
                entities: st.entities.map((e) =>
                  e.id === char.id && !e.isEnemy ? { ...e, hp: newHp } : e
                ),
              };
            }
          }
        } else if (rx.kind === 'hellish_rebuke') {
          // Hellish Rebuke (PHB p.252) — counter-attack. Triggering damage
          // already applied; this branch only handles what the reaction itself
          // does. Accept: consume slot + reaction, deal 2d10 fire to attacker
          // (DEX save halves). Decline: clear pending_reaction and continue.
          if (rxAction.accept) {
            const slotsMax = char.spell_slots_max ?? {};
            const slotsUsed = char.spell_slots_used ?? {};
            // 2024 PHB Tiefling Infernal Legacy — Hellish Rebuke 1/long rest at
            // L3+ without consuming a slot. Tiefling Warlocks who also have it
            // on their list prefer the racial slot (free) before burning real
            // slots; the racial use is tracked via `tiefling_rebuke_used`.
            const isTieflingInnate =
              char.species === 'tiefling' &&
              char.level >= 3 &&
              !char.class_resource_uses?.tiefling_rebuke_used;
            let slotLvl: number | undefined;
            if (isTieflingInnate) {
              slotLvl = 1;
            } else {
              slotLvl = Object.keys(slotsMax)
                .map(Number)
                .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
                .sort((a, b) => a - b)[0];
            }
            if (slotLvl === undefined) {
              narrative = 'No spell slot available — Hellish Rebuke fizzles.';
              st = { ...st, pending_reaction: undefined };
            } else {
              if (isTieflingInnate) {
                char.class_resource_uses = {
                  ...(char.class_resource_uses ?? {}),
                  tiefling_rebuke_used: 1,
                };
              } else {
                char.spell_slots_used = {
                  ...slotsUsed,
                  [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1,
                };
              }
              char.turn_actions = { ...char.turn_actions, reaction_used: true };
              // Upcast: 2d10 base + 1d10 per slot above 1st.
              const upcastDice = Math.max(0, slotLvl - 1);
              const baseRoll = rollDice('2d10');
              const upcastRoll = upcastDice > 0 ? rollDice(`${upcastDice}d10`) : 0;
              const fullDmg = baseRoll + upcastRoll;
              // Enemy DEX save vs caster's spell save DC. Half on success.
              const enemyData = getEnemyById(seed, rx.attackerEnemyId);
              const enemyDex = enemyData?.dex ?? 10;
              const dc = 8 + profBonus(char.level) + abilityMod(char.cha);
              const saveRoll = rollDice('1d20') + abilityMod(enemyDex);
              const saved = saveRoll >= dc;
              const finalDmg = saved ? Math.floor(fullDmg / 2) : fullDmg;
              // Apply damage to the attacker entity.
              const attackerEnt = st.entities?.find(
                (e) => e.id === rx.attackerEnemyId && e.isEnemy
              );
              const newEnemyHp = Math.max(0, (attackerEnt?.hp ?? 0) - finalDmg);
              st = {
                ...st,
                entities: st.entities?.map((e) =>
                  e.id === rx.attackerEnemyId && e.isEnemy ? { ...e, hp: newEnemyHp } : e
                ),
                characters: st.characters.map((c) => (c.id === char.id ? char : c)),
                pending_reaction: undefined,
              };
              const enemyName = enemyData?.name ?? 'the attacker';
              narrative = `🔥 ${char.name} casts HELLISH REBUKE (lvl ${slotLvl} slot)! Hellish flames engulf ${enemyName}. DEX save ${saveRoll} vs DC ${dc} — ${saved ? 'half' : 'full'} damage: ${finalDmg} fire (${baseRoll}${upcastRoll > 0 ? ` + ${upcastRoll} upcast` : ''}).`;
              if (newEnemyHp <= 0) {
                const xpGain = enemyData?.xp ?? 10;
                const split = splitEncounterXp(st, char.id, xpGain);
                st = split.st;
                const xpShare = split.share;
                char.xp = (char.xp || 0) + xpShare;
                st = {
                  ...st,
                  enemies_killed: [...(st.enemies_killed ?? []), rx.attackerEnemyId],
                  characters: st.characters.map((c) => (c.id === char.id ? char : c)),
                };
                narrative += ` ${enemyName} is consumed by the rebuke! (+${xpShare} XP)`;
                narrative += applyPartyLevelUps(st, char, context);
                const roomId = st.current_room;
                if (isRoomCleared(st, seed, roomId)) {
                  st = endCombatState(st);
                }
              }
            }
          } else {
            narrative = `${char.name} declines to retaliate.`;
            st = { ...st, pending_reaction: undefined };
          }
        } else if (rx.kind === 'counterspell') {
          // PHB p.234. Accept = burn a 3rd-level (or higher) slot to interrupt.
          // Slots ≥ enemy spell level auto-counter; otherwise an ability check
          // vs DC 10 + spell level. Decline = enemy spell resolves on the
          // intended target.
          if (rxAction.accept) {
            const slotsMax = char.spell_slots_max ?? {};
            const slotsUsed = char.spell_slots_used ?? {};
            // Pick the lowest available slot ≥ 3 that's ≥ the enemy spell level.
            // Falling back to the lowest ≥ 3 means we may need the ability check.
            const slotLvl = Object.keys(slotsMax)
              .map(Number)
              .filter((n) => n >= 3 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
              .sort((a, b) => a - b)[0];
            if (slotLvl === undefined) {
              narrative = 'No 3rd-level or higher slot — Counterspell fizzles.';
              st = { ...st, pending_reaction: undefined };
            } else {
              char.spell_slots_used = {
                ...slotsUsed,
                [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1,
              };
              char.turn_actions = { ...char.turn_actions, reaction_used: true };
              const autoCounter = slotLvl >= rx.enemySpellLevel;
              let success = autoCounter;
              let checkDetail = '';
              if (!autoCounter) {
                const castingAbility = (context.spellcastingAbility?.[char.character_class] ??
                  context.classPrimaryStats[char.character_class] ??
                  'int') as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
                const score = char[castingAbility] ?? 10;
                const dc = 10 + rx.enemySpellLevel;
                const checkRoll = rollDice('1d20') + abilityMod(score) + profBonus(char.level);
                success = checkRoll >= dc;
                checkDetail = ` ${castingAbility.toUpperCase()} check ${checkRoll} vs DC ${dc} — ${success ? 'success' : 'failed'}.`;
              }
              if (success) {
                narrative = `⚡ ${char.name} casts COUNTERSPELL (lvl ${slotLvl} slot)!${checkDetail} ${rx.enemySpellName} is unraveled — no effect.`;
              } else {
                // Counterspell check failed — the enemy spell still resolves.
                const damage = applyEnemySpellDamage(st, rx, context);
                if (damage) {
                  st = damage.st;
                  // If the reactor IS the spell target, sync char so commitChar
                  // doesn't overwrite the damage at the end of takeAction.
                  if (rx.intendedTargetPcId === char.id) {
                    char = { ...char, hp: damage.targetHp };
                  }
                  narrative = `⚡ ${char.name} casts COUNTERSPELL (lvl ${slotLvl} slot)!${checkDetail} ${rx.enemySpellName} bursts through — ${damage.targetName} takes ${damage.dmgRoll} ${damage.damageType}.`;
                } else {
                  narrative = `${char.name} fails to counter ${rx.enemySpellName}. The spell resolves.`;
                }
              }
              st = {
                ...st,
                characters: st.characters.map((c) => (c.id === char.id ? char : c)),
                pending_reaction: undefined,
              };
            }
          } else {
            // Decline — enemy spell resolves on its intended target.
            const damage = applyEnemySpellDamage(st, rx, context);
            if (damage) {
              st = damage.st;
              if (rx.intendedTargetPcId === char.id) {
                char = { ...char, hp: damage.targetHp };
              }
              narrative = `${char.name} declines to counter. ${rx.enemySpellName} resolves — ${damage.targetName} takes ${damage.dmgRoll} ${damage.damageType}.`;
            } else {
              narrative = `${char.name} declines to counter. ${rx.enemySpellName} resolves.`;
            }
            st = { ...st, pending_reaction: undefined };
          }
        }
        {
          // Resume the enemy turn loop from the saved coordinates.
          const resume = runEnemyTurns({
            st,
            seed,
            context,
            worldName,
            startAdvIdx: rx.resumeFromInitiativeIdx,
            startMultiattackIdx: rx.resumeFromMultiattackIdx,
            startRoundWrapped: false,
            initialCurrentIdx: rx.resumeFromInitiativeIdx,
          });
          st = resume.st;
          narrative += resume.narrative;
          // After resume, advance the initiative cursor (or pause again if another reaction triggered).
          if (!resume.paused) {
            if (resume.roundWrapped) {
              st = {
                ...st,
                movement_used: {},
                surprised: [],
                characters: st.characters.map((c) => ({ ...c, turn_actions: { ...FRESH_TURN } })),
              };
            }
            st.initiative_idx = resume.exitAdvIdx;
            const nextEntry = st.initiative_order[resume.exitAdvIdx];
            if (nextEntry && !nextEntry.is_enemy) {
              const nextCharIdx = st.characters.findIndex((c) => c.id === nextEntry.id && !c.dead);
              if (nextCharIdx >= 0) {
                st = {
                  ...st,
                  movement_used: { ...(st.movement_used ?? {}), [nextEntry.id]: 0 },
                };
                const withFreshTurn = {
                  ...st.characters[nextCharIdx],
                  turn_actions: { ...FRESH_TURN },
                };
                const ticked = tickConditions(withFreshTurn);
                st = {
                  ...st,
                  characters: st.characters.map((c, i) => (i === nextCharIdx ? ticked : c)),
                  active_character_id: ticked.id,
                };
              }
            }
          } else {
            st.initiative_idx = resume.exitAdvIdx;
          }
        }
        break;
      }

      case 'examine':
      default: {
        narrative = buildArrivalNarrative(roomId, st, seed, context);
        if (st.combat_active) narrative += ` You are in combat!`;
        if (char.conditions.length > 0) narrative += ` [Conditions: ${char.conditions.join(', ')}]`;
        break;
      }
    }

  // ── Write char back into state ─────────────────────────────────────────────
  commitChar();

  // ── Auto-advance initiative when action is used and no bonus choices remain ─
  // When class features add bonus-action choices (requiresBonusAction: true),
  // this block will stay false and the player gets another pick before advancing.
  // PHB p.190: movement is its own resource on your turn, separate from the
  // Action. Don't auto-advance while the character still has movement left —
  // otherwise a click that was a no-op (e.g. a too-far grid_move that errored
  // with "not enough movement") would end the turn. The player can always
  // forfeit unused movement via the explicit "End turn" choice.
  if (st.combat_active && !usedInitiative && st.characters[safeIdx].turn_actions.action_used) {
    const activeChar = st.characters[safeIdx];
    const hasBonusChoices = generateChoices(st, seed, context).some((c) => c.requiresBonusAction);
    const speedFt = effectiveSpeed(activeChar);
    const usedFt = st.movement_used?.[activeChar.id] ?? 0;
    const hasMovementLeft = !!st.entities && usedFt < speedFt;
    if (!hasBonusChoices && !hasMovementLeft) usedInitiative = true;
  }

  // ── Advance initiative / active character ──────────────────────────────────
  if (usedInitiative && st.combat_active && st.initiative_order.length > 0) {
    // Advance from current player's initiative position
    const orderLen = st.initiative_order.length;
    const currentIdx = st.initiative_idx ?? 0;
    const startAdvIdx = (currentIdx + 1) % orderLen;
    const initialRoundWrapped = startAdvIdx === 0;

    // SRD p.221 — legendary action: fires AFTER another creature's turn ends.
    // Resolved before runEnemyTurns so the spend is recorded against the
    // current pool; the legendary creature's own turn (later in the loop)
    // will refresh the pool for the next round.
    const legendaryRes = fireLegendaryAction(st, seed, context);
    st = legendaryRes.st;
    narrative += legendaryRes.narrative;

    const turnRes = runEnemyTurns({
      st,
      seed,
      context,
      worldName,
      startAdvIdx,
      startMultiattackIdx: 0,
      startRoundWrapped: initialRoundWrapped,
      initialCurrentIdx: currentIdx,
    });
    st = turnRes.st;
    narrative += turnRes.narrative;
    const advIdx = turnRes.exitAdvIdx;
    const roundWrapped = turnRes.roundWrapped && !turnRes.paused;

    // Save the resume point in initiative_idx so a pause leaves a coherent
    // state; the resolve_reaction handler will re-enter runEnemyTurns from
    // the saved coords inside pending_reaction.
    if (turnRes.paused) st.initiative_idx = advIdx;

    if (roundWrapped) {
      // New round: bump the round counter (so combat-event payloads tag the
      // right round), reset turn_actions, movement budgets, and clear
      // surprise (PHB p.189).
      st = {
        ...st,
        round: (st.round ?? 1) + 1,
        movement_used: {},
        surprised: [],
        characters: st.characters.map((c) => ({ ...c, turn_actions: { ...FRESH_TURN } })),
      };
      // SRD p.221 — lair action fires on round start (init count 20).
      const lairRes = fireLairAction(st, seed, context);
      st = lairRes.st;
      narrative += lairRes.narrative;
      // Concentration timers tick once per full round (SRD 5.2.1 — round
      // = 6 sec). Spells whose budget reaches 0 end cleanly via
      // breakConcentration so linked conditions (Bless's `blessed`, Hold
      // Person's `paralyzed`, etc.) clear at the same time.
      const concRes = tickConcentrationDurations(st);
      st = concRes.st;
      narrative += concRes.narrative;
    }

    // Pause path: runEnemyTurns already set initiative_idx and active_character_id
    // to the reactor; skip the next-PC promotion below.
    if (!turnRes.paused) {
      st.initiative_idx = advIdx;

      // Set active character to whoever's turn it is in the order;
      // reset their turn_actions and tick conditions as their new turn begins.
      const currentEntry = st.initiative_order[advIdx];
      if (currentEntry && !currentEntry.is_enemy) {
        const nextCharIdx = st.characters.findIndex((c) => c.id === currentEntry.id && !c.dead);
        if (nextCharIdx >= 0) {
          // Reset movement for this character's new turn
          st = { ...st, movement_used: { ...(st.movement_used ?? {}), [currentEntry.id]: 0 } };
          const withFreshTurn = { ...st.characters[nextCharIdx], turn_actions: { ...FRESH_TURN } };
          const ticked = tickConditions(withFreshTurn);
          if (ticked.conditions.length !== st.characters[nextCharIdx].conditions.length) {
            const expired = st.characters[nextCharIdx].conditions.filter(
              (c) => !ticked.conditions.includes(c)
            );
            narrative += ` [${ticked.name}] Condition${expired.length > 1 ? 's' : ''} cleared: ${expired.join(', ')}.`;
          }
          st = { ...st, characters: st.characters.map((c, i) => (i === nextCharIdx ? ticked : c)) };
          st.active_character_id = ticked.id;
        }
      }
    }
  }
  // Out-of-combat: active_character_id stays on whoever the player
  // chose. RAW has no initiative outside combat (SRD 5.2.1 p.189) — the
  // party operates as a unit — so the prior auto-rotate every action
  // was non-RAW and made NPC dialogue feel jarring (different PC
  // credited per response). Players hand the spotlight off explicitly
  // via the `set_active_character` action (PartyRail tile click).

  // Run script-engine rules against the post-action state
  const { state: afterRules, extraNarrative } = await runRules(
    st,
    context,
    action,
    prevRoomId,
    seed
  );
  st = afterRules;

  // set_escape consequence signals via flag
  if (st.flags._rule_escape) {
    escaped = true;
    const { _rule_escape: _, ...restFlags } = st.flags;
    st = { ...st, flags: restFlags };
  }

  // Speaker prefix for multi-PC parties — prepend "[CharName] " so the
  // reader can tell whose turn this was. Combat narratives (combatHit,
  // combatMiss, etc.) draw from pools with second-person ("Your attack
  // connects..."), third-person impersonal ("A solid strike lands..."),
  // and enemy-first ("The Crypt Ghoul reels...") openers — none of those
  // identify the active character. We only suppress the prefix when the
  // narrative *already* starts with the character's name (e.g. an enemy
  // attack narrative that opens with "Sage takes 5 damage" — the active
  // character is the one being damaged, so the prose already names them).
  // Solo-character parties are unambiguous and skip the prefix entirely.
  const livingPartyCount = st.characters.filter((c) => !c.dead).length;
  const alreadyNamedAtStart =
    narrative.startsWith(`${char.name} `) ||
    narrative.startsWith(`${char.name}:`) ||
    narrative.startsWith(`[${char.name}]`);
  const speakerPrefix = livingPartyCount > 1 && !alreadyNamedAtStart ? `[${char.name}] ` : '';
  const rawNarrative =
    speakerPrefix + (extraNarrative ? `${narrative}\n\n${extraNarrative}` : narrative);

  const activeRoom = seed.rooms.find((r) => r.id === st.current_room);
  // The LLM rewrites prose freely and would not preserve `{{kind|display}}`
  // markers, so we strip them before enhancement. When LLM is enabled the
  // user trades styled-token rendering for atmospheric prose; the
  // structured combat_log retains the mechanical data either way. With the
  // default NoneProvider (passthrough), strip is a no-op on prose and
  // tokens reach the frontend intact for styled rendering.
  const llmInput = stripNarrativeTokens(rawNarrative);
  const enhanced = await llmProvider.enhance(llmInput, {
    worldName: seed.world_name,
    charName: char.name,
    charClass: char.character_class,
    roomName: activeRoom?.name ?? st.current_room,
  });
  // Passthrough: if the provider returned the input unchanged (NoneProvider
  // or LLM error fallback), restore the tokenised raw narrative so the FE
  // can render styled spans.
  //
  // Fact-preservation check: the LLM is instructed to keep all numbers and
  // outcome words, but compliance isn't free. If the enhancement drops a
  // damage number, a critical state word ("killed", "downed"), or a PC
  // name, the player gets prose that misrepresents engine state — fall
  // back to the tokenised raw narrative instead.
  const enhancementFaithful =
    enhanced === llmInput || (enhanced.length > 0 && preservesCriticalFacts(llmInput, enhanced));
  const finalNarrative = enhanced === llmInput || !enhancementFaithful ? rawNarrative : enhanced;

  // SRD 5.2.1 p.184 — Invisible: attacking reveals location. The condition
  // ends after the attack; the character must re-Hide to regain it.
  {
    const attackActions = new Set(['attack', 'attack_npc', 'two_weapon_attack', 'cast_spell']);
    if (attackActions.has(action.type)) {
      st = {
        ...st,
        characters: st.characters.map((c) =>
          c.id === char.id && c.conditions.includes('invisible')
            ? {
                ...c,
                conditions: c.conditions.filter((cc) => cc !== 'invisible'),
                hide_dc: undefined,
              }
            : c
        ),
      };
    }
  }

  // SRD 5.2.1 p.203 — Concentration ends when the caster is incapacitated or
  // dies. We don't catch every state transition mid-handler, so sweep here.
  {
    const incapCond = new Set([
      'incapacitated',
      'paralyzed',
      'stunned',
      'unconscious',
      'petrified',
    ]);
    let anyBroken = false;
    let updated = st;
    for (let i = 0; i < updated.characters.length; i++) {
      const c = updated.characters[i];
      if (!c.concentrating_on) continue;
      const isIncap = c.dead || c.hp <= 0 || c.conditions.some((cc) => incapCond.has(cc));
      if (isIncap) {
        const r = breakConcentration(c, updated);
        anyBroken = true;
        updated = {
          ...r.st,
          characters: r.st.characters.map((cc) => (cc.id === c.id ? r.char : cc)),
        };
      }
    }
    if (anyBroken) st = updated;
  }

  // SRD 5.2.1 p.16 — Grappled ends if the grappler is incapacitated. Sweep here
  // so deaths/conditions applied this turn drop their grapples for the next turn.
  if (st.entities && st.entities.some((e) => e.grappled_by)) {
    const killed = new Set(st.enemies_killed ?? []);
    const incapacitated = (id: string): boolean => {
      if (killed.has(id)) return true;
      const ent = st.entities!.find((x) => x.id === id);
      if (
        ent &&
        (ent.hp <= 0 ||
          ent.conditions.some((c) =>
            ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
          ))
      ) {
        return true;
      }
      const pc = st.characters.find((x) => x.id === id);
      if (
        pc &&
        (pc.dead ||
          pc.hp <= 0 ||
          pc.conditions.some((c) =>
            ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c)
          ))
      ) {
        return true;
      }
      return false;
    };
    let touched = false;
    const sweptEntities = st.entities.map((e) => {
      if (e.grappled_by && incapacitated(e.grappled_by)) {
        touched = true;
        return {
          ...e,
          conditions: e.conditions.filter((c) => c !== 'grappled'),
          grappled_by: undefined,
        };
      }
      return e;
    });
    if (touched) {
      st = { ...st, entities: sweptEntities };
      // Also clear the grappled condition on any PC whose grappler is incapacitated.
      st = {
        ...st,
        characters: st.characters.map((c) => {
          const ent = st.entities!.find((e) => e.id === c.id);
          if (ent && !ent.conditions.includes('grappled') && c.conditions.includes('grappled')) {
            return { ...c, conditions: c.conditions.filter((cc) => cc !== 'grappled') };
          }
          return c;
        }),
      };
    }
  }

  // Boss-phase transition check: if any enemy is a boss whose hp dropped
  // below the next phase threshold during this action, increment its phase
  // index, mutate the seed's stats accordingly, and emit a `phase_transition`
  // event. Runs before final-narrative + choices so the new statline is the
  // one rendered into the next round's prompts.
  st = processBossPhaseTransitions(st, seed);

  const roomChanged = st.current_room !== state.current_room;
  st.run_log = [
    ...(st.run_log || []),
    { character_id: char.id, action: action.type, narrative: finalNarrative },
  ];
  st.room_log = roomChanged ? [finalNarrative] : [...(st.room_log ?? []), finalNarrative];

  // Record the action's seenKey (if any) so the FE can dim repeat
  // presentations of the same choice. Computed against the pre-action
  // state so "I clicked this in room X" survives an action that
  // teleported the party. Dedupes via Set semantics.
  const usedKey = seenKeyForAction(action, state);
  if (usedKey && !(st.seen_choices ?? []).includes(usedKey)) {
    st.seen_choices = [...(st.seen_choices ?? []), usedKey];
  }

  st.last_choices = generateChoices(st, seed, context);

  const allDead = st.characters.every((c) => c.dead);

  return {
    narrative: finalNarrative,
    choices: st.last_choices,
    newState: st,
    escaped,
    dead: allDead,
  };
}
