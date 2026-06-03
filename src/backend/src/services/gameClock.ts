// The in-game clock. A single integer `world_minute` (total elapsed in-world
// minutes since campaign start) is the source of truth; day / time-of-day are
// derived here at display time. Keep this BYTE-IDENTICAL with the frontend copy
// at src/frontend/src/utils/gameClock.ts.

// SRD: a day is 24 hours = 1440 minutes. Campaigns start at Day 1, 08:00.
export const CAMPAIGN_START_MINUTE = 480;

export type TimeOfDayBand = 'morning' | 'afternoon' | 'evening' | 'night';

function bandForHour(hour: number): TimeOfDayBand {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

/**
 * Decompose `world_minute` into a calendar-ish view + a display label.
 * day is 1-indexed; hour 0–23; minute 0–59. label e.g. "Day 2 · 14:30 · afternoon".
 */
export function formatGameClock(worldMinute: number): {
  day: number;
  hour: number;
  minute: number;
  band: TimeOfDayBand;
  label: string;
} {
  const m = Math.max(0, Math.floor(worldMinute));
  const day = Math.floor(m / 1440) + 1;
  const hour = Math.floor((m % 1440) / 60);
  const minute = m % 60;
  const band = bandForHour(hour);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return { day, hour, minute, band, label: `Day ${day} · ${hh}:${mm} · ${band}` };
}
