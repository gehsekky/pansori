import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { GameChoice } from '../types';
import LevelingPanel from './LevelingPanel';
import React from 'react';

const roster: GameChoice[] = [
  {
    label: '✨ Level up Aria → level 2',
    action: { type: 'enter_leveling', characterId: 'a' },
    kind: 'leveling',
  },
  {
    label: '✨ Level up Bran → level 2',
    action: { type: 'enter_leveling', characterId: 'b' },
    kind: 'leveling',
  },
];

const cascade: GameChoice[] = [
  {
    label: 'Advance Wizard → level 4',
    action: { type: 'level_up_class', className: 'wizard' },
    kind: 'leveling',
  },
  {
    label: 'Advance Fighter → level 4',
    action: { type: 'level_up_class', className: 'fighter' },
    kind: 'leveling',
  },
  { label: '↩ Back to party', action: { type: 'exit_leveling' }, kind: 'leveling' },
];

describe('LevelingPanel', () => {
  it('roster mode lists a button per member and dispatches enter_leveling', () => {
    const onChoose = vi.fn();
    const { getByText, getAllByTestId } = render(
      <LevelingPanel mode="roster" choices={roster} onChoose={onChoose} />
    );
    expect(getByText(/Level up your party/i)).toBeTruthy();
    expect(getAllByTestId('leveling-choice')).toHaveLength(2);
    fireEvent.click(getByText('✨ Level up Bran → level 2'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'enter_leveling', characterId: 'b' } })
    );
  });

  it('cascade mode shows the member, the step label, the choices, and a Back control', () => {
    const { getByText, getByTestId, getAllByTestId } = render(
      <LevelingPanel mode="cascade" memberName="Wrenna" choices={cascade} onChoose={() => {}} />
    );
    expect(getByText(/Leveling up WRENNA/i)).toBeTruthy();
    expect(getByText(/Choose a class to advance/i)).toBeTruthy();
    // Two class picks (the Back control is separated out, not a leveling-choice).
    expect(getAllByTestId('leveling-choice')).toHaveLength(2);
    expect(getByTestId('leveling-back')).toBeTruthy();
  });

  it('dispatches the class pick and the Back control', () => {
    const onChoose = vi.fn();
    const { getByText, getByTestId } = render(
      <LevelingPanel mode="cascade" memberName="Wrenna" choices={cascade} onChoose={onChoose} />
    );
    fireEvent.click(getByText('Advance Fighter → level 4'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'level_up_class', className: 'fighter' } })
    );
    fireEvent.click(getByTestId('leveling-back'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'exit_leveling' } })
    );
  });

  // ── ★ Recommended tag + rationale (Plan 01 render; UI-SPEC accessibility) ──
  it('renders the visible word "Recommended" and the rationale when recommended is set', () => {
    const recommendedStep: GameChoice[] = [
      {
        label: 'Increase Intelligence',
        action: { type: 'apply_asi', stat: 'int' },
        kind: 'leveling',
        recommended: true,
        rationale: 'Your spellcasting ability — raises spell DC & attack.',
      },
      { label: '↩ Back to party', action: { type: 'exit_leveling' }, kind: 'leveling' },
    ];
    const { getByText } = render(
      <LevelingPanel
        mode="cascade"
        memberName="Wrenna"
        choices={recommendedStep}
        onChoose={() => {}}
      />
    );
    // The visible WORD, not the ★ glyph alone (UI-SPEC accessibility).
    expect(getByText(/Recommended/)).toBeTruthy();
    expect(getByText('Your spellcasting ability — raises spell DC & attack.')).toBeTruthy();
  });

  it('renders neither "Recommended" nor a rationale when recommended is unset', () => {
    const plainStep: GameChoice[] = [
      {
        label: 'Increase Strength',
        action: { type: 'apply_asi', stat: 'str' },
        kind: 'leveling',
      },
      { label: '↩ Back to party', action: { type: 'exit_leveling' }, kind: 'leveling' },
    ];
    const { queryByText } = render(
      <LevelingPanel mode="cascade" memberName="Wrenna" choices={plainStep} onChoose={() => {}} />
    );
    expect(queryByText(/Recommended/)).toBeNull();
    // No rationale sub-line for an un-flagged choice.
    expect(queryByText('Your spellcasting ability — raises spell DC & attack.')).toBeNull();
  });

  // ── learn_spell step (Plan 02 render) ──────────────────────────────────────
  it('renders the learn_spell step with leveling-choice buttons and the CHOOSE A SPELL TO LEARN label', () => {
    const onChoose = vi.fn();
    const spellStep: GameChoice[] = [
      {
        label: 'Fireball',
        action: { type: 'learn_spell', spellId: 'fireball' },
        kind: 'leveling',
        recommended: true,
        rationale: 'Reliable AoE at this tier.',
      },
      {
        label: 'Counterspell',
        action: { type: 'learn_spell', spellId: 'counterspell' },
        kind: 'leveling',
      },
      { label: '↩ Back to party', action: { type: 'exit_leveling' }, kind: 'leveling' },
    ];
    const { getByText, getAllByTestId } = render(
      <LevelingPanel mode="cascade" memberName="Wrenna" choices={spellStep} onChoose={onChoose} />
    );
    // The step label reads CHOOSE A SPELL TO LEARN.
    expect(getByText(/CHOOSE A SPELL TO LEARN/i)).toBeTruthy();
    // The picks render via the existing leveling-choice hooks, each carrying the
    // learn_spell action type (the FE selector anchor).
    const picks = getAllByTestId('leveling-choice');
    expect(picks).toHaveLength(2);
    expect(picks.every((b) => b.getAttribute('data-action-type') === 'learn_spell')).toBe(true);
    // The pick dispatches the learn_spell action.
    fireEvent.click(getByText('Counterspell'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'learn_spell', spellId: 'counterspell' } })
    );
  });
});
