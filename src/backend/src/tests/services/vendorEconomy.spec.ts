// Vendor economy — daily stock, the vendor wallet, and the SELL side.
//   Stock: shop entries may carry qty (absent = unlimited); remaining count
//     is session state, and every vendor restocks at the start of each
//     in-game day (world_minute / 1440).
//   Wallet: shopGold caps what a vendor can pay when the party SELLS; the
//     party's purchases replenish it. Absent = unlimited.
//   Sell: vendors buy back only what THEY stock, at half their sale price.

import type { PlacedNpc, Seed } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

const ROOM = 'market';

const hob: PlacedNpc = {
  roomId: ROOM,
  id: 'hob',
  name: 'Hob',
  attitude: 'friendly',
  hp: 4,
  ac: 10,
  damage: '1d4',
  toHit: 0,
  xp: 0,
  greeting: 'Wares for coin.',
  responses: [],
  shop: [
    { itemId: 'healing_potion', price: 50, qty: 2 },
    { itemId: 'dagger', price: 4 }, // unlimited
  ],
  shopGold: 20,
};

const seed = {
  context_id: ctx.id,
  world_name: 'Market Test',
  ship_name: 'Market Test',
  intro: '',
  seed_id: 'market',
  rooms: [{ id: ROOM, name: 'Market Row', desc: '' }],
  enemies: {},
  loot: {},
  npcs: { hob },
} as unknown as Seed;

function shopper(gold = 500, inventory: object[] = []) {
  const pc = makeChar({ id: 'pc-1', gold, inventory: inventory as never });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ROOM, npc_talked: ['hob'] }),
    characters: [pc],
    active_character_id: 'pc-1',
  };
}

const act = (
  state: ReturnType<typeof shopper>,
  action: Parameters<typeof takeAction>[0]['action']
) => takeAction({ action, history: [], state, seed, context: ctx });

async function openShop(state: ReturnType<typeof shopper>) {
  let r = await act(state, { type: 'talk', npcId: 'hob' });
  r = await act(r.newState, { type: 'enter_shop' });
  return r;
}

const vendorLabels = (state: ReturnType<typeof shopper>) =>
  generateChoices(state, seed, ctx)
    .filter((c) => c.kind === 'vendor')
    .map((c) => c.label);

describe('daily stock', () => {
  it('finite entries show remaining, deplete per buy, and drop off at zero', async () => {
    let r = await openShop(shopper());
    expect(r.narrative).toContain('Hob is carrying 20cr');
    expect(vendorLabels(r.newState)).toContain('Buy Healing Potion — 50cr (2 left)');
    expect(vendorLabels(r.newState)).toContain('Buy Dagger — 4cr'); // unlimited: no note
    r = await act(r.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    expect(vendorLabels(r.newState)).toContain('Buy Healing Potion — 50cr (1 left)');
    r = await act(r.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    expect(vendorLabels(r.newState).some((l) => l.includes('Buy Healing Potion'))).toBe(false);
    // A direct buy of the sold-out entry is refused.
    const sold = await act(r.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    expect(sold.narrative).toContain('sold out');
    expect(sold.newState.characters[0].gold).toBe(r.newState.characters[0].gold);
  });

  it('the next in-game day restocks stock AND wallet', async () => {
    let r = await openShop(shopper());
    r = await act(r.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    r = await act(r.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    // Roll the clock past midnight and re-open the shop.
    const nextDay = { ...r.newState, world_minute: (r.newState.world_minute ?? 0) + 1440 };
    let r2 = await act(nextDay, { type: 'exit_shop' });
    r2 = await act(r2.newState, { type: 'enter_shop' });
    expect(vendorLabels(r2.newState)).toContain('Buy Healing Potion — 50cr (2 left)');
    expect(r2.narrative).toContain('Hob is carrying 20cr'); // wallet reset too
  });
});

describe('the sell side + the vendor wallet', () => {
  const potion = (instance: string) => ({
    id: 'healing_potion',
    name: 'Healing Potion',
    type: 'consumable',
    instance_id: instance,
  });

  it('sells at half the vendor price; the item leaves the pack, gold moves both ways', async () => {
    const dagger = (instance: string) => ({
      id: 'dagger',
      name: 'Dagger',
      type: 'weapon',
      instance_id: instance,
    });
    let r = await openShop(shopper(0, [dagger('d1'), dagger('d2')]));
    // Half of Hob's 4cr dagger price = 2cr; his 20cr wallet covers it.
    expect(vendorLabels(r.newState)).toContain('Sell Dagger — 2cr (have 2)');
    r = await act(r.newState, { type: 'sell', itemId: 'dagger' });
    expect(r.narrative).toContain('counts out 2cr');
    expect(r.newState.characters[0].gold).toBe(2);
    expect(r.newState.characters[0].inventory).toHaveLength(1);
    expect(r.newState.shop_gold?.hob).toBe(18); // the wallet paid it out
  });

  it('the wallet caps selling: a broke vendor refuses until the party buys', async () => {
    // Wallet 20 < the 25cr the potion fetches — no sell offered or accepted.
    let r = await openShop(shopper(100, [potion('p1')]));
    expect(vendorLabels(r.newState).some((l) => l.startsWith('Sell Healing Potion'))).toBe(false);
    const refused = await act(r.newState, { type: 'sell', itemId: 'healing_potion' });
    expect(refused.narrative).toContain('empty pockets');
    // Buying a dagger (4cr) lifts the wallet to 24 — still short. Buy a
    // potion (50cr) → wallet 74 — now the sell goes through.
    r = await act(refused.newState, { type: 'buy', itemId: 'healing_potion', price: 50 });
    expect(r.newState.shop_gold?.hob).toBe(70);
    r = await act(r.newState, { type: 'sell', itemId: 'healing_potion' });
    expect(r.narrative).toContain('counts out 25cr');
    expect(r.newState.shop_gold?.hob).toBe(45);
  });

  it('buys UNSTOCKED loot at half its SRD value (the general buyback)', async () => {
    // Hob doesn't stock longswords, but the catalog values one at 15cr —
    // he pays floor(15/2) = 7.
    const sword = { id: 'longsword', name: 'Longsword', type: 'weapon', instance_id: 's1' };
    let r = await openShop(shopper(0, [sword]));
    expect(vendorLabels(r.newState)).toContain('Sell Longsword — 7cr');
    r = await act(r.newState, { type: 'sell', itemId: 'longsword' });
    expect(r.newState.characters[0].gold).toBe(7);
    expect(r.newState.shop_gold?.hob).toBe(13);
  });

  it("won't buy items the vendor doesn't stock, or equipped/attuned instances", async () => {
    const cloak = { id: 'fine_cloak', name: 'Fine Cloak', type: 'misc', instance_id: 'c1' };
    const st = shopper(100, [potion('p1'), cloak]);
    st.characters[0].attuned_items = ['p1'];
    const r = await openShop(st);
    // The cloak isn't stocked AND carries no value; the only potion is attuned.
    expect(vendorLabels(r.newState).some((l) => l.startsWith('Sell'))).toBe(false);
    const noDeal = await act(r.newState, { type: 'sell', itemId: 'fine_cloak' });
    expect(noDeal.narrative).toContain("doesn't deal in that");
    const bound = await act(r.newState, { type: 'sell', itemId: 'healing_potion' });
    expect(bound.narrative).toContain('no unequipped');
  });
});
