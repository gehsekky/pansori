// Act I custom items. Mundane store stock (potions, torches, rope, …) resolves
// from the SRD catalog by id — only campaign-unique relics need defining here.
//
// The Chrono-Shard is the season's keystone: a tracking-sensor component the
// Weaver-Sect stole to calibrate the transmitter. Mechanically a `misc` quest
// item (no combat value); the forensic story rides on recovering it (quest step
// `s_recover` keys on `party_items contains chrono_shard`) and showing it to
// Sister Martha. It pays off across Acts II–IV (coordinate decode; Unit-7's
// Rosetta stone). Granted to Julian on recovery.

import type { LootItem } from '../../types.js';

export const ITEMS: LootItem[] = [
  {
    id: 'chrono_shard',
    name: 'The Chrono-Shard',
    desc:
      'A jagged sliver of non-magnetic star-metal threaded with circuit-fine ' +
      'geometric lines. It is cold, and it drinks the ambient magic around it ' +
      'like a sponge — Julian’s tools read it absorbing the weave to power some ' +
      'silent calculation. Wiped clean, it throws a flickering three-dimensional ' +
      'wireframe of the local geography into the air. Not a relic. A sensor.',
    value: 1,
    weight: 1,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['shard', 'memory crystal', 'star-metal'],
  },
];
