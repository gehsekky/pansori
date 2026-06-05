import type { Character, GameState } from '../../types.js';
import { describe, expect, it } from 'vitest';
import type { ActionContext } from './types.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { handleUse } from './inventory.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from './actor.js';

// Functional adventuring gear wired through handleUse: the Healer's Kit
// stabilizes a dying creature (effect: 'stabilize'); Antitoxin grants a CON
// save with advantage vs poison (effect: 'con_advantage'). The acting PC's
// final state lives on ctx.actor.char; an ally target is committed to ctx.st.

function useCtx(chars: Character[], actorIdx = 0): ActionContext {
  const st = { combat_active: false, characters: chars, entities: [] } as unknown as GameState;
  return {
    actor: pcActor(chars[actorIdx], actorIdx),
    st,
    context: {
      lootTable: [SRD_ITEMS.healers_kit, SRD_ITEMS.antitoxin],
      classSkills: {},
    },
    narrative: '',
  } as unknown as ActionContext;
}

const healer = () =>
  makeChar({
    id: 'pc-1',
    inventory: [{ instance_id: 'hk-1', id: 'healers_kit', name: "Healer's Kit" }],
  });
const downed = () => makeChar({ id: 'pc-2', hp: 0, stable: false, dead: false });

describe("Healer's Kit — stabilize", () => {
  it('stabilizes a downed ally', () => {
    const ctx = useCtx([healer(), downed()]);
    handleUse(ctx, { type: 'use', itemId: 'healers_kit', targetCharId: 'pc-2' });
    const ally = ctx.st.characters.find((c) => c.id === 'pc-2');
    expect(ally?.stable).toBe(true);
    expect(ctx.narrative).toMatch(/stabilized/);
  });

  it('is reusable — the kit is not consumed', () => {
    const ctx = useCtx([healer(), downed()]);
    handleUse(ctx, { type: 'use', itemId: 'healers_kit', targetCharId: 'pc-2' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc');
    expect(ctx.actor.char.inventory?.some((i) => i.id === 'healers_kit')).toBe(true);
  });

  it('does nothing to a healthy target', () => {
    const ctx = useCtx([healer(), makeChar({ id: 'pc-2', hp: 10 })]);
    handleUse(ctx, { type: 'use', itemId: 'healers_kit', targetCharId: 'pc-2' });
    expect(ctx.st.characters.find((c) => c.id === 'pc-2')?.stable).toBeFalsy();
    expect(ctx.narrative).toMatch(/doesn't need stabilizing/);
  });
});

describe('Antitoxin — advantage vs poison', () => {
  it('grants a CON save with advantage and is consumed', () => {
    const ctx = useCtx([
      makeChar({
        id: 'pc-1',
        con: 14,
        inventory: [{ instance_id: 'at-1', id: 'antitoxin', name: 'Antitoxin' }],
      }),
    ]);
    handleUse(ctx, { type: 'use', itemId: 'antitoxin' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc');
    expect(ctx.narrative).toMatch(/advantage/i);
    expect(ctx.actor.char.inventory?.some((i) => i.id === 'antitoxin')).toBe(false);
  });
});
