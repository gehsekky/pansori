/**
 * Composer — turns `NarrativeFragment[]` into prose + CombatEvents.
 *
 * Invoked from `takeAction` after the handler returns successfully.
 * For each fragment in `ctx.fragments`, picks the matching renderer,
 * appends the rendered prose to `ctx.narrative`, and pushes a
 * `CombatEvent` to `ctx.st.combat_log` via `pushEvent`.
 *
 * Renderers reuse existing engine prose helpers (`buildCombatHitNarrative`,
 * `hpTier`, `pickTiered`, `pick`) rather than rebuilding them — the
 * narrative output is identical to the pre-migration handler prose,
 * just produced from a structured source.
 */

import type {
  AttackHitFragment,
  AttackKillFragment,
  AttackMissFragment,
  ConditionAppliedFragment,
  EnemyAttackHitFragment,
  EnemyAttackMissFragment,
  NarrativeFragment,
  SaveFragment,
  SpellAttackHitFragment,
  SpellAttackMissFragment,
  SpellAutoHitFragment,
  SpellHealFragment,
  SpellMultiTargetFragment,
  SpellSaveConditionFragment,
  SpellSaveDamageFragment,
  SpellUtilityFragment,
} from './fragments.js';
import type { Character, CombatEvent } from '../../types.js';
import { buildCombatHitNarrative, hpTier, pick, pickTiered, pushEvent } from '../gameEngine.js';
import type { ActionContext } from '../actions/types.js';
import { fmt } from '../narrativeFmt.js';

function lookupAttacker(attackerId: string, ctx: ActionContext): Character {
  const active = ctx.actor.kind === 'pc' ? ctx.actor.char : ctx.st.characters[0];
  if (active.id === attackerId) return active;
  const c = ctx.st.characters.find((c) => c.id === attackerId);
  if (!c) {
    // Defensive: fragments are pushed by handlers running inside
    // takeAction; the attacker is the active char. If a future
    // emission site fires a fragment for a non-active character
    // (e.g. opportunity-attack composed across PCs) and that char
    // isn't in state, fall through to the active char so the composer
    // doesn't crash a session.
    return active;
  }
  return c;
}

/**
 * Per-renderer return shape. `events` is an array because some
 * fragments emit multiple `CombatEvent`s (e.g. multi-target spells
 * fire one `attack_hit` per dart) and some emit none (heal / utility
 * — no log event today). The composer iterates the array, calling
 * `pushEvent` for each.
 */
export interface ComposedFragment {
  prose: string;
  events: CombatEvent[];
}

export function renderAttackHit(f: AttackHitFragment, ctx: ActionContext): ComposedFragment {
  const attacker = lookupAttacker(f.attackerId, ctx);
  let prose = buildCombatHitNarrative(
    f.target,
    f.weapon,
    f.damage,
    f.isCrit,
    attacker,
    ctx.context
  );
  prose += f.atkNote;
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  const event: CombatEvent = {
    kind: 'attack_hit',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    targetId: f.target.id,
    targetName: f.target.name,
    damage: f.damage,
    damageType: f.damageType,
    isCrit: f.isCrit,
    toHit: f.toHit,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose, events: [event] };
}

export function renderAttackMiss(f: AttackMissFragment, ctx: ActionContext): ComposedFragment {
  const attacker = lookupAttacker(f.attackerId, ctx);
  let prose: string;
  if (f.reason === 'fumble') {
    prose = `Natural 1 — a fumble! ${f.weaponLabel} goes completely wide.${f.atkNote}`;
  } else {
    prose = pickTiered(ctx.context.narratives.combatMiss, hpTier(attacker)).replace(
      /\{enemy\}/g,
      f.target.name
    );
    prose += f.atkNote + ' ';
  }
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  // Fumble path appends a trailing space to match the pre-migration
  // " " between fumble prose and any subsequent narrative.
  if (f.reason === 'fumble') prose += ' ';
  const event: CombatEvent = {
    kind: 'attack_miss',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    targetId: f.target.id,
    targetName: f.target.name,
    toHit: f.toHit,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose, events: [event] };
}

