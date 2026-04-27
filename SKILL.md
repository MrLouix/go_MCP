---
name: go_mcp
trigger: any task involving the Go MCP game server
description: Guide for interacting with the Go board game server via MCP SSE and REST API endpoints
---

# Go MCP Server

Server de jeu de Go exposé via MCP (SSE) et REST API, permettant à des agents IA de jouer au Go.

## Outils MCP exposés (9 outils)

| Outil | Description | Paramètres |
|---|---|---|
| `list_games` | Liste toutes les parties | Aucun |
| `create_game` | Crée une nouvelle partie | `boardSize` (9/13/19, défaut 19), `komi` (défaut 7.5) |
| `join_game` | Rejoint une partie | `gameId`, `color` (black/white, optionnel) |
| `get_game_state` | État public d'une partie | `gameId` |
| `play_move` | Joue un coup | `gameId`, `playerSecret`, `move` (ex: "A1", "pass") |
| `pass_turn` | Passe son tour | `gameId`, `playerSecret` |
| `resign` | Abandonne la partie | `gameId`, `playerSecret` |
| `wait_for_turn` | Attend que ce soit ton tour (polling bloquant) | `gameId`, `playerSecret`, `timeoutSeconds` (max 60) |
| `get_board_ascii` | Plateau en ASCII | `gameId` |

## API REST Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/games` | Créer une partie (body: `{ boardSize, komi }`) |
| `POST` | `/api/games/:id/join` | Rejoindre une partie (body: `{ color }`) |
| `POST` | `/api/games/:id/move` | Jouer un coup (body: `{ playerSecret, move }`) |
| `GET` | `/api/games/:id` | État d'une partie |
| `GET` | `/api/games/:id/board` | Plateau en ASCII |
| `POST` | `/api/games/:id/pass` | Passer |
| `POST` | `/api/games/:id/resign` | Abandonner |
| `GET` | `/api/health` | Health check |

### Exemples d'appels REST

```bash
# Rejoindre une partie
curl -s -X POST http://localhost:3003/api/games/<gameId>/join \
  -H "Content-Type: application/json" \
  -d '{"color":"white"}'

# Jouer un coup
curl -s -X POST http://localhost:3003/api/games/<gameId>/move \
  -H "Content-Type: application/json" \
  -d '{"playerSecret":"<secret>","move":"D4"}'

# Voir le plateau
curl -s http://localhost:3003/api/games/<gameId>/board
```

## Flux de jeu typique

1. **`create_game`** → retourne `gameId`
2. Deux fois **`join_game`** (noir + blanc) → retourne `playerSecret`
3. Boucle :
   - `play_move` avec `playerSecret`
   - `wait_for_turn` ou poll `GET /api/games/:id` pour attendre l'adversaire
   - `get_board_ascii` ou `GET /api/games/:id/board` pour voir le plateau
4. Fin : `resign`, `pass_turn` (deux fois = fin de partie), ou abandon auto

## Coordonnées du plateau

Plateau 19×19, coordonnée "A1" = coin bas-gauche, "T19" = coin haut-droit.
La colonne "I" est omise (convention Go).