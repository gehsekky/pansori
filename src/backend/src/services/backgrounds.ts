// Background machinery — lookup + character-creation grant logic.
// Existing skill / tool proficiency application lives inline in
// routes/game.ts (the character creation endpoint). This module
// covers the 2024 PHB additions: origin feat auto-grant, ability
// score increase metadata, language grant, supplemental starting
// equipment.
//
// `Background` lives in `shared/types.ts` (synced into BE + FE).

import type { Background, Context } from '../types.js';

/**
 * Look up a background by id in the context. Returns `undefined` if
 * the background isn't registered.
 */
export function getBackground(id: string, context: Context): Background | undefined {
  return context.backgrounds?.find((b) => b.id === id);
}

/**
 * Compose the full proficiency / language / equipment grants from a
 * background. Display-helper for FE flows that summarize what a
 * background gives without mutating a character.
 */
export function backgroundGrants(background: Background): {
  skillProficiencies: string[];
  toolProficiency: string | null;
  language: string | null;
  originFeat: string | null;
  abilityScoreIncreases: string[];
  startingEquipment: string[];
} {
  return {
    skillProficiencies: background.skillProficiencies,
    toolProficiency: background.toolProficiency ?? null,
    language: background.language ?? null,
    originFeat: background.originFeat ?? null,
    abilityScoreIncreases: background.abilityScoreIncreases ?? [],
    startingEquipment: background.startingEquipment ?? [],
  };
}
