import { CAMPAIGN_START_MINUTE, formatGameClock } from './gameClock.ts';
import { describe, expect, it } from 'vitest';

// Mirror of the backend gameClock spec — guards the two copies against drift.
describe('formatGameClock', () => {
  it('campaign start (480) is Day 1 08:00 morning', () => {
    expect(CAMPAIGN_START_MINUTE).toBe(480);
    expect(formatGameClock(480).label).toBe('Day 1 · 08:00 · morning');
  });

  it('rolls into day 2 at 1440', () => {
    expect(formatGameClock(1440).label).toBe('Day 2 · 00:00 · night');
  });

  it('decomposes hours and minutes within a day', () => {
    expect(formatGameClock(2310)).toMatchObject({
      day: 2,
      hour: 14,
      minute: 30,
      band: 'afternoon',
    });
  });

  it.each([
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
  ])('hour %i → %s band', (hour, band) => {
    expect(formatGameClock(hour * 60).band).toBe(band);
  });
});
