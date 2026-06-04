import { BEAST_FORMS, availableBeastForms } from '../../../campaignData/srd/index.js';
import type { Character, Spell } from '../../../types.js';
import type { ActionContext } from '../types.js';
import { concentrationRoundsFor } from './utils.js';

/**
 * SRD shapeshift spells — Shapechange (self) and Animal Shapes (the party).
 * Puts the target(s) into a chosen BeastForm by reusing the `wild_shaped`
 * machinery (the form's attack/AC/traits apply in combat, class-agnostic), grants
 * the form's HP as Temp HP, and binds the transformation to the caster's
 * concentration via `shapeshift_spell` (so `breakConcentration` / combat-end
 * revert exactly these and leave a druid's own Wild Shape alone).
 *
 * Beasts cap at CR 1 in pansori, so RAW's "any creature ≤ your level" is narrowed
 * to the beast-form catalog; the chosen form comes from the `beastForm` picker
 * (else the strongest available to the caster).
 *
 * Returns `true` when handled (the spell carries `shapeshift`).
 */
export function runShapeshiftSpell(
  ctx: ActionContext,
  spell: Spell,
  beastFormId: string | undefined
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  if (!spell.shapeshift) return false;
  const { char } = ctx.actor;

  const avail = availableBeastForms(char.level);
  const form =
    (beastFormId ? BEAST_FORMS[beastFormId] : undefined) ??
    [...avail].sort((a, b) => b.cr - a.cr)[0] ??
    Object.values(BEAST_FORMS)[0];
  const formHp = form.hp ?? 11;

  const shape = <T extends Character>(c: T): T => ({
    ...c,
    conditions: [...c.conditions.filter((x) => x !== 'wild_shaped'), 'wild_shaped'],
    wild_shape_form: form.id,
    temp_hp: Math.max(c.temp_hp ?? 0, formHp),
    shapeshift_spell: spell.id,
  });

  // The caster is mutated in place (it's the committed `char` reference); other
  // party members (Animal Shapes) are updated on ctx.st.characters.
  char.conditions = [...char.conditions.filter((x) => x !== 'wild_shaped'), 'wild_shaped'];
  char.wild_shape_form = form.id;
  char.temp_hp = Math.max(char.temp_hp ?? 0, formHp);
  char.shapeshift_spell = spell.id;
  char.concentrating_on = { spellId: spell.id, rounds_left: concentrationRoundsFor(spell) };

  let shapedCount = 1;
  if (spell.shapeshift.scope === 'allies') {
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => {
        if (c.id === char.id || c.dead) return c;
        shapedCount += 1;
        return shape(c);
      }),
    };
  }

  ctx.narrative =
    spell.shapeshift.scope === 'self'
      ? `🐾 ${char.name} flows into the shape of a ${form.name} — ${form.descriptor}. (+${formHp} temp HP.)`
      : `🐾 ${char.name} reshapes the willing party — ${shapedCount} take the form of a ${form.name} (+${formHp} temp HP each).`;
  if (ctx.st.combat_active) ctx.usedInitiative = true;
  return true;
}
