export type Color = 'black' | 'white';
export type Stone = 0 | 1 | 2;

export interface Player {
  id: string;
  name?: string;
  secret: string;
}

export interface Move {
  color: Color;
  move: string;
  timestamp: number;
}

export interface GameState {
  id: string;
  boardSize: number;
  board: Stone[][];
  turn: Color;
  blackPlayer?: Player;
  whitePlayer?: Player;
  history: Move[];
  captures: { black: number; white: number };
  lastBoardHash: string;
  status: 'waiting' | 'playing' | 'ended';
  winner?: Color | 'draw';
  winReason?: string;
  consecutivePasses: number;
  komi: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublicGameState {
  id: string;
  boardSize: number;
  board: Stone[][];
  turn: Color;
  blackPlayer?: { id: string; name?: string };
  whitePlayer?: { id: string; name?: string };
  history: Move[];
  captures: { black: number; white: number };
  status: 'waiting' | 'playing' | 'ended';
  winner?: Color | 'draw';
  winReason?: string;
  consecutivePasses: number;
  komi: number;
  createdAt: number;
  updatedAt: number;
}
