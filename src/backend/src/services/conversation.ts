import type { NpcDialogueResponse, PlacedNpc } from '../types.js';

/**
 * The dialogue responses available at a conversation node. `path` indexes the
 * nested response tree (root → `npc.responses`); each step descends into the
 * chosen response's `responses` children. Returns [] if the path is invalid.
 * Shared by the social handlers + generateChoices (kept dependency-free to
 * avoid a gameEngine ↔ social import cycle).
 */
export function responsesAtPath(npc: PlacedNpc, path: number[]): NpcDialogueResponse[] {
  let node: NpcDialogueResponse[] = npc.responses;
  for (const idx of path) {
    const next = node[idx]?.responses;
    if (!next) return [];
    node = next;
  }
  return node;
}
