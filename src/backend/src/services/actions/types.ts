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

export type ActionHandler<A extends StructuredAction = StructuredAction> = (
  ctx: ActionContext,
  action: A
) => void | Promise<void>;
