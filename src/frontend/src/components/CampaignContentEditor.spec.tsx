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
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.listCampaignSections.mockResolvedValue([
    { section: 'gameStart', source: 'code' },
    { section: 'narratives', source: 'db' },
    { section: 'customItems', source: 'code' },
    { section: 'customMonsters', source: 'none' },
  ]);
});

describe('CampaignContentEditor', () => {
  it('lists sections with their source badges', async () => {
    render(<CampaignContentEditor campaignId="malgovia" />);
    expect(await screen.findByText('GAMESTART')).toBeTruthy();
    expect(screen.getByText('NARRATIVES')).toBeTruthy();
    expect(screen.getByText('CUSTOMITEMS')).toBeTruthy();
    expect(screen.getByText('CUSTOMMONSTERS')).toBeTruthy();
    expect(screen.getAllByText('CODE').length).toBeGreaterThan(0);
    expect(screen.getByText('DATABASE')).toBeTruthy();
    expect(screen.getByText('EMPTY')).toBeTruthy();
  });

  it('opens a plain-text section raw — no JSON quoting', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'gameStart',
      source: 'code',
      value: 'A fresh world, waiting to be written.',
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('GAMESTART'));
    const textarea = (await screen.findByLabelText(
      /GAMESTART — SERVING FROM CODE · PLAIN TEXT/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('A fresh world, waiting to be written.'));
    // Code-sourced section has no DB version to revert.
    expect(screen.queryByText('REVERT TO CODE')).toBeNull();
  });

  it('loads code customs as a starting point for the customs sections', async () => {
    const codeCustoms = [{ id: 'moonstone', name: 'Moonstone Amulet' }];
    mocked.getCampaignSection.mockResolvedValue({
      section: 'customItems',
      source: 'code',
      value: codeCustoms,
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('CUSTOMITEMS'));
    const textarea = (await screen.findByLabelText(
      /CUSTOMITEMS — SERVING FROM CODE/
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
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('GAMESTART'));
    const textarea = await screen.findByLabelText(/GAMESTART/);
    const raw = 'The caravan stops — "end of the line," the driver mutters.\nYou climb down.';
    fireEvent.change(textarea, { target: { value: raw } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    // The textarea content IS the value — stored verbatim, never JSON-parsed.
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('malgovia', 'gameStart', raw)
    );
    expect(await screen.findByText('SAVED — LIVE NOW')).toBeTruthy();
  });

  it('rejects invalid JSON client-side without calling the api (structured sections)', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'narratives',
      source: 'db',
      value: {},
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    const textarea = await screen.findByLabelText(/NARRATIVES/);
    fireEvent.change(textarea, { target: { value: '{not json' } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    expect(await screen.findByText(/Not valid JSON/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
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
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    const textarea = await screen.findByLabelText(/NARRATIVES/);
    fireEvent.change(textarea, { target: { value: '{}' } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    expect(await screen.findByText(/Invalid shape — genericArrival: Required/)).toBeTruthy();
  });

  it('regions section is plain JSON — no paint row (the REGIONS panel owns that)', async () => {
    mocked.listCampaignSections.mockResolvedValue([{ section: 'regions', source: 'db' }]);
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'db',
      value: [{ id: 'vale', name: 'The Vale', isStartingRegion: true }],
    });
    render(<CampaignContentEditor campaignId="malgovia" onEditMap={vi.fn()} />);
    fireEvent.click(await screen.findByText('REGIONS'));
    const textarea = (await screen.findByLabelText(
      /REGIONS — SERVING FROM DATABASE/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain('The Vale'));
    expect(screen.queryByText(/PAINT MAP/)).toBeNull();
    expect(screen.queryByText(/INSERT STARTER/)).toBeNull();
  });

  it('towns section offers PAINT buttons and a gate-equipped starter', async () => {
    mocked.listCampaignSections.mockResolvedValue([{ section: 'towns', source: 'none' }]);
    mocked.getCampaignSection.mockResolvedValue({ section: 'towns', source: 'none', value: null });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'towns', source: 'db' });
    const onEditMap = vi.fn();
    render(<CampaignContentEditor campaignId="malgovia" onEditMap={onEditMap} />);
    fireEvent.click(await screen.findByText('TOWNS'));
    expect(await screen.findByText(/NO SAVED TOWNS YET/)).toBeTruthy();
    fireEvent.click(screen.getByText('INSERT STARTER TOWN'));
    const textarea = screen.getByLabelText(/TOWNS/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"town-1"');
    expect(textarea.value).toContain('"gate"');
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    fireEvent.click(await screen.findByRole('button', { name: /New Town/ }));
    expect(onEditMap).toHaveBeenCalledWith('town', 'town-1');
  });

  it('reverts a DB section to code after confirm and reloads it', async () => {
    mocked.getCampaignSection
      .mockResolvedValueOnce({ section: 'narratives', source: 'db', value: { a: 1 } })
      .mockResolvedValueOnce({ section: 'narratives', source: 'code', value: { b: 2 } });
    mocked.deleteCampaignSection.mockResolvedValue({
      ok: true,
      section: 'narratives',
      source: 'code',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('NARRATIVES'));
    fireEvent.click(await screen.findByText('REVERT TO CODE'));
    await waitFor(() =>
      expect(mocked.deleteCampaignSection).toHaveBeenCalledWith('malgovia', 'narratives')
    );
    // Reloaded as the code version.
    expect(await screen.findByLabelText(/NARRATIVES — SERVING FROM CODE/)).toBeTruthy();
    confirmSpy.mockRestore();
  });
});
