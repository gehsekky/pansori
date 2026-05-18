import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import SessionsScreen from './SessionScreen';
import type { SessionSummary } from '../types';
import { mockCtx } from './test-fixtures';

const contexts = { sandbox: mockCtx };

const activeSession: SessionSummary = {
  id: 'session-1',
  character_name: 'Ripley',
  character_class: 'Soldier',
  context_id: 'sandbox',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  portrait_url: null,
};

const escapedSession: SessionSummary = {
  id: 'session-2',
  character_name: 'Hicks',
  character_class: 'Soldier',
  context_id: 'sandbox',
  status: 'escaped',
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  portrait_url: null,
};

const defaultProps = {
  sessions: [],
  user: { id: 'u1', email: 'test@test.com', display_name: 'Test User', avatar_url: null },
  loading: false,
  onResume: vi.fn(),
  onNewGame: vi.fn(),
  onLogout: vi.fn(),
  onDelete: vi.fn(),
  onClearCompleted: vi.fn(),
  contexts,
};

describe('SessionsScreen', () => {
  it('renders empty state when no sessions exist', () => {
    render(<SessionsScreen {...defaultProps} />);
    expect(screen.getByText(/NO MISSIONS ON RECORD/i)).toBeTruthy();
  });

  it('renders the user display name', () => {
    render(<SessionsScreen {...defaultProps} />);
    expect(screen.getByText(/TEST USER/i)).toBeTruthy();
  });

  it('renders session character names', () => {
    render(<SessionsScreen {...defaultProps} sessions={[activeSession]} />);
    expect(screen.getByText('Ripley')).toBeTruthy();
  });

  it('shows RESUME button for active sessions', () => {
    render(<SessionsScreen {...defaultProps} sessions={[activeSession]} />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
  });

  it('calls onResume with session id when RESUME is clicked', () => {
    const onResume = vi.fn();
    render(<SessionsScreen {...defaultProps} sessions={[activeSession]} onResume={onResume} />);
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(onResume).toHaveBeenCalledWith('session-1');
  });

  it('calls onNewGame when + NEW MISSION is clicked', () => {
    const onNewGame = vi.fn();
    render(<SessionsScreen {...defaultProps} onNewGame={onNewGame} />);
    fireEvent.click(screen.getByRole('button', { name: /new mission/i }));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it('calls onLogout when SIGN OUT is clicked', () => {
    const onLogout = vi.fn();
    render(<SessionsScreen {...defaultProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows CLEAR OLD button when completed sessions exist', () => {
    render(<SessionsScreen {...defaultProps} sessions={[escapedSession]} />);
    expect(screen.getByRole('button', { name: /clear old/i })).toBeTruthy();
  });

  it('does not show CLEAR OLD button when all sessions are active', () => {
    render(<SessionsScreen {...defaultProps} sessions={[activeSession]} />);
    expect(screen.queryByRole('button', { name: /clear old/i })).toBeNull();
  });

  it('shows the session status label', () => {
    render(<SessionsScreen {...defaultProps} sessions={[escapedSession]} />);
    expect(screen.getByText(/ESCAPED/i)).toBeTruthy();
  });
});
