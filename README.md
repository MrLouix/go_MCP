# MCP Go Server

Un serveur MCP (Model Context Protocol) pour communiquer avec des agents IA via Express et Socket.IO.

## Fonctionnalités

- Serveur MCP basé sur le Model Context Protocol SDK
- API REST avec Express
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
├── public/           # Fichiers statiques
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

## Licence

MIT
