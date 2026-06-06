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
    { section: 'displayNoun', source: 'code' },
    { section: 'narratives', source: 'db' },
  ]);
});

describe('CampaignContentEditor', () => {
  it('lists sections with their source badges', async () => {
    render(<CampaignContentEditor campaignId="malgovia" />);
    expect(await screen.findByText('DISPLAYNOUN')).toBeTruthy();
    expect(screen.getByText('NARRATIVES')).toBeTruthy();
    expect(screen.getByText('CODE')).toBeTruthy();
    expect(screen.getByText('DATABASE')).toBeTruthy();
  });

  it('opens a section and loads its effective value as JSON', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'displayNoun',
      source: 'code',
      value: 'vale',
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('DISPLAYNOUN'));
    const textarea = (await screen.findByLabelText(
      /DISPLAYNOUN — SERVING FROM CODE/
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('"vale"'));
    // Code-sourced section has no DB version to revert.
    expect(screen.queryByText('REVERT TO CODE')).toBeNull();
  });

  it('saves parsed JSON to the database and flips the badge', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'displayNoun',
      source: 'code',
      value: 'vale',
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'displayNoun', source: 'db' });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('DISPLAYNOUN'));
    const textarea = await screen.findByLabelText(/DISPLAYNOUN/);
    fireEvent.change(textarea, { target: { value: '"marsh"' } });
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('malgovia', 'displayNoun', 'marsh')
    );
    expect(await screen.findByText('SAVED — LIVE NOW')).toBeTruthy();
  });

  it('rejects invalid JSON client-side without calling the api', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'displayNoun',
      source: 'code',
      value: 'vale',
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('DISPLAYNOUN'));
    const textarea = await screen.findByLabelText(/DISPLAYNOUN/);
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
