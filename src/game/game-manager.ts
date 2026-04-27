import { EventEmitter } from 'events';
import { GameState, Color, PublicGameState, Player } from '../types.js';
import { createBoard, makeMove, toPublicState } from './go-engine.js';

export class GameManager extends EventEmitter {
  private games = new Map<string, GameState>();

  createGame(boardSize = 19, komi = 7.5): GameState {
    const id = crypto.randomUUID();
    const board = createBoard(boardSize);
    const state: GameState = {
      id,
      boardSize,
      board,
      turn: 'black',
      history: [],
      captures: { black: 0, white: 0 },
      lastBoardHash: board.map(r => r.join('')).join('|'),
      status: 'waiting',
      consecutivePasses: 0,
      komi,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.games.set(id, state);
    this.emit('stateChanged', id);
    this.emit('gamesChanged');
    return state;
  }

  getGame(id: string): GameState | undefined {
    return this.games.get(id);
  }

  getPublicState(id: string): PublicGameState | undefined {
    const g = this.games.get(id);
    return g ? toPublicState(g) : undefined;
  }

  getAllPublicStates(): PublicGameState[] {
    return Array.from(this.games.values()).map(g => toPublicState(g));
  }

  joinGame(id: string, color?: Color): { playerSecret: string; color: Color; state: PublicGameState } | { error: string } {
    const game = this.games.get(id);
    if (!game) return { error: 'Game not found' };
    if (game.status === 'ended') return { error: 'Game already ended' };

    const secret = crypto.randomUUID();
    const player: Player = { id: crypto.randomUUID(), secret };

    if (color) {
      if (color === 'black' && game.blackPlayer) return { error: 'Black seat taken' };
      if (color === 'white' && game.whitePlayer) return { error: 'White seat taken' };
    } else {
      if (!game.blackPlayer) color = 'black';
      else if (!game.whitePlayer) color = 'white';
      else return { error: 'Game is full' };
    }

    if (color === 'black') game.blackPlayer = player;
    else game.whitePlayer = player;

    if (game.blackPlayer && game.whitePlayer) {
      game.status = 'playing';
    }

    game.updatedAt = Date.now();
    this.emit('stateChanged', id);
    this.emit('gamesChanged');
    return { playerSecret: secret, color, state: toPublicState(game) };
  }

  makeMove(gameId: string, playerSecret: string, move: string): { success: true; state: PublicGameState } | { error: string } {
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found' };

    let color: Color | null = null;
    if (game.blackPlayer?.secret === playerSecret) color = 'black';
    else if (game.whitePlayer?.secret === playerSecret) color = 'white';

    if (!color) return { error: 'Invalid player secret' };
    if (game.status !== 'playing') return { error: 'Game is not in playing status' };

    const result = makeMove(game, move, color);
    if ('error' in result) return { error: result.error };

    this.games.set(gameId, result.newState);
    this.emit('stateChanged', gameId);
    this.emit('gamesChanged');
    return { success: true, state: toPublicState(result.newState) };
  }

  resign(gameId: string, playerSecret: string): { success: true; state: PublicGameState } | { error: string } {
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found' };
    let color: Color | null = null;
    if (game.blackPlayer?.secret === playerSecret) color = 'black';
    else if (game.whitePlayer?.secret === playerSecret) color = 'white';
    if (!color) return { error: 'Invalid secret' };
    if (game.status !== 'playing') return { error: 'Game not active' };

    game.status = 'ended';
    game.winner = color === 'black' ? 'white' : 'black';
    game.winReason = 'Resignation';
    game.updatedAt = Date.now();
    this.games.set(gameId, { ...game });
    this.emit('stateChanged', gameId);
    this.emit('gamesChanged');
    return { success: true, state: toPublicState(game) };
  }

  deleteGame(gameId: string): boolean {
    const exists = this.games.delete(gameId);
    if (exists) {
      this.emit('gamesChanged');
    }
    return exists;
  }

  waitForTurn(gameId: string, playerSecret: string, timeoutMs = 30000): Promise<PublicGameState> {
    return new Promise((resolve, reject) => {
      const game = this.games.get(gameId);
      if (!game) { reject(new Error('Game not found')); return; }
      let color: Color | null = null;
      if (game.blackPlayer?.secret === playerSecret) color = 'black';
      else if (game.whitePlayer?.secret === playerSecret) color = 'white';
      if (!color) { reject(new Error('Invalid secret')); return; }

      const check = (): PublicGameState | undefined => {
        const g = this.games.get(gameId)!;
        if (g.status === 'ended') return toPublicState(g);
        if (g.turn === color && g.status === 'playing') {
          return toPublicState(g);
        }
        return undefined;
      };

      const found = check();
      if (found) { resolve(found); return; }

      const listener = (id: string) => {
        if (id !== gameId) return;
        const res = check();
        if (res) { cleanup(); resolve(res); }
      };

      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => { this.off('stateChanged', listener); clearTimeout(timer); };

      timer = setTimeout(() => { cleanup(); reject(new Error('Timeout waiting for turn')); }, timeoutMs);
      this.on('stateChanged', listener);
    });
  }
}
