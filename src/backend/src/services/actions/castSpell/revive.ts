import { REINCARNATE_SPECIES, SRD_SPECIES } from '../../../campaignData/srd/index.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { d } from '../../rulesEngine.js';
import { pickCastPrefix } from './utils.js';

/**
 * Revive-spell branch. Targets a *dead* party member identified by
 * `targetCharId`, validates the death-window via `died_at_round`,
 * restores HP, and clears `dead` / `stable` / `death_saves` /
 * `died_at_round`.
 *
 * Precast has already paid the slot, action economy, and material
 * cost (the 300 gp diamond for Revivify, etc.) before we get here.
 * If the gate fails, the slot is NOT refunded — RAW: the diamond
 * is consumed even on a failed Revivify cast, and the slot is gone
 * either way.
 *
 * Returns `true` when handled (caller returns from the cast pipeline).
 * Returns `false` when the spell isn't a revive spell.
 */
export function runReviveSpell(
  ctx: ActionContext,
  action: { type: 'cast_spell'; spellId: string; slotLevel: number; targetCharId?: string },
  spell: Spell,
  slotNote: string
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (!spell.revive) return false;

  const targetCharId = action.targetCharId;
  // Revive needs an explicit dead PC target. The default `char`
  // is the caster — never revive yourself (you can't cast while
  // dead). Surface a clear error rather than silently succeeding.
  if (!targetCharId || targetCharId === char.id) {
    ctx.narrative =
      (ctx.narrative ?? '') +
      `${spell.name} needs a fallen ally as its target — name the body to be raised.`;
    return true;
  }
  const target = ctx.st.characters.find((c) => c.id === targetCharId);
  if (!target) {
    ctx.narrative = (ctx.narrative ?? '') + `${spell.name} fails — no such ally in the party.`;
    return true;
  }
  if (!target.dead) {
    ctx.narrative =
      (ctx.narrative ?? '') +
      `${target.name} is not dead — ${spell.name} has no effect on the living.`;
    return true;
  }

  // Death-window check. `died_at_round` is the combat-round counter
  // at the moment of death. We compare against `st.round` — both fields
  // tick during combat. Out-of-combat deaths set `died_at_round` to the
  // last known round (typically 0 for a brand-new run); Revivify's
  // 10-round window is intentionally tight enough that it usually
  // requires casting *during the same fight* — which matches RAW
  // ("within 1 minute of dying").
  //
  // Long-window spells (Raise Dead's 10 days, Resurrection's 100 years,
  // True Resurrection's 200 years) set `windowRounds` to a sentinel
  // ≥ 10000 — we treat that as "no in-combat limit" since pansori
  // doesn't track day-grained timelines yet.
  const diedAt = target.died_at_round ?? 0;
  const currentRound = ctx.st.round ?? 0;
  const elapsed = currentRound - diedAt;
  if (spell.revive.windowRounds < 10000 && elapsed > spell.revive.windowRounds) {
    ctx.narrative =
      (ctx.narrative ?? '') +
      `${target.name} died too long ago — ${spell.name}'s window (${spell.revive.windowRounds} rounds) has passed.`;
    return true;
  }

  // Restore HP. Numeric = exact value (Revivify: 1). 'full' = max
  // (Resurrection / True Resurrection).
  const restoredHp = spell.revive.hpRestored === 'full' ? target.max_hp : spell.revive.hpRestored;
  // SRD revive penalty — Raise Dead and Resurrection impose a −4 D20
  // penalty that decays on long rest. True Resurrection (whole-soul
  // restoration), Revivify (still warm), and Reincarnate (new body)
  // all skip the penalty per RAW.
  const imposesPenalty = spell.id === 'raise_dead' || spell.id === 'resurrection';
  // SRD Reincarnate — the new body's species is chosen by rolling
  // 1d10 on the SRD reincarnation table; 1 = "Roll again", so we
  // pick uniformly from the 9 concrete species. The new species'
  // traits (darkvision, resistances, innate cantrips, breath
  // weapon, etc.) derive live from `SRD_SPECIES[char.species]` at
  // their read sites, so swapping the field propagates the change
  // without a separate trait-apply pass. Species-specific resource
  // flags from the original form are stale once the species is
  // swapped — drop them so the new body starts clean.
  let speciesSwapNote = '';
  let newSpecies = target.species;
  let nextResourceUses = target.class_resource_uses;
  if (spell.id === 'reincarnate') {
    const idx = d(REINCARNATE_SPECIES.length) - 1;
    newSpecies = REINCARNATE_SPECIES[idx];
    if (target.class_resource_uses) {
      const {
        relentless_endurance_used: _orcFlag,
        tiefling_rebuke_used: _tieflingFlag,
        breath_weapon_used: _dragonFlag,
        ...rest
      } = target.class_resource_uses;
      void _orcFlag;
      void _tieflingFlag;
      void _dragonFlag;
      nextResourceUses = rest;
    }
    const newSpeciesName = SRD_SPECIES[newSpecies]?.name ?? newSpecies;
    speciesSwapNote = ` ${target.name} returns as a ${newSpeciesName}.`;
  }
  const revivedTarget = {
    ...target,
    hp: Math.min(target.max_hp, Math.max(1, restoredHp)),
    dead: false,
    stable: false,
    death_saves: { successes: 0, failures: 0 },
    died_at_round: undefined,
    species: newSpecies,
    class_resource_uses: nextResourceUses ?? {},
    ...(imposesPenalty ? { revive_d20_penalty: 4 } : {}),
  };

  ctx.st = {
    ...ctx.st,
    characters: ctx.st.characters.map((c) => (c.id === target.id ? revivedTarget : c)),
    // Sync the grid entity if the revived PC is on the battlefield.
    // After death the entity is typically rendered as a faded skull
    // with hp=0; restoring hp + clearing the dead flag (entities don't
    // carry a `dead` field, just hp <= 0) lets it render alive again.
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === target.id && !e.isEnemy ? { ...e, hp: revivedTarget.hp } : e
    ),
  };

  composeNow(ctx, {
    kind: 'spell_utility',
    prose:
      pickCastPrefix(spell, {
        name: char.name,
        spell: spell.name,
        slotNote,
        target: target.name,
      }) +
      ` — ${target.name} draws a ragged breath and returns to life (${revivedTarget.hp}/${target.max_hp} HP).${speciesSwapNote}`,
  });

  return true;
}
