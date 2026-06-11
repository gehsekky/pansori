import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ActsPanel from './ActsPanel';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: { getCampaignSection: vi.fn(), putCampaignSection: vi.fn() },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// Section-aware loader: acts + the dropdown sources (regions / quests / required
// members from recommendedParty).
function loader(acts: unknown[]) {
  return async (_cid: string, section: string) => {
    switch (section) {
      case 'acts':
        return { section, source: 'db', value: acts };
      case 'regions':
        return { section, source: 'db', value: [{ id: 'r1', name: 'The Vale' }] };
      case 'quests':
        return { section, source: 'db', value: [{ id: 'rats', title: 'The Rat Problem' }] };
      case 'recommendedParty':
        return {
          section,
          source: 'db',
          value: { requiredMembers: [{ name: 'Roland', cls: 'Fighter' }] },
        };
      default:
        return { section, source: 'none', value: null };
    }
  };
}

describe('ActsPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'acts', source: 'db' });
  });

  it('loads an act with its region + trigger selected', async () => {
    mocked.getCampaignSection.mockImplementation(
      loader([
        {
          id: 'act-1',
          name: 'Act I',
          startingRegionId: 'r1',
          startPos: { x: 2, y: 3 },
          trigger: { questId: 'rats' },
        },
      ])
    );
    render(<ActsPanel campaignId="sandbox" />);
    expect(((await screen.findByLabelText('ACT 1 NAME')) as HTMLInputElement).value).toBe('Act I');
    expect((screen.getByLabelText('Act 1 starting region') as HTMLSelectElement).value).toBe('r1');
    expect((screen.getByLabelText('Act 1 trigger quest') as HTMLSelectElement).value).toBe('rats');
  });

  it('adds an act with a start-loot grant and saves the payload', async () => {
    mocked.getCampaignSection.mockImplementation(loader([]));
    render(<ActsPanel campaignId="sandbox" />);
    await screen.findByTestId('add-act-btn');
    fireEvent.click(screen.getByTestId('add-act-btn'));
    fireEvent.change(screen.getByLabelText('ACT 1 NAME'), { target: { value: 'The Siege' } });
    fireEvent.change(screen.getByLabelText('Act 1 starting region'), { target: { value: 'r1' } });
    // Add a start-loot grant: gate_key → Roland.
    const startLoot = screen.getAllByTestId('loot-effect-editor')[0];
    fireEvent.click(within(startLoot).getByText('+ grant'));
    fireEvent.change(within(startLoot).getByLabelText('grant 1 item'), {
      target: { value: 'gate_key' },
    });
    fireEvent.change(within(startLoot).getByLabelText('grant 1 member'), {
      target: { value: 'Roland' },
    });
    fireEvent.click(screen.getByTestId('save-acts-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const payload = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(payload[0]).toMatchObject({
      id: 'the-siege',
      name: 'The Siege',
      startingRegionId: 'r1',
      startEffect: { grant: [{ itemId: 'gate_key', member: 'Roland' }] },
    });
  });

  it('loads an act with a branch edge + a terminal ending', async () => {
    mocked.getCampaignSection.mockImplementation(
      loader([
        {
          id: 'act-1',
          name: 'Act I',
          startingRegionId: 'r1',
          startPos: { x: 0, y: 0 },
          transitions: [
            { when: { fact: 'flags', path: '$.war', operator: 'equal', value: true }, to: 'act-2' },
          ],
        },
        {
          id: 'act-2',
          name: 'Act II',
          startingRegionId: 'r1',
          startPos: { x: 0, y: 0 },
          ending: { outcome: 'War', text: 'The trail goes cold.' },
        },
      ])
    );
    render(<ActsPanel campaignId="sandbox" />);
    // Act I's branch points at act-2.
    expect(
      ((await screen.findByLabelText('Act 1 branch 1 target')) as HTMLSelectElement).value
    ).toBe('act-2');
    // Act II is a terminal ending — checkbox on, outcome populated.
    expect((screen.getByLabelText('Act 2 is an ending') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Act 2 ending outcome') as HTMLInputElement).value).toBe('War');
  });

  it('marks an act as an ending and saves the ending payload', async () => {
    mocked.getCampaignSection.mockImplementation(
      loader([{ id: 'act-1', name: 'Act I', startingRegionId: 'r1', startPos: { x: 0, y: 0 } }])
    );
    render(<ActsPanel campaignId="sandbox" />);
    fireEvent.click(await screen.findByLabelText('Act 1 is an ending'));
    fireEvent.change(screen.getByLabelText('Act 1 ending outcome'), {
      target: { value: 'Victory' },
    });
    fireEvent.change(screen.getByLabelText('Act 1 ending text'), {
      target: { value: 'The sky holds.' },
    });
    fireEvent.click(screen.getByTestId('save-acts-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const payload = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(payload[0].ending).toEqual({ outcome: 'Victory', text: 'The sky holds.' });
  });

  it('loads an act-scoped anti-magic field with its level cap', async () => {
    mocked.getCampaignSection.mockImplementation(
      loader([
        {
          id: 'act-1',
          name: 'The Occupation',
          startingRegionId: 'r1',
          startPos: { x: 0, y: 0 },
          suppressesMagic: { maxLevel: 5 },
        },
      ])
    );
    render(<ActsPanel campaignId="sandbox" />);
    expect(
      ((await screen.findByLabelText('Act 1 suppresses magic')) as HTMLInputElement).checked
    ).toBe(true);
    expect((screen.getByLabelText('Act 1 suppression max level') as HTMLSelectElement).value).toBe(
      '5'
    );
  });

  it('flags an act as a dead-magic field (all levels) and saves it', async () => {
    mocked.getCampaignSection.mockImplementation(
      loader([{ id: 'act-1', name: 'Act I', startingRegionId: 'r1', startPos: { x: 0, y: 0 } }])
    );
    render(<ActsPanel campaignId="sandbox" />);
    fireEvent.click(await screen.findByLabelText('Act 1 suppresses magic'));
    fireEvent.click(screen.getByTestId('save-acts-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const payload = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(payload[0].suppressesMagic).toEqual({}); // no cap → all levels
  });

  it('blocks save when an act has no starting region', async () => {
    mocked.getCampaignSection.mockImplementation(loader([]));
    render(<ActsPanel campaignId="sandbox" />);
    await screen.findByTestId('add-act-btn');
    fireEvent.click(screen.getByTestId('add-act-btn'));
    fireEvent.change(screen.getByLabelText('ACT 1 NAME'), { target: { value: 'No Region' } });
    fireEvent.click(screen.getByTestId('save-acts-btn'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/starting region/i);
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });
});
