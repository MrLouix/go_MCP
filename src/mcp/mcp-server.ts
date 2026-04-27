import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/server/types.js';
import type { Express, Request, Response } from 'express';
import { GameManager } from '../game/game-manager.js';
import { boardToAscii } from '../game/go-engine.js';
import { Color } from '../types.js';

export class GoMcpServer {
  private server: Server;
  private transports = new Map<string, SSEServerTransport>();

  constructor(private gameManager: GameManager) {
    this.server = new Server(
      { name: 'go-mcp-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
  }

  attach(app: Express) {
    app.get('/sse', async (req: Request, res: Response) => {
      const transport = new SSEServerTransport('/messages', res);
      this.transports.set(transport.sessionId, transport);
      res.on('close', () => { this.transports.delete(transport.sessionId); });
      await this.server.connect(transport);
    });

    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = this.transports.get(sessionId);
      if (!transport) {
        res.status(400).json({ error: 'No active SSE session' });
        return;
      }
      await transport.handlePostMessage(req, res);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_games',
          description: 'List all Go games and their statuses.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'create_game',
          description: 'Create a new Go game. Returns the game ID.',
          inputSchema: {
            type: 'object',
            properties: {
              boardSize: { type: 'number', description: 'Board size (9, 13, or 19). Default 19.' },
              komi: { type: 'number', description: 'Komi for white. Default 7.5.' },
            },
          },
        },
        {
          name: 'join_game',
          description: 'Join a game as a player and receive a playerSecret.',
          inputSchema: {
            type: 'object',
            properties: {
              gameId: { type: 'string' },
              color: { type: 'string', enum: ['black', 'white'], description: 'Preferred color. If omitted, assigns first available.' },
            },
            required: ['gameId'],
          },
        },
        {
          name: 'get_game_state',
          description: 'Get the current public state of a game.',
          inputSchema: {
            type: 'object',
            properties: { gameId: { type: 'string' } },
            required: ['gameId'],
          },
        },
        {
          name: 'play_move',
          description: 'Play a stone or pass. Use \"pass\" as move to pass.',
          inputSchema: {
            type: 'object',
            properties: {
              gameId: { type: 'string' },
              playerSecret: { type: 'string', description: 'Secret obtained from join_game.' },
              move: { type: 'string', description: 'Move like A1, B2, or \"pass\".' },
            },
            required: ['gameId', 'playerSecret', 'move'],
          },
        },
        {
          name: 'pass_turn',
          description: 'Pass your turn.',
          inputSchema: {
            type: 'object',
            properties: {
              gameId: { type: 'string' },
              playerSecret: { type: 'string' },
            },
            required: ['gameId', 'playerSecret'],
          },
        },
        {
          name: 'resign',
          description: 'Resign from the game.',
          inputSchema: {
            type: 'object',
            properties: {
              gameId: { type: 'string' },
              playerSecret: { type: 'string' },
            },
            required: ['gameId', 'playerSecret'],
          },
        },
        {
          name: 'wait_for_turn',
          description: 'Wait until it is your turn. Returns immediately if already your turn. Use this in a loop to know when the AI should play. Set timeoutSeconds up to 60.',
          inputSchema: {
            type: 'object',
            properties: {
              gameId: { type: 'string' },
              playerSecret: { type: 'string' },
              timeoutSeconds: { type: 'number', description: 'Max seconds to wait. Default 30. Maximum 60.' },
            },
            required: ['gameId', 'playerSecret'],
          },
        },
        {
          name: 'get_board_ascii',
          description: 'Get an ASCII representation of the board.',
          inputSchema: {
            type: 'object',
            properties: { gameId: { type: 'string' } },
            required: ['gameId'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const a = (args ?? {}) as Record<string, any>;

      try {
        switch (name) {
          case 'list_games': {
            const games = this.gameManager.getAllPublicStates();
            return { content: [{ type: 'text', text: JSON.stringify(games, null, 2) }] };
          }
          case 'create_game': {
            const size = typeof a.boardSize === 'number' ? a.boardSize : 19;
            const komi = typeof a.komi === 'number' ? a.komi : 7.5;
            const game = this.gameManager.createGame(size, komi);
            return { content: [{ type: 'text', text: `Created game ${game.id} (size ${size}, komi ${komi})` }] };
          }
          case 'join_game': {
            const result = this.gameManager.joinGame(a.gameId as string, a.color as Color | undefined);
            if ('error' in result) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
            return { content: [{ type: 'text', text: `Joined game ${a.gameId} as ${result.color}. PlayerSecret: ${result.playerSecret}` }] };
          }
          case 'get_game_state': {
            const state = this.gameManager.getPublicState(a.gameId as string);
            if (!state) return { content: [{ type: 'text', text: 'Game not found' }], isError: true };
            return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
          }
          case 'play_move': {
            const result = this.gameManager.makeMove(a.gameId as string, a.playerSecret as string, a.move as string);
            if ('error' in result) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
            return { content: [{ type: 'text', text: `Move OK. Turn is now ${result.state.turn}.\n${JSON.stringify(result.state, null, 2)}` }] };
          }
          case 'pass_turn': {
            const result = this.gameManager.makeMove(a.gameId as string, a.playerSecret as string, 'pass');
            if ('error' in result) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
            return { content: [{ type: 'text', text: `Passed. Turn is now ${result.state.turn}.` }] };
          }
          case 'resign': {
            const result = this.gameManager.resign(a.gameId as string, a.playerSecret as string);
            if ('error' in result) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
            return { content: [{ type: 'text', text: `Resigned. Winner: ${result.state.winner || 'N/A'}. Reason: ${result.state.winReason}` }] };
          }
          case 'wait_for_turn': {
            const timeout = Math.min(typeof a.timeoutSeconds === 'number' ? a.timeoutSeconds * 1000 : 30000, 60000);
            try {
              const st = await this.gameManager.waitForTurn(a.gameId as string, a.playerSecret as string, timeout);
              return { content: [{ type: 'text', text: `It's your turn!\n${JSON.stringify(st, null, 2)}` }] };
            } catch (e: any) {
              return { content: [{ type: 'text', text: `Wait timeout or error: ${e.message}` }] };
            }
          }
          case 'get_board_ascii': {
            const state = this.gameManager.getPublicState(a.gameId as string);
            if (!state) return { content: [{ type: 'text', text: 'Game not found' }], isError: true };
            return { content: [{ type: 'text', text: boardToAscii(state) }] };
          }
          default:
            return { content: [{ type: 'text', text: `Unknown tool ${name}` }], isError: true };
        }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Internal error: ${err.message}` }], isError: true };
      }
    });
  }
}
