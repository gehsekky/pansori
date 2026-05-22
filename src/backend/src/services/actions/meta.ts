import { applyFeatTake, canTakeFeat, getFeat } from '../feats.js';
import { applyLevelUpForClass, preparedSpellsCap } from '../gameEngine.js';
import { canMulticlassInto, getClassLevel, hasClass } from '../multiclass.js';
import type { AbilityKey } from '../../types.js';
import type { ActionHandler } from './types.js';

/**
 * `apply_asi`: spend a pending Ability Score Improvement (granted by
 * `applyLevelUpFromXp` at the appropriate levels). +2 to the chosen
 * stat. CON increases retroactively raise max HP across every level
 * (PHB convention).
 */
export const handleApplyAsi: ActionHandler<{ type: 'apply_asi'; stat: AbilityKey }> = (
  ctx,
  action
) => {
  if (!ctx.char.asi_pending) {
    ctx.narrative = 'No Ability Score Improvement pending.';
    return;
  }
  const stat = action.stat;
  const next = { ...ctx.char, asi_pending: false } as typeof ctx.char;
  next[stat] = (ctx.char[stat] ?? 10) + 2;
  const statName = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[stat];
  let narrative = `${next.name} increases ${statName} by 2 (now ${next[stat]})!`;
  if (stat === 'con') {
    const bonus = Math.floor((next.con - 10) / 2) - Math.floor((next.con - 2 - 10) / 2);
    next.max_hp = Math.max(1, next.max_hp + bonus * next.level);
    next.hp = Math.min(next.max_hp, next.hp + bonus * next.level);
    if (bonus > 0)
      narrative += ` Max HP increased by ${bonus * next.level} (${bonus}/level × ${next.level} levels).`;
  }
  ctx.char = next;
  ctx.narrative = narrative;
};

/**
 * `select_subclass`: pick a subclass at level 1 (Cleric/Sorcerer/
 * Warlock) or later (other classes — L2 Wizard/Druid, L3 for the
 * rest). Idempotent: re-selecting a chosen subclass is rejected.
 * Sorcerer Draconic Bloodline retroactively grants +1 HP / sorcerer
 * level when picked mid-game.
 */
export const handleSelectSubclass: ActionHandler<{ type: 'select_subclass'; subclass: string }> = (
  ctx,
  action
) => {
  if (ctx.char.subclass) {
    ctx.narrative = `You have already chosen the ${ctx.char.subclass} subclass.`;
    return;
  }
  const next = { ...ctx.char, subclass: action.subclass };
  let narrative = `${next.name} follows the path of the ${action.subclass}!`;
  if (action.subclass === 'draconic' && hasClass(next, 'sorcerer')) {
    // Draconic Resilience scales with Sorcerer level only.
    const sorcLvl = getClassLevel(next, 'sorcerer');
    next.max_hp += sorcLvl;
    next.hp += sorcLvl;
    narrative += ` Draconic Resilience: +${sorcLvl} max HP (now ${next.hp}/${next.max_hp}).`;
  }
  ctx.char = next;
  ctx.narrative = narrative;
};

/**
 * `set_active_character`: out-of-combat "lead picker". Hands the
 * spotlight to a different living PC for subsequent narrative
 * attribution + skill checks. No-op in combat (initiative drives
 * `active_character_id` there). Does NOT consume a turn — sets
 * `usedInitiative = false` so initiative is not advanced.
 */
export const handleSetActiveCharacter: ActionHandler<{
  type: 'set_active_character';
  characterId: string;
}> = (ctx, action) => {
  if (ctx.st.combat_active) {
    ctx.narrative = `Initiative is rolled — you can't hand the spotlight off mid-fight.`;
    return;
  }
  const target = ctx.st.characters.find((c) => c.id === action.characterId);
  if (!target) {
    ctx.narrative = 'Unknown party member.';
    return;
  }
  if (target.dead) {
    ctx.narrative = `${target.name} is dead and can't lead.`;
    return;
  }
  ctx.st = { ...ctx.st, active_character_id: action.characterId };
  ctx.narrative = `${target.name} steps forward to lead.`;
  ctx.usedInitiative = false;
};

/**
 * `prepare_spells`: pick which leveled spells are prepared for the
 * day. Cantrips are always known (PHB p.234) so they're stripped from
 * input. Cap = level + spellcasting modifier (preparedSpellsCap).
 * Out-of-combat only.
 */
export const handlePrepareSpells: ActionHandler<{
  type: 'prepare_spells';
  spellIds: string[];
}> = (ctx, action) => {
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot prepare spells during combat.';
    return;
  }
  const maxPrepared = preparedSpellsCap(ctx.char, ctx.context);
  const leveledIds = action.spellIds.filter((id) => (ctx.context.spellTable?.[id]?.level ?? 0) > 0);
  if (leveledIds.length > maxPrepared) {
    ctx.narrative = `You can prepare at most ${maxPrepared} leveled spells (your level + spellcasting modifier). You tried to prepare ${leveledIds.length}.`;
    return;
  }
  ctx.char = { ...ctx.char, prepared_spells: leveledIds };
  const spellNames = leveledIds.map((id) => ctx.context.spellTable?.[id]?.name ?? id).join(', ');
  ctx.narrative = `${ctx.char.name} prepares their spells for the day: ${spellNames || '(none)'}.`;
};

