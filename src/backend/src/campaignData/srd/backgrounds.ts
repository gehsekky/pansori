import type { Background } from '../../types.js';

// Shared SRD-style character backgrounds.
//
// The mechanical core of a background — skill proficiencies, tool proficiency,
// the +1/+1/+1 ability options, the origin feat, and the granted language — is
// the same regardless of campaign. Campaigns previously duplicated all four
// backgrounds inline, which drifted: the three campaign contexts had stripped
// versions (no tool/feat/ability/language) while sandbox carried the full
// 2024 set. This registry is the single canonical source.
//
// Only the *flavor* (`desc` and the feature's `featureDesc`) is campaign-
// specific. A context builds its `backgrounds` list with `srdBackgrounds()`,
// passing per-id flavor overrides; the mechanics always come from here:
//
//   backgrounds: srdBackgrounds({
//     soldier: { desc: 'You served with the Pine Wardens…', featureDesc: '…' },
//   })
//
// Descriptions are pansori's own words (see CLAUDE.md). The skill/tool grants
// follow the SRD backgrounds; origin feats use the SRD origin-feat list.
export const SRD_BACKGROUNDS: Record<string, Background> = {
  soldier: {
    id: 'soldier',
    name: 'Soldier',
    desc: 'You have served in an organized military force.',
    skillProficiencies: ['athletics', 'intimidation'],
    toolProficiency: 'Gaming set',
    feature: 'Military Rank',
    featureDesc: 'Soldiers and veterans recognize your authority.',
    abilityScoreIncreases: ['str', 'dex', 'con'],
    originFeat: 'savage_attacker',
    language: 'Common',
  },
  criminal: {
    id: 'criminal',
    name: 'Criminal',
    desc: 'You have a history of breaking the law.',
    skillProficiencies: ['stealth', 'deception'],
    toolProficiency: "Thieves' Tools",
    feature: 'Criminal Contact',
    featureDesc: 'You have a contact who can help you find information or fences stolen goods.',
    abilityScoreIncreases: ['dex', 'con', 'int'],
    originFeat: 'alert',
    language: "Thieves' Cant",
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    desc: 'You spent years learning the lore of the multiverse.',
    skillProficiencies: ['arcana', 'history'],
    toolProficiency: "Calligrapher's Tools",
    feature: 'Researcher',
    featureDesc: 'If you do not know information, you know where to find it.',
    abilityScoreIncreases: ['con', 'int', 'wis'],
    // SRD: Sage gets Magic Initiate (Wizard / Arcane list). Cantrips +
    // the L1 choice come from the FE spell picker; the BE re-validates them.
    originFeat: 'magic_initiate_arcane',
    language: 'Common',
  },
  acolyte: {
    id: 'acolyte',
    name: 'Acolyte',
    desc: 'You have spent your life in service to a temple.',
    skillProficiencies: ['religion', 'insight'],
    toolProficiency: "Calligrapher's Tools",
    feature: 'Shelter of the Faithful',
    featureDesc: 'You and your companions can receive healing and care at temples.',
    abilityScoreIncreases: ['int', 'wis', 'cha'],
    // SRD: Acolyte gets Magic Initiate (Cleric / Divine list).
    originFeat: 'magic_initiate_divine',
    language: 'Celestial',
  },
};

/** Every SRD background id, for contexts that want the full set. */
export const ALL_SRD_BACKGROUND_IDS: string[] = Object.keys(SRD_BACKGROUNDS);

/**
 * Build a context's `backgrounds` list from the canonical SRD backgrounds,
 * applying optional per-id flavor overrides (`desc` / `featureDesc`). The
 * mechanical fields (skills, tool, feat, ability options, language, feature
 * name) always come from `SRD_BACKGROUNDS`, so they can't drift between
 * campaigns. A background with no override is returned by reference.
 */
export function srdBackgrounds(
  flavor: Record<string, { desc?: string; featureDesc?: string }> = {}
): Background[] {
  return Object.values(SRD_BACKGROUNDS).map((bg) => {
    const f = flavor[bg.id];
    if (!f || (f.desc === undefined && f.featureDesc === undefined)) return bg;
    return {
      ...bg,
      ...(f.desc !== undefined ? { desc: f.desc } : {}),
      ...(f.featureDesc !== undefined ? { featureDesc: f.featureDesc } : {}),
    };
  });
}
