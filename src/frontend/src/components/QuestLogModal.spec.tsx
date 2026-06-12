// The quest-log modal: the full journal grouped by ACT, with the hide-finished
// toggle. Discovered-only filtering and row rendering are shared with the
// tracker (CampaignPanel) and covered there.

import type { CampaignMeta, GameState, Quest } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import QuestLogModal from './QuestLogModal.tsx';
import React from 'react';

const quest = (id: string, title: string, actId?: string): Quest => ({
  id,
  title,
  desc: `${title} desc`,
  actId,
  steps: [],
  rewards: [],
});

const meta: CampaignMeta = {
  quests: [
    quest('q1', 'Find the Trail', 'act1'),
    quest('q2', 'Stop the War', 'act1'),
    quest('q3', 'Into the Dark', 'act2'),
    quest('q4', 'Stray Errand'), // no act → OTHER group
  ],
  factions: [],
  acts: [
    { id: 'act1', name: 'Act I — The Trail' },
    { id: 'act2', name: 'Act II — The Siege' },
  ],
};

const state = {
  quest_progress: [
    { questId: 'q1', status: 'completed', completedSteps: [] },
    { questId: 'q2', status: 'active', completedSteps: [] },
    { questId: 'q3', status: 'active', completedSteps: [] },
    { questId: 'q4', status: 'failed', completedSteps: [] },
  ],
} as unknown as GameState;

describe('QuestLogModal', () => {
  it('groups discovered quests by act with done counts; undiscovered stay hidden', () => {
    const m: CampaignMeta = { ...meta, quests: [...meta.quests, quest('q5', 'Hidden', 'act2')] };
    const { getByTestId, getByText, queryByText } = render(
      <QuestLogModal state={state} meta={m} onClose={vi.fn()} />
    );
    const act1 = getByTestId('quest-act-act1');
    expect(act1.textContent).toContain('ACT I — THE TRAIL');
    expect(act1.textContent).toContain('1/2 DONE');
    expect(act1.textContent).toContain('Find the Trail');
    expect(act1.textContent).toContain('Stop the War');
    expect(getByTestId('quest-act-act2').textContent).toContain('Into the Dark');
    // The act-less quest lands in OTHER; the undiscovered one nowhere.
    expect(getByTestId('quest-act-__other__').textContent).toContain('Stray Errand');
    expect(queryByText('Hidden')).toBeNull();
    expect(getByText(/HIDE FINISHED \(2\)/)).toBeTruthy();
  });

  it('the toggle hides completed AND failed quests', () => {
    const { getByTestId, queryByText, getByText } = render(
      <QuestLogModal state={state} meta={meta} onClose={vi.fn()} />
    );
    expect(getByText('Find the Trail')).toBeTruthy();
    fireEvent.click(getByTestId('quest-log-hide-finished'));
    expect(queryByText('Find the Trail')).toBeNull(); // completed
    expect(queryByText('Stray Errand')).toBeNull(); // failed
    expect(getByText('Stop the War')).toBeTruthy(); // active stays
    expect(getByText('Into the Dark')).toBeTruthy();
  });

  it('renders the empty hint when nothing is discovered', () => {
    const { getByText } = render(
      <QuestLogModal
        state={{ quest_progress: [] } as unknown as GameState}
        meta={meta}
        onClose={vi.fn()}
      />
    );
    expect(getByText(/No quests yet/i)).toBeTruthy();
  });
});
