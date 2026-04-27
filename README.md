# MCP Go Server

Un serveur MCP (Model Context Protocol) pour jouer au Go avec des agents IA via Express, Socket.IO et le transport SSE.

## Fonctionnalités

- Serveur MCP basé sur le Model Context Protocol SDK
- Transport SSE (Server-Sent Events) pour la connexion MCP
- API REST avec Express (alternative non-MCP)
- Communication temps réel via Socket.IO
- Dockerisé pour un déploiement facile

## Prérequis

- Node.js 18+
- npm ou pnpm
- Docker & Docker Compose (optionnel)

## Installation

```bash
# Installation des dépendances
npm install

# Développement avec hot-reload
npm run dev

# Build TypeScript
npm run build

# Lancer en production
npm start
```

## Docker

```bash
# Build
docker-compose build

# Lancer
docker-compose up

# Lancer en arrière-plan
docker-compose up -d
```

## Structure du projet

```
├── src/              # Code source TypeScript
│   ├── index.ts          # Point d'entrée (serveur HTTP + MCP attaché)
│   ├── mcp/mcp-server.ts # Serveur MCP (outils & transport SSE)
│   ├── api/http-server.ts# API REST + Socket.IO
│   ├── game/             # Moteur de jeu de Go
│   └── types.ts          # Types TypeScript
├── public/           # Interfaces web
│   ├── admin/            # Panneau d'administration (création/visualisation)
│   └── player/           # Interface joueur
├── Dockerfile        # Configuration Docker
├── docker-compose.yml # Configuration docker-compose
├── package.json      # Dépendances et scripts
└── tsconfig.json     # Configuration TypeScript
```

## Scripts npm

| Commande       | Description                    |
|----------------|--------------------------------|
| `npm run dev`  | développement avec hot-reload  |
| `npm run build`| Compilation TypeScript → dist/ |
| `npm start`    | Lancer le serveur en production|

---

## Connexion MCP pour un agent IA

Le serveur expose un transport **SSE** (Server-Sent Events) conforme au MCP SDK. Il est monté sur le même serveur HTTP que l'application.

### Endpoints

| Endpoint | Méthode | Description |
|---|---|---|
| `/sse` | GET | Point d'entrée SSE — initie la connexion MCP |
| `/messages` | POST | Envoi des messages du client vers le serveur (via `?sessionId=`) |

### Configuration côté client MCP

Dans la configuration de ton agent (ex. `config.yaml` d'un Hermes Agent, ou SDK MCP Python/Node), configure le serveur comme suit :

```yaml
mcpServers:
  go-server:
    command: npx
    args:
      - @modelcontextprotocol/sdk-cli
    transport: sse
    url: http://localhost:3003/sse
    # ou http://<IP_DU_SERVEUR>:3003/sse si le serveur est distant
```

Ou avec le SDK MCP Python :

```python
from mcp import ClientSession
from mcp.client.sse import sse_client

async with sse_client(url="http://localhost:3003/sse") as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        # Le serveur est prêt — appeler les outils
        tools = await session.list_tools()
        # ...
```

### Configuration Hermes Agent (config.yaml)

```yaml
mcpServers:
  go-server:
    url: http://localhost:3003/sse
```

Puis redémarrer l'agent. Les outils seront automatiquement découverts à l'initialisation.

### Workflow typique d'un agent IA

Quand l'agent est connecté, il dispose de ces **9 outils MCP** :

| Outil | Description | Paramètres |
|---|---|---|
| `list_games` | Lister toutes les parties | _aucun_ |
| `create_game` | Créer une nouvelle partie | `boardSize` (9/13/19, déf. 19), `komi` (déf. 7.5) |
| `join_game` | Rejoindre une partie | `gameId` (obligatoire), `color` (`black`/`white`, optionnel) |
| `get_game_state` | Obtenir l'état actuel d'une partie | `gameId` |
| `get_board_ascii` | Obtenir le plateau en format ASCII | `gameId` |
| `play_move` | Jouer un coup | `gameId`, `playerSecret`, `move` (ex. `A1`, `B3`, `pass`) |
| `pass_turn` | Passer son tour | `gameId`, `playerSecret` |
| `resign` | Abandonner | `gameId`, `playerSecret` |
| `wait_for_turn` | Attendre que ce soit son tour (polling bloquant) | `gameId`, `playerSecret`, `timeoutSeconds` (déf. 30, max 60) |

### Exemple de dialogue agent → serveur

```
→ [outil] create_game { boardSize: 9, komi: 7.5 }
← "Created game a1b2c3d4-e5f6-7890-abcd-ef1234567890 (size 9, komi 7.5)"

→ [outil] join_game { gameId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", color: "black" }
← "Joined game a1b2c3d4-...-7890 as black. PlayerSecret: f9e8d7c6-...-1234"

→ [outil] get_board_ascii { gameId: "a1b2c3d4-...-7890" }
← (plateau ASCII 9x9 avec coordonnées)

→ [outil] wait_for_turn { gameId: "a1b2c3d4-...-7890", playerSecret: "f9e8d7c6-...-1234", timeoutSeconds: 60 }
← "It's your turn! ..."

→ [outil] play_move { gameId: "a1b2c3d4-...-7890", playerSecret: "f9e8d7c6-...-1234", move: "D4" }
← "Move OK. Turn is now white. ..."
```

### Cycle de jeu recommandé pour un agent

1. **`create_game`** → obtenir le `gameId`
2. **`join_game`** → obtenir le `playerSecret` (et sa couleur)
3. **`get_board_ascii`** → visualiser le plateau
4. Boucle de jeu :
   a. **`wait_for_turn`** → bloquer jusqu'à ce que ce soit le tour de l'agent
   b. Calculer le meilleur coup
   c. **`play_move`** avec la coordonnée (ex. `D4`)
   d. Revenir à l'étape a
5. **`resign`** pour abandonner, ou continuer jusqu'à fin de partie

### Notes sur le transport SSE

- La connexion SSE est **stateless côté serveur HTTP** — chaque GET `/sse` crée une session avec un `sessionId` unique.
- Les messages de réponse sont POSTés sur `/messages?sessionId=<id>` par le client SDK.
- Si la connexion SSE est perdue, le client doit se reconnecter (re-initialize MCP session).
- Le `playerSecret` est persistant côté serveur — il est lié au joueur, pas à la session MCP.

---

## Ports

Le port par défaut est **3003** pour toutes les interfaces :

| Interface | URL |
|---|---|
| Admin (créer/voir les parties) | `http://localhost:3000/admin` |
| Player (jouer) | `http://localhost:3003/player` |
| MCP SSE (agent IA) | `http://localhost:3003/sse` |
| API REST | `http://localhost:3003/api/games` |

Pour changer le port, modifier la variable d'environnement `PORT` :

```bash
# En ligne de commande
PORT=3001 npm run dev

# Dans docker-compose.yml
environment:
  - PORT=3001
ports:
  - "3001:3001"
```

Le code utilise `process.env.PORT` comme fallback (voir `src/index.ts` ligne 5).

## Licence

MIT
