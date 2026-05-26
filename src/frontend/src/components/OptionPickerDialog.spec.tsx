import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import OptionPickerDialog from './OptionPickerDialog';
import React from 'react';

const OPTIONS = [
  { id: 'wolf', label: 'Wolf', sub: 'CR 0.25 · 11 HP' },
  { id: 'dire_wolf', label: 'Dire Wolf', sub: 'CR 1 · 37 HP' },
  { id: 'brown_bear', label: 'Brown Bear', sub: 'CR 1 · 34 HP' },
];

function setup(onConfirm = vi.fn(), onCancel = vi.fn()) {
  const utils = render(
    <OptionPickerDialog
      title="Polymorph — choose a beast form"
      options={OPTIONS}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
  return { ...utils, onConfirm, onCancel };
}

describe('OptionPickerDialog', () => {
  it('renders every option', () => {
    const { getByTestId } = setup();
    for (const o of OPTIONS) expect(getByTestId(`option-picker-item-${o.id}`)).toBeTruthy();
  });

  it('defaults to the first option and confirms it', () => {
    const { getByTestId, onConfirm } = setup();
    fireEvent.click(getByTestId('option-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('wolf');
  });

  it('selecting another option confirms that one', () => {
    const { getByTestId, onConfirm } = setup();
    fireEvent.click(getByTestId('option-picker-input-dire_wolf'));
    fireEvent.click(getByTestId('option-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('dire_wolf');
  });

  it('is single-select — choosing a third option replaces the second', () => {
    const { getByTestId, onConfirm } = setup();
    fireEvent.click(getByTestId('option-picker-input-dire_wolf'));
    fireEvent.click(getByTestId('option-picker-input-brown_bear'));
    fireEvent.click(getByTestId('option-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('brown_bear');
  });
});
