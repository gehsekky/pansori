import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MapsPanel from './MapsPanel';
import React from 'react';

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
  sites: [{ id: 'pit', name: 'The Pit', pos: { x: 2, y: 1 }, kind: 'local', entryRoomId: 'pit' }],
};

const REACH = {
  id: 'frost-reach',
  name: 'The Frost Reach',
  isStartingRegion: false,
  feetPerSquare: 5280,
  grid: G(8, 8),
  startPos: { x: 0, y: 0 },
};

const OAKVALE = {
  id: 'oakvale',
  name: 'Oakvale',
  feetPerSquare: 25,
  grid: G(10, 8),
  startPos: { x: 1, y: 1 },
  floor: 'dirt',
  venues: [
    { id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' },
    { id: 'inn', name: 'The Inn', pos: { x: 3, y: 3 }, kind: 'interior', entryRoomId: 'inn' },
  ],
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
    section === 'regions'
      ? { section, source: 'db', value: [VALE, REACH] }
      : { section, source: 'db', value: [OAKVALE] }
  );
  mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'regions', source: 'db' });
});

describe('MapsPanel — regions', () => {
  it('renders a card per region with dims, marker count, and the starting badge', async () => {
    render(<MapsPanel campaignId="malgovia" kind="region" />);
    expect(await screen.findByText('The Vale')).toBeTruthy();
    expect(screen.getByText('The Frost Reach')).toBeTruthy();
    expect(screen.getByText(/12×10 · 1 SITE/)).toBeTruthy();
    expect(screen.getByText('8×8')).toBeTruthy();
    expect(screen.getAllByText(/STARTING REGION/)).toHaveLength(1);
    expect(screen.getByText(/Mist and pine\./)).toBeTruthy();
  });

  it('clicking a card opens the painter for that region', async () => {
    const onOpenMap = vi.fn();
    render(<MapsPanel campaignId="malgovia" kind="region" onOpenMap={onOpenMap} />);
    fireEvent.click(await screen.findByTestId('region-card-frost-reach'));
    expect(onOpenMap).toHaveBeenCalledWith('frost-reach');
  });

  it('creates a region: name → slug id, appended to the list, painter opened', async () => {
    const onOpenMap = vi.fn();
    render(<MapsPanel campaignId="malgovia" kind="region" onOpenMap={onOpenMap} />);
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
    expect(list.map((r) => r.id)).toEqual(['vale', 'frost-reach', 'the-sunken-coast']);
    const created = list[2];
    expect(created.name).toBe('The Sunken Coast!');
    expect(created.isStartingRegion).toBe(false); // the campaign already has one
    expect(created.grid.length).toBe(8);
    expect(created.grid[0].length).toBe(10);
    expect(onOpenMap).toHaveBeenCalledWith('the-sunken-coast');
  });

  it('the first region of an empty campaign becomes the starting region', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'none',
      value: null,
    });
    render(<MapsPanel campaignId="ghost" kind="region" />);
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
    render(<MapsPanel campaignId="malgovia" kind="region" />);
    fireEvent.click(await screen.findByTestId('new-region-btn'));
    // 'VALE' slugs to 'vale' — collides with the existing region id.
    fireEvent.change(screen.getByLabelText('REGION NAME'), { target: { value: 'VALE' } });
    fireEvent.click(screen.getByTestId('create-region-btn'));
    expect(await screen.findByText(/The id "vale" is taken/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });

  it('surfaces a load failure', async () => {
    mocked.getCampaignSection.mockRejectedValue(new Error('boom'));
    render(<MapsPanel campaignId="malgovia" kind="region" />);
    expect(await screen.findByText(/Could not load/)).toBeTruthy();
  });
});

describe('MapsPanel — rooms', () => {
  beforeEach(() => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'rooms',
      source: 'db',
      value: [
        {
          id: 'taproom',
          name: 'The Taproom',
          desc: 'Lamplight and cider.',
          grid: [
            [{}, {}],
            [{}, {}],
          ],
          entryPos: { x: 0, y: 0 },
          exits: [{ pos: { x: 1, y: 1 }, ascends: true, label: 'Door' }],
        },
      ],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
  });

  it('renders room cards with exit counts', async () => {
    render(<MapsPanel campaignId="malgovia" kind="room" />);
    expect(await screen.findByText('ROOMS')).toBeTruthy();
    expect(screen.getByText('The Taproom')).toBeTruthy();
    expect(screen.getByText(/2×2 · 1 EXIT/)).toBeTruthy();
  });

  it('creates a room: bare-floor starter with a way out, painter opened', async () => {
    const onOpenMap = vi.fn();
    render(<MapsPanel campaignId="malgovia" kind="room" onOpenMap={onOpenMap} />);
    fireEvent.click(await screen.findByTestId('new-room-btn'));
    fireEvent.change(screen.getByLabelText('ROOM NAME'), { target: { value: 'The Cellar' } });
    expect(screen.getByText(/SHIPS WITH A WAY OUT/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-room-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(section).toBe('rooms');
    const list = value as Array<Record<string, unknown>>;
    expect(list.map((r) => r.id)).toEqual(['taproom', 'the-cellar']);
    const created = list[1];
    expect(created.desc).toBeTruthy(); // rooms require a description
    expect((created.grid as unknown[][]).length).toBe(6);
    expect((created.grid as unknown[][])[0]).toEqual([{}, {}, {}, {}, {}, {}, {}, {}]);
    expect(created.exits).toEqual([{ pos: { x: 0, y: 1 }, ascends: true, label: 'Way out' }]);
    expect(onOpenMap).toHaveBeenCalledWith('the-cellar');
  });
});

describe('MapsPanel — towns', () => {
  it('renders town cards with venue counts and no starting badge', async () => {
    render(<MapsPanel campaignId="malgovia" kind="town" />);
    expect(await screen.findByText('TOWNS')).toBeTruthy();
    expect(screen.getByText('Oakvale')).toBeTruthy();
    expect(screen.getByText(/10×8 · 2 VENUES/)).toBeTruthy();
    expect(screen.queryByText(/STARTING REGION/)).toBeNull();
  });

  it('clicking a town card opens the town painter', async () => {
    const onOpenMap = vi.fn();
    render(<MapsPanel campaignId="malgovia" kind="town" onOpenMap={onOpenMap} />);
    fireEvent.click(await screen.findByTestId('town-card-oakvale'));
    expect(onOpenMap).toHaveBeenCalledWith('oakvale');
  });

  it('creates a town: 25 ft scale, dirt floor, gate venue shipped', async () => {
    const onOpenMap = vi.fn();
    render(<MapsPanel campaignId="malgovia" kind="town" onOpenMap={onOpenMap} />);
    fireEvent.click(await screen.findByTestId('new-town-btn'));
    fireEvent.change(screen.getByLabelText('TOWN NAME'), { target: { value: 'Milldale' } });
    expect(screen.getByText(/SHIPS WITH A GATE VENUE/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-town-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [cid, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(cid).toBe('malgovia');
    expect(section).toBe('towns');
    const list = value as Array<typeof OAKVALE>;
    expect(list.map((t) => t.id)).toEqual(['oakvale', 'milldale']);
    const created = list[1];
    expect(created.feetPerSquare).toBe(25);
    expect(created.floor).toBe('dirt');
    expect(created.venues).toEqual([
      { id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' },
    ]);
    expect('isStartingRegion' in created).toBe(false);
    expect(onOpenMap).toHaveBeenCalledWith('milldale');
  });
});
