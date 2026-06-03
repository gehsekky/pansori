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
});
