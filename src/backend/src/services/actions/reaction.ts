import type { Character, GameState } from '../../types.js';
import {
  FRESH_TURN,
  abilityMod,
  hasWeaponProficiency,
  profBonus,
  resolvePlayerAttack,
  rollDice,
} from '../rulesEngine.js';
import {
  applyEnemySpellDamage,
  applyPartyLevelUps,
  endCombatState,
  getEnemyById,
  isRoomCleared,
  pushEvent,
  runEnemyTurns,
  splitEncounterXp,
  tickConditions,
} from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import type { EnemyAttackHitFragment } from '../narrative/fragments.js';
import { enemyAttackFragmentEvent } from '../narrative/compose.js';
import { resolveOneAttack } from './attack/resolveOneAttack.js';

/**
 * `use_reaction`: trigger the readied action stored from a prior
 * `ready` action. Consumes the reaction slot + clears the readied
 * action, then emits a "triggers their readied action!" prefix and
 * delegates to the stored inner action.
 *
 * Returns `delegateTo` — the inner action runs against the same ctx,
 * stacking its mutations on top of the trigger's pre-mutations. The
 * outer takeAction's epilogue runs once (enemy turns, runRules, LLM
 * enhance, etc.) over the combined state. This differs from the
 * pre-refactor behavior which called takeAction recursively — that
 * version ran the epilogue twice (the inner takeAction's, then the
 * outer's), occasionally producing duplicate enemy turns or duplicate
 * LLM costs; the delegate-with-prefix approach resolves it cleanly.
 *
 * resolve_reaction (Shield window / Counterspell window) is a
 * different shape — pending_reaction is set BY a triggering action
 * mid-turn, not stored on the char — and will join this file when
 * extracted.
 */
export const handleUseReaction: ActionHandler<{ type: 'use_reaction' }> = (ctx) => {
  const readied = ctx.char.turn_actions.readied_action;
  if (!readied) {
    return { rejected: 'You have no readied action.' };
  }
  // Dispatcher post-deducts `reaction_used` after the delegateTo
  // resolves (use_reaction's declared cost is 'reaction').
  ctx.char = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      readied_action: undefined,
    },
  };
  ctx.commitChar();
  ctx.narrative = `${ctx.char.name} triggers their readied action! `;
  return { delegateTo: readied.action };
};

/**
 * `resolve_reaction`: resolve a pending mid-turn reaction window
 * (Shield / Hellish Rebuke / Counterspell). The triggering enemy
 * action paused mid-resolution by writing `state.pending_reaction`
 * with the exact init-loop coordinates; this handler accepts or
 * declines, applies the reaction's effect, clears the pending slot,
 * then resumes the enemy turn loop from the saved coords.
 *
 * On resume, advances initiative one more step (same logic as the
 * normal post-switch epilogue does after enemy turns) so the next
 * PC's turn-start hooks (movement reset, condition tick) fire.
 *
 * Three variants:
 *  - shield: +5 AC defensive cast. Burns lowest available slot.
 *  - hellish_rebuke: 2d10 fire counter-attack (DEX save halves).
 *    Tieflings have a 1/long-rest racial slot first.
 *  - counterspell: interrupt the enemy spell (auto if slot ≥ enemy
 *    spell level, ability check otherwise). Decline → enemy spell
 *    resolves on the intended target via applyEnemySpellDamage.
 */
