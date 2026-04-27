import type { GameState, Stone, Color, PublicGameState } from '../types.js';

export function createBoard(size: number): Stone[][] {
  return Array.from({ length: size }, () => Array(size).fill(0 as Stone));
}

export function cloneBoard(board: Stone[][]): Stone[][] {
  return board.map(row => [...row]);
}

export function coordToIndices(move: string, size: number): { x: number; y: number } | null {
  if (move === 'pass') return { x: -1, y: -1 };
  move = move.trim().toUpperCase();
  if (move.length < 2) return null;
  const colChar = move[0];
  const rowStr = move.slice(1);
  const x = colChar.charCodeAt(0) - 'A'.charCodeAt(0);
  if (x < 0 || x >= size) return null;
  const y = parseInt(rowStr, 10) - 1;
  if (isNaN(y) || y < 0 || y >= size) return null;
  return { x, y };
}

export function indicesToCoord(x: number, y: number): string {
  const col = String.fromCharCode('A'.charCodeAt(0) + x);
  return `${col}${y + 1}`;
}

function hashBoard(board: Stone[][]): string {
  return board.map(row => row.join('')).join('|');
}

function getNeighbors(x: number, y: number, size: number): [number, number][] {
  const res: [number, number][] = [];
  if (x > 0) res.push([x - 1, y]);
  if (x < size - 1) res.push([x + 1, y]);
  if (y > 0) res.push([x, y - 1]);
  if (y < size - 1) res.push([x, y + 1]);
  return res;
}

type GroupResult = { stones: [number, number][]; liberties: number };

function getGroup(board: Stone[][], x: number, y: number): GroupResult {
  const size = board.length;
  const color = board[y][x];
  const stones: [number, number][] = [];
  const seen = new Set<string>();
  const q: [number, number][] = [[x, y]];
  seen.add(`${x},${y}`);
  let liberties = 0;
  const libSeen = new Set<string>();

  while (q.length > 0) {
    const [cx, cy] = q.pop()!;
    stones.push([cx, cy]);
    for (const [nx, ny] of getNeighbors(cx, cy, size)) {
      if (board[ny][nx] === 0) {
        const key = `${nx},${ny}`;
        if (!libSeen.has(key)) {
          libSeen.add(key);
          liberties++;
        }
      } else if (board[ny][nx] === color) {
        const key = `${nx},${ny}`;
        if (!seen.has(key)) {
          seen.add(key);
          q.push([nx, ny]);
        }
      }
    }
  }
  return { stones, liberties };
}

export function makeMove(
  state: GameState,
  moveStr: string,
  color: Color
): { success: true; newState: GameState } | { error: string } {
  if (state.status !== 'playing') return { error: 'Game is not active' };
  if (color !== state.turn) return { error: `Not your turn. It is ${state.turn}'s turn.` };

  if (moveStr === 'pass') {
    const newState: GameState = {
      ...state,
      history: [...state.history, { color, move: 'pass', timestamp: Date.now() }],
      turn: color === 'black' ? 'white' : 'black',
      consecutivePasses: state.consecutivePasses + 1,
      updatedAt: Date.now(),
    };
    if (newState.consecutivePasses >= 2) {
      newState.status = 'ended';
      newState.winReason = 'Double pass';
      const scores = calculateScores(newState.board, newState.boardSize);
      const blackTotal = scores.black + newState.captures.black;
      const whiteTotal = scores.white + newState.captures.white + newState.komi;
      if (blackTotal > whiteTotal) newState.winner = 'black';
      else if (whiteTotal > blackTotal) newState.winner = 'white';
      else newState.winner = 'draw';
    }
    return { success: true, newState };
  }

  const coords = coordToIndices(moveStr, state.boardSize);
  if (!coords) return { error: 'Invalid move format. Use e.g. A1, B2, or \"pass\".' };
  const { x, y } = coords;
  if (state.board[y][x] !== 0) return { error: 'Intersection already occupied.' };

  let board = cloneBoard(state.board);
  const stoneColor: Stone = color === 'black' ? 1 : 2;
  board[y][x] = stoneColor;

  const opponent: Stone = stoneColor === 1 ? 2 : 1;
  const size = state.boardSize;
  let capturedStones = 0;

  for (const [nx, ny] of getNeighbors(x, y, size)) {
    if (board[ny][nx] === opponent) {
      const grp = getGroup(board, nx, ny);
      if (grp.liberties === 0) {
        capturedStones += grp.stones.length;
        for (const [sx, sy] of grp.stones) board[sy][sx] = 0;
      }
    }
  }

  const myGroup = getGroup(board, x, y);
  if (myGroup.liberties === 0) {
    return { error: 'Suicide move is not allowed.' };
  }

  const newHash = hashBoard(board);
  if (newHash === state.lastBoardHash && state.history.length > 0) {
    return { error: 'Ko rule: this move repeats a previous board position.' };
  }

  const newCaptures = {
    black: state.captures.black + (color === 'black' ? capturedStones : 0),
    white: state.captures.white + (color === 'white' ? capturedStones : 0),
  };

  const newState: GameState = {
    ...state,
    board,
    turn: color === 'black' ? 'white' : 'black',
    history: [...state.history, { color, move: moveStr.toUpperCase(), timestamp: Date.now() }],
    captures: newCaptures,
    lastBoardHash: hashBoard(state.board),
    consecutivePasses: 0,
    updatedAt: Date.now(),
  };

  return { success: true, newState };
}

export function calculateScores(board: Stone[][], size: number): { black: number; white: number } {
  let blackScore = 0;
  let whiteScore = 0;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 1) blackScore++;
      else if (board[y][x] === 2) whiteScore++;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 0 && !visited[y][x]) {
        const region: [number, number][] = [];
        const q: [number, number][] = [[x, y]];
        visited[y][x] = true;
        const borders = new Set<number>();
        while (q.length > 0) {
          const [cx, cy] = q.pop()!;
          region.push([cx, cy]);
          for (const [nx, ny] of getNeighbors(cx, cy, size)) {
            if (board[ny][nx] === 0 && !visited[ny][nx]) {
              visited[ny][nx] = true;
              q.push([nx, ny]);
            } else if (board[ny][nx] !== 0) {
              borders.add(board[ny][nx]);
            }
          }
        }
        if (borders.size === 1) {
          if (borders.has(1)) blackScore += region.length;
          else whiteScore += region.length;
        }
      }
    }
  }

  return { black: blackScore, white: whiteScore };
}

export function toPublicState(state: GameState): PublicGameState {
  const { blackPlayer, whitePlayer, ...rest } = state;
  return {
    ...rest,
    blackPlayer: blackPlayer ? { id: blackPlayer.id, name: blackPlayer.name } : undefined,
    whitePlayer: whitePlayer ? { id: whitePlayer.id, name: whitePlayer.name } : undefined,
  };
}

export function boardToAscii(state: PublicGameState): string {
  const { board, boardSize } = state;
  const cols = 'ABCDEFGHJKLMNOPQRST'.slice(0, boardSize);
  let out = '   ' + cols.split('').join(' ') + '\n';
  for (let y = boardSize - 1; y >= 0; y--) {
    const num = (y + 1).toString().padStart(2, ' ');
    let row = `${num} `;
    for (let x = 0; x < boardSize; x++) {
      const s = board[y][x];
      row += s === 1 ? 'X ' : s === 2 ? 'O ' : '. ';
    }
    out += row + num + '\n';
  }
  out += '   ' + cols.split('').join(' ');
  return out;
}