export function renderAttackKill(f: AttackKillFragment, ctx: ActionContext): ComposedFragment {
  // killProse currently carries the pick()'d killShot pool entry with
  // {enemy}/{name} substitutions already applied. Use it verbatim.
  // The pool-pick lives in `applyPartyLevelUps`/post-hit logic today;
  // future PRs may move it into this composer.
  void pick; // re-export anchor — pool picking moves here in a later PR
  const event: CombatEvent = {
    kind: 'kill',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    victimId: f.victimId,
    victimName: f.victimName,
    xp: f.xp,
    round: ctx.st.round ?? 1,
  };
  return { prose: f.killProse, events: [event] };
}

export function renderSpellAttackHit(
  f: SpellAttackHitFragment,
  ctx: ActionContext
): ComposedFragment {
  // Mirrors the pre-migration single-target spell-hit prose:
  //   "<castPrefix>!<atkNote> [Critical spell hit! ]<dmg> <type> damage!<bonuses>"
  let prose = `${f.castPrefix}!${f.atkNote} `;
  if (f.isCrit) prose += 'Critical spell hit! ';
  prose += `${fmt.dmg(f.damage)} ${f.damageType} damage!`;
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  const event: CombatEvent = {
    kind: 'attack_hit',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    targetId: f.target.id,
    targetName: f.target.name,
    damage: f.damage,
    damageType: f.damageType || 'spell',
    isCrit: f.isCrit,
    toHit: f.toHit,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose, events: [event] };
}

export function renderSpellAttackMiss(
  f: SpellAttackMissFragment,
  ctx: ActionContext
): ComposedFragment {
  // Pre-migration miss prose: "<castPrefix> — MISS!<atkNote>"
  let prose = `${f.castPrefix} — MISS!${f.atkNote}`;
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  const event: CombatEvent = {
    kind: 'attack_miss',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    targetId: f.target.id,
    targetName: f.target.name,
    toHit: f.toHit,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose, events: [event] };
}

export function renderSpellHeal(f: SpellHealFragment, ctx: ActionContext): ComposedFragment {
  void ctx;
  const subject = f.isSelf ? 'self' : f.targetName;
  let prose = `${f.castPrefix} — restores ${f.healed} HP to ${subject} (now ${f.targetNewHp}/${f.targetMaxHp}).`;
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  // No CombatEvent today — heals don't appear in combat_log. A future
  // `heal` event kind can land alongside this renderer when wanted.
  return { prose, events: [] };
}

export function renderSpellUtility(f: SpellUtilityFragment, ctx: ActionContext): ComposedFragment {
  void ctx;
  return { prose: f.prose, events: [] };
}

export function renderSpellSaveDamage(
  f: SpellSaveDamageFragment,
  ctx: ActionContext
): ComposedFragment {
  const saveVerb = f.saveFailed ? 'fails' : 'succeeds';
  let prose = `${f.castPrefix}! (${fmt.dc(f.saveDC)} ${f.saveAbility} save — ${f.target.name} ${saveVerb}.) `;
  prose += f.damage > 0 ? `${fmt.dmg(f.damage)} ${f.damageType} damage!` : 'No damage.';
  if (!f.saveFailed && f.halfOnSave) prose += ' (half damage)';
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  // Damage outcome lands in combat_log as attack_hit so save-spell
  // damage shows alongside weapon and attack-roll spell hits. A
  // future `save` CombatEvent kind would render the save itself
  // distinctly; for now the damage event is the player-visible
  // record.
  const events: CombatEvent[] = [];
  if (f.damage > 0) {
    events.push({
      kind: 'attack_hit',
      attackerId: f.attackerId,
      attackerName: f.attackerName,
      targetId: f.target.id,
      targetName: f.target.name,
      damage: f.damage,
      damageType: f.damageType || 'spell',
      isCrit: false,
      toHit: 0,
      targetAc: f.target.ac,
      round: ctx.st.round ?? 1,
    });
  }
  return { prose, events };
}

