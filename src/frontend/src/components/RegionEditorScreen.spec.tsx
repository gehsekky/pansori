import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import RegionEditorScreen from './RegionEditorScreen';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
  },
}));

import { api } from '../lib/api.ts';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const REGION = {
  id: 'proving-grounds',
  name: 'The Proving Grounds',
  isStartingRegion: true,
  feetPerSquare: 5280,
  grid: [
    [{ t: 'plains' }, { t: 'plains' }, { t: 'road' }],
    [{ t: 'plains' }, { t: 'forest', tier: 2 }, { t: 'road' }],
  ],
  startPos: { x: 0, y: 0 },
  sites: [{ id: 'pit', name: 'The Pit', pos: { x: 2, y: 1 }, kind: 'local' }],
};

const OTHER = {
  id: 'frost-reach',
  name: 'The Frost Reach',
  isStartingRegion: false,
  feetPerSquare: 5280,
  grid: [[{ t: 'snow' }]],
  startPos: { x: 0, y: 0 },
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  // The region painter loads its section AND the towns list (for the site
  // tool's town picker) — dispatch by section.
  mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
    section === 'regions'
      ? { section, source: 'db', value: [REGION, OTHER] }
      : { section, source: 'db', value: [{ id: 'oakvale', name: 'Oakvale' }] }
  );
  mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'regions', source: 'db' });
});

function renderEditor(onBack = vi.fn()) {
  return render(
    <RegionEditorScreen campaignId="sandbox" regionId="proving-grounds" onBack={onBack} />
  );
}

