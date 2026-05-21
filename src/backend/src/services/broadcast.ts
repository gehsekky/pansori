import type { Server as SocketServer } from 'socket.io';

// Bridge between index.ts (where the Socket.IO Server is constructed) and
// the route handlers in routes/game.ts (where state mutations happen and
// need to be broadcast to every participant). A plain getter/setter avoids
// a circular import between routes and index.
//
// `null` is the legitimate value during tests + before bootstrap completes
// (the routes module is imported before io is constructed). All broadcast
// helpers no-op when io is null so unit tests don't have to mock Socket.IO.

let ioInstance: SocketServer | null = null;

export function setIO(server: SocketServer): void {
  ioInstance = server;
}

// Broadcast the new game state to every socket joined to this session's
// room. Called by routes/game.ts after every successful takeAction +
// after assign-character + join, so participants see updates in realtime
// without polling.
export function broadcastSessionState(sessionId: string, payload: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`session:${sessionId}`).emit('state', payload);
}

// Broadcast a participant change (someone joined / left / had ownership
// reassigned). Lets the FE refresh its "who's in this session" panel
// without re-fetching.
export function broadcastParticipantChange(
  sessionId: string,
  kind: 'joined' | 'left' | 'ownership-changed',
  payload: unknown
): void {
  if (!ioInstance) return;
  ioInstance
    .to(`session:${sessionId}`)
    .emit('participants', { kind, ...((payload as object) ?? {}) });
}
