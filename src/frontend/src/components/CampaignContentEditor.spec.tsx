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
    listItemCatalog: vi.fn(),
    listMonsterCatalog: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const CATALOG = [
  { id: 'dagger', name: 'Dagger', type: 'weapon', desc: '1d4 piercing', damage: '1d4' },
  { id: 'longsword', name: 'Longsword', type: 'weapon', desc: '1d8 slashing', damage: '1d8' },
  { id: 'leather_armor', name: 'Leather Armor', type: 'armor', desc: 'AC 11', damage: null },
];

const MONSTERS = [
  {
    id: 'bandit',
    definition: { name: 'Bandit', cr: 0.125, hp: 11, ac: 12, toHit: 3, damage: '1d6+1' },
  },
  {
    id: 'ogre',
    definition: { name: 'Ogre', cr: 2, hp: 59, ac: 11, toHit: 6, damage: '2d8+4' },
  },
];

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.listCampaignSections.mockResolvedValue([
    { section: 'displayNoun', source: 'code' },
    { section: 'narratives', source: 'db' },
    { section: 'lootTable', source: 'code' },
    { section: 'enemyTemplates', source: 'code' },
  ]);
  mocked.listItemCatalog.mockResolvedValue(CATALOG);
  mocked.listMonsterCatalog.mockResolvedValue(MONSTERS);
});

describe('CampaignContentEditor', () => {
  it('lists sections with their source badges', async () => {
    render(<CampaignContentEditor campaignId="malgovia" />);
    expect(await screen.findByText('DISPLAYNOUN')).toBeTruthy();
    expect(screen.getByText('NARRATIVES')).toBeTruthy();
    expect(screen.getAllByText('CODE').length).toBeGreaterThan(0);
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

  it('lootTable opens as a badge picker, grouped by type, preselected from the value', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'lootTable',
      source: 'code',
      value: [CATALOG[0]], // dagger offered
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('LOOTTABLE'));
    // Group headers + badges.
    expect(await screen.findByText('WEAPONS')).toBeTruthy();
    expect(screen.getByText('ARMOR')).toBeTruthy();
    const dagger = screen.getByRole('button', { name: /Dagger/ });
    const longsword = screen.getByRole('button', { name: /Longsword/ });
    expect(dagger.getAttribute('aria-pressed')).toBe('true');
    expect(longsword.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/1 SELECTED/)).toBeTruthy();
  });

  it('toggling badges and saving sends full definitions in catalog order', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'lootTable',
      source: 'code',
      value: [CATALOG[0]],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'lootTable', source: 'db' });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('LOOTTABLE'));
    fireEvent.click(await screen.findByRole('button', { name: /Leather Armor/ }));
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('malgovia', 'lootTable', [
        CATALOG[0],
        CATALOG[2],
      ])
    );
    expect(await screen.findByText('SAVED — LIVE NOW')).toBeTruthy();
  });

  it('preserves stored tweaks and custom items through a badge save', async () => {
    const tweakedDagger = { ...CATALOG[0], name: 'Ceremonial Dagger' };
    const custom = { id: 'sun-relic', name: 'Sun Relic', type: 'misc', desc: 'warm disc' };
    mocked.getCampaignSection.mockResolvedValue({
      section: 'lootTable',
      source: 'db',
      value: [tweakedDagger, custom],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'lootTable', source: 'db' });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('LOOTTABLE'));
    // Custom item renders under its own header, selected.
    expect(await screen.findByText('CAMPAIGN CUSTOM')).toBeTruthy();
    const relic = screen.getByRole('button', { name: /Sun Relic/ });
    expect(relic.getAttribute('aria-pressed')).toBe('true');
    // The tweaked catalog item renders under its catalog name, flagged.
    expect(screen.getByRole('button', { name: /Dagger\s*\(tweaked\)/ })).toBeTruthy();
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('malgovia', 'lootTable', [
        tweakedDagger,
        custom,
      ])
    );
  });

  it('enemyTemplates picker matches by deep equality — rethemes are customs', async () => {
    const retheme = { ...MONSTERS[0].definition, name: 'Frost Bandit' };
    mocked.getCampaignSection.mockResolvedValue({
      section: 'enemyTemplates',
      source: 'code',
      value: [MONSTERS[1].definition, retheme], // exact ogre + rethemed bandit
    });
    mocked.putCampaignSection.mockResolvedValue({
      ok: true,
      section: 'enemyTemplates',
      source: 'db',
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('ENEMYTEMPLATES'));
    // CR group headers; the exact ogre matches its catalog badge.
    expect(await screen.findByText('CR 0 – 1/2')).toBeTruthy();
    const ogre = screen.getByRole('button', { name: /Ogre \(CR 2\)/ });
    expect(ogre.getAttribute('aria-pressed')).toBe('true');
    // The rethemed bandit is NOT the catalog bandit — it's a custom.
    const bandit = screen.getByRole('button', { name: /Bandit \(CR 1\/8\)/ });
    expect(bandit.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('CAMPAIGN CUSTOM')).toBeTruthy();
    const frostBandit = screen.getByRole('button', { name: /Frost Bandit/ });
    expect(frostBandit.getAttribute('aria-pressed')).toBe('true');
    // Save: catalog ogre + the preserved retheme.
    fireEvent.click(screen.getByText('SAVE TO DATABASE'));
    await waitFor(() =>
      expect(mocked.putCampaignSection).toHaveBeenCalledWith('malgovia', 'enemyTemplates', [
        MONSTERS[1].definition,
        retheme,
      ])
    );
  });

  it('EDIT AS JSON round-trips the selection through the textarea', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'lootTable',
      source: 'code',
      value: [CATALOG[0]],
    });
    render(<CampaignContentEditor campaignId="malgovia" />);
    fireEvent.click(await screen.findByText('LOOTTABLE'));
    await screen.findByText('WEAPONS');
    fireEvent.click(screen.getByText('EDIT AS JSON'));
    const textarea = (await screen.findByLabelText(/LOOTTABLE/)) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"dagger"');
    // Add an item in JSON, switch back — the badge picks it up.
    fireEvent.change(textarea, {
      target: { value: JSON.stringify([CATALOG[0], CATALOG[1]]) },
    });
    fireEvent.click(screen.getByText('BADGE PICKER'));
    const longsword = await screen.findByRole('button', { name: /Longsword/ });
    expect(longsword.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/2 SELECTED/)).toBeTruthy();
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
