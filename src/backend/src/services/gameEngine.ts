import {
  ADVANTAGE_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
  FRESH_TURN,
  abilityMod,
  d,
  hasWeaponProficiency,
  passivePerception,
  profBonus,
  rageUsesMax,
  resolveEnemyAttack,
  resolvePlayerAttack,
  rollConditionSave,
  rollDeathSave,
  rollDice,
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
  distanceFeet,
  findPath,
  opportunityAttackTriggers,
  posEqual,
} from './gridEngine.js';
import type { EnemyAttackHitFragment, EnemyAttackMissFragment } from './narrative/fragments.js';
import { applyExpiryHooks, getConditionDuration } from './conditions/registry.js';
import { composeFragments, enemyAttackFragmentEvent } from './narrative/compose.js';
import { fmt, stripForLlm } from './narrativeFmt.js';
import { getClassLevel, hasClass, spellSlotsForChar } from './multiclass.js';
import { COMBAT_LOG_MAX } from '../types.js';
import { Engine } from 'json-rules-engine';
import { applyDamage } from './damage.js';
import { applyStateMigrations } from './stateSchema.js';
import { factionShopPrice } from './campaignEngine.js';
import { llmProvider } from './llmProvider.js';
import { pcActor } from './actions/actor.js';
import { randomUUID } from 'crypto';

// Append a CombatEvent to state.combat_log, trimming to COMBAT_LOG_MAX so the
// buffer doesn't grow unbounded across long sessions. Pure function — returns
// new state, doesn't mutate. Callers should reassign: `st = pushEvent(st, e)`.
/**
 * Free-function version of `takeAction`'s closure-scoped `commitChar`.
 * Writes `char` back into `st.characters` (matched by id) AND syncs
 * the matching grid entity's `hp` + `conditions` for PC entities. Use
 * this anywhere that mutates a character's hp / conditions outside of
 * the dispatcher's per-handler ctx (e.g. `applyEnemySpellDamage`,
 * inventory heal-other-PC, future helpers).
 *
 * **Why this exists.** Before, sites that updated a character's HP
 * had to remember to mirror the change onto `st.entities[].hp` too.
 * The two writes drifted easily — a handler updates one and forgets
 * the other, the grid view shows stale HP, and a downstream gate
 * (e.g. `hp > 0` check) makes the wrong decision. Routing through
 * one helper makes the mirror invariant a single-call responsibility.
 *
 * **For enemies:** entity.hp IS the source of truth (no Character
 * record exists). This helper is PC-only; enemies that take damage
 * mutate `entity.hp` directly (or via the seed for boss phases).
 */
export function commitCharacter(st: GameState, char: Character): GameState {
  const idx = st.characters.findIndex((c) => c.id === char.id);
  if (idx < 0) return st;
  const updatedChars = st.characters.map((c, i) => (i === idx ? char : c));
  const updatedEntities = st.entities?.map((e) =>
    e.id === char.id && !e.isEnemy ? { ...e, hp: char.hp, conditions: char.conditions } : e
  );
  return { ...st, characters: updatedChars, entities: updatedEntities };
}

export function pushEvent(st: GameState, event: CombatEvent): GameState {
  const next = [...(st.combat_log ?? []), event];
  return { ...st, combat_log: next.slice(-COMBAT_LOG_MAX) };
}