export function renderSpellSaveCondition(
  f: SpellSaveConditionFragment,
  ctx: ActionContext
): ComposedFragment {
  void ctx;
  const saveVerb = f.saveFailed ? 'fails' : 'succeeds';
  // Pre-migration format used raw "DC X" not fmt.dc — preserve that here
  // for byte-identical output. (Other save-path callers use fmt.dc.)
  const prose = `${f.castPrefix}! (DC ${f.saveDC} ${f.saveAbility} save — ${f.target.name} ${saveVerb}.)`;
  // The condition_applied event (when condition lands) is still
  // emitted via pushEvent in the handler today — this fragment only
  // covers the save-roll narrative + outcome word. Migrating
  // condition_applied to a fragment kind is a 4C.3 task (see TODO).
  return { prose, events: [] };
}

export function renderSpellAutoHit(f: SpellAutoHitFragment, ctx: ActionContext): ComposedFragment {
  let prose = `${f.castPrefix}! Auto-hit — ${fmt.dmg(f.damage)} ${f.damageType} damage!`;
  for (const bonus of f.bonuses ?? []) {
    prose += ` ${fmt.note(`[${bonus.label}]`)}`;
  }
  const event: CombatEvent = {
    kind: 'attack_hit',
    attackerId: f.attackerId,
    attackerName: f.attackerName,
    targetId: f.target.id,
    targetName: f.target.name,
    damage: f.damage,
    damageType: f.damageType || 'spell',
    isCrit: false,
    toHit: 0,
    targetAc: f.target.ac,
    round: ctx.st.round ?? 1,
  };
  return { prose, events: [event] };
}

export function renderSpellMultiTarget(
  f: SpellMultiTargetFragment,
  ctx: ActionContext
): ComposedFragment {
  // Pre-migration format:
  //   "<castPrefix>! dart 1 → goblin: 4. dart 2 → kobold: 6 (killed). Total: 10 force."
  const prose = `${f.castPrefix}! ${f.labels.join(' ')} Total: ${f.totalDamage} ${f.damageType || 'damage'}.`;
  // Emit one attack_hit per damaged target. Skip zero-damage entries
  // (the "missed" dart case, currently rare but possible if a target
  // immune to the damage type is hit).
  const events: CombatEvent[] = [];
  for (const hit of f.hits) {
    if (hit.damage <= 0) continue;
    events.push({
      kind: 'attack_hit',
      attackerId: f.attackerId,
      attackerName: f.attackerName,
      targetId: hit.enemyId,
      targetName: hit.enemyName,
      damage: hit.damage,
      damageType: f.damageType || 'spell',
      isCrit: false,
      toHit: 0,
      targetAc: hit.targetAc,
      round: ctx.st.round ?? 1,
    });
  }
  return { prose, events };
}

export function renderSave(f: SaveFragment, ctx: ActionContext): ComposedFragment {
  const event: CombatEvent = {
    kind: 'save',
    characterId: f.characterId,
    characterName: f.characterName,
    ability: f.ability,
    roll: f.roll,
    dc: f.dc,
    success: f.success,
    vs: f.vs,
    round: ctx.st.round ?? 1,
  };
  return { prose: f.prose, events: [event] };
}

export function renderConditionApplied(
  f: ConditionAppliedFragment,
  ctx: ActionContext
): ComposedFragment {
  const event: CombatEvent = {
    kind: 'condition_applied',
    targetId: f.targetId,
    targetName: f.targetName,
    condition: f.condition,
    source: f.source,
    round: ctx.st.round ?? 1,
  };
  return { prose: f.prose, events: [event] };
}

export function renderEnemyAttackHit(
  f: EnemyAttackHitFragment,
  ctx: ActionContext
): ComposedFragment {
  const event: CombatEvent = {
    kind: 'attack_hit',
    attackerId: f.attackerEnemyId,
    attackerName: f.attackerName,
    targetId: f.targetCharId,
    targetName: f.targetName,
    damage: f.damage,
    damageType: f.damageType,
    isCrit: false,
    toHit: f.atkTotal,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose: f.prose, events: [event] };
}

export function renderEnemyAttackMiss(
  f: EnemyAttackMissFragment,
  ctx: ActionContext
): ComposedFragment {
  const event: CombatEvent = {
    kind: 'attack_miss',
    attackerId: f.attackerEnemyId,
    attackerName: f.attackerName,
    targetId: f.targetCharId,
    targetName: f.targetName,
    toHit: f.atkTotal,
    targetAc: f.targetAc,
    round: ctx.st.round ?? 1,
  };
  return { prose: f.prose, events: [event] };
}

