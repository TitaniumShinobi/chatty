# CLI-First Web Architecture

## Overview

Chatty now uses a CLI-first architecture where the web interface is essentially a GUI wrapper around the CLI functionality. This eliminates the complex backend and provides identical functionality between CLI and web.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  CLI Web Bridge  │    │   CLI Service   │
│                 │    │                  │    │                 │
│ • CommandInput  │───▶│ • CLIWebBridge   │───▶│ • CLIAIService  │
│ • ChattyApp     │    │ • Command Proc   │    │ • SeatRunner    │
│ • Slash Commands│    │ • API Endpoints  │    │ • Ollama Bridge │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Key Files

### Backend (CLI-Based)
- `server/cli-server.ts` - Minimal Express server
- `server/cli-web-bridge.ts` - CLI-to-web bridge
- `src/cli/chatty-cli.ts` - Core CLI service (shared)

### Frontend
- `src/lib/cliBridge.ts` - Frontend CLI communication
- `src/components/CommandInput.tsx` - Slash command UI
- `src/lib/browserSeatRunner.ts` - Browser-compatible seat runner

## Slash Commands

The web interface now supports all CLI slash commands:

- `/model` - Show active model
- `/model list` - List available models
- `/model synth` - Enable multi-model synthesis (default)
- `/model <name>` - Switch to specific model
- `/ts` - Toggle timestamps
- `/status` - Show status report
- `/clear` - Clear conversation history
- `/help` - Show available commands

## Default Behavior

- **Default Model**: `synth` (multi-model synthesis)
- **Synthesis Models**:
  - `coding`: `deepseek-coder:latest`
  - `creative`: `mistral:latest`
  - `smalltalk`: `phi3:latest`

## API Endpoints

### New CLI-Based Endpoints
- `POST /api/chat` - Send message (supports slash commands)
- `POST /api/command` - Execute slash command
- `GET /api/status` - Get current status
- `GET /health` - Health check

### Legacy Compatibility
- `POST /chatty-sync` - Legacy sync endpoint (maintains compatibility)

## Running the System

### CLI Server
```bash
# Start CLI-based web server
npm run server:cli

# Or directly
cd server && npm run cli
```

### Full Development
```bash
# Start both frontend and CLI server
npm run dev:full
```

### CLI Only
```bash
# Run CLI directly
npm run cli
```

## Benefits

1. **Single Source of Truth**: CLI and web use identical logic
2. **No Database**: Eliminates SQLite/authentication complexity
3. **Slash Commands**: Web gets full CLI command system
4. **Simplified Architecture**: Removes 80% of backend code
5. **Consistent Behavior**: Identical responses between CLI and web

## Migration Notes

- Old backend files can be removed (models/, routes/, services/)
- Frontend automatically uses CLI bridge
- All existing functionality preserved
- Enhanced with slash command support
