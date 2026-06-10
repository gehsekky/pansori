import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CampaignContentEditor from './CampaignContentEditor';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    listCampaignSections: vi.fn(),
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
    deleteCampaignSection: vi.fn(),
    validateCampaign: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.validateCampaign.mockResolvedValue({ issues: [] });
  mocked.listCampaignSections.mockResolvedValue([
    { section: 'gameStart', source: 'code' },
    { section: 'narratives', source: 'db' },
    { section: 'customItems', source: 'code' },
    { section: 'customMonsters', source: 'none' },
  ]);
});

describe('CampaignContentEditor', () => {
  it('lists sections with their source badges', async () => {
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    expect(await screen.findByText('GAMESTART')).toBeTruthy();
    expect(screen.getByText('NARRATIVES')).toBeTruthy();
    expect(screen.getByText('CUSTOMITEMS')).toBeTruthy();
    expect(screen.getByText('CUSTOMMONSTERS')).toBeTruthy();
    expect(screen.getAllByText('TEMPLATE').length).toBeGreaterThan(0);
    expect(screen.getByText('DATABASE')).toBeTruthy();
    expect(screen.getByText('EMPTY')).toBeTruthy();
  });

  it('shows the clean-references banner when validate finds nothing', async () => {
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    expect(await screen.findByTestId('lint-clean')).toBeTruthy();
  });

  it('lists dangling cross-section references from the validate lint', async () => {
    mocked.validateCampaign.mockResolvedValue({
      issues: [
        {
          severity: 'warning',
          category: 'quest',
          location: 'room "cellar" NPC "hob" → reply 0',
          message: 'start_quest → unknown quest "rats"',
        },
      ],
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    expect(await screen.findByTestId('lint-issues')).toBeTruthy();
    expect(screen.getByText(/start_quest → unknown quest "rats"/)).toBeTruthy();
    expect(screen.getByText(/room "cellar" NPC "hob"/)).toBeTruthy();
  });

  it('opens a plain-text section raw — no JSON quoting', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'gameStart',
      source: 'code',
      value: 'A fresh world, waiting to be written.',
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('GAMESTART'));
    const textarea = (await screen.findByLabelText(
      /GAMESTART — SERVING FROM TEMPLATE · PLAIN TEXT/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('A fresh world, waiting to be written.'));
    // Template-sourced section has no DB version to reset.
    expect(screen.queryByText('RESET TO TEMPLATE')).toBeNull();
  });

  it('loads code customs as a starting point for the customs sections', async () => {
    const codeCustoms = [{ id: 'moonstone', name: 'Moonstone Amulet' }];
    mocked.getCampaignSection.mockResolvedValue({
      section: 'customItems',
      source: 'code',
      value: codeCustoms,
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('CUSTOMITEMS'));
    const textarea = (await screen.findByLabelText(
      /CUSTOMITEMS — SERVING FROM TEMPLATE/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain('Moonstone Amulet'));
  });

  it('saves plain text verbatim — quotes and newlines need no escaping', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'gameStart',
      source: 'code',
      value: 'A fresh world.',
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'gameStart', source: 'db' });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('GAMESTART'));
    const textarea = await screen.findByLabelText(/GAMESTART/);
    const raw = 'The caravan stops — "end of the line," the driver mutters.\nYou climb down.';
    fireEvent.change(textarea, { target: { value: raw } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    // The textarea content IS the value — stored verbatim, never JSON-parsed.
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('demo_campaign', 'gameStart', raw)
    );
    expect(await screen.findByText('SAVED — LIVE NOW')).toBeTruthy();
  });

  it('rejects invalid JSON client-side without calling the api (structured sections)', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'narratives',
      source: 'db',
      value: {},
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    const textarea = await screen.findByLabelText(/NARRATIVES/);
    fireEvent.change(textarea, { target: { value: '{not json' } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    expect(await screen.findByText(/Not valid JSON/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });

  it('terrainArt offers theme presets that pre-fill the override map', async () => {
    mocked.listCampaignSections.mockResolvedValue([{ section: 'terrainArt', source: 'none' }]);
    mocked.getCampaignSection.mockResolvedValue({
      section: 'terrainArt',
      source: 'none',
      value: null,
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'terrainArt', source: 'db' });
    render(<CampaignContentEditor campaignId="the-sky-has-fallen" />);
    fireEvent.click(await screen.findByText('TERRAINART'));
    await screen.findByText('THEME PRESET:');
    // The valid-tile-id hint is shown for hand-tweaking.
    expect(screen.getByText(/TILES: plains · road/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('terrain-theme-ashlands'));
    const textarea = screen.getByLabelText(/TERRAINART/) as HTMLTextAreaElement;
    const parsed = JSON.parse(textarea.value);
    expect(parsed.plains).toBe('plains-ash');
    expect(parsed.forest).toBe('forest-dead');
    // CLASSIC resets to the empty map (all defaults).
    fireEvent.click(screen.getByTestId('terrain-theme-classic'));
    expect(JSON.parse((screen.getByLabelText(/TERRAINART/) as HTMLTextAreaElement).value)).toEqual(
      {}
    );
    // Saving sends the parsed override map.
    fireEvent.click(screen.getByTestId('terrain-theme-frostbound'));
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith(
        'the-sky-has-fallen',
        'terrainArt',
        expect.objectContaining({ water: 'water-ice' })
      )
    );
  });

  it('surfaces server-side shape validation issues', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'narratives',
      source: 'db',
      value: {},
    });
    mocked.putCampaignSection.mockRejectedValue({
      error: 'invalid_section_value',
      issues: [{ path: 'genericArrival', message: 'Required' }],
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    const textarea = await screen.findByLabelText(/NARRATIVES/);
    fireEvent.change(textarea, { target: { value: '{}' } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    expect(await screen.findByText(/Invalid shape — genericArrival: Required/)).toBeTruthy();
  });

  it('map sections are plain JSON — no paint rows (the REGIONS/TOWNS panels own that)', async () => {
    mocked.listCampaignSections.mockResolvedValue([
      { section: 'regions', source: 'db' },
      { section: 'towns', source: 'none' },
    ]);
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'db',
      value: [{ id: 'vale', name: 'The Vale', isStartingRegion: true }],
    });
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('REGIONS'));
    const textarea = (await screen.findByLabelText(
      /REGIONS — SERVING FROM DATABASE/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain('The Vale'));
    expect(screen.queryByText(/PAINT MAP/)).toBeNull();
    expect(screen.queryByText(/INSERT STARTER/)).toBeNull();
    mocked.getCampaignSection.mockResolvedValue({ section: 'towns', source: 'none', value: null });
    fireEvent.click(screen.getByText('TOWNS'));
    await screen.findByLabelText(/TOWNS — SERVING FROM EMPTY/);
    expect(screen.queryByText(/PAINT MAP/)).toBeNull();
    expect(screen.queryByText(/INSERT STARTER/)).toBeNull();
  });

  it('resets a DB section to the base template after confirm and reloads it', async () => {
    mocked.getCampaignSection
      .mockResolvedValueOnce({ section: 'narratives', source: 'db', value: { a: 1 } })
      .mockResolvedValueOnce({ section: 'narratives', source: 'code', value: { b: 2 } });
    mocked.deleteCampaignSection.mockResolvedValue({
      ok: true,
      section: 'narratives',
      source: 'code',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CampaignContentEditor campaignId="demo_campaign" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    fireEvent.click(await screen.findByText('RESET TO TEMPLATE'));
    await waitFor(() =>
      expect(mocked.deleteCampaignSection).toHaveBeenCalledWith('demo_campaign', 'narratives')
    );
    // Reloaded as the base-template fallback.
    expect(await screen.findByLabelText(/NARRATIVES — SERVING FROM TEMPLATE/)).toBeTruthy();
    confirmSpy.mockRestore();
  });
});
