import { describe, expect, it } from 'vitest';
import { makeChar, makeState, mockSeed } from './test-fixtures';
import { render, screen } from '@testing-library/react';
import InitiativeStrip from './InitiativeStrip';
import React from 'react';

describe('InitiativeStrip', () => {
  it('renders nothing when initiative_order is empty', () => {
    const { container } = render(<InitiativeStrip state={makeState()} seed={mockSeed} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the INITIATIVE label when order is present', () => {
    const state = makeState(
      {},
      {
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 15, is_enemy: false },
          { id: 'enemy-1', roll: 10, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    render(<InitiativeStrip state={state} seed={mockSeed} />);
    expect(screen.getByText(/INITIATIVE/i)).toBeTruthy();
  });

  it('renders the active character name with ▶ prefix', () => {
    const char = makeChar({ id: 'char-1', name: 'Ripley' });
    const state = makeState(
      {},
      {
        characters: [char],
        active_character_id: 'char-1',
        combat_active: true,
        initiative_order: [{ id: 'char-1', roll: 18, is_enemy: false }],
        initiative_idx: 0,
      }
    );
    render(<InitiativeStrip state={state} seed={mockSeed} />);
    expect(screen.getByText(/▶.*Ripley/)).toBeTruthy();
  });

  it('renders enemy name from seed when entry is_enemy', () => {
    const seedWithEnemy = {
      ...mockSeed,
      enemies: { 'room-1': [{ id: 'room-1#0', name: 'Xenomorph', hp: 20, ac: 13 }] },
    };
    const state = makeState(
      {},
      {
        combat_active: true,
        current_room: 'room-1',
        initiative_order: [{ id: 'room-1#0', roll: 12, is_enemy: true }],
        initiative_idx: 0,
      }
    );
    render(<InitiativeStrip state={state} seed={seedWithEnemy} />);
    expect(screen.getByText(/Xenomorph/)).toBeTruthy();
  });

  it('falls back to "Enemy" when seed has no enemy name', () => {
    const state = makeState(
      {},
      {
        combat_active: true,
        initiative_order: [{ id: 'room-1', roll: 8, is_enemy: true }],
        initiative_idx: 0,
      }
    );
    render(<InitiativeStrip state={state} seed={mockSeed} />);
    expect(screen.getByText(/Enemy/)).toBeTruthy();
  });
});
