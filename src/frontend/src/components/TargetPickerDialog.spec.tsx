import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import TargetPickerDialog from './TargetPickerDialog';

const CANDIDATES = [
  { id: 'a', name: 'Cleric', sub: 'Cleric · HP 11/11' },
  { id: 'b', name: 'Fighter', sub: 'Fighter · HP 12/12' },
  { id: 'c', name: 'Rogue', sub: 'Rogue · HP 10/10' },
];

function setup(max: number, onConfirm = vi.fn(), onCancel = vi.fn()) {
  const utils = render(
    <TargetPickerDialog
      title="Bless"
      prompt="Choose allies to affect"
      candidates={CANDIDATES}
      max={max}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
  return { ...utils, onConfirm, onCancel };
}

describe('TargetPickerDialog', () => {
  it('renders every candidate', () => {
    const { getByTestId } = setup(3);
    for (const c of CANDIDATES) expect(getByTestId(`target-picker-item-${c.id}`)).toBeTruthy();
  });

  it('defaults to all candidates (capped at max) and confirms them', () => {
    const { getByTestId, onConfirm } = setup(3);
    fireEvent.click(getByTestId('target-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('deselecting a target excludes it from the confirmed set', () => {
    const { getByTestId, onConfirm } = setup(3);
    fireEvent.click(getByTestId('target-picker-input-b')); // toggle Fighter off
    fireEvent.click(getByTestId('target-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['a', 'c']);
  });

  it('caps selection at max — extra candidates are disabled', () => {
    const { getByTestId, onConfirm } = setup(1);
    // Default picks the first candidate; the rest are disabled at the cap.
    expect((getByTestId('target-picker-input-b') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('target-picker-input-c') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(getByTestId('target-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['a']);
  });

  it('confirm is disabled when nothing is selected', () => {
    const { getByTestId, onConfirm } = setup(3);
    // Deselect all three.
    for (const c of CANDIDATES) fireEvent.click(getByTestId(`target-picker-input-${c.id}`));
    const confirm = getByTestId('target-picker-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
