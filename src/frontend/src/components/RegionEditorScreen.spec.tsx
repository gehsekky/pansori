import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import RegionEditorScreen from './RegionEditorScreen';

vi.mock('../lib/api.ts', () => ({
  api: {
    getCampaignSection: vi.fn(),
    putCampaignSection: vi.fn(),
    getMonsterCatalog: vi.fn(),
    getItemCatalog: vi.fn(),
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
    [{ t: 'plains' }, { t: 'forest' }, { t: 'road' }],
  ],
  startPos: { x: 0, y: 0 },
  sites: [{ id: 'pit', name: 'The Pit', pos: { x: 2, y: 1 }, kind: 'local', entryRoomId: 'pit' }],
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
  // The region painter loads its section, the towns list (site TOWN
  // picker, via the hosted panel) and the rooms list (local-site ENTRY
  // ROOM picker) — dispatch by section.
  mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
    section === 'regions'
      ? { section, source: 'db', value: [REGION, OTHER] }
      : section === 'towns'
        ? { section, source: 'db', value: [{ id: 'oakvale', name: 'Oakvale' }] }
        : { section, source: 'db', value: [] }
  );
  mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'regions', source: 'db' });
  mocked.getMonsterCatalog.mockResolvedValue([
    { id: 'goblin', definition: { name: 'Goblin', cr: 0.25 } }, // Tier 1
    { id: 'wolf', definition: { name: 'Wolf', cr: 0.25 } }, // Tier 1
    { id: 'troll', definition: { name: 'Troll', cr: 7 } }, // Tier 2
  ]);
  mocked.getItemCatalog.mockResolvedValue([
    { id: 'dagger', name: 'Dagger' },
    { id: 'rope', name: 'Rope (50 ft)' },
  ]);
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

  it('zone tool paints cells, reassigns on overlap, and saves tier/chance/table', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'ENC. ZONES' }));
    // Create the first zone (auto-selected, defaults Tier 1) and paint (0,0).
    fireEvent.click(screen.getByRole('button', { name: '+ NEW ZONE' }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-0'));
    expect(screen.getByTestId('cell-0-0').getAttribute('data-zone')).toBe('zone-1');
    // The picker is filtered to the zone's tier — a Tier-1 zone offers the CR≤4
    // creatures (Goblin, Wolf) but NOT the CR-7 Troll.
    const picker = screen.getByLabelText('Add zone creature') as HTMLSelectElement;
    const options = Array.from(picker.options)
      .map((o) => o.value)
      .filter(Boolean);
    expect(options).toContain('Wolf');
    expect(options).not.toContain('Troll');
    fireEvent.change(picker, { target: { value: 'Wolf' } });
    // Create a SECOND zone and repaint the SAME cell — non-overlap reassigns it.
    fireEvent.click(screen.getByRole('button', { name: '+ NEW ZONE' }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-0'));
    expect(screen.getByTestId('cell-0-0').getAttribute('data-zone')).toBe('zone-2');

    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const [, , value] = mocked.putCampaignSection.mock.calls[0];
    const saved = (value as Array<Record<string, unknown>>)[0];
    const zones = saved.encounterZones as Array<{
      id: string;
      tier: number;
      encounterChance: number;
      encounterTable?: string[];
    }>;
    expect(zones.map((z) => z.id)).toEqual(['zone-1', 'zone-2']);
    expect(zones[0]).toMatchObject({ tier: 1, encounterChance: 0.1, encounterTable: ['Wolf'] });
    // The painted cell carries the (reassigned) zone id; no cell holds two zones.
    const grid = saved.grid as Array<Array<{ ez?: string }>>;
    expect(grid[0][0].ez).toBe('zone-2');
  });

  it('preserves a zone’s arenaRooms (no editor UI yet) through a save round-trip', async () => {
    // A region whose zone already carries arenaRooms (set via the API). The
    // editor can't edit it yet, but a save must not silently drop it.
    const withArena = {
      ...REGION,
      grid: [
        [{ t: 'plains', ez: 'zone-1' }, { t: 'plains' }, { t: 'road' }],
        [{ t: 'plains' }, { t: 'forest' }, { t: 'road' }],
      ],
      encounterZones: [
        {
          id: 'zone-1',
          name: 'Deep Wood',
          tier: 1,
          encounterChance: 0.1,
          encounterTable: ['Wolf'],
          arenaRooms: { forest: ['forest_clearing'] },
        },
      ],
    };
    mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
      section === 'regions'
        ? { section, source: 'db', value: [withArena, OTHER] }
        : { section, source: 'db', value: [] }
    );
    renderEditor();
    await screen.findByTestId('cell-0-0');
    // A trivial edit to enable SAVE, without touching the zone.
    fireEvent.change(screen.getByLabelText('NAME'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    const zones = saved[0].encounterZones as Array<{ arenaRooms?: Record<string, string[]> }>;
    expect(zones[0].arenaRooms).toEqual({ forest: ['forest_clearing'] });
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
    // SIZE is its own tool — the width/height inputs show when it's selected.
    expect(screen.queryByLabelText('Grid width')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'SIZE' }));
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

  it('details form edits name/desc/scale and saves them with the map', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    // Pre-filled from the loaded region.
    expect((screen.getByLabelText('NAME') as HTMLInputElement).value).toBe('The Proving Grounds');
    expect((screen.getByLabelText('FEET PER SQUARE') as HTMLInputElement).value).toBe('5280');

    fireEvent.change(screen.getByLabelText('NAME'), { target: { value: 'The Crucible' } });
    fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: 'Iron and ash.' } });
    expect(screen.getByText(/UNSAVED/)).toBeTruthy();

    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const list = mocked.putCampaignSection.mock.calls[0][2] as (typeof REGION)[];
    expect(list[0].name).toBe('The Crucible');
    expect((list[0] as { desc?: string }).desc).toBe('Iron and ash.');
    // Untouched fields survive the merge.
    expect(list[0].isStartingRegion).toBe(true);
    expect(list[0].sites).toEqual(REGION.sites);
  });

  it('the four narration hooks round-trip as variant pools', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    // Each hook is a variant pool — add a variant, then fill it. ON ENTER gets
    // two variants to prove the ordered-array round-trip.
    for (const label of ['ON ENTER', 'ON FIRST ENTER', 'ON EXIT', 'ON FIRST EXIT']) {
      fireEvent.click(screen.getByLabelText(`Add ${label} variant`));
    }
    fireEvent.click(screen.getByLabelText('Add ON ENTER variant')); // a 2nd ON ENTER variant
    fireEvent.change(screen.getByLabelText('ON ENTER variant 1'), {
      target: { value: 'The mists part as you crest the ridge.' },
    });
    fireEvent.change(screen.getByLabelText('ON ENTER variant 2'), {
      target: { value: 'A second way the vale greets you.' },
    });
    fireEvent.change(screen.getByLabelText('ON FIRST ENTER variant 1'), {
      target: { value: 'For the first time, the vale opens.' },
    });
    fireEvent.change(screen.getByLabelText('ON EXIT variant 1'), {
      target: { value: 'The mists close.' },
    });
    fireEvent.change(screen.getByLabelText('ON FIRST EXIT variant 1'), {
      target: { value: 'You will not forget the vale.' },
    });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(saved[0].onEnter).toEqual([
      'The mists part as you crest the ridge.',
      'A second way the vale greets you.',
    ]);
    expect(saved[0].onFirstEnter).toEqual(['For the first time, the vale opens.']);
    expect(saved[0].onExit).toEqual(['The mists close.']);
    expect(saved[0].onFirstExit).toEqual(['You will not forget the vale.']);
  });

  it('clearing an optional detail removes the key instead of writing empty', async () => {
    mocked.getCampaignSection.mockResolvedValue({
      section: 'regions',
      source: 'db',
      value: [{ ...REGION, desc: 'old', onEnter: 'old hook' }, OTHER],
    });
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: '' } });
    // The loaded onEnter ('old hook') shows as one variant — blank it to clear.
    fireEvent.change(screen.getByLabelText('ON ENTER variant 1'), { target: { value: '' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect('desc' in saved[0]).toBe(false);
    expect('onEnter' in saved[0]).toBe(false);
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
    fireEvent.click(screen.getByLabelText('Add ON ENTER NARRATION variant'));
    fireEvent.change(screen.getByLabelText('ON ENTER NARRATION variant 1'), {
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
    expect(added.onEnter).toEqual(['Smoke curls from the chimneys.']);
    expect(added.pos).toEqual({ x: 1, y: 0 });
    // Flipping to town pruned the local target; empty optionals pruned too.
    expect('entryRoomId' in added).toBe(false);
    expect('icon' in added).toBe(false);
  });

  it('REGION GATE sites: kind option, TO REGION picker, save folds regionId', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-0')); // place a new site
    fireEvent.change(screen.getByLabelText('KIND'), { target: { value: 'region' } });
    fireEvent.change(screen.getByLabelText('NAME', { selector: '#site-name' }), {
      target: { value: 'The North Pass' },
    });
    // No target picked yet — the save is blocked client-side.
    fireEvent.click(screen.getByText('SAVE'));
    expect(await screen.findByText(/region gate needs a TO REGION target/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
    // The picker offers the OTHER regions only (by name, not the edited one).
    const toRegion = screen.getByLabelText('TO REGION') as HTMLSelectElement;
    expect([...toRegion.options].map((o) => o.textContent)).toEqual([
      '— PICK A REGION —',
      'The Frost Reach',
    ]);
    fireEvent.change(toRegion, { target: { value: 'frost-reach' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
      id: string;
      sites?: Array<Record<string, unknown>>;
    }>;
    const gate = saved[0].sites!.find((s) => s.name === 'The North Pass')!;
    expect(gate.kind).toBe('region');
    expect(gate.regionId).toBe('frost-reach');
    expect('townId' in gate).toBe(false);
    expect('entryRoomId' in gate).toBe(false);
  });

  it('the marker tool lists every existing marker; clicking one selects it', async () => {
    renderEditor();
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    // The Pit exists on the map — it's listed, not hidden behind a cell click.
    const chip = screen.getByRole('button', { name: /◆ The Pit · LOCAL \(2,1\)/ });
    fireEvent.click(chip);
    expect(
      (screen.getByLabelText('NAME', { selector: '#site-name' }) as HTMLInputElement).value
    ).toBe('The Pit');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
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
    // Its entry room ('pit') isn't in the DB room pool — preserved as an
    // unlisted option instead of being silently dropped.
    const entryRoom = screen.getByLabelText('ENTRY ROOM') as HTMLSelectElement;
    expect(entryRoom.value).toBe('pit');
    expect([...entryRoom.options].map((o) => o.textContent)).toContain('pit (unlisted)');
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

  it('VENUES tool in town mode: interiors pick an entry room from the hosted ROOMS panel', async () => {
    mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
      section === 'towns'
        ? {
            section,
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
          }
        : {
            section,
            source: 'db',
            value: [
              {
                id: 'acorn-taproom',
                name: 'The Taproom',
                desc: 'd',
                grid: [[{}]],
                entryPos: { x: 0, y: 0 },
              },
            ],
          }
    );
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'towns', source: 'db' });
    render(
      <RegionEditorScreen campaignId="sandbox" regionId="oakvale" kind="town" onBack={vi.fn()} />
    );
    await screen.findByTestId('cell-0-0');
    // The town page hosts the ROOMS panel — its rooms feed the venue picker.
    expect(await screen.findByText('ROOMS')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'VENUES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-1'));
    fireEvent.change(screen.getByLabelText('NAME', { selector: '#site-name' }), {
      target: { value: 'The Split Acorn' },
    });
    // An interior with no room picked is blocked client-side.
    fireEvent.click(screen.getByText('SAVE'));
    expect(await screen.findByText(/interior venue needs an ENTRY ROOM/)).toBeTruthy();
    expect(mocked.putCampaignSection).not.toHaveBeenCalled();
    const picker = screen.getByLabelText('ENTRY ROOM') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.value)).toEqual(['', 'acorn-taproom']);
    fireEvent.change(picker, { target: { value: 'acorn-taproom' } });
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

  it('the region page hosts the TOWNS panel; a created town is a pickable site target immediately', async () => {
    const onOpenMap = vi.fn();
    render(
      <RegionEditorScreen
        campaignId="sandbox"
        regionId="proving-grounds"
        onBack={vi.fn()}
        onOpenMap={onOpenMap}
      />
    );
    await screen.findByTestId('cell-0-0');
    // The hosted panel lists the campaign's towns; cards open the town painter.
    expect(await screen.findByText('TOWNS')).toBeTruthy();
    fireEvent.click(screen.getByTestId('town-card-oakvale'));
    expect(onOpenMap).toHaveBeenCalledWith('town', 'oakvale');
    // Create a town through the panel...
    mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'towns', source: 'db' });
    fireEvent.click(screen.getByTestId('new-town-btn'));
    fireEvent.change(screen.getByLabelText('TOWN NAME'), { target: { value: 'Milldale' } });
    fireEvent.click(screen.getByTestId('create-town-btn'));
    await waitFor(() => expect(onOpenMap).toHaveBeenCalledWith('town', 'milldale'));
    // ...and the site tool's TOWN picker knows it without a page reload.
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
    fireEvent.change(screen.getByLabelText('KIND'), { target: { value: 'town' } });
    const picker = screen.getByLabelText('TOWN') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.value)).toEqual(['', 'oakvale', 'milldale']);
  });

  it('navigating to a town from a dirty region painter asks before discarding', async () => {
    const onOpenMap = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <RegionEditorScreen
        campaignId="sandbox"
        regionId="proving-grounds"
        onBack={vi.fn()}
        onOpenMap={onOpenMap}
      />
    );
    await screen.findByTestId('cell-0-0');
    fireEvent.click(screen.getByRole('button', { name: /WATER/ }));
    fireEvent.mouseDown(screen.getByTestId('cell-0-1')); // dirty now
    fireEvent.click(await screen.findByTestId('town-card-oakvale'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onOpenMap).not.toHaveBeenCalled(); // declined — stay put
    confirmSpy.mockRestore();
  });

  describe('room mode', () => {
    const TAPROOM = {
      id: 'taproom',
      name: 'The Taproom',
      desc: 'Lamplight and cider.',
      grid: [
        [{}, {}, {}],
        [{}, { t: 'water', m: 'swim' }, {}],
        [{}, {}, {}],
      ],
      entryPos: { x: 0, y: 0 },
      exits: [{ pos: { x: 2, y: 2 }, ascends: true, label: 'Door' }],
      lighting: 'dim',
      floor: 'cobblestone',
      canRest: true,
    };
    const CELLAR = {
      id: 'cellar',
      name: 'The Cellar',
      desc: 'Cold stone.',
      grid: [
        [{}, {}],
        [{}, {}],
      ],
      entryPos: { x: 0, y: 0 },
    };

    function renderRoom(roomId = 'taproom') {
      // The room painter loads its section AND the campaign customs (for
      // the enemy picker) — dispatch by section.
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? { section, source: 'db', value: [TAPROOM, CELLAR] }
          : section === 'customMonsters'
            ? { section, source: 'db', value: [{ name: 'Pit Horror' }] }
            : { section, source: 'db', value: [{ id: 'hexed-coin', name: 'Hexed Coin' }] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      return render(
        <RegionEditorScreen campaignId="sandbox" regionId={roomId} kind="room" onBack={vi.fn()} />
      );
    }

    it('loads the room: bare floors, mech letters, entry marker, exit marker', async () => {
      renderRoom();
      expect(await screen.findByText(/ROOM MAP — THE TAPROOM/)).toBeTruthy();
      expect(screen.getByText(/3×3 · 1 SQUARE = 5 FT/)).toBeTruthy(); // default scale
      expect(screen.getByTestId('cell-0-0').getAttribute('aria-label')).toContain('floor');
      expect(screen.getByTestId('cell-0-0').getAttribute('aria-label')).toContain('(start)');
      expect(screen.getByTestId('cell-1-1').getAttribute('aria-label')).toContain('water [swim]');
      expect(screen.getByTestId('cell-2-2').getAttribute('aria-label')).toContain('site: Door');
    });

    it('room ON ENTER is a variant pool: loads one textarea per variant, saves an array', async () => {
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [{ ...TAPROOM, onEnter: ['First glimpse.', 'Second glimpse.'] }, CELLAR],
            }
          : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="taproom" kind="room" onBack={vi.fn()} />
      );
      // The pool loads one textarea per variant, in order.
      const v1 = (await screen.findByLabelText('ON ENTER variant 1')) as HTMLTextAreaElement;
      const v2 = screen.getByLabelText('ON ENTER variant 2') as HTMLTextAreaElement;
      expect(v1.value).toBe('First glimpse.');
      expect(v2.value).toBe('Second glimpse.');
      // Remove the 2nd, add a fresh 3rd, and a multi-paragraph variant survives.
      fireEvent.click(screen.getByLabelText('Remove ON ENTER variant 2'));
      fireEvent.change(screen.getByLabelText('ON ENTER variant 1'), {
        target: { value: 'A scene.\n\nWith two paragraphs.' },
      });
      fireEvent.click(screen.getByLabelText('Add ON ENTER variant'));
      fireEvent.change(screen.getByLabelText('ON ENTER variant 2'), {
        target: { value: 'Another variant.' },
      });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        onEnter?: unknown;
      }>;
      expect(saved.find((r) => r.id === 'taproom')!.onEnter).toEqual([
        'A scene.\n\nWith two paragraphs.',
        'Another variant.',
      ]);
    });

    it('MECHANICS brush paints one flag per cell and clears it', async () => {
      renderRoom();
      await screen.findByTestId('cell-0-0');
      fireEvent.click(screen.getByRole('button', { name: 'MECHANICS' }));
      fireEvent.click(screen.getByRole('button', { name: /OBSTACLE/ }));
      fireEvent.mouseDown(screen.getByTestId('cell-2-0'));
      expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).toContain('[obstacle]');
      // Repainting with another flag replaces it; CLEAR removes it.
      fireEvent.click(screen.getByRole('button', { name: /COVER/ }));
      fireEvent.mouseDown(screen.getByTestId('cell-2-0'));
      expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).toContain('[cover]');
      fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }));
      fireEvent.mouseDown(screen.getByTestId('cell-2-0'));
      expect(screen.getByTestId('cell-2-0').getAttribute('aria-label')).not.toContain('[');
    });

    it('the NONE (FLOOR) brush erases cosmetic paint', async () => {
      renderRoom();
      await screen.findByTestId('cell-0-0');
      fireEvent.click(screen.getByRole('button', { name: 'NONE (FLOOR)' }));
      fireEvent.mouseDown(screen.getByTestId('cell-1-1')); // painted water
      const label = screen.getByTestId('cell-1-1').getAttribute('aria-label')!;
      expect(label).toContain('floor');
      expect(label).toContain('[swim]'); // the mech flag survives the paint erase
    });

    it('EXITS tool: a room exit needs a target; saved exits map back to the exit shape', async () => {
      renderRoom();
      await screen.findByTestId('cell-0-0');
      fireEvent.click(screen.getByRole('button', { name: 'EXITS' }));
      fireEvent.mouseDown(screen.getByTestId('cell-0-2')); // place → defaults to ascend
      fireEvent.change(screen.getByLabelText('KIND'), { target: { value: 'room' } });
      fireEvent.change(screen.getByLabelText('LABEL'), { target: { value: 'Stairs down' } });
      // No TO ROOM picked yet — save is blocked client-side.
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/needs a TO ROOM target/)).toBeTruthy();
      expect(mocked.putCampaignSection).not.toHaveBeenCalled();
      // The picker offers the OTHER rooms only (not the edited room itself).
      const toRoom = screen.getByLabelText('TO ROOM') as HTMLSelectElement;
      expect([...toRoom.options].map((o) => o.value)).toEqual(['', 'cellar']);
      fireEvent.change(toRoom, { target: { value: 'cellar' } });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const list = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        exits?: Array<Record<string, unknown>>;
      }>;
      expect(list[0].exits).toEqual([
        { pos: { x: 2, y: 2 }, ascends: true, label: 'Door' },
        { pos: { x: 0, y: 2 }, toRoomId: 'cellar', label: 'Stairs down' },
      ]);
    });

    it('ENEMIES card: placements from customs + catalog, count folding, picker guard', async () => {
      renderRoom('cellar'); // no placements yet
      await screen.findByTestId('cell-0-0');
      expect(await screen.findByText(/No enemies here/)).toBeTruthy();
      fireEvent.click(screen.getByTestId('add-enemy-btn'));
      // The picker offers the campaign custom first, then the catalog.
      const picker = screen.getByLabelText('Enemy 1') as HTMLSelectElement;
      expect([...picker.options].map((o) => o.value)).toEqual([
        '',
        'Pit Horror',
        'Goblin',
        'Wolf',
        'Troll',
      ]);
      // The new row defaults to the first bestiary name.
      expect(picker.value).toBe('Pit Horror');
      fireEvent.change(picker, { target: { value: 'Goblin' } });
      fireEvent.change(screen.getByLabelText('Enemy 1 count'), { target: { value: '3' } });
      fireEvent.click(screen.getByTestId('add-enemy-btn'));
      fireEvent.change(screen.getByLabelText('Enemy 2'), { target: { value: 'Wolf' } });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        enemies?: Array<Record<string, unknown>>;
      }>;
      // count 1 stays implicit; count > 1 is recorded.
      expect(saved.find((r) => r.id === 'cellar')!.enemies).toEqual([
        { name: 'Goblin', count: 3 },
        { name: 'Wolf' },
      ]);
    });

    it('LOOT card: pick an item, PLACE arms a grid click, save folds {itemId, pos}', async () => {
      renderRoom('cellar');
      await screen.findByTestId('cell-0-0');
      expect(await screen.findByText(/Nothing to find here/)).toBeTruthy();
      fireEvent.click(screen.getByTestId('add-loot-btn'));
      // Customs first, then the catalog; the new row defaults to the first.
      const picker = screen.getByLabelText('Loot 1') as HTMLSelectElement;
      expect([...picker.options].map((o) => o.value)).toEqual(['', 'hexed-coin', 'dagger', 'rope']);
      expect(picker.value).toBe('hexed-coin');
      fireEvent.change(picker, { target: { value: 'dagger' } });
      expect(screen.getByText('UNPLACED')).toBeTruthy();
      // Arm PLACE → the next grid click drops the token there.
      fireEvent.click(screen.getByTestId('place-loot-0'));
      expect(screen.getByText(/CLICK A GRID CELL TO PLACE/)).toBeTruthy();
      fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
      expect(screen.getByText('AT (1,0)')).toBeTruthy();
      expect(screen.getByTestId('cell-1-0').getAttribute('aria-label')).toContain('loot: Dagger');
      // A second, unplaced item rides along without a pos.
      fireEvent.click(screen.getByTestId('add-loot-btn'));
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        loot?: Array<Record<string, unknown>>;
      }>;
      expect(saved.find((r) => r.id === 'cellar')!.loot).toEqual([
        { itemId: 'dagger', pos: { x: 1, y: 0 } },
        { itemId: 'hexed-coin' },
      ]);
    });

    it('NPCS card: name/attitude/greeting/place flow; JSON extras preserved on save', async () => {
      // The cellar starts with one JSON-authored NPC carrying extras the
      // card does not edit (dialogue + shop) — they must survive a save.
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [
                TAPROOM,
                {
                  ...CELLAR,
                  npcs: [
                    {
                      id: 'old-hob',
                      name: 'Old Hob',
                      attitude: 'friendly',
                      greeting: 'Evening.',
                      responses: [{ label: 'Ask', reply: 'No.' }],
                      shop: [{ itemId: 'rope', price: 1 }],
                    },
                  ],
                },
              ],
            }
          : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="cellar" kind="room" onBack={vi.fn()} />
      );
      await screen.findByTestId('cell-0-0');
      // Pre-filled row from the room.
      expect(
        (screen.getByLabelText('NAME', { selector: '#npc-name-0' }) as HTMLInputElement).value
      ).toBe('Old Hob');
      // Greeting/goodbye are variant pools. The loaded greeting shows as one
      // variant — edit it; add variants for two more; leave FIRST GOODBYE empty.
      const addFill = (label: string, value: string) => {
        fireEvent.click(screen.getByLabelText(`Add ${label} variant`));
        fireEvent.change(screen.getByLabelText(`${label} variant 1`), { target: { value } });
      };
      fireEvent.change(screen.getByLabelText('NPC 1 GREETING variant 1'), {
        target: { value: 'Mind the step.' },
      });
      addFill('NPC 1 FIRST GREETING', 'New faces! Welcome.');
      addFill('NPC 1 GOODBYE', 'Walk safe.');
      fireEvent.click(screen.getByTestId('place-npc-0'));
      fireEvent.mouseDown(screen.getByTestId('cell-1-1'));
      expect(screen.getByText('AT (1,1)')).toBeTruthy();
      expect(screen.getByTestId('cell-1-1').getAttribute('aria-label')).toContain('npc: Old Hob');
      // Add a second NPC — blank name blocks the save.
      fireEvent.click(screen.getByTestId('add-npc-btn'));
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/NPC needs a name and a greeting/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('NAME', { selector: '#npc-name-1' }), {
        target: { value: 'Mute Meg' },
      });
      addFill('NPC 2 GREETING', '…');
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        npcs?: Array<Record<string, unknown>>;
      }>;
      const npcs = saved.find((r) => r.id === 'cellar')!.npcs!;
      expect(npcs[0]).toEqual({
        id: 'old-hob',
        name: 'Old Hob',
        attitude: 'friendly',
        // Hooks save as variant pools; the empty FIRST GOODBYE is pruned.
        greeting: ['Mind the step.'],
        firstGreeting: ['New faces! Welcome.'],
        goodbye: ['Walk safe.'],
        pos: { x: 1, y: 1 },
        // JSON-authored extras preserved untouched.
        responses: [{ label: 'Ask', reply: 'No.' }],
        shop: [{ itemId: 'rope', price: 1 }],
      });
      expect(npcs[1]).toEqual({
        id: 'npc-2',
        name: 'Mute Meg',
        attitude: 'indifferent',
        greeting: ['…'],
      });
    });

    it('DIALOGUE editor: a gated, quest-starting option folds into the saved NPC', async () => {
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [
                TAPROOM,
                {
                  ...CELLAR,
                  npcs: [
                    { id: 'old-hob', name: 'Old Hob', attitude: 'friendly', greeting: 'Evening.' },
                  ],
                },
              ],
            }
          : section === 'quests'
            ? { section, source: 'db', value: [{ id: 'rat-problem', title: 'The Rat Problem' }] }
            : section === 'factions'
              ? { section, source: 'db', value: [] }
              : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="cellar" kind="room" onBack={vi.fn()} />
      );
      await screen.findByTestId('cell-0-0');
      // Open the tree, add an option — a blank PLAYER LINE blocks the save.
      fireEvent.click(screen.getByTestId('npc-dialogue-0'));
      expect(await screen.findByText(/No dialogue yet/)).toBeTruthy();
      fireEvent.click(screen.getByTestId('add-dialogue-option'));
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/needs a PLAYER LINE/)).toBeTruthy();
      expect(mocked.putCampaignSection).not.toHaveBeenCalled();
      // Fill the node: line + reply, a flag condition, a START QUEST effect.
      fireEvent.change(screen.getByLabelText('PLAYER LINE'), {
        target: { value: 'Need a hand with anything?' },
      });
      fireEvent.change(screen.getByLabelText('NPC REPLY'), {
        target: { value: 'Rats. Cellar. Coin on completion.' },
      });
      fireEvent.change(screen.getByLabelText('Add option 1 condition'), {
        target: { value: 'flag' },
      });
      fireEvent.change(screen.getByLabelText('option 1 condition 1 flag key'), {
        target: { value: 'met_hob' },
      });
      fireEvent.change(screen.getByLabelText('Add option 1 effect'), {
        target: { value: 'start_quest' },
      });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        npcs?: Array<Record<string, unknown>>;
      }>;
      expect(saved.find((r) => r.id === 'cellar')!.npcs![0].responses).toEqual([
        {
          label: 'Need a hand with anything?',
          reply: 'Rats. Cellar. Coin on completion.',
          condition: { fact: 'flags', path: '$.met_hob', operator: 'equal', value: true },
          consequences: [{ type: 'start_quest', questId: 'rat-problem' }],
        },
      ]);
    });

    it('SHOP rows: add ware + price + faction tie; save folds shop and factionId', async () => {
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [
                TAPROOM,
                {
                  ...CELLAR,
                  npcs: [
                    { id: 'old-hob', name: 'Old Hob', attitude: 'friendly', greeting: 'Evening.' },
                  ],
                },
              ],
            }
          : section === 'factions'
            ? { section, source: 'db', value: [{ id: 'millers', name: "The Millers' Guild" }] }
            : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="cellar" kind="room" onBack={vi.fn()} />
      );
      await screen.findByTestId('cell-0-0');
      expect(screen.getByText(/SHOP — none/)).toBeTruthy();
      fireEvent.click(screen.getByTestId('npc-add-ware-0'));
      // Defaults to the first catalog item; flip to rope, set a price.
      fireEvent.change(screen.getByLabelText('NPC 1 ware 1 item'), { target: { value: 'rope' } });
      fireEvent.change(screen.getByLabelText('NPC 1 ware 1 price'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('NPC 1 ware 1 qty'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('VENDOR GOLD / DAY'), { target: { value: '40' } });
      // The faction tie lights the tier pricing.
      fireEvent.change(screen.getByLabelText('FACTION (TIER PRICING)'), {
        target: { value: 'millers' },
      });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        npcs?: Array<Record<string, unknown>>;
      }>;
      const hob = saved.find((r) => r.id === 'cellar')!.npcs![0];
      expect(hob.shop).toEqual([{ itemId: 'rope', price: 3, qty: 5 }]);
      expect(hob.shopGold).toBe(40);
      expect(hob.factionId).toBe('millers');
    });

    it('OBJECTS card: name guard, loot chips, PLACE flow, optional-field pruning', async () => {
      renderRoom('cellar');
      await screen.findByTestId('cell-0-0');
      expect(await screen.findByText(/Nothing to poke at/)).toBeTruthy();
      fireEvent.click(screen.getByTestId('add-object-btn'));
      // A nameless object blocks the save client-side.
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/object needs a name/)).toBeTruthy();
      expect(mocked.putCampaignSection).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('NAME', { selector: '#obj-name-0' }), {
        target: { value: 'Mead Barrel' },
      });
      // Each narrative hook is a variant pool — add a variant, then fill it.
      const setObjHook = (label: string, value: string) => {
        fireEvent.click(screen.getByLabelText(`Add ${label} variant`));
        fireEvent.change(screen.getByLabelText(`${label} variant 1`), { target: { value } });
      };
      setObjHook('OBJECT 1 INTERACT TEXT', 'It sloshes.');
      setObjHook('OBJECT 1 DESCRIPTION', 'A fat oak barrel, hooped in iron.');
      setObjHook('OBJECT 1 FOUND TEXT (search hit)', 'A false bottom hides a coin purse.');
      setObjHook('OBJECT 1 EMPTY TEXT (search miss)', 'Just stale mead.');
      fireEvent.change(screen.getByLabelText('SEARCH DC'), { target: { value: '14' } });
      // The loot select carries customs + catalog; picking adds a chip.
      const lootSel = screen.getByLabelText('Add loot to object 1') as HTMLSelectElement;
      expect([...lootSel.options].map((o) => o.value)).toEqual([
        '',
        'hexed-coin',
        'dagger',
        'rope',
      ]);
      fireEvent.change(lootSel, { target: { value: 'dagger' } });
      expect(screen.getByText(/Dagger ✕/)).toBeTruthy();
      // Arm PLACE → the next grid click drops the ▣ token there.
      fireEvent.click(screen.getByTestId('place-object-0'));
      expect(screen.getByText(/CLICK A GRID CELL TO PLACE/)).toBeTruthy();
      fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
      expect(screen.getByText('AT (1,0)')).toBeTruthy();
      expect(screen.getByTestId('cell-1-0').getAttribute('aria-label')).toContain(
        'object: Mead Barrel'
      );
      // A second object with only a name saves without the optional keys.
      fireEvent.click(screen.getByTestId('add-object-btn'));
      fireEvent.change(screen.getByLabelText('NAME', { selector: '#obj-name-1' }), {
        target: { value: 'Cracked Shrine' },
      });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        objects?: Array<Record<string, unknown>>;
      }>;
      expect(saved.find((r) => r.id === 'cellar')!.objects).toEqual([
        {
          id: 'obj-1',
          name: 'Mead Barrel',
          // Hooks save as variant pools (1-element arrays here).
          interactText: ['It sloshes.'],
          desc: ['A fat oak barrel, hooped in iron.'],
          foundText: ['A false bottom hides a coin purse.'],
          emptyText: ['Just stale mead.'],
          searchDC: 14,
          lootIds: ['dagger'],
          pos: { x: 1, y: 0 },
        },
        // Object 2 carries only a name — empty hook pools are pruned, not sent.
        { id: 'obj-2', name: 'Cracked Shrine' },
      ]);
    });

    it('TRAP card: defaults, name guard, save folds the trap; REMOVE drops the key', async () => {
      renderRoom('cellar');
      await screen.findByTestId('cell-0-0');
      expect(await screen.findByText(/No trap\./)).toBeTruthy();
      fireEvent.click(screen.getByTestId('toggle-trap-btn')); // + ADD TRAP
      // Sensible draft defaults appear pre-filled.
      expect((screen.getByLabelText('DC') as HTMLInputElement).value).toBe('12');
      expect((screen.getByLabelText('DAMAGE') as HTMLInputElement).value).toBe('1d6');
      expect((screen.getByLabelText('DAMAGE TYPE') as HTMLSelectElement).value).toBe('piercing');
      // A nameless trap blocks the save client-side.
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/trap needs a name/)).toBeTruthy();
      expect(mocked.putCampaignSection).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('NAME', { selector: '#trap-name' }), {
        target: { value: 'Loose Step' },
      });
      fireEvent.change(screen.getByLabelText('DAMAGE'), { target: { value: '1d4' } });
      fireEvent.change(screen.getByLabelText('DAMAGE TYPE'), {
        target: { value: 'bludgeoning' },
      });
      fireEvent.change(screen.getByLabelText('CONDITION'), { target: { value: 'prone' } });
      // Narrative hooks are variant pools — fill two (add variant + text), leave
      // DISARM SUCCESS/FAIL empty to prove empty pools are pruned.
      const setTrapHook = (label: string, value: string) => {
        fireEvent.click(screen.getByLabelText(`Add ${label} variant`));
        fireEvent.change(screen.getByLabelText(`${label} variant 1`), { target: { value } });
      };
      setTrapHook('DETECT TEXT', 'A floorboard sits a hair proud.');
      setTrapHook('TRIGGER TEXT ({name}, {dmg})', 'The step gives — {name} drops for {dmg}.');
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{
        id: string;
        trap?: Record<string, unknown>;
      }>;
      expect(saved.find((r) => r.id === 'cellar')!.trap).toEqual({
        name: 'Loose Step',
        dc: 12,
        damage: '1d4',
        damageType: 'bludgeoning',
        condition: 'prone',
        detectNarrative: ['A floorboard sits a hair proud.'],
        triggerNarrative: ['The step gives — {name} drops for {dmg}.'],
      });
      // REMOVE TRAP clears the draft; the next save drops the key.
      fireEvent.click(screen.getByTestId('toggle-trap-btn')); // REMOVE TRAP
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(2));
      const saved2 = mocked.putCampaignSection.mock.calls[1][2] as Array<{
        id: string;
        trap?: Record<string, unknown>;
      }>;
      expect('trap' in saved2.find((r) => r.id === 'cellar')!).toBe(false);
    });

    it('removing every placement drops the enemies key from the save', async () => {
      // The taproom fixture carries a placement — remove it and save.
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? {
              section,
              source: 'db',
              value: [{ ...TAPROOM, enemies: [{ name: 'Goblin', count: 2 }] }, CELLAR],
            }
          : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="taproom" kind="room" onBack={vi.fn()} />
      );
      await screen.findByTestId('cell-0-0');
      // Pre-filled from the room: Goblin ×2.
      expect((screen.getByLabelText('Enemy 1') as HTMLSelectElement).value).toBe('Goblin');
      expect((screen.getByLabelText('Enemy 1 count') as HTMLInputElement).value).toBe('2');
      fireEvent.click(screen.getByLabelText('Remove enemy 1'));
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
      expect('enemies' in saved[0]).toBe(false);
    });

    it('rooms are locked to 5 ft: no FPS field; a legacy scale key is stripped on save', async () => {
      // A legacy room that still carries feetPerSquare from before the lock.
      mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
        section === 'rooms'
          ? { section, source: 'db', value: [{ ...TAPROOM, feetPerSquare: 10 }, CELLAR] }
          : { section, source: 'db', value: [] }
      );
      mocked.putCampaignSection.mockResolvedValue({ ok: true, section: 'rooms', source: 'db' });
      render(
        <RegionEditorScreen campaignId="sandbox" regionId="taproom" kind="room" onBack={vi.fn()} />
      );
      await screen.findByTestId('cell-0-0');
      // The scale field isn't offered for rooms (regions/towns keep it).
      expect(screen.queryByLabelText('FEET PER SQUARE')).toBeNull();
      fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: 'd' } });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
      expect('feetPerSquare' in saved[0]).toBe(false);
    });

    it('lighting: absent key shows BRIGHT; picking BRIGHT saves as omitted key', async () => {
      renderRoom('cellar'); // CELLAR has no lighting key
      await screen.findByTestId('cell-0-0');
      const sel = screen.getByLabelText('LIGHTING') as HTMLSelectElement;
      // No "—" pseudo-option: the engine defaults absent to bright, so the
      // form just shows BRIGHT.
      expect([...sel.options].map((o) => o.value)).toEqual(['bright', 'dim', 'dark', 'sunlight']);
      expect(sel.value).toBe('bright');
      // Flip to DARK and back to BRIGHT: the save omits the default key.
      fireEvent.change(sel, { target: { value: 'dark' } });
      fireEvent.change(sel, { target: { value: 'bright' } });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
      expect('lighting' in saved.find((r) => r.id === 'cellar')!).toBe(false);
    });

    it('details: entry pos tool, lighting/floor/can-rest, desc required', async () => {
      renderRoom();
      await screen.findByTestId('cell-0-0');
      // Relocate the entry marker.
      fireEvent.click(screen.getByRole('button', { name: 'ENTRY POS' }));
      fireEvent.mouseDown(screen.getByTestId('cell-1-0'));
      // Room details: lighting select pre-filled, can-rest checked.
      expect((screen.getByLabelText('LIGHTING') as HTMLSelectElement).value).toBe('dim');
      expect((screen.getByLabelText('CAN REST HERE') as HTMLInputElement).checked).toBe(true);
      fireEvent.change(screen.getByLabelText('LIGHTING'), { target: { value: 'dark' } });
      fireEvent.click(screen.getByLabelText('CAN REST HERE'));
      // Blank description blocks the save.
      fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: '' } });
      fireEvent.click(screen.getByText('SAVE'));
      expect(await screen.findByText(/DESCRIPTION is required/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('DESCRIPTION'), { target: { value: 'New desc.' } });
      fireEvent.click(screen.getByText('SAVE'));
      await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
      const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<Record<string, unknown>>;
      expect(saved[0].entryPos).toEqual({ x: 1, y: 0 });
      expect(saved[0].lighting).toBe('dark');
      expect('canRest' in saved[0]).toBe(false); // unchecked → key dropped
      expect(saved[0].desc).toBe('New desc.');
      // Region-only fields never sneak into a room payload.
      expect('startPos' in saved[0]).toBe(false);
      expect('isStartingRegion' in saved[0]).toBe(false);
    });
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
    expect(screen.queryByLabelText(/ON ENTER NARRATION/)).toBeNull();
    expect(screen.queryByTestId('make-starter-btn')).toBeNull();
    fireEvent.change(screen.getByLabelText('FLOOR'), { target: { value: 'cobblestone' } });
    fireEvent.click(screen.getByText('SAVE'));
    await waitFor(() => expect(mocked.putCampaignSection).toHaveBeenCalledTimes(1));
    const saved = mocked.putCampaignSection.mock.calls[0][2] as Array<{ floor?: string }>;
    expect(saved[0].floor).toBe('cobblestone');
  });
});

