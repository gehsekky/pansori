import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { BackendContextSummary } from '../lib/api';
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

  it('auto-fill produces a start-able party: the Cleric defaults to Protector', async () => {
    // Regression (CI smoke breakage): auto-fill seeded a Cleric without a
    // Divine Order, so BEGIN ADVENTURE was blocked by the required-order
    // gate. Auto-fill must default every required choice.
    const autoCtx: FrontendContext = {
      ...clericCtx,
      recommendedPartySize: 2,
      recommendedComposition: ['Fighter', 'Cleric'],
    };
    const onStart = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <CharScreen onStart={onStart} loading={false} availableContexts={[autoCtx]} user={null} />
    );
    fireEvent.click(getByTestId('auto-fill-party-btn'));
    fireEvent.click(getByTestId('begin-adventure-btn'));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    const characters = onStart.mock.calls[0][0] as Array<{
      character_class: string;
      divine_order?: string;
    }>;
    expect(characters.find((c) => c.character_class === 'Cleric')?.divine_order).toBe('protector');
  });
});

// Caster spell picker — a full caster chooses cantrips + level-1 spells at
// creation. Driven by the BackendContextSummary's casterSpellChoices (fetched
// via listContexts), so this test mocks that response.
const wizardCtx: FrontendContext = {
  ...ctx,
  classes: [
    { id: 'Fighter', desc: 'A warrior.' },
    { id: 'Wizard', desc: 'An arcane caster.' },
  ],
  classPrimaryStats: { Fighter: 'STR', Wizard: 'INT' },
  classSkills: { Fighter: [], Wizard: [] },
};

const wizardSummary = {
  id: wizardCtx.id,
  displayName: 'Test',
  classes: ['Fighter', 'Wizard'],
  classSkillChoices: {},
  classStartingEquipment: {},
  weaponMasteryChoices: {},
  fightingStyleChoices: {},
  expertiseChoices: {},
  backgrounds: [],
  featTable: {},
  casterSpellChoices: {
    Wizard: {
      spellList: 'arcane',
      cantripCount: 2,
      l1Count: 1,
      defaultCantrips: ['fire_bolt', 'mage_hand'],
      defaultL1: ['magic_missile'],
    },
  },
  spells: [
    { id: 'fire_bolt', name: 'Fire Bolt', level: 0, desc: '1d10', spellList: ['arcane'] },
    { id: 'mage_hand', name: 'Mage Hand', level: 0, desc: 'hand', spellList: ['arcane'] },
    { id: 'magic_missile', name: 'Magic Missile', level: 1, desc: 'darts', spellList: ['arcane'] },
    { id: 'sacred_flame', name: 'Sacred Flame', level: 0, desc: 'radiant', spellList: ['divine'] },
  ],
} as unknown as BackendContextSummary;

describe('CharScreen — caster spell picker', () => {
  it('surfaces the picker for a Wizard and opens it with the arcane list', async () => {
    vi.spyOn(api, 'listContexts').mockResolvedValue([wizardSummary]);
    const { container, findByTestId, getByTestId, queryByTestId } = render(
      <CharScreen onStart={vi.fn()} loading={false} availableContexts={[wizardCtx]} user={null} />
    );
    fireEvent.change(container.querySelector('input[id$="-name"]')!, { target: { value: 'Mage' } });
    fireEvent.change(container.querySelector('#char-0-class')!, { target: { value: 'Wizard' } });

    // The trigger appears once the async beContexts fetch resolves.
    fireEvent.click(await findByTestId('caster-spells-trigger-0'));
    expect(await findByTestId('spell-picker-dialog')).toBeTruthy();
    // Arcane cantrips + L1 shown; the divine cantrip is filtered out.
    expect(getByTestId('spell-picker-cantrip-fire_bolt')).toBeTruthy();
    expect(getByTestId('spell-picker-l1-magic_missile')).toBeTruthy();
    expect(queryByTestId('spell-picker-cantrip-sacred_flame')).toBeNull();
  });

  it('does not surface the picker for a non-caster (Fighter)', async () => {
    vi.spyOn(api, 'listContexts').mockResolvedValue([wizardSummary]);
    const { container, queryByTestId } = render(
      <CharScreen onStart={vi.fn()} loading={false} availableContexts={[wizardCtx]} user={null} />
    );
    fireEvent.change(container.querySelector('input[id$="-name"]')!, { target: { value: 'Bonk' } });
    // Default class is Fighter; wait for the fetch to settle, then assert absence.
    await waitFor(() => expect(api.listContexts).toHaveBeenCalled());
    expect(queryByTestId('caster-spells-trigger-0')).toBeNull();
  });
});
