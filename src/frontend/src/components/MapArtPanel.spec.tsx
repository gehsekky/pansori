import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MapArtPanel from './MapArtPanel';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('MapArtPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'terrainArt', source: 'db' });
  });

  it('loads stored choices into the rows (bare id, tinted choice, marker)', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'db',
      value: {
        plains: 'plains-tundra',
        forest: { tile: 'forest-dead', tint: { hue: 30, brightness: 0.8 } },
        markers: { town: 'castle' },
      },
    });
    render(<MapArtPanel campaignId="sandbox" />);
    expect(((await screen.findByLabelText('plains tile')) as HTMLSelectElement).value).toBe(
      'plains-tundra'
    );
    expect((screen.getByLabelText('forest tile') as HTMLSelectElement).value).toBe('forest-dead');
    expect((screen.getByLabelText('forest hue') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('forest bri') as HTMLInputElement).value).toBe('0.8');
    expect((screen.getByLabelText('town marker tile') as HTMLSelectElement).value).toBe('castle');
    // Untouched types sit on their own default tile.
    expect((screen.getByLabelText('water tile') as HTMLSelectElement).value).toBe('water');
  });

  it('saves the minimal map: defaults omitted, identity tints dropped, marker slot folded', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'none',
      value: null,
    });
    render(<MapArtPanel campaignId="sandbox" />);
    // Pick a recolor for forest, tint the plains DEFAULT tile, pick a marker.
    fireEvent.change(await screen.findByLabelText('forest tile'), {
      target: { value: 'forest-frost' },
    });
    fireEvent.change(screen.getByLabelText('plains hue'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('town marker tile'), { target: { value: 'castle' } });
    fireEvent.change(screen.getByLabelText('town marker sat'), { target: { value: '0.7' } });
    fireEvent.click(screen.getByTestId('save-map-art-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    expect(mocked.putCampaignSection).toHaveBeenCalledWith('sandbox', 'terrainArt', {
      forest: 'forest-frost', // bare pick, no tint → just the id
      plains: { tile: 'plains', tint: { hue: 20 } }, // tinted default keeps its own tile id
      markers: { town: { tile: 'castle', tint: { saturate: 0.7 } } },
    });
  });

  it('RESET returns a row to its default and the row then stores nothing', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'db',
      value: { swamp: { tile: 'swamp-blight', tint: { hue: -60 } } },
    });
    render(<MapArtPanel campaignId="sandbox" />);
    fireEvent.click(await screen.findByLabelText('swamp reset'));
    expect((screen.getByLabelText('swamp tile') as HTMLSelectElement).value).toBe('swamp');
    expect((screen.getByLabelText('swamp hue') as HTMLInputElement).value).toBe('0');
    fireEvent.click(screen.getByTestId('save-map-art-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    expect(mocked.putCampaignSection.mock.calls[0][2]).toEqual({});
  });

  it('a theme preset fills every row; entries the panel does not surface survive a save', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'db',
      // `garden` isn't one of the panel's overland rows — authored via raw JSON.
      value: { garden: 'plains-tundra' },
    });
    render(<MapArtPanel campaignId="sandbox" />);
    fireEvent.click(await screen.findByTestId('map-art-preset-ashlands'));
    expect((screen.getByLabelText('plains tile') as HTMLSelectElement).value).toBe('plains-ash');
    expect((screen.getByLabelText('water tile') as HTMLSelectElement).value).toBe('water-murk');
    fireEvent.click(screen.getByTestId('save-map-art-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Record<string, unknown>;
    expect(saved.garden).toBe('plains-tundra'); // raw-JSON extra carried through
    expect(saved.plains).toBe('plains-ash');
    expect(saved.snow).toBe('snow-ashfall');
    expect(saved.markers).toBeUndefined(); // marker untouched → not stored
    // The preset lays its mood tint over every floor family too.
    expect(saved.floors).toEqual({
      grass: { tile: 'grass', tint: { saturate: 0.45, brightness: 0.75 } },
      dirt: { tile: 'dirt', tint: { saturate: 0.45, brightness: 0.75 } },
      cobblestone: { tile: 'cobblestone', tint: { saturate: 0.45, brightness: 0.75 } },
      sand: { tile: 'sand', tint: { saturate: 0.45, brightness: 0.75 } },
    });
    // CLASSIC clears back to all-defaults (the extra still survives).
    fireEvent.click(screen.getByTestId('map-art-preset-classic'));
    fireEvent.click(screen.getByTestId('save-map-art-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(2));
    expect(mocked.putCampaignSection.mock.calls[1][2]).toEqual({ garden: 'plains-tundra' });
  });

  it('the TOWN & LOCAL tab edits floor skins: remap a family and/or tint it', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'db',
      value: { floors: { grass: { tile: 'sand', tint: { brightness: 0.8 } } } },
    });
    render(<MapArtPanel campaignId="sandbox" />);
    // Floor rows live behind the TOWN & LOCAL tab; the regional tab shows terrain.
    expect(await screen.findByLabelText('plains tile')).toBeTruthy();
    expect(screen.queryByLabelText('grass floor tile')).toBeNull();
    fireEvent.click(screen.getByTestId('map-art-tab-interior'));
    expect(screen.queryByLabelText('plains tile')).toBeNull();
    // The stored remap + tint loaded into the row.
    expect((screen.getByLabelText('grass floor tile') as HTMLSelectElement).value).toBe('sand');
    expect((screen.getByLabelText('grass floor bri') as HTMLInputElement).value).toBe('0.8');
    // Tint another family and save: both ride in the floors slot.
    fireEvent.change(screen.getByLabelText('cobblestone floor hue'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('save-map-art-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    expect(mocked.putCampaignSection).toHaveBeenCalledWith('sandbox', 'terrainArt', {
      floors: {
        grass: { tile: 'sand', tint: { brightness: 0.8 } },
        cobblestone: { tile: 'cobblestone', tint: { hue: 15 } },
      },
    });
  });

  it('non-object section values (none / malformed) read as empty and render all defaults', async () => {
    mocked.getCampaignSection.mockResolvedValue({ section: 'terrainArt', source: 'db', value: [] });
    render(<MapArtPanel campaignId="sandbox" />);
    expect(((await screen.findByLabelText('plains tile')) as HTMLSelectElement).value).toBe(
      'plains'
    );
    expect((screen.getByLabelText('town marker tile') as HTMLSelectElement).value).toBe('village');
    expect(screen.getByTestId('save-map-art-btn')).toHaveProperty('disabled', true); // nothing dirty
  });
});
