import { describe, expect, it } from 'vitest';
import type { GameState } from '../types.ts';
import { historyFromRunLog } from './useGame.ts';

// The Adventure Log transcript isn't persisted — it's rebuilt from the saved
// run_log on load/resume so the tab survives reloads. Each run_log entry becomes
// an interleaved user (action) + assistant (narrative) pair.

function stateWithRunLog(
  runLog: Array<{ character_id: string; action: string; narrative: string }>
): GameState {
  return { run_log: runLog } as unknown as GameState;
}

describe('historyFromRunLog', () => {
  it('rebuilds an interleaved user/assistant transcript from run_log', () => {
    const state = stateWithRunLog([
      { character_id: 'p1', action: 'move', narrative: 'You stride down the hall.' },
      { character_id: 'p1', action: 'attack', narrative: 'Your blade bites home.' },
    ]);
    expect(historyFromRunLog(state)).toEqual([
      { role: 'user', content: 'move' },
      { role: 'assistant', content: 'You stride down the hall.' },
      { role: 'user', content: 'attack' },
      { role: 'assistant', content: 'Your blade bites home.' },
    ]);
  });

  it('returns an empty transcript for an empty / missing run_log', () => {
    expect(historyFromRunLog(stateWithRunLog([]))).toEqual([]);
    expect(historyFromRunLog({} as GameState)).toEqual([]);
  });
});
