// Feat machinery — prerequisite check, passive bonus application,
// take-feat side effects. Feats live as data in `context.featTable`;
// this module is the engine glue. See `contexts/srd/feats.ts` for the
// seed feats and `shared/types.ts` for the `Feat` / `FeatEffect`
// shape.
//
// Most feats are pure passive grants (Tough = +N HP/level) that take
// effect when `applyFeatTakeBonuses` runs. Active feats (Lucky's
// d20 reroll, Sharpshooter's per-attack toggle) need handler-side
// hooks — those land in follow-up PRs as we wire the relevant call
// sites. The infrastructure here is the seam they hook into.

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
 * passive bonuses (HP for `hp-per-level`, ability bonus for half-feats,
 * etc.) applied.
 *
 * Active-effect feats (Lucky, Sharpshooter) only push their id and
 * optional `feat_choices` — their actual behavior fires at the
 * relevant gameplay moment via separate hooks (not implemented yet
 * for the seed feats; this PR establishes the take-time path).
 *
 * `abilityChoice` is required when:
 *   - the feat's `abilityBonus` has `choices` (player must pick).
 * `saveProficiencyChoices` is required when:
 *   - the feat's effect is `save-proficiency` with an empty
 *     `abilities` array (player picks at take time).
 */
export function applyFeatTake(
  char: Character,
  feat: Feat,
  opts: {
    abilityChoice?: AbilityKey;
    saveProficiencyChoices?: AbilityKey[];
    cantripChoices?: string[];
    l1Choice?: string;
    /** Skilled feat — player-chosen skill names (case-sensitive,
     *  matched against context.classSkills entries). */
    skillChoices?: string[];
  } = {}
): { newChar: Character; narrative: string } {
  let next: Character = { ...char, feats: [...(char.feats ?? []), feat.id] };
  const narrativeParts: string[] = [`${next.name} gains the ${feat.name} feat!`];

  // Half-feat ability bonus.
  if (feat.abilityBonus) {
    const ab = 'fixed' in feat.abilityBonus ? feat.abilityBonus.fixed : opts.abilityChoice;
    if (ab) {
      next = { ...next, [ab]: (next[ab] ?? 10) + 1 };
      narrativeParts.push(`+1 ${ab.toUpperCase()} (now ${next[ab]}).`);
      // Record the choice on feat_choices so retroactive recalcs
      // (level-up, refund) know which ability the bonus went to.
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
    case 'hp-per-level': {
      const grant = feat.effect.amount * (next.level ?? 1);
      next = { ...next, max_hp: next.max_hp + grant, hp: next.hp + grant };
      narrativeParts.push(`+${grant} max HP (${feat.effect.amount}/level × ${next.level} levels).`);
      break;
    }
    case 'd20-reroll': {
      // Initialize the per-long-rest pool. Reset path lives in the
      // long-rest handler (future PR).
      next = {
        ...next,
        class_resource_uses: {
          ...(next.class_resource_uses ?? {}),
          [`feat_${feat.id}_uses`]: feat.effect.usesPerLongRest,
        },
      };
      narrativeParts.push(
        `Gains ${feat.effect.usesPerLongRest} luck points (refresh on long rest).`
      );
      break;
    }
    case 'ranged-toggle': {
      // No take-time state change — the toggle fires at attack time.
      // Narrative only.
      narrativeParts.push('Ranged attack bonus available on opt-in.');
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
        // Per-long-rest free-cast token. Defaults to "available" (0
        // means "not yet used"); the cast handler bumps it on use.
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
    case 'save-proficiency': {
      // Either explicit abilities (Resilient-fixed variants) or
      // player-chosen via opts.saveProficiencyChoices (Resilient).
      const chosen =
        feat.effect.abilities.length > 0
          ? feat.effect.abilities
          : (opts.saveProficiencyChoices ?? []);
      if (chosen.length > 0) {
        next = {
          ...next,
          feat_choices: {
            ...(next.feat_choices ?? {}),
            [feat.id]: {
              ...(next.feat_choices?.[feat.id] ?? {}),
              saveProficiencies: chosen,
            },
          },
        };
        narrativeParts.push(`Save proficiency: ${chosen.map((a) => a.toUpperCase()).join(', ')}.`);
      }
      break;
    }
    case 'sentinel-react': {
      // No take-time state change — the reaction window fires at
      // ally-hit time. Narrative only.
      narrativeParts.push('Reaction available when an enemy hits an ally within 5 ft of you.');
      break;
    }
    case 'alert': {
      // No take-time state change — the hooks fire at
      // `buildInitiativeOrder` (prof bonus to init) and at the
      // combat-start surprise check (immunity). Narrative only.
      narrativeParts.push('+prof bonus to Initiative rolls; immune to the Surprised condition.');
      break;
    }
    case 'savage-attacker': {
      // No take-time state change — the damage-reroll hook fires in
      // `attack/index.ts` once per turn. Narrative only.
      narrativeParts.push('Once per turn, weapon-damage hits reroll and take the higher result.');
      break;
    }
    case 'speed-bonus': {
      // No take-time state change — `effectiveSpeed` adds the bonus
      // every time it's called. Narrative records the bonus for the
      // level-up log.
      narrativeParts.push(`+${feat.effect.bonusFeet} ft speed.`);
      break;
    }
    case 'war-caster': {
      // No take-time state change — `checkConcentration` reads
      // `char.feats` and rolls 2d20 keep-higher when War Caster is
      // present. Narrative only.
      narrativeParts.push('Advantage on CON saves to maintain concentration when damaged.');
      break;
    }
    case 'heavy-armor-master': {
      // No take-time state change — `computeEnemyAttack` reads
      // `char.feats` and subtracts 3 from damage when in heavy
      // armor and not incapacitated. Narrative only.
      narrativeParts.push(
        'Heavy armor attacks against you deal 3 less damage (while not incapacitated).'
      );
      break;
    }
    case 'tavern-brawler': {
      // No take-time state change — `unarmedDamage` reads the
      // `tavernBrawler` flag (threaded from the attack handler).
      // Narrative only.
      narrativeParts.push('Unarmed strikes now roll 1d4 + STR mod instead of 1 + STR mod.');
      break;
    }
    case 'gwm-bonus-damage': {
      // No take-time state change — the attack handler reads
      // `char.feats` and adds prof bonus damage on heavy-weapon
      // hits, gated by `turn_actions.gwm_used` for once-per-turn.
      narrativeParts.push('Heavy-weapon hits deal +prof bonus damage (once per turn).');
      break;
    }
    case 'skill-proficiencies': {
      // Player picks N skills (where N = feat.effect.count, 3 for
      // Skilled). Merge into char.skill_proficiencies, deduping
      // against existing entries so retaking via a different feat
      // doesn't double-stack.
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
    case 'observant': {
      // No take-time state change — `partyDetectsTrap` reads
      // `char.feats` and adds +5 to passive Perception.
      narrativeParts.push('Passive Perception and Investigation increase by 5.');
      break;
    }
    case 'crossbow-expert': {
      // No take-time state change — toHit.ts reads `char.feats`
      // and suppresses the ranged-in-melee disadvantage when the
      // weapon is a crossbow.
      narrativeParts.push('No disadvantage on crossbow shots within 5 ft of an enemy.');
      break;
    }
    case 'polearm-master': {
      // No take-time state change — the `polearm_butt_end` action
      // handler reads `char.feats` and gates on it. Narrative only.
      narrativeParts.push(
        'After Attack with a polearm: bonus-action butt-end strike (1d4 + ability mod).'
      );
      break;
    }
    case 'healer': {
      // No take-time state change — the `use_healer_kit` action
      // handler reads `char.feats` and gates on it. Narrative only.
      narrativeParts.push("Action: spend a Healer's Kit charge to heal 1d6 + 4 + prof bonus HP.");
      break;
    }
    case 'dual-wielder': {
      // No take-time state change — gameEngine choice-gen and
      // twoWeaponAttack handler read `char.feats` to loosen the
      // light-only off-hand requirement.
      narrativeParts.push('TWF off-hand can be any one-handed melee weapon (not just Light).');
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

/**
 * Reset per-long-rest feat resources to their max values. Walks the
 * character's feats, looks each one up in the context's feat table,
 * and resets the matching `class_resource_uses` entry for any feat
 * whose effect carries a per-long-rest pool.
 *
 * Resets handled:
 *   - `d20-reroll` (Lucky): `feat_<id>_uses` ← usesPerLongRest.
 *   - `extra-cantrips-and-l1` (Magic Initiate): `magic_initiate_l1_used`
 *     ← 0 (free-cast available again).
 *
 * Called from `handleLongRest`. Returns a new `class_resource_uses`
 * record; callers merge it into the rest's overall update. Feats
 * with no per-rest pool are no-ops.
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
    if (feat.effect.kind === 'd20-reroll') {
      next = { ...next, [`feat_${feat.id}_uses`]: feat.effect.usesPerLongRest };
    } else if (feat.effect.kind === 'extra-cantrips-and-l1') {
      // Reset the free-cast token. Single shared token for all
      // Magic Initiate variants since RAW grants only one (you can't
      // double-dip by taking Magic Initiate twice).
      next = { ...next, magic_initiate_l1_used: 0 };
    }
  }
  return next;
}