describe('region page — the hosted ROOMS panel (dungeon interiors)', () => {
  it('renders the ROOMS panel and its rooms feed the local-site ENTRY ROOM picker', async () => {
    mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
      section === 'regions'
        ? { section, source: 'db', value: [REGION, OTHER] }
        : section === 'towns'
          ? { section, source: 'db', value: [{ id: 'oakvale', name: 'Oakvale' }] }
          : section === 'rooms'
            ? {
                section,
                source: 'db',
                value: [
                  {
                    id: 'pit',
                    name: 'The Pit',
                    desc: 'd',
                    grid: [[{ t: 'cobblestone' }]],
                    entryPos: { x: 0, y: 0 },
                  },
                ],
              }
            : { section, source: 'db', value: [] }
    );
    const onOpenMap = vi.fn();
    render(
      <RegionEditorScreen
        campaignId="camp"
        regionId="proving-grounds"
        kind="region"
        onBack={vi.fn()}
        onOpenMap={onOpenMap}
      />
    );
    // The hosted ROOMS panel is on the page (next to TOWNS) with a creator.
    expect(await screen.findByText('+ NEW ROOM')).toBeTruthy();
    // Its room card opens the room painter directly — no town hop.
    fireEvent.click(await screen.findByTestId('room-card-pit'));
    expect(onOpenMap).toHaveBeenCalledWith('room', 'pit');
    // And the rooms list feeds the local-site ENTRY ROOM picker: select
    // the existing local site ("The Pit" at cell 2,1) via the SITES tool.
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-2-1'));
    const entry = (await screen.findByLabelText('ENTRY ROOM')) as HTMLSelectElement;
    expect([...entry.options].map((o) => o.value)).toContain('pit');
  });
});

