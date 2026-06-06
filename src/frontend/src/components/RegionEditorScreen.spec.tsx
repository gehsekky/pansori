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
  mocked.getCampaignSection.mockResolvedValue({
    section: 'regions',
    source: 'db',
    value: [REGION, OTHER],
  });
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
});
