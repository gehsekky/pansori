import type { CampaignMeta, GameState, Quest } from '../types';
import { describe, expect, it } from 'vitest';
import { QuestsView } from './CampaignPanel.tsx';
import React from 'react';
import { render } from '@testing-library/react';

// The quest log shows only DISCOVERED quests — those with a quest_progress
// entry. Undiscovered quests (no progress) stay hidden until found in play.

const quest = (id: string, title: string): Quest => ({
  id,
  title,
  desc: `${title} desc`,
  steps: [],
  rewards: [],
});

const meta: CampaignMeta = {
  quests: [quest('q1', 'Alpha'), quest('q2', 'Beta'), quest('q3', 'Gamma')],
  factions: [],
};

const stateWith = (progress: GameState['quest_progress']): GameState =>
  ({ quest_progress: progress }) as unknown as GameState;

describe('QuestsView — discovered quests only', () => {
  it('shows only quests with a progress entry, hiding undiscovered ones', () => {
    const { queryByText } = render(
      <QuestsView
        state={stateWith([{ questId: 'q1', status: 'active', completedSteps: [] }])}
        meta={meta}
      />
    );
    expect(queryByText('Alpha')).toBeTruthy(); // discovered
    expect(queryByText('Beta')).toBeNull(); // undiscovered → hidden
    expect(queryByText('Gamma')).toBeNull();
  });

  it('hides finished quests — the tracker is for open work, the modal keeps history', () => {
    const { queryByText, getByText } = render(
      <QuestsView
        state={stateWith([
          { questId: 'q1', status: 'active', completedSteps: [] },
          { questId: 'q2', status: 'completed', completedSteps: [] },
        ])}
        meta={meta}
      />
    );
    expect(getByText('Alpha')).toBeTruthy(); // active stays
    expect(queryByText('Beta')).toBeNull(); // completed → modal only
  });

  it('points at the quest log when everything discovered is finished', () => {
    const { getByText, queryByText } = render(
      <QuestsView
        state={stateWith([{ questId: 'q2', status: 'completed', completedSteps: [] }])}
        meta={meta}
      />
    );
    expect(getByText(/finished quests live in the quest log/i)).toBeTruthy();
    expect(queryByText('Beta')).toBeNull();
  });

  it('renders the empty hint when nothing is discovered yet', () => {
    const { queryByText, getByText } = render(<QuestsView state={stateWith([])} meta={meta} />);
    expect(getByText(/No quests yet/i)).toBeTruthy();
    expect(queryByText('Alpha')).toBeNull();
  });
});
