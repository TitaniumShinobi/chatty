# Chatty + VVAULT Unified Startup

## Overview

This script starts both Chatty and VVAULT together in a unified development environment.

## Usage

```bash
npm run dev:with-vvault
```

Or directly:

```bash
./scripts/start-with-vvault.sh
```

## What It Starts

The script starts four services concurrently:

1. **Chatty Frontend** - http://localhost:5173
   - Vite dev server
   - React frontend

2. **Chatty Backend** - http://localhost:5000
   - Express API server
   - MongoDB connection

3. **VVAULT Backend** - http://localhost:8000
   - Python Flask server
   - VVAULT API

4. **VVAULT Frontend** - http://localhost:7784
   - Webpack dev server
   - React frontend

## Requirements

- Node.js installed
- npm dependencies installed in both `chatty` and `vvault` directories
- Python virtual environment at `vvault/vvault_env/`
- MongoDB running (for Chatty)

## Directory Structure

The script expects:
```
GitHub/
├── chatty/          # Chatty project root
└── vvault/          # VVAULT project root
```

## Troubleshooting

### VVAULT directory not found
- Ensure `vvault` directory exists at `../vvault` relative to chatty root
- Check that the path is correct: `/Users/devonwoodson/Documents/GitHub/vvault`

### Port conflicts
- Ensure ports 5173, 5000, 8000, and 7784 are available
- Stop any other services using these ports

### Missing dependencies
- Run `npm install` in both `chatty` and `vvault` directories
- The script will attempt to install `concurrently` if missing

### VVAULT backend fails
- Ensure Python virtual environment exists: `vvault/vvault_env/`
- Check that `vvault_web_server.py` exists in vvault root
- Verify Python dependencies are installed in the virtual environment

## Stopping Services

Press `Ctrl+C` to stop all services. The script will kill all processes together.

