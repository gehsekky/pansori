import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import RegionsPanel from './RegionsPanel';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const G = (w: number, h: number) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => ({ t: 'plains' })));

const VALE = {
  id: 'vale',
  name: 'The Vale',
  isStartingRegion: true,
  desc: 'Mist and pine.',
  feetPerSquare: 5280,
  grid: G(12, 10),
  startPos: { x: 1, y: 1 },
};

const REACH = {
  id: 'frost-reach',
  name: 'The Frost Reach',
  isStartingRegion: false,
  feetPerSquare: 5280,
  grid: G(8, 8),
  startPos: { x: 0, y: 0 },
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getCampaignSection.mockResolvedValue({
    section: 'regions',
    source: 'db',
    value: [VALE, REACH],
  });
  mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'regions', source: 'db' });
});

describe('RegionsPanel', () => {
  it('renders a card per region with dims and the starting badge', async () => {
    render(<RegionsPanel campaignId="malgovia" />);
    expect(await screen.findByText('The Vale')).toBeTruthy();
    expect(screen.getByText('The Frost Reach')).toBeTruthy();
    expect(screen.getByText('12×10')).toBeTruthy();
    expect(screen.getByText('8×8')).toBeTruthy();
    // Exactly the starter carries the badge; the desc shows on its card.
    expect(screen.getAllByText(/STARTING REGION/)).toHaveLength(1);
    expect(screen.getByText(/Mist and pine\./)).toBeTruthy();
  });

  it('clicking a card opens the painter for that region', async () => {
    const onOpenRegion = vi.fn();
    render(<RegionsPanel campaignId="malgovia" onOpenRegion={onOpenRegion} />);
    fireEvent.click(await screen.findByTestId('region-card-frost-reach'));
    expect(onOpenRegion).toHaveBeenCalledWith('frost-reach');
  });

  it('creates a region: name → slug id, appended to the list, painter opened', async () => {
    const onOpenRegion = vi.fn();
    render(<RegionsPanel campaignId="malgovia" onOpenRegion={onOpenRegion} />);
    fireEvent.click(await screen.findByTestId('new-region-btn'));
    fireEvent.change(screen.getByLabelText('REGION NAME'), {
      target: { value: 'The Sunken Coast!' },
    });
    expect(screen.getByText(/ID: the-sunken-coast/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-region-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [cid, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(cid).toBe('malgovia');
    expect(section).toBe('regions');
    const list = value as Array<typeof VALE>;
    // Existing regions intact; the new one appended as a 10×8 starter that
    // is NOT the starting region (the campaign already has one).
    expect(list.map((r) => r.id)).toEqual(['vale', 'frost-reach', 'the-sunken-coast']);
    const created = list[2];
    expect(created.name).toBe('The Sunken Coast!');
    expect(created.isStartingRegion).toBe(false);
    expect(created.grid.length).toBe(8);
    expect(created.grid[0].length).toBe(10);
    expect(onOpenRegion).toHaveBeenCalledWith('the-sunken-coast');
    // The new card joined the list.
    expect(await screen.findByTestId('region-card-the-sunken-coast')).toBeTruthy();
  });

  it('the first region of an empty campaign becomes the starting region', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'none',
      value: null,
    });
    render(<RegionsPanel campaignId="ghost" />);
    expect(await screen.findByText(/No regions yet/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('new-region-btn'));
    fireEvent.change(screen.getByLabelText('REGION NAME'), { target: { value: 'Home Vale' } });
    fireEvent.click(screen.getByTestId('create-region-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as Array<typeof VALE>;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('home-vale');
    expect(list[0].isStartingRegion).toBe(true);
  });

  it('rejects a taken id client-side without calling the api', async () => {
    render(<RegionsPanel campaignId="malgovia" />);
    fireEvent.click(await screen.findByTestId('new-region-btn'));
    // 'VALE' slugs to 'vale' — collides with the existing region id.
    fireEvent.change(screen.getByLabelText('REGION NAME'), { target: { value: 'VALE' } });
    fireEvent.click(screen.getByTestId('create-region-btn'));
    expect(await screen.findByText(/The id "vale" is taken/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });

  it('surfaces a load failure', async () => {
    mocked.getCampaignSection.mockRejectedValue(new Error('boom'));
    render(<RegionsPanel campaignId="malgovia" />);
    expect(await screen.findByText(/Could not load/)).toBeTruthy();
  });
});
