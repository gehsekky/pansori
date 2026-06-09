// The Socket.IO broadcast wrappers: each targets a room and emits a named
// event, and every one no-ops when no io server is set (the legitimate state
// during tests / before bootstrap).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastCampaignUpdated,
  broadcastParticipantChange,
  broadcastSessionState,
  setIO,
} from '../../services/broadcast.js';
import type { Server as SocketServer } from 'socket.io';

function fakeIO() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  setIO({ to } as unknown as SocketServer);
  return { to, emit };
}

// Reset the module's io back to null after each case (the helpers no-op then).
afterEach(() => setIO(null as unknown as SocketServer));

describe('broadcast helpers', () => {
  it('campaign-updated targets the campaign room with the id payload', () => {
    const { to, emit } = fakeIO();
    broadcastCampaignUpdated('vale');
    expect(to).toHaveBeenCalledWith('campaign:vale');
    expect(emit).toHaveBeenCalledWith('campaign-updated', { campaignId: 'vale' });
  });

  it('session state targets the session room', () => {
    const { to, emit } = fakeIO();
    broadcastSessionState('s1', { state: 1 });
    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('state', { state: 1 });
  });

  it('participant change targets the session room and folds the kind in', () => {
    const { to, emit } = fakeIO();
    broadcastParticipantChange('s1', 'joined', { userId: 'u1' });
    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('participants', { kind: 'joined', userId: 'u1' });
  });

  it('no-ops (no throw) when no io server is set', () => {
    // io is null here (reset by afterEach / never set in this case).
    expect(() => broadcastCampaignUpdated('vale')).not.toThrow();
  });
});
