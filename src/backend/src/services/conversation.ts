import type { NpcDialogueResponse, PlacedNpc } from '../types.js';

/**
 * The dialogue responses available at a conversation node. `nodePath` is the
 * stable node ids descended from the root (root → `npc.responses`); each step
 * descends into the matching response's `responses` children. Returns [] if the
 * path doesn't resolve. Shared by the social handlers + generateChoices (kept
 * dependency-free to avoid a gameEngine ↔ social import cycle).
 */
export function responsesAtNodePath(npc: PlacedNpc, nodePath: string[]): NpcDialogueResponse[] {
  let node: NpcDialogueResponse[] = npc.responses;
  for (const id of nodePath) {
    const next = node.find((r) => r.id === id)?.responses;
    if (!next) return [];
    node = next;
  }
  return node;
}
