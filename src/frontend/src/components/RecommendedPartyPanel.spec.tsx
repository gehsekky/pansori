import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import RecommendedPartyPanel from './RecommendedPartyPanel';

vi.mock('../lib/api.ts', () => ({
  api: { getCampaignSection: vi.fn(), putCampaignSection: vi.fn() },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('RecommendedPartyPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.putCampaignSection.mockResolvedValue({
      ok: true,
      section: 'recommendedParty',
      source: 'db',
    });
  });

  it('loads size + composition into the size field and per-slot dropdowns', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'recommendedParty',
      source: 'db',
      value: { size: 3, composition: ['Fighter', 'Cleric', 'Wizard'] },
    });
    render(<RecommendedPartyPanel campaignId="sandbox" />);
    expect(((await screen.findByLabelText('SIZE')) as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('SLOT 1') as HTMLSelectElement).value).toBe('Fighter');
    expect((screen.getByLabelText('SLOT 2') as HTMLSelectElement).value).toBe('Cleric');
    expect((screen.getByLabelText('SLOT 3') as HTMLSelectElement).value).toBe('Wizard');
    expect(screen.queryByLabelText('SLOT 4')).toBeNull();
  });

  it('changing size adds/removes slots and the save sends a matched composition', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'recommendedParty',
      source: 'none',
      value: null,
    });
    render(<RecommendedPartyPanel campaignId="sandbox" />);
    // Defaults to size 4.
    expect(((await screen.findByLabelText('SIZE')) as HTMLInputElement).value).toBe('4');
    fireEvent.change(screen.getByLabelText('SLOT 1'), { target: { value: 'Bard' } });
    fireEvent.change(screen.getByLabelText('SIZE'), { target: { value: '2' } });
    expect(screen.queryByLabelText('SLOT 3')).toBeNull(); // trimmed
    fireEvent.click(screen.getByTestId('save-recommended-party-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(section).toBe('recommendedParty');
    expect(value).toEqual({ size: 2, composition: ['Bard', 'Barbarian'] }); // slot1 kept, slot2 defaulted
  });

  it('loads required members and saves them in the payload', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'recommendedParty',
      source: 'db',
      value: {
        size: 3,
        composition: ['Fighter', 'Cleric', 'Wizard'],
        requiredMembers: [{ name: 'Roland', cls: 'Fighter' }],
      },
    });
    render(<RecommendedPartyPanel campaignId="sandbox" />);
    const name = (await screen.findByLabelText('Required member 1 name')) as HTMLInputElement;
    expect(name.value).toBe('Roland');
    expect((screen.getByLabelText('Required member 1 class') as HTMLSelectElement).value).toBe(
      'Fighter'
    );
    // Add a second required member.
    fireEvent.click(screen.getByTestId('add-required-member-btn'));
    fireEvent.change(screen.getByLabelText('Required member 2 name'), {
      target: { value: 'Mira' },
    });
    fireEvent.change(screen.getByLabelText('Required member 2 class'), {
      target: { value: 'Wizard' },
    });
    fireEvent.click(screen.getByTestId('save-recommended-party-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const value = mocked.putCampaignSection.mock.calls[0][2] as { requiredMembers?: unknown };
    expect(value.requiredMembers).toEqual([
      { name: 'Roland', cls: 'Fighter' },
      { name: 'Mira', cls: 'Wizard' },
    ]);
  });

  it('blocks save when a required member has no name', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'recommendedParty',
      source: 'none',
      value: null,
    });
    render(<RecommendedPartyPanel campaignId="sandbox" />);
    await screen.findByLabelText('SIZE');
    fireEvent.click(screen.getByTestId('add-required-member-btn')); // blank name
    fireEvent.click(screen.getByTestId('save-recommended-party-btn'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/needs a name/i);
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });
});
