import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import SpellPickerDialog from './SpellPickerDialog';

const SPELLS = [
  // Arcane cantrips
  {
    id: 'fire_bolt',
    name: 'Fire Bolt',
    level: 0,
    desc: '1d10 fire',
    spellList: ['arcane'] as const,
  },
  {
    id: 'mage_hand',
    name: 'Mage Hand',
    level: 0,
    desc: 'spectral hand',
    spellList: ['arcane'] as const,
  },
  {
    id: 'light',
    name: 'Light',
    level: 0,
    desc: 'lights a torch',
    spellList: ['arcane', 'divine'] as const,
  },
  // Divine cantrip
  {
    id: 'sacred_flame',
    name: 'Sacred Flame',
    level: 0,
    desc: '1d8 radiant',
    spellList: ['divine'] as const,
  },
  // Arcane L1
  {
    id: 'magic_missile',
    name: 'Magic Missile',
    level: 1,
    desc: '3 darts',
    spellList: ['arcane'] as const,
  },
  {
    id: 'shield',
    name: 'Shield',
    level: 1,
    desc: '+5 AC reaction',
    spellList: ['arcane'] as const,
  },
  // Divine L1
  {
    id: 'cure_wounds',
    name: 'Cure Wounds',
    level: 1,
    desc: 'heal 1d8',
    spellList: ['divine'] as const,
  },
  // L2 — should never show
  {
    id: 'misty_step',
    name: 'Misty Step',
    level: 2,
    desc: 'teleport 30 ft',
    spellList: ['arcane'] as const,
  },
].map((s) => ({ ...s, spellList: [...s.spellList] }));

describe('SpellPickerDialog', () => {
  it('renders only cantrips matching the spellList', () => {
    const { queryByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect(queryByTestId('spell-picker-cantrip-fire_bolt')).toBeTruthy();
    expect(queryByTestId('spell-picker-cantrip-mage_hand')).toBeTruthy();
    // Light is on arcane + divine → visible on arcane picker
    expect(queryByTestId('spell-picker-cantrip-light')).toBeTruthy();
    // Divine-only cantrip not visible on arcane picker
    expect(queryByTestId('spell-picker-cantrip-sacred_flame')).toBeNull();
    // L1 not rendered as a cantrip
    expect(queryByTestId('spell-picker-cantrip-magic_missile')).toBeNull();
  });

  it('renders only L1 spells matching the spellList', () => {
    const { queryByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Divine)"
        spellList="divine"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect(queryByTestId('spell-picker-l1-cure_wounds')).toBeTruthy();
    expect(queryByTestId('spell-picker-l1-magic_missile')).toBeNull();
    // L2 spell never visible regardless of tag
    expect(queryByTestId('spell-picker-l1-misty_step')).toBeNull();
  });

  it('disables save until cantrips + l1 are picked', () => {
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    const save = getByTestId('spell-picker-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    expect(save.disabled).toBe(true);
    fireEvent.click(getByTestId('spell-picker-cantrip-input-mage_hand'));
    expect(save.disabled).toBe(true);
    fireEvent.click(getByTestId('spell-picker-l1-input-magic_missile'));
    expect(save.disabled).toBe(false);
  });

  it('locks further cantrip picks once the count limit is reached', () => {
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={0}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    fireEvent.click(getByTestId('spell-picker-cantrip-input-mage_hand'));
    const third = getByTestId('spell-picker-cantrip-input-light') as HTMLInputElement;
    expect(third.disabled).toBe(true);
  });

  it('uncheck-then-recheck releases the limit lock', () => {
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={0}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    fireEvent.click(getByTestId('spell-picker-cantrip-input-mage_hand'));
    // Uncheck one — third should become available again
    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    const third = getByTestId('spell-picker-cantrip-input-light') as HTMLInputElement;
    expect(third.disabled).toBe(false);
  });

  it('save dispatches the picked cantrips + L1 and closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={onClose}
        onSave={onSave}
      />
    );
    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    fireEvent.click(getByTestId('spell-picker-cantrip-input-mage_hand'));
    fireEvent.click(getByTestId('spell-picker-l1-input-magic_missile'));
    fireEvent.click(getByTestId('spell-picker-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [cantrips, l1] = onSave.mock.calls[0];
    expect(cantrips.sort()).toEqual(['fire_bolt', 'mage_hand']);
    expect(l1).toBe('magic_missile');
    expect(onClose).toHaveBeenCalled();
  });

  it('repopulates from initial picks', () => {
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={['fire_bolt', 'mage_hand']}
        initialL1="magic_missile"
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect((getByTestId('spell-picker-cantrip-input-fire_bolt') as HTMLInputElement).checked).toBe(
      true
    );
    expect((getByTestId('spell-picker-cantrip-input-mage_hand') as HTMLInputElement).checked).toBe(
      true
    );
    expect((getByTestId('spell-picker-l1-input-magic_missile') as HTMLInputElement).checked).toBe(
      true
    );
    // Save should be enabled out of the box
    expect((getByTestId('spell-picker-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('cancel calls onClose without saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <SpellPickerDialog
        featName="Magic Initiate (Arcane)"
        spellList="arcane"
        cantripCount={2}
        l1Count={1}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={onClose}
        onSave={onSave}
      />
    );
    fireEvent.click(getByTestId('spell-picker-cantrip-input-fire_bolt'));
    fireEvent.click(getByTestId('spell-picker-cancel'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('omits the L1 section when l1Count is 0', () => {
    const { queryByTestId } = render(
      <SpellPickerDialog
        featName="Test Cantrip-Only Feat"
        spellList="arcane"
        cantripCount={2}
        l1Count={0}
        spells={SPELLS}
        initialCantrips={[]}
        initialL1={null}
        onClose={() => {}}
        onSave={() => {}}
      />
    );
    expect(queryByTestId('spell-picker-l1-magic_missile')).toBeNull();
  });
});
