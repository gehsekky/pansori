import type { CombatEntity, Enemy } from '../../../types.js';
import { FRESH_TURN, abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { buildInitiativeOrder, pick, seedSummonedAllies } from '../../gameEngine.js';
import {
  heroicWarriorTopUp,
  perfectFocusRefresh,
  persistentRageTopUp,
  superiorInspirationTopUp,
  uncannyMetabolismRefresh,
} from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { updatePcActor } from '../actor.js';

/**
 * Combat-start phase. Only runs on the FIRST attack of an encounter
 * (gated by `!ctx.st.combat_active`). Sets up:
 *
 *  - Initiative order: buildInitiativeOrder rolls a d20+DEX-mod for
 *    each PC + enemy, sorts descending. Stored as
 *    state.initiative_order; each PC also gets initiative_roll on
 *    their character record (for the FE Initiative tile).
 *
 *  - Grid entities (state.entities): created if not already present.
 *    PCs at (1+i, 1), Beastmaster Wolf companions at (1+i, 2),
 *    enemies along the back wall (gw-2-i, gh-2). 8x8 grid by default.
 *
 *  - Surprise: party Stealth avg vs enemy passive Perception. If
 *    the party rolls higher, all enemies are surprised for round 1.
 *
 *  - Combat-start narrative: combatPrefix flavor + initiative order
 *    + surprise note + acts-first / opening-blow line for the
 *    triggering PC.
 *
 * Returns nothing — mutates ctx (combat_active, characters'
 * initiative_roll, entities, initiative_idx, narrative).
 */
export function runCombatStart(ctx: ActionContext, target: Enemy): void {
  if (ctx.st.combat_active) return;
  if (ctx.actor.kind !== 'pc') return;
  const pc = ctx.actor;

  const enemiesForInit = ctx.livingEnemiesInRoom;
  const order = buildInitiativeOrder(ctx.st.characters, enemiesForInit);
  ctx.st = { ...ctx.st, combat_active: true };

  const updatedCharsForInit = ctx.st.characters.map((c) => {
    // SRD Bard Superior Inspiration (L18): rolling Initiative tops Bardic
    // Inspiration back up to 2 if the bard has fewer (no-op otherwise).
    // SRD Barbarian Persistent Rage (L15): rolling Initiative regains all
    // expended Rage uses (once per long rest). SRD Monk Uncanny Metabolism
    // (L2): rolling Initiative regains Focus Points + heals (once per long rest).
    // SRD Monk Perfect Focus (L15): tops Focus Points up to 4 if you didn't use
    // Uncanny Metabolism (applied after it, so it's a no-op when that fired).
    const refreshed = perfectFocusRefresh(
      uncannyMetabolismRefresh(persistentRageTopUp(superiorInspirationTopUp(heroicWarriorTopUp(c))))
    );
    const entry = order.find((e) => e.id === c.id);
    return entry ? { ...refreshed, initiative_roll: entry.roll } : refreshed;
  });
  ctx.st = { ...ctx.st, characters: updatedCharsForInit, initiative_order: order };

  // Refresh char from updated characters array
  const freshChar = updatedCharsForInit.find((c) => c.id === pc.char.id);
  if (freshChar) updatePcActor(ctx, freshChar);
  updatePcActor(ctx, { turn_actions: { ...FRESH_TURN } });

  // ── Initialize grid entities at combat start ────────────────────────
  if (!ctx.st.entities) {
    const gw = ctx.context.gridWidth ?? 8;
    const gh = ctx.context.gridHeight ?? 8;
    const pcEntities: CombatEntity[] = ctx.st.characters.map((c, ci) => ({
      id: c.id,
      isEnemy: false,
      pos: { x: 1 + ci, y: 1 },
      hp: c.hp,
      maxHp: c.max_hp,
      conditions: c.conditions,
      condition_durations: c.condition_durations,
    }));
    const enemyEntities: CombatEntity[] = enemiesForInit.map((en, ei) => ({
      id: en.id,
      isEnemy: true,
      pos: { x: Math.max(0, gw - 2 - ei), y: Math.max(0, gh - 2) },
      hp: en.hp,
      maxHp: en.hp,
      conditions: [],
      condition_durations: {},
    }));
    ctx.st = {
      ...ctx.st,
      entities: [...pcEntities, ...enemyEntities],
      movement_used: {},
    };
  }

  // ── Surprise check (PHB p.189) ────────────────────────────────────
  // If the party averages a higher Stealth than the highest passive
  // Perception among the enemies, all enemies are surprised for round 1.
  const partyAvgStealth = Math.round(
    ctx.st.characters
      .filter((c) => !c.dead)
      .reduce((sum, c) => {
        const prof = c.skill_proficiencies?.includes('Stealth') ?? false;
        return sum + rollDice('1d20') + abilityMod(c.dex) + (prof ? profBonus(c.level) : 0);
      }, 0) / Math.max(1, ctx.st.characters.filter((c) => !c.dead).length)
  );
  const enemyPassivePerc = Math.max(...enemiesForInit.map((e) => 10 + abilityMod(e.wis ?? 10)));
  if (partyAvgStealth > enemyPassivePerc) {
    ctx.st = { ...ctx.st, surprised: enemiesForInit.map((e) => e.id) };
  }

  // RE-1 Phase 4 — materialize persistent ally summons (Animate Dead
  // skeletons, etc.) into entities + initiative now that PC entities and
  // the initiative order exist. initiative_idx is recomputed below from
  // the resulting order so the inserted ally slots don't desync it.
  ctx.st = seedSummonedAllies(ctx.st);

  const orderText = order
    .map((e) => {
      const name = e.is_enemy
        ? (enemiesForInit.find((en) => en.id === e.id)?.name ?? 'Enemy')
        : (ctx.st.characters.find((c) => c.id === e.id)?.name ?? 'Hero');
      return `${name}(${e.roll})`;
    })
    .join(' → ');
  const surpriseLabel =
    enemiesForInit.length === 1
      ? `The ${enemiesForInit[0].name} is SURPRISED!`
      : `${enemiesForInit.map((e) => e.name).join(', ')} are SURPRISED!`;
  const surpriseNote = ctx.st.surprised?.length ? ` ${surpriseLabel}` : '';
  const combatPrefix = ctx.context.narratives.combatStart
    ? pick(ctx.context.narratives.combatStart).replace(/{enemy}/g, target.name) + ' '
    : 'Combat begins! ';
  ctx.narrative = `${combatPrefix}Initiative: ${orderText}.${surpriseNote} `;

  const finalOrder = ctx.st.initiative_order;
  const myInitIdx = finalOrder.findIndex((e) => e.id === pc.char.id);
  ctx.st.initiative_idx = myInitIdx >= 0 ? myInitIdx : 0;

  const myRoll = finalOrder.find((e) => e.id === pc.char.id)?.roll ?? 0;
  // The triggering PC's attack runs immediately — they had the element of
  // surprise on the encounter even if their initiative wasn't highest.
  // After this opening swing, play returns to the initiative order at the
  // slot just past them (handled by the post-attack initiative advance).
  const isHighestInit = myInitIdx === 0;
  ctx.narrative += isHighestInit
    ? `${pc.char.name} acts first (initiative ${myRoll})! `
    : `${pc.char.name} strikes with the opening blow (initiative ${myRoll})! `;
}
