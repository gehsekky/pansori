// Feat machinery — prerequisite check, take-feat side effects, and
// long-rest resource refresh. Feats live as data in
// `context.featTable`; this module is the engine glue. See
// `contexts/srd/feats.ts` for the seed feats and `shared/types.ts`
// for the `Feat` / `FeatEffect` shape.
//
// Pansori is an SRD-only build; the feat catalog is limited to the
// Origin Feats in SRD 5.2.1 (Alert, Magic Initiate × 3 spell-list
// variants, Savage Attacker, Skilled). PHB-only feats were removed
// in the SRD-only refactor — see docs/srd-only-audit.md.

import type { AbilityKey, Character, Context, Feat } from '../types.js';

/**
 * Check whether `char` meets the prerequisites for `feat`. Returns
 * an empty string on success, or a human-readable reason string on
 * failure. Callers can short-circuit on truthy returns.
 *
 * Modeled prereqs: `minLevel`, `minAbilityScores`, `classes` (any-of
 * match against the PC's class), `requiredFeat`. `other` is a list
 * of human-readable prereq strings the engine doesn't model — they
 * always pass here; UI surfaces them so the player knows.
 */
export function canTakeFeat(char: Character, feat: Feat): string {
  // Already have this feat? Most feats can't be taken twice.
  if ((char.feats ?? []).includes(feat.id)) {
    return `${char.name} already has the ${feat.name} feat.`;
  }
  const p = feat.prerequisites;
  if (!p) return '';
  if (p.minLevel !== undefined && (char.level ?? 1) < p.minLevel) {
    return `${feat.name} requires character level ${p.minLevel} (${char.name} is level ${char.level ?? 1}).`;
  }
  if (p.minAbilityScores) {
    for (const [ab, min] of Object.entries(p.minAbilityScores)) {
      const score = (char[ab as AbilityKey] ?? 10) as number;
      if (score < (min ?? 0)) {
        return `${feat.name} requires ${ab.toUpperCase()} ${min} (${char.name}'s ${ab.toUpperCase()} is ${score}).`;
      }
    }
  }
  if (p.classes && p.classes.length > 0) {
    const cls = char.character_class?.toLowerCase();
    const allowed = p.classes.map((c) => c.toLowerCase());
    if (!allowed.includes(cls)) {
      return `${feat.name} requires class: ${p.classes.join(' / ')} (${char.name} is a ${char.character_class}).`;
    }
  }
  if (p.requiredFeat) {
    if (!(char.feats ?? []).includes(p.requiredFeat)) {
      return `${feat.name} requires the ${p.requiredFeat} feat first.`;
    }
  }
  return '';
}

/**
 * Apply the take-time side effects of a feat to `char`. Returns a
 * new Character with the feat's id pushed onto `feats[]` plus any
 * passive bonuses applied.
 *
 * `abilityChoice` is required when the feat's `abilityBonus` has
 * `choices`. `cantripChoices` / `l1Choice` are required for Magic
 * Initiate. `skillChoices` is required for Skilled.
 */
