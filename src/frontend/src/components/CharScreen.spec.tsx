import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import CharScreen from './CharScreen';
import type { FrontendContext } from '../types';
import { api } from '../lib/api';
import { mockCtx } from './test-fixtures';

// Single-block party builder: one setup block on screen at a time, switched by
// a vertical portrait nav whose "+" block adds members (dimming at max).

const ctx: FrontendContext = {
  ...mockCtx,
  hidden: false,
  classes: [{ id: 'Fighter', desc: 'A warrior.' }],
  classPrimaryStats: { Fighter: 'STR' },
  classSkills: { Fighter: [] },
  backgrounds: [
    {
      id: 'soldier',
      name: 'Soldier',
      desc: 'You served.',
      skillProficiencies: ['Athletics'],
      feature: 'Military Rank',
      featureDesc: 'Soldiers respect you.',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'listContexts').mockResolvedValue([]);
});

function renderScreen() {
  return render(
    <CharScreen onStart={vi.fn()} loading={false} availableContexts={[ctx]} user={null} />
  );
}

const navCount = (c: HTMLElement) => c.querySelectorAll('[data-testid^="nav-portrait-"]').length;
const blockCount = (c: HTMLElement) => c.querySelectorAll('input[id$="-name"]').length;

describe('CharScreen — single block + portrait nav', () => {
  it('shows exactly one setup block and one portrait for a fresh single-member party', () => {
    const { container, getByText } = renderScreen();
    expect(blockCount(container)).toBe(1);
    expect(navCount(container)).toBe(1);
    expect(getByText('PARTY LEADER')).toBeTruthy();
  });

  it('the + block adds a member and switches the visible block to it', () => {
    const { container, getByTestId, getByText } = renderScreen();
    fireEvent.click(getByTestId('add-member-btn'));
    expect(navCount(container)).toBe(2);
    expect(blockCount(container)).toBe(1); // still only one block on screen
    expect(getByText('HERO 2')).toBeTruthy(); // the new member is now active
  });

  it('clicking a portrait switches which member is being edited', () => {
    const { getByTestId, getByText } = renderScreen();
    fireEvent.click(getByTestId('add-member-btn')); // now editing HERO 2
    fireEvent.click(getByTestId('nav-portrait-0')); // back to the leader
    expect(getByText('PARTY LEADER')).toBeTruthy();
  });

  it('shows the sum of the current ability scores (standard array → 72)', () => {
    const { getByText, getByTestId } = renderScreen();
    fireEvent.click(getByText('ARRAY')); // 15/14/13/12/10/8 reordered → sum 72
    expect(getByTestId('ability-sum-0').textContent).toContain('72');
  });

  it('the + block dims and disables once the party is full', () => {
    const { container, getByTestId } = renderScreen();
    fireEvent.click(getByTestId('add-member-btn')); // 2
    fireEvent.click(getByTestId('add-member-btn')); // 3
    fireEvent.click(getByTestId('add-member-btn')); // 4 (max)
    expect(navCount(container)).toBe(4);
    const addBtn = getByTestId('add-member-btn') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    // A further click is a no-op.
    fireEvent.click(addBtn);
    expect(navCount(container)).toBe(4);
  });
});

// Cleric Divine Order (L1) is chosen at creation and required before start.
// (beContexts is empty here — listContexts is mocked [] — so the other
// beCtx-gated start validations are skipped, isolating the Divine Order gate.)
const clericCtx: FrontendContext = {
  ...ctx,
  classes: [
    { id: 'Fighter', desc: 'A warrior.' },
    { id: 'Cleric', desc: 'A holy warrior.' },
  ],
  classPrimaryStats: { Fighter: 'STR', Cleric: 'WIS' },
  classSkills: { Fighter: [], Cleric: [] },
};

function renderCleric(onStart = vi.fn()) {
  const utils = render(
    <CharScreen onStart={onStart} loading={false} availableContexts={[clericCtx]} user={null} />
  );
  // Name the leader and switch them to Cleric.
  const nameInput = utils.container.querySelector('input[id$="-name"]') as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Brother Cael' } });
  fireEvent.change(utils.container.querySelector('#char-0-class')!, {
    target: { value: 'Cleric' },
  });
  return { onStart, ...utils };
}

describe('CharScreen — Cleric Divine Order required at creation', () => {
  it('blocks BEGIN ADVENTURE until the Cleric chooses a Divine Order', async () => {
    const { getByTestId, findByText } = renderCleric();
    fireEvent.click(getByTestId('begin-adventure-btn'));
    expect(await findByText(/must choose a Divine Order/i)).toBeTruthy();
  });

  it('allows starting once a Divine Order is chosen', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    const { getByTestId, getByText } = renderCleric(onStart);
    fireEvent.click(getByText(/Protector — Martial weapons/));
    fireEvent.click(getByTestId('begin-adventure-btn'));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
  });
});
