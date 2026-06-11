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

/**
 * The nodePath from the root to a target node id (inclusive) — i.e. the cursor
 * whose children are that node's `responses`. Used by `goto` (hub-and-spoke) to
 * jump the conversation there. Returns null if the id isn't found in the tree.
 */
export function pathToNode(npc: PlacedNpc, targetId: string): string[] | null {
  const walk = (responses: NpcDialogueResponse[], prefix: string[]): string[] | null => {
    for (const r of responses) {
      const here = [...prefix, r.id ?? ''];
      if (r.id === targetId) return here;
      const found = r.responses ? walk(r.responses, here) : null;
      if (found) return found;
    }
    return null;
  };
  return walk(npc.responses, []);
}
