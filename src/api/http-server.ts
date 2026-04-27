import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameManager } from '../game/game-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createHttpServer(gameManager: GameManager) {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

  app.use(express.json());

  // Disable caching for HTML pages to always serve latest version
  app.use('/admin', express.static(path.join(__dirname, '../../public/admin'), {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  app.use('/player', express.static(path.join(__dirname, '../../public/player'), {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  // Cache for other static assets (socket.io, etc)
  app.use(express.static(path.join(__dirname, '../../public')));

  app.get('/api/games', (req, res) => {
    res.json(gameManager.getAllPublicStates());
  });

  app.post('/api/games', (req, res) => {
    const size = typeof req.body.boardSize === 'number' ? req.body.boardSize : 19;
    const komi = typeof req.body.komi === 'number' ? req.body.komi : 7.5;
    const game = gameManager.createGame(Math.min(Math.max(size, 5), 19), komi);
    res.status(201).json(gameManager.getPublicState(game.id));
  });

  app.get('/api/games/:id', (req, res) => {
    const state = gameManager.getPublicState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Not found' });
    res.json(state);
  });

  app.post('/api/games/:id/join', (req, res) => {
    const color = req.body.color as ('black' | 'white') | undefined;
    const result = gameManager.joinGame(req.params.id, color);
    if ('error' in result) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/games/:id/move', (req, res) => {
    const { playerSecret, move } = req.body;
    if (!playerSecret || !move) return res.status(400).json({ error: 'Missing playerSecret or move' });
    const result = gameManager.makeMove(req.params.id, playerSecret, move);
    if ('error' in result) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/games/:id/resign', (req, res) => {
    const { playerSecret } = req.body;
    if (!playerSecret) return res.status(400).json({ error: 'Missing playerSecret' });
    const result = gameManager.resign(req.params.id, playerSecret);
    if ('error' in result) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.delete('/api/games/:id', (req, res) => {
    const deleted = gameManager.deleteGame(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Game not found' });
    res.json({ success: true, message: 'Game deleted' });
  });

  io.on('connection', (socket) => {
    socket.on('subscribe_game', (gameId: string) => {
      socket.join(gameId);
      const state = gameManager.getPublicState(gameId);
      if (state) socket.emit('game_update', state);
    });

    socket.on('subscribe_admin', () => {
      socket.join('admin');
      socket.emit('games_list', gameManager.getAllPublicStates());
    });

    socket.on('make_move', ({ gameId, playerSecret, move }: { gameId: string; playerSecret: string; move: string }) => {
      const result = gameManager.makeMove(gameId, playerSecret, move);
      if ('error' in result) {
        socket.emit('error_msg', result.error);
        return;
      }
      io.to(gameId).emit('game_update', result.state);
      io.to('admin').emit('games_list', gameManager.getAllPublicStates());
    });

    socket.on('create_game', ({ boardSize, komi }: { boardSize: number; komi?: number }) => {
      gameManager.createGame(boardSize, komi);
      io.to('admin').emit('games_list', gameManager.getAllPublicStates());
    });
  });

  gameManager.on('stateChanged', (gameId: string) => {
    const state = gameManager.getPublicState(gameId);
    if (state) io.to(gameId).emit('game_update', state);
  });

  gameManager.on('gamesChanged', () => {
    io.to('admin').emit('games_list', gameManager.getAllPublicStates());
  });

  return { app, httpServer, io };
}
