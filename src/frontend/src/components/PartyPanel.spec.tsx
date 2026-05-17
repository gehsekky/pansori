import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import PartyPanel from './PartyPanel';
import { makeChar, makeState, mockCtx, mockSeed } from './test-fixtures';

const defaultProps = {
  ctx: mockCtx,
  seed: mockSeed,
  onEquip: vi.fn(),
  inCombat: false,
  onOpenMap: vi.fn(),
};

describe('PartyPanel', () => {
  it('renders null when state is null', () => {
    const { container } = render(
      <PartyPanel {...defaultProps} state={null} activeCharId="" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders character stats for a single-character party', () => {
    const char = makeChar({ hp: 8, max_hp: 10 });
    const state = makeState({}, { characters: [char] });
    render(<PartyPanel {...defaultProps} state={state} activeCharId={char.id} />);
    expect(screen.getByText('8/10')).toBeTruthy();
  });

  it('does not render character tabs for single-character party', () => {
    const char = makeChar({ name: 'Solo' });
    const state = makeState({}, { characters: [char] });
    render(<PartyPanel {...defaultProps} state={state} activeCharId={char.id} />);
    // Tab buttons only appear for multi-char parties
    const buttons = screen.queryAllByRole('button', { name: /Solo/ });
    expect(buttons).toHaveLength(0);
  });

  it('renders character tabs for multi-character party', () => {
    const char1 = makeChar({ id: 'c1', name: 'Ripley', character_class: 'Soldier' });
    const char2 = makeChar({ id: 'c2', name: 'Hicks', character_class: 'Soldier' });
    const state = makeState({}, { characters: [char1, char2], active_character_id: 'c1' });
    render(<PartyPanel {...defaultProps} state={state} activeCharId="c1" />);
    expect(screen.getByText(/Ripley/)).toBeTruthy();
    expect(screen.getByText(/Hicks/)).toBeTruthy();
  });

  it('switching tabs updates the displayed character stats', () => {
    const char1 = makeChar({ id: 'c1', name: 'Ripley', hp: 10, max_hp: 10 });
    const char2 = makeChar({ id: 'c2', name: 'Hicks', hp: 3, max_hp: 10 });
    const state = makeState({}, { characters: [char1, char2], active_character_id: 'c1' });
    render(<PartyPanel {...defaultProps} state={state} activeCharId="c1" />);

    // Initially showing char1 stats (10/10)
    expect(screen.getByText('10/10')).toBeTruthy();

    // Click Hicks tab
    const hicksTab = screen.getByRole('button', { name: /Hicks/ });
    fireEvent.click(hicksTab);
    expect(screen.getByText('3/10')).toBeTruthy();
  });

  it('shows DEAD label in tab for dead characters', () => {
    const char1 = makeChar({ id: 'c1', name: 'Ripley' });
    const char2 = makeChar({ id: 'c2', name: 'Hicks', dead: true, hp: 0 });
    const state = makeState({}, { characters: [char1, char2], active_character_id: 'c1' });
    render(<PartyPanel {...defaultProps} state={state} activeCharId="c1" />);
    expect(screen.getByText(/DEAD/)).toBeTruthy();
  });

  it('shows condition badges for single-character when conditions present', () => {
    const char = makeChar({ conditions: ['poisoned'] });
    const state = makeState({}, { characters: [char] });
    render(<PartyPanel {...defaultProps} state={state} activeCharId={char.id} />);
    expect(screen.getByText(/POISONED/i)).toBeTruthy();
  });

  it('renders InitiativeStrip during combat', () => {
    const char = makeChar();
    const state = makeState({}, {
      characters: [char],
      combat_active: true,
      initiative_order: [{ id: char.id, roll: 15, is_enemy: false }],
      initiative_idx: 0,
    });
    render(<PartyPanel {...defaultProps} state={state} activeCharId={char.id} inCombat={true} />);
    expect(screen.getByText(/INITIATIVE/i)).toBeTruthy();
  });

  it('does not render InitiativeStrip outside combat', () => {
    const char = makeChar();
    const state = makeState({}, {
      characters: [char],
      initiative_order: [{ id: char.id, roll: 15, is_enemy: false }],
    });
    render(<PartyPanel {...defaultProps} state={state} activeCharId={char.id} inCombat={false} />);
    expect(screen.queryByText(/INITIATIVE/i)).toBeNull();
  });
});