describe('RegionEditorScreen', () => {
  it('loads the region and renders its grid with markers', async () => {
    renderEditor();
    expect(await screen.findByText(/REGION MAP — THE PROVING GROUNDS/)).toBeTruthy();
    expect(screen.getByText(/3×2 · 1 SQUARE = 5280 FT/)).toBeTruthy();
    // Start marker + site marker land on the right cells.
    expect(screen.getByTestId('cell-0-0').getAttribute('aria-label')).toContain('(start)');
    expect(screen.getByTestId('cell-2-1').getAttribute('aria-label')).toContain('site: The Pit');
    // Tier override shows in the label.
    expect(screen.getByTestId('cell-1-1').getAttribute('aria-label')).toContain('tier 2');
  });

  it('paints terrain and saves the whole regions list with the edit', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    // Pick the water brush, paint (0,1).
    fireEvent.click(screen.getByRole('button', { name: /WATER/ }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-1'));
    expect(screen.getByTestId('cell-0-1').getAttribute('aria-label')).toContain('water');
    expect(screen.getByText(/UNSAVED/)).toBeTruthy();

    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [cid, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(cid).toBe('sandbox');
    expect(section).toBe('regions');
    const list = value as (typeof REGION)[];
    // Both regions present; only ours changed; the untouched one is intact.
    expect(list.map((r) => r.id)).toEqual(['proving-grounds', 'frost-reach']);
    expect(list[0].grid[1][0]).toEqual({ t: 'water' });
    expect(list[1]).toEqual(OTHER);
    expect(await screen.findByText('SAVED — LIVE NOW')).toBeTruthy();
  });

  it('drag-paints across cells while the mouse is down', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: /MOUNTAINS/ }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-0'));
    fireEvent.mouseEnter(screen.getByTestId('cell-1-0'));
    fireEvent.mouseEnter(screen.getByTestId('cell-2-0'));
    for (const x of [0, 1, 2]) {
      expect(screen.getByTestId(`cell-${x}-0`).getAttribute('aria-label')).toContain('mountain');
    }
    // After mouseup, hovering paints nothing.
    fireEvent.mouseUp(window);
    fireEvent.mouseEnter(screen.getByTestId('cell-0-1'));
    expect(screen.getByTestId('cell-0-1').getAttribute('aria-label')).toContain('plains');
  });

  it('tier tool paints and clears per-cell overrides', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'TIER' }));
    fireEvent.click(screen.getByRole('button', { name: 'TIER 3' }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-0'));
    expect(screen.getByTestId('cell-0-0').getAttribute('aria-label')).toContain('tier 3');
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-1')); // had tier 2
    expect(screen.getByTestId('cell-1-1').getAttribute('aria-label')).not.toContain('tier');
  });

  it('start tool relocates the marker', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'START POS' }));
    fireEvent.mouseDown(screen.getByTestId('cell-2-0'));
    expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).toContain('(start)');
    expect(screen.getByTestId('cell-0-0').getAttribute('aria-label')).not.toContain('(start)');
  });

  it('resizing preserves painted content and fills new cells with plains', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.change(screen.getByLabelText('Grid width'), { target: { value: '4' } });
    expect(screen.getByText(/4×2/)).toBeTruthy();
    expect(screen.getByTestId('cell-3-0').getAttribute('aria-label')).toContain('plains');
    expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).toContain('road');
  });

  it('reports an unknown region', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'db',
      value: [OTHER],
    });
    renderEditor();
    expect(await screen.findByText(/No region "proving-grounds"/)).toBeTruthy();
  });

  it('details form edits name/desc/scale/tiering and saves them with the map', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    // Pre-filled from the loaded region.
    expect((screen.getByLabelText('NAME') as HTMLInputElement).value).toBe('The Proving Grounds');
    expect((screen.getByLabelText('FEET PER SQUARE') as HTMLInputElement).value).toBe('5280');

    fireEvent.change(screen.getByLabelText('NAME'), { target: { value: 'The Crucible' } });
    fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: 'Iron and ash.' } });
    fireEvent.change(screen.getByLabelText('ENCOUNTER CHANCE (0–1)'), {
      target: { value: '0.25' },
    });
    fireEvent.change(screen.getByLabelText('BASE TIER'), { target: { value: '2' } });
    expect(screen.getByText(/UNSAVED/)).toBeTruthy();

    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as (typeof REGION)[];
    expect(list[0].name).toBe('The Crucible');
    expect((list[0] as { desc?: string }).desc).toBe('Iron and ash.');
    expect((list[0] as { encounterChance?: number }).encounterChance).toBe(0.25);
    expect((list[0] as { baseTier?: number }).baseTier).toBe(2);
    // Untouched fields survive the merge.
    expect(list[0].isStartingRegion).toBe(true);
    expect(list[0].sites).toEqual(REGION.sites);
  });

  it('ON ENTER narration round-trips through the details form (regions only)', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.change(screen.getByLabelText(/ON ENTER NARRATION/), {
      target: { value: 'The mists part as you crest the ridge.' },
    });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{ onEnter?: string }>;
    expect(saved[0].onEnter).toBe('The mists part as you crest the ridge.');
  });

  it('clearing an optional detail removes the key instead of writing empty', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'db',
      value: [
        { ...REGION, desc: 'old', onEnter: 'old hook', encounterChance: 0.5, baseTier: 3 },
        OTHER,
      ],
    });
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/ON ENTER NARRATION/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('ENCOUNTER CHANCE (0–1)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('BASE TIER'), { target: { value: '' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect('desc' in saved[0]).toBe(false);
    expect('onEnter' in saved[0]).toBe(false);
    expect('encounterChance' in saved[0]).toBe(false);
    expect('baseTier' in saved[0]).toBe(false);
  });

  it('rejects an out-of-range encounter chance client-side', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.change(screen.getByLabelText('ENCOUNTER CHANCE (0–1)'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('SAVE'));
    expect(await screen.findByText(/ENCOUNTER CHANCE must be between 0 and 1/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
  });

  it('MAKE STARTING REGION claims the flag and releases it from the others', async () => {
    render(<RegionEditorScreen campaignId="sandbox" regionId="frost-reach" onBack={vi.fn()} />);
    await screen.findByTestId('cell-0-0');
    // frost-reach is not the starter — the claim button shows.
    fireEvent.click(screen.getByTestId('make-starter-btn'));
    expect(screen.getByText(/BECOMES THE STARTING REGION ON SAVE/)).toBeTruthy();
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as (typeof REGION)[];
    expect(list.find((r) => r.id === 'frost-reach')!.isStartingRegion).toBe(true);
    expect(list.find((r) => r.id === 'proving-grounds')!.isStartingRegion).toBe(false);
    // After the save the badge replaces the pending note.
    expect(await screen.findByText('★ STARTING REGION')).toBeTruthy();
  });

  it('the starting region shows the badge, not the claim button', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    expect(screen.getByText('★ STARTING REGION')).toBeTruthy();
    expect(screen.queryByTestId('make-starter-btn')).toBeNull();
  });

  it('SITES tool places a new site, edits it via the form, and saves it with the map', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    // Place on an empty cell → a draft site appears, selected.
    fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
    expect(screen.getByTestId('cell-1-0').getAttribute('aria-label')).toContain('site: New Site');
    fireEvent.change(screen.getByLabelText('NAME', { selector: '#site-name' }), {
      target: { value: 'Oakvale' },
    });
    fireEvent.change(screen.getByLabelText('KIND'), { target: { value: 'town' } });
    fireEvent.change(screen.getByLabelText('TOWN'), { target: { value: 'oakvale' } });
    fireEvent.change(screen.getByLabelText('ON ENTER NARRATION', { selector: '#site-on-enter' }), {
      target: { value: 'Smoke curls from the chimneys.' },
    });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as (typeof REGION)[];
    const sites = list[0].sites!;
    expect(sites).toHaveLength(2); // The Pit + the new town site
    const added = sites.find((s) => s.name === 'Oakvale')! as Record<string, unknown>;
    expect(added.kind).toBe('town');
    expect(added.townId).toBe('oakvale');
    expect(added.onEnter).toBe('Smoke curls from the chimneys.');
    expect(added.pos).toEqual({ x: 1, y: 0 });
    // Flipping to town pruned the local target; empty optionals pruned too.
    expect('entryRoomId' in added).toBe(false);
    expect('icon' in added).toBe(false);
  });

  it('selecting a marker edits it; DELETE removes it from the save', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    // Click the existing site marker (The Pit at 2,1) → selected in the form.
    fireEvent.mouseDown(screen.getByTestId('cell-2-1'));
    expect(
      (screen.getByLabelText('NAME', { selector: '#site-name' }) as HTMLInputElement).value
    ).toBe('The Pit');
    fireEvent.click(screen.getByTestId('site-delete-btn'));
    expect(screen.getByTestId('cell-2-1').getAttribute('aria-label')).not.toContain('The Pit');
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as (typeof REGION)[];
    // The only site was deleted — the key drops entirely.
    expect('sites' in list[0]).toBe(false);
  });

  it('MOVE arms a relocation: the next cell click moves the selected site', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-2-1')); // select The Pit
    fireEvent.click(screen.getByTestId('site-move-btn'));
    fireEvent.mouseDown(screen.getByTestId('cell-0-1'));
    expect(screen.getByTestId('cell-0-1').getAttribute('aria-label')).toContain('site: The Pit');
    expect(screen.getByTestId('cell-2-1').getAttribute('aria-label')).not.toContain('The Pit');
    // Disarmed after the move — the next empty click places a NEW site.
    fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
    expect(screen.getByTestId('cell-1-0').getAttribute('aria-label')).toContain('site: New Site');
  });

  it('site placement is click-only — dragging never scatters markers', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
    fireEvent.mouseEnter(screen.getByTestId('cell-2-0'));
    expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).not.toContain('site');
  });

  it('VENUES tool in town mode: interior venues take an entry room id', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'towns',
      source: 'db',
      value: [
        {
          id: 'oakvale',
          name: 'Oakvale',
          feetPerSquare: 25,
          grid: [
            [{ t: 'plains' }, { t: 'plains' }],
            [{ t: 'plains' }, { t: 'plains' }],
          ],
          startPos: { x: 0, y: 0 },
        },
      ],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'towns', source: 'db' });
    render(
      <RegionEditorScreen campaignId="sandbox" regionId="oakvale" kind="town" onBack={vi.fn()} />
    );
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'VENUES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-1'));
    fireEvent.change(screen.getByLabelText('NAME', { selector: '#site-name' }), {
      target: { value: 'The Split Acorn' },
    });
    fireEvent.change(screen.getByLabelText('ENTRY ROOM ID'), {
      target: { value: 'acorn-taproom' },
    });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [, section, value] = mocked.putCampaignSection.mock.calls[0];
    expect(section).toBe('towns');
    const town = (value as Array<{ venues?: Array<Record<string, unknown>> }>)[0];
    expect(town.venues).toEqual([
      {
        id: 'venue-1',
        name: 'The Split Acorn',
        pos: { x: 1, y: 1 },
        kind: 'interior',
        entryRoomId: 'acorn-taproom',
      },
    ]);
  });

  it('town mode swaps the region-only details for the floor picker', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'towns',
      source: 'db',
      value: [
        {
          id: 'oakvale',
          name: 'Oakvale',
          feetPerSquare: 25,
          grid: [[{ t: 'plains' }, { t: 'road' }]],
          startPos: { x: 0, y: 0 },
          floor: 'dirt',
        },
      ],
    });
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'towns', source: 'db' });
    render(
      <RegionEditorScreen campaignId="sandbox" regionId="oakvale" kind="town" onBack={vi.fn()} />
    );
    await screen.findByTestId('cell-0-0');
    expect((screen.getByLabelText('FLOOR') as HTMLSelectElement).value).toBe('dirt');
    expect(screen.queryByLabelText('ENCOUNTER CHANCE (0–1)')).toBeNull();
    expect(screen.queryByLabelText('BASE TIER')).toBeNull();
    expect(screen.queryByLabelText(/ON ENTER NARRATION/)).toBeNull();
    expect(screen.queryByTestId('make-starter-btn')).toBeNull();
    fireEvent.change(screen.getByLabelText('FLOOR'), { target: { value: 'cobblestone' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{ floor?: string }>;
    expect(saved[0].floor).toBe('cobblestone');
  });
});