describe('region SITES card — icon dropdown + tile preview', () => {
  it('offers painted tiles, previews the pick, and preserves legacy glyph icons', async () => {
    render(
      <RegionEditorScreen
        campaignId="camp"
        regionId="proving-grounds"
        kind="region"
        onBack={vi.fn()}
      />
    );
    await screen.findByDisplayValue('The Proving Grounds');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-2-1')); // select The Pit
    const icon = (await screen.findByLabelText('ICON')) as HTMLSelectElement;
    // Default = the dungeon glyph, shown as a glyph preview (The Pit is a
    // LOCAL site; a town would preview the village painting instead).
    expect(icon.value).toBe('');
    expect(screen.queryByAltText('site tile preview')).toBeNull();
    expect(screen.getByLabelText('site glyph preview')).toBeTruthy();
    // The dropdown carries marker locations AND terrain tiles as tile: ids.
    const values = [...icon.options].map((o) => o.value);
    expect(values).toContain('tile:barrow');
    expect(values).toContain('tile:mine');
    expect(values).toContain('tile:forest');
    // Picking one shows the painted variant-1 preview.
    fireEvent.change(icon, { target: { value: 'tile:barrow' } });
    expect((screen.getByAltText('site tile preview') as HTMLImageElement).getAttribute('src')).toBe(
      '/art/markers/barrow_1.png'
    );
    // The on-enter narration is now a variant pool (add-variant control present).
    expect(screen.getByLabelText('Add ON ENTER NARRATION variant')).toBeTruthy();
  });

  it('a legacy game-icons glyph value survives as a (custom) option', async () => {
    mocked.getCampaignSection.mockImplementation(async (_cid: string, section: string) =>
      section === 'regions'
        ? {
            section,
            source: 'db',
            value: [
              {
                ...REGION,
                sites: [{ ...REGION.sites[0], icon: 'tombstone' }],
              },
              OTHER,
            ],
          }
        : { section, source: 'db', value: [] }
    );
    render(
      <RegionEditorScreen
        campaignId="camp"
        regionId="proving-grounds"
        kind="region"
        onBack={vi.fn()}
      />
    );
    await screen.findByDisplayValue('The Proving Grounds');
    fireEvent.click(screen.getByRole('button', { name: 'SITES' }));
    fireEvent.mouseDown(screen.getByTestId('cell-2-1'));
    const icon = (await screen.findByLabelText('ICON')) as HTMLSelectElement;
    expect(icon.value).toBe('tombstone'); // kept, not clobbered
    expect([...icon.options].some((o) => o.text.includes('(custom)'))).toBe(true);
    // The legacy glyph previews AS its glyph (no painting).
    expect(screen.queryByAltText('site tile preview')).toBeNull();
    const glyph = screen.getByLabelText('site glyph preview');
    expect(glyph.className).toContain('game-icon-tombstone');
  });
});
