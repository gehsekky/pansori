import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FactionsPanel from './FactionsPanel';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const MILLERS = {
  id: 'millers',
  name: "The Millers' Guild",
  thresholds: { hostile: -20, unfriendly: -5, neutral: 0, friendly: 20, exalted: 50 },
  shopPriceModifiers: { friendly: 0.9 },
};

describe('FactionsPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
  });

  it('renders thresholds + modifiers; ascending guard blocks a bad save', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'factions',
      source: 'db',
      value: [MILLERS],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'factions', source: 'db' });
    render(<FactionsPanel campaignId="sandbox" />);
    expect(((await screen.findByLabelText('FRIENDLY ≥')) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('FRIENDLY ×') as HTMLInputElement).value).toBe('0.9');
    // Push FRIENDLY below NEUTRAL — the ascending guard refuses.
    fireEvent.change(screen.getByLabelText('FRIENDLY ≥'), { target: { value: '-10' } });
    fireEvent.click(screen.getByTestId('save-factions-btn'));
    expect(await screen.findByText(/thresholds must ascend/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
    // Restore + clear the modifier: the save folds the section back.
    fireEvent.change(screen.getByLabelText('FRIENDLY ≥'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('FRIENDLY ×'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('save-factions-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(saved[0]).toEqual({ ...MILLERS, shopPriceModifiers: {} });
  });

  it('a new faction derives its id from the name and needs one before save', async () => {
    mocked.getCampaignSection.mockResolvedValue({ section: 'factions', source: 'db', value: [] });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'factions', source: 'db' });
    render(<FactionsPanel campaignId="sandbox" />);
    expect(await screen.findByText(/No factions yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('add-faction-btn'));
    fireEvent.click(screen.getByTestId('save-factions-btn'));
    expect(await screen.findByText(/needs a name/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('NAME', { selector: '#faction-name-0' }), {
      target: { value: 'Crimson Sails' },
    });
    expect(screen.getByText('id: crimson-sails')).toBeTruthy();
    fireEvent.click(screen.getByTestId('save-factions-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(saved[0]).toEqual({
      id: 'crimson-sails',
      name: 'Crimson Sails',
      thresholds: { hostile: -20, unfriendly: -5, neutral: 0, friendly: 20, exalted: 50 },
      shopPriceModifiers: {},
    });
  });

  it('loads + edits the faction description and includes it in the save', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'factions',
      source: 'db',
      value: [{ ...MILLERS, description: 'Grain and bread.' }],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'factions', source: 'db' });
    render(<FactionsPanel campaignId="sandbox" />);
    const desc = (await screen.findByLabelText('Faction 1 description')) as HTMLTextAreaElement;
    expect(desc.value).toBe('Grain and bread.');
    fireEvent.change(desc, { target: { value: 'Grain, bread, and quiet leverage.' } });
    fireEvent.click(screen.getByTestId('save-factions-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(saved[0].description).toBe('Grain, bread, and quiet leverage.');
  });
});