export const handleResolveReaction: ActionHandler<{
  type: 'resolve_reaction';
  accept: boolean;
  replacementIndex?: number;
}> = (ctx, action) => {
  const rx = ctx.st.pending_reaction;
  if (!rx) {
    ctx.narrative = 'No reaction pending.';
    return;
  }
  // 2024 PHB PC-turn d20 reactions (Heroic Inspiration etc.) carry
  // `rollerCharId` instead of the enemy-attack-base `targetCharId`.
  const reactionOwnerId = rx.kind === 'pc_d20' ? rx.rollerCharId : rx.targetCharId;
  if (ctx.char.id !== reactionOwnerId) {
    ctx.narrative = 'This reaction belongs to another character.';
    return;
  }

  // 2024 PHB PC-turn d20 reaction window. Heroic Inspiration is the
  // first source; Lucky-RAW (PHB-only feat) and Clockwork Soul Restore
  // Balance will plug into the same shape. Branches early (returns) so
  // the enemy-turn resume below doesn't fire — the PC is still on their
  // turn and the standard post-action epilogue drives initiative.
  //
  // Accept (Heroic Inspiration): rewind to pre-attack state, clear
  // inspiration on the char, set forceD20 on the AttackContext, re-call
  // resolveOneAttack. SRD: "you must use the new roll" — no
  // adv/disadv on the reroll; resolvePlayerAttack reads forceRoll1 and
  // skips its internal d20 generation. Inspiration is consumed
  // regardless of whether the new roll improves the outcome.
  //
  // Decline: commit the proposed snapshot (the original miss). Inspiration
  // stays on the char.
  if (rx.kind === 'pc_d20') {
    type AttackContextBlob = {
      preAttackChar: Character;
      preAttackSt: GameState;
      atkCtx: Parameters<typeof resolveOneAttack>[1];
    };
    const blob = rx.attackContext as AttackContextBlob;
    if (action.accept) {
      // Rewind to pre-attack state on ctx.
      ctx.char = blob.preAttackChar;
      ctx.st = { ...blob.preAttackSt, pending_reaction: undefined };
      // Inspiration is spent regardless of outcome.
      ctx.char = { ...ctx.char, inspiration: false };
      // Roll the new d20 (RAW: "you must use the new roll").
      const newD20 = Math.floor(Math.random() * 20) + 1;
      // Re-run the same attack with the forced d20 baked into the
      // AttackContext. resolveOneAttack reads atkCtx.forceD20 and
      // passes it to resolvePlayerAttack as `forceRoll1`.
      const rerunCtx = {
        ...blob.atkCtx,
        forceD20: newD20,
      };
      const inspirationNote = `\n\n[Heroic Inspiration: reroll d20 ${rx.originalD20} → ${newD20}.] `;
      ctx.narrative += inspirationNote;
      resolveOneAttack(ctx, rerunCtx, '');
      // Action is consumed (the original attack was the action; the
      // reroll just resolves it).
      ctx.char = {
        ...ctx.char,
        turn_actions: { ...ctx.char.turn_actions, action_used: true },
      };
      ctx.usedInitiative = true;
    } else {
      // Decline — commit the proposed (miss) snapshot. Inspiration
      // retained; turn_actions.action_used stays as the post-miss
      // state already had it (resolveOneAttack flowed through the
      // miss branch).
      const proposedChar = rx.pendingProposedChar as Character;
      const proposedSt = rx.pendingProposedSt as GameState;
      ctx.char = proposedChar;
      ctx.st = { ...proposedSt, pending_reaction: undefined };
      ctx.char = {
        ...ctx.char,
        turn_actions: { ...ctx.char.turn_actions, action_used: true },
      };
      ctx.narrative += '\n\n[Heroic Inspiration declined.] ';
      ctx.usedInitiative = true;
    }
    return;
  }

  if (rx.kind === 'shield') {
    // Narrow the BE-only pending payloads (typed as `unknown` in
    // shared-types since FE doesn't introspect them).
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    const commitProposed = (): void => {
      // Merge the proposed snapshot's characters/entities onto ctx.st,
      // preserving other fields (initiative_order, round, etc.) which
      // weren't touched during the Shield pause. The proposed snapshot
      // carries the rolled-but-not-committed mutations: HP, conditions,
      // concentration outcome, Bless cleanup on linked allies. Sync the
      // grid entity HP so the FE reflects the new HP.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
    };
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      const lvl = Object.keys(slotsMax)
        .map(Number)
        .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
        .sort((a, b) => a - b)[0];
      if (lvl === undefined) {
        // No slot to consume — damage applies as if Shield was declined.
        ctx.narrative = `No spell slot available to cast Shield. ${pendingFragment.prose}`;
        commitProposed();
      } else {
        // Shield active: +5 AC until the start of the caster's next turn.
        // tickConditions clears the bump when shield_spell expires.
        // The proposed snapshot (including any concentration save) is
        // DISCARDED — no damage landed, so concentration was never
        // actually tested per RAW.
        ctx.char = {
          ...ctx.char,
          spell_slots_used: { ...slotsUsed, [lvl]: (slotsUsed[lvl] ?? 0) + 1 },
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
          conditions: [...ctx.char.conditions.filter((c) => c !== 'shield_spell'), 'shield_spell'],
          condition_durations: {
            ...(ctx.char.condition_durations ?? {}),
            shield_spell: 1,
          },
          ac: ctx.char.ac + 5,
        };
        ctx.narrative = `🛡️ ${ctx.char.name} casts SHIELD as a reaction (lvl ${lvl} slot)! +5 AC until the start of their next turn — the ${pendingFragment.attackerName}'s strike bounces off the shimmering barrier.`;
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          pending_reaction: undefined,
        };
      }
    } else {
      // Decline — commit the proposed snapshot with a trailing notice.
      ctx.narrative = `${pendingFragment.prose} (Shield declined.)`;
      commitProposed();
    }
  } else if (rx.kind === 'hellish_rebuke') {
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      // 2024 PHB Tiefling Infernal Legacy — 1/long-rest free racial slot
      // at L3+. Prefer it over a real spell slot.
      const isTieflingInnate =
        ctx.char.species === 'tiefling' &&
        ctx.char.level >= 3 &&
        !ctx.char.class_resource_uses?.tiefling_rebuke_used;
      let slotLvl: number | undefined;
      if (isTieflingInnate) {
        slotLvl = 1;
      } else {
        slotLvl = Object.keys(slotsMax)
          .map(Number)
          .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
          .sort((a, b) => a - b)[0];
      }
      if (slotLvl === undefined) {
        ctx.narrative = 'No spell slot available — Hellish Rebuke fizzles.';
        ctx.st = { ...ctx.st, pending_reaction: undefined };
      } else {
        if (isTieflingInnate) {
          ctx.char = {
            ...ctx.char,
            class_resource_uses: {
              ...(ctx.char.class_resource_uses ?? {}),
              tiefling_rebuke_used: 1,
            },
          };
        } else {
          ctx.char = {
            ...ctx.char,
            spell_slots_used: { ...slotsUsed, [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1 },
          };
        }
        ctx.char = {
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
        };
        // Upcast: 2d10 base + 1d10 per slot above 1st.
        const upcastDice = Math.max(0, slotLvl - 1);
        const baseRoll = rollDice('2d10');
        const upcastRoll = upcastDice > 0 ? rollDice(`${upcastDice}d10`) : 0;
        const fullDmg = baseRoll + upcastRoll;
        const enemyData = getEnemyById(ctx.seed, rx.attackerEnemyId);
        const enemyDex = enemyData?.dex ?? 10;
        const dc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
        const saveRoll = rollDice('1d20') + abilityMod(enemyDex);
        const saved = saveRoll >= dc;
        const finalDmg = saved ? Math.floor(fullDmg / 2) : fullDmg;
        const attackerEnt = ctx.st.entities?.find((e) => e.id === rx.attackerEnemyId && e.isEnemy);
        const newEnemyHp = Math.max(0, (attackerEnt?.hp ?? 0) - finalDmg);
        ctx.st = {
          ...ctx.st,
          entities: ctx.st.entities?.map((e) =>
            e.id === rx.attackerEnemyId && e.isEnemy ? { ...e, hp: newEnemyHp } : e
          ),
          characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          pending_reaction: undefined,
        };
        const enemyName = enemyData?.name ?? 'the attacker';
        ctx.narrative = `🔥 ${ctx.char.name} casts HELLISH REBUKE (lvl ${slotLvl} slot)! Hellish flames engulf ${enemyName}. DEX save ${saveRoll} vs DC ${dc} — ${saved ? 'half' : 'full'} damage: ${finalDmg} fire (${baseRoll}${upcastRoll > 0 ? ` + ${upcastRoll} upcast` : ''}).`;
        if (newEnemyHp <= 0) {
          const xpGain = enemyData?.xp ?? 10;
          const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
          ctx.st = split.st;
          const xpShare = split.share;
          ctx.char = { ...ctx.char, xp: (ctx.char.xp || 0) + xpShare };
          ctx.st = {
            ...ctx.st,
            enemies_killed: [...(ctx.st.enemies_killed ?? []), rx.attackerEnemyId],
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          };
          ctx.narrative += ` ${enemyName} is consumed by the rebuke! (+${xpShare} XP)`;
          ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
          if (isRoomCleared(ctx.st, ctx.seed, ctx.st.current_room)) {
            ctx.st = endCombatState(ctx.st);
          }
        }
      }
    } else {
      ctx.narrative = `${ctx.char.name} declines to retaliate.`;
      ctx.st = { ...ctx.st, pending_reaction: undefined };
    }
  } else if (rx.kind === 'counterspell') {
    // PHB p.234. Accept = burn a ≥ L3 slot to interrupt. Slot ≥ enemy
    // spell level auto-counters; otherwise an ability check vs
    // DC 10 + spell level. Decline = enemy spell resolves.
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      const slotLvl = Object.keys(slotsMax)
        .map(Number)
        .filter((n) => n >= 3 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
        .sort((a, b) => a - b)[0];
      if (slotLvl === undefined) {
        ctx.narrative = 'No 3rd-level or higher slot — Counterspell fizzles.';
        ctx.st = { ...ctx.st, pending_reaction: undefined };
      } else {
        ctx.char = {
          ...ctx.char,
          spell_slots_used: { ...slotsUsed, [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1 },
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
        };
        const autoCounter = slotLvl >= rx.enemySpellLevel;
        let success = autoCounter;
        let checkDetail = '';
        if (!autoCounter) {
          const castingAbility = (ctx.context.spellcastingAbility?.[ctx.char.character_class] ??
            ctx.context.classPrimaryStats[ctx.char.character_class] ??
            'int') as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
          const score = ctx.char[castingAbility] ?? 10;
          const dc = 10 + rx.enemySpellLevel;
          const checkRoll = rollDice('1d20') + abilityMod(score) + profBonus(ctx.char.level);
          success = checkRoll >= dc;
          checkDetail = ` ${castingAbility.toUpperCase()} check ${checkRoll} vs DC ${dc} — ${success ? 'success' : 'failed'}.`;
        }
        if (success) {
          ctx.narrative = `⚡ ${ctx.char.name} casts COUNTERSPELL (lvl ${slotLvl} slot)!${checkDetail} ${rx.enemySpellName} is unraveled — no effect.`;
        } else {
          const damage = applyEnemySpellDamage(ctx.st, rx, ctx.context);
          if (damage) {
            ctx.st = damage.st;
            // If the reactor IS the spell target, sync char so the final
            // commitChar doesn't overwrite the damage.
            if (rx.intendedTargetPcId === ctx.char.id) {
              ctx.char = { ...ctx.char, hp: damage.targetHp };
            }
            ctx.narrative = `⚡ ${ctx.char.name} casts COUNTERSPELL (lvl ${slotLvl} slot)!${checkDetail} ${rx.enemySpellName} bursts through — ${damage.targetName} takes ${damage.dmgRoll} ${damage.damageType}.`;
          } else {
            ctx.narrative = `${ctx.char.name} fails to counter ${rx.enemySpellName}. The spell resolves.`;
          }
        }
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          pending_reaction: undefined,
        };
      }
    } else {
      const damage = applyEnemySpellDamage(ctx.st, rx, ctx.context);
      if (damage) {
        ctx.st = damage.st;
        if (rx.intendedTargetPcId === ctx.char.id) {
          ctx.char = { ...ctx.char, hp: damage.targetHp };
        }
        ctx.narrative = `${ctx.char.name} declines to counter. ${rx.enemySpellName} resolves — ${damage.targetName} takes ${damage.dmgRoll} ${damage.damageType}.`;
      } else {
        ctx.narrative = `${ctx.char.name} declines to counter. ${rx.enemySpellName} resolves.`;
      }
      ctx.st = { ...ctx.st, pending_reaction: undefined };
    }
  } else if (rx.kind === 'uncanny_dodge') {
    // PHB Rogue L5. Accept = halve the proposed damage + commit;
    // decline = commit the full proposed snapshot.
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    if (action.accept) {
      // Halve the damage. The proposedChar already had the full damage
      // applied; back out half of it.
      const halved = Math.floor(rx.proposedDamage / 2);
      const dmgSaved = rx.proposedDamage - halved;
      const charAfterHalve: Character = {
        ...pendingProposedChar,
        hp: Math.min(pendingProposedChar.max_hp, pendingProposedChar.hp + dmgSaved),
        turn_actions: { ...pendingProposedChar.turn_actions, reaction_used: true },
      };
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? charAfterHalve : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: charAfterHalve.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = charAfterHalve;
      ctx.st = pushEvent(
        ctx.st,
        enemyAttackFragmentEvent({ ...pendingFragment, damage: halved }, ctx.st.round ?? 1)
      );
      ctx.narrative = `🌀 ${ctx.char.name} uses Uncanny Dodge! ${pendingFragment.prose} — but only ${halved} damage lands (saved ${dmgSaved}).`;
    } else {
      // Decline — commit the full-damage proposed snapshot.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      ctx.narrative = `${pendingFragment.prose} (Uncanny Dodge declined.)`;
    }
  } else if (rx.kind === 'sentinel') {
    // PHB 2024 Sentinel feat. Accept = the Sentinel PC makes a melee
    // weapon attack against the triggering enemy. Decline = nothing
    // happens. Reaction consumed on accept (decline doesn't burn it).
    if (action.accept) {
      const enemyEnt = ctx.st.entities?.find(
        (e) => e.id === rx.triggerAttackerEnemyId && e.isEnemy
      );
      const enemy = getEnemyById(ctx.seed, rx.triggerAttackerEnemyId);
      if (!enemyEnt || !enemy) {
        ctx.narrative = `${ctx.char.name} reaches to intercept, but the attacker is gone.`;
        ctx.st = { ...ctx.st, pending_reaction: undefined };
      } else {
        const weaponInstance = ctx.char.equipped_weapon
          ? ctx.char.inventory?.find((i) => i.instance_id === ctx.char.equipped_weapon)
          : null;
        const weaponItem = weaponInstance
          ? ctx.context.lootTable.find((l) => l.id === weaponInstance.id)
          : null;
        // Sentinel reaction is melee only (RAW). Ranged weapons can't
        // be used — fall back to unarmed strike if no melee weapon.
        const isMelee = !!weaponItem && weaponItem.range !== 'ranged';
        const usedWeapon = isMelee ? weaponItem : null;
        const weaponProficient = hasWeaponProficiency(
          ctx.char.weapon_proficiencies ?? [],
          usedWeapon?.weaponType
        );
        const atk = resolvePlayerAttack(
          { str: ctx.char.str, dex: ctx.char.dex, level: ctx.char.level },
          usedWeapon?.damage ?? '1d4',
          enemy.ac,
          usedWeapon?.finesse ?? false,
          false,
          false,
          weaponProficient,
          false,
          20,
          0,
          ctx.char.species === 'halfling'
        );
        // Burn the reaction.
        ctx.char = {
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
        };
        const weaponLabel = usedWeapon ? usedWeapon.name : 'an unarmed strike';
        if (atk.hit) {
          const newEnemyHp = Math.max(0, enemyEnt.hp - atk.damage);
          let newSt: GameState = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === rx.triggerAttackerEnemyId && e.isEnemy ? { ...e, hp: newEnemyHp } : e
            ),
            pending_reaction: undefined,
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          };
          if (newEnemyHp <= 0) {
            newSt = { ...newSt, enemies_killed: [...newSt.enemies_killed, enemy.id] };
          }
          ctx.st = newSt;
          ctx.narrative = `⚔ ${ctx.char.name} intercepts with Sentinel — ${weaponLabel} hits ${enemy.name} for ${atk.damage}! (${newEnemyHp <= 0 ? `${enemy.name} drops!` : ''})`;
        } else {
          ctx.st = {
            ...ctx.st,
            pending_reaction: undefined,
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          };
          ctx.narrative = `⚔ ${ctx.char.name} swings with Sentinel — ${weaponLabel} misses ${enemy.name}.`;
        }
      }
    } else {
      ctx.narrative = `${ctx.char.name} declines to intercept.`;
      ctx.st = { ...ctx.st, pending_reaction: undefined };
    }
  } else if (rx.kind === 'silvery_barbs') {
    // Strixhaven L1. Accept = burn a L1+ slot, reroll the d20, take
    // the lower of the original vs the new. If the new total falls
    // below targetAc, the attack becomes a miss (damage discarded).
    // Otherwise the hit stands (proposed snapshot commits).
    // Decline = commit the full-damage proposed snapshot.
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      const slotLvl = Object.keys(slotsMax)
        .map(Number)
        .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
        .sort((a, b) => a - b)[0];
      if (slotLvl === undefined) {
        // No slot — full damage commits.
        ctx.narrative = `No spell slot available for Silvery Barbs. ${pendingFragment.prose}`;
        ctx.st = {
          ...ctx.st,
          characters: pendingProposedSt.characters.map((c) =>
            c.id === ctx.char.id ? pendingProposedChar : c
          ),
          entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
          ),
          pending_reaction: undefined,
        };
        ctx.char = pendingProposedChar;
        ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      } else {
        // Slot consumed; reroll the d20.
        const newD20 = rollDice('1d20');
        const finalD20 = Math.min(rx.proposedD20, newD20);
        const mods = rx.atkTotal - rx.proposedD20;
        const newTotal = finalD20 + mods;
        const newHit = newTotal >= rx.targetAc;
        // PC consumes slot + reaction regardless of outcome.
        const charBase: Character = {
          ...ctx.char,
          spell_slots_used: { ...slotsUsed, [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1 },
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
        };
        if (newHit) {
          // Hit stands — commit the proposed snapshot (with damage)
          // but keep our slot + reaction consumed.
          const charAfter: Character = {
            ...pendingProposedChar,
            spell_slots_used: charBase.spell_slots_used,
            turn_actions: charBase.turn_actions,
          };
          ctx.st = {
            ...ctx.st,
            characters: pendingProposedSt.characters.map((c) =>
              c.id === ctx.char.id ? charAfter : c
            ),
            entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
              e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: charAfter.hp } : e
            ),
            pending_reaction: undefined,
          };
          ctx.char = charAfter;
          ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
          ctx.narrative = `🌟 ${ctx.char.name} weaves Silvery Barbs (lvl ${slotLvl} slot)! Reroll: d20 ${newD20} → total ${newTotal} vs AC ${rx.targetAc} — still hits. ${pendingFragment.prose}`;
        } else {
          // Reroll causes a miss — discard damage. PC stays at its
          // pre-attack HP. Emit attack_miss event instead.
          ctx.st = {
            ...ctx.st,
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? charBase : c)),
            pending_reaction: undefined,
          };
          ctx.char = charBase;
          ctx.st = pushEvent(ctx.st, {
            kind: 'attack_miss',
            attackerId: pendingFragment.attackerEnemyId,
            attackerName: pendingFragment.attackerName,
            targetId: pendingFragment.targetCharId,
            targetName: pendingFragment.targetName,
            toHit: newTotal,
            targetAc: rx.targetAc,
            round: ctx.st.round ?? 1,
          });
          ctx.narrative = `🌟 ${ctx.char.name} weaves Silvery Barbs (lvl ${slotLvl} slot)! Reroll: d20 ${newD20} → total ${newTotal} vs AC ${rx.targetAc} — the strike misses!`;
        }
      }
    } else {
      // Decline — commit full proposed snapshot.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      ctx.narrative = `${pendingFragment.prose} (Silvery Barbs declined.)`;
    }
  } else if (rx.kind === 'lucky_disadv') {
    // 2024 PHB Lucky feat — Disadvantage benefit. Accept spends 1
    // luck point and re-rolls the enemy attack with Disadvantage
    // (roll 2 fresh d20s, take the lower). If the lower d20 falls
    // below the AC, the attack becomes a miss (damage discarded).
    // Otherwise the hit stands (proposed snapshot commits). Decline
    // = commit the full-damage proposed snapshot.
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    if (action.accept) {
      const remaining = ctx.char.class_resource_uses?.feat_lucky_uses ?? 0;
      if (remaining <= 0) {
        // No luck points — full damage commits.
        ctx.narrative = `No luck points available. ${pendingFragment.prose}`;
        ctx.st = {
          ...ctx.st,
          characters: pendingProposedSt.characters.map((c) =>
            c.id === ctx.char.id ? pendingProposedChar : c
          ),
          entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
          ),
          pending_reaction: undefined,
        };
        ctx.char = pendingProposedChar;
        ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      } else {
        // Spend 1 luck point. Re-roll the enemy attack with
        // Disadvantage: roll 2 fresh d20s, take the lower. RAW: "you
        // must use the new roll" — the original d20 is discarded.
        const r1 = rollDice('1d20');
        const r2 = rollDice('1d20');
        const newD20 = Math.min(r1, r2);
        const mods = rx.atkTotal - rx.proposedD20;
        const newTotal = newD20 + mods;
        const newHit = newTotal >= rx.targetAc;
        const charBase: Character = {
          ...ctx.char,
          class_resource_uses: {
            ...(ctx.char.class_resource_uses ?? {}),
            feat_lucky_uses: remaining - 1,
          },
        };
        if (newHit) {
          // Reroll still hits — commit proposed (with damage) but
          // keep our luck point spend on the reactor.
          const charAfter: Character = {
            ...pendingProposedChar,
            class_resource_uses: charBase.class_resource_uses,
          };
          ctx.st = {
            ...ctx.st,
            characters: pendingProposedSt.characters.map((c) =>
              c.id === ctx.char.id ? charAfter : c
            ),
            entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
              e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: charAfter.hp } : e
            ),
            pending_reaction: undefined,
          };
          ctx.char = charAfter;
          ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
          ctx.narrative = `🍀 ${ctx.char.name} spends a luck point — disadvantage on the attack! Reroll: d20s ${r1}/${r2} → ${newD20}, total ${newTotal} vs AC ${rx.targetAc} — still hits. ${pendingFragment.prose}`;
        } else {
          // Disadvantage turns the hit into a miss — damage discarded.
          ctx.st = {
            ...ctx.st,
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? charBase : c)),
            pending_reaction: undefined,
          };
          ctx.char = charBase;
          ctx.st = pushEvent(ctx.st, {
            kind: 'attack_miss',
            attackerId: pendingFragment.attackerEnemyId,
            attackerName: pendingFragment.attackerName,
            targetId: pendingFragment.targetCharId,
            targetName: pendingFragment.targetName,
            toHit: newTotal,
            targetAc: rx.targetAc,
            round: ctx.st.round ?? 1,
          });
          ctx.narrative = `🍀 ${ctx.char.name} spends a luck point — disadvantage on the attack! Reroll: d20s ${r1}/${r2} → ${newD20}, total ${newTotal} vs AC ${rx.targetAc} — the strike misses!`;
        }
      }
    } else {
      // Decline — commit full proposed snapshot.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      ctx.narrative = `${pendingFragment.prose} (Lucky declined.)`;
    }
  } else if (rx.kind === 'absorb_elements') {
    // PHB p.211. Accept = burn a L1+ slot, halve damage, commit;
    // decline = commit the full-damage snapshot.
    // (TODO: also grant resistance to that damage type until start
    // of next turn + queue +1d6 bonus damage on next melee attack.
    // MVP halves the trigger only — see task #60.)
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      const slotLvl = Object.keys(slotsMax)
        .map(Number)
        .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
        .sort((a, b) => a - b)[0];
      if (slotLvl === undefined) {
        // No slot — fall through to full damage commit.
        ctx.narrative = `No spell slot available for Absorb Elements. ${pendingFragment.prose}`;
        ctx.st = {
          ...ctx.st,
          characters: pendingProposedSt.characters.map((c) =>
            c.id === ctx.char.id ? pendingProposedChar : c
          ),
          entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
          ),
          pending_reaction: undefined,
        };
        ctx.char = pendingProposedChar;
        ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      } else {
        // Slot consumed; halve the damage.
        const halved = Math.floor(rx.proposedDamage / 2);
        const dmgSaved = rx.proposedDamage - halved;
        const charAfterAbsorb: Character = {
          ...pendingProposedChar,
          hp: Math.min(pendingProposedChar.max_hp, pendingProposedChar.hp + dmgSaved),
          spell_slots_used: { ...slotsUsed, [slotLvl]: (slotsUsed[slotLvl] ?? 0) + 1 },
          turn_actions: { ...pendingProposedChar.turn_actions, reaction_used: true },
        };
        ctx.st = {
          ...ctx.st,
          characters: pendingProposedSt.characters.map((c) =>
            c.id === ctx.char.id ? charAfterAbsorb : c
          ),
          entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: charAfterAbsorb.hp } : e
          ),
          pending_reaction: undefined,
        };
        ctx.char = charAfterAbsorb;
        ctx.st = pushEvent(
          ctx.st,
          enemyAttackFragmentEvent({ ...pendingFragment, damage: halved }, ctx.st.round ?? 1)
        );
        ctx.narrative = `🌊 ${ctx.char.name} absorbs the ${rx.damageType} energy (lvl ${slotLvl} slot)! Only ${halved} damage lands (absorbed ${dmgSaved}).`;
      }
    } else {
      // Decline — commit full proposed snapshot.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      ctx.narrative = `${pendingFragment.prose} (Absorb Elements declined.)`;
    }
  } else if (rx.kind === 'd20_interception') {
    // Generic post-roll d20 interception (PHB 2024 Diviner Portent
    // today; Lucky-RAW timing + Clockwork Soul Restore Balance plug
    // into the same shape later). Accept = pop the chosen replacement
    // value from `replacementValues`, substitute for the rolled d20,
    // recompute hit/miss with the same modifier, and commit. Decline
    // = commit the original proposed snapshot.
    const pendingFragment = rx.pendingFragment as EnemyAttackHitFragment;
    const pendingProposedChar = rx.pendingProposedChar as Character;
    const pendingProposedSt = rx.pendingProposedSt as GameState;
    if (action.accept) {
      // Pick the replacement: explicit index from the action, else
      // the lowest available (most likely to convert hit → miss).
      const replacements = rx.replacementValues;
      if (replacements.length === 0) {
        ctx.narrative = `No replacement available. ${pendingFragment.prose}`;
        ctx.st = {
          ...ctx.st,
          characters: pendingProposedSt.characters.map((c) =>
            c.id === ctx.char.id ? pendingProposedChar : c
          ),
          entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
          ),
          pending_reaction: undefined,
        };
        ctx.char = pendingProposedChar;
        ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      } else {
        const idx =
          action.replacementIndex !== undefined &&
          action.replacementIndex >= 0 &&
          action.replacementIndex < replacements.length
            ? action.replacementIndex
            : replacements.indexOf(Math.min(...replacements));
        const chosen = replacements[idx];
        const mods = rx.atkTotal - rx.proposedD20;
        const newTotal = chosen + mods;
        const newHit = newTotal >= rx.targetAc;
        // Reactor consumes the resource + reaction regardless of outcome.
        // For Portent that's a portent die at the chosen index. The
        // resource-source switch keeps the shape generic so Lucky /
        // Restore Balance can plug in by reading rx.source.
        const consumeResource = (c: Character): Character => {
          if (rx.source === 'portent') {
            const remainingDice = [...(c.portent_dice ?? [])];
            remainingDice.splice(idx, 1);
            return { ...c, portent_dice: remainingDice };
          }
          return c;
        };
        const charBase: Character = consumeResource({
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, reaction_used: true },
        });
        const sourceLabel = rx.source === 'portent' ? 'Portent' : 'D20 Interception';
        if (newHit) {
          // Replacement still hits — commit the proposed snapshot
          // (with damage) but preserve the resource + reaction
          // consumption on the reactor.
          const charAfter: Character = {
            ...pendingProposedChar,
            portent_dice: charBase.portent_dice,
            turn_actions: charBase.turn_actions,
          };
          ctx.st = {
            ...ctx.st,
            characters: pendingProposedSt.characters.map((c) =>
              c.id === ctx.char.id ? charAfter : c
            ),
            entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
              e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: charAfter.hp } : e
            ),
            pending_reaction: undefined,
          };
          ctx.char = charAfter;
          ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
          ctx.narrative = `🔮 ${ctx.char.name} weaves ${sourceLabel}! d20 ${rx.proposedD20} → ${chosen}, total ${newTotal} vs AC ${rx.targetAc} — still hits. ${pendingFragment.prose}`;
        } else {
          // Replacement makes the attack miss — discard damage. PC
          // stays at pre-attack HP. Emit attack_miss event.
          ctx.st = {
            ...ctx.st,
            characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? charBase : c)),
            pending_reaction: undefined,
          };
          ctx.char = charBase;
          ctx.st = pushEvent(ctx.st, {
            kind: 'attack_miss',
            attackerId: pendingFragment.attackerEnemyId,
            attackerName: pendingFragment.attackerName,
            targetId: pendingFragment.targetCharId,
            targetName: pendingFragment.targetName,
            toHit: newTotal,
            targetAc: rx.targetAc,
            round: ctx.st.round ?? 1,
          });
          ctx.narrative = `🔮 ${ctx.char.name} weaves ${sourceLabel}! d20 ${rx.proposedD20} → ${chosen}, total ${newTotal} vs AC ${rx.targetAc} — the strike misses!`;
        }
      }
    } else {
      // Decline — commit full proposed snapshot.
      ctx.st = {
        ...ctx.st,
        characters: pendingProposedSt.characters.map((c) =>
          c.id === ctx.char.id ? pendingProposedChar : c
        ),
        entities: (pendingProposedSt.entities ?? ctx.st.entities ?? []).map((e) =>
          e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: pendingProposedChar.hp } : e
        ),
        pending_reaction: undefined,
      };
      ctx.char = pendingProposedChar;
      ctx.st = pushEvent(ctx.st, enemyAttackFragmentEvent(pendingFragment, ctx.st.round ?? 1));
      const sourceLabel = rx.source === 'portent' ? 'Portent' : 'D20 Interception';
      ctx.narrative = `${pendingFragment.prose} (${sourceLabel} declined.)`;
    }
  }

  // Resume the enemy turn loop from the coords saved when this reaction
  // window opened. The standard post-switch epilogue (gated by
  // usedInitiative) would normally drive enemy turns, but we're mid-loop
  // here — we have to advance the cursor ourselves before any of the
  // outer epilogue runs.
  const resume = runEnemyTurns({
    st: ctx.st,
    seed: ctx.seed,
    context: ctx.context,
    worldName: ctx.worldName,
    startAdvIdx: rx.resumeFromInitiativeIdx,
    startMultiattackIdx: rx.resumeFromMultiattackIdx,
    startRoundWrapped: false,
    initialCurrentIdx: rx.resumeFromInitiativeIdx,
  });
  ctx.st = resume.st;
  ctx.narrative += resume.narrative;
  if (!resume.paused) {
    if (resume.roundWrapped) {
      ctx.st = {
        ...ctx.st,
        movement_used: {},
        surprised: [],
        characters: ctx.st.characters.map((c) => ({ ...c, turn_actions: { ...FRESH_TURN } })),
      };
    }
    ctx.st.initiative_idx = resume.exitAdvIdx;
    const nextEntry = ctx.st.initiative_order[resume.exitAdvIdx];
    if (nextEntry && !nextEntry.is_enemy) {
      const nextCharIdx = ctx.st.characters.findIndex((c) => c.id === nextEntry.id && !c.dead);
      if (nextCharIdx >= 0) {
        ctx.st = {
          ...ctx.st,
          movement_used: { ...(ctx.st.movement_used ?? {}), [nextEntry.id]: 0 },
        };
        const withFreshTurn = {
          ...ctx.st.characters[nextCharIdx],
          turn_actions: { ...FRESH_TURN },
        };
        const ticked = tickConditions(withFreshTurn);
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c, i) => (i === nextCharIdx ? ticked : c)),
          active_character_id: ticked.id,
        };
      }
    }
  } else {
    ctx.st.initiative_idx = resume.exitAdvIdx;
  }
};
