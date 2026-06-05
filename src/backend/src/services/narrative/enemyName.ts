// Enemy-name tokens for combat prose, with proper-noun awareness.
//
// Most monster names are common nouns and read with a definite article in
// prose ("the Crypt Ghoul", "The Crypt Ghoul reels"); a few are proper nouns
// — named individuals like "Captain Riese" or "Aldric the Merchant" — that
// take no article ("Captain Riese reels", not "the Captain Riese"). Enemies
// may declare `proper_noun` explicitly; otherwise we infer it from the name
// shape, which catches titled names, "<Name> the <Role>" forms, and
// parenthetical descriptors. Single-word proper names that fit none of those
// patterns (e.g. "Dusk") set the flag.

// Leading honorifics / titles that mark a proper-noun individual. Matched only
// as the FIRST word, so a common-noun monster whose *type* ends in one of these
// (e.g. "Bandit Captain", "Crypt Lord") is unaffected.
const TITLE_WORDS = new Set([
  'captain',
  'sergeant',
  'sir',
  'lady',
  'lord',
  'dame',
  'master',
  'mistress',
  'innkeeper',
  'sister',
  'brother',
  'father',
  'mother',
  'saint',
  'old',
  'king',
  'queen',
  'baron',
  'baroness',
  'duke',
  'duchess',
  'elder',
]);

/**
 * Whether an enemy name should be treated as a proper noun (no article). An
 * explicit `properNoun` flag wins; otherwise infer from the name's shape.
 */
export function isProperNounName(name: string, properNoun?: boolean): boolean {
  if (properNoun !== undefined) return properNoun;
  if (/\bthe\b/i.test(name)) return true; // "Aldric the Merchant"
  if (name.includes('(')) return true; // "Old Elise (village elder)"
  const first = name.split(/\s+/)[0]?.toLowerCase() ?? '';
  return TITLE_WORDS.has(first); // "Captain Riese", "Sister Maren"
}

/**
 * Fill enemy-name tokens in a narrative fragment:
 *   - `{enemy}`     → the bare name (possessives / mentions an author already
 *                     articled by hand, e.g. "the {enemy}").
 *   - `{the_enemy}` → article-aware, lower-case ("the Crypt Ghoul"); just the
 *                     name for proper nouns.
 *   - `{The_enemy}` → article-aware, capitalized for sentence starts ("The
 *                     Crypt Ghoul"); just the name for proper nouns.
 * Non-enemy tokens ({xp}, {target}, …) are left untouched for the caller.
 */
export function fillEnemyTokens(
  template: string,
  enemy: { name: string; proper_noun?: boolean }
): string {
  const proper = isProperNounName(enemy.name, enemy.proper_noun);
  const lower = proper ? enemy.name : `the ${enemy.name}`;
  const upper = proper ? enemy.name : `The ${enemy.name}`;
  return template
    .replace(/\{The_enemy\}/g, upper)
    .replace(/\{the_enemy\}/g, lower)
    .replace(/\{enemy\}/g, enemy.name);
}
