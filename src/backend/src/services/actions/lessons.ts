import type { Character, Context } from '../../types.js';
import { applyFeatTake, getFeat } from '../feats.js';
import { lessonsFeatOptions, pendingLessonsFeats } from '../invocations.js';
import type { ActionHandler } from './types.js';
import { updatePcActor } from './actor.js';

// SRD Lessons of the First Ones (Warlock invocation) — each learning grants an
// Origin feat. The feat is taken without its sub-choices; Magic Initiate's
// spells are then picked one at a time (`choose_feat_spell`) and Skilled's
// skills through the shared bonus-skill grant (see bonusSkills.ts).

/** An open Magic Initiate spell pick from a feat taken through Lessons. */
export interface FeatSpellPick {
  featId: string;
  featName: string;
  level: 0 | 1;
  options: string[];
}

/** The next open spell pick for each Magic Initiate taken through Lessons. */
export function pendingFeatSpellPicks(char: Character, context: Context): FeatSpellPick[] {
  const out: FeatSpellPick[] = [];
  const known = new Set(char.spells_known ?? []);
  for (const featId of char.lessons_feats ?? []) {
    const feat = getFeat(featId, context);
    if (!feat || feat.effect.kind !== 'extra-cantrips-and-l1') continue;
    const { spellList, cantripCount, l1Count } = feat.effect;
    const picked = char.feat_choices?.[featId];
    const cantrips = picked?.magicInitiateCantrips ?? [];
    const level: 0 | 1 | null =
      cantrips.length < cantripCount ? 0 : l1Count > 0 && !picked?.magicInitiateL1 ? 1 : null;
    if (level === null) continue;
    const options = Object.values(context.spellTable ?? {})
      .filter(
        (s) => s.level === level && (s.spellList ?? []).includes(spellList) && !known.has(s.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => s.id);
    if (options.length > 0) out.push({ featId, featName: feat.name, level, options });
  }
  return out;
}

/** `choose_lessons_feat`: take the Origin feat for one Lessons learning. */
export const handleChooseLessonsFeat: ActionHandler<{
  type: 'choose_lessons_feat';
  featId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take a feat.' };
  const { char } = ctx.actor;
  if (ctx.st.combat_active) return { rejected: 'Choose your feat out of combat.' };
  if (pendingLessonsFeats(char) <= 0) {
    return { rejected: 'You have no Lessons of the First Ones feat to choose.' };
  }
  if (!lessonsFeatOptions(char).includes(action.featId)) {
    return { rejected: `${action.featId} isn't an Origin feat you can take.` };
  }
  const feat = getFeat(action.featId, ctx.context);
  if (!feat) return { rejected: `Unknown feat: ${action.featId}.` };
  const { newChar } = applyFeatTake(char, feat);
  updatePcActor(ctx, {
    ...newChar,
    lessons_feats: [...(char.lessons_feats ?? []), feat.id],
  });
  const followUp =
    feat.effect.kind === 'extra-cantrips-and-l1'
      ? ' Choose its spells next.'
      : feat.effect.kind === 'skill-proficiencies'
        ? ' Choose its skills next.'
        : '';
  ctx.narrative = `${char.name} learns from the First Ones — the ${feat.name} feat.${followUp}`;
};

/** `choose_feat_spell`: one Magic Initiate spell for a feat taken through Lessons. */
export const handleChooseFeatSpell: ActionHandler<{
  type: 'choose_feat_spell';
  featId: string;
  spellId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can learn spells.' };
  const { char } = ctx.actor;
  const pick = pendingFeatSpellPicks(char, ctx.context).find((p) => p.featId === action.featId);
  if (!pick) return { rejected: 'That feat has no spell left to choose.' };
  if (!pick.options.includes(action.spellId)) {
    return { rejected: `${action.spellId} isn't a spell ${pick.featName} can teach you.` };
  }
  const prev = char.feat_choices?.[pick.featId] ?? {};
  const choice =
    pick.level === 0
      ? { ...prev, magicInitiateCantrips: [...(prev.magicInitiateCantrips ?? []), action.spellId] }
      : { ...prev, magicInitiateL1: action.spellId };
  updatePcActor(ctx, {
    spells_known: [...(char.spells_known ?? []), action.spellId],
    feat_choices: { ...(char.feat_choices ?? {}), [pick.featId]: choice },
  });
  const name = ctx.context.spellTable?.[action.spellId]?.name ?? action.spellId;
  ctx.narrative = `${char.name} learns ${name} (${pick.featName}).`;
};