/**
 * `take_feat`: choose a feat. Surfaced at character creation (origin
 * feats from background) and at ASI levels (general feats replace the
 * +2 ability bump). The handler runs the prereq check, then applies
 * take-time bonuses via `applyFeatTake` (HP grant for Tough, +1
 * ability for half-feats, save profs for Resilient, etc.). Active-
 * effect feats (Lucky, Sharpshooter) only register here; their
 * runtime hooks fire at the relevant gameplay moment in follow-up
 * PRs.
 *
 * `asi_pending` is consumed when the feat is taken in lieu of an ASI.
 * Origin feats from backgrounds don't consume it; the FE picks the
 * right scope when surfacing the action.
 */
export const handleTakeFeat: ActionHandler<{
  type: 'take_feat';
  featId: string;
  abilityChoice?: AbilityKey;
  saveProficiencyChoices?: AbilityKey[];
}> = (ctx, action) => {
  const feat = getFeat(action.featId, ctx.context);
  if (!feat) {
    ctx.narrative = `Unknown feat: ${action.featId}.`;
    return;
  }
  const fail = canTakeFeat(ctx.char, feat);
  if (fail) {
    ctx.narrative = fail;
    return;
  }
  // Half-feats with player-chosen ability need a pick.
  if (feat.abilityBonus && 'choices' in feat.abilityBonus && !action.abilityChoice) {
    ctx.narrative = `${feat.name} is a half-feat — pick an ability for the +1 bonus.`;
    return;
  }
  // save-proficiency feats with empty `abilities` need a pick.
  if (
    feat.effect.kind === 'save-proficiency' &&
    feat.effect.abilities.length === 0 &&
    (!action.saveProficiencyChoices || action.saveProficiencyChoices.length === 0)
  ) {
    ctx.narrative = `${feat.name} requires a save-proficiency choice.`;
    return;
  }

  const { newChar, narrative } = applyFeatTake(ctx.char, feat, {
    abilityChoice: action.abilityChoice,
    saveProficiencyChoices: action.saveProficiencyChoices,
  });
  // ASI-slot consumption — only when an ASI was pending (general-feat
  // path). Origin feats from background don't gate on asi_pending.
  const consumeAsi = ctx.char.asi_pending && feat.category === 'general';
  ctx.char = consumeAsi ? { ...newChar, asi_pending: false } : newChar;
  ctx.narrative = narrative;
};

/**
 * `level_up_class`: manually advance one level, choosing the class
 * to add the level to (2024 PHB multiclassing). Validates:
 *
 *   - XP threshold met for `char.level + 1`.
 *   - Out of combat (RAW: level-ups happen during downtime).
 *   - Total level not yet at the cap (20).
 *   - 2024 PHB multiclass prerequisites for any class other than
 *     `char.character_class` (the primary, taken at creation).
 *
 * On success delegates to `applyLevelUpForClass` which does the
 * mutation (HP gain, slot recompute, ASI gating on per-class level,
 * multiclass proficiency grants on first level in a non-primary
 * class). Out-of-combat only — does not consume an action.
 */
export const handleLevelUpClass: ActionHandler<{ type: 'level_up_class'; className: string }> = (
  ctx,
  action
) => {
  if (ctx.st.combat_active) {
    return { rejected: 'You cannot level up during combat.' };
  }
  if ((ctx.char.level ?? 1) >= 20) {
    return { rejected: `${ctx.char.name} is already at the level cap (20).` };
  }
  // XP threshold: level N → N+1 needs N × 100 XP (same gate as
  // applyLevelUpFromXp).
  if ((ctx.char.xp ?? 0) < (ctx.char.level ?? 1) * 100) {
    const need = (ctx.char.level ?? 1) * 100 - (ctx.char.xp ?? 0);
    return { rejected: `${ctx.char.name} needs ${need} more XP to level up.` };
  }
  const cls = action.className.toLowerCase();
  // Multiclass prereq check only applies on **entry** to a new class
  // (RAW: subsequent levels in an already-taken class don't re-check
  // the ability minimum). canMulticlassInto returns empty for the
  // primary class so this also covers the single-class continuation.
  if (getClassLevel(ctx.char, cls) === 0) {
    const prereqError = canMulticlassInto(ctx.char, cls);
    if (prereqError) {
      return { rejected: prereqError };
    }
  }
  // Mutate a working copy so the level-up narrative composes the same
  // way as the auto-level path.
  const next = { ...ctx.char };
  const narrative = applyLevelUpForClass(next, cls, ctx.context);
  ctx.char = next;
  ctx.narrative = narrative.trim();
  // Mirror applyPartyLevelUps' implicit "uses initiative? no" stance
  // — out-of-combat level-up never advances turn order.
};