// 2024 PHB Heroic Inspiration — read the pending flag and (if set) clear it
// on `char`. Returns whether inspiration was active so the caller can pass
// it as advantage to a d20 roll. Saves already integrate this through
// applyConditionSave; this helper exists for ability/skill checks.
export function consumeInspirationForCheck(char: Character): boolean {
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
export function consumeBardicForCheck(char: Character): number {
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

export function hpTier(char: Character): 'healthy' | 'hurt' | 'critical' {
  const pct = (char.hp ?? 0) / (char.max_hp || 1);
  if (pct > 0.66) return 'healthy';
  if (pct > 0.33) return 'hurt';
  return 'critical';
}

// Exhaustion 4: effective max HP is halved (PHB p.291)
export function clampHpForExhaustion(hp: number, maxHp: number, exhaustionLevel: number): number {
  if (exhaustionLevel >= 4) return Math.min(hp, Math.floor(maxHp / 2));
  return hp;
}

// ─── Concentration helpers ────────────────────────────────────────────────────

// Initial round-budget for a concentration spell. Defaults to 10 (1 minute,
// the standard for Bless / Hold Person / Bane / etc.); a spell can declare
// longer durations (Spirit Guardians = 100, Hex = 600) via Spell.durationRounds.
// concentrationRoundsFor moved to services/actions/castSpell.ts in PR 15
// — it's only used by the cast handler's Bless / save-with-condition
// branches, so it lives next to its sole caller.

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
      narrative += ` ${fmt.note(`[${c.name}'s ${spellName} fades — concentration duration expired.]`)}`;
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

export function breakConcentration(
  char: Character,
  st: GameState
): { char: Character; st: GameState } {
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

export function checkConcentration(
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

export function pickTiered(
  template: string[] | Record<string, string[]> | undefined,
  tier: string
): string {
  if (!template) return '';
  if (Array.isArray(template)) return pick(template);
  return pick(template[tier] || template['healthy'] || template[Object.keys(template)[0]] || ['']);
}

export function buildCombatHitNarrative(
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

export function getItemData(
  item: InventoryItem | undefined,
  context: Context
): LootItem & InventoryItem {
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

/**
 * Compute an enemy attack against `char` without committing to game
 * state. The function rolls everything (attack, applyDamage,
 * onHitEffect save), builds the full narrative prose into a fragment,
 * and returns the *proposed* post-attack character + state. The caller
 * decides whether to commit immediately (no reaction window) or stash
 * the proposed values in `pending_reaction` for Shield-deferred
 * commit. Shield-accept discards the proposed values — the
 * concentration save outcome is thrown away with them, which is the
 * RAW-correct behavior (one save per damage *taken*, not per damage
 * threatened).
 *
 * `proposedSt` carries:
 *   - The character mutations via the matching characters[] entry.
 *   - Bless cleanup on linked allies when concentration breaks.
 *
 * `pending_reaction` on the returned proposedSt is intentionally NOT
 * cleared here — callers that stash it should clear it themselves.
 */
function computeEnemyAttack(
  enemy: Enemy,
  char: Character,
  st: GameState,
  context: Context
): {
  /** Updated character — HP, temp_hp, conditions, condition_durations,
   *  class_resource_uses, concentrating_on, inspiration, and
   *  bardic_inspiration_die applied. */
  proposedChar: Character;
  /** Updated state — Bless cleanup etc. from concentration breaks. */
  proposedSt: GameState;
  hpLost: number;
  /** Fragment carrying the full attack prose + payload for the
   *  `attack_hit` / `attack_miss` `CombatEvent`. */
  fragment: EnemyAttackHitFragment | EnemyAttackMissFragment;
  // Exposed so callers can detect reaction windows (Shield: total in [AC, AC+4]).
  atkTotal: number;
  /** The raw d20 result from the attack roll (without adv/disadv
   *  resolution applied — see `resolveEnemyAttack` for details).
   *  Preserved so reaction handlers that need to reroll (Silvery
   *  Barbs) or compare against the d20 directly can do so. */
  atkD20: number;
  hit: boolean;
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
    // while shifted into a physicalResistance form.
    const beastForm =
      char.conditions.includes('wild_shaped') && char.wild_shape_form
        ? BEAST_FORMS[char.wild_shape_form]
        : undefined;
    const beastResist = !!beastForm?.physicalResistance;
    // 2024 PHB species resistance — Dwarves (poison), Dragonborn (ancestry
    // type, default fire), Tieflings (fire).
    const speciesData = char.species ? SRD_SPECIES[char.species] : undefined;
    const speciesResist =
      enemy.damageType && speciesData?.resistances?.includes(enemy.damageType) === true;
    const anyResist = isRaging || isPetrified || beastResist || speciesResist;
    const postResistDmg = anyResist ? Math.ceil(result.damage / 2) : result.damage;
    const rageNote = isRaging ? ` (Rage resistance: ${result.damage}→${postResistDmg})` : '';
    const petrNote = isPetrified
      ? ` (Petrified resistance: ${result.damage}→${postResistDmg})`
      : '';
    const beastNote =
      beastResist && !isRaging && !isPetrified
        ? ` (${beastForm?.name} resistance: ${result.damage}→${postResistDmg})`
        : '';
    const speciesNote =
      speciesResist && !isRaging && !isPetrified && !beastResist
        ? ` (${speciesData?.name} ${enemy.damageType} resistance: ${result.damage}→${postResistDmg})`
        : '';
    // Arcane Ward: Abjurer Wizard — absorb damage into ward HP before character HP
    let wardNote = '';
    let charAfterWard = char;
    let postWardDmg = postResistDmg;
    const wardHp = char.class_resource_uses?.arcane_ward ?? 0;
    if (wardHp > 0 && char.subclass === 'abjurer') {
      const absorbed = Math.min(wardHp, postWardDmg);
      postWardDmg -= absorbed;
      charAfterWard = {
        ...charAfterWard,
        class_resource_uses: {
          ...(charAfterWard.class_resource_uses ?? {}),
          arcane_ward: wardHp - absorbed,
        },
      };
      wardNote = ` (Arcane Ward absorbed ${absorbed} — ward HP: ${wardHp - absorbed})`;
    }
    // Universal damage application — temp_hp absorption, exhaustion-4 max-HP
    // clamp, knock-out detection, and the SRD concentration save all flow
    // through `applyDamage`. (PR-2's deferred enemy-attack migration.)
    const dmgResult = applyDamage(charAfterWard, st, postWardDmg);
    let updatedChar = dmgResult.char;
    const newSt = dmgResult.st;
    const hpLost = dmgResult.amountDealt;
    const tempHpNote =
      dmgResult.tempHpAbsorbed > 0
        ? ` (Temp HP absorbed ${dmgResult.tempHpAbsorbed} — temp HP: ${dmgResult.tempHpRemaining})`
        : '';

    let narrative = pick(context.narratives.enemyAttacks)
      .replace('{enemy}', enemy.name)
      .replace('{target}', char.name)
      .replace('{dmg}', fmt.dmg(hpLost));
    narrative += ` ${char.name} takes ${fmt.dmg(hpLost)} damage.`;
    narrative += rageNote + petrNote + beastNote + speciesNote + wardNote + tempHpNote;
    narrative += dmgResult.concentrationNote;

    let inspirationConsumed = false;
    let bardicConsumed = false;
    if (enemy.onHitEffect) {
      const csResult = conditionSavingThrow(enemy.onHitEffect, updatedChar, context);
      if (csResult.inspirationConsumed) {
        inspirationConsumed = true;
        narrative += ` ✦ Heroic Inspiration spent on the save!`;
      }
      if (csResult.bardicInspirationConsumed) {
        bardicConsumed = true;
        narrative += ` ✦ Bardic Inspiration spent on the save (+${csResult.bardicRoll})!`;
      }
      if (csResult.applied) {
        const sourceCond = enemy.onHitEffect.condition;
        const tracksSource = sourceCond === 'frightened' || sourceCond === 'charmed';
        const beforeConds = updatedChar.conditions.length;
        updatedChar = inflictCondition(
          updatedChar,
          sourceCond,
          tracksSource ? enemy.id : undefined
        );
        if (sourceCond === 'charmed') {
          updatedChar = { ...updatedChar, charmer_id: enemy.id };
        }
        if (updatedChar.conditions.length > beforeConds) {
          narrative += ` ${char.name} is ${sourceCond}!`;
        }
      }
    }
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
    const hitFragment: EnemyAttackHitFragment = {
      kind: 'enemy_attack_hit',
      attackerEnemyId: enemy.id,
      attackerName: enemy.name,
      targetCharId: char.id,
      targetName: char.name,
      damage: hpLost,
      damageType: enemy.damageType ?? 'physical',
      atkTotal: result.total,
      targetAc: char.ac,
      prose: narrative,
    };
    return {
      proposedChar: updatedChar,
      proposedSt: newSt,
      hpLost,
      fragment: hitFragment,
      atkTotal: result.total,
      atkD20: result.roll,
      hit: true,
    };
  }
  if (armorItem) {
    const deflectedProse = pick(context.narratives.enemyDeflected)
      .replace('{enemy}', enemy.name)
      .replace('{target}', char.name)
      .replace('{armor}', armorItem.name);
    return {
      proposedChar: char,
      proposedSt: st,
      hpLost: 0,
      fragment: {
        kind: 'enemy_attack_miss',
        attackerEnemyId: enemy.id,
        attackerName: enemy.name,
        targetCharId: char.id,
        targetName: char.name,
        atkTotal: result.total,
        targetAc: char.ac,
        prose: deflectedProse,
      },
      atkTotal: result.total,
      atkD20: result.roll,
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
    proposedChar: char,
    proposedSt: st,
    hpLost: 0,
    fragment: {
      kind: 'enemy_attack_miss',
      attackerEnemyId: enemy.id,
      attackerName: enemy.name,
      targetCharId: char.id,
      targetName: char.name,
      atkTotal: result.total,
      targetAc: char.ac,
      prose: pick(missLines),
    },
    atkTotal: result.total,
    atkD20: result.roll,
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

// Condition rule data (durations, advantage/disadvantage grants, save mods,
// on-expire hooks) lives in `services/conditions/registry.ts`. These two
// functions are the inflict + tick wrappers around char.conditions[].

export function inflictCondition(char: Character, condition: string, sourceId?: string): Character {
  if (char.conditions.includes(condition)) {
    if (sourceId && condition === 'frightened') {
      return {
        ...char,
        condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId },
      };
    }
    return char;
  }
  const rawDuration = getConditionDuration(condition);
  // 'permanent' conditions (unconscious, petrified) are stored with no
  // duration entry so tickConditions treats them as un-decremented.
  const durationEntry: Record<string, number> =
    rawDuration === 'permanent'
      ? { ...(char.condition_durations ?? {}) }
      : { ...(char.condition_durations ?? {}), [condition]: rawDuration };
  return {
    ...char,
    conditions: [...char.conditions, condition],
    condition_durations: durationEntry,
    // 2024 PHB Frightened (and a few others) track the source entity. Other
    // conditions ignore sourceId — it's free metadata when provided.
    ...(sourceId
      ? { condition_sources: { ...(char.condition_sources ?? {}), [condition]: sourceId } }
      : {}),
  };
}

export function tickConditions(char: Character): Character {
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
  // Clear condition_sources entries for any expired condition.
  let newSources = char.condition_sources;
  if (expired.length > 0 && newSources) {
    newSources = { ...newSources };
    for (const c of expired) delete newSources[c];
  }
  // Registry-driven on-expire hooks (e.g. Shield spell reverses its +5 AC).
  const withExpiryHooks = applyExpiryHooks(
    {
      ...char,
      conditions: newConditions,
      condition_durations: newDurations,
      condition_sources: newSources,
    },
    expired
  );
  return withExpiryHooks;
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
export function isHeavilyEncumbered(
  char: Pick<Character, 'inventory' | 'str' | 'species'>
): boolean {
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
    // Iterate so each PC's concentration check (and any concentration-break
    // side-effects on st like Bless cleanup) accumulates into workingSt.
    let workingSt = st;
    for (const origC of st.characters) {
      if (origC.dead) continue;
      const scoreKey = action.savingThrow as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      const score = (origC[scoreKey] ?? 10) as number;
      const saveFailed = rollConditionSave(
        scoreKey,
        score,
        dc,
        false,
        origC.level,
        0,
        origC.conditions ?? []
      );
      const dealt = saveFailed ? fullDmg : Math.floor(fullDmg / 2);
      const dmgResult = applyDamage(origC, workingSt, dealt);
      workingSt = {
        ...dmgResult.st,
        characters: dmgResult.st.characters.map((c) =>
          c.id === dmgResult.char.id ? dmgResult.char : c
        ),
      };
      narrative += ` ${origC.name}: ${scoreKey.toUpperCase()} save vs DC ${dc} — ${saveFailed ? 'fails' : 'succeeds (half)'} (${dealt} ${action.damageType}).${dmgResult.concentrationNote}`;
    }
    return { st: workingSt, narrative, fired: true };
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
    const computed = computeEnemyAttack(legendary, target, st, context);
    narrative += ` ${computed.fragment.prose}`;
    // Legendary actions skip the Shield-pause path — they're meant to be
    // a fast follow-up beat. Commit immediately: write proposed state
    // and push the corresponding CombatEvent.
    st = {
      ...computed.proposedSt,
      characters: computed.proposedSt.characters.map((c, i) =>
        i === targetCharIdx ? computed.proposedChar : c
      ),
      entities: (computed.proposedSt.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: computed.proposedChar.hp } : e
      ),
    };
    st = pushEvent(st, enemyAttackFragmentEvent(computed.fragment, st.round ?? 1));
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

export function getEnemyById(seed: Seed, enemyId: string): Enemy | null {
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

export function isRoomCleared(state: GameState, seed: Seed, roomId: string): boolean {
  const all = getRoomEnemies(seed, roomId);
  if (all.length === 0) return true;
  const killed = state.enemies_killed ?? [];
  return all.every((e) => killed.includes(e.id));
}

// ─── Initiative helpers ───────────────────────────────────────────────────────

export type InitEntry = { id: string; roll: number; is_enemy: boolean };

export function buildInitiativeOrder(chars: Character[], enemies: Enemy[]): InitEntry[] {
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

export function endCombatState(st: GameState): GameState {
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
export function splitEncounterXp(
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
export function applyPartyLevelUps(st: GameState, killer: Character, context: Context): string {
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
export function grantDarkOnesBlessing(char: Character): string {
  if (!hasClass(char, 'warlock') || char.subclass !== 'fiend') return '';
  const grant = Math.max(1, getClassLevel(char, 'warlock') + abilityMod(char.cha));
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

export function getRoomTrap(roomId: string, seed: Seed, context: Context): Trap | null {
  // Traps are defined on Room objects inside the campaign or room pool
  const campaignRoom = context.campaign?.rooms?.find((r) => r.id === roomId);
  if (campaignRoom?.trap) return campaignRoom.trap;
  const seedRoom = seed.rooms?.find((r) => r.id === roomId);
  if (seedRoom?.trap) return seedRoom.trap;
  return null;
}

export function trapSpent(state: GameState, roomId: string): boolean {
  return (
    (state.traps_triggered ?? []).includes(roomId) || (state.traps_disarmed ?? []).includes(roomId)
  );
}

export function partyDetectsTrap(characters: Character[], trap: Trap): boolean {
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
  // (default-backfill), then route through the schema migration ladder
  // so version-stamping and any per-version logic land in one place.
  if (Array.isArray((raw as unknown as GameState).characters)) {
    const gs = raw as unknown as GameState;
    const backfilled: GameState = {
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
        // Multiclass schema backfill — pre-multiclass saves omit
        // class_levels entirely. Synthesize from character_class +
        // level so the helpers in services/multiclass.ts can rely on
        // the field being present after normalization.
        const classLevels =
          c.class_levels && Object.keys(c.class_levels).length > 0
            ? c.class_levels
            : { [c.character_class.toLowerCase()]: c.level ?? 1 };
        const charWithLevels = { ...c, class_levels: classLevels };
        const existingSlots = c.spell_slots_max ?? {};
        const slotsMax =
          Object.keys(existingSlots).length > 0 ? existingSlots : spellSlotsForChar(charWithLevels);
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
          class_levels: classLevels,
        };
      }),
    };
    return applyStateMigrations(backfilled);
  }

  const charId = randomUUID();
  const level = Number(raw.level ?? 1);
  const charClass = String(raw.character_class ?? 'Adventurer');
  const char: Character = {
    id: charId,
    name: String(raw.character_name ?? 'Hero'),
    character_class: charClass,
    class_levels: { [charClass.toLowerCase()]: level },
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
  return applyStateMigrations({
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
  });
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
    hasClass(char, 'rogue') && char.subclass === 'thief' && getClassLevel(char, 'rogue') >= 3;
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
      prepClasses.some((c) => hasClass(char, c)) &&
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
      const rageUses =
        char.class_resource_uses?.rage_uses ?? rageUsesMax(getClassLevel(char, 'barbarian'));
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
      hasClass(char, 'barbarian') &&
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
      hasClass(char, 'fighter') &&
      getClassLevel(char, 'fighter') >= 9 &&
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
    if (hasClass(char, 'fighter')) {
      const fighterLvl = getClassLevel(char, 'fighter');
      const secondWindMax = fighterLvl >= 10 ? 4 : fighterLvl >= 4 ? 3 : 2;
      const secondWindUsed = char.class_resource_uses?.second_wind ?? 0;
      const secondWindLeft = secondWindMax - secondWindUsed;
      if (secondWindLeft > 0) {
        choices.push({
          label: `Second Wind — bonus action: heal 1d10+${fighterLvl} HP (${secondWindLeft}/${secondWindMax} left)`,
          action: { type: 'use_class_feature', featureId: 'second_wind' },
          kind: 'class_feature',
          requiresBonusAction: true,
        });
      }
    }

    // Rogue L2+: Cunning Action (bonus action options)
    if (hasClass(char, 'rogue') && getClassLevel(char, 'rogue') >= 2) {
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
      hasClass(char, 'rogue') &&
      getClassLevel(char, 'rogue') >= 5 &&
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
    if (hasClass(char, 'bard')) {
      const biUses =
        char.class_resource_uses?.bardic_inspiration ??
        Math.max(1, Math.floor(((char.cha ?? 10) - 10) / 2));
      const bardLvl = getClassLevel(char, 'bard');
      const inspDie = bardLvl >= 15 ? 'd12' : bardLvl >= 10 ? 'd10' : bardLvl >= 5 ? 'd8' : 'd6';
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
    hasClass(char, 'fighter') &&
    getClassLevel(char, 'fighter') >= 2 &&
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
    hasClass(char, 'barbarian') &&
    getClassLevel(char, 'barbarian') >= 2 &&
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
  if (hasClass(char, 'monk')) {
    const monkLvl = getClassLevel(char, 'monk');
    const kiLeft = char.class_resource_uses?.ki_points ?? monkLvl;
    const monkFreeAvailable = monkLvl >= 2 && !char.turn_actions.monk_free_used;
    if (state.combat_active && monkLvl >= 2) {
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
        monkLvl >= 5 &&
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
  if (hasClass(char, 'druid')) {
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
      // Wild Shape CR access scales with Druid level only.
      const forms = availableBeastForms(getClassLevel(char, 'druid'), isMoon);
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
  if (hasClass(char, 'sorcerer') && getClassLevel(char, 'sorcerer') >= 3) {
    const sorcLvl = getClassLevel(char, 'sorcerer');
    const spLeft = char.class_resource_uses?.sorcery_points ?? sorcLvl;
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
  if (!state.combat_active && hasClass(char, 'warlock') && getClassLevel(char, 'warlock') >= 2) {
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
    if (char.subclass === 'lore' && hasClass(char, 'bard') && !char.turn_actions.reaction_used) {
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
    if (hasClass(char, 'cleric') && cdLeft > 0 && state.combat_active && enemyAlive) {
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
    if (
      hasClass(char, 'cleric') &&
      getClassLevel(char, 'cleric') >= 5 &&
      cdLeft > 0 &&
      state.combat_active &&
      enemyAlive
    ) {
      const clericLvl = getClassLevel(char, 'cleric');
      choices.push({
        label: `Sear Undead — all undead in 30 ft take ${clericLvl}d8 radiant, WIS save halves (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'sear_undead' },
        kind: 'class_feature',
      });
    }

    // Life Cleric: Preserve Life (Channel Divinity, out-of-combat heal)
    if (char.subclass === 'life' && hasClass(char, 'cleric') && cdLeft > 0) {
      choices.push({
        label: `Preserve Life — distribute ${5 * getClassLevel(char, 'cleric')} HP among wounded allies (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'preserve_life' },
        kind: 'class_feature',
      });
    }

    // War Cleric: Guided Strike (Channel Divinity, +10 to next attack)
    if (char.subclass === 'war' && hasClass(char, 'cleric') && cdLeft > 0) {
      choices.push({
        label: `Guided Strike — +10 to next attack roll (Channel Divinity, ${cdLeft} left)`,
        action: { type: 'use_class_feature', featureId: 'guided_strike' },
        kind: 'class_feature',
      });
    }

    // Devotion Paladin: Sacred Weapon (Channel Divinity)
    if (
      char.subclass === 'devotion' &&
      hasClass(char, 'paladin') &&
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
    if (char.subclass === 'vengeance' && hasClass(char, 'paladin') && cdLeft > 0) {
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
      hasClass(char, 'ranger') &&
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
      hasClass(char, 'ranger') &&
      getClassLevel(char, 'ranger') >= 3 &&
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
      hasClass(char, 'warlock') &&
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
    // Enforce prep when ANY of the PC's classes is a prep class.
    const enforcePrep = [...prepClasses].some((c) => hasClass(char, c));
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

/**
 * Sentinel feat (2024 PHB) — protect-ally reaction. When an enemy
 * hits an ally, any PC OTHER THAN the target who:
 *   - has the Sentinel feat,
 *   - is within 5 ft of the target,
 *   - has a reaction available,
 *   - is conscious + can see the attacker (not blinded)
 * can use their reaction to make a melee weapon attack against the
 * attacker. Returns the list of eligible PC ids (may be empty).
 */
function findSentinelEligiblePcs(
  targetCharId: string,
  st: GameState,
  attackerEnt: CombatEntity | undefined
): Character[] {
  if (!attackerEnt) return [];
  const targetEnt = st.entities?.find((e) => e.id === targetCharId && !e.isEnemy);
  if (!targetEnt) return [];
  const eligible: Character[] = [];
  for (const pc of st.characters) {
    if (pc.id === targetCharId) continue; // not the target
    if (pc.dead || pc.hp <= 0) continue;
    if (pc.turn_actions?.reaction_used) continue;
    if (pc.conditions?.includes('blinded')) continue;
    if (!(pc.feats ?? []).includes('sentinel')) continue;
    const pcEnt = st.entities?.find((e) => e.id === pc.id && !e.isEnemy);
    if (!pcEnt) continue;
    if (distanceFeet(pcEnt.pos, targetEnt.pos) > 5) continue;
    eligible.push(pc);
  }
  return eligible;
}

/**
 * Silvery Barbs (Strixhaven, 1st-level enchantment). Reaction
 * triggered when a creature within 60 ft of the caster succeeds on
 * an attack roll. MVP scope: only the target of the attack reacts
 * (RAW any caster within 60 ft qualifies — party-wide eligibility
 * is a TODO). The resolver rerolls the d20 and uses the lower
 * result, potentially turning the hit into a miss.
 */
function isSilveryBarbsEligible(target: Character, context: Context): boolean {
  if (target.turn_actions?.reaction_used) return false;
  if (!knowsSpellWithSlot(target, 'silvery_barbs', context)) return false;
  return true;
}

/**
 * Absorb Elements (PHB p.211) — reaction spell triggered when the
 * caster takes acid / cold / fire / lightning / thunder damage.
 * Requires:
 *   - The spell known + a level-1+ slot available.
 *   - The triggering damage type matches one of the five.
 *   - Reaction available this turn.
 *   - PC conscious after the proposed damage commits (we read
 *     `target.hp` BEFORE the commit, so we check `> 0` against the
 *     pre-attack HP — sets aside the edge case of "killed by the
 *     hit"; RAW the spell would still let you react before dropping
 *     because reactions trigger on damage TAKEN. Pansori models this
 *     as: if the proposed snapshot would leave you at 0, you're
 *     still eligible to react).
 */
function isAbsorbElementsEligible(
  target: Character,
  damageType: string,
  context: Context
): boolean {
  const eligibleTypes = ['acid', 'cold', 'fire', 'lightning', 'thunder'];
  if (!eligibleTypes.includes(damageType)) return false;
  if (target.turn_actions?.reaction_used) return false;
  if (!knowsSpellWithSlot(target, 'absorb_elements', context)) return false;
  return true;
}

/**
 * Uncanny Dodge (PHB Rogue L5). Triggers BEFORE damage commits when
 * the Rogue can see the attacker — halves damage from that one
 * attack at the cost of their reaction.
 *
 * Modeled prereqs:
 *   - PC must be a Rogue (class match, since multi-class isn't modeled).
 *   - Rogue level ≥ 5.
 *   - Reaction not yet used this round.
 *   - Target conscious (`hp > 0` BEFORE the proposed damage commits).
 *   - "Can see the attacker" is modeled loosely as "PC is not blinded"
 *     (line-of-sight blocking by walls isn't tracked yet — see TODO
 *     "Party line-of-sight indicators on the grid"). Blindness is a
 *     condition the engine tracks; checking it here avoids a clearly
 *     wrong narrative ("you halve the damage from the goblin you
 *     can't see").
 */
function isUncannyDodgeEligible(target: Character): boolean {
  if (!hasClass(target, 'rogue')) return false;
  if (getClassLevel(target, 'rogue') < 5) return false;
  if (target.turn_actions?.reaction_used) return false;
  if (target.hp <= 0) return false;
  if (target.conditions?.includes('blinded')) return false;
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
  const isWarlock = hasClass(target, 'warlock') && knowsSpellWithSlot(target, 'hellish_rebuke', context);
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
export function applyEnemySpellDamage(
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
  const newSt = commitCharacter(st, { ...tgt, hp: newHp });
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

/**
 * Run an enemy's multiattack sequence against a PC target. Each
 * iteration calls `computeEnemyAttack` to roll the attack + damage
 * into a proposed snapshot, then checks for two reaction windows
 * that pause the loop:
 *
 *   1. **Shield reaction** (BEFORE damage commits) — the PC can cast
 *      Shield to negate this specific hit. `computeEnemyAttack`
 *      already rolled the concentration save into proposed state;
 *      we stash that snapshot so a Shield-decline commits it
 *      verbatim and a Shield-accept discards it (closing the
 *      Shield-vs-concentration ordering bug).
 *   2. **Hellish Rebuke** (AFTER damage commits) — the PC can deal
 *      2d10 fire back to the attacker.
 *
 * Either pause returns `'paused'`; the caller exits with
 * `paused: true` so the resume cycle picks up at
 * `resumeFromMultiattackIdx`.
 *
 * The Orc Relentless Endurance bump (1 HP instead of 0) and the
 * Massive Damage Death check both run inline here against the
 * commit snapshot.
 *
 * `'completed'` means the full multiattack ran without a pause —
 * caller proceeds to death save processing and the per-turn
 * commitCharacter at the end of the enemy turn.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5).
 */
function runEnemyMultiattackLoop(args: {
  enemy: Enemy;
  enemyId: string;
  enemyEnt: CombatEntity | undefined;
  target: Character;
  st: GameState;
  resumeMi: number;
  attackCount: number;
  advIdx: number;
  context: Context;
  narrative: string;
}):
  | {
      kind: 'paused';
      st: GameState;
      narrative: string;
    }
  | {
      kind: 'completed';
      st: GameState;
      target: Character;
      narrative: string;
      massiveDeath: boolean;
    } {
  const { enemy, enemyId, enemyEnt, st: initialSt, attackCount, advIdx, context } = args;
  let st = initialSt;
  let target = args.target;
  let narrative = args.narrative;
  let massiveDeath = false;
  for (let mi = args.resumeMi; mi < attackCount && target.hp > 0; mi++) {
    const prevHp = target.hp;
    const computed = computeEnemyAttack(enemy, target, st, context);
    // Shield reaction window — pause before committing the proposed snapshot.
    if (computed.hit && isShieldEligible(target, computed.atkTotal, target.ac, context)) {
      st = {
        ...st,
        pending_reaction: {
          kind: 'shield',
          attackerEnemyId: enemyId,
          targetCharId: target.id,
          atkTotal: computed.atkTotal,
          targetAcAtAttack: target.ac,
          pendingFragment: computed.fragment as EnemyAttackHitFragment,
          pendingProposedChar: computed.proposedChar,
          // Clear the inner pending_reaction to avoid self-recursion
          // when stashing the proposed snapshot.
          pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
          resumeFromInitiativeIdx: advIdx,
          resumeFromMultiattackIdx: mi + 1,
          narrativeSoFar: narrative,
          eligibleCharIds: [target.id],
        },
        // Put the reactor in the driver's seat so the FE prompts them.
        active_character_id: target.id,
      };
      narrative += ` ⚡ ${enemy.name} strikes ${target.name} — total ${fmt.roll(computed.atkTotal)} vs ${fmt.ac(target.ac)}. Shield available!`;
      return { kind: 'paused', st, narrative };
    }
    // Silvery Barbs reaction window. Fires when the enemy attack
    // hits AND the PC knows the spell + has a slot. The resolver
    // rerolls the enemy d20 and takes the lower — potentially
    // turning the hit into a miss.
    if (computed.hit && computed.hpLost > 0 && isSilveryBarbsEligible(target, context)) {
      st = {
        ...st,
        pending_reaction: {
          kind: 'silvery_barbs',
          attackerEnemyId: enemyId,
          targetCharId: target.id,
          atkTotal: computed.atkTotal,
          proposedD20: computed.atkD20,
          proposedDamage: computed.hpLost,
          targetAc: target.ac,
          pendingFragment: computed.fragment as EnemyAttackHitFragment,
          pendingProposedChar: computed.proposedChar,
          pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
          resumeFromInitiativeIdx: advIdx,
          resumeFromMultiattackIdx: mi + 1,
          narrativeSoFar: narrative,
          eligibleCharIds: [target.id],
        },
        active_character_id: target.id,
      };
      narrative += ` ⚡ ${enemy.name} hits ${target.name} (d20 ${computed.atkD20} → total ${fmt.roll(computed.atkTotal)} vs ${fmt.ac(target.ac)}) — Silvery Barbs available!`;
      return { kind: 'paused', st, narrative };
    }
    // Absorb Elements reaction window. Fires when the enemy attack
    // deals one of the five elemental damage types AND the PC has
    // the spell + a slot. Same proposed-snapshot stash pattern as
    // Shield / Uncanny Dodge.
    if (
      computed.hit &&
      computed.hpLost > 0 &&
      isAbsorbElementsEligible(target, computed.fragment.damageType, context)
    ) {
      st = {
        ...st,
        pending_reaction: {
          kind: 'absorb_elements',
          attackerEnemyId: enemyId,
          targetCharId: target.id,
          damageType: computed.fragment.damageType as
            | 'acid'
            | 'cold'
            | 'fire'
            | 'lightning'
            | 'thunder',
          proposedDamage: computed.hpLost,
          pendingFragment: computed.fragment as EnemyAttackHitFragment,
          pendingProposedChar: computed.proposedChar,
          pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
          resumeFromInitiativeIdx: advIdx,
          resumeFromMultiattackIdx: mi + 1,
          narrativeSoFar: narrative,
          eligibleCharIds: [target.id],
        },
        active_character_id: target.id,
      };
      narrative += ` ⚡ ${enemy.name} hits ${target.name} for ${fmt.dmg(computed.hpLost)} ${computed.fragment.damageType} — Absorb Elements available!`;
      return { kind: 'paused', st, narrative };
    }
    // Uncanny Dodge reaction window (Rogue L5+). Triggers BEFORE
    // damage commits when the Rogue can see the attacker. Same
    // proposed-snapshot stash pattern as Shield; the resolver in
    // reaction.ts halves `proposedDamage` before committing.
    if (computed.hit && computed.hpLost > 0 && isUncannyDodgeEligible(target)) {
      st = {
        ...st,
        pending_reaction: {
          kind: 'uncanny_dodge',
          attackerEnemyId: enemyId,
          targetCharId: target.id,
          atkTotal: computed.atkTotal,
          proposedDamage: computed.hpLost,
          pendingFragment: computed.fragment as EnemyAttackHitFragment,
          pendingProposedChar: computed.proposedChar,
          pendingProposedSt: { ...computed.proposedSt, pending_reaction: undefined },
          resumeFromInitiativeIdx: advIdx,
          resumeFromMultiattackIdx: mi + 1,
          narrativeSoFar: narrative,
          eligibleCharIds: [target.id],
        },
        active_character_id: target.id,
      };
      narrative += ` ⚡ ${enemy.name} strikes ${target.name} for ${fmt.dmg(computed.hpLost)} — Uncanny Dodge available!`;
      return { kind: 'paused', st, narrative };
    }
    // No Shield / Uncanny Dodge window — commit the proposed character + state.
    // Orc Relentless Endurance: when reduced to 0 HP (and not killed
    // outright by massive damage), the Orc drops to 1 HP instead.
    // 1/long rest.
    const proposedHp = computed.proposedChar.hp;
    const orcReUsed = target.class_resource_uses?.relentless_endurance_used === 1;
    let orcSaveFired = false;
    if (
      target.species === 'orc' &&
      !orcReUsed &&
      prevHp > 0 &&
      proposedHp === 0 &&
      !isMassiveDamageDeath(prevHp, computed.hpLost, target.max_hp)
    ) {
      orcSaveFired = true;
      target = {
        ...computed.proposedChar,
        hp: 1,
        class_resource_uses: {
          ...(computed.proposedChar.class_resource_uses ?? {}),
          relentless_endurance_used: 1,
        },
      };
    } else {
      target = computed.proposedChar;
    }
    st = computed.proposedSt;
    if (orcSaveFired) {
      narrative += ` 🪓 Relentless Endurance! ${target.name} stays standing at ${fmt.hp(1)} HP.`;
    }
    narrative += ` ${computed.fragment.prose}`;
    st = pushEvent(st, enemyAttackFragmentEvent(computed.fragment, st.round ?? 1));
    if (isMassiveDamageDeath(prevHp, computed.hpLost, target.max_hp)) {
      target = { ...target, dead: true, stable: false };
      narrative += ` MASSIVE DAMAGE — ${target.name} is killed outright!`;
      massiveDeath = true;
      break;
    }

    // Sentinel feat reaction (2024 PHB) — triggers AFTER an enemy
    // attack hits, eligible to OTHER PCs within 5 ft of the target.
    // Commit the target's HP first so the resumed run sees the
    // correct state.
    if (computed.hit && computed.hpLost > 0) {
      const sentinelPcs = findSentinelEligiblePcs(target.id, st, enemyEnt);
      if (sentinelPcs.length > 0) {
        // Pansori's reaction validator checks `ctx.char.id ===
        // rx.targetCharId` — so for cross-actor reactions like
        // Sentinel where the reactor isn't the attack target,
        // `targetCharId` carries the REACTOR's id. The original
        // attack target stays in `triggerAttackerEnemyId` context;
        // we record it separately for narrative if needed.
        st = {
          ...commitCharacter(st, target),
          pending_reaction: {
            kind: 'sentinel',
            attackerEnemyId: enemyId,
            targetCharId: sentinelPcs[0].id,
            triggerAttackerEnemyId: enemyId,
            resumeFromInitiativeIdx: advIdx,
            resumeFromMultiattackIdx: mi + 1,
            narrativeSoFar: narrative,
            eligibleCharIds: sentinelPcs.map((p) => p.id),
          },
          active_character_id: sentinelPcs[0].id,
        };
        narrative += ` ⚔ ${sentinelPcs[0].name} could intercept with Sentinel!`;
        return { kind: 'paused', st, narrative };
      }
    }

    // Hellish Rebuke (PHB p.252) — triggers AFTER damage applies. The
    // damage is already on the books in `target`; if the player
    // accepts, the resolve path deals damage back to the attacker.
    // Commit the new target HP to state BEFORE pausing so the resumed
    // run sees the correct HP.
    if (computed.hit && computed.hpLost > 0 && target.hp > 0) {
      const myPos = st.entities?.find((e) => e.id === target.id)?.pos;
      if (isHellishRebukeEligible(target, myPos, enemyEnt?.pos, context)) {
        st = {
          ...commitCharacter(st, target),
          pending_reaction: {
            kind: 'hellish_rebuke',
            attackerEnemyId: enemyId,
            targetCharId: target.id,
            resumeFromInitiativeIdx: advIdx,
            resumeFromMultiattackIdx: mi + 1,
            narrativeSoFar: narrative,
            eligibleCharIds: [target.id],
          },
          active_character_id: target.id,
        };
        narrative += ` 🔥 ${target.name} could retaliate with Hellish Rebuke!`;
        return { kind: 'paused', st, narrative };
      }
    }
  }
  return { kind: 'completed', st, target, narrative, massiveDeath };
}

/**
 * Tactical approach movement for an enemy that wants to melee a PC.
 * SRD 5.2.1 p.190 — the enemy must be within `attackReachFt` of the
 * target before its swing connects; otherwise it walks up to
 * `speedFt` toward an in-reach square. PCs whose threat zone is
 * broken by the move get opportunity attacks (which may kill the
 * mover).
 *
 * Returns one of:
 *   - `'proceed-to-attack'` — either resuming a multi-attack
 *     (`resumeMi > 0`), already in reach (`!needsToMove`), or
 *     successfully closed to reach this turn. Caller proceeds to the
 *     multiattack loop. `movementHeaderPrinted` indicates whether
 *     the `[Name's turn]` header was already emitted by this helper.
 *   - `'skip-turn'` — no path found, enemy killed by an OA, or
 *     moved but still out of reach. Caller advances initiative and
 *     continues the loop.
 *
 * Grappled / restrained enemies have effective speed 0 → no path →
 * skip-turn with a "held in place" message.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5).
 */
function attemptEnemyApproach(args: {
  enemy: Enemy;
  enemyId: string;
  target: Character;
  st: GameState;
  resumeMi: number;
  context: Context;
  roomObstacleCells: GridPos[];
  narrative: string;
}):
  | { kind: 'proceed-to-attack'; st: GameState; narrative: string; movementHeaderPrinted: boolean }
  | { kind: 'skip-turn'; st: GameState; narrative: string } {
  const { enemy, enemyId, target, st, resumeMi, context, roomObstacleCells } = args;
  let narrative = args.narrative;
  const reachFt = enemy.attackReachFt ?? 5;
  const baseSpeedFt = enemy.speedFt ?? DEFAULT_SPEED_FEET;
  const enemyEntPreMove = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
  const targetEntPreMove = st.entities?.find((e) => e.id === target.id);
  const enemyImmobile =
    enemyEntPreMove?.conditions?.some((c) => c === 'grappled' || c === 'restrained') ?? false;
  const effectiveEnemySpeedFt = enemyImmobile ? 0 : baseSpeedFt;
  const needsToMove =
    !!enemyEntPreMove &&
    !!targetEntPreMove &&
    distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos) > reachFt;

  // Skip the movement work entirely when resuming a multi-attack or
  // when already in reach. Caller falls through to the attack loop.
  if (resumeMi !== 0 || !needsToMove || !enemyEntPreMove || !targetEntPreMove) {
    return { kind: 'proceed-to-attack', st, narrative, movementHeaderPrinted: false };
  }

  narrative += `\n\n[${enemy.name}'s turn]`;
  const plan = planEnemyApproach({
    st,
    enemyId,
    enemyPos: enemyEntPreMove.pos,
    targetPos: targetEntPreMove.pos,
    reachFt,
    speedFt: effectiveEnemySpeedFt,
    context,
    roomId: st.current_room,
    roomObstacles: roomObstacleCells,
  });
  const distBefore = distanceFeet(enemyEntPreMove.pos, targetEntPreMove.pos);
  if (!plan || plan.pathSquares.length === 0) {
    narrative += enemyImmobile
      ? ` ${enemy.name} is held in place (${enemyEntPreMove.conditions.includes('restrained') ? 'restrained' : 'grappled'}) and can't reach ${target.name} this turn.`
      : ` ${enemy.name} can't find a path to ${target.name} this turn.`;
    return { kind: 'skip-turn', st, narrative };
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
    enemyId,
    oaTargets: oaTriggers,
    enemyAc: enemy.ac,
    enemyName: enemy.name,
    context,
  });
  let nextSt = oaRes.st;
  const stepsFt = plan.pathSquares.length * SQUARE_SIZE;
  narrative += ` ${enemy.name} closes ${stepsFt} ft toward ${target.name} (${distBefore} ft → ${distanceFeet(plan.newPos, targetEntPreMove.pos)} ft).${oaRes.narrative}`;
  if (oaRes.enemyKilled) {
    return { kind: 'skip-turn', st: nextSt, narrative };
  }

  // Commit the new enemy position.
  nextSt = {
    ...nextSt,
    entities: (nextSt.entities ?? []).map((e) =>
      e.id === enemyId ? { ...e, pos: plan.newPos } : e
    ),
  };
  if (!plan.reached) {
    narrative += ` ${enemy.name} is still out of reach — no attack this round.`;
    return { kind: 'skip-turn', st: nextSt, narrative };
  }
  return { kind: 'proceed-to-attack', st: nextSt, narrative, movementHeaderPrinted: true };
}

/**
 * Enemy spell-cast intent + resolution. Called at the start of an
 * enemy's turn before the melee/multiattack path. Returns one of three
 * outcomes:
 *
 *   - `'no-cast'` — the enemy doesn't have a spell list, the
 *     castChance roll missed, the spell doesn't deal damage, or the
 *     caller is mid-multiattack (`resumeMi > 0`). Fall through to
 *     melee.
 *   - `'counterspell-pending'` — a party PC qualifies for Counterspell;
 *     `pending_reaction` is staged + active_character_id moved to the
 *     reactor. Caller returns `{paused: true}` immediately.
 *   - `'spell-resolved'` — no counterspeller available; the spell
 *     resolves now and damage is committed. Caller advances initiative
 *     and continues (the spell IS this turn's action, no melee follows).
 *
 * Extracted from `runEnemyTurns` as part of the architecture audit #5
 * refactor. The block was ~90 lines of deeply-nested branches; lifting
 * it gives the closure a clean three-way dispatch and exposes the
 * outcome surface for direct tests.
 */
function attemptEnemySpellCast(args: {
  enemy: Enemy;
  enemyId: string;
  enemyEnt: CombatEntity | undefined;
  target: Character;
  targetCharIdx: number;
  st: GameState;
  context: Context;
  resumeMi: number;
  advIdx: number;
  orderLen: number;
  narrative: string;
}):
  | { kind: 'no-cast' }
  | { kind: 'counterspell-pending'; st: GameState; narrative: string }
  | { kind: 'spell-resolved'; st: GameState; target: Character; narrative: string } {
  const {
    enemy,
    enemyId,
    enemyEnt,
    target,
    targetCharIdx,
    st,
    context,
    resumeMi,
    advIdx,
    orderLen,
  } = args;
  let narrative = args.narrative;
  // `resumeMi > 0` means we're already mid-multiattack from a prior
  // pause/resume cycle — don't re-decide cast intent.
  if (
    resumeMi !== 0 ||
    !enemy.spells ||
    enemy.spells.length === 0 ||
    (enemy.castChance ?? 0) === 0 ||
    Math.random() >= (enemy.castChance ?? 0)
  ) {
    return { kind: 'no-cast' };
  }
  const spellId = pick(enemy.spells);
  const spell = context.spellTable?.[spellId];
  if (!spell?.damage) return { kind: 'no-cast' };

  // Counterspell eligibility — check all party PCs.
  const reactor = st.characters.find((c) =>
    isCounterspellEligible(c, st.entities?.find((e) => e.id === c.id)?.pos, enemyEnt?.pos, context)
  );
  if (reactor) {
    const stagedSt: GameState = {
      ...st,
      pending_reaction: {
        kind: 'counterspell',
        attackerEnemyId: enemyId,
        targetCharId: reactor.id,
        intendedTargetPcId: target.id,
        enemySpellId: spellId,
        enemySpellLevel: spell.level,
        enemySpellName: spell.name,
        // Counterspell collapses the WHOLE enemy turn — there's no
        // further sub-attack to resume to. Point past this enemy so
        // the loop continues with the next initiative slot.
        resumeFromInitiativeIdx: (advIdx + 1) % orderLen,
        resumeFromMultiattackIdx: 0,
        narrativeSoFar: narrative,
        eligibleCharIds: [reactor.id],
      },
      active_character_id: reactor.id,
    };
    narrative += ` ✨ ${enemy.name} begins casting ${spell.name}! Counterspell available.`;
    return { kind: 'counterspell-pending', st: stagedSt, narrative };
  }

  // No counterspeller — resolve the spell now.
  const dmgRoll = rollDice(spell.damage);
  let newTarget = target;
  if (spell.savingThrow) {
    const saveScore = (target[spell.savingThrow] ?? 10) as number;
    const dc = enemy.spellSaveDC ?? 8 + Math.floor((enemy.toHit + 5) / 2);
    const save = rollDice('1d20') + abilityMod(saveScore);
    const saved = save >= dc;
    const dmg =
      saved && spell.saveEffect === 'half'
        ? Math.floor(dmgRoll / 2)
        : saved && spell.saveEffect === 'negates'
          ? 0
          : dmgRoll;
    newTarget = { ...target, hp: Math.max(0, target.hp - dmg) };
    narrative += ` ${enemy.name} casts ${spell.name}! ${target.name} ${fmt.save(spell.savingThrow.toUpperCase(), save)} vs ${fmt.dc(dc)} — ${saved ? 'saves' : 'fails'}, ${fmt.dmg(dmg)} ${spell.damageType ?? 'damage'}.`;
  } else {
    newTarget = { ...target, hp: Math.max(0, target.hp - dmgRoll) };
    narrative += ` ${enemy.name} casts ${spell.name}! ${target.name} takes ${fmt.dmg(dmgRoll)} ${spell.damageType ?? 'damage'}.`;
  }
  void targetCharIdx;
  return {
    kind: 'spell-resolved',
    st: commitCharacter(st, newTarget),
    target: newTarget,
    narrative,
  };
}

/**
 * Pick the nearest living non-companion PC for an enemy to attack.
 * Returns the enemy's own entity (for downstream positioning checks),
 * the chosen target entity, and the target's index in `st.characters`
 * (so callers can write back updates without re-searching).
 *
 * `targetCharIdx === -1` means no eligible target (no living PCs in
 * range, or all are companions). Callers should advance the
 * initiative slot when this happens.
 *
 * Extracted from `runEnemyTurns` (architecture audit #5). The
 * extraction makes the target-selection contract observable and sets
 * up a future swap-in for per-enemy targeting AI (e.g., focus the
 * lowest-HP PC, target the cleric first, etc.) without touching the
 * surrounding closure.
 */
export function selectEnemyMeleeTarget(
  enemyId: string,
  st: GameState
): {
  enemyEnt: CombatEntity | undefined;
  targetEnt: CombatEntity | undefined;
  targetCharIdx: number;
} {
  const enemyEnt = st.entities?.find((e) => e.id === enemyId && e.isEnemy);
  const targetEnt = st.entities
    ?.filter((e) => !e.isEnemy && !e.isCompanion && e.hp > 0)
    .sort((a, b) => {
      if (!enemyEnt) return 0;
      return distanceFeet(enemyEnt.pos, a.pos) - distanceFeet(enemyEnt.pos, b.pos);
    })[0];
  const targetCharIdx = st.characters.findIndex((c) => c.id === targetEnt?.id && !c.dead);
  return { enemyEnt, targetEnt, targetCharIdx };
}

/**
 * Hide DC check for an enemy attacking an invisible PC. The 2024 PHB
 * Hide rules use a stable hide DC (rolled at Hide-action time and
 * stashed on the character); enemies check against it via passive
 * Perception first, then active Search if passive falls short.
 *
 * Outcomes:
 *   - `'spotted-passive'`: enemy passive ≥ DC → invisible drops, attack proceeds.
 *   - `'spotted-active'`: passive failed but active Search ≥ DC → invisible
 *     drops, but the enemy used their action to Search so no attack this turn.
 *   - `'not-spotted'`: both checks failed → PC stays hidden, no attack this turn.
 *   - `'not-hidden'`: no Hide DC tracked / target not invisible → caller proceeds.
 *
 * Mutates the target's `conditions` (removes invisible) and clears
 * `hide_dc` when the PC is spotted. Returns the updated state.
 *
 * Extracted from `runEnemyTurns` as part of the multi-PR refactor to
 * monsters-as-first-class-action-subjects (architecture audit item
 * #5). The extraction makes the closure thinner and gives future PRs
 * a self-contained handler to wire through the dispatcher.
 */
export function resolveEnemyHideCheck(
  enemy: Enemy,
  target: Character,
  targetCharIdx: number,
  st: GameState
): {
  outcome: 'spotted-passive' | 'spotted-active' | 'not-spotted' | 'not-hidden';
  st: GameState;
  target: Character;
  narrative: string;
} {
  if (!target.conditions?.includes('invisible') || (target.hide_dc ?? 0) === 0) {
    return { outcome: 'not-hidden', st, target, narrative: '' };
  }
  const hideDc = target.hide_dc!;
  const enemyWis = (enemy as unknown as Record<string, number>)?.wis ?? 10;
  const passivePer = 10 + abilityMod(enemyWis);
  if (passivePer >= hideDc) {
    const newTarget: Character = {
      ...target,
      conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
      hide_dc: undefined,
    };
    return {
      outcome: 'spotted-passive',
      st: {
        ...st,
        characters: st.characters.map((c, i) => (i === targetCharIdx ? newTarget : c)),
      },
      target: newTarget,
      narrative: ` ${enemy.name} spots ${target.name} (passive Perception ${passivePer} vs hide DC ${hideDc}).`,
    };
  }
  const activeSearch = rollDice('1d20') + abilityMod(enemyWis);
  if (activeSearch >= hideDc) {
    const newTarget: Character = {
      ...target,
      conditions: (target.conditions ?? []).filter((c) => c !== 'invisible'),
      hide_dc: undefined,
    };
    return {
      outcome: 'spotted-active',
      st: {
        ...st,
        characters: st.characters.map((c, i) => (i === targetCharIdx ? newTarget : c)),
      },
      target: newTarget,
      narrative: ` ${enemy.name} actively searches and locates ${target.name}! (Search ${activeSearch} vs hide DC ${hideDc}; attack forfeited this turn.)`,
    };
  }
  return {
    outcome: 'not-spotted',
    st,
    target,
    narrative: ` ${enemy.name} searches the room but cannot find ${target.name}. (Search ${activeSearch} vs hide DC ${hideDc}; turn lost.)`,
  };
}

export function runEnemyTurns(args: {
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
      const { enemyEnt: eEnt, targetCharIdx } = selectEnemyMeleeTarget(eEntry.id, st);
      if (targetCharIdx >= 0) {
        let target = st.characters[targetCharIdx];
        // 2024 PHB Hide DC tracking — delegated to `resolveEnemyHideCheck`.
        // See that function's JSDoc for the outcome matrix.
        const hideResult = resolveEnemyHideCheck(rm, target, targetCharIdx, st);
        st = hideResult.st;
        target = hideResult.target;
        narrative += hideResult.narrative;
        const hideBlockedAttack =
          hideResult.outcome === 'spotted-active' || hideResult.outcome === 'not-spotted';
        if (hideBlockedAttack) {
          // End this enemy's turn — they used their action to Search.
          const prevAdvIdxHide = advIdx;
          advIdx = (advIdx + 1) % orderLen;
          if (advIdx === 0 && prevAdvIdxHide !== 0) roundWrapped = true;
          if (advIdx === args.initialCurrentIdx) break;
          continue;
        }
        if (!target.dead && target.hp > 0) {
          // ── Spell-cast intent ─ delegated to `attemptEnemySpellCast` ──────
          const spellResult = attemptEnemySpellCast({
            enemy: rm,
            enemyId: eEntry.id,
            enemyEnt: eEnt,
            target,
            targetCharIdx,
            st,
            context: args.context,
            resumeMi,
            advIdx,
            orderLen,
            narrative,
          });
          if (spellResult.kind === 'counterspell-pending') {
            return {
              st: spellResult.st,
              narrative: spellResult.narrative,
              exitAdvIdx: advIdx,
              roundWrapped,
              paused: true,
            };
          }
          if (spellResult.kind === 'spell-resolved') {
            st = spellResult.st;
            target = spellResult.target;
            narrative = spellResult.narrative;
            // Skip the multi-attack — spell IS the action this turn.
            resumeMi = 0;
            const prevAdvIdx2 = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdx2 !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
          // spellResult.kind === 'no-cast' → fall through to melee.

          // ── Tactical movement step ─ delegated to `attemptEnemyApproach` ───
          const approach = attemptEnemyApproach({
            enemy: rm,
            enemyId: eEntry.id,
            target,
            st,
            resumeMi,
            context: args.context,
            roomObstacleCells,
            narrative,
          });
          if (approach.kind === 'skip-turn') {
            st = approach.st;
            narrative = approach.narrative;
            resumeMi = 0;
            const prevAdvIdxMove = advIdx;
            advIdx = (advIdx + 1) % orderLen;
            if (advIdx === 0 && prevAdvIdxMove !== 0) roundWrapped = true;
            if (advIdx === args.initialCurrentIdx) break;
            continue;
          }
          st = approach.st;
          narrative = approach.narrative;
          const movementHeaderPrinted = approach.movementHeaderPrinted;
          const attackCount = rm.multiattack ?? 1;
          if (resumeMi === 0 && !movementHeaderPrinted) {
            narrative += `\n\n[${rm.name}'s turn]`;
          }
          // ── Multiattack loop ─ delegated to `runEnemyMultiattackLoop` ─────
          const multi = runEnemyMultiattackLoop({
            enemy: rm,
            enemyId: eEntry.id,
            enemyEnt: eEnt,
            target,
            st,
            resumeMi,
            attackCount,
            advIdx,
            context: args.context,
            narrative,
          });
          if (multi.kind === 'paused') {
            return {
              st: multi.st,
              narrative: multi.narrative,
              exitAdvIdx: advIdx,
              roundWrapped,
              paused: true,
            };
          }
          st = multi.st;
          target = multi.target;
          narrative = multi.narrative;
          const massiveDeath = multi.massiveDeath;

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
          st = commitCharacter(st, target);
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
      const dmgResult = applyDamage(char, st, trapDmg);
      char = dmgResult.char;
      st = dmgResult.st;
      narrative +=
        hiddenTrap.triggerNarrative
          .replace(/{name}/g, char.name)
          .replace(/{dmg}/g, String(trapDmg)) +
        dmgResult.concentrationNote +
        ' ';
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
    st = commitCharacter(st, char);
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
  // mutate its fields in place. The dispatch result has three shapes:
  //
  //  - { handled: false }: no handler is registered for this action type;
  //    fall through to the inline legacy switch below.
  //  - { handled: true }: a leaf handler ran — sync the working-state ctx
  //    fields back into local bindings and continue with the post-action
  //    epilogue (initiative, runRules, narrative, etc.).
  //  - { handled: true, replaceWith }: a transformer handler staged
  //    pre-mutations and asks takeAction to re-enter from the top with a
  //    different action (e.g. attack_npc → attack). Return the recursive
  //    call's result directly — the inner takeAction runs its own epilogue
  //    so the outer one must NOT run again, or enemy turns / runRules /
  //    LLM enhance would double-fire.
  //
  // PRs land one handler at a time until the switch empties out.
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
    actor: pcActor(char, safeIdx),
    narrative,
    escaped,
    usedInitiative,
    fragments: [],
    commitChar() {
      this.st = commitCharacter(this.st, this.char);
    },
  };

  const dispatchResult = await dispatchAction(ctx, action);
  if (dispatchResult.handled && dispatchResult.replaceWith) {
    // Transformer: the handler staged pre-mutations into ctx (e.g. flipped
    // attitude); re-enter takeAction with the new action against the
    // staged state. The recursive call owns the epilogue.
    return await takeAction({
      action: dispatchResult.replaceWith,
      history,
      state: ctx.st,
      seed: ctx.seed,
      context,
    });
  }
  if (dispatchResult.handled) {
    // Render any structured fragments the handler pushed into ctx.fragments
    // (see services/narrative/compose.ts). For unmigrated handlers this is
    // a no-op; for migrated ones, the composer appends rendered prose to
    // ctx.narrative and pushes corresponding CombatEvents to ctx.st.
    composeFragments(ctx);
    seed = ctx.seed;
    st = ctx.st;
    char = ctx.char;
    narrative = ctx.narrative;
    escaped = ctx.escaped;
    usedInitiative = ctx.usedInitiative;
  }

  if (!dispatchResult.handled)
    switch (action.type) {
      // The `examine` action is registered in the dispatch table
      // (services/actions/examineDefault.ts); this default arm catches
      // truly unknown action types and falls back to the same arrival
      // narrative the examine handler emits.
      default: {
        narrative = buildArrivalNarrative(roomId, st, seed, context);
        if (st.combat_active) narrative += ` You are in combat!`;
        if (char.conditions.length > 0)
          narrative += ` ${fmt.note(`[Conditions: ${char.conditions.join(', ')}]`)}`;
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
            narrative += ` ${fmt.note(`[${ticked.name}] Condition${expired.length > 1 ? 's' : ''} cleared: ${expired.join(', ')}.`)}`;
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
  // The LLM rewrites prose freely. We strip:
  //   - non-note tokens (`{{dmg|5}}` → "5") so the LLM sees the numbers
  //     it must preserve for `preservesCriticalFacts`
  //   - note tokens (`{{note|[Sneak Attack: +7]}}`) entirely — mechanical
  //     asides aren't narrative and shouldn't be woven into prose. They
  //     reach the FE intact (as styled sidebar pills) on either the
  //     enhanced or the raw-fallback path.
  // When LLM is enabled the user trades styled-token rendering of damage
  // numbers etc. for atmospheric prose; mechanical notes remain styled
  // either way; the structured combat_log retains all mechanical data.
  // With the default NoneProvider (passthrough) the FE renders the
  // tokenised raw narrative directly.
  const llmInput = stripForLlm(rawNarrative);
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
