import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
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
