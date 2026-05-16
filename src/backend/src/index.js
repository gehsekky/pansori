import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { gameRouter } from './routes/game.js';
import { pool } from './db/pool.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true }
});

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use('/api/game', gameRouter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// Socket.io — multiplayer-ready: each session gets its own room
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('join-session', (sessionId) => {
    socket.join(`session:${sessionId}`);
    console.log(`Socket ${socket.id} joined session:${sessionId}`);
  });
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Backend running on :${PORT}`));
