import type { ActionHandler } from '../types.js';
import { handleBarbarianFeature } from './barbarian.js';
import { handleCasterFeature } from './casters.js';
import { handleClericFeature } from './cleric.js';
import { handleDruidFeature } from './druid.js';
import { handleFighterFeature } from './fighter.js';
import { handleMonkFeature } from './monk.js';
import { handlePaladinRangerBardFeature } from './paladinRangerBard.js';
import { handleRogueFeature } from './rogue.js';
import { handleSpeciesFeature } from './species.js';

/**
 * `use_class_feature`: per-feature dispatch — the catch-all for every
 * class-feature/subclass-feature/species-feature that doesn't already
 * have its own action type.
 *
 * Each per-class handler returns `true` if it matched the action's
 * featureId (caller stops); `false` to fall through to the next
 * class's handler. An unknown featureId reaches the bottom and gets
 * the "Unknown class feature" fallback.
 *
 * Per-class file layout (services/actions/classFeature/):
 *   barbarian.ts        — Rage, Reckless Attack, Frenzy
 *   fighter.ts          — Action Surge, Tactical Master, Second Wind,
 *                         Battle Master Maneuvers, Remarkable Athlete
 *   rogue.ts            — Cunning Action (Dash/Disengage/Hide),
 *                         Cunning Strike
 *   monk.ts             — Flurry of Blows, Patient Defense, Step of
 *                         the Wind, Stunning Strike, Shadow Arts
 *   druid.ts            — Wild Shape, Dismiss Wild Shape, Moon Healing
 *   casters.ts          — Sorcerer Metamagic, Warlock Invocations,
 *                         Archfey Fey Presence, Abjurer Arcane Ward
 *   cleric.ts           — Divine Spark, Turn Undead, Sear Undead,
 *                         Preserve Life, Guided Strike
 *   paladinRangerBard.ts — Bardic Inspiration, Cutting Words,
 *                          Colossus Slayer, Command Companion,
 *                          Sacred Weapon, Vow of Enmity, Abjure Enemy
 *   species.ts          — Orc Adrenaline Rush, Goliath Large Form,
 *                         Dragonborn Breath Weapon
 */
export const handleUseClassFeature: ActionHandler<{
  type: 'use_class_feature';
  featureId: string;
}> = (ctx, action) => {
  const fid = action.featureId;

  if (handleBarbarianFeature(ctx, fid)) return;
  if (handleFighterFeature(ctx, fid)) return;
  if (handleRogueFeature(ctx, fid)) return;
  if (handleMonkFeature(ctx, fid)) return;
  if (handleDruidFeature(ctx, fid)) return;
  if (handleCasterFeature(ctx, fid)) return;
  if (handleClericFeature(ctx, fid)) return;
  if (handlePaladinRangerBardFeature(ctx, fid)) return;
  if (handleSpeciesFeature(ctx, fid)) return;

  ctx.narrative = `Unknown class feature: ${fid}.`;
};
