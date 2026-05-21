import { FRESH_TURN, abilityMod, profBonus, rollDice } from '../rulesEngine.js';
import {
  applyEnemySpellDamage,
  applyPartyLevelUps,
  endCombatState,
  getEnemyById,
  isRoomCleared,
  runEnemyTurns,
  splitEncounterXp,
  tickConditions,
} from '../gameEngine.js';
import type { ActionHandler } from './types.js';

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
  if (ctx.char.turn_actions.reaction_used) {
    ctx.narrative = 'You have already used your reaction this turn.';
    return;
  }
  const readied = ctx.char.turn_actions.readied_action;
  if (!readied) {
    ctx.narrative = 'You have no readied action.';
    return;
  }
  ctx.char = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      reaction_used: true,
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
}> = (ctx, action) => {
  const rx = ctx.st.pending_reaction;
  if (!rx) {
    ctx.narrative = 'No reaction pending.';
    return;
  }
  if (ctx.char.id !== rx.targetCharId) {
    ctx.narrative = 'This reaction belongs to another character.';
    return;
  }

  if (rx.kind === 'shield') {
    if (action.accept) {
      const slotsMax = ctx.char.spell_slots_max ?? {};
      const slotsUsed = ctx.char.spell_slots_used ?? {};
      const lvl = Object.keys(slotsMax)
        .map(Number)
        .filter((n) => n >= 1 && (slotsMax[n] ?? 0) > (slotsUsed[n] ?? 0))
        .sort((a, b) => a - b)[0];
      if (lvl === undefined) {
        ctx.narrative = `No spell slot available to cast Shield. ${rx.pendingNarrative}`;
        const declinedTarget = {
          ...ctx.char,
          hp: Math.max(0, ctx.char.hp - rx.pendingDamage),
        };
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? declinedTarget : c)),
          pending_reaction: undefined,
        };
        ctx.char = declinedTarget;
      } else {
        // Shield active: +5 AC until the start of the caster's next turn.
        // tickConditions clears the bump when shield_spell expires.
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
        ctx.narrative = `🛡️ ${ctx.char.name} casts SHIELD as a reaction (lvl ${lvl} slot)! +5 AC until the start of their next turn — ${rx.pendingNarrative.split('.')[0]} bounces off the shimmering barrier.`;
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
          pending_reaction: undefined,
        };
      }
    } else {
      const newHp = Math.max(0, ctx.char.hp - rx.pendingDamage);
      ctx.char = { ...ctx.char, hp: newHp };
      ctx.narrative = `${rx.pendingNarrative} (Shield declined.)`;
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) => (c.id === ctx.char.id ? ctx.char : c)),
        pending_reaction: undefined,
      };
      if (ctx.st.entities) {
        ctx.st = {
          ...ctx.st,
          entities: ctx.st.entities.map((e) =>
            e.id === ctx.char.id && !e.isEnemy ? { ...e, hp: newHp } : e
          ),
        };
      }
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
