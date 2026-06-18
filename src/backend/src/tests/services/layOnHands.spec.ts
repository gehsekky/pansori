// RE-2 — Paladin Lay on Hands (SRD 5.2.1, L1). Pool = 5 × Paladin level,
// spent via a bonus-action touch heal (capped at the pool and the target's
// missing HP), replenished on a long rest. Tracked as points used on
// `class_resource_uses.lay_on_hands`.

import { describe, expect, it } from 'vitest';
import type { ActionContext } from '../../services/actions/types.js';
import { handleLayOnHands } from '../../services/actions/layOnHands.js';
import { layOnHandsRemaining } from '../../services/multiclass.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from '../../services/actions/actor.js';

describe('layOnHandsRemaining', () => {
  it('is 5 × Paladin level, minus points spent', () => {
    expect(layOnHandsRemaining(makeChar({ character_class: 'Paladin', level: 3 }))).toBe(15);
    expect(
      layOnHandsRemaining(
        makeChar({ character_class: 'Paladin', level: 3, class_resource_uses: { lay_on_hands: 5 } })
      )
    ).toBe(10);
  });

  it('is 0 for non-paladins', () => {
    expect(layOnHandsRemaining(makeChar({ character_class: 'Wizard', level: 20 }))).toBe(0);
  });
});

function ctxFor(
  caster: ReturnType<typeof makeChar>,
  party: ReturnType<typeof makeChar>[],
  combat = false
): ActionContext {
  return {
    actor: pcActor(caster, 0),
    st: { characters: party, entities: [], combat_active: combat },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleLayOnHands', () => {
  it('heals an injured ally, spending only what is used', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 20, max_hp: 20 });
    const ally = makeChar({ id: 'ally', character_class: 'Fighter', level: 3, hp: 18, max_hp: 20 });
    const ctx = ctxFor(pal, [pal, ally]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally' });
    expect(ctx.st.characters.find((c) => c.id === 'ally')?.hp).toBe(20); // +2
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.class_resource_uses.lay_on_hands).toBe(2); // only 2 spent
  });

  it('heals self, capped at the pool', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 4, max_hp: 30 });
    const ctx = ctxFor(pal, [pal]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'pal' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.hp).toBe(19); // 4 + min(26 missing, 15 pool) = 4 + 15
    expect(ctx.actor.char.class_resource_uses.lay_on_hands).toBe(15); // pool emptied
  });

  it('consumes the bonus action in combat', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 20, max_hp: 20 });
    const ally = makeChar({ id: 'ally', hp: 10, max_hp: 20 });
    const ctx = ctxFor(pal, [pal, ally], true);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally' });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.turn_actions.bonus_action_used).toBe(true);
  });

  it('rejects a non-paladin', () => {
    const wiz = makeChar({ id: 'wiz', character_class: 'Wizard', level: 5, hp: 10, max_hp: 20 });
    expect(
      handleLayOnHands(ctxFor(wiz, [wiz]), { type: 'lay_on_hands', targetCharId: 'wiz' })
    ).toMatchObject({ rejected: expect.stringContaining('Paladin') });
  });

  it('reports an empty pool without healing', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      level: 3,
      hp: 20,
      max_hp: 20,
      class_resource_uses: { lay_on_hands: 15 },
    });
    const ally = makeChar({ id: 'ally', hp: 10, max_hp: 20 });
    const ctx = ctxFor(pal, [pal, ally]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally' });
    expect(ctx.narrative).toContain('empty');
    expect(ctx.st.characters.find((c) => c.id === 'ally')?.hp).toBe(10); // unchanged
  });

  it('does nothing for a full-HP target', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 20, max_hp: 20 });
    const ctx = ctxFor(pal, [pal]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'pal' });
    expect(ctx.narrative).toContain('full');
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.class_resource_uses.lay_on_hands ?? 0).toBe(0); // nothing spent
  });
});

describe('handleLayOnHands — poison-cure (SRD: 5 points to end Poisoned)', () => {
  it('ends Poisoned on an ally for a flat 5 points, restoring no HP', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 20, max_hp: 20 });
    const ally = makeChar({
      id: 'ally',
      hp: 10,
      max_hp: 20,
      conditions: ['poisoned', 'prone'],
    });
    const ctx = ctxFor(pal, [pal, ally]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally', cure: true });
    const after = ctx.st.characters.find((c) => c.id === 'ally');
    expect(after?.conditions).toEqual(['prone']); // poisoned gone, prone kept
    expect(after?.hp).toBe(10); // no HP restored
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.class_resource_uses.lay_on_hands).toBe(5); // flat cost
  });

  it('cures self, syncing the caster conditions', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      level: 3,
      hp: 20,
      max_hp: 20,
      conditions: ['poisoned'],
    });
    const ctx = ctxFor(pal, [pal]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'pal', cure: true });
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.conditions).toEqual([]);
    expect(ctx.actor.char.class_resource_uses.lay_on_hands).toBe(5);
  });

  it('no-ops when the target is not Poisoned', () => {
    const pal = makeChar({ id: 'pal', character_class: 'Paladin', level: 3, hp: 20, max_hp: 20 });
    const ally = makeChar({ id: 'ally', hp: 10, max_hp: 20, conditions: [] });
    const ctx = ctxFor(pal, [pal, ally]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally', cure: true });
    expect(ctx.narrative).toContain('not Poisoned');
    if (ctx.actor.kind !== 'pc') throw new Error('expected pc actor');
    expect(ctx.actor.char.class_resource_uses.lay_on_hands ?? 0).toBe(0); // nothing spent
  });

  it('refuses when the pool cannot pay the flat 5', () => {
    const pal = makeChar({
      id: 'pal',
      character_class: 'Paladin',
      level: 1, // pool = 5
      hp: 20,
      max_hp: 20,
      class_resource_uses: { lay_on_hands: 2 }, // only 3 left
    });
    const ally = makeChar({ id: 'ally', hp: 10, max_hp: 20, conditions: ['poisoned'] });
    const ctx = ctxFor(pal, [pal, ally]);
    handleLayOnHands(ctx, { type: 'lay_on_hands', targetCharId: 'ally', cure: true });
    expect(ctx.narrative).toMatch(/only 3 left/);
    expect(ctx.st.characters.find((c) => c.id === 'ally')?.conditions).toEqual(['poisoned']);
  });
});
