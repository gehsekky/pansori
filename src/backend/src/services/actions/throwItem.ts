import { getEnemyById, getItemData } from '../gameEngine.js';
import { resolvePlayerAttack, rollDice } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import type { Spell } from '../../types.js';
import { applySingleTargetDamage } from './castSpell/applyDamage.js';
import { fillEnemyTokens } from '../narrative/enemyName.js';
import { fmt } from '../narrativeFmt.js';
import { updatePcActor } from './actor.js';

/**
 * `throw_item`: SRD thrown splash weapon (Acid vial, Alchemist's Fire, Holy
 * Water). A DEX-based improvised ranged attack vs the target's AC; on a hit it
 * deals the item's `splash.damage` of `splash.damageType` (resistances apply via
 * applySingleTargetDamage). The item is consumed whether the throw hits or not.
 *
 *   - Holy Water (`vsCreatureTypes`): only Fiends/Undead take the radiant burst.
 *   - Alchemist's Fire (`burn`): on a hit, sets the target alight — a save-ends
 *     (DC 10 DEX) recurring fire die each of its turns until it's doused.
 *
 * Combat-only, costs the Action (ACTION_COSTS). Sets usedInitiative so the turn
 * advances after the throw.
 */
export const handleThrowItem: ActionHandler<{
  type: 'throw_item';
  itemId: string;
  targetEnemyId: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can throw items.' };
  const { char } = ctx.actor;
  if (!ctx.st.combat_active) return { rejected: 'There is nothing to throw at right now.' };

  const held = char.inventory?.find((i) => i.id === action.itemId);
  if (!held) {
    ctx.narrative = "You search your pack — you don't have that to throw.";
    return;
  }
  const itemData = getItemData(held, ctx.context);
  const splash = itemData.splash;
  if (!splash) {
    ctx.narrative = `The ${held.name} isn't something to hurl at a foe.`;
    return;
  }
  const enemy = getEnemyById(ctx.seed, action.targetEnemyId);
  const ent = ctx.st.entities?.find((e) => e.id === action.targetEnemyId && e.isEnemy);
  if (!enemy || !ent || ent.hp <= 0) {
    ctx.narrative = 'That foe is already down.';
    return;
  }

  // Thrown either way — consume one before resolving the attack.
  const idx = char.inventory.findIndex((i) => i.id === held.id);
  const thrower = { ...char, inventory: char.inventory.filter((_, i) => i !== idx) };
  updatePcActor(ctx, thrower);
  ctx.usedInitiative = true;

  // DEX-based improvised ranged attack (no proficiency).
  const atk = resolvePlayerAttack(
    thrower,
    splash.damage,
    enemy.ac,
    false,
    false,
    false,
    false,
    true
  );
  const toHitNote = `(d20 ${atk.roll} + ${atk.total - atk.roll} DEX = ${atk.total} vs AC ${enemy.ac})`;

  if (!atk.hit) {
    ctx.narrative = fillEnemyTokens(
      `${char.name} hurls the ${held.name} at {the_enemy} — it shatters wide. ${toHitNote}`,
      enemy
    );
    return;
  }

  // Holy Water only harms Fiends / Undead.
  if (splash.vsCreatureTypes && !splash.vsCreatureTypes.includes(enemy.creatureType ?? '')) {
    ctx.narrative = fillEnemyTokens(
      `${char.name} splashes the ${held.name} across {the_enemy} — it hisses and runs off harmlessly; {the_enemy} is neither fiend nor undead. ${toHitNote}`,
      enemy
    );
    return;
  }

  // Pure dice (+ crit doubles the dice) — no ability modifier on splash damage.
  const dmg = rollDice(splash.damage) + (atk.critical ? rollDice(splash.damage) : 0);
  ctx.narrative = fillEnemyTokens(
    `${char.name} hurls the ${held.name} — it bursts over {the_enemy}!${atk.critical ? ' A direct hit!' : ''} ${toHitNote} `,
    enemy
  );
  applySingleTargetDamage(
    ctx,
    enemy,
    action.targetEnemyId,
    { name: held.name, damageType: splash.damageType } as Spell,
    dmg
  );

  // Alchemist's Fire — set the target alight (recurring fire, DC 10 DEX to douse).
  const survivor = ctx.st.entities?.find((e) => e.id === action.targetEnemyId && e.isEnemy);
  if (splash.burn && survivor && survivor.hp > 0) {
    ctx.st = {
      ...ctx.st,
      entities: ctx.st.entities!.map((e) =>
        e.id === action.targetEnemyId && e.isEnemy
          ? {
              ...e,
              save_ends: {
                ...(e.save_ends ?? {}),
                burning: {
                  ability: 'dex',
                  dc: 10,
                  recurDice: splash.burn,
                  recurType: 'fire',
                  casterId: char.id,
                  label: 'the flames',
                },
              },
            }
          : e
      ),
    };
    ctx.narrative += fillEnemyTokens(
      ` {The_enemy} is wreathed in clinging flame (${fmt.note(`burning ${splash.burn} fire/turn, DC 10 DEX to douse`)})!`,
      enemy
    );
  }
};
