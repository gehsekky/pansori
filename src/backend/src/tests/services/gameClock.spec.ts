import { CAMPAIGN_START_MINUTE, formatGameClock } from '../../services/gameClock.js';
import { describe, expect, it } from 'vitest';

describe('formatGameClock', () => {
  it('campaign start (480) is Day 1 08:00 morning', () => {
    expect(CAMPAIGN_START_MINUTE).toBe(480);
    expect(formatGameClock(480)).toEqual({
      day: 1,
      hour: 8,
      minute: 0,
      band: 'morning',
      label: 'Day 1 · 08:00 · morning',
    });
  });

  it('midnight of day 1 (0) is night', () => {
    expect(formatGameClock(0).label).toBe('Day 1 · 00:00 · night');
  });

  it('rolls into day 2 at 1440', () => {
    const c = formatGameClock(1440);
    expect(c.day).toBe(2);
    expect(c.label).toBe('Day 2 · 00:00 · night');
  });

  it('decomposes hours and minutes within a day', () => {
    // Day 2, 14:30 → 1440 + 870.
    expect(formatGameClock(2310)).toMatchObject({
      day: 2,
      hour: 14,
      minute: 30,
      band: 'afternoon',
    });
  });

  it('clamps and floors odd input', () => {
    expect(formatGameClock(-50).label).toBe('Day 1 · 00:00 · night');
    expect(formatGameClock(60.9).minute).toBe(0); // floored to 60 → 01:00
    expect(formatGameClock(60.9).hour).toBe(1);
  });

  // Band boundaries: 5–11 morning, 12–16 afternoon, 17–20 evening, else night.
  it.each([
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [20, 'evening'],
    [21, 'night'],
    [23, 'night'],
  ])('hour %i → %s band', (hour, band) => {
    expect(formatGameClock(hour * 60).band).toBe(band);
  });
});
