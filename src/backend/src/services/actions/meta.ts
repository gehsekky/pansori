import type { AbilityKey } from '../../types.js';
import type { ActionHandler } from './types.js';
import { preparedSpellsCap } from '../gameEngine.js';

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
  if (action.subclass === 'draconic' && next.character_class.toLowerCase() === 'sorcerer') {
    next.max_hp += next.level;
    next.hp += next.level;
    narrative += ` Draconic Resilience: +${next.level} max HP (now ${next.hp}/${next.max_hp}).`;
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