function renderFragment(f: NarrativeFragment, ctx: ActionContext): ComposedFragment {
  switch (f.kind) {
    case 'attack_hit':
      return renderAttackHit(f, ctx);
    case 'attack_miss':
      return renderAttackMiss(f, ctx);
    case 'attack_kill':
      return renderAttackKill(f, ctx);
    case 'spell_attack_hit':
      return renderSpellAttackHit(f, ctx);
    case 'spell_attack_miss':
      return renderSpellAttackMiss(f, ctx);
    case 'spell_heal':
      return renderSpellHeal(f, ctx);
    case 'spell_utility':
      return renderSpellUtility(f, ctx);
    case 'spell_save_damage':
      return renderSpellSaveDamage(f, ctx);
    case 'spell_save_condition':
      return renderSpellSaveCondition(f, ctx);
    case 'spell_auto_hit':
      return renderSpellAutoHit(f, ctx);
    case 'spell_multi_target':
      return renderSpellMultiTarget(f, ctx);
    case 'save':
      return renderSave(f, ctx);
    case 'condition_applied':
      return renderConditionApplied(f, ctx);
    case 'enemy_attack_hit':
      return renderEnemyAttackHit(f, ctx);
    case 'enemy_attack_miss':
      return renderEnemyAttackMiss(f, ctx);
  }
}

/**
 * Compose every fragment in `ctx.fragments`: append rendered prose to
 * `ctx.narrative` and push each emitted `CombatEvent` to
 * `ctx.st.combat_log`. No-op when fragments is empty (the common
 * unmigrated-handler path).
 *
 * Idempotent assumption: handlers push fragments and don't read
 * back. The composer runs once per `takeAction` after the handler
 * (and after any delegateTo recursion) returns.
 */
export function composeFragments(ctx: ActionContext): void {
  if (!ctx.fragments || ctx.fragments.length === 0) return;
  for (const f of ctx.fragments) {
    const { prose, events } = renderFragment(f, ctx);
    ctx.narrative += prose;
    for (const event of events) {
      ctx.st = pushEvent(ctx.st, event);
    }
  }
  // Drain so a re-entry (replaceWith chain) doesn't double-compose.
  ctx.fragments = [];
}

/**
 * Render and emit a single fragment immediately — append prose to
 * `ctx.narrative` and push each event to `ctx.st`. Use this from
 * handler bodies where the relative order of events in
 * `state.combat_log` matters (e.g. attack_hit must precede any
 * post-hit condition_applied events).
 *
 * `composeFragments` is for batched end-of-handler rendering;
 * `composeNow` is for inline use at the exact point a fragment
 * conceptually lands.
 */
export function composeNow(ctx: ActionContext, f: NarrativeFragment): void {
  const { prose, events } = renderFragment(f, ctx);
  ctx.narrative += prose;
  for (const event of events) {
    ctx.st = pushEvent(ctx.st, event);
  }
}

/**
 * Adapter for non-ctx callers (the enemy turn loop and legendary
 * actions in `gameEngine.ts`) that work with raw `GameState` and a
 * local `narrative` string. Maps an enemy_attack_hit / _miss
 * fragment to the matching `CombatEvent`. The caller appends
 * `fragment.prose` to its narrative separately and pushes this event
 * via `pushEvent`.
 */
export function enemyAttackFragmentEvent(
  fragment: EnemyAttackHitFragment | EnemyAttackMissFragment,
  round: number
): CombatEvent {
  if (fragment.kind === 'enemy_attack_hit') {
    return {
      kind: 'attack_hit',
      attackerId: fragment.attackerEnemyId,
      attackerName: fragment.attackerName,
      targetId: fragment.targetCharId,
      targetName: fragment.targetName,
      damage: fragment.damage,
      damageType: fragment.damageType,
      isCrit: false,
      toHit: fragment.atkTotal,
      targetAc: fragment.targetAc,
      round,
    };
  }
  return {
    kind: 'attack_miss',
    attackerId: fragment.attackerEnemyId,
    attackerName: fragment.attackerName,
    targetId: fragment.targetCharId,
    targetName: fragment.targetName,
    toHit: fragment.atkTotal,
    targetAc: fragment.targetAc,
    round,
  };
}
