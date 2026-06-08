import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NarrativesPanel from './NarrativesPanel';
import React from 'react';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// A representative slice of the real `narratives` shape: a flat pool, a tiered
// pool (combatHit), and a keyed map (enemyReactions).
const SEED = {
  genericArrival: ['You press on.', 'The way opens.'],
  combatHit: { high: ['A clean strike!'], mid: ['It connects.'], low: ['A glancing blow.'] },
  enemyReactions: { Goblin: ['snarls', 'shrieks'] },
};

describe('NarrativesPanel', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocked)) fn.mockReset();
    mocked.getCampaignSection.mockResolvedValue({
      section: 'narratives',
      source: 'db',
      value: SEED,
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'narratives', source: 'db' });
  });

  it('loads flat / tiered / keyed pools, one line per entry', async () => {
    render(<NarrativesPanel campaignId="sandbox" />);
    // Flat pool — newline-joined.
    expect(((await screen.findByLabelText('GENERIC ARRIVAL')) as HTMLTextAreaElement).value).toBe(
      'You press on.\nThe way opens.'
    );
    // Tiered pool — three buckets.
    expect((screen.getByLabelText('COMBAT HIT high') as HTMLTextAreaElement).value).toBe(
      'A clean strike!'
    );
    expect((screen.getByLabelText('COMBAT HIT mid') as HTMLTextAreaElement).value).toBe(
      'It connects.'
    );
    // Keyed map — the seeded key + its lines.
    expect((screen.getByLabelText('ENEMY REACTIONS key Goblin') as HTMLInputElement).value).toBe(
      'Goblin'
    );
    expect(
      (screen.getByLabelText('ENEMY REACTIONS lines Goblin') as HTMLTextAreaElement).value
    ).toBe('snarls\nshrieks');
  });

  it('ROOM ARRIVAL is no longer an editable pool (moved onto room onEnter)', async () => {
    render(<NarrativesPanel campaignId="sandbox" />);
    await screen.findByLabelText('GENERIC ARRIVAL');
    expect(screen.queryByText('ROOM ARRIVAL')).toBeNull();
  });

  it('edits a flat pool + tier, dropping blank lines on save', async () => {
    render(<NarrativesPanel campaignId="sandbox" />);
    const generic = (await screen.findByLabelText('GENERIC ARRIVAL')) as HTMLTextAreaElement;
    // A trailing blank line (an in-progress newline) is pruned on save.
    fireEvent.change(generic, { target: { value: 'Onward.\n\n  Forward.  ' } });
    fireEvent.change(screen.getByLabelText('COMBAT HIT low'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('save-narratives-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Record<string, unknown>;
    expect(saved.genericArrival).toEqual(['Onward.', 'Forward.']);
    // The emptied LOW tier is dropped; high + mid survive.
    expect(saved.combatHit).toEqual({ high: ['A clean strike!'], mid: ['It connects.'] });
    expect(saved.enemyReactions).toEqual({ Goblin: ['snarls', 'shrieks'] });
  });

  it('adds a keyed-map entry and folds it into the save', async () => {
    render(<NarrativesPanel campaignId="sandbox" />);
    await screen.findByLabelText('GENERIC ARRIVAL');
    fireEvent.change(screen.getByLabelText('Add WEAPON VERBS key'), {
      target: { value: 'dagger' },
    });
    fireEvent.click(screen.getByLabelText('Add WEAPON VERBS entry'));
    fireEvent.change(screen.getByLabelText('WEAPON VERBS lines dagger'), {
      target: { value: 'stabs with\nflicks' },
    });
    fireEvent.click(screen.getByTestId('save-narratives-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Record<string, unknown>;
    expect(saved.weaponVerbs).toEqual({ dagger: ['stabs with', 'flicks'] });
  });

  it('emits all required pools even when empty; optional rest pools are omitted', async () => {
    render(<NarrativesPanel campaignId="sandbox" />);
    await screen.findByLabelText('GENERIC ARRIVAL');
    // Clear the only enemyReactions key's lines → the entry drops, but the pool
    // itself is REQUIRED by the strict schema, so it serializes as `{}`.
    fireEvent.change(screen.getByLabelText('ENEMY REACTIONS lines Goblin'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('save-narratives-btn'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Record<string, unknown>;
    // Required map present but empty; required flat pool present but empty.
    expect(saved.enemyReactions).toEqual({});
    expect(saved.noLoot).toEqual([]);
    // Optional rest pools were never filled → omitted entirely.
    expect('shortRest' in saved).toBe(false);
    expect('longRest' in saved).toBe(false);
    expect('combatStart' in saved).toBe(false);
    // The strict NarrativesSchema requires every non-optional pool — assert the
    // save carries the full set so a missing key can't slip past validation.
    const REQUIRED = [
      'genericArrival',
      'weaponVerbs',
      'classStyle',
      'enemyReactions',
      'deathSaveStatus',
      'combatHit',
      'combatMiss',
      'enemyAttacks',
      'killShot',
      'lootPickedUp',
      'noLoot',
      'alreadyLooted',
      'noEnemy',
      'alreadyDead',
      'sneakSuccess',
      'deathLines',
      'enemyDeflected',
      'levelUp',
    ];
    for (const k of REQUIRED) expect(k in saved).toBe(true);
  });
});