export function applyFeatTake(
  char: Character,
  feat: Feat,
  opts: {
    abilityChoice?: AbilityKey;
    cantripChoices?: string[];
    l1Choice?: string;
    /** Skilled feat — player-chosen skill names (case-sensitive,
     *  matched against context.classSkills entries). */
    skillChoices?: string[];
  } = {}
): { newChar: Character; narrative: string } {
  let next: Character = { ...char, feats: [...(char.feats ?? []), feat.id] };
  const narrativeParts: string[] = [`${next.name} gains the ${feat.name} feat!`];

  // Half-feat / epic-boon ability bonus. Epic boons raise an ability by 1 to
  // a maximum of 30; ordinary half-feats cap at the usual 20.
  if (feat.abilityBonus) {
    const ab = 'fixed' in feat.abilityBonus ? feat.abilityBonus.fixed : opts.abilityChoice;
    if (ab) {
      const cap = feat.category === 'epic-boon' ? 30 : 20;
      next = { ...next, [ab]: Math.min(cap, (next[ab] ?? 10) + 1) };
      narrativeParts.push(`+1 ${ab.toUpperCase()} (now ${next[ab]}).`);
      next = {
        ...next,
        feat_choices: {
          ...(next.feat_choices ?? {}),
          [feat.id]: { ...(next.feat_choices?.[feat.id] ?? {}), abilityBonus: ab },
        },
      };
    }
  }

  // Effect-specific take-time application.
  switch (feat.effect.kind) {
    case 'alert': {
      // No take-time state change — the hooks fire at
      // `buildInitiativeOrder` (prof bonus to init) and at the
      // combat-start surprise check (immunity).
      narrativeParts.push('+prof bonus to Initiative rolls; immune to the Surprised condition.');
      break;
    }
    case 'savage-attacker': {
      // No take-time state change — the damage-reroll hook fires in
      // `attack/index.ts` once per turn.
      narrativeParts.push('Once per turn, weapon-damage hits reroll and take the higher result.');
      break;
    }
    case 'extra-cantrips-and-l1': {
      // Magic Initiate (Arcane / Divine / Primal). Player picks N
      // cantrips + 1 L1 spell from the matching list; we add them to
      // `spells_known`, record the L1 id for the cast-handler to
      // identify, and seed the per-long-rest free-cast token.
      const cantrips = opts.cantripChoices ?? [];
      const l1 = opts.l1Choice;
      const grants: string[] = [];
      const existing = new Set(next.spells_known ?? []);
      for (const c of cantrips) {
        if (!existing.has(c)) {
          existing.add(c);
          grants.push(c);
        }
      }
      if (l1 && !existing.has(l1)) {
        existing.add(l1);
        grants.push(l1);
      }
      next = {
        ...next,
        spells_known: [...existing],
        class_resource_uses: {
          ...(next.class_resource_uses ?? {}),
          magic_initiate_l1_used: 0,
        },
      };
      if (l1) {
        next = {
          ...next,
          feat_choices: {
            ...(next.feat_choices ?? {}),
            [feat.id]: {
              ...(next.feat_choices?.[feat.id] ?? {}),
              magicInitiateL1: l1,
            },
          },
        };
      }
      if (grants.length > 0) {
        narrativeParts.push(`Learns ${grants.join(', ')} from the ${feat.effect.spellList} list.`);
      } else {
        narrativeParts.push(
          `May learn ${feat.effect.cantripCount} cantrips + ${feat.effect.l1Count} L1 spell from the ${feat.effect.spellList} list (no choices supplied yet).`
        );
      }
      break;
    }
    case 'skill-proficiencies': {
      // Skilled — player picks N skills (N = 3 for SRD Skilled).
      // Merge into char.skill_proficiencies, deduping.
      const chosen = opts.skillChoices ?? [];
      const existing = new Set(next.skill_proficiencies ?? []);
      const granted: string[] = [];
      for (const s of chosen) {
        if (!existing.has(s)) {
          existing.add(s);
          granted.push(s);
        }
      }
      next = { ...next, skill_proficiencies: [...existing] };
      if (granted.length > 0) {
        narrativeParts.push(`Proficient in: ${granted.join(', ')}.`);
      } else {
        narrativeParts.push(
          `May choose ${feat.effect.count} skill proficiencies (no choices supplied yet).`
        );
      }
      break;
    }
    case 'epic-boon': {
      // Epic boons (L19+). The +1 ability bump is already applied above; here
      // we apply each boon's take-time grant. Most boons' signature benefit is
      // a runtime hook (attack/cast/reaction/resistance) that reads
      // `char.feats`, so they need no take-time state.
      switch (feat.effect.boon) {
        case 'truesight':
          next = { ...next, truesight_ft: 60 };
          narrativeParts.push('Gains Truesight out to 60 feet.');
          break;
        case 'combat-prowess':
          narrativeParts.push('Peerless Aim: once per turn, a miss can become a hit.');
          break;
        case 'dimensional-travel':
          narrativeParts.push('Blink Steps: teleport 30 ft after the Attack or Magic action.');
          break;
        case 'fate':
          narrativeParts.push('Improve Fate: ±2d4 to a D20 Test within 60 ft, once per rest.');
          break;
        case 'irresistible-offense':
          narrativeParts.push(
            'Overcome Defenses (B/P/S ignores Resistance) and Overwhelming Strike on a natural 20.'
          );
          break;
        case 'spell-recall':
          narrativeParts.push('Free Casting: a level 1–4 slot may not be expended (1d4 per cast).');
          break;
        case 'night-spirit':
          narrativeParts.push('Merge with Shadows and Shadowy Form while in Dim Light or Darkness.');
          break;
      }
      break;
    }
  }
  return { newChar: next, narrative: narrativeParts.join(' ') };
}

/**
 * Look up a feat by id in the context's feat table. Returns
 * `undefined` if the feat isn't registered.
 */
export function getFeat(featId: string, context: Context): Feat | undefined {
  return context.featTable?.[featId];
}

// ─── Epic Boon runtime helpers ───────────────────────────────────────────

/** SRD Boon of Irresistible Offense (epic) — true when the PC holds the boon. */
export function hasIrresistibleOffense(char: Character): boolean {
  return (char.feats ?? []).includes('boon_irresistible_offense');
}

/**
 * SRD Boon of Irresistible Offense — Overcome Defenses: the holder's
 * bludgeoning, piercing, and slashing damage ignores Resistance. Returns true
 * when the boon applies to this damage type.
 */
export function overcomeDefensesApplies(char: Character, damageType: string | undefined): boolean {
  return (
    hasIrresistibleOffense(char) &&
    damageType !== undefined &&
    ['bludgeoning', 'piercing', 'slashing'].includes(damageType)
  );
}

/**
 * SRD Boon of Irresistible Offense — Overwhelming Strike: on a natural 20, deal
 * extra damage (same type as the attack) equal to the ability score the boon
 * increased. Returns 0 when the boon isn't held or the d20 wasn't a 20.
 */
export function overwhelmingStrikeDamage(char: Character, naturalRoll: number): number {
  if (!hasIrresistibleOffense(char) || naturalRoll !== 20) return 0;
  const ab = char.feat_choices?.boon_irresistible_offense?.abilityBonus;
  return ab ? (char[ab] ?? 10) : 0;
}

/**
 * Reset per-long-rest feat resources to their max values. Walks the
 * character's feats, looks each one up in the context's feat table,
 * and resets the matching `class_resource_uses` entry for any feat
 * whose effect carries a per-long-rest pool.
 *
 * SRD-only build: the only feat with a per-rest pool is Magic
 * Initiate (the L1 free-cast token). Resets to 0 = available.
 */
export function resetFeatLongRestResources(
  char: Character,
  context: Context,
  resourceUses: Record<string, number>
): Record<string, number> {
  let next = resourceUses;
  for (const featId of char.feats ?? []) {
    const feat = getFeat(featId, context);
    if (!feat) continue;
    if (feat.effect.kind === 'extra-cantrips-and-l1') {
      // Reset the free-cast token. Single shared token for all
      // Magic Initiate variants since RAW grants only one (you can't
      // double-dip by taking Magic Initiate twice).
      next = { ...next, magic_initiate_l1_used: 0 };
    }
  }
  return next;
}
