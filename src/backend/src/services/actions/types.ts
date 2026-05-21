import type {
  Character,
  Context,
  Enemy,
  GameState,
  GridPos,
  LootItem,
  Room,
  Seed,
  StructuredAction,
} from '../../types.js';

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
  readonly safeIdx: number;
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
  char: Character;
  narrative: string;
  escaped: boolean;
  usedInitiative: boolean;

  /**
   * Write `char` back into `st.characters[safeIdx]` and sync HP /
   * conditions into the grid entity when one exists. Mutates `this.st`.
   */
  commitChar(): void;
}

/**
 * Most handlers are "leaf" — they mutate ctx fields and return nothing.
 *
 * A few are "transformers" — actions that don't resolve directly but
 * yield to another action. Two flavors:
 *
 * - `replaceWith`: the original action *becomes* the new one. The
 *   handler may stage pre-mutations (e.g. attack_npc flipping NPC
 *   attitude to hostile), then `dispatchAction` bubbles the new action
 *   up to `takeAction`, which re-enters from the top with the new
 *   action and the staged state. The outer takeAction's epilogue is
 *   skipped — the recursive call runs its own.
 *
 * - `delegateTo`: the handler does the trigger work (e.g. use_reaction
 *   marks the reaction consumed and emits a "triggers their readied
 *   action!" prefix), then yields to an inner action that runs against
 *   the *same* ctx. The inner mutations stack; the outer's narrative
 *   prefix is preserved. The outer takeAction's epilogue runs once,
 *   over the combined state. (Different semantics from replaceWith:
 *   delegateTo wraps; replaceWith replaces.)
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
  | { replaceWith: StructuredAction }
  | { delegateTo: StructuredAction };

export type ActionHandler<A extends StructuredAction = StructuredAction> = (
  ctx: ActionContext,
  action: A
) => HandlerResult | Promise<HandlerResult>;
