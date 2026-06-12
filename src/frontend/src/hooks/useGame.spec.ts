import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historyFromRunLog, useGame } from './useGame.ts';
import type { GameState } from '../types.ts';

vi.mock('../lib/api.ts', () => ({
  api: {
    newSession: vi.fn(),
    getSessionById: vi.fn(),
  },
}));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

import { api } from '../lib/api.ts';

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

// The game-start narrative modal: introText is set ONLY by handleNewGame
// (from the first run_log entry — the gameStart pick + act opening), never
// by resume/reload, so the modal greets a fresh adventure exactly once.

const START_NARRATIVE = 'The sky cracks open over Utgard.\n\n✦ Quest: First Steps';

function sessionPayload() {
  return {
    session: { id: 's-1', turn_seq: 0 },
    state: {
      run_log: [{ character_id: 'p1', action: 'start', narrative: START_NARRATIVE }],
      room_log: [START_NARRATIVE],
      last_choices: [],
    },
    seed: { seed_id: 'x', world_name: 'Utgard' },
    campaignMeta: null,
  };
}

describe('useGame — game-start introText', () => {
  it('handleNewGame surfaces the opening narration; dismissIntro clears it', async () => {
    vi.mocked(api.newSession).mockResolvedValue(
      sessionPayload() as unknown as Awaited<ReturnType<typeof api.newSession>>
    );
    const { result } = renderHook(() => useGame());
    expect(result.current.introText).toBeNull();
    await act(async () => {
      await result.current.handleNewGame([], 'ctx-1');
    });
    expect(result.current.introText).toBe(START_NARRATIVE);
    act(() => result.current.dismissIntro());
    expect(result.current.introText).toBeNull();
  });

  it('handleResumeSession does NOT open the intro (reloads stay quiet)', async () => {
    const s = sessionPayload();
    vi.mocked(api.getSessionById).mockResolvedValue({
      ...s.session,
      state: s.state,
      seed: s.seed,
      status: 'active',
      campaignMeta: null,
    } as unknown as Awaited<ReturnType<typeof api.getSessionById>>);
    const { result } = renderHook(() => useGame());
    await act(async () => {
      await result.current.handleResumeSession('s-1');
    });
    expect(result.current.gameState).not.toBeNull();
    expect(result.current.introText).toBeNull();
  });
});
