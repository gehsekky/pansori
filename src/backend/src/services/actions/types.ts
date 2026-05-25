import type {
  Context,
  Enemy,
  GameState,
  GridPos,
  LootItem,
  Room,
  Seed,
  StructuredAction,
} from '../../types.js';
import type { Actor } from './actor.js';
import type { EnemySubAttackResult } from '../gameEngine.js';
import type { NarrativeFragment } from '../narrative/fragments.js';

/**
 * Mutable context passed to every action handler. Mirrors the local
 * let/const bindings that the inline switch in `takeAction` closes over.
 * Handlers read immutable fields and mutate working-state fields in
 * place; `takeAction` reads the mutated fields back out into its local
 * bindings for the post-switch epilogue.
 */
export interface ActionContext {
  // Immutable inputs
  readonly context: Context;
  /** Pre-action world snapshot. Use `st` for the live working state. */
  readonly state: GameState;
  readonly worldName: string;
  readonly prevRoomId: string;

  // Derived once from initial state. Stale after a room change — handlers
  // that move the party must recompute locally rather than re-reading.
  readonly roomId: string;
  readonly roomObstacleCells: GridPos[];
  readonly livingEnemiesInRoom: Enemy[];
  readonly enemy: Enemy | undefined;
  readonly enemyAlive: boolean;
  readonly loot: LootItem | undefined;
  readonly lootAvail: boolean | undefined;
  readonly adjacent: Room[];

  // Working state — handlers mutate via wholesale replacement
  /** Reassigned only by the `travel` handler. */
  seed: Seed;
  st: GameState;
  /**
   * Polymorphic actor reference — the sole source of truth for who is
   * acting. For PC turns this is `{ kind: 'pc', char, safeIdx }`; read
   * the character via `ctx.actor.char` after narrowing
   * `ctx.actor.kind === 'pc'` (or bind `const { char } = ctx.actor`),
   * and mutate it through `updatePcActor(ctx, patch)`. The legacy
   * `ctx.char` / `ctx.safeIdx` mirror fields were removed in RE-1
   * Phase 5. See `services/actions/actor.ts`.
   */
  actor: Actor;
  narrative: string;
  escaped: boolean;
  usedInitiative: boolean;
  /**
   * Structured emission queue (see services/narrative/fragments.ts).
   * Migrated handlers push fragments here instead of doing
   * `ctx.narrative += ...` + `pushEvent(...)` in parallel; the composer
   * (`services/narrative/compose.ts`) runs after the handler returns,
   * appends rendered prose to `narrative`, and pushes the corresponding
   * `CombatEvent` to `st.combat_log`. Unmigrated handlers push nothing
   * and the composer is a no-op for them.
   */
  fragments: NarrativeFragment[];

  /**
   * Sorcerer Metamagic active for THIS cast — captured by `runPrecast`
   * from `st.metamagic_active` (set by the prior metamagic activation),
   * which it then clears so the modifier applies to exactly one spell.
   * Cast-pipeline branches read it (Distant range, Subtle components,
   * Heightened save, Extended duration, Empowered/Twinned/Transmuted/
   * Seeking/Careful). Undefined when no metamagic is active.
   */
  metamagic?: string[];

  /**
   * Evoker Overchannel active for THIS cast — set by `runPrecast` when the
   * `overchannel` action flag passes its gates (Evoker L14, level 1-5 slot,
   * damaging spell). The damage-roll sites maximize their dice when true.
   */
  overchannel?: boolean;

  /**
   * EE-2 side-channel — the `enemy_attack` handler reports its
   * `resolveEnemySubAttack` outcome (paused / killed-massive / done +
   * the updated target) here, since `DispatchResult` can't carry it.
   * The enemy multiattack loop reads it after `dispatchAction`. Only
   * set by `handleEnemyAttack`.
   */
  enemySubAttack?: EnemySubAttackResult;

  /**
   * EE-4 side-channel — the `enemy_move` handler reports its approach
   * outcome here (proceed-to-attack vs skip-turn, and whether the
   * `[Name's turn]` header was already printed). The enemy-turn loop reads
   * it after `dispatchAction`. Only set by `handleEnemyMove`.
   */
  enemyApproach?: { kind: 'proceed-to-attack' | 'skip-turn'; movementHeaderPrinted: boolean };

  /**
   * 2024 PHB PC-turn d20 reaction window — side-channel for the
   * attack-handler orchestrator to detect hit/miss + capture the
   * inputs needed to re-resolve on Heroic Inspiration reroll. Set by
   * resolveOneAttack after each attack; consumed by attack/index.ts
   * to decide whether to pause for a reaction. Optional because
   * unrelated handlers (cast_spell, sneak, etc.) never set it.
   */
  lastAttackResult?: {
    hit: boolean;
    fumble: boolean;
    critical: boolean;
    d20: number;
    total: number;
    atkMod: number;
    prof: number;
    attackBonus: number;
    targetAc: number;
  };

  /**
   * Write the PC actor's `char` back into `st.characters` and sync HP /
   * conditions into the grid entity when one exists. Mutates `this.st`.
   */
  commitChar(): void;
}

/**
 * Most handlers are "leaf" — they mutate ctx fields and return nothing.
 *
 * Result variants:
 *
 * - `void` — successful leaf handler. Dispatcher post-deducts the
 *   declared cost from `ACTION_COSTS` (no-op for 'managed').
 *
 * - `{ rejected: string }` — validation early-exit. Dispatcher sets
 *   `ctx.narrative` to the rejection message and skips the cost
 *   deduction. Use for cases like "no enemy to target" or "you can
 *   only dodge in combat" where the action wasn't actually performed.
 *
 * - `replaceWith`: the original action *becomes* the new one. The
 *   handler may stage pre-mutations (e.g. attack_npc flipping NPC
 *   attitude to hostile), then `dispatchAction` bubbles the new action
 *   up to `takeAction`, which re-enters from the top with the new
 *   action and the staged state. The outer takeAction's epilogue is
 *   skipped — the recursive call runs its own. Outer cost is NOT
 *   deducted (the re-dispatched action pays its own).
 *
 * - `delegateTo`: the handler does the trigger work (e.g. use_reaction
 *   marks the reaction consumed and emits a "triggers their readied
 *   action!" prefix), then yields to an inner action that runs against
 *   the *same* ctx. The inner mutations stack; the outer's narrative
 *   prefix is preserved. The outer takeAction's epilogue runs once,
 *   over the combined state. The outer cost IS deducted (the wrapper
 *   spent its slot); the inner action pays its own cost during the
 *   nested dispatch.
 *
 * Future 5.5e rules that fit this shape:
 *   replaceWith → Eldritch Strike (attack swap), Beast Form attack
 *                 override, scroll-cast spell.
 *   delegateTo  → Counterspell (reactive cast vs another cast),
 *                 War Caster (cast as reaction), Mounted Combatant
 *                 (transfer damage and resolve attack).
 */
export type HandlerResult =
  | void
  | { rejected: string }
  | { replaceWith: StructuredAction }
  | { delegateTo: StructuredAction };

export type ActionHandler<A extends StructuredAction = StructuredAction> = (
  ctx: ActionContext,
  action: A
) => HandlerResult | Promise<HandlerResult>;
