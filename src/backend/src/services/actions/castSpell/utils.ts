import type { Spell } from '../../../types.js';
import { pick } from '../../gameEngine.js';

/**
 * Default concentration duration when a spell doesn't pin its own
 * `durationRounds`. 10 rounds ≈ 1 minute of combat time which lines up
 * with the "1 minute" duration on most concentration spells in the
 * SRD. Spells with shorter durations (e.g. Shield's reaction-
 * only 1 round) override via the field.
 */
export function concentrationRoundsFor(spell: { durationRounds?: number } | undefined): number {
  return spell?.durationRounds ?? 10;
}

/**
 * Build the cast-prefix prose for a spell. If `spell.narratives.cast`
 * is populated, picks one entry and substitutes {name}/{spell}/
 * {slotNote}/{target}. Otherwise returns the engine default
 * "{name} casts {spell}{slotNote}".
 *
 * Pool entries are flavor-only — engine appends mechanical resolution
 * (damage tokens, save outcomes, etc.) AFTER this prefix.
 */
export function pickCastPrefix(
  spell: Spell,
  tokens: { name: string; spell: string; slotNote: string; target?: string }
): string {
  const pool = spell.narratives?.cast;
  if (pool && pool.length > 0) {
    return pick(pool)
      .replace(/\{name\}/g, tokens.name)
      .replace(/\{spell\}/g, tokens.spell)
      .replace(/\{slotNote\}/g, tokens.slotNote)
      .replace(/\{target\}/g, tokens.target ?? '');
  }
  return `${tokens.name} casts ${tokens.spell}${tokens.slotNote}`;
}
