import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { GameChoice } from '../types';
import React from 'react';
import VendorPanel from './VendorPanel';

const choices: GameChoice[] = [
  {
    label: 'Buy Healing Potion — 50cr',
    action: { type: 'buy', itemId: 'healing_potion', price: 50 },
    kind: 'vendor',
  },
  {
    label: 'Buy Greatsword — 120cr',
    action: { type: 'buy', itemId: 'greatsword', price: 120 },
    kind: 'vendor',
  },
  { label: '↩ Back', action: { type: 'exit_shop' }, kind: 'vendor' },
];

const ctx = {
  itemDescs: { healing_potion: 'Restores hit points.' },
};

describe('VendorPanel', () => {
  it('renders the vendor header, the player gold, a row per ware, and a Back control', () => {
    const { getByText, getAllByTestId, getByTestId } = render(
      <VendorPanel npcName="Aldric" gold={100} choices={choices} ctx={ctx} onChoose={() => {}} />
    );
    expect(getByText(/Trading with ALDRIC/i)).toBeTruthy();
    expect(getByText('100cr')).toBeTruthy();
    expect(getByText(/Healing Potion — 50cr/)).toBeTruthy();
    expect(getByText('Restores hit points.')).toBeTruthy();
    expect(getAllByTestId('vendor-buy')).toHaveLength(2);
    expect(getByTestId('vendor-back')).toBeTruthy();
  });

  it('disables the Buy button for a ware the player cannot afford', () => {
    const { getAllByTestId } = render(
      <VendorPanel npcName="Aldric" gold={100} choices={choices} ctx={ctx} onChoose={() => {}} />
    );
    const [potion, greatsword] = getAllByTestId('vendor-buy') as HTMLButtonElement[];
    expect(potion.disabled).toBe(false); // 50 ≤ 100
    expect(greatsword.disabled).toBe(true); // 120 > 100
  });

  it('dispatches buy and exit_shop on click', () => {
    const onChoose = vi.fn();
    const { getAllByTestId, getByTestId } = render(
      <VendorPanel npcName="Aldric" gold={100} choices={choices} ctx={ctx} onChoose={onChoose} />
    );
    fireEvent.click((getAllByTestId('vendor-buy') as HTMLButtonElement[])[0]);
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'buy', itemId: 'healing_potion', price: 50 } })
    );
    fireEvent.click(getByTestId('vendor-back'));
    expect(onChoose).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { type: 'exit_shop' } })
    );
  });
});
