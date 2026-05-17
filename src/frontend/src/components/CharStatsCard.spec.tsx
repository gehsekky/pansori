import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import CharStatsCard from './CharStatsCard';
import { makeChar, makeState, mockCtx, mockSeed } from './test-fixtures';
type InventoryItem = { instance_id: string; id: string; name: string; damage?: string; slot?: string; desc?: string };

const defaultProps = {
  state: makeState(),
  ctx: mockCtx,
  seed: mockSeed,
  onEquip: vi.fn(),
  inCombat: false,
  onOpenMap: vi.fn(),
};

describe('CharStatsCard', () => {
  it('displays HP as current/max', () => {
    const char = makeChar({ hp: 7, max_hp: 10 });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('7/10')).toBeTruthy();
  });

  it('displays AC value', () => {
    const char = makeChar({ ac: 14 });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('14')).toBeTruthy();
  });

  it('displays level', () => {
    const char = makeChar({ level: 3 });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('displays hit dice as remaining/level (dN)', () => {
    const char = makeChar({ level: 3, hit_dice_remaining: 2, hit_die: 10 });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('2/3 (d10)')).toBeTruthy();
  });

  it('displays gold with cr suffix', () => {
    const char = makeChar({ gold: 42 });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('42cr')).toBeTruthy();
  });

  it('shows "unarmed" when no weapon is equipped', () => {
    render(<CharStatsCard {...defaultProps} char={makeChar()} />);
    expect(screen.getByText('unarmed')).toBeTruthy();
  });

  it('shows "none" when no armor is equipped', () => {
    render(<CharStatsCard {...defaultProps} char={makeChar()} />);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('shows inventory item names', () => {
    const sword: InventoryItem = {
      instance_id: 'sword-1',
      id: 'sword',
      name: 'Plasma Rifle',
      damage: '1d8',
      slot: 'weapon',
      desc: 'A rifle.',
    };
    const char = makeChar({ inventory: [sword] });
    render(<CharStatsCard {...defaultProps} char={char} />);
    expect(screen.getByText('Plasma Rifle')).toBeTruthy();
  });

  it('shows equipped weapon name when a weapon is equipped', () => {
    const sword: InventoryItem = {
      instance_id: 'sword-1',
      id: 'sword',
      name: 'Plasma Rifle',
      damage: '1d8',
      slot: 'weapon',
      desc: 'A rifle.',
    };
    const char = makeChar({ inventory: [sword], equipped_weapon: 'sword-1' });
    render(<CharStatsCard {...defaultProps} char={char} />);
    const weaponLabels = screen.getAllByText('Plasma Rifle');
    expect(weaponLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the MAP button', () => {
    render(<CharStatsCard {...defaultProps} char={makeChar()} />);
    expect(screen.getByRole('button', { name: /map/i })).toBeTruthy();
  });

  it('calls onOpenMap when MAP button is clicked', () => {
    const onOpenMap = vi.fn();
    render(<CharStatsCard {...defaultProps} char={makeChar()} onOpenMap={onOpenMap} />);
    screen.getByRole('button', { name: /map/i }).click();
    expect(onOpenMap).toHaveBeenCalledTimes(1);
  });

  it('shows room name from seed', () => {
    render(<CharStatsCard {...defaultProps} char={makeChar()} />);
    expect(screen.getByText('Start Room')).toBeTruthy();
  });
});
