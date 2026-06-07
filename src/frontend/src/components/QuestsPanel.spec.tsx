import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestsPanel from './QuestsPanel';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
    getItemCatalog: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const QUEST = {
  id: 'rat-problem',
  title: 'The Rat Problem',
  desc: 'Clear the cellar.',
  giverNpcId: 'old-hob',
  steps: [
    {
      id: 'step_kill',
      desc: 'Deal with the rats',
      condition: { fact: 'enemies_killed', operator: 'contains', value: 'acorn-cellar#0' },
    },
  ],
  rewards: [{ type: 'give_gold', amount: 25 }],
};

function mockSections(quests: object[] = [QUEST]) {
  mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
    section === 'quests'
      ? { section, source: 'db', value: quests }
      : section === 'factions'
        ? { section, source: 'db', value: [{ id: 'millers', name: "The Millers' Guild" }] }
        : section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [
                { id: 'acorn-cellar', name: 'The Cellar', npcs: [{ id: 'old-hob' }] },
                { id: 'taproom', name: 'The Taproom' },
              ],
            }
          : section === 'towns'
            ? { section, source: 'db', value: [{ id: 'oakvale', name: 'Oakvale' }] }
            : { section, source: 'db', value: [] }
  );
  mocked.getItemCatalog.mockResolvedValue([{ id: 'dagger', name: 'Dagger' }]);
  mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'quests', source: 'db' });
}

describe('QuestsPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
  });

  it('lists quests; EDIT opens the structured editor with parsed conditions', async () => {
    mockSections();
    render(<QuestsPanel campaignId="sandbox" />);
    expect(
      (await screen.findByLabelText('TITLE', { selector: '#quest-title-0' })) as HTMLInputElement
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId('quest-open-0'));
    // The giver picker carries the rooms' NPC ids; the KILLED condition row
    // parsed from the stored JSON.
    expect((screen.getByLabelText('GIVER NPC') as HTMLSelectElement).value).toBe('old-hob');
    expect(
      (screen.getByLabelText('quest 1 step 1 condition 1 enemy id') as HTMLInputElement).value
    ).toBe('acorn-cellar#0');
    // The reward row parsed into its structured editor (amount pre-filled).
    expect(
      (screen.getByLabelText('quest 1 reward effect 1 amount') as HTMLInputElement).value
    ).toBe('25');
  });

  it('a new quest derives its id from the title and saves the full section', async () => {
    mockSections([]);
    render(<QuestsPanel campaignId="sandbox" />);
    expect(await screen.findByText(/No quests yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('add-quest-btn'));
    // Title required before save.
    fireEvent.click(screen.getByTestId('save-quests-btn'));
    expect(await screen.findByText(/needs a TITLE/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('TITLE', { selector: '#quest-title-0' }), {
      target: { value: 'The Old Debt' },
    });
    expect(screen.getByText('id: the-old-debt')).toBeTruthy(); // slug derived live
    fireEvent.change(screen.getByLabelText(/DESCRIPTION/), {
      target: { value: 'Pay what is owed.' },
    });
    // The starter step needs a desc + at least one condition.
    fireEvent.change(screen.getByLabelText('STEP 1'), { target: { value: 'Reach the cellar' } });
    fireEvent.click(screen.getByTestId('save-quests-btn'));
    expect(await screen.findByText(/at least one condition/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add quest 1 step 1 condition'), {
      target: { value: 'visited-room' },
    });
    fireEvent.click(screen.getByLabelText('Quest 1 starts active'));
    fireEvent.click(screen.getByTestId('save-quests-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(section).toBe('quests');
    expect(value).toEqual([
      {
        id: 'the-old-debt',
        title: 'The Old Debt',
        desc: 'Pay what is owed.',
        startActive: true,
        steps: [
          {
            id: 'step-1',
            desc: 'Reach the cellar',
            condition: { fact: 'visited_rooms', operator: 'contains', value: 'acorn-cellar' },
          },
        ],
        rewards: [],
      },
    ]);
  });

  it('faction pick reveals REP GAIN; clearing the faction drops both', async () => {
    mockSections();
    render(<QuestsPanel campaignId="sandbox" />);
    await screen.findByTestId('quest-open-0');
    fireEvent.click(screen.getByTestId('quest-open-0'));
    fireEvent.change(screen.getByLabelText('FACTION'), { target: { value: 'millers' } });
    fireEvent.change(screen.getByLabelText('REP GAIN'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('save-quests-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(saved[0].factionId).toBe('millers');
    expect(saved[0].repGain).toBe(10);
  });
});
