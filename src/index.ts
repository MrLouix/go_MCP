import { GameManager } from './game/game-manager.js';
import { createHttpServer } from './api/http-server.js';
import { GoMcpServer } from './mcp/mcp-server.js';

const PORT = process.env.PORT || 3003;

const gameManager = new GameManager();
const { httpServer, app } = createHttpServer(gameManager);
const mcpServer = new GoMcpServer(gameManager);
mcpServer.attach(app);

httpServer.listen(PORT, () => {
  console.log(`Go MCP Server running on http://localhost:${PORT}`);
  console.log(`Admin UI     -> http://localhost:${PORT}/admin`);
  console.log(`Player UI    -> http://localhost:${PORT}/player`);
  console.log(`MCP SSE      -> http://localhost:${PORT}/sse`);
  console.log(`MCP Messages -> http://localhost:${PORT}/messages?sessionId=<id>`);
});
