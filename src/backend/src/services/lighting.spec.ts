// 2024 PHB lighting & vision (PHB p.190). Pansori models room-grained
// lighting (Room.lighting) — each room is bright / dim / dark uniformly.
// The Stealth-vs-Perception contest reads the observer's effective
// light to adjust the passive Perception DC:
//   - bright: base DC (10 + WIS mod)
//   - dim:    DC -5 (observer has Disadvantage on sight Perception)
//   - dark:   DC 0 (observer effectively Blinded for sight purposes)
// Darkvision shifts one step brighter for the creature with it.

import { describe, expect, it } from 'vitest';
import {
  effectiveLightFor,
  passivePerceptionDC,
  passivePerceptionDcInLight,
} from './rulesEngine.js';

describe('effectiveLightFor', () => {
  it('no darkvision: room lighting passes through', () => {
    expect(effectiveLightFor('bright', 0)).toBe('bright');
    expect(effectiveLightFor('dim', 0)).toBe('dim');
    expect(effectiveLightFor('dark', 0)).toBe('dark');
  });

  it('darkvision shifts dark → dim, dim → bright', () => {
    expect(effectiveLightFor('dark', 60)).toBe('dim');
    expect(effectiveLightFor('dim', 60)).toBe('bright');
    expect(effectiveLightFor('bright', 60)).toBe('bright');
  });

  it('darkvision range only matters when > 0', () => {
    expect(effectiveLightFor('dark', 0)).toBe('dark');
    expect(effectiveLightFor('dark', 1)).toBe('dim');
  });
});

describe('passivePerceptionDcInLight', () => {
  it('bright light: unchanged base DC', () => {
    const base = passivePerceptionDC(14); // 10 + 2 = 12
    expect(passivePerceptionDcInLight(14, 'bright')).toBe(base);
  });

  it('dim light: -5 to base DC (Disadvantage on sight Perception)', () => {
    expect(passivePerceptionDcInLight(14, 'dim')).toBe(7); // 12 - 5
  });

  it('dark light: DC 0 (observer effectively Blinded for sight)', () => {
    expect(passivePerceptionDcInLight(14, 'dark')).toBe(0);
  });

  it('dim with a low WIS observer floors at 0, not negative', () => {
    // WIS 3 → mod -4 → base DC 6 → dim = 1 (not -5+6)
    expect(passivePerceptionDcInLight(3, 'dim')).toBe(1);
    // WIS 1 → mod -5 → base DC 5 → dim = 0 (floor)
    expect(passivePerceptionDcInLight(1, 'dim')).toBe(0);
  });
});
